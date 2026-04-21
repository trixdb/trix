# Platform Enhancement Plan

*Generated: 2026-04-21 — based on 5-agent codebase audit*

## Overview

31 enhancements across 5 domains: Speed, Resilience, Capability, Observability, Memory.
Ordered by impact × effort. P1 items can be shipped independently; P2/P3 build on them.

---

## Sprint 1 — Resilience Quick Wins (P1, ~2–3 days)

These require no API changes and fix real failure modes seen in production-like dev runs.

---

### S1-1: BullMQ Retry on Job Failure

- [x] Update `JOB_DEFAULTS` in `trix-bots/src/lib/constants.ts` to `attempts: 3` with exponential backoff

**Current:** `attempts: 1` — a transient LLM error permanently fails the run
**Change:**

```typescript
export const JOB_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 200 },
};
```

**Notes:** BullMQ will retry with 2s → 4s → 8s backoff. Worker already handles idempotent DB state (status overwrite on re-run). Verify `recordRunSuccess`/`recordRunFailure` are safe to call twice (they are — `UPDATE WHERE id = $1`).

---

### S1-2: Scheduled Stale Run Reaper

- [ ] Extract `reapStaleRuns` from `trix-api/src/routes/agent-runs.js:90` into `src/lib/run-reaper.js`
- [ ] Update extracted function to reap across all accounts (remove `account_id = $1` filter)
- [ ] Add `setInterval` call in `trix-api/src/server.js` startup to run every 10 minutes

**Current:** Reaper only fires when a client calls `GET /agents/runs` — stuck runs persist indefinitely if no one looks.
**Change:** Add an interval at server startup:

```javascript
// In server startup (after pg is ready)
import { reapStaleRuns } from './lib/run-reaper.js';

const REAP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
setInterval(() => {
  reapStaleRuns(fastify.pg, null, fastify.emitEvent, fastify.log).catch(() => {});
}, REAP_INTERVAL_MS);
```

**Notes:** `accountId = null` means reap across all accounts. Keep the fire-and-forget pattern.

---

### S1-3: Per-Tool Execution Timeout

- [ ] Add `TOOL_TIMEOUT_MS` map and `withToolTimeout` wrapper in `trix-bots/src/runner/agent-tool-processor.ts`
- [ ] Apply wrapper to each tool execution in the parallel batch (~line 110)

**Current:** `Promise.allSettled()` on parallel tools — one hung tool waits for the full 30s default timeout.
**Change:**

```typescript
const TOOL_TIMEOUT_MS: Record<string, number> = {
  web_fetch: 15_000,
  node_exec: 60_000,
  default: 30_000,
};

function withToolTimeout<T>(promise: Promise<T>, toolName: string): Promise<T> {
  const ms = TOOL_TIMEOUT_MS[toolName] ?? TOOL_TIMEOUT_MS.default;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Tool ${toolName} timed out after ${ms}ms`)), ms)
    ),
  ]);
}
```

**Notes:** Timeout errors are surfaced as tool failures, not run failures. The agent loop handles tool errors gracefully.

---

### S1-4: Wrap Run-Completion DB Writes with Retry

- [ ] Import `withRetry` from `failure-recovery.ts` in `trix-bots/src/runner/run-completion.ts`
- [ ] Wrap the main `agent_runs` UPDATE in `recordRunFailure` with `withRetry`
- [ ] Wrap the `heartbeat_runs` UPDATE in `recordRunFailure` with `withRetry`

**Current:** `recordRunFailure`'s `pg.query()` at line 62 can fail silently, leaving run state inconsistent.
**Change:**

```typescript
import { withRetry } from './failure-recovery.js';

// In recordRunFailure:
await withRetry(
  () => pg.query(`UPDATE agent_runs SET status = 'failed' ...`, [...]),
  logger,
  { maxAttempts: 3, baseDelayMs: 500 }
);
```

**Notes:** `withRetry` already exists at `failure-recovery.ts:84`. This is a pure reuse.

---

### S1-5: Persist Circuit Breaker State to Redis

- [ ] Pass Redis client into `CircuitBreaker` constructor in `trix-bots/src/runner/circuit-breaker.ts`
- [ ] On trip: write expiry timestamp to Redis (`breaker:{toolName}` key with matching TTL)
- [ ] On check: read from Redis first, fall back to in-memory Map as L1 cache

**Current:** In-memory `Map<string, BreakerState>` — resets on every worker restart, re-exposing broken tools.
**Change:**

```typescript
// On trip: store expiry timestamp
await redis.set(`breaker:${toolName}`, Date.now() + cooldownMs, 'PX', cooldownMs);

// On check: read from Redis first, fall back to in-memory
const expiry = await redis.get(`breaker:${toolName}`);
if (expiry && Date.now() < parseInt(expiry)) return true; // still broken
```

**Notes:** Key TTL matches cooldown so Redis auto-cleans. Redis client already available via BullMQ's connection config in `config.ts`.

---

## Sprint 2 — Speed (P1, ~2–3 days)

---

### S2-1: Parallel Sub-Agent Execution ⭐ Biggest Impact

- [ ] Add `invokeAgentsParallel()` function in `trix-bots/src/runner/agent-invoker.ts`
- [ ] Add `invoke_agents_parallel` tool definition to the orchestrator tool set
- [ ] Ensure depth limit check runs before spawning any child in the batch
- [ ] Verify budget tracking is safe across concurrent children (each gets own `CostTracker`)

**Current:** All child agent invocations serialize behind a single `concurrencyChain` — N children run one at a time regardless.
**Change:**

```typescript
export async function invokeAgentsParallel(
  invocations: AgentInvocation[],
  deps: InvokerDeps,
): Promise<SubagentResult[]> {
  return Promise.allSettled(
    invocations.map((inv) => invokeAgentSerial(inv, deps))
  ).then((results) =>
    results.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : { status: 'failed', agentId: invocations[i].agentId, error: r.reason?.message }
    )
  );
}
```

**Notes:** Keep serial `agent_invoke` for cases where order matters. Parallel path is additive.

---

### S2-2: Raise Tool Parallelism Cap

- [ ] Change `MAX_PARALLEL` from `5` to `10` in `trix-bots/src/runner/tool-concurrency.ts:32`

**Current:** `MAX_PARALLEL = 5`
**Notes:** Read-only tools (search, list, get) dominate parallel batches and are lightweight. Monitor with telemetry after rollout.

---

### S2-3: PG Connection Pool Warmup

- [ ] Add `warmPool()` helper in `trix-bots/src/server.ts`
- [ ] Call `warmPool(pg, Math.min(5, config.pgPoolMax))` after pool is created in startup

**Current:** Pool connections created on-demand — first jobs after a cold start each pay 50–100ms.
**Change:**

```typescript
async function warmPool(pool: Pool, size = 5): Promise<void> {
  const clients = await Promise.all(
    Array.from({ length: size }, () => pool.connect())
  );
  clients.forEach((c) => c.release());
}
```

**Notes:** Only warm min(5, poolMax) connections — enough to cover first wave of concurrent jobs without over-allocating.

---

### S2-4: Increase PG Pool Size

- [ ] Update pool config in `trix-bots/src/server.ts` to `max: Math.max(40, workerConcurrency * 6)`
- [ ] Add `idleTimeoutMillis: 30_000` and `connectionTimeoutMillis: 5_000` to both pool configs
- [ ] Update `trix-api/src/plugins/db.js` pool config with same timeout settings

**Current:** `max: 20` — insufficient when `workerConcurrency = 5` and each job opens 2–3 concurrent queries.

---

### S2-5: Cache LLM Re-Ranking Results Per Session

- [ ] Add run-scoped `Map<string, string[]>` cache in `trix-bots/src/memory/llm-reranker.ts`
- [ ] Key cache by `${runId}:${hash(candidateIds + query)}`
- [ ] Pass `runId` down from `context-builder.ts:166` to the `rerankMemories()` call

**Current:** Every retrieval with 6+ candidates fires a fresh Haiku call (~500ms), even for repeated queries in the same run.
**Change:**

```typescript
const rerankCache = new Map<string, string[]>();

export async function rerankMemories(
  memories: Memory[], query: string, trix: Trix, runId?: string
): Promise<Memory[]> {
  const key = `${runId}:${hashArgs(memories.map(m => m.id), query)}`;
  if (rerankCache.has(key)) {
    const rankedIds = rerankCache.get(key)!;
    return sortByIds(memories, rankedIds);
  }
  const ranked = await callHaikuReranker(memories, query, trix);
  if (runId) rerankCache.set(key, ranked.map(m => m.id));
  return ranked;
}
```

---

## Sprint 3 — Observability (P2, ~3–4 days)

Prerequisites for diagnosing everything that follows.

---

### S3-1: Error Type on Tool Spans

- [ ] Extend `ToolSpan` interface in `trix-bots/src/runner/span-telemetry.ts` with `error_type`, `error_message`, `retry_count`
- [ ] Add `classifyToolError()` function in `trix-bots/src/runner/agent-tool-processor.ts`
- [ ] Pass classified error type when recording failed tool spans

**Current:** `ToolSpan` has `success: boolean` only — can't distinguish timeout from auth failure post-hoc.
**Change:**

```typescript
// span-telemetry.ts
interface ToolSpan {
  tool: string;
  duration_ms: number;
  success: boolean;
  error_type?: 'timeout' | 'auth_failed' | 'invalid_input' | 'rate_limited' | 'network' | 'unknown';
  error_message?: string;
  retry_count?: number;
}

// agent-tool-processor.ts
function classifyToolError(err: Error): ToolSpan['error_type'] {
  if (err.message.includes('timed out')) return 'timeout';
  if (err.message.includes('401') || err.message.includes('403')) return 'auth_failed';
  if (err.message.includes('429')) return 'rate_limited';
  if (err.message.includes('ECONNRESET') || err.message.includes('ENOTFOUND')) return 'network';
  return 'unknown';
}
```

---

### S3-2: Audit Storage Retry + Dead-Letter Queue

- [ ] Write migration: `CREATE TABLE audit_dlq (id uuid PK, run_id uuid, agent_id uuid, entries jsonb, failed_at timestamptz)`
- [ ] Wrap `trix.memories.batchStore()` call in `trix-bots/src/runner/audit-log.ts:118` with `withRetry`
- [ ] On final failure, INSERT to `audit_dlq` via pg with fire-and-forget catch
- [ ] Add log line at error level when audit entry sent to DLQ

**Current:** `storeAuditLog()` swallows all errors — high-risk action audits can be permanently lost.

---

### S3-3: Emit Denied-Action Audit Entries

- [ ] Call `auditLog?.record()` in `trix-bots/src/runner/guardrail-engine.ts` when a tool is blocked
- [ ] Call `auditLog?.record()` in `trix-bots/src/runner/approval-gate.ts` when a tool is denied
- [ ] Set `denied: true, success: false, denialReason: 'guardrail_blocked' | 'user_denied'` on these entries

**Current:** `guardrail_blocked` and approval denials fire as step events but never appear in audit reports.

---

### S3-4: Cost Bucketing in Activity Timeline

- [ ] Add `cost_usd` column to `run_buckets` CTE in `trix-api/src/routes/agent-runs.js:258`
- [ ] Add `COALESCE(SUM(rb.cost_usd), 0) AS cost_usd_total` to the outer SELECT
- [ ] Return `cost_usd: parseFloat(row.cost_usd_total)` in the bucket response objects
- [ ] Update `totals` accumulator to sum `cost_usd` across buckets

**Current:** Timeline buckets show run counts only — can't see when expensive runs happened.

---

### S3-5: Real-Time cost_exceeded / guardrail Redis Events

- [ ] In `trix-bots/src/worker-events.ts`, after writing a step event, check if type is `cost_exceeded` or `guardrail_blocked`
- [ ] Publish a dedicated `agent.run.cost_exceeded` / `agent.run.guardrail_blocked` run event alongside the step event

**Current:** These fire as generic step events — subscribers can't react in real-time to cap hits.
**Change:**

```typescript
if (event.type === 'cost_exceeded' || event.type === 'guardrail_blocked') {
  notifyRunEvent(publisher, {
    type: `agent.run.${event.type}`,
    runId, agentId, accountId,
    data: { tool: event.input?.tool, reason: event.output?.reason },
  });
}
```

**Notes:** Zero schema changes — just an additional Redis publish alongside the existing step write.

---

## Sprint 4 — Capability (P2, ~4–5 days)

---

### S4-1: Per-Child Budget Caps

- [ ] Add `max_budget_usd?: number` to the `agent_invoke` tool schema
- [ ] In `trix-bots/src/runner/agent-invoker.ts`, read remaining budget from parent `CostTracker` before spawning
- [ ] Cap child budget at `min(invocation.maxBudgetUsd, remainingBudget * 0.5)`
- [ ] Throw early if cap ≤ 0 with a clear "Insufficient budget to spawn sub-agent" error

**Current:** Only account-level budget enforced — a runaway child can exhaust all remaining budget.
**Notes:** The 50% cap prevents a single child from consuming all remaining budget. Parent retains 50% for completion work.

---

### S4-2: Conditional Pipeline Stages

- [ ] Add `condition?: (fromStages: Readonly<Record<string, unknown>>) => boolean` to `Stage` interface in `trix-bots/src/pipelines/types.ts`
- [ ] In `trix-bots/src/pipelines/runner.ts`, check `stage.condition` before executing; record `{ skipped: true }` if false
- [ ] Add tests for conditional skip behavior

**Current:** All stages defined upfront and always executed if dependencies satisfied.
**Notes:** Non-breaking — stages without `condition` behave exactly as before.

---

### S4-3: Workflow FSM Entry/Exit Hooks

- [ ] Add `onEntry?` and `onExit?` hook signatures to `Phase` interface in `trix-bots/src/runner/workflow-fsm.ts`
- [ ] Call `currentPhase.onExit(state, nextPhaseName)` before transitioning
- [ ] Call `nextPhase.onEntry(state)` after transitioning
- [ ] Make hooks async; await them in sequence

**Current:** Phases only control tool availability — no side effects on phase transitions.

---

### S4-4: FSM Phase-Local State

- [ ] Add `phaseState: Record<string, unknown>` to `WorkflowFSMState` in `trix-bots/src/runner/workflow-fsm.ts:53`
- [ ] Add `phaseHistory: Array<{ phase: string; state: Record<string, unknown>; exitedAt: number }>` to state
- [ ] On phase transition, move `phaseState` snapshot to `phaseHistory` entry, then clear `phaseState`
- [ ] Expose `set_phase_state` as a tool available within FSM-governed runs

**Current:** Phases accumulate no data — each turn starts fresh with no carry-over.

---

### S4-5: Dynamic Pipeline Stage Count (Fan-Out)

- [ ] Add `dynamic?: { countFn, stageFactory }` to `Stage` interface in `trix-bots/src/pipelines/types.ts`
- [ ] In `trix-bots/src/pipelines/runner.ts`, expand dynamic stages before layer execution using `countFn` + `stageFactory`
- [ ] Collect results under `{stageName}_{index}` keys in `fromStages`
- [ ] Add tests for fan-out then merge patterns

**Current:** Stage count is fixed at DAG definition time — no runtime fan-out.

---

## Sprint 5 — Memory (P2/P3, ~3–4 days)

---

### S5-1: Per-Source Injection Budget Reservations

- [ ] Define `BudgetReservations` interface in `trix-bots/src/memory/budget-governor.ts`
- [ ] Partition incoming memories by type tag before applying budget caps
- [ ] Apply independent caps: `{ memories: 10_000, rules: 1_000, reflections: 1_500 }` (total ~12k, same as before)
- [ ] Wire partitioned results into `context-builder.ts` assembly

**Current:** All memories compete in a single 12k-char pool — agent learnings can starve conversation context.

---

### S5-2: Graduated Memory Reinforcement

- [ ] Track `citation_count` in memory metadata, increment on each citation in `trix-bots/src/memory/consolidation.ts`
- [ ] Compute `citationBoost = Math.min(1 + 0.1 * citationCount, 2.0)` and apply to strength on reinforce
- [ ] Cap final strength at 1.0

**Current:** Cited memories get a uniform boost — 10 citations vs 1 treated identically.

---

### S5-3: Threshold-Triggered Consolidation

- [ ] In `trix-bots/src/memory/budget-governor.ts`, count memories dropped per call
- [ ] If `droppedCount > 3`, call `triggerEpisodicConsolidation()` via `setImmediate` (non-blocking)
- [ ] Verify `triggerEpisodicConsolidation` in `memory-consolidator.ts` is safe to call concurrently

**Current:** Consolidation only runs on a fixed schedule — budget overflows happen without triggering rollup.

---

### S5-4: Session Checkpoint Versioning

- [ ] Define `CHECKPOINT_VERSION = 2` constant in `trix-bots/src/runner/session-recovery.ts`
- [ ] Wrap all checkpoint writes in `{ version: CHECKPOINT_VERSION, createdAt: Date.now(), state: ... }`
- [ ] Add `migrateCheckpoint(old)` function that fills defaults for any missing v2 fields
- [ ] On read, check version and migrate if older

**Current:** No version header — schema changes silently use defaults on old checkpoints.

---

### S5-5: Adaptive Context Boundary Detection (Loop Collapse)

- [ ] Add `detectToolLoops(messages)` in `trix-bots/src/runner/smart-compressor.ts`
- [ ] Detect runs of 5+ consecutive calls to the same tool
- [ ] Replace detected loop spans with a single summary message before passing to compactor
- [ ] Add tests for loop detection edge cases (interrupted loops, interleaved tools)

**Current:** Static `DEFAULT_TAIL_RATIO = 0.2` — repeated identical tool calls are compacted individually.

---

## Sprint 6 — Strategic (P3, ~5+ days each)

---

### P3-1: Dead-Letter Queue for Failed BullMQ Jobs

- [ ] Write migration: `CREATE TABLE dead_letter_runs (id uuid PK, run_id uuid, agent_id uuid, job_data jsonb, failed_at timestamptz, error_message text)`
- [ ] In BullMQ `failed` event handler (`trix-bots/src/worker.ts`), INSERT job data to `dead_letter_runs` before BullMQ removes the job
- [ ] Add `GET /agents/runs/dead-letter` endpoint for inspection

---

### P3-2: Increase Orchestrator Depth Limit (3 → 6)

- [ ] Change `MAX_ORCHESTRATOR_DEPTH` in `trix-bots/src/runner/orchestrator.ts`
- [ ] Add cost-aware depth guard: deeper nesting requires proportionally larger remaining budget
- [ ] Add warning log at depth ≥ 4 so runaway recursion is visible

---

### P3-3: Structured Handoff Artifacts

- [ ] Extend `HandoffContext.artifacts` in `trix-bots/src/runner/handoff-protocol.ts` with binary/structured data support
- [ ] Add bidirectional ACK field: `acknowledged: boolean; acknowledgedAt?: number` to `PeerDelegation`
- [ ] Add automatic diff summarization for file-change handoffs

---

### P3-4: Approximate Citation Matching

- [ ] Replace O(n×m) substring scan in `trix-bots/src/memory/citation-observer.ts` with rolling suffix array approach
- [ ] Add Levenshtein distance check (threshold 0.9) for near-paraphrase detection
- [ ] Make quote threshold adaptive: shorter memories → lower threshold (10 chars), longer → higher (30 chars)

---

### P3-5: Heartbeat Run Redis Notifications

- [ ] Emit `heartbeat:run_started` event in `trix-bots/src/worker-events.ts` when `trigger_type === 'heartbeat'`
- [ ] Emit `heartbeat:run_completed` / `heartbeat:run_failed` on completion
- [ ] Update `trix-api/src/routes/agent-runs.js` timeline to optionally include heartbeat buckets

---

### P3-6: Idempotency Cache Persistence

- [ ] Add `idempotencyCache: Record<string, boolean>` field to `SessionCheckpoint` in `trix-bots/src/runner/session-recovery.ts`
- [ ] Serialize/deserialize cache in `IdempotencyTracker` (`runner/idempotency.ts`) via checkpoint save/load
- [ ] Bound serialized cache size (cap at last 200 entries)

---

### P3-7: Batch Trix API Memory Fetches

- [ ] Design `/v1/memories/batch-query` endpoint in `trix-api` accepting array of `{ query, spaceId, limit }` requests
- [ ] Update `trix-bots/src/memory/retrieval.ts` to use batch endpoint when available
- [ ] Eliminates 7 sequential API round-trips per agent turn in `context-builder.ts:53-97`

---

### P3-8: Cost Prediction Before LLM Call

- [ ] Add token-count helper (messages + tool definitions) in `trix-bots/src/runner/agent-runner-llm.ts`
- [ ] Before calling LLM, estimate token cost and compare against remaining budget
- [ ] Abort with `cost_exceeded` status (not error) if predicted cost exceeds remaining budget

---

## Dependency Map

```
Sprint 1 (Resilience) ─── no dependencies, safe to start immediately
  └─ S1-5 (Redis circuit breaker) requires Redis client wired into circuit-breaker.ts

Sprint 2 (Speed) ─── independent of Sprint 1, can run in parallel
  └─ S2-1 (parallel sub-agents) benefits from S1-1 (retry) so transient child failures don't permanently fail

Sprint 3 (Observability) ─── independent
  └─ S3-2 (audit DLQ) requires a new migration

Sprint 4 (Capability)
  └─ S4-1 (per-child budget caps) most useful after S2-1 (parallel sub-agents)
  └─ S4-3 + S4-4 (FSM hooks + phase state) are companion changes — do together

Sprint 5 (Memory)
  └─ S5-3 (threshold consolidation) after S5-1 (per-source budgets) — needs "dropped" count
  └─ S5-4 (checkpoint versioning) before any other checkpoint schema changes

Sprint 6 (Strategic)
  └─ P3-7 (batch API) requires new trix-api endpoint — cross-repo coordination
```

---

## Metrics to Track

| Metric | Target | Source |
|---|---|---|
| Avg agent run duration (p50/p95) | -20% | `agent_runs.duration_ms` |
| Failed runs due to transient errors | -80% | `agent_runs WHERE error_message LIKE '%timeout%'` |
| Stuck runs older than 30 min | 0 | Reaper logs |
| Sub-agent fan-out throughput | N parallel (from 1) | New telemetry |
| Memory re-rank latency | <100ms (from ~500ms) | `span_telemetry` |
| Audit entries lost | 0 | `audit_dlq` table row count |
| Circuit breaker resets on restart | 0 | Redis breaker key presence |

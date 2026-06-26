# Agentic Pipeline

> How a bot/agent run is triggered, executed, and coordinated.
> Confidence tags (✅ / ⚠️ / 🔬) are explained in [README.md](./README.md).
> All paths are relative to the monorepo root.

## Division of responsibility (the key onboarding fact)

| Plane | Repo | Owns |
|---|---|---|
| **Control plane ("coordinator brain")** | `trix-api` | All CRUD for agents/crews/workflows/triggers/heartbeats/cost policies/handoffs; trigger-time approval/guardrail **resolution**; writes the canonical `agent_runs` row; **enqueues** BullMQ jobs. **Runs no LLMs.** |
| **Execution data plane** | `trix-bots` | BullMQ worker on `agent-execution`; loads agent; runs the LLM agent loop; tools; **in-process** multi-agent composition; guardrail/cost **enforcement**. Also has its **own** PG NOTIFY listener that independently creates runs. |
| **Crew/workflow executor** | `trix-workers-node` | Crew execution (4 strategies) and workflow DAG stepping — **separate** from trix-bots. |

✅ The queue is named **`agent-execution`** (`trix-bots/src/lib/constants.ts:7`,
`trix-api/src/lib/queue-defaults.js:42`). The name `bot-execution` in
`trix-bots/CLAUDE.md` is **stale**.

## End-to-end run flow ✅ (event/mention-triggered)

```
trix-api action → fastify.emitEvent(type, accountId, data)   trix-api/src/plugins/events.js:17
   ├─ webhooks queue
   ├─ event_journal INSERT (durable replay)
   └─ pg_notify('trix_events', payload<7.5KB)
        │
        ▼  (independent of AgentService — a SECOND run-creation path)
trix-bots/src/listener.ts:64  LISTEN trix_events
   dedup (in-memory ring 10k) → match agent_triggers JOIN agents → matchesFilter
   → rate-limit (5/min/agent, in-memory) → INSERT agent_runs (status=pending, trigger_type=event)
   → queue.add('execute', {runId, agentId, accountId})       (listener.ts:171-188)
        │
        ▼
trix-bots/src/worker.ts:77  Worker('agent-execution')
   UPDATE agent_runs→running (:96); publish agent.run.started (Redis)
   loadAgent (+space_grants +skills +node_grants); normalize input
   (heartbeat ctx / dream / task_spec→message)
   → AgentRunner.execute  src/runner/agent-runner.ts:146
        buildMemoryContext via @trixdb/client (context-builder.ts) — split private/shared:
        search, agent learnings (tag agent:{id}), user memories (tag user:{senderId}),
        reflections, checkpoint, skills; optional Haiku rerank; truncate ~16k chars
        resolve + budget tools (tool-resolver); optional planning step
   → runAgenticLoop  src/runner/agent-loop.ts:66   (turns = min(bot.max_turns_per_run, 100))
        per turn: model-router → callLLMWithRetry (pre-call cost prediction + cap; abort if over)
        → provider (Anthropic w/ prompt caching, or daemon bridge for local-bound)
        → execute tool batch (agent-tool-processor → tool-executor registry + delegated chain)
        → feed results back → controls: FSM, loop detector, circuit breaker,
          compaction/microcompaction, write-gate/stuck detection, audit, citations
   → output guardrails + optional evaluator → handleOutput (auto-store memory)
   → recordRunSuccess: UPDATE agent_runs (cost/tokens/telemetry); best-effort side effects
        (checkpoint, reflection, skill extraction, QA pipeline, heartbeat summaries)
        → dispatchChatReply via SDK → publish agent.run.completed (Redis)
```

## Triggers

| Trigger | Path | Notes |
|---|---|---|
| Event / mention | `trix-bots/src/listener.ts:64` (and `AgentService.triggerRun`) | Two creation paths — see KNOWN_GAPS #2 (race). |
| Heartbeat | `trix-api/src/services/AgentHeartbeatService.js:77` | 9-channel context; 60s scanner job. |
| Cron | `trix-bots/src/scheduler.ts:60` | ✅ **Currently broken** — enqueues `cron-execute` with no `runId`; the worker can't process it (KNOWN_GAPS #1). |
| Task | `trix-bots/src/task-trigger.ts` | task_spec → message. |
| Workflow (DAG) | `trix-api/src/services/WorkflowService.js:132` | DAG validate → `workflow-execution` job (executed in trix-workers-node). |
| Crew | `trix-api` route → `CREW_EXECUTION` job | Executed in **trix-workers-node**, not trix-bots. |

## Multi-agent coordination is **in-process recursion, not the queue** ⚠️

An `is_orchestrator` agent gets a restricted delegate-only toolset
(`coordinator-tools.ts`) plus `agent_invoke` / `agent_invoke_parallel` /
`agent_continue` / `handoff` (`orchestrator-tool-handlers.ts:14`).
`createAgentInvoker` (`agent-invoker.ts:89`) loads the child agent, INSERTs a child
`agent_runs` row (`trigger_type=agent_invoke`), and runs a **nested `AgentRunner`
inline** under a 5-min timeout, serialized behind a per-parent concurrency chain.

**Budget chaining is the real cross-tree cost guard:** the parent `CostTracker` is
passed down; each child is capped at `min(explicit, 50% of remaining)`; parallel
children split the remaining budget by N; depth-limited
(`MAX_ORCHESTRATOR_DEPTH=6`) with cycle detection. `agent_continue` reconstructs
history from `agent_run_steps`.

Control-plane services (in `trix-api`): `AgentService.triggerRun` is the canonical
dispatcher with a `FOR UPDATE` active-run guard + mention dedup + approval gate
(`AgentService.js:109`); `HandoffService.createHandoff` persists `agent_handoffs`
and auto-collects source state; `AgentHeartbeatService.triggerHeartbeat` builds a
9-channel context; `WorkflowService.triggerWorkflow` validates the DAG and enqueues.

## ⚠️ The big caveat: trix-bots is **two codebases**

A large **ADR-tagged "harness" layer** — `bootstrap/`, `budget/` (ADR-127),
`pipelines/` (ADR-124 DAG engine), `sandbox/` (ADR-136), `sessions/`, `flags/`,
`hooks/`, `commands/`, `elicitation/`, `mcp/`, `providers/`, `thinking/`, with
`tengu_*` telemetry (a Claude-Code-style port) — **is unwired in production.**
`server.ts` imports **none** of it; the live path is `runner/*` + `llm/*` only.
✅ The `pipelines/` DAG engine and the `sandbox/` policy engine have **zero
non-test importers** — yet `pipelines/runner.ts:1-11` falsely claims "production
wires it." **New devs will waste days assuming these are active.** Treat anything
outside `runner/`, `llm/`, `worker.ts`, `listener.ts`, `scheduler.ts`,
`task-trigger.ts`, `server.ts`, and `memory/` as not-on-the-live-path until proven
otherwise.

## Component → file map

| Component | File:line | Responsibility |
|---|---|---|
| trix-bots entrypoint | `trix-bots/src/server.ts:22` | Boots worker + listener + scheduler + resume scanner + health (`:3739`) |
| BullMQ worker | `trix-bots/src/worker.ts:77` | Processes `execute` jobs end-to-end; LISTEN agent_run_cancel; dead_letter_runs |
| Event listener | `trix-bots/src/listener.ts:64` | LISTEN trix_events; **independent** run creation + enqueue |
| Cron scheduler | `trix-bots/src/scheduler.ts:60` | Maintains repeatable `cron-execute` jobs ✅ (currently broken — see KNOWN_GAPS #1) |
| Agent runner | `trix-bots/src/runner/agent-runner.ts:146` | Prompt/memory/tools/guardrails; `CostTracker`; output + post-run |
| Agent loop | `trix-bots/src/runner/agent-loop.ts:66` | Turn loop, compaction, FSM, loop/stuck/circuit-breaker |
| LLM call + cost cap | `trix-bots/src/runner/agent-runner-llm.ts` | Pre-call cost prediction; provider dispatch; evaluator loop |
| Tool dispatch | `trix-bots/src/runner/tool-executor.ts`, `agent-tool-processor.ts` | Built-in registry + delegated chain; per-call timeout/cache/gating |
| Multi-agent | `trix-bots/src/runner/agent-invoker.ts:89`, `orchestrator.ts`, `coordinator-tools.ts` | In-process child runs; budget chaining; delegate-only toolset |
| Cost (live) | `trix-bots/src/runner/cost-tracker.ts:14` | `MODEL_PRICING` + predict + cap (⚠️ placeholder model IDs — KNOWN_GAPS #23) |
| Memory context | `trix-bots/src/runner/context-builder.ts` + `src/memory/*` | **Agent-side** memory layer (distinct from the trix-api pipeline) |
| Canonical dispatcher (API) | `trix-api/src/services/AgentService.js:109` | FOR-UPDATE run creation, approval gate, enqueue |
| Handoffs (API) | `trix-api/src/services/HandoffService.js:34` | `agent_handoffs` + auto-collected state |
| Heartbeats (API) | `trix-api/src/services/AgentHeartbeatService.js:77` | 9-channel context; 60s scanner job |
| Workflows (API) | `trix-api/src/services/WorkflowService.js:132` | DAG validate + `workflow-execution` enqueue |
| Crew executor (real) | `trix-workers-node/src/processors/crew-execution.js` | 4 strategies (sequential/parallel/hierarchical/dynamic) |
| Wired cost guard (API) | `trix-api/src/billing/middleware/agent-cost-guard.js:34` | Global preHandler: anomaly + circuit breaker on `x-agent-id` |
| bot→api event bridge | `trix-api/src/plugins/...bot-event-bridge.js` | Re-emits Redis `trix:agent:run:events` to SSE/WS |

## ⚠️ Dead/orphaned control-plane services

- `trix-api/src/services/CrewExecutionService.js` — no importers; real crew
  execution is in `trix-workers-node` (4 strategies vs its 1).
- `trix-api/src/services/GuardrailService.js` — referenced only by tests; real
  enforcement is `trix-bots/.../guardrail-engine.ts`.
- ADR-097 `recordAgentCost` / `checkAgentCostAllowed` decorators
  (`plugins/agent-cost-guard.js:47,73`) — **zero call-sites**; only the billing
  middleware is enforced (KNOWN_GAPS #6).

## See also
- `COORDINATOR_IMPROVEMENTS_DEMO.md` and `PLATFORM_ENHANCEMENT_PLAN.md` (intent/feature
  catalogs — partly aspirational; verify against code).
- `trix-research/docs/decisions/ADR-IMPLEMENTATION-INDEX.md` for the ADR rationale.
- **[KNOWN_GAPS_PRELAUNCH.md](./KNOWN_GAPS_PRELAUNCH.md)** for what's broken/dead/unwired here.

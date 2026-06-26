# Known Gaps & Risks (Pre-Launch)

> A living register of what is **broken, dead, mock-only, or risky** in the memory
> and agentic pipelines. **Read this before changing either pipeline** — most of
> these look functional but aren't.
>
> Trix has not launched (zero production users, no backwards-compat obligation), so
> half-built code is expected. The goal of this doc is to stop a new dev from
> trusting code that isn't wired in.
>
> Tags: **✅ verified** against source · **⚠️ analysis** (very likely, not
> re-verified) · **🔬 needs live-DB/runtime check**.
> Items marked **[re-confirmed]** were independently re-checked while writing these docs.

## CRITICAL / HIGH — correctness, security, or "looks functional but isn't"

1. ✅ **[re-confirmed] Cron-triggered bot runs are broken** (or the scheduler is
   dead code). `scheduler.ts:111-112` enqueues `cron-execute` with
   `{agentId, accountId, triggerId}` and **no `runId`**; the worker unconditionally
   does `const {runId} = job.data` (`worker.ts:91`), then `UPDATE agent_runs … WHERE
   id=$1` (`:96`) and `SELECT … WHERE id=$1` (`:107`) with `runId=undefined` → empty
   row → `run.trigger_type` (`:109`) throws. The worker never branches on `job.name`,
   and nothing in trix-api consumes `cron-execute`.

2. ✅ **Two independent `agent_runs` creation paths with divergent safeguards.**
   `AgentService._createRunRecord` uses `SELECT … FOR UPDATE` + mention dedup +
   active-run guard (`AgentService.js:146-216`); the trix-bots listener INSERTs
   directly with only in-memory dedup + a 5/min rate limit (`listener.ts:171-188`).
   Event-triggered runs can **race/duplicate** API-triggered ones and bypass the
   "skip if active" guard.

3. ✅ **[re-confirmed] `CitationService.searchWithCitations` is an access-control
   bypass.** It ignores the injected `searchService` and **silently discards** the
   access clause/params, `spaceId`, `tags`, and `threshold` passed by the route
   (`routes/citations.js:232-244`), running an **account-only `content ILIKE`**
   (`CitationService.js:201,243-258`). `/search/with-citations` does **not** enforce
   space scoping and is not semantic. Fix before launch.

4. ✅ **No sandbox enforcement in trix-bots.** The entire `src/sandbox/*` (ADR-136)
   has **zero importers**. Shell/file tools (`node_exec`, `node_write_file`) are
   gated only daemon-side via `node_grants`; the client-side grant check is
   best-effort and falls through on fetch failure (`agent-runner.ts:384-387`). Human
   approval is also a **stub** (logs + proceeds, `agent-tool-processor.ts:111-116`).

5. ✅ **trix-bots ships a large unwired second codebase**
   (`bootstrap/`, `budget/`, `pipelines/`, `sandbox/`, `sessions/`, `flags/`,
   `hooks/`, `commands/`, `elicitation/`, `mcp/`, `providers/`, `thinking/`,
   `tengu_*` telemetry). `server.ts` imports none; `pipelines/` and `sandbox/` have
   no non-test importers. Major onboarding trap — and `pipelines/runner.ts:1-11`
   falsely claims "production wires it."

6. ✅ **Three+ overlapping agent cost systems; the ADR-097 one is not wired.**
   `recordAgentCost` / `checkAgentCostAllowed` decorators
   (`plugins/agent-cost-guard.js:47,73`) have **zero call-sites**. Only
   `billing/middleware/agent-cost-guard.js` (anomaly + circuit-breaker preHandler) is
   actually enforced, plus `agent_budget_configs` caps and the worker `CostTracker`.
   Easy to believe rate limits are enforced when they are not.

7. ✅ **Two live SearchService stacks; the "documented" SOLID one is dead.**
   `src/services/SearchService.js` (+ `TemporalSearchAdapter`, 7-factor scorer) is
   wired into `plugins/search.js` but **no route calls it**. Live search uses the
   simpler `lib/services/search-service.js`.

8. ⚠️ **"Hybrid" = three incomparable algorithms.** Weighted-sum SUM for
   `GET /memories` (`lib/services/search-service.js:519-555`, 0.7/0.3); true RRF k=60
   for `POST /memories/search/hybrid` (`hybrid-search-rrf.js:54`); cross-modal RRF
   for `/search` (`unified-search-service.js`). Scores aren't comparable across
   endpoints; `?pipeline=` on `/search` only affects `limit`/`threshold`.

9. ✅ **Multiple divergent memory CREATE paths.** HTTP `POST /memories` →
   `content-handlers.handleTextContent` (batchInsert; **no ingest-time
   temporal/speaker metadata**); `MemoryService.createMemory` (ADR-043 temporal +
   speaker, used **only** by `task-memory-integration.js:137` + `habit-memory-bridge.js:54`);
   **and a third** — `integrations/jobs/sync-worker.js:452` has its **own** local
   `createMemory()` with a raw `INSERT INTO memories` (`:457`). Enrichment depth and
   metadata differ by entry point.

10. 🔬 **[re-confirmed] fact-extraction `ON CONFLICT ON CONSTRAINT` names absent from
    migrations.** The worker uses `memory_facts_memory_content_unique`
    (`fact-extraction.js:258`) and `entity_relationships_pair_type_memory_unique`
    (`:451`); **neither name exists in any `trix-api/migration`** at this checkout
    (only indexes + check constraints on `memory_facts`). A named-constraint
    `ON CONFLICT` cannot match an index. If absent in the deployed DB, **every fact
    insert throws** → the 20%-failure threshold trips → the job fails+retries.
    Confirm against the live DB (submodule pointer may be ahead of these migrations).

11. ✅ **Clustering/community/replay/anomaly are delegated to a Python service that
    is OFF by default** (`docker-compose.yml` `ml-workers` is `profiles:`-gated). Node
    `clustering.js:28` only inserts a `pending` `clustering_runs` row + Redis notice;
    with ml-workers down, **user-triggered clustering sits pending forever** and
    `clusters`/`memory_clusters`/communities are never written.

12. ✅ **trix-api `decay` BullMQ queue is orphaned.** trix-api schedules daily-3am
    global decay and exposes `enqueueGlobalDecay`/`enqueueAccountDecay`
    (`queue-defaults.js:49 DECAY:'decay'`, `decay-job.js:308`), but **trix-workers-node
    has no `decay` worker**. Python decay uses taskiq task names, not this queue →
    **no consumer in either service.**

### Configuration / preset selection (the "choose a config per query" design)

See **[PIPELINE_CONFIGURATIONS.md](./PIPELINE_CONFIGURATIONS.md)** for the full
route-by-route status. The headline gaps:

39. ✅ **FIXED (2026-06-26) — Agent executor now applies the selected preset.**
    Was: `AgentService.js:245` enqueued the full `presetConfig` but
    `trix-bots/src/worker.ts` read only `{runId, agentId, accountId}` (grep
    `presetConfig` = 0 hits), so model/provider/tokens/tools/memory/budget were
    dropped on async runs. Now `worker.ts` applies `applyPresetToBot(loadedBot,
    job.data.presetConfig)` (`trix-bots/src/runner/preset-overlay.ts`) and
    `agent-runner.ts` filters tools via `applyToolNameFilter`. The preset also
    survives the approval gate (persisted on the approval request, restored on
    approve). Tests: `trix-bots/.../preset-overlay.test.ts` (13),
    `trix-api/tests/services/approval-service.test.js`.

40. ✅ **FIXED (2026-06-26) — `GET /v1/memories?pipeline=` no longer clobbered.**
    Was: the merge treated Ajv-injected schema defaults as caller-explicit and
    overwrote the preset. Now `mergePresetParams` + `explicitQueryKeys`
    (`trix-api/src/lib/pipelines/merge-preset-params.js`) only let a caller param win
    when it is explicitly present in the query string; otherwise the selected preset
    fills it. Behavior is identical for callers that don't select a pipeline. Tests:
    `trix-api/tests/lib/pipelines/merge-preset-params.test.js` (8).

41. ℹ️ **BY DESIGN — `/v1/search` is cross-modal RRF** (`unified-search-service.js`,
    memories+audio+video), so a preset there controls `limit`+`threshold` only; it has
    no strategy/expansion/rerank concept. Full memory-pipeline control is on
    `GET /v1/memories?pipeline=` (fixed, #40) and `POST /v1/chat`. Not a defect.

42. ✅ **FIXED (2026-06-26) — selection surfaces across both pipelines.**
    ✅ MCP `bot_run` selects an agent preset per call (→ `/v1/agents/:id/run`).
    ✅ Crews are swappable per call (`process_type` override on `POST /v1/crews/:id/execute`).
    ✅ MCP memory selection (`pipeline` on search/memory tools → `/v1/memories`) takes effect.
    ✅ `POST /v1/memory-pipelines/:name/run` ships (search/chat) with the live
    `buildAccessClause` (`build-run-deps.js`), unit + route tested.
    ✅ Agent recall routes through `retrieval_preset` (`context-builder.ts`).
    ✅ MCP can create memory presets (`create_pipeline_preset` → `POST /v1/pipeline-presets`).
    ✅ Crews are the canonical multi-agent pipeline mechanism; the
    `trix-bots/src/pipelines/` DAG engine is deprecated/redundant (kept, not extended).
    Minor remaining: `rerankWeights`/`tag_filter_required` knob mapping (#below);
    `/v1/search` is cross-modal RRF by design (#41).

## MEDIUM

13. ⚠️ **Node consolidation decay is pin-unaware.** `_processMemoryDecay` selects
    every non-dormant, non-deleted memory with **no pin/protection filter**
    (`consolidation.js:189-197`), so pinned memories can decay → dormant →
    cleanup-deleted after 90 days. The pin-aware path is Python's
    `AdaptiveDecayService` (`decay.py:126-152`) — which is off by default. Under the
    default Node-only stack, **pin protection during decay is effectively missing.**

14. ⚠️ **Three parallel decay/consolidation implementations** with different math:
    live Node `consolidation.js` (rate 0.01), legacy Python `decay.py`/`consolidation.py`
    (adaptive, base 0.05, with competition), and **dead** Node
    `services/consolidation-service.js` (only re-exported by an unused barrel). If
    Node + Python both ran, they'd double-decay.

15. ⚠️🔬 **ADR-031 Episode tier is half-built & disconnected** (graph-node creation
    stubbed, not wired to `POST /memories`). Likely **FK violation** in
    `EpisodeFactExtractionService._storeFacts` (`:224-232`): it inserts
    `memory_facts.memory_id = episode.id`, but that column is
    `NOT NULL REFERENCES memories(id)` (`20251225210000_memory_facts.js:29-34`).

16. ⚠️ **`RetrievalPipeline` (the doc's "Stage 1-6 + CRAG") runs in mock mode.**
    Built without llm/db (`search-handler-enhanced.js:515`) → mock expander/validator,
    fact-rerank skipped. CRAG validation is effectively mock-only; the orchestrator
    supersedes it.

17. ⚠️ **Two conflict-detection systems.** Trigger-driven `memory_conflicts` fires on
    **every** memory UPDATE within a 5s cross-agent window
    (`20260112150000_multi_agent_collaboration.js:230-271`) — write-path overhead —
    plus the newer scanned `detected_conflicts`. (`MULTI_AGENT_CONFLICTS.md:536` cites
    the wrong migration number.)

18. ✅ **Dead/orphaned control-plane services.** `CrewExecutionService.js` (no
    importers; real crew exec is in trix-workers-node, 4 strategies vs its 1) and
    `GuardrailService.js` (referenced only by tests; real enforcement is
    `trix-bots/.../guardrail-engine.ts`).

19. ⚠️ **In-process state that breaks at >1 replica.** trix-bots listener dedup +
    5/min rate limit (`listener.ts:27-40`) and trix-api heartbeat throttle/retry Maps
    (`AgentHeartbeatService.js:29-30`) are module-level memory. Railway autoscale 1-10
    defeats both. Per-account orchestrator serialization is also just a logged TODO
    (`orchestrator.ts:222-245`).

20. ⚠️ **ADR-112 ingestion pipeline half-built.** `processEpisodeFactExtractionJob`
    and `processSessionSummarizationJob` return
    `{status:'pending', reason:'service_not_implemented'}` (`pipeline-ingestion.js:73-97`).
    `enrichment-router` returns `skipped` for missing processors (`:126-135`) —
    **masking unfinished modules** rather than failing.

21. ⚠️ **Producer/consumer queue-enum drift.** trix-api `QUEUE_NAMES` includes
    `DECAY`, `COACTIVATION_LEARNING`, `BACKUP`, `AGENT_EXECUTION` with no dedicated
    Node worker; workers-node added `SESSION_CONSOLIDATION`, ADR-112 queues, etc. Two
    hand-maintained enums kept in sync by convention only.

22. ⚠️ **Two cost/pricing tables can drift** (`runner/cost-tracker.ts MODEL_PRICING`
    vs ADR-127 `budget/pricing.ts`, only reachable via the unused bootstrap path).

23. ⚠️ **Production `MODEL_PRICING` uses non-existent Anthropic model IDs**
    (`claude-sonnet-4-6`, `claude-opus-4-6`, `cost-tracker.ts:14-31`). Unknown models
    silently fall back to Sonnet pricing (`:151-153`) → **cost caps may be inaccurate**
    for whatever is actually configured. Verify the real configured model IDs.

24. ⚠️ **Inconsistent default similarity thresholds** across paths: `0.3` (handler;
    `0.05` if mock), `0.2` (orchestrator/preset/lib), `0` (`/search`). The effective
    floor depends on which path runs.

25. ⚠️ **debt: `halfvec` quantization (ADR-002) is dead.** Backfilled once + HNSW
    index built, but no write path populates `embedding_halfvec` for new rows; search
    uses full `embedding` (`sql.js`). The promised 50% storage win is unrealized; the
    index covers nothing.

## LOW (condensed)

| # | Item | Evidence |
|---|---|---|
| 26 | **Local-dev ≠ prod by design**: `EMBEDDING_PROVIDER=mock` disables the orchestrator and lowers thresholds, so the default local path (standard search) is not the prod path (orchestrator) | `config.js:69`; `search-handler-enhanced.js:118` |
| 27 | **Two meanings of "chunk"**: API splits content into separate `memories` rows (child_of); worker splits long text into `memory_chunks` (embedding only) | `content-handlers.js:266` vs `embedding.js:100-249` |
| 28 | **Overlapping extraction**: router "auto" forces entities+relations AND the optional `fact_extraction` job extracts the same — both write the same tables | `memory-router/index.js:80`; `content-handlers.js:499` |
| 29 | **Sync vs async embedding fidelity differs**: API embeds first 8000 chars only; worker chunks >8000 | `embeddings.js:599` vs `embedding.js:348` |
| 30 | **Graph DB identity ambiguous**: factory supports Memgraph (docker default)/FalkorDB/Neo4j; code comments disagree | `trix-workers-node/.../GraphDatabaseFactory.js`; `trix-api/src/lib/graph/README.md` |
| 31 | **Relationship auto-dormancy deliberately disabled** in Node consolidation (empirical "graph went invisible in ~5 days" fix); diverges from Python | `consolidation.js:331-339` |
| 32 | **Conflict-scan cron defined twice** with different defaults (Sun 02:00 staggered vs Sun midnight hardcoded) | `worker.js:937` vs `schedule-config.js:31` |
| 33 | **Python `community.detect` cron mis-scheduled** (requires `account_id` a cron can't supply); `community.all` has no schedule | `community_detection.py:15-22,41-46` |
| 34 | **`agent_cost_*` tables type `agent_id` as VARCHAR(256), no FK** (rest of schema uses UUID+FK) | `20260627000000_agent_cost_protection.js:15` |
| 35 | **Doc/code drift**: `orchestrator.ts:6` says "max 3 levels" but `MAX_ORCHESTRATOR_DEPTH=6`; `trix-bots/CLAUDE.md` says `bot-execution` (actual `agent-execution`) | `lib/constants.ts:7,171` |
| 36 | **Stub side-effects**: Magic Doc auto-update is dry-run only (`agent-runner.ts:476-507`); `deps.maxTurns` vestigial; `tool_batch_summary` emit commented out | as cited |
| 37 | ✅ **Submodule reality**: only `trix-bots` is registered in `.gitmodules`; ~21 gitlinks exist (incl. shannon, trix-api, trix-research, trix-workers-node, trix-sdk-go, install.trixdb.com). `git submodule update --init` won't clone them. CLAUDE.md/SUBMODULES.md claim only `trix-landing` is unregistered — inaccurate | `.gitmodules`; `git ls-tree HEAD` |
| 38 | **shannon**: hardcoded throwaway pentest creds committed (`configs/trix-api.yaml:8-9`); agents run `bypassPermissions`/`maxTurns 10_000` with no guard against pointing at a real env | `claude-executor.ts:244-246` |

## Open questions for the team

These need a human decision; the code alone can't answer them.

1. **Cron triggers** — supposed to work? Fix the scheduler to create a run first, or delete the scheduler? (#1)
2. **Run-creation race** — should the trix-bots listener route through `AgentService` to get the `FOR UPDATE` guard? (#2)
3. **fact-extraction constraints** (🔬) — do `memory_facts_memory_content_unique` / `entity_relationships_pair_type_memory_unique` exist in the **deployed** DB? (`\d memory_facts`, `\d entity_relationships`) (#10)
4. **Canonical decay** — Node `consolidation.js` (Ebbinghaus, pin-unaware, on) or Python adaptive (pin-aware, off)? If Node, pin protection is a real gap to port. (#13)
5. **Is the Python `ml-workers` service meant to run in production?** If not, clustering/community/replay/anomaly are non-functional. (#11)
6. **`decay` BullMQ queue** — dead, or is there a consumer not found? (#12)
7. **trix-bots harness layer** (bootstrap/budget/pipelines/sandbox/sessions/…) — intended replacement for `runner/*`, or experimental code to delete? (#5)
8. **Sandbox & approval** — where is ADR-136 enforced for `node_exec`/file writes? Should human approval **block** the tool loop (it currently logs + proceeds)? (#4)
9. **SearchService** — is the SOLID `src/services/SearchService.js` meant to replace `lib/services/search-service.js`, or dead code to remove? (#7)
10. **Hybrid canonical** — should `GET /memories` adopt RRF to match the other endpoints, or are divergent scores intentional? (#8)
11. **CitationService authz** — is the account-only ILIKE a known shortcut or a bug to fix pre-launch? (#3)
12. **Cost guards** — should ADR-097 be wired, or is it superseded by the billing middleware? (#6)
13. **Model IDs** — what Anthropic model IDs are actually configured? The pricing table's `claude-*-4-6` IDs don't exist and fall back to Sonnet pricing. (#23)
14. **Conflict systems** — keep both `memory_conflicts` (BEFORE-UPDATE trigger) and `detected_conflicts`, or drop the trigger? (#17)
15. **Multi-replica readiness** — move listener dedup/rate-limit and heartbeat throttling to Redis before autoscale? (#19)
16. **Submodule workflow** — is there a sync script that clones the ~20 unregistered gitlinks, or is manual cloning the intended flow? (#37)

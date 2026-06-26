# Pipeline Configurations (Presets) — Status

> **The design goal:** define multiple named *configurations* for the memory and
> agentic pipelines, and choose which one to use per query / per invocation.
> **This doc records how far that is actually wired**, route by route, with
> file:line evidence. Confidence tags (✅ / ⚠️ / 🔬) are explained in
> [README.md](./README.md).

## TL;DR

The **primitives are real and well-modeled** (named, versioned, validated config
objects; storage; CRUD; a per-query selection chain). As of **2026-06-26** the two
primary selection paths are wired end-to-end and tested; a few secondary surfaces
remain (tracked in [KNOWN_GAPS](./KNOWN_GAPS_PRELAUNCH.md#configuration--preset-selection)).

| Pipeline | Status | One-line |
|---|---|---|
| **Memory** | **Works (primary + on-demand)** | Full preset honored on `POST /v1/chat`; `GET /v1/memories?pipeline=` honored (no longer clobbered); **`POST /v1/memory-pipelines/:name/run` now ships** a uniform on-demand entry point (search/chat) with the same access control. `/v1/search` is cross-modal RRF by design (limit/threshold). |
| **Agentic (agent presets)** | **Works per-run (REST + MCP)** | **The `trix-bots` executor now applies the selected preset** (2026-06-26 fix) — model/provider/tokens/memory/budget/tools take effect; presets survive the approval gate; **MCP `bot_run` can now select a preset per call**. |
| **Agentic (multi-agent pipelines)** | **Crews are canonical** | Crews are the supported multi-agent pipeline mechanism — define many, select per call, override strategy per call. The `trix-bots/src/pipelines/` DAG engine is redundant/deprecated (unimported); kept for now, do not build new work on it. |
| **Agentic (crews)** | **Works per-call (2026-06-26)** | `process_type` → real strategy dispatch end-to-end; `POST /crews/:id/execute` now accepts a **per-execute `process_type` override** to swap strategy per call. |

### Implemented 2026-06-26 (tested, no public-API change)

- **Agent executor honors the selected preset.** `trix-bots/src/runner/preset-overlay.ts`
  (`applyPresetToBot` + `applyToolNameFilter`), applied in `worker.ts` after
  `loadAgent` and in `agent-runner.ts` for tool filtering. Tests:
  `trix-bots/src/runner/__tests__/preset-overlay.test.ts` (13).
- **Presets survive the approval gate.** The preset is persisted on the approval
  request context and restored on approve (`ApprovalService` + `AgentService`).
  Tests: `trix-api/tests/services/approval-service.test.js`.
- **MCP can select an agent preset per call.** `bot_run` now accepts `preset`
  (`trix-mcp/.../bot-schemas.ts` + `BotsClient.runBot`), forwarded to
  `/v1/agents/:id/run` (which already resolves it → enqueues → executor applies).
  Tests: `trix-mcp/tests/unit/handlers/bot.test.ts`.
- **Crews: per-execute strategy override.** `POST /v1/crews/:id/execute` accepts an
  optional `process_type` that overrides the crew's default for that run — swap the
  multi-agent pipeline per call (`trix-api/src/routes/crews.js`). Tests:
  `trix-api/tests/routes/crews.test.js`.
- **`GET /v1/memories?pipeline=` no longer clobbered.** `trix-api/src/lib/pipelines/merge-preset-params.js`
  (`mergePresetParams` + `explicitQueryKeys`) — caller params win only when
  explicitly present in the query string; otherwise the preset fills them.
  Identical behavior for callers that don't select a pipeline. Tests:
  `trix-api/tests/lib/pipelines/merge-preset-params.test.js` (8).
- **Memory selection over MCP** already worked via the `pipeline` param on
  `search`/`memory` tools (→ `/v1/memories`), and now actually takes effect thanks
  to the clobbering fix.
- **On-demand pipeline execution: `POST /v1/memory-pipelines/:name/run`** runs any
  named pipeline (kind `search` | `chat`) through the `MemoryPipeline` facade,
  reusing the live `buildAccessClause` so it is scoped exactly like
  `GET /v1/memories`. `lib/pipelines/build-run-deps.js` + `routes/memory-pipelines.js`.
  Tests: `tests/lib/pipelines/build-run-deps.test.js` (7),
  `tests/lib/pipelines/memory-pipeline.test.js` (success path), and
  `tests/routes/memory-pipelines.test.js` (route: resolves + dispatches + authz + 404/400).
- **Agent recall via a named memory pipeline.** An agent preset's `retrieval_preset`
  is carried onto the bot and passed as `pipeline` to the agent's memory searches
  (`trix-bots/src/runner/context-builder.ts`), so an agent recalls through the chosen
  memory pipeline — the memory↔agent integration. Tests:
  `trix-bots/tests/runner/context-builder.test.ts`. (`ListMemoriesParams.pipeline`
  added to the SDK type.)
- **Create memory presets over MCP:** `create_pipeline_preset`
  (`trix-mcp/.../p10.ts` → `POST /v1/pipeline-presets`). Tests:
  `trix-mcp/tests/unit/handlers/p10.test.ts`.

### Architectural boundary (intentional, not a gap)

- **`/v1/search` is cross-modal.** It is an RRF fusion engine over
  memories+audio+video (`lib/search/unified-search-service.js`); it has no
  strategy/expansion/rerank concept, so a preset there controls `limit`/`threshold`
  by design. For full memory-pipeline control use `GET /v1/memories?pipeline=`,
  `POST /v1/chat`, or `POST /v1/memory-pipelines/:name/run`.

---

## Memory pipeline configurations ("pipeline presets")

### The config object
A **pipeline preset** (ADR-111/112): a named, versioned, Ajv-validated JSON spec
with a *closed* schema (`additionalProperties:false`) — `trix-api/src/lib/pipelines/pipeline-schema.js:61-155`. Blocks:
- `retrieval` — `strategy` (vector/hybrid/fulltext/full-context), `top_k`, `min_relevance_score`, `tag_filter_required`, `expansions[]` (synonym, entity-alias, relationship-rewrite, temporal, decomposition, multi-hop…), `rerankers[{name, weight}]` (cohere-v4, cross-encoder, topic-boost, fact, activation, community-boost, recency-boost)
- `generation` — `prompt_template_id`, `temperature`, `max_tokens`, `model_allow[]`
- `post_processing` — `answer_extraction`, `answer_format`, `word_limit`, `retry_on_abstention`, `latest_value_injection`, `max_retries`
- `two_pass` — `enabled`, `mode`, `gate_by_category[]`

### Storage & CRUD
- **Built-ins:** JSON files `trix-api/src/lib/pipelines/presets/*.json` (`default`, `high-precision`, `high-recall`, `locomo-v1`, `longmemeval-v1`, …), frozen at module init.
- **Account presets:** Postgres `pipeline_presets`, `UNIQUE(account_id, name)` — `trix-api/migrations/20260709000000_pipeline_presets.js:17`.
- **Selected default** is a *name pointer*, not a spec: `accounts.settings->>'default_pipeline_preset'` and `spaces.metadata->>'default_pipeline_preset'`.
- **CRUD:** full REST at `trix-api/src/routes/pipeline-presets.js:52-248` (+ space default in `routes/spaces.js:438-507`). MCP exposes the *default pointers* + `resolve_pipeline` but **cannot create DB presets** (REST-only).

### Selection chain
Per-query via `?pipeline=<name>` (GET search/memories) or `body.pipeline` (chat),
resolved **caller → space → account** by `resolvePresetWithSpaceAndAccountDefault`
(`preset-registry.js:239-260`); emits `X-Pipeline-Name` / `X-Pipeline-Source` headers.
A dry-run `_resolve` endpoint shows which preset would win.

### ✅ What actually changes when you pick a config — by route

| Route | Honored? | What reaches the engine |
|---|---|---|
| **`POST /v1/chat`** | **Fully** | `chat.js:476-558` deliberately removed the ajv defaults so the preset fills in via `pick()`; retrieval (`searchOverrides`: mode, layerMode, weights, expansion flags, rerankers, seedPool), generation, post-processing, and two-pass all reach `ChatService`. |
| **`GET /v1/memories?q=`** | **Honored (2026-06-26 fix)** | Now merged via `mergePresetParams` + `explicitQueryKeys` (`merge-preset-params.js`): a caller param wins only when it is **explicitly present in the query string**; otherwise the selected preset fills it. So the preset's strategy/threshold/top_k/expansion/reranking/topic-routing now reach `handleSearch`, while callers that don't pass a flag still get the same schema default. (Still unmapped: `rerankWeights`, `tag_filter_required` — see remaining work.) |
| **`GET`/`POST /v1/search`** | **limit+threshold only** | `search.js:262-269` extracts only `top_k→limit` and `min_relevance_score→threshold`; `UnifiedSearchService` always runs hybrid RRF. Strategy/expansions/rerankers ignored. |
| **`/v1/deep-recall`** | graph depth only | Honors `graph.depth` (clamped 3); retrieval/generation ignored. `operations/recall.js` reads `preset.recall`, a block the schema can't validate — a dead knob. |
| **`POST /v1/memory-pipelines/:name/run`** | **Not shipped** | "Execution deferred to P5" (`routes/memory-pipelines.js:10`). The `MemoryPipeline` facade (`lib/pipelines/memory-pipeline.js`) that maps the *whole* spec uniformly is built + tested but wired to no route. |

The underlying `SearchOrchestrator` **is** genuinely flag-gated (reranking
`search-orchestrator.js:119`, multi-hop `:146`), so when flags reach it the
*algorithm* changes, not just K. The defect is at the route boundary, not the engine.

🔬 **Also env-gated:** advanced stages (expansion/reranking/CRAG/community) are
double-gated by `ENABLE_ADVANCED_RETRIEVAL` env **and** `account.advanced_retrieval`
(`retrieval/config.js:438-451`); with the master flag off (default), `high-recall` /
`high-precision` lose reranking/expansion *regardless of selection*. Verify against
deployed env/DB.

---

## Agentic pipeline configurations

Three distinct "config" concepts exist; only the first is the named-preset
primitive, and it's the one that doesn't take effect at runtime.

### (a) Agent presets — selectable per run, ignored at execution ✅
- **Object/storage:** `agent_presets` table (5 system + account-scoped) with
  `provider`, `model`, `temperature`, `max_tokens`, `tools_allowed/blocked`,
  `memory_strategy`, `search_limit`, `retrieval_preset`, `memory_pipeline_name`,
  `step_overrides`, `autonomy_level`, `budgets` — `trix-api/migrations/20260610000000_agent_presets.js`. Attached via `agents.preset_id`.
- **CRUD:** full REST (`routes/agent-presets.js`); MCP `agent_preset_list/get/create/update` (no delete).
- **Per-invocation selection (REST, works):** `POST /agents/:id/run` resolves
  `body.preset || agent.preset_id` (`agents.js:657-666`); `/invoke` resolves
  `body.preset_id` (`agents.js:700-704`). `AgentService` correctly **enqueues** the
  full preset: `presetConfig: presetConfig || null` (`AgentService.js:245`).
- **✅ What changes at runtime (2026-06-26 fix):** the worker now applies the preset.
  `worker.ts` calls `applyPresetToBot(loadedBot, job.data.presetConfig)` after
  `loadAgent`, overlaying provider/model/temperature/max_tokens/memory_strategy/
  search_limit/max_cost_per_run onto the agent baseline; `agent-runner.ts` filters
  the resolved tool set by the preset's allow/block lists via `applyToolNameFilter`.
  The preset also now **survives the approval gate** (persisted on the approval
  request, restored on approve). Carried but not yet consumed: `retrieval_preset`
  (needs agent recall routed through a named memory pipeline) and `step_overrides`.
  See `trix-bots/src/runner/preset-overlay.ts` + tests.
- **✅ MCP can select per call (2026-06-26 fix):** `bot_run` now accepts `preset`
  (`trix-mcp/.../bot-schemas.ts` + `BotsClient.runBot`). MCP's `runBot` posts to
  `/v1/agents/:id/run` (not a separate `/bots` route), which already resolves the
  preset — so the param flows straight through to the executor fix above.

### (b) trix-bots `pipelines/` DAG engine — fully built, fully orphaned ✅
A typed multi-agent DAG (ADR-124: YAML loader, builder, sequential+parallel runner,
cycle detection, observability) in `trix-bots/src/pipelines/*`, well unit-tested.
**No DB table, no API/MCP/CLI surface, no per-bot binding, zero external importers**
(verified). `BotRunJob` carries no pipeline field. Selecting one would do nothing.

### (c) crews / workflows — the selectable config that DOES work end-to-end
trix-api **crews** persist `process_type` → `crew_run.strategy` → enqueue
`CREW_EXECUTION`; `trix-workers-node/src/processors/crew-execution.js:470-508`
dispatches `STRATEGY_HANDLERS[run.strategy]` to genuinely different code
(sequential / parallel / hierarchical / dynamic). Real and end-to-end, and as of
2026-06-26 **swappable per call**: `POST /v1/crews/:id/execute` accepts an optional
`process_type` that overrides the crew's default for that one run (falls back to the
crew's `process_type` when omitted). Tests: `trix-api/tests/routes/crews.test.js`.

---

## What it would take to realize the vision (minimal, prioritized)

**Agentic:**
1. ✅ **DONE (2026-06-26)** — executor reads + applies the preset (`preset-overlay.ts`,
   wired in `worker.ts` + `agent-runner.ts`); preset survives the approval gate.
2. ✅ **DONE (2026-06-26)** — MCP `bot_run` per-call preset selection.
3. ✅ **DONE (2026-06-26)** — per-call multi-agent pipeline swap via the crew
   `process_type` override on `POST /crews/:id/execute`.
4. ✅ **DONE (2026-06-26)** — agent recall consumes `retrieval_preset` (context-builder
   routes recall through the named memory pipeline).
5. ✅ **RESOLVED (2026-06-26)** — crews are the canonical multi-agent pipeline
   mechanism (selectable + strategy-swappable per call). The `trix-bots/src/pipelines/`
   DAG engine is deprecated/redundant; don't build new work on it. (`step_overrides`
   remains carried-but-unused — optional future.)

**Memory:**
1. ✅ **DONE (2026-06-26)** — `GET /v1/memories?pipeline=` no longer clobbered
   (`merge-preset-params.js`). `/v1/chat` already honored the full spec; MCP selection
   now takes effect.
2. ✅ **DONE (2026-06-26)** — `POST /v1/memory-pipelines/:name/run` ships (search/chat)
   with the live access-control clause (`build-run-deps.js`), unit + route tested.
3. **By design — `/v1/search`** is cross-modal RRF (limit/threshold only). Use
   `/v1/memories?pipeline=` or `/v1/memory-pipelines/:name/run` for full control.
4. **Remaining (minor) — map dropped knobs** (`rerankWeights`, `tag_filter_required`,
   strategy weights) in `preset-to-request-flags.js`; remove or schematize the dead
   `preset.recall` read.
5. 🔬 Confirm `ENABLE_ADVANCED_RETRIEVAL` / `account.advanced_retrieval` are enabled in
   the target env, or memory presets stay neutralized regardless of selection.

> See also [MEMORY_PIPELINE.md](./MEMORY_PIPELINE.md) §Retrieval,
> [AGENTIC_PIPELINE.md](./AGENTIC_PIPELINE.md), and
> [KNOWN_GAPS_PRELAUNCH.md](./KNOWN_GAPS_PRELAUNCH.md) (#39–#42).

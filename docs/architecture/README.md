# Trix Architecture — Memory & Agentic Pipelines

**Start here.** This directory is the cross-cutting onboarding map for Trix's two
core pipelines and the several runtimes that implement them. It is deliberately
*honest about what is half-built* — Trix has not launched (zero production users),
so experimental, dead, and not-yet-wired code is expected and is called out
explicitly rather than papered over.

These docs span multiple independent git repos (`trix-api`, `trix-bots`,
`trix-workers-node`, `trix-workers`, `shannon`), which is exactly why they live in
the **parent repo** rather than inside any one submodule.

## The four documents

| Doc | Read it when you need to… |
|---|---|
| **[MEMORY_PIPELINE.md](./MEMORY_PIPELINE.md)** | Understand how a memory is written, enriched, stored, and retrieved. |
| **[AGENTIC_PIPELINE.md](./AGENTIC_PIPELINE.md)** | Understand how a bot/agent run is triggered, executed, and coordinated. |
| **[PIPELINE_INTERCONNECT.md](./PIPELINE_INTERCONNECT.md)** | Understand how agents read/write memory and which channels/tables connect the two pipelines. |
| **[PIPELINE_CONFIGURATIONS.md](./PIPELINE_CONFIGURATIONS.md)** | Understand the named "preset" configs for each pipeline and **how far per-query/per-run selection is actually wired** (route-by-route status). |
| **[KNOWN_GAPS_PRELAUNCH.md](./KNOWN_GAPS_PRELAUNCH.md)** | See what is broken, dead, mock-only, or risky before you trust it. **Read this before changing either pipeline.** |

## How to read the confidence tags

Findings throughout these docs carry a tag so you know how much to trust them:

- **✅ verified** — re-checked against source in the review that produced these docs (file:line cited).
- **⚠️ analysis** — derived from a deep read but not independently re-verified; treat as "very likely."
- **🔬 needs live check** — depends on the *deployed* database/runtime, not just the code at this checkout (submodule pointers may be ahead of the migrations here).

## The big picture

Trix is a multi-tenant memory layer for AI agents and humans. Two pipelines do
the heavy lifting:

1. **Memory pipeline** — ingest content → make it instantly keyword-searchable →
   defer all the "intelligent" work (embeddings, facts, entities, relationships,
   summaries, clustering, decay) to background queues → serve it back through a
   configurable retrieval stack.
2. **Agentic pipeline** — trigger an agent → build its memory/tool context →
   run an LLM loop with cost/guardrail enforcement → optionally coordinate
   sub-agents in-process → store the result back as memory.

They meet at the memory store: **agents read and write memory through the same
HTTP API and the same enrichment pipeline** (see PIPELINE_INTERCONNECT.md).

### Which repo owns what

| Repo / runtime | Plane | Responsibility |
|---|---|---|
| `trix-api` (Fastify) | Control plane | All HTTP CRUD; the **synchronous** memory write path + job fan-out; the live **retrieval** stacks; agent/crew/workflow/trigger/heartbeat **bookkeeping** and dispatch. Runs no LLMs in the request path. |
| `trix-workers-node` (BullMQ) | Memory data plane | ~30 queues: embeddings, enrichment, fact extraction, graph sync, consolidation/decay, session consolidation; **crew execution** and **workflow DAG** stepping. |
| `trix-workers` (Python, taskiq) | Memory science | "Brain-inspired" adaptive decay (pin-aware), HDBSCAN clustering, Louvain community detection, replay/anomaly. **Off by default** (`ml-workers` is profile-gated in docker-compose). |
| `trix-bots` (BullMQ worker) | Agent data plane | Consumes the `agent-execution` queue; runs the LLM agent loop, tools, sandbox checks, budget enforcement; **in-process** multi-agent coordination. |
| `shannon` | **Not platform code** | A vendored third-party autonomous **penetration-testing** tool that *attacks* a running Trix instance as a red-team harness. It is **not** Trix's memory or reasoning engine. Treat it as a dev/security tool. |

### Control plane vs data plane (agentic)

```
   ┌──────────────────────────── trix-api (control plane) ───────────────────────────┐
   │ AgentService.triggerRun · HandoffService · AgentHeartbeatService · WorkflowService │
   │ writes canonical agent_runs · resolves approvals/guardrails · ENQUEUES jobs        │
   └───────────────┬───────────────────────────────────────────────┬──────────────────┘
                   │ BullMQ: agent-execution                         │ BullMQ: crew/workflow
                   ▼                                                 ▼
        ┌───────────────────────┐                        ┌──────────────────────────┐
        │ trix-bots (data plane)│                        │ trix-workers-node         │
        │ LLM loop · tools ·    │   in-process recursion │ crew-execution (4 modes)  │
        │ budget · sub-agents   │◀── (NOT the queue) ──▶ │ workflow DAG stepping     │
        └───────────┬───────────┘                        └──────────────────────────┘
                    │ reads/writes memory over HTTP (@trixdb/client)
                    ▼
        ┌───────────────────────────────────────────────────────────────────────────┐
        │ trix-api memory pipeline  (Postgres + pgvector + Redis + graph DB)          │
        └───────────────────────────────────────────────────────────────────────────┘
```

## Glossary of overloaded terms (read this — it prevents real confusion)

Several words mean **different things in different places**. Mixing them up is the
single most common onboarding mistake here.

| Term | It can mean… |
|---|---|
| **"pipeline"** | (a) a **retrieval preset** for search (`set_default_pipeline`, `?pipeline=`); (b) the **trix-bots DAG engine** in `src/pipelines/` — *which is currently unwired*; (c) the **ADR-112 ingestion** enrichment chain. |
| **"chunk"** | (a) the API splitting input content into **separate `memories` rows** linked by `child_of`; (b) the embedding worker splitting long text (>8000 chars) into the **`memory_chunks`** table (embedding only). Both happen, at different stages. |
| **"hybrid search"** | (a) weighted-sum fusion (0.7 vector / 0.3 FTS) on `GET /memories`; (b) true **RRF** (k=60) on `POST /memories/search/hybrid`; (c) cross-modal RRF on `/search`. Scores are **not comparable** across endpoints. |
| **"memory" (agent context)** | (a) the trix-api server-side store/pipeline; (b) the **trix-bots agent-side memory layer** (`trix-bots/src/memory/*`) — a client-side budget/injection/consolidation layer *on top of* (a). Don't conflate them. |
| **"fact / entity"** | written by **two unrelated code paths**: the live worker fact-extraction, and the half-built ADR-031 "Graphiti" Episode tier — both land in `memory_facts` / `memory_entities`. |

## Docs you should distrust (stale or contradicted by current code)

New docs link to these but they have not been refreshed; verify against source:

- **Root `README.md`** — uses pre-rename dir names (`trixdb-*`), says "19+ MCP tools" (actual 280+), omits `trix-bots`, `trix-mcp`, `trix-daemon`, `shannon`, SDKs.
- **`SUBMODULES.md`** + root `CLAUDE.md` submodule section — imply only `trix-landing` is an unregistered gitlink; in fact only `trix-bots` is registered in `.gitmodules` and ~20 other gitlinks are not (`git submodule update --init` won't clone them).
- **`trix-bots/CLAUDE.md`** — says the queue is `bot-execution` (actual: `agent-execution`); lists ~7 files for a `runner/` that has ~175 modules.
- **`COORDINATOR_IMPROVEMENTS_DEMO.md`** — references "Claude 3.5 Sonnet" advisor and orchestrator depth "3" (code uses `MAX_ORCHESTRATOR_DEPTH=6`).
- **`trix-api/docs/RETRIEVAL_PIPELINE_IMPLEMENTATION_SUMMARY.md`** — self-contradictory status; describes the `RetrievalPipeline` branch that runs in mock mode and is superseded by the orchestrator.
- **`trix-api/docs/architecture/README.md`** — links to several non-existent docs; overlaps `trix-api/docs/ARCHITECTURE.md`.
- **`trix-research/docs/trix-bots-roadmap.md`** — "what doesn't work" list contradicted by current code.

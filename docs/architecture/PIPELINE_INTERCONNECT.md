# How the Two Pipelines Connect

> Where the [memory pipeline](./MEMORY_PIPELINE.md) and the
> [agentic pipeline](./AGENTIC_PIPELINE.md) meet.
> Confidence tags (✅ / ⚠️ / 🔬) are explained in [README.md](./README.md).

## Agents use memory over HTTP

**Agents read memory** through the vendored `@trixdb/client` SDK back into
`trix-api`: `context-builder.ts buildMemoryContext` calls `/v1/memories` (semantic /
hybrid search). So an agent's recall runs through the **same retrieval stack**
described in the memory doc (§ "Retrieval").

**Agents write memory** the same way — `handleOutput` auto-store, handoff memories,
and session summaries all re-enter the **same ingest + enrichment pipeline**. An
agent-authored memory is indistinguishable, downstream, from a user-authored one;
it gets the same embedding/fact/entity/graph fan-out.

This is the single most important integration fact: **there is no private back
channel.** Agents are first-class API clients of the memory store.

## ⚠️ Two distinct "memory" systems — don't conflate them

| System | Where | What it is |
|---|---|---|
| Server-side pipeline | `trix-api` + `trix-workers-node` | The canonical store, enrichment, and retrieval (the memory doc). |
| Agent-side memory layer | `trix-bots/src/memory/*` | A **client-side** budget/injection/consolidation/tiering layer (retrieval, injection, budget-governor, consolidation, citation-observer, llm-reranker, tiering, anchoring, pinning — ADR-122) that sits **on top of** the server-side store. |

The agent-side layer decides *what to inject into the prompt and how much budget to
spend*; it does **not** replace the server store. Their relationship is otherwise
undocumented — hence this note.

## Shared state & channels

| Mechanism | Direction | Detail |
|---|---|---|
| Postgres `agent_runs` / `agent_run_steps` | both write | trix-api creates the run; trix-bots updates it; ⚠️ the trix-bots listener **also** creates runs independently (race — see KNOWN_GAPS #2). |
| Postgres `memories` + enrichment tables | both | API ingests; workers enrich; agents read/write via the SDK. |
| BullMQ `agent-execution` (Redis) | api → bots | trix-api enqueues `execute`; trix-bots consumes. |
| BullMQ `embedding`/`enrichment`/`graph-sync`/`crew-execution`/`workflow-execution`/`conflict-detection` | api → workers-node | Deferred memory work + crew/workflow execution. |
| PG NOTIFY `trix_events` | api → bots | Domain events → trix-bots listener (durability via `event_journal`). |
| PG NOTIFY `agent_run_events` | workers → listeners | **Enrichment** lifecycle (`enrichment-router.js`). ⚠️ Confusingly similar name to the Redis channel below. |
| Redis pub/sub `trix:agent:run:events` | bots → api | Run/step lifecycle → `bot-event-bridge` → SSE/WS. (Redis is used because PgBouncer drops `NOTIFY`.) |
| PG NOTIFY `agent_run_cancel` | api → bots | Cancellation → worker `AbortController`. |
| Postgres `clustering_runs`/`cluster_operations` + Redis `trix:clustering:pending` | node → python | The Node↔Python bridge (dormant when `ml-workers` is off). |

## Mental model in one sentence

`trix-api` is the **system of record and the only LLM-free hot path**; everything
expensive (embeddings, enrichment, agent reasoning, crews) is pushed onto **Redis
queues** consumed by `trix-workers-node` (memory science + crews) and `trix-bots`
(agent reasoning), and agents loop back in as ordinary HTTP clients of the memory
store.

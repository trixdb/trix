# Memory Pipeline

> How a memory is written, enriched, stored, and retrieved.
> Confidence tags (✅ / ⚠️ / 🔬) are explained in [README.md](./README.md).
> All paths are relative to the monorepo root.

## Mental model

A memory write is **fast and synchronous up to "searchable-by-keyword," then
everything intelligent is deferred.** The HTTP route inserts rows into `memories`
with `embedding = NULL`. A Postgres **`GENERATED` `search_vector` tsvector makes
the row full-text-searchable the instant it commits**, while semantic search,
fact/entity extraction, relationships, topics, summaries, quality scoring, graph
sync, clustering, and community detection are fanned out to ~30+ BullMQ queues
consumed by `trix-workers-node`.

Heavier "brain-inspired" science (adaptive decay, HDBSCAN clustering, Louvain
communities) lives in a separate Python service (`trix-workers`) that is **off by
default**. **Shannon is not part of this pipeline at all** — it is a pentest tool
(see README).

## End-to-end write flow ✅ (the live HTTP path)

```
POST /v1/memories {content}
  trix-api/src/routes/memories/index.js:90   (preHandlers: memoryQuotaGuard, storageBudgetGuard)
   └─ handleJsonContent (index.js:109): salience/decay validate, overflow guard (M-65),
      ingestion dedup + idempotency (M-02), content-type detect
       └─ handleTextContent  trix-api/src/routes/memories/handlers/content-handlers.js:32
           1. normalize tags, FK-validate session_id
           2. determineSplitStrategy (lib/text-splitter.js):
              markdown / paragraph / sentence / size / numbered-fact(ADR-110) / single
              → N chunks; EACH chunk becomes its OWN `memories` row
           3. batchInsert into memories (:206) with embedding = NULL
              → GENERATED search_vector (weight A=content, B=tags) ⇒ INSTANT keyword search
           4. multi-chunk → sequential `child_of` rows in memory_relationships (:266)
           5. FAN-OUT of background jobs:
                • embedding            → embedding queue (:287); sync fallback embeds inline
                • graph-sync-memory    → per memory (:337)
                • triggerAutoClusteringIfEnabled (debounced 30s)
                • enrichment           → memory-router picks types; rows in `enrichments`
                                         (ON CONFLICT DO NOTHING), one job/type (:415-494)
                • fact_extraction      → optional, AUTO_FACT_EXTRACTION flag (:499)
                • quality-calculation  → per memory
           6. completeIngestion, search-cache invalidation, ADR-109a ingestion-profile
              dispatch, emitEvent('memory.created'); 201 returned
```

### Deferred work in `trix-workers-node`

```
embedding queue   → processEmbeddingJob (src/processors/embedding.js:334)
   status pending→processing→completed; provider chain (OpenAI/Voyage/Cohere/Gemini/Ollama);
   text >8000 chars re-chunked into memory_chunks (own embedding each);
   parent.has_chunks=true, parent gets the FIRST chunk's embedding; records billing.

enrichment queue  → processEnrichmentJob (src/processors/enrichment-router.js:96)
   health-gates external deps; loads ADR-105 pipeline_state from memory.metadata;
   emits enrichment.started/completed/failed via pg_notify('agent_run_events');
   dispatches by job.data.type → modules/registry.js (entity-extraction, topic-extraction,
   summarization, context-rewrite, user-profile, auto-relations, fact-extraction,
   entity-linking, quality-calculation, event-date-extraction, session-observation,
   title-generation).

fact_extraction   → processFactExtractionJob (src/processors/fact-extraction.js:524)
   3 sequential LLM calls → memory_facts / memory_entities / entity_relationships (upserts).

graph-sync-memory → processGraphSyncMemoryJob (src/processors/graph-sync.js:87)
   MERGE Memory node into the graph DB (Memgraph default / FalkorDB / Neo4j).

consolidation     → processConsolidation (src/processors/consolidation.js:650), cron every 6h
   Ebbinghaus salience decay, relationship-weight decay, Hebbian auto-relate from
   memory_co_activations, dormant cleanup (>90d), embedding-similarity dedup; writes
   consolidation_runs.

clustering        → processClusteringJob (src/processors/clustering.js:28)
   ONLY inserts a 'pending' clustering_runs row + Redis notice → handed to Python (OFF by default).

session close     → processSessionConsolidationJob (src/processors/session-consolidation.js:200)
   LLM summary + ≤5 facts → new memories → re-enqueue embeddings (loops back into ingest).
```

## ⚠️ There are three memory-create paths (not one)

Enrichment depth and metadata **differ by entry point** — this trips people up:

| Path | Entry | Notes |
|---|---|---|
| HTTP ingest (the real one) | `content-handlers.js:32` `handleTextContent` | `batchInsert` + full job fan-out. **Gets no ingest-time temporal/speaker metadata.** |
| Service create | `MemoryService.createMemory` (`MemoryService.js:167`) | Transactional; ADR-043 temporal + speaker extraction (`:215-245`). Called **only** by `task-memory-integration.js:137` and `habit-memory-bridge.js:54` — **not** by the HTTP route. |
| Integration sync | `integrations/jobs/sync-worker.js:452` | Its **own** local `createMemory()` with a raw `INSERT INTO memories` (`:457`). |

## Facts, entities & the temporal knowledge graph — two parallel systems ⚠️

Two unrelated code paths write into the **same** `memory_facts` / `memory_entities`
tables:

1. **Inline worker facts (live).** `fact-extraction.js` + the `entity-extraction` /
   `auto-relations` enrichment modules. These are what `POST /memories` actually
   produces.
2. **ADR-031 "Graphiti" Episode tier (half-built).** `EpisodeService` /
   `EpisodeFactExtractionService` / `EntityService` / `CommunitySummaryService`,
   reachable **only** via `/episodes`, `/knowledge`, `/communities` routes. Adds
   bi-temporal validity (`valid_at`/`invalid_at`/`is_valid`), episode citations,
   and conflict supersession — but its **graph-node creation is an explicit no-op**
   ("not yet implemented", `EpisodeService.js:397-432`) and it is **never called by
   `POST /memories`**. ⚠️🔬 It also likely hits an FK violation in
   `EpisodeFactExtractionService._storeFacts` (`:224-232`) because it inserts
   `memory_facts.memory_id = episode.id` while that column is
   `NOT NULL REFERENCES memories(id)`.

Bi-temporal bookkeeping also lives on `memory_relationships`
(`valid_from`/`valid_to`/`transaction_time`/`is_active`) and `memory_temporal_states`
(trigger `close_previous_memory_state`).

## Retrieval — several diverged stacks, one is the real one ✅/⚠️

Live path: `GET /v1/memories?q=` (`routes/memories/index.js:307`) →
`handleSearchEnhanced` (`handlers/search-handler-enhanced.js:120`) → **one of three**
strategies chosen by merged config:

1. **SearchOrchestrator** (`src/lib/retrieval/search-orchestrator.js:76`) — the
   **default** whenever `EMBEDDING_PROVIDER !== 'mock'`. Stages: intent → temporal
   normalize → query expansion → hybrid execute → hierarchical → classification
   routing → rerank → community context.
2. **RetrievalPipeline** (`src/lib/retrieval/retrieval-pipeline.js:151`) — the doc's
   "Stage 1-6 + CRAG" pipeline; only when `ENABLE_ADVANCED_RETRIEVAL` is on **and**
   the orchestrator is off. ⚠️ Constructed **without llm/db**, so its expander/CRAG
   validator fall back to **mock** and fact-rerank is skipped → effectively dormant.
3. **Standard** (`lib/services/search-service.js` direct).

Candidate generation + merge is SQL in `lib/services/search-service.js hybridSearch()`
(~`:381-599`): a CTE `UNION ALL`s a pgvector cosine branch (weight 0.7) with a
`ts_rank` FTS branch (weight 0.3), `SUM`s per id (`HAVING combined >= threshold`),
then re-ranks with a multi-factor `RelevanceScorer`. **This is weighted-sum fusion,
not RRF.** Optional graph expansion (graph seeds → re-fetch → `HybridScorer` re-rank)
runs after.

Two gotchas to internalize:
- ⚠️ **"Hybrid" = three incomparable algorithms** (weighted-sum on `GET /memories`;
  true RRF k=60 on `POST /memories/search/hybrid`, `lib/search/hybrid-search-rrf.js:54`;
  cross-modal RRF on `/search`, `lib/search/unified-search-service.js`). On `/search`,
  `?pipeline=` only affects `limit`/`threshold`.
- ✅ The "documented"/SOLID `src/services/SearchService.js` (45 KB, 7-factor scorer,
  `TemporalSearchAdapter`) is wired into `plugins/search.js` but **no route calls it**
  — effectively dead.
- ✅ Citations are a **separate deterministic system**: `CitationService.getCitations`
  walks an episode chain via recursive CTE with `0.9^hop` decay; the main search
  pipeline never attaches citations. (See KNOWN_GAPS for the `searchWithCitations`
  authz bypass.)

## Background "science" (Python `trix-workers`) — off by default ✅

The Node clustering job only writes a `pending` row; the actual algorithms live in
`trix-workers/src/trixdb_workers/` (`decay.py`, `clustering_pending.py`,
`community_detection.py`): adaptive (pin-aware) decay, HDBSCAN clustering, Louvain
communities. The `ml-workers` service is `profiles:`-gated in `docker-compose.yml`,
so by default user-triggered clustering sits pending forever and
`clusters`/`memory_clusters`/communities are never written. See KNOWN_GAPS #11–#14
for the decay-implementation split and the pin-unaware default.

## Component → file map

| Component | File:line | Responsibility |
|---|---|---|
| Public ingest route | `trix-api/src/routes/memories/index.js:90` | `POST /memories`; quota/budget guards; dispatch |
| Core ingest + fan-out | `trix-api/src/routes/memories/handlers/content-handlers.js:32` | The real write path (batchInsert + job fan-out) |
| Split strategy | `trix-api/src/lib/text-splitter.js`, `lib/content-detector.js` | Chunk content → separate `memories` rows |
| Enrichment router (API) | `trix-api/src/lib/memory-router/index.js:37` | Builds enrichment pipeline; always forces embedding+entities+relations |
| Embeddings (API) | `trix-api/src/lib/embeddings.js` | Multi-provider + circuit-breaker; **truncates to 8000 chars** (`:599`) |
| Queue client | `trix-api/src/lib/bullmq-queue.js`, `lib/queue-defaults.js` | `enqueue*` + queue-name enum (producer side) |
| Embedding worker | `trix-workers-node/src/processors/embedding.js:334` | Vector gen; re-chunk >8000 → `memory_chunks` |
| Enrichment worker | `trix-workers-node/src/processors/enrichment-router.js:96` | Routes to `modules/registry.js`; PG NOTIFY lifecycle |
| Fact extraction worker | `trix-workers-node/src/processors/fact-extraction.js:524` | 3 LLM calls → facts/entities/relationships |
| Consolidation (live decay) | `trix-workers-node/src/processors/consolidation.js:650` | 6h Ebbinghaus decay/dedup/auto-relate |
| Graph sync worker | `trix-workers-node/src/processors/graph-sync.js:87` | MERGE Memory/Relationship nodes |
| Episode tier (ADR-031) | `trix-api/src/services/EpisodeService.js:103` | Bi-temporal episodes; graph-node creation stubbed |
| Live search handler | `trix-api/src/routes/memories/handlers/search-handler-enhanced.js:120` | Config merge → orchestrator/pipeline/standard |
| Hybrid SQL (live) | `trix-api/src/lib/services/search-service.js:381` | Weighted-sum hybrid candidate gen |
| RRF hybrid (alt endpoint) | `trix-api/src/lib/search/hybrid-search-rrf.js:54` | True RRF k=60 |
| Cross-modal search | `trix-api/src/lib/search/unified-search-service.js` | RRF over memories/audio/video |
| Citations | `trix-api/src/services/CitationService.js` | Episode citation chains (`0.9^hop`) |
| Legacy Python science | `trix-workers/src/trixdb_workers/` | Adaptive decay, HDBSCAN, Louvain — off by default |

## Key data stores

| Store | Kind | Role |
|---|---|---|
| `memories` | Postgres table | One row per chunk; `embedding vector(1536)` (HNSW cosine); `GENERATED search_vector` tsvector for instant FTS; `embedding_status` lifecycle. |
| `memory_chunks` | Postgres table | Sub-chunks of long text (>8000 chars), each with its own embedding. |
| `memory_relationships` | Postgres table | Typed links incl. `child_of`; bi-temporal columns. |
| `memory_facts` / `memory_entities` / `entity_relationships` | Postgres tables | Extracted knowledge (two writer paths — see above). |
| `enrichments` | Postgres table | One row per (memory, enrichment_type); `UNIQUE`, status-tracked. |
| `consolidation_runs` / `clustering_runs` | Postgres tables | Background-job bookkeeping. |
| `embedding` / `enrichment` / `graph-sync-memory` / `consolidation` / … | Redis (BullMQ) queues | The deferred-work fabric. |
| Graph DB | Memgraph (default) / FalkorDB / Neo4j | Node/relationship mirror for graph traversal. |
| `halfvec(1536)` column | Postgres (pgvector) | ⚠️ **Dead** — backfilled once (ADR-002), never written/queried for new rows. |

## See also
- `trix-api/docs/ARCHITECTURE.md` (component map), `trix-api/docs/TEMPORAL_KNOWLEDGE_GRAPH.md`,
  `trix-api/docs/SEMANTIC_CHUNKING.md`, `trix-api/src/lib/graph/README.md`.
- `trix-research/research/memory/` for the algorithm rationale (canonical).
- **[KNOWN_GAPS_PRELAUNCH.md](./KNOWN_GAPS_PRELAUNCH.md)** for what's broken/dead/mock here.

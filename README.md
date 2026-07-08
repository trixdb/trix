# Trix

**Storage of the Mind** — a universal memory layer for AI agents and humans.

Trix is a multi-tenant memory platform with vector embeddings, hybrid semantic +
full-text search, relationship/graph mapping, clustering, and MCP (Model Context
Protocol) integration.

> **New here? Start with [docs/architecture/](./docs/architecture/README.md)** — a
> cross-cutting map of the **memory pipeline** and **agentic pipeline**, how the
> repos divide responsibility, a glossary of overloaded terms, and a
> [register of what's broken/dead/unwired pre-launch](./docs/architecture/KNOWN_GAPS_PRELAUNCH.md).
> For the submodule inventory and day-to-day commands see
> [SUBMODULES.md](./SUBMODULES.md).

## Benchmarks & competitive standing

Trix is evaluated on **LoCoMo** (long-term conversational memory). On the
**LLM-judge** metric the field reports, Trix currently scores **76.0%**
(adversarial-excluded, full 10-conversation run) — measured through **Mem0's own
published judge**, so it is a true like-for-like:

| System | LLM-judge (adv-excl) |
|--------|:--------------------:|
| **Trix** | **76.0%** |
| Letta | 74.0% |
| Mem0-Graph | 68.4% |
| Mem0 | 66.9% |

- **Current standing, trends, per-category scores, and the full competitor
  table:** [`trix-research/benchmarks/locomo/LEADERBOARD.md`](./trix-research/benchmarks/locomo/LEADERBOARD.md)
- **Raw run artifacts:** `trix-research/benchmarks/locomo/dist/locomo/results/runs/<timestamp>/`
- **How to run / re-score:** [`benchmarks/locomo/CLAUDE.md`](./trix-research/benchmarks/locomo/CLAUDE.md)
- Benchmark-correctness & parity tracking: EPIC
  [trix-research#45](https://github.com/trixdb/trix-research/issues/45).

## Components

All subprojects are git submodules under the `trixdb` org. See
[CLAUDE.md](./CLAUDE.md) and [SUBMODULES.md](./SUBMODULES.md) for the authoritative
list; the core runtime pieces are:

| Component | Description | Stack |
|-----------|-------------|-------|
| [`trix-api`](./trix-api) | Backend API — memory, search, agents, chat, billing | Node 22, Fastify, PostgreSQL + pgvector, Redis |
| [`trix-mcp`](./trix-mcp) | MCP server for Claude — 280+ tools | Node/TypeScript |
| [`trix-workers-node`](./trix-workers-node) | I/O + coordination workers (transcription, embeddings, integrations, billing) | Node 22, BullMQ |
| [`trix-workers`](./trix-workers) | ML workers — HDBSCAN clustering, decay, consolidation, anomaly, temporal | Python 3.12, taskiq, scikit-learn |
| [`trix-cli-go`](./trix-cli-go) | Command-line interface | Go 1.23, Cobra |
| [`trix-sdk-python`](./trix-sdk-python) · [`trix-sdk-typescript`](./trix-sdk-typescript) · [`trix-sdk-csharp`](./trix-sdk-csharp) | Client SDKs | Python / TS / .NET |
| [`trix-landing`](./trix-landing) | Landing page + app dashboard (live at trixdb.com) | SvelteKit |
| [`trix-research`](./trix-research) | Research, benchmarks (LoCoMo), ADRs | — |

Additional services (bots, daemon, settings, admin CLI, visual embeddings, web
app, SDK example repos) are listed in [CLAUDE.md](./CLAUDE.md).

## Features

- **Unified memory API** — one ingest path for all content types
- **Hybrid search** — pgvector semantic + full-text, RRF fusion, re-ranking
- **Relationships & graph** — typed relationships, multi-hop traversal, temporal
  (bi-temporal) knowledge graph
- **Clustering & communities** — HDBSCAN clustering, community detection,
  multi-scale, community-boosted retrieval
- **Advanced memory** — adaptive decay, consolidation, Hebbian co-activation,
  replay, anomaly detection
- **MCP integration** — 280+ tools for AI-agent use
- **Agents & bots** — heartbeats, crews, workflows, guardrails, budget enforcement
- **Audio transcription**, **media generation**, **integrations** (GitHub,
  calendar, webhooks)
- **Multi-tenant** — accounts, spaces, fine-grained permissions, credit billing

## Development

Each component has its own README and CLAUDE.md with setup details.

### Prerequisites

- Node.js 22+ (`trix-api`, `trix-workers-node`, `trix-mcp`)
- Python 3.12+ (`trix-workers`)
- Go 1.23+ (`trix-cli-go`)
- PostgreSQL 15+ with pgvector, Redis/Valkey

### Running with Docker

```bash
cd trix-api
docker compose up -d postgres valkey minio minio-init memgraph
npm run dev
```

See [`trix-api/CLAUDE.md`](./trix-api/CLAUDE.md) for the full local-stack and
worker commands.

## License

MIT (API), Proprietary (Workers)

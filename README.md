# TrixDB

**Storage of the Mind** - A universal memory layer for AI agents and humans.

TrixDB is a multi-tenant memory management system with vector embeddings, semantic search, relationship mapping, and MCP (Model Context Protocol) integration.

> **New here? Start with [docs/architecture/](./docs/architecture/README.md)** — a
> cross-cutting map of the **memory pipeline** and **agentic pipeline**, how the
> repos divide responsibility, a glossary of overloaded terms, and a
> [register of what's broken/dead/unwired pre-launch](./docs/architecture/KNOWN_GAPS_PRELAUNCH.md).
>
> ⚠️ The "Repository Structure" and "Features" sections below are **stale** (old
> `trixdb-*` directory names, "19+ MCP tools" — actual 280+, missing several
> components). Trust `docs/architecture/` and `SUBMODULES.md` over this file until
> it is refreshed.

## Repository Structure

```
trix/
├── trixdb/               # Core API server (Node.js/Fastify)
├── trixdb-cli-go/        # Command-line interface (Go)
├── trixdb-landing/       # Marketing landing page (Vite)
├── trixdb-workers/       # Background workers (Python)
└── trixdb-workers-node/  # Background workers (Node.js/BullMQ)
```

> **Working with submodules?** See [SUBMODULES.md](./SUBMODULES.md) for the full
> inventory, day-to-day commands (clone, bump, sync), the special-case fork
> setup for `shannon`, and known quirks (e.g. `trix-landing` is a legacy
> gitlink, `.playwright-cli/` should be globally ignored).

## Components

### [trixdb](./trixdb)

The core API server built with Fastify. Handles memory storage, semantic search, relationship mapping, and MCP integration.

**Stack:** Node.js 22+, Fastify, PostgreSQL + pgvector, Redis

**Quick Start:**

```bash
cd trixdb
npm install
cp .env.example .env
npm run dev
```

### [trixdb-cli-go](./trixdb-cli-go)

Command-line interface for interacting with TrixDB.

**Stack:** Go 1.23, Cobra, Charmbracelet

**Quick Start:**

```bash
cd trixdb-cli-go
make build
./trixdb --help
```

### [trixdb-workers](./trixdb-workers)

Python-based background workers for ML tasks like clustering and memory decay.

**Stack:** Python 3.12+, taskiq, scikit-learn, HDBSCAN

### [trixdb-workers-node](./trixdb-workers-node)

Node.js background workers for transcription, embedding generation, and bulk operations.

**Stack:** Node.js 22+, BullMQ, OpenAI

### [trixdb-landing](./trixdb-landing)

Marketing landing page.

**Stack:** Vite, Vanilla JS

## Features

- **Unified API** - Single `/memories` endpoint for all content types
- **Semantic Search** - Find memories by meaning using vector embeddings
- **Relationship Mapping** - 14 relationship types to connect memories
- **MCP Integration** - 19+ tools for AI agent integration
- **Audio Transcription** - Auto-transcribe with Whisper
- **Graph Traversal** - Multi-hop exploration of memory relationships
- **Multi-tenant** - Accounts, spaces, and fine-grained permissions

## Development

Each component has its own README with detailed setup instructions. See the respective directories for more information.

### Prerequisites

- Node.js 22+ (for trixdb and trixdb-workers-node)
- Go 1.23+ (for trixdb-cli-go)
- Python 3.12+ (for trixdb-workers)
- PostgreSQL 15+ with pgvector
- Redis/Valkey

### Running with Docker

```bash
cd trixdb
docker-compose up
```

This starts PostgreSQL, Valkey, MinIO, and the API server.

## License

MIT (API), Proprietary (Workers)

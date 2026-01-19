# TrixDB

**Storage of the Mind** - A universal memory layer for AI agents and humans.

TrixDB is a multi-tenant memory management system with vector embeddings, semantic search, relationship mapping, and MCP (Model Context Protocol) integration.

## Repository Structure

```
trix/
├── trixdb/               # Core API server (Node.js/Fastify)
├── trixdb-cli-go/        # Command-line interface (Go)
├── trixdb-landing/       # Marketing landing page (Vite)
├── trixdb-workers/       # Background workers (Python)
└── trixdb-workers-node/  # Background workers (Node.js/BullMQ)
```

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

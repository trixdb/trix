# Cross-Component Integration Tests

This directory contains integration tests that verify communication between Trix components.

## Overview

These tests validate the critical paths where multiple components interact:

1. **API ↔ Workers** - Job enqueue/processing via BullMQ
2. **MCP ↔ API** - HTTP client communication
3. **Workers ↔ Database** - Background job database operations

## Test Setup Requirements

### Prerequisites

1. **Docker** - Required for testcontainers (PostgreSQL, Redis)
2. **Node.js 22+** - Required by trix-workers-node

### Environment Variables

Tests use testcontainers by default. For local development against existing services:

```bash
# PostgreSQL
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5433
export POSTGRES_USER=trix
export POSTGRES_PASSWORD=trix_secret
export POSTGRES_DB=trix

# Redis (Valkey)
export REDIS_HOST=localhost
export REDIS_PORT=6381
```

### Running Tests

```bash
# From monorepo root
npm run test:cross-component

# Or run directly with vitest
npx vitest run tests/cross-component/
```

## Test Files

| File | Description |
|------|-------------|
| `api-worker-integration.test.js` | Tests BullMQ job flow between API and Workers |
| `mcp-api-integration.test.js` | Tests MCP server HTTP communication with API |
| `worker-database-integration.test.js` | Tests worker database operations |

## Architecture

```
┌─────────┐     HTTP      ┌─────────┐
│   MCP   │──────────────▶│   API   │
└─────────┘               └────┬────┘
                               │ BullMQ
                               ▼
┌─────────┐  PostgreSQL   ┌─────────┐
│   DB    │◀──────────────│ Workers │
└─────────┘               └─────────┘
```

## Adding New Tests

1. Follow existing test patterns
2. Use testcontainers for isolation
3. Clean up resources in afterAll/afterEach
4. Document any new prerequisites

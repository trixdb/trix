# Running Trix Locally

Complete guide to running the full Trix stack on your machine using Docker.

## Prerequisites

- **Docker** (with Compose v2)
- **Node.js 20+** and **Bun** (for trix-app frontend)
- **Railway CLI** (optional, for pulling API keys): `npm i -g @railway/cli`

## Quick Start

```bash
# 1. First-time setup — generates .env.local with API keys from Railway
./scripts/local-setup.sh --railway

# 2. Start the frontend dev server
cd trix-app && bun dev
```

That's it. The setup script handles Docker, migrations, subscriptions, and health checks.

## What Gets Started

### Infrastructure (Docker)

| Service | Container | Host Port | Internal Port |
|---------|-----------|-----------|---------------|
| PostgreSQL + pgvector | trix-local-postgres | 15432 | 5432 |
| Valkey (Redis) | trix-local-valkey | 16379 | 6379 |
| MinIO (S3) | trix-local-minio | 19000 / 19001 | 9000 / 9001 |
| Memgraph | trix-local-memgraph | 17687 / 17444 | 7687 / 7444 |

### Application Services (Docker)

| Service | Container | Host Port | Description |
|---------|-----------|-----------|-------------|
| API | trix-local-api | 13737 | Fastify backend, runs migrations on startup |
| Workers | trix-local-workers-node | 19091 | BullMQ job processors |
| Bots | trix-local-bots | 13739 | Agent/bot runtime |

### Frontend (local, not Docker)

| Service | Port | Command |
|---------|------|---------|
| trix-app (Retrix) | 5173 | `cd trix-app && bun dev` |

The Vite dev server proxies `/auth`, `/v1`, `/ws` to the local API at `localhost:13737`.

## Step-by-Step Setup

### 1. Generate `.env.local`

```bash
# Option A: Pull keys from Railway (recommended)
./scripts/local-setup.sh --railway

# Option B: Manual setup
cp .env.local.example .env.local
# Edit .env.local and fill in API keys
```

### 2. Required API Keys

The following keys are needed for full functionality:

| Key | Purpose | Required |
|-----|---------|----------|
| `ANTHROPIC_API_KEY` | LLM (medium/complex queries) | Yes |
| `OPENAI_API_KEY` | Embeddings | Yes |
| `GOOGLE_API_KEY` | LLM (simple queries via Gemini) | Yes |
| `MISTRAL_API_KEY` | Alternative LLM | No |
| `ASSEMBLYAI_API_KEY` | Audio transcription | No |
| `COHERE_API_KEY` | Search reranking | No |

The setup script with `--railway` pulls all of these automatically.

### 3. Start Services

```bash
# Start everything (infra + API + workers + bots)
docker compose up -d

# Or start only infrastructure (databases, Redis, MinIO)
docker compose up -d infra

# Include optional ML workers
docker compose --profile ml up -d
```

### 4. Start the Frontend

```bash
cd trix-app
bun install   # first time only
bun dev       # starts on http://localhost:5173
```

### 5. Create a User Account

Open http://localhost:5173 and register. The local instance has `REQUIRE_INVITE_CODE=false` so no invite code is needed.

### 6. Set Up Bots (if needed)

After registering, create an API key for the bot service:

```bash
# Login to get a session token
TOKEN=$(curl -s http://localhost:13737/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"your@email.com","password":"yourpassword"}' | jq -r .token)

# Create an API key
API_KEY=$(curl -s http://localhost:13737/v1/api-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"local-bots"}' | jq -r .key)

# Add to .env.local
echo "TRIX_API_KEY=$API_KEY" >> .env.local

# Restart bots to pick up the key
docker compose up -d bots
```

## Common Operations

```bash
# View logs
docker compose logs -f api          # API logs
docker compose logs -f workers      # Worker logs
docker compose logs -f bots         # Bot logs

# Restart a service (picks up new env vars)
docker compose up -d api

# Stop everything
docker compose down

# Stop and delete all data
docker compose down -v

# Check service health
docker ps --filter "name=trix-local" --format "table {{.Names}}\t{{.Status}}"

# Connect to local PostgreSQL
psql -h localhost -p 15432 -U trix -d trix

# Connect to local Valkey/Redis
redis-cli -p 16379

# Open MinIO console
open http://localhost:19001  # user: trix / pass: trixsecret
```

## Port Scheme

All host ports use the `1xxxx` pattern to avoid clashes with locally running services. Ports can be overridden in `.env.local`:

```bash
TRIX_PORT_POSTGRES=15432
TRIX_PORT_VALKEY=16379
TRIX_PORT_MINIO_API=19000
TRIX_PORT_MINIO_UI=19001
TRIX_PORT_MEMGRAPH=17687
TRIX_PORT_API=13737
TRIX_PORT_WORKERS=19091
TRIX_PORT_BOTS=13739
```

## Container Naming

All containers use the `trix-local-*` prefix. This avoids name clashes with per-submodule `docker-compose.yml` files (which use `trix-*`). Both can coexist on the same machine.

## Architecture Notes

- **API** runs with `NODE_ENV=production` because the Docker image prunes dev dependencies. All required production secrets (cookie secret, webhook secrets, etc.) must be provided.
- **API** runs migrations automatically on startup (`AUTO_MIGRATE=true`).
- **Workers** connect to infrastructure via Docker internal hostnames (`postgres`, `valkey`, etc.), not `localhost`.
- **Bots** needs `TRIX_ALLOW_INSECURE=true` to connect to the API over HTTP (not HTTPS).
- **trix-app** uses Vite's dev proxy to route API requests. `VITE_API_URL` must be empty so requests go through the proxy instead of making direct cross-origin calls.
- The setup script auto-seeds a **pro subscription with 999k credits** so AI chat works immediately without billing setup.

## Troubleshooting

### API won't start
Check logs: `docker logs trix-local-api`. Common causes:
- Missing `COOKIE_SECRET` or `ASSEMBLYAI_WEBHOOK_SECRET` (run with `--railway` to pull them)
- Weak DB password (must pass security validator in production mode)

### AI chat returns 402
The user needs a subscription. The setup script seeds this automatically. If you reset the DB, re-run:
```bash
./scripts/local-setup.sh
```

### AI chat returns 503
A required LLM provider API key is missing. The complexity-aware routing sends simple queries to Gemini even when `LLM_PROVIDER=anthropic`. Ensure `GOOGLE_API_KEY` is set.

### trix-app shows CORS errors
Make sure `VITE_API_URL` is empty in `trix-app/.env`. The Vite dev proxy handles routing — direct API URLs cause cross-origin issues.

### Container name conflicts
If you see "container name already in use", old containers from submodule compose files may conflict. Remove them: `docker rm -f <conflicting-container>`.

### Sync not pulling data
After an API restart, browser sessions expire. Log out and back in. The sync engine uses POST (not GET) — any `GET /v1/sync/*` 404s in the console are harmless.

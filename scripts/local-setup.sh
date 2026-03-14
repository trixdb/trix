#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Trix Local Development Setup
# =============================================================================
# Generates .env.local from .env.local.example, optionally pulling API keys
# from Railway. Then validates docker-compose and starts infrastructure.
#
# Usage:
#   ./scripts/local-setup.sh              # Interactive setup
#   ./scripts/local-setup.sh --railway    # Pull API keys from Railway
#   ./scripts/local-setup.sh --skip-start # Generate .env.local only
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.local"
ENV_EXAMPLE="$ROOT_DIR/.env.local.example"

PULL_RAILWAY=false
SKIP_START=false

for arg in "$@"; do
  case $arg in
    --railway) PULL_RAILWAY=true ;;
    --skip-start) SKIP_START=true ;;
    --help|-h)
      echo "Usage: $0 [--railway] [--skip-start]"
      echo ""
      echo "  --railway     Pull API keys from Railway (requires 'railway' CLI)"
      echo "  --skip-start  Only generate .env.local, don't start Docker"
      exit 0
      ;;
  esac
done

echo "=== Trix Local Development Setup ==="
echo ""

# ---- Generate .env.local ----
if [ -f "$ENV_FILE" ]; then
  echo "[ok] .env.local already exists"
  echo "     Delete it and re-run to regenerate, or edit directly."
  echo ""
else
  if [ ! -f "$ENV_EXAMPLE" ]; then
    echo "[error] .env.local.example not found at $ENV_EXAMPLE"
    exit 1
  fi
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  echo "[ok] Created .env.local from .env.local.example"
fi

# ---- Pull API keys from Railway ----
if $PULL_RAILWAY; then
  echo ""
  echo "--- Pulling API keys from Railway ---"

  if ! command -v railway &>/dev/null; then
    echo "[error] Railway CLI not found. Install: https://docs.railway.app/guides/cli"
    exit 1
  fi

  # Check if linked to a project
  if ! railway status &>/dev/null 2>&1; then
    echo "[info] Railway not linked to a project. Attempting to link..."
    echo "       You may need to run 'railway link' manually first."
    railway link || {
      echo "[error] Failed to link Railway project. Run 'railway link' manually."
      exit 1
    }
  fi

  echo "[info] Fetching variables from Railway trix-api service..."

  # Try to get variables from the API service
  RAILWAY_VARS=$(railway variables --service trix-api --json 2>/dev/null || echo "{}")

  if [ "$RAILWAY_VARS" = "{}" ]; then
    echo "[warn] Could not fetch Railway variables. Trying without --service flag..."
    RAILWAY_VARS=$(railway variables --json 2>/dev/null || echo "{}")
  fi

  if [ "$RAILWAY_VARS" != "{}" ]; then
    # Extract API keys we care about
    extract_var() {
      echo "$RAILWAY_VARS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$1',''))" 2>/dev/null || echo ""
    }

    KEYS_UPDATED=0
    for KEY in ANTHROPIC_API_KEY OPENAI_API_KEY ASSEMBLYAI_API_KEY COHERE_API_KEY JWT_SECRET ASSEMBLYAI_WEBHOOK_SECRET STATUS_INTERNAL_KEY INTEGRATION_ENCRYPTION_KEY COOKIE_SECRET; do
      VALUE=$(extract_var "$KEY")
      if [ -n "$VALUE" ]; then
        # Only update if currently blank in .env.local
        if grep -q "^${KEY}=$" "$ENV_FILE" 2>/dev/null; then
          sed -i "s|^${KEY}=$|${KEY}=${VALUE}|" "$ENV_FILE"
          echo "[ok] Set $KEY from Railway"
          KEYS_UPDATED=$((KEYS_UPDATED + 1))
        elif grep -q "^# ${KEY}=" "$ENV_FILE" 2>/dev/null; then
          sed -i "s|^# ${KEY}=.*|${KEY}=${VALUE}|" "$ENV_FILE"
          echo "[ok] Set $KEY from Railway"
          KEYS_UPDATED=$((KEYS_UPDATED + 1))
        else
          echo "[skip] $KEY already has a value"
        fi
      fi
    done
    echo "[ok] Updated $KEYS_UPDATED API keys from Railway"
  else
    echo "[warn] No Railway variables found. Fill in API keys manually in .env.local"
  fi
fi

echo ""

# ---- Validate docker-compose ----
echo "--- Validating docker-compose.yml ---"
cd "$ROOT_DIR"

if ! docker compose config --quiet 2>/dev/null; then
  echo "[error] docker-compose.yml validation failed:"
  docker compose config 2>&1 | tail -5
  exit 1
fi
echo "[ok] docker-compose.yml is valid"

# ---- Check for required API keys ----
echo ""
echo "--- Checking API keys ---"

check_key() {
  local key=$1
  local label=$2
  local required=$3
  local value
  value=$(grep "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2-)
  if [ -z "$value" ]; then
    if [ "$required" = "true" ]; then
      echo "[MISSING] $label ($key) — required for core functionality"
    else
      echo "[skip]    $label ($key) — optional"
    fi
    return 1
  else
    echo "[ok]      $label"
    return 0
  fi
}

MISSING=0
check_key "ANTHROPIC_API_KEY" "Anthropic (LLM)" "true" || MISSING=$((MISSING + 1))
check_key "OPENAI_API_KEY" "OpenAI (embeddings)" "true" || MISSING=$((MISSING + 1))
check_key "ASSEMBLYAI_API_KEY" "AssemblyAI (transcription)" "false" || true
check_key "COHERE_API_KEY" "Cohere (reranking)" "false" || true

if [ $MISSING -gt 0 ]; then
  echo ""
  echo "[warn] $MISSING required key(s) missing. Edit .env.local or re-run with --railway"
  echo "       Services will start but LLM/embedding features won't work."
  echo "       Tip: set EMBEDDING_PROVIDER=mock in .env.local to skip embeddings."
fi

# ---- Start services ----
if $SKIP_START; then
  echo ""
  echo "=== Setup complete (--skip-start) ==="
  echo "Run 'docker compose up -d' to start services."
  exit 0
fi

echo ""
echo "--- Starting Trix stack ---"
docker compose up -d

echo ""
echo "--- Waiting for services to be healthy ---"

wait_healthy() {
  local container=$1
  local timeout=${2:-60}
  local elapsed=0
  while [ $elapsed -lt $timeout ]; do
    local status
    status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "missing")
    case $status in
      healthy) echo "[ok] $container is healthy"; return 0 ;;
      unhealthy) echo "[FAIL] $container is unhealthy"; return 1 ;;
      missing) echo "[FAIL] $container not found"; return 1 ;;
    esac
    sleep 2
    elapsed=$((elapsed + 2))
  done
  echo "[FAIL] $container timed out after ${timeout}s"
  return 1
}

FAILED=0
wait_healthy trix-local-postgres 30 || FAILED=$((FAILED + 1))
wait_healthy trix-local-valkey 15 || FAILED=$((FAILED + 1))
wait_healthy trix-local-minio 30 || FAILED=$((FAILED + 1))
wait_healthy trix-local-memgraph 30 || FAILED=$((FAILED + 1))
wait_healthy trix-local-api 60 || FAILED=$((FAILED + 1))
wait_healthy trix-local-workers-node 60 || FAILED=$((FAILED + 1))
wait_healthy trix-local-bots 60 || FAILED=$((FAILED + 1))

echo ""
if [ $FAILED -gt 0 ]; then
  echo "=== $FAILED service(s) failed to start ==="
  echo "Check logs: docker compose logs <service-name>"
  exit 1
fi

echo "=== Trix is running locally ==="
echo ""
echo "  API:            http://localhost:${TRIX_PORT_API:-13737}"
echo "  MinIO Console:  http://localhost:${TRIX_PORT_MINIO_UI:-19001}"
echo "  PostgreSQL:     localhost:${TRIX_PORT_POSTGRES:-15432}"
echo "  Valkey/Redis:   localhost:${TRIX_PORT_VALKEY:-16379}"
echo "  Memgraph:       localhost:${TRIX_PORT_MEMGRAPH:-17687}"
echo ""
echo "  Logs:           docker compose logs -f"
echo "  Stop:           docker compose down"
echo "  Reset data:     docker compose down -v"
echo ""

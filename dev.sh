#!/usr/bin/env bash
# Start Trix dev environment: infra + API + frontend
# Usage: ./dev.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}Starting infrastructure...${NC}"
docker compose up -d postgres valkey minio minio-init memgraph 2>&1 | tail -3

# Wait for postgres
echo -e "${CYAN}Waiting for Postgres...${NC}"
until docker exec trix-local-postgres pg_isready -U trix -d trix -q 2>/dev/null; do
  sleep 1
done
echo -e "${GREEN}Postgres ready${NC}"

# Kill stale processes on our ports
for port in 3737 5173; do
  pid=$(lsof -ti :$port 2>/dev/null || true)
  if [ -n "$pid" ]; then
    echo "Killing stale process on :$port (pid $pid)"
    kill -9 $pid 2>/dev/null || true
    sleep 1
  fi
done

# Start API (host, with file watch)
echo -e "${CYAN}Starting API on :3737...${NC}"
cd "$SCRIPT_DIR/trix-api"
node --env-file=.env --watch src/server.js &
API_PID=$!

# Wait for API
sleep 3
until curl -sf http://localhost:3737/health >/dev/null 2>&1; do
  sleep 2
done
echo -e "${GREEN}API ready on :3737${NC}"

# Start frontend
echo -e "${CYAN}Starting frontend on :5173...${NC}"
cd "$SCRIPT_DIR/trix-app"
bun run dev &
APP_PID=$!

sleep 3
echo ""
echo -e "${GREEN}=== Trix dev environment ready ===${NC}"
echo -e "  API:      http://localhost:3737"
echo -e "  Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop all"

# Cleanup on exit
trap "kill $API_PID $APP_PID 2>/dev/null; echo 'Stopped'" EXIT INT TERM
wait

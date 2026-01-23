#!/bin/bash
#
# Safe Docker Compose Wrapper
#
# Validates passwords before running docker-compose to prevent
# accidental deployment with insecure credentials.
#
# Usage:
#   ./scripts/docker-compose-safe.sh up -d
#   ./scripts/docker-compose-safe.sh --skip-validation up -d
#
# This script:
# 1. Validates all database and service passwords
# 2. Rejects placeholder or weak passwords
# 3. Only proceeds with docker-compose if validation passes

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check for skip flag
SKIP_VALIDATION=false
DOCKER_COMPOSE_ARGS=()

for arg in "$@"; do
  if [[ "$arg" == "--skip-validation" ]]; then
    SKIP_VALIDATION=true
  else
    DOCKER_COMPOSE_ARGS+=("$arg")
  fi
done

# Run validation unless skipped
if [[ "$SKIP_VALIDATION" == "false" ]]; then
  echo -e "${GREEN}Running password security validation...${NC}"
  echo ""

  if ! "$SCRIPT_DIR/validate-docker-passwords.sh"; then
    echo ""
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}SECURITY CHECK FAILED${NC}"
    echo -e "${RED}========================================${NC}"
    echo ""
    echo "Fix the password issues above before starting containers."
    echo ""
    echo "Quick fix options:"
    echo "1. Create a .env file with secure passwords:"
    echo "   cp trix-api/.env.example .env"
    echo "   # Edit .env and set strong passwords"
    echo ""
    echo "2. Generate secure passwords:"
    echo "   openssl rand -base64 32"
    echo ""
    echo "To bypass this check (NOT RECOMMENDED for production):"
    echo "   $0 --skip-validation ${DOCKER_COMPOSE_ARGS[*]}"
    echo ""
    exit 1
  fi

  echo ""
  echo -e "${GREEN}Password validation passed!${NC}"
  echo ""
else
  echo -e "${YELLOW}⚠ Password validation skipped!${NC}"
  echo -e "${YELLOW}  This is NOT recommended for production deployments.${NC}"
  echo ""
fi

# Run docker-compose with the provided arguments
cd "$ROOT_DIR"
exec docker compose "${DOCKER_COMPOSE_ARGS[@]}"

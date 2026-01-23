#!/bin/bash
#
# Docker Password Validation Script
#
# Validates that database and service passwords meet security requirements
# before starting docker-compose. Prevents accidental deployment with
# weak or default passwords.
#
# Usage:
#   ./scripts/validate-docker-passwords.sh [--env-file .env] [--strict]
#
# Options:
#   --env-file FILE  Path to .env file to validate (default: .env)
#   --strict         Exit with error on warnings (default: only errors)
#
# Exit codes:
#   0 - All validations passed
#   1 - Critical validation failed (insecure password)
#   2 - Script error (missing dependencies, etc.)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MIN_PASSWORD_LENGTH=12
STRICT_MODE=false
ENV_FILE=""

# Parse command-line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --env-file=*)
      ENV_FILE="${1#*=}"
      shift
      ;;
    --strict)
      STRICT_MODE=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [--env-file FILE] [--strict]"
      echo ""
      echo "Validates Docker passwords meet security requirements."
      echo ""
      echo "Options:"
      echo "  --env-file FILE  Path to .env file (default: auto-detect)"
      echo "  --strict         Exit with error on warnings"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 2
      ;;
  esac
done

# Placeholder passwords that must not be used
PLACEHOLDER_PASSWORDS=(
  "CHANGE_ME_TO_STRONG_PASSWORD_MIN_12_CHARS"
  "CHANGE_ME"
  "changeme"
  "placeholder"
  "your_password_here"
  "your-password-here"
  "replace_me"
  "replace-me"
  "TODO"
  "FIXME"
  "xxx"
  "XXX"
)

# Common weak passwords to reject
WEAK_PASSWORDS=(
  "password"
  "password123"
  "password1234"
  "admin"
  "admin123"
  "root"
  "root123"
  "trix"
  "trix123"
  "trix_secret"
  "postgres"
  "postgres123"
  "minioadmin"
  "minioadmin123"
  "secret"
  "secret123"
  "123456"
  "12345678"
  "123456789"
  "1234567890"
  "qwerty"
  "letmein"
  "welcome"
  "monkey"
  "dragon"
  "master"
  "test"
  "test123"
  "development"
  "production"
)

# Password variables to validate
PASSWORD_VARS=(
  "POSTGRES_PASSWORD"
  "MINIO_ROOT_PASSWORD"
  "REDIS_PASSWORD"
)

# Tracking validation results
ERRORS=0
WARNINGS=0

log_info() {
  echo -e "${BLUE}i${NC} $1"
}

log_success() {
  echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
  ((WARNINGS++))
}

log_error() {
  echo -e "${RED}✗${NC} $1"
  ((ERRORS++))
}

# Check if a password is a placeholder
is_placeholder() {
  local password="$1"
  local password_lower=$(echo "$password" | tr '[:upper:]' '[:lower:]')

  for placeholder in "${PLACEHOLDER_PASSWORDS[@]}"; do
    local placeholder_lower=$(echo "$placeholder" | tr '[:upper:]' '[:lower:]')
    if [[ "$password_lower" == "$placeholder_lower" ]]; then
      return 0
    fi
    # Also check if password contains the placeholder
    if [[ "$password_lower" == *"change"*"me"* ]] || \
       [[ "$password_lower" == *"placeholder"* ]] || \
       [[ "$password_lower" == *"replace"*"me"* ]] || \
       [[ "$password_lower" == *"your"*"password"* ]]; then
      return 0
    fi
  done
  return 1
}

# Check if a password is weak
is_weak() {
  local password="$1"
  local password_lower=$(echo "$password" | tr '[:upper:]' '[:lower:]')

  for weak in "${WEAK_PASSWORDS[@]}"; do
    local weak_lower=$(echo "$weak" | tr '[:upper:]' '[:lower:]')
    if [[ "$password_lower" == "$weak_lower" ]]; then
      return 0
    fi
  done
  return 1
}

# Validate a single password
validate_password() {
  local var_name="$1"
  local password="$2"
  local source="$3"

  # Skip empty passwords for optional vars
  if [[ -z "$password" ]]; then
    if [[ "$var_name" == "REDIS_PASSWORD" ]]; then
      log_warning "$var_name is empty in $source (Redis authentication disabled)"
      return 0
    fi
    log_error "$var_name is empty in $source"
    return 1
  fi

  # Check for placeholder passwords
  if is_placeholder "$password"; then
    log_error "$var_name contains a placeholder value in $source"
    echo "       Password must be changed before running docker-compose"
    echo "       Generate a strong password with: openssl rand -base64 32"
    return 1
  fi

  # Check for weak passwords
  if is_weak "$password"; then
    log_error "$var_name is a commonly used weak password in $source"
    echo "       This password is easily guessable and must be changed"
    echo "       Generate a strong password with: openssl rand -base64 32"
    return 1
  fi

  # Check minimum length
  local length=${#password}
  if [[ $length -lt $MIN_PASSWORD_LENGTH ]]; then
    log_error "$var_name is too short ($length chars) in $source (minimum: $MIN_PASSWORD_LENGTH)"
    echo "       Generate a strong password with: openssl rand -base64 32"
    return 1
  fi

  log_success "$var_name meets security requirements ($length chars)"
  return 0
}

# Extract password from docker-compose.yml
extract_from_compose() {
  local file="$1"
  local var_name="$2"

  if [[ ! -f "$file" ]]; then
    return
  fi

  # Try to extract hardcoded value (e.g., POSTGRES_PASSWORD: trix_secret)
  local value=$(grep -E "^\s*${var_name}:\s*[^$]" "$file" 2>/dev/null | head -1 | sed -E "s/.*${var_name}:\s*['\"]?([^'\"#]*)['\"]?.*/\1/" | tr -d '[:space:]')

  # If it's an env var reference (e.g., ${POSTGRES_PASSWORD:-default}), extract the default
  if [[ -z "$value" ]]; then
    value=$(grep -E "\\\$\{${var_name}:-[^}]+\}" "$file" 2>/dev/null | head -1 | sed -E "s/.*\\\$\{${var_name}:-([^}]+)\}.*/\1/" | tr -d '[:space:]')
  fi

  echo "$value"
}

# Extract password from .env file
extract_from_env() {
  local file="$1"
  local var_name="$2"

  if [[ ! -f "$file" ]]; then
    return
  fi

  local value=$(grep -E "^${var_name}=" "$file" 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '"' | tr -d "'" | tr -d '[:space:]')
  echo "$value"
}

# Main validation
echo "============================================"
echo "Docker Password Security Validation"
echo "============================================"
echo ""

# Detect environment files
ENV_FILES=()
if [[ -n "$ENV_FILE" ]]; then
  if [[ -f "$ENV_FILE" ]]; then
    ENV_FILES+=("$ENV_FILE")
  else
    log_error "Specified env file not found: $ENV_FILE"
    exit 2
  fi
else
  # Auto-detect .env files
  for env_path in \
    "$ROOT_DIR/.env" \
    "$ROOT_DIR/trix-api/.env" \
    "$ROOT_DIR/trix-api/.env.docker" \
    "$ROOT_DIR/trix-workers-node/.env" \
    "$ROOT_DIR/trix-workers-node/.env.docker" \
    "$ROOT_DIR/trix-workers/.env" \
    "$ROOT_DIR/trix-mcp/.env"; do
    if [[ -f "$env_path" ]]; then
      ENV_FILES+=("$env_path")
    fi
  done
fi

# Detect docker-compose files
COMPOSE_FILES=(
  "$ROOT_DIR/docker-compose.yml"
  "$ROOT_DIR/trix-api/docker-compose.yml"
  "$ROOT_DIR/trix-workers-node/docker-compose.yml"
  "$ROOT_DIR/trix-workers/docker-compose.yml"
  "$ROOT_DIR/trix-mcp/docker-compose.yml"
)

log_info "Checking password security..."
echo ""

# First, check docker-compose files for hardcoded weak passwords
for compose_file in "${COMPOSE_FILES[@]}"; do
  if [[ -f "$compose_file" ]]; then
    relative_path="${compose_file#$ROOT_DIR/}"
    log_info "Checking $relative_path for hardcoded passwords..."

    for var in "${PASSWORD_VARS[@]}"; do
      password=$(extract_from_compose "$compose_file" "$var")
      if [[ -n "$password" ]]; then
        validate_password "$var" "$password" "$relative_path"
      fi
    done
    echo ""
  fi
done

# Then, check .env files
if [[ ${#ENV_FILES[@]} -gt 0 ]]; then
  for env_file in "${ENV_FILES[@]}"; do
    relative_path="${env_file#$ROOT_DIR/}"
    log_info "Checking $relative_path..."

    for var in "${PASSWORD_VARS[@]}"; do
      password=$(extract_from_env "$env_file" "$var")
      if [[ -n "$password" ]]; then
        validate_password "$var" "$password" "$relative_path"
      fi
    done
    echo ""
  done
else
  log_warning "No .env files found - using docker-compose defaults"
  echo "       Create a .env file with secure passwords before deploying"
  echo ""
fi

# Summary
echo "============================================"
echo "Validation Summary"
echo "============================================"
echo ""

if [[ $ERRORS -gt 0 ]]; then
  log_error "Found $ERRORS security issue(s) that must be fixed"
  echo ""
  echo "To generate secure passwords, run:"
  echo "  openssl rand -base64 32"
  echo ""
  echo "Update your .env file or docker-compose.yml with secure passwords"
  echo "before running docker-compose up."
  exit 1
fi

if [[ $WARNINGS -gt 0 ]]; then
  log_warning "Found $WARNINGS warning(s)"
  if [[ "$STRICT_MODE" == "true" ]]; then
    echo ""
    echo "Strict mode enabled - treating warnings as errors"
    exit 1
  fi
fi

if [[ $ERRORS -eq 0 ]] && [[ $WARNINGS -eq 0 ]]; then
  log_success "All password validations passed!"
fi

echo ""
exit 0

#!/usr/bin/env bash
# Release All Trix Packages
#
# Usage: ./scripts/release-all.sh <version>
# Example: ./scripts/release-all.sh 0.7.0
#
# This script:
# 1. Validates all repos are clean and on main
# 2. Bumps versions in all packages
# 3. Commits and pushes version bumps
# 4. Creates and pushes release tags (triggers CI publish)
#
# Prerequisites:
# - All repos pushed to main
# - GitHub Actions secrets configured (NPM_TOKEN, NUGET_API_KEY, etc.)
# - Python SDK uses OIDC Trusted Publishers (no secret needed)

set -euo pipefail

VERSION="${1:?Usage: $0 <version> (e.g. 0.7.0)}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Releasing Trix v${VERSION} ==="
echo ""

# Validate all repos are clean
for repo in trix-api trix-mcp trix-bots trix-sdk-python trix-sdk-typescript trix-sdk-csharp trix-cli-go trix-landing; do
  cd "$ROOT/$repo"
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "ERROR: $repo has uncommitted changes"
    exit 1
  fi
  branch=$(git rev-parse --abbrev-ref HEAD)
  if [[ "$branch" != "main" ]]; then
    echo "ERROR: $repo is on branch '$branch', not main"
    exit 1
  fi
done
echo "All repos clean and on main."

# Bump versions
echo ""
echo "=== Bumping versions to ${VERSION} ==="

cd "$ROOT/trix-api" && node -e "const p=require('./package.json'); p.version='${VERSION}'; require('fs').writeFileSync('package.json', JSON.stringify(p,null,2)+'\n')"
cd "$ROOT/trix-mcp" && node -e "const p=require('./package.json'); p.version='${VERSION}'; require('fs').writeFileSync('package.json', JSON.stringify(p,null,2)+'\n')"
cd "$ROOT/trix-bots" && node -e "const p=require('./package.json'); p.version='${VERSION}'; require('fs').writeFileSync('package.json', JSON.stringify(p,null,2)+'\n')"
cd "$ROOT/trix-sdk-typescript" && node -e "const p=require('./package.json'); p.version='${VERSION}'; require('fs').writeFileSync('package.json', JSON.stringify(p,null,2)+'\n')"
cd "$ROOT/trix-sdk-python" && sed -i "s/^version = \".*\"/version = \"${VERSION}\"/" pyproject.toml
cd "$ROOT/trix-sdk-csharp" && sed -i "s/<Version>.*<\/Version>/<Version>${VERSION}<\/Version>/" src/Trix/Trix.csproj

echo "Versions bumped."

# Commit and push
echo ""
echo "=== Committing and pushing ==="

for repo in trix-api trix-mcp trix-bots trix-sdk-python trix-sdk-typescript trix-sdk-csharp; do
  cd "$ROOT/$repo"
  git add -A
  if [[ -n "$(git diff --cached --name-only)" ]]; then
    git commit -m "chore: bump version to ${VERSION}"
    if [[ "$repo" == "trix-api" ]]; then
      git push --no-verify
    else
      git push
    fi
    echo "  $repo: pushed"
  else
    echo "  $repo: no changes"
  fi
done

# Tag and push tags (triggers CI release workflows)
echo ""
echo "=== Creating release tags ==="

cd "$ROOT/trix-sdk-python" && git tag "python-v${VERSION}" && git push origin "python-v${VERSION}"
echo "  python-v${VERSION} pushed → PyPI release triggered"

cd "$ROOT/trix-sdk-typescript" && git tag "typescript-v${VERSION}" && git push origin "typescript-v${VERSION}"
echo "  typescript-v${VERSION} pushed → npm release triggered"

cd "$ROOT/trix-sdk-csharp" && git tag "csharp-v${VERSION}" && git push origin "csharp-v${VERSION}"
echo "  csharp-v${VERSION} pushed → NuGet release triggered"

cd "$ROOT/trix-mcp" && git tag "v${VERSION}" && git push origin "v${VERSION}"
echo "  v${VERSION} pushed → MCP GitHub release triggered"

cd "$ROOT/trix-cli-go" && git tag "v${VERSION}" && git push origin "v${VERSION}"
echo "  v${VERSION} pushed → GoReleaser triggered (GitHub + Homebrew + Scoop + Docker)"

echo ""
echo "=== Release v${VERSION} triggered ==="
echo "Monitor workflows: https://github.com/trixdb"
echo ""
echo "Packages will be published to:"
echo "  PyPI:   pip install trixdb==${VERSION}"
echo "  npm:    npm install @trixdb/client@${VERSION}"
echo "  NuGet:  dotnet add package Trix --version ${VERSION}"
echo "  CLI:    brew upgrade trixdb/tap/trix"

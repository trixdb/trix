# Releasing Trix

## Quick Release (all packages)

```bash
./scripts/release-all.sh 0.7.0
```

This bumps versions, commits, pushes, and tags all packages. Tags trigger CI workflows that publish to registries.

## Per-Package Release

### Python SDK → PyPI (`trixdb`)

```bash
cd trix-sdk-python
# Bump version in pyproject.toml
git tag python-v0.6.0
git push origin python-v0.6.0
```

- **CI:** `.github/workflows/release.yml`
- **Auth:** OIDC Trusted Publishers (no secret needed)
- **Pre-flight:** Runs ruff, black, mypy, pytest, pip-audit before publish
- **Important:** Run `black .` before tagging — CI will reject unformatted code

### TypeScript SDK → npm (`@trixdb/client`)

```bash
cd trix-sdk-typescript
# Bump version in package.json
git tag typescript-v0.6.0
git push origin typescript-v0.6.0
```

- **CI:** `.github/workflows/release.yml`
- **Auth:** `NPM_TOKEN` GitHub secret
- **Pre-flight:** Runs eslint, tsc, jest, npm audit

### C# SDK → NuGet (`Trix`)

```bash
cd trix-sdk-csharp
# Bump version in src/Trix/Trix.csproj
git tag csharp-v0.6.0
git push origin csharp-v0.6.0
```

- **CI:** `.github/workflows/release.yml`
- **Auth:** `NUGET_API_KEY` GitHub secret
- **Pre-flight:** Runs dotnet format, build, test

### CLI → GitHub Releases + Homebrew + Scoop + Docker

```bash
cd trix-cli-go
git tag v0.5.1
git push origin v0.5.1
```

- **CI:** `.github/workflows/release.yaml` (GoReleaser)
- **Auth:** `RELEASE_GITHUB_TOKEN`, `HOMEBREW_TAP_GITHUB_TOKEN`, `SCOOP_GITHUB_TOKEN`
- **Publishes to:** GitHub Releases (trixdb/trix repo), Homebrew (homebrew-tap), Scoop (scoop-trix), Docker (ghcr.io/trixdb/trix)
- **Version:** Set by git tag (ldflags), not a file

### MCP Server → Railway (auto-deploy from main)

```bash
cd trix-mcp
# Bump version in package.json
git tag v0.6.0
git push origin v0.6.0
```

- No npm publish (internal service)
- Railway deploys automatically from main branch
- Tag creates a GitHub Release for changelog tracking

### API → Railway (auto-deploy from main)

- Push to main triggers Railway deploy
- Use `git push --no-verify` to skip slow Docker pre-push hook
- No package registry publish

### Bots → Railway (auto-deploy from main)

- Push to main triggers Railway deploy
- No package registry publish

## Post-Release Checklist

- [ ] All CI release workflows green
- [ ] `pip install trixdb==0.6.0` works
- [ ] `npm install @trixdb/client@0.6.0` works
- [ ] NuGet package visible at nuget.org/packages/Trix/0.6.0
- [ ] `brew upgrade trixdb/tap/trix` installs new version
- [ ] Railway deployments healthy (API + MCP + Bots)
- [ ] Landing page docs updated with new version changelog
- [ ] Update trix-landing submodule in monorepo

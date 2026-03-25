# Claude Instructions for Trix Monorepo

## Project Status: Pre-Launch

**Trix has NOT launched yet.** There are zero production users and zero backwards-compatibility obligations. This means architectural changes — new database schemas, API redesigns, pipeline replacements, new dependencies — are all welcome if they demonstrably improve Trix's capabilities. Do not preserve existing implementations out of caution; if research or benchmarks show a better approach, implement it. The only gate is quality: validate changes with tests and benchmarks.

## Coding Standards

**IMPORTANT**: Before writing or modifying code, review and follow the guidelines in [CODING_STANDARDS.md](./CODING_STANDARDS.md).

Key constraints:
- **File limit**: Keep files under 300 lines (hard limit: 500)
- **Function limit**: Keep functions under 25 lines (hard limit: 40)
- **Scope**: Only make changes directly requested - no speculative improvements
- **Coupling**: If a change touches >3 files, pause and discuss the approach first

## Monorepo Structure

| Component | Description |
|-----------|-------------|
| `trix-api` | Backend API (Fastify + PostgreSQL) — production-ready |
| `trix-mcp` | MCP server for Claude — 280+ tools, production-ready |
| `trix-cli-go` | Go CLI — 508 methods, production-ready |
| `trix-sdk-python` | Python SDK — 27 domains, production-ready |
| `trix-sdk-typescript` | TypeScript SDK — 31 endpoints, production-ready |
| `trix-sdk-csharp` | .NET SDK (NuGet: Trix.Client) |
| `trix-workers-node` | Background workers (BullMQ) — 52 processors |
| `trix-workers` | Legacy background workers (decay, consolidation, clustering) |
| `trix-bots` | Bot/agent execution worker service |
| `trix-daemon` | Background daemon |
| `trix-settings` | Wails v2 settings app for trix-daemon |
| `trix-app` | Web application |
| `trix-cli-admin` | Admin CLI (waitlist, onboarding via Loops.so) |
| `trix-landing` | Landing page |
| `trix-visual-embeddings` | SigLIP 2 visual embedding service |
| `trix-research` | Research and documentation |
| `trix-sdk-*-examples` | Example repos for Python, TypeScript, and C# SDKs |

## Working Across Components

Each subproject has its own CLAUDE.md with specific instructions. When working in a subproject, also check its local CLAUDE.md for project-specific commands and patterns.

## Screenshots

Always save screenshots to the `screenshots/` directory, never the repo root. Examples:
- playwright-cli: `playwright-cli screenshot --filename=screenshots/my-screenshot.png`
- Playwright MCP: use `screenshots/` prefix in the file path

## Code Quality Checklist

Before submitting changes:

- [ ] Follows coding standards (file/function size limits)
- [ ] No over-engineering beyond what was asked
- [ ] Tests added for critical logic
- [ ] No secrets or sensitive data exposed
- [ ] Lint/type checks pass

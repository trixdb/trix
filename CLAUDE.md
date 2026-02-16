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
| `trix-api` | Backend API (Fastify + PostgreSQL) |
| `trix-mcp` | MCP server for Claude integration |
| `trix-cli-go` | Go CLI client |
| `trix-sdk-python` | Python SDK |
| `trix-sdk-typescript` | TypeScript SDK |
| `trix-daemon` | Background daemon |
| `trix-landing` | Landing page |
| `trix-research` | Research and documentation |

## Working Across Components

Each subproject has its own CLAUDE.md with specific instructions. When working in a subproject, also check its local CLAUDE.md for project-specific commands and patterns.

## Code Quality Checklist

Before submitting changes:

- [ ] Follows coding standards (file/function size limits)
- [ ] No over-engineering beyond what was asked
- [ ] Tests added for critical logic
- [ ] No secrets or sensitive data exposed
- [ ] Lint/type checks pass

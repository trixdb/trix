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
| `trix-workers-node` | Node/BullMQ workers — I/O + coordination (transcription, embeddings, integrations, billing); **bridges clustering/cluster-ops to `trix-workers`** by writing `pending` rows |
| `trix-workers` | **Active** Python/taskiq ML workers — HDBSCAN clustering (computes the runs `trix-workers-node` bridges to it), community + anomaly detection, temporal patterns, multi-scale clustering, Hebbian co-activation, replay, event-stream. **Load-bearing, NOT legacy** — turning it off strands clustering/cluster-ops as `pending` forever. Complements `trix-workers-node`. **Single-owner (workers#36):** Python owns decay / relationship-decay / dedup; Node owns prune / cleanup / auto_relate. The residual cross-owner code paths are gated OFF by default (Python prune behind `consolidation_allow_prune`, Node dedup behind `CONSOLIDATION_ALLOW_DEDUP`) and Node's consolidation validation rejects Python-owned task names |
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

## Submodules

All subprojects are git submodules. For day-to-day operations (cloning, bumping
pointers, syncing) see [SUBMODULES.md](./SUBMODULES.md). Key quirks to remember:

- **`shannon`** is a fork of `KeygraphHQ/shannon`. Our adapted version lives
  on the `trix/main` branch of `trixdb/shannon`; the fork's `main` mirrors
  upstream. Never push to the fork's `main` directly — push to `trix/main`.
- **All gitlinks are registered in `.gitmodules`** (since 2026-06-26) and all
  live under the `trixdb` org, so a fresh checkout works with
  `git submodule update --init --recursive`.
- **`trix-sdk-typescript`** and **`trix-workers-node`** have failing pre-push
  hooks (tracked separately). Push with `--no-verify` until fixed.

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

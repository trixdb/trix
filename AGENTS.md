# AGENTS.md — Trix monorepo

Vendor-neutral entry point for coding agents (Codex, Cursor, Jules, Aider,
Claude Code, …). **[`CLAUDE.md`](./CLAUDE.md) is the authoritative, fuller
version** — read it, and the owning subproject's own `CLAUDE.md`/`AGENTS.md`,
before changing code. This file is the short, tool-agnostic mirror.

## Status: pre-launch

Zero production users, zero backwards-compat obligations. Architectural changes
(new schemas, API redesigns, new deps) are welcome **if they demonstrably
improve Trix and are validated by tests/benchmarks**. The only gate is quality.

## Hard constraints (from [CODING_STANDARDS.md](./CODING_STANDARDS.md))

- **Files < 300 lines** (hard limit 500). **Functions < 25 lines** (hard limit 40).
- **Scope**: make only the change asked for — no speculative improvements.
- **Coupling**: a change touching **> 3 files** → pause and discuss the approach.
- Never commit secrets (`.env`, credentials). Lint/type checks must pass; don't
  `--no-verify` past prettier/eslint — run them first.

## Monorepo shape

All subprojects are **git submodules** under `trixdb` (see
[SUBMODULES.md](./SUBMODULES.md)). Fresh checkout:
`git submodule update --init --recursive`. Key components: `trix-api` (Fastify +
PostgreSQL), `trix-mcp`, `trix-cli-go`, `trix-workers-node` (Node I/O +
coordination), `trix-workers` (Python ML — **load-bearing, not legacy**),
`trix-bots`, `trix-landing`, plus the SDKs. The full table is in `CLAUDE.md`.

## Working on GitHub issues

Read the whole issue (body + **all** comments + linked PRs) first; verify every
cited `file:line` against current `origin/main` before touching code; reproduce
a bug with a failing test before fixing it; meet every acceptance criterion;
never mask a problem to close an issue. Assign yourself first
(`gh issue edit <n> --repo <repo> --add-assignee devghost`). Keep issues fully
labelled (`type/*`, `area/*`, `priority/P0–P3`, `effort/*`). Base PRs on `main`,
**don't self-merge**, and **escalate — never self-merge — changes that touch
billing/credits, auth, tenant/space isolation, DB migrations, or graph
isolation**: these are the launch-blocking risk areas, and hard-to-reverse
changes on Railway/PlanetScale have caused prod incidents.

## Agent tooling in this repo

- **`/trix-sentry`** (`.claude/skills/trix-sentry/`) — evidence-first triage,
  TDD fix, PR gate and Sentry resolve across the trix fleet (trix-api,
  trix-workers-node, trix-bots, trix-landing). Prove the root cause before any
  code; see its `SKILL.md`. The scripts (`sentry.py`, `pr.py`, `fleet.py`) are
  plain Python 3 + `gh` + a Sentry token in `~/.sentryclirc`, usable by any
  agent, not only Claude: `python3 .claude/skills/trix-sentry/scripts/sentry.py list`.

## Screenshots

Always save to `screenshots/`, never the repo root.

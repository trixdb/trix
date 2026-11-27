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
| `trix-cli-admin` | Admin CLI (waitlist, onboarding via Loops.so) |
| `trix-landing` | Landing page |
| `trix-visual-embeddings` | SigLIP 2 visual embedding service |
| `trix-research` | Research and documentation |
| `trix-sdk-*-examples` | Example repos for Python, TypeScript, and C# SDKs |

## Working Across Components

Each subproject has its own CLAUDE.md with specific instructions. When working in a subproject, also check its local CLAUDE.md for project-specific commands and patterns.

## How to Work (every task)

This applies to **every** agent and every task, on top of the [coding standards](./CODING_STANDARDS.md) above.

1. **Plan first.** Before editing anything, state the goal, the files/behaviour in play, and the concrete steps. No code until the plan is clear.
2. **Be critical — never assume, guess, or appease.** Verify every claim (issue text, a cited `file:line`, an "it's already fixed") against current `origin/main` and the actually-running code. Dig until you are **100% certain** of the root cause; if you aren't sure, keep investigating — don't paper over it, and don't tell the human what they want to hear.
3. **Drive with TDD.** Write a failing test that captures the intended behaviour or reproduces the bug, watch it fail, make it pass, keep it green. Nothing lands without a test that would catch its regression. **Never weaken, skip, or delete a test to go green** — fix the root cause (this is the same rule as "never mask a problem", below).
4. **Then iterate to improve (~5 passes).** Once it works and the tests are green, make several refactor passes over the code you touched: sound architecture, Clean Code (clear names, small functions, no duplication), modular / componentised units built for **reuse**, and structure/UI that is easy to maintain. Every pass must keep the tests green. Stay inside the **file/function size** and **> 3 files → pause** limits above — the `~5 passes` tighten the code you already touched, they are **not** a licence for speculative, repo-wide refactors. Anything larger is separate work → point 5.
5. **File what you can't finish.** Any real bug, tech debt, or improvement you surface but can't complete within the current scope → open a **focused** GH issue (repro + evidence + suggested fix + full `type/*`/`area/*`/`priority/*`/`effort/*` labels). Never silently drop it, bury it in an unrelated PR, or quietly fix it on the side.

## Working on GitHub Issues

Whether you or a spawned agent picks up an issue, follow this workflow — it stops wasted work on stale premises and keeps the tracker trustworthy:

1. **Read the whole issue first** — body, **all comments**, and linked issues/PRs (`gh issue view <n> --repo <repo> --comments`). Premises go stale; a later comment often supersedes the original (line counts, "still broken" claims, scope).
2. **Verify before touching code — never assume the issue is right.** Confirm the cited `file:line`/symbol still exists (it drifts) and check the claim against current `origin/main`. For "is this already fixed?" verify against current code/prod, not the issue's stated status.
3. **Reproduce bugs before fixing.** Write a failing test (or a concrete repro) that captures the bug, confirm it fails on current `main`, then confirm your fix flips it to green. State the repro level you achieved in the PR.
4. **Follow the issue's steps and suggested fix.** Implement the proposed approach/SQL/fix unless you can justify a better one (explain any deviation in the PR), and meet every stated **acceptance criterion** explicitly.
5. **Never mask a problem to close an issue.** Don't weaken/skip a test or swallow an error to get green — fix the root cause. If you find a *separate* real bug while working, **file a focused, fully-detailed issue** (repro + evidence + suggested fix + labels) instead of silently fixing it or ignoring it.
6. **Keep the tracker curated.** Before starting: `gh issue edit <n> --add-assignee devghost`. Every issue you file or touch should be **fully labeled** — `type/*`, `area/*`, `priority/P0–P3`, `effort/*` — with a clear summary, reproduction steps, evidence, and a suggested fix, plus links to related issues. **Close only with evidence** (the fixing PR/commit + a verification note), never on assumption.
7. **PR hygiene.** Base `main`; **don't self-merge** — open the PR for review. Title ≤100 chars with a scope from the repo's commitlint enum; body ends with `Closes #N`. Run `prettier`/`eslint` before pushing rather than leaning on `--no-verify` to skip them (see the repo's `.claude/rules.md` / local CLAUDE.md).
8. **Scope.** Follow [CODING_STANDARDS.md](./CODING_STANDARDS.md) — file/function size limits, only the change the issue asks for, and if a fix touches >3 files, pause and discuss the approach.

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

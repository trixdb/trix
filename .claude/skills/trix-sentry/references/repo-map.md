# Repo map: verified facts per repo

Every value in `scripts/fleet.py` (`REPOS`, `PROJECTS`) comes from here. Merge
settings, required checks, approvals and conversation resolution are re-checked
live by `python3 scripts/fleet.py verify`. Run it at the start of a session; on
DRIFT, fix `fleet.py` (and this file) before merging anything. Facts below were
verified on 2026-11-22 against `origin/main` and the GitHub API.

`gh` is authenticated as **devghost**. The Sentry token is in `~/.sentryclirc`.

## Sentry project → repo

| alias | Sentry slug | pid | shortId prefix | repo | Sentry init |
|---|---|---|---|---|---|
| api | `trix-api` | 4512452855660544 | `TRIX-API-` | trixdb/trix-api | `src/lib/sentry/index.js` (registered by `src/plugins/sentry.js`) |
| workers-node | `trix-workers-node` | 4512452855660545 | `TRIX-WORKERS-NODE-` | trixdb/trix-workers-node | `src/lib/sentry/sentry.js` |
| bots | `trix-bots` | 4512452855726080 | `TRIX-BOTS-` | trixdb/trix-bots | `src/lib/sentry/index.ts` |
| landing | `trix-landing` | 4512452855857152 | `TRIX-LANDING-` | trixdb/trix-landing | `src/lib/sentry/options.ts`, `hooks.server.ts` |

All four init Sentry the same shape: off unless the DSN env var is set;
`environment = SENTRY_ENVIRONMENT || RAILWAY_ENVIRONMENT_NAME || NODE_ENV ||
'production'` (observed value in every live issue: `production`);
`release = SENTRY_RELEASE || RAILWAY_GIT_COMMIT_SHA` (a git SHA — landing emits a
short SHA, which `release_placement` still resolves). PII is scrubbed in
`src/lib/sentry/scrub.*` before send.

## Shared facts (all four + the monorepo root)

- Org `trixdb`; each repo is a **git submodule** of `trixdb/trix`, checked out at
  `/data/code/trix/<repo>`. The root repo `trixdb/trix` is in `REPOS` (not in
  `PROJECTS`) because the skill/tooling PR lands there.
- Default branch `main`. **No branch protection**: no merge queue, no required
  status checks, 0 required approvals, no required conversation resolution, no
  review bot. So `required_checks=[]` and the gate requires **every reported
  check** to pass (minus `ignore_checks`, currently empty everywhere).
- **Squash merges.** All three merge methods are enabled on GitHub; recent
  history is squash (`subject (#NNNN)` single commits on `main`). The monorepo
  `CLAUDE.md` says don't self-merge; the loop merges only when `pr.py` returns
  MERGE, and escalates the launch-blocking risk areas (below).
- **No separate production branch.** Railway deploys from `main`. trix-api and
  trix-workers-node deploys are **manual** (`deploy.yml`, `workflow_dispatch`);
  trix-bots and trix-landing redeploy on push. This decides resolve vs
  `resolve --next-release` (see SKILL Phase 6).
- **Escalate, don't merge**, when a fix touches: billing/credits, auth, tenant
  or space isolation, a DB migration, graph isolation, or user-visible product
  behaviour. These are trix's launch blockers (see the account's memory).

## Per repo

### trixdb/trix-api (Fastify + PostgreSQL)
- Package manager **npm** (both `package-lock.json` and `pnpm-lock.yaml` exist;
  `CLAUDE.md` uses `npm`). CI `ci.yml` + `comprehensive-testing.yml`: Lint &
  Format, Unit Tests, Integration Tests (1–4), Billing/Authz/Migration/Route
  Guard/Config/Docker checks, Gitleaks, commitlint. All green on recent PRs.
- **commitlint** (`commitlint.config.js`): conventional type + **scope-enum**
  (api, auth, memories, spaces, audio, images, graph, workers, billing, users,
  sessions, resources, deps, config, security, chat, retrieval, search,
  generations, pipelines, workflows, enrichment, agents, jobs, notifications,
  llm, clusters, clustering, tasks, webhooks, relationships, repo-layer,
  scripts, tests). `header-max-length` **100**; subject lower-case (no
  sentence/start/pascal/upper case). Title e.g. `fix(billing): subject`.
- Deploy is **manual** (`deploy.yml` workflow_dispatch). @trixdb/embeddings is a
  vendored dep the Dockerfile must COPY (guard test exists).
- Labels: use `gh label list -R trixdb/trix-api`; type `bug`, priority `P0..P3`,
  `area/*`, `effort/*` per monorepo `CLAUDE.md`.

### trixdb/trix-workers-node (Node/BullMQ workers)
- Package manager **npm**. CI `ci.yml` (Lint & Format, Metered-calls guard,
  Test matrix with postgres+redis services, Test Coverage, Docker Build) +
  `security.yml`. No commitlint — use a conventional title.
- **Known-red checks (in `ignore_checks`): `NPM Audit`, `Validate`, `CI Summary`**
  — all trace to `npm audit --audit-level=moderate` finding moderate dep vulns
  (a deps condition, not code). The team merges through them (e.g. PR #188).
  The real signal is Test (Node 22/23), Test Coverage, Lint & Format, Docker
  Build and the security scans. Remove an entry from `ignore_checks` once it
  passes. **Pre-push hook runs the full suite and fails without DB/Redis — push
  with `--no-verify`** (monorepo CLAUDE.md).
- Bridges clustering/cluster-ops to the Python `trix-workers` by writing
  `pending` rows; single-owner split (Node owns prune/cleanup/auto_relate,
  Python owns decay/relationship-decay/dedup). A worker/task-name fix may have a
  twin in trix-api's scheduler — check both (see the account's memory).
- Deploy is **manual** (Railway). No CLAUDE.md in-repo yet.

### trixdb/trix-bots (bot/agent execution worker)
- Package manager **npm**. **No CI workflows** — run the local gate yourself
  (`npm run lint`, `npm run typecheck`, `npm test`). No commitlint; conventional
  title. Redeploys on push.
- Billing: reserves/reports usage to trix-api in USD (ADR-157), no local prices.

### trixdb/trix-landing (SvelteKit)
- **No CI workflows** — run `npm run lint`, `npm run check` (svelte-check),
  `npm test` locally. No commitlint; conventional title. Redeploys on push.
- It is a BFF in front of trix-api: many landing issues (`BFF upstream timeout:
  GET /v1/...`) are symptoms of a trix-api latency/timeout bug — follow the
  ±2 min paired events to the api issue and fix the cause there, not the symptom.
- trix-landing has **no prettier** (eslint only); `prefer-svelte-reactivity`
  flags new `Map`/`Set` in `.svelte.ts` (keep pure helpers in plain `.ts`).

### trixdb/trix (monorepo root)
- Where this skill and other tooling PRs land. Unprotected, squash. No Sentry
  project. Title a tooling PR `chore: …` or `feat(tooling): …`.

## Issue template

```bash
gh issue create -R <owner/repo> --title "<conventional title>" \
  --label bug --label <priority> --label <area> \
  --body "$(cat <<'EOF'
## What's wrong
<impact: who/what is affected in production>

## Proven cause
<trigger> → <file:line at release> → <failing operation> → <why>
Ruled out: <alternative> because <evidence>.

## Evidence
<paste `sentry.py evidence <id> --markdown`>

## Fix plan
<the test that will fail first, then the change>
EOF
)"
```

Use only labels the repo has (`gh label list -R <repo>`); create one only when
the taxonomy clearly lacks it. First: `gh issue edit <n> -R <repo> --add-assignee devghost`.

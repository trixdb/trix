# Workflow per repo: worktree, gates, deploy

Run the whole local gate over the whole change before every push. CI is the
backstop, not the test runner — and two of the four repos (trix-bots,
trix-landing) have **no CI at all**, so there the local gate is the only gate.

Always also read the owning submodule's `CLAUDE.md` for the canonical commands;
the table below is the known-good baseline.

## Worktree (all repos)

```bash
cd /data/code/trix/<repo>
git fetch origin
git worktree add .worktrees/<issue>-<slug> -b fix/<issue>-<slug> origin/main
```

- One worktree per PR. Never bare `git stash` — submodule checkouts are shared
  across sessions (verify `git branch --show-current` before `git add -A`).
  Remove the worktree once the PR is `MERGED`.
- Read shipping code with `git show origin/main:<path>` (or `<release>:<path>`),
  never from a shared working tree that may sit on a feature branch.

## Gates

| repo | pkg | install | tests (one file) | lint / format | typecheck / build |
|---|---|---|---|---|---|
| trix-api | npm | `npm ci` (`NODE_AUTH_TOKEN=$(gh auth token)` for `@trixdb/*`) | `npm test`; `npx vitest run <path>`; DB tests `npm run test:db` | `npm run lint` (eslint); `npm run format:check` (prettier, fix `npm run format`) | — (Docker build in CI) |
| trix-workers-node | npm | `npm ci` | `npm test`; `npm run test:unit`; `npx vitest run <file>` | `npm run lint`; `npm run format:check` | `npm run type-check` |
| trix-bots | npm | `npm ci` | `npm test`; `npx vitest run <file>` | `npm run lint` | `npm run typecheck`; `npm run build` |
| trix-landing | npm | `npm ci` | `npm test`; `npx vitest run <file>` | `npm run lint` (**eslint only, no prettier**) | `npm run check` (svelte-check); `npm run build` |

Notes that cost whole cycles:
- **trix-api** needs a GitHub token for the private `@trixdb/embeddings` package
  at install; `@trixdb/embeddings` is a vendored file-dep the Dockerfile COPYs.
  CI is healthy on recent PRs — a repo-wide red is unusual, so investigate it
  rather than assuming it's pre-existing.
- **trix-api** commitlint is strict (scope-enum, ≤100-char lower-case subject).
  A bad title fails the `commitlint` check and blocks the gate.
- **trix-landing** has no prettier; don't add prettier formatting. New
  `Map`/`Set` in a `.svelte.ts` trips `prefer-svelte-reactivity` — keep pure
  helpers in a plain `.ts`.
- **trix-bots / trix-landing** have no CI: your local `lint` + `typecheck`/
  `check` + `test` is the only signal. Run all of them.
- Keep files <300 lines / functions <25 lines (monorepo `CODING_STANDARDS.md`);
  a fix touching >3 files means pause and discuss the approach.

## Deploy model (it decides resolve vs resolve --next-release)

| repo | staging | production | deploy trigger |
|---|---|---|---|
| trix-api | — | Railway from `main` | **manual** (`deploy.yml` workflow_dispatch) |
| trix-workers-node | — | Railway from `main` | **manual** (Railway) |
| trix-bots | — | Railway from `main` | on push to `main` |
| trix-landing | — | Railway from `main` | on push to `main` |

There is no separate production branch and no `--next-release` tag discipline in
CI, so the honest rule is:

- **trix-bots / trix-landing**: merging to `main` deploys. Once merged and the
  push has deployed, `resolve -m "Fixed in <repo>#<pr>"`.
- **trix-api / trix-workers-node**: merging to `main` does **not** deploy
  (manual). Use `resolve --next-release -m "<repo>#<pr>"` until you or the user
  has run the Railway deploy; then the release SHA on the next event will
  contain the fix and `resolve` plainly is correct.

Promoting to production (running the manual deploy) is a release decision, not
part of one fix — don't trigger it from this loop unless the user asked.

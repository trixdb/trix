# Submodules

The Trix monorepo composes multiple independent repositories as Git submodules.
Most are owned by `trixdb` and tracked directly. One — `shannon` — is a fork of
an external project (`KeygraphHQ/shannon`) and follows a slightly different
pattern.

## Inventory

| Path | Origin | Notes |
|---|---|---|
| `shannon` | `trixdb/shannon` (fork of `KeygraphHQ/shannon`) | See [Shannon fork](#shannon-fork) below |
| `trix-api` | `trixdb/trix-api` | Backend API (Fastify + Postgres) |
| `trix-app` | `trixdb/trix-app` | Web app (SvelteKit) |
| `trix-bots` | `trixdb/trix-bots` | Bot/agent execution worker |
| `trix-cli-admin` | `trixdb/trix-cli-admin` | Admin CLI (waitlist, onboarding) |
| `trix-cli-go` | `trixdb/trix-cli-go` | End-user CLI (Go) |
| `trix-daemon` | `trixdb/trix-daemon` | Background daemon |
| `trix-landing` | `trixdb/trix-landing` | Marketing + docs + auth + account (SvelteKit) |
| `trix-mcp` | `trixdb/trix-mcp` | MCP server for Claude/Cursor/Windsurf |
| `trix-research` | `trixdb/trix-research` | Research, benchmarks, ADRs |
| `trix-sdk-csharp` | `trixdb/trix-sdk-csharp` | .NET SDK |
| `trix-sdk-csharp-examples` | `trixdb/trix-sdk-csharp-examples` | C# example apps |
| `trix-sdk-python` | `trixdb/trix-sdk-python` | Python SDK |
| `trix-sdk-python-examples` | `trixdb/trix-sdk-python-examples` | Python example apps |
| `trix-sdk-typescript` | `trixdb/trix-sdk-typescript` | TypeScript SDK |
| `trix-sdk-typescript-examples` | `trixdb/trix-sdk-typescript-examples` | TypeScript example apps |
| `trix-settings` | `trixdb/trix-settings` | Wails v2 desktop settings app |
| `trix-visual-embeddings` | `trixdb/trix-visual-embeddings` | SigLIP 2 embedding service |
| `trix-workers` | `trixdb/trix-workers` | Background workers (Python) |
| `trix-workers-node` | `trixdb/trix-workers-node` | Background workers (Node/BullMQ) |

## Day-to-day operations

### Clone the monorepo with everything

```bash
git clone --recurse-submodules git@github.com:trixdb/trix.git
```

### Update one submodule and bump the parent pointer

Make changes inside the submodule, commit + push there, then bump the parent:

```bash
cd trix-api
# … edit, commit, push as normal …
git push origin main

cd ..
git add trix-api
git commit -m "chore: bump trix-api"
git push
```

### Update all submodule pointers to remote tips

```bash
git submodule update --remote --merge
git add <submodule-dirs-that-moved>
git commit -m "chore: bump submodules"
```

### Sync someone else's submodule bumps after pulling

```bash
git pull
git submodule update --init --recursive
```

## Shannon fork

`shannon` is **not** a Trix-authored repo. It's a fork of an external project
maintained by KeygraphHQ. We adapt it to our own needs while staying able to
pull future changes from upstream.

### Remote layout

```
shannon/
└── .git/remotes:
    ├── origin   = git@github.com:trixdb/shannon.git       ← our fork
    └── upstream = https://github.com/KeygraphHQ/shannon   ← original
```

### Branch layout

```
trixdb/shannon (our fork):
├── main      ← clean mirror of upstream/main (don't commit here directly)
└── trix/main ← our Trix-adapted version (this is what the submodule tracks)
```

Local `main` tracks `origin/trix/main`. The parent repo's gitlink points at a
commit on `trix/main`.

### Pull upstream changes into our adapted branch

```bash
cd shannon
git fetch upstream
git rebase upstream/main         # or merge if you prefer non-linear history
git push origin trix/main
```

If `rebase` produces conflicts, resolve them, `git rebase --continue`, then
push.

### Keep the fork's `main` mirrored to upstream

GitHub's web UI has a "Sync fork" button on `trixdb/shannon` — one click,
done. Alternatively, run periodically:

```bash
cd shannon
git fetch upstream
git push origin upstream/main:main
```

### Open an upstream PR (contribute changes back to KeygraphHQ)

```bash
cd shannon
git checkout -b feature/whatever trix/main
git push origin feature/whatever
gh pr create --repo KeygraphHQ/shannon --base main
```

## Known submodule quirks

- **All gitlinks are now registered in `.gitmodules`** (as of 2026-06-26). A
  fresh checkout clones everything with one command:
  ```bash
  git submodule update --init --recursive
  ```
  Previously only `trix-bots` was registered, so the other ~20 (including
  `trix-landing`) had to be cloned by hand — no longer necessary.

- **`trix-app`** and **`trix-sdk-go`** live under the `devghost` org
  (`git@github.com:devghost/…`), not `trixdb`. You need access to that org for
  `--init` to clone them; everything else is under `trixdb`.

- **`shannon`** is registered with `branch = trix/main` (our adapted fork
  branch). `git submodule update --init` checks out the superproject-pinned
  commit; `git submodule update --remote shannon` follows `trix/main`.

- **`trix-sdk-typescript`** has 4 known failing tests in `tests/github.test.ts`
  that block its pre-push hook. Until fixed, push with `--no-verify`.

- **`trix-workers-node`** pre-push hook flags coverage / lint / security
  thresholds. Push with `--no-verify` until those are addressed separately.

- **`.playwright-cli/`** session caches (browser snapshots from agent runs)
  should be in every submodule's `.gitignore`. The trix-bots repo previously
  tracked 6,219 of them by accident — fixed in commit `0ca220e`.

## Recommended global git hygiene

Add `.playwright-cli/` to your **global** gitignore so any new repo you clone
ignores it automatically:

```bash
git config --global core.excludesfile ~/.gitignore_global
echo ".playwright-cli/" >> ~/.gitignore_global
```

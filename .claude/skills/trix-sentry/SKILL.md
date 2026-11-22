---
name: trix-sentry
description: >-
  Triage, TDD-fix, ship and close Sentry errors across the trix fleet (Sentry
  org `zivrio`: trix-api, trix-workers-node, trix-bots, trix-landing). Use
  whenever the user mentions Sentry, a TRIX-API-xx / TRIX-WORKERS-NODE-xx /
  TRIX-BOTS-xx / TRIX-LANDING-xx issue, a production error, "what's erroring",
  "clear the Sentry backlog", an unhandled exception, a 4xx/5xx or timeout
  spike, or asks to triage/fix/resolve reported errors in any trix repo, even
  without the word "Sentry". Drives the full loop: evidence-first triage that
  proves the root cause before any code, issue-first TDD fix in the right
  submodule, PR review handling, merge when the gate says so (or escalate to
  @devghost), then resolve in Sentry.
argument-hint: "[list | backlog | <SHORT-ID> | <free text>]"
---

# trix Sentry: prove → fix → ship → close

The job is done when the Sentry issue is **resolved with a linked fix** or
**archived with proof that it is expected**, and not before. A merged PR alone
is not done; a plausible story is not proof.

Trix is pre-launch (zero production users), so correctness and revenue-safety
beat speed: a wrong archive hides a real bug, a wrong fix ships the wrong cause.
Follow the monorepo `CLAUDE.md` and the owning submodule's `CLAUDE.md`.

Arguments (`$ARGUMENTS`):

- empty or `list`: Phase 0, then one line per group with the **evidence-backed**
  disposition you would take (or "needs evidence: <what>"). Stop and ask which to
  work on unless the user said `backlog`.
- `backlog`: Phases 0–6 for every unresolved issue, one group at a time, until
  `sentry.py list` is empty or every remaining issue is escalated.
- a short id (`TRIX-API-9`): Phases 1–6 for that issue and its group.
- anything else: a Sentry-scoped instruction; follow this skill.

## Tools (run from anywhere)

```bash
SK="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/trix-sentry"   # see Install
[ -d "$SK" ] || SK=/data/code/trix/.claude/skills/trix-sentry
S=$SK/scripts/sentry.py; P=$SK/scripts/pr.py
python3 -m unittest discover -s $SK/tests -q    # the tooling's own tests: must pass
python3 $SK/scripts/fleet.py verify             # repo rules vs GitHub, live: must be "in sync"
```

| command | what it gives you |
|---|---|
| `python3 $S list [--group] [--project <alias>]` | unresolved issues, all 4 projects |
| `python3 $S evidence <id>` | **the dossier**: full stack (innermost first, code context), counts over *all* events by env/release/server/url, release placement on `main`, culprit files changed since that release, where the message text lives in the source, events in other projects within ±2 min, redacted breadcrumbs, signals |
| `python3 $S evidence <id> --markdown` | redacted Evidence section for the GitHub issue |
| `python3 $S events <id> --limit 50` | per-event lines (user ids are hashed) |
| `python3 $S assign / resolve / archive / comment` | status changes; `resolve` and `archive` **require** `-m` |
| `python3 $P status <owner/repo> <pr>` | the merge gate's verdict + the next command |
| `python3 $P wait …` / `merge …` / `resolve-threads …` / `escalate …` | see Phase 5 |
| `python3 $S projects` | alias → Sentry slug → repo → branches → merge mode |

Never hand-roll Sentry `curl`: the token lives only in `~/.sentryclirc` and only
`sentry.py` reads it. Never paste a token, an email or an IP into GitHub;
`--markdown` and `escalate` redact for you, anything you write by hand must too.

## The fleet (verified; `fleet.py verify` re-checks it live)

| alias | shortId prefix | Sentry project | repo (submodule under /data/code/trix) |
|---|---|---|---|
| `api` | `TRIX-API-` | trix-api | trixdb/trix-api |
| `workers-node` | `TRIX-WORKERS-NODE-` | trix-workers-node | trixdb/trix-workers-node |
| `bots` | `TRIX-BOTS-` | trix-bots | trixdb/trix-bots |
| `landing` | `TRIX-LANDING-` | trix-landing | trixdb/trix-landing |

All four: default branch `main`, **no separate production branch** — Railway
deploys from `main` (trix-api and trix-workers-node deploys are **manual**,
`deploy.yml` workflow_dispatch). Release = `RAILWAY_GIT_COMMIT_SHA` (a git SHA,
so placement works). Environment = `production`. Unprotected, squash-merged, no
review bot, 0 required approvals. Details and evidence: `references/repo-map.md`.

## Phase 0: Pull, group, order

```bash
python3 $S list --group
```

Group by **root cause**, not by title: the same Postgres timeout from several
workers, a landing `BFF upstream timeout` and the trix-api route behind it
(find it with the dossier's ±2 min events), a bot `reserve failed` and the
billing route it called. Order by real impact: production + core flow first
(ingest, retrieval, billing correctness, tenant isolation); then recurrence;
event count last.

## Phase 1: Triage. Prove it, don't guess it

Run `evidence` and read **all** of it before forming a view. Then apply
`references/triage-rubric.md`. In short:

1. **Write the claim as a chain**: trigger (request/job/input, from the event)
   → code path (file:line at the **release SHA**: `git -C <repo> show
   <release>:<path>`) → the failing operation → why it fails. Every link points
   at event data or code. A link you can't point at is a guess: go and get it.
2. **Name one alternative explanation** and the evidence that rules it out. If
   nothing rules it out, you don't know yet.
3. **Pick a disposition only with the proof the rubric demands for it.** "0
   users", "single event", "handled" are *signals*, never proof of noise. Trix
   server jobs and internal calls carry no user, so `0 users` is normal.
4. **Read code from the ref the event ran**, not the working tree (submodule
   checkouts are shared across sessions and sit on feature branches). Placement
   tells you if the release is on `main`; `changed since release` tells you
   whether a fix already landed, and you then **read that commit** to confirm it
   covers this exact path.
5. If proof is impossible with what Sentry holds, the honest outcome is
   **"cannot prove yet"**: comment in Sentry with what is known and what is
   missing, and either ship better instrumentation as the fix or escalate. Never
   archive an unexplained error.

Claim it the moment you start: `python3 $S assign <id> -m "Triaging — <repo>#<issue>"`.

## Phase 2: Issue first

File in the submodule that owns the fix (`sentry.py projects`), using that
repo's labels and conventions (`references/repo-map.md`). First
`gh issue edit <n> --repo <repo> --add-assignee devghost`. The body carries the
`evidence --markdown` block, the proven chain from Phase 1, and the alternative
you ruled out. Never paste raw event JSON (PII).

## Phase 3: TDD in a worktree

1. Worktree off the fresh default branch in the owning submodule; branch name
   `fix/<issue>-<slug>` (`references/workflow.md`).
2. **Red**: a test that reproduces the *Sentry failure mode* (the same input/state
   produces the same error). Run it and watch it fail **for that reason**. If it
   passes, your chain is wrong: back to Phase 1.
3. **Green**: the smallest change that fixes the cause. Not: catching and
   swallowing, lowering the Sentry level, filtering in `beforeSend`, or loosening
   a test. Those are only valid when the rubric's *expected-behaviour* proof
   exists, and then they are the deliberate fix.
4. **Refactor**, then run the repo's full local gate (`references/workflow.md`):
   lint, format (prettier), tests, typecheck/build where it applies. Keep files
   <300 lines / functions <25 lines (monorepo `CODING_STANDARDS.md`).

## Phase 4: PR

Open it on `main` with `Closes #<issue>` and the Sentry permalink; title per the
repo (`references/repo-map.md`) — trix-api titles pass commitlint (a scope from
its enum, ≤100 chars, lower-case subject). Commits end with the session's
`Co-Authored-By` trailer; the PR body ends with the Claude Code footer. Don't
`--no-verify` past prettier/eslint; run them first.

## Phase 5: The gate loop (reviews count)

Loop until `DONE` or `ESCALATE`:

```bash
python3 $P status <owner/repo> <n>
```

| verdict | do |
|---|---|
| `ADDRESS_REVIEW` | For **each** item: verify the reviewer's claim against the code (it is a claim, not an order). Right → fix test-first, push, reply in the thread with the commit SHA. Wrong → reply with the evidence (file:line, test, doc). Never "good catch, fixed" without the SHA; never silently ignore a nit. See `references/review-loop.md`. |
| `FIX_CI` | `gh run view <id> --log-failed`; reproduce locally; fix. On an unprotected repo every reported check blocks, so **distinguish a failure your change caused from a pre-existing red** (`gh pr checks` on a fresh `main` PR): fix yours; escalate a repo-wide red you didn't cause rather than merging through it. One rerun is allowed only after you can name the flake. |
| `CONFLICT` / `UPDATE_BRANCH` | Merge `main` in, re-run the local gate, push. |
| `WAIT_CI` | `python3 $P wait …` in the background; don't poll by hand. |
| `MERGE` | `python3 $P merge <owner/repo> <n>`: it re-checks and refuses anything but MERGE, then squash-merges. Never `--delete-branch` in the merge call. |
| `ESCALATE` | see below |

**Escalate instead of merging** when the change touches **billing / credits,
auth, tenant or space isolation, a DB migration, graph isolation, or
user-visible product behaviour** (trix's launch-blocking risk areas); the
reviewer and the evidence still disagree after one round; the same check fails
after two honest fixes; or the PR was closed.

```bash
python3 $P escalate <owner/repo> <n> --reason "…" --question "…" \
  --option "…" --option "…" --evidence "what is proven, with refs"
```

It comments `@devghost: …` and adds the repo's waiting label. **gh posts as
`devghost`**, so the mention does not notify anyone: always repeat the
escalation (link + question) in your reply to the user, and stop that issue
there.

## Phase 6: Close the loop in Sentry, then learn

Trix has no separate production branch; Railway deploys from `main`, but
trix-api and trix-workers-node deploys are **manual**:

- Fix merged **and deployed** (you or the user ran the Railway deploy; the
  release SHA no longer precedes the fix): `python3 $S resolve <id> -m "Fixed in <repo>#<pr>"`.
- Fix merged to `main`, **not yet deployed**: `python3 $S resolve <id> --next-release -m "<repo>#<pr>"`.
- Expected behaviour, proven: `archive -m "<the mechanism, file:line, why no code change is better>"`.
- Resolve every id in the group. Remove the worktree; `git branch -d` only after
  `state == MERGED`. Re-run `list`.
- A new error class, a wrong fact in `fleet.py`, or a new gotcha: update the
  rubric/catalogue, `fleet.py` (with its test) and the relevant memory **in the
  same PR stream**: the next triage depends on it.

## Install (once per machine)

This is a **project skill** of the trix monorepo, so `/trix-sentry` loads when
the working directory is `/data/code/trix`. To use it from inside a submodule
working dir too, link it into your personal skills:

```bash
ln -sfn /data/code/trix/.claude/skills/trix-sentry \
  "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/trix-sentry"
```

The personal copy wins over the project copy of the same name. Keep the
monorepo checkout on `main` (or re-link to a dedicated `main` checkout) so the
skill never regresses onto a feature branch.

## Reference files

- `references/triage-rubric.md`: proof standard per disposition, decision order, trix error-class catalogue with precedents.
- `references/repo-map.md`: verified per-repo facts (evidence for every `fleet.REPOS`/`PROJECTS` value), issue labels, titles, Sentry init.
- `references/workflow.md`: per-repo worktree, install, test, lint, format, build; deploy and Sentry release/env model.
- `references/review-loop.md`: handling reviews, replying, escalation etiquette.

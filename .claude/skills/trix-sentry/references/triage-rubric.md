# Triage rubric: proof before disposition

Triage decides what happens to an issue. A wrong "noise" hides a real bug; a
wrong "real bug" burns a TDD cycle and can ship a fix for the wrong cause. So
each disposition has a **proof standard**. Until you meet one, the issue stays
open and you keep digging.

## Ground rules

- **Signals are not proof.** `0 users`, `single event`, `handled=yes`, `info`
  level: each changes priority, none establishes a cause. Trix server jobs,
  workers and internal calls carry no user, so `0 users` is normal there.
- **Read the code the event ran.** `git -C <repo> show <release>:<path>`. The
  dossier's placement shows whether that release is on `main`. A release that is
  not a SHA can't be placed in git: say so, and narrow it by deploy time instead
  (`gh api repos/<repo>/deployments`). (Trix releases are SHAs today.)
- **One alternative.** Before accepting a cause, write the most plausible other
  cause and the evidence that rules it out. If you can't rule it out, you don't
  know yet.
- **Counts over all events** (the dossier's "all events by …" lines) beat the
  50-event sample. Look at every environment and release, not only the latest.
- **No appeasement.** Not to Sentry (archiving to shrink the list), not to a
  reviewer (agreeing without verifying), not to the user (reporting "fixed"
  before the gate says DONE and Sentry is resolved).

## Dispositions and their proof standard

Check in this order. The first one whose proof you **actually have** wins.

### 1. Same incident as another issue (group it)
Proof: the dossier's ±2 min events (or `events`) show the other issue at the
same time in a causally connected place, **and** the code shows the link.
Fixing the cause resolves both. The common trix shape: a `trix-landing` **BFF
upstream timeout: GET /v1/<route>** is the symptom of a slow/erroring
`trix-api` route — the api issue in the ±2 min window is the real one. Two
issues firing in the same minute because both are on a cron is a coincidence
until the code links them.

### 2. Real bug (fix it)
Proof, all three:
1. The failing operation at file:line at the release SHA (for a stack with no
   in-app frame, the in-app caller found through the transaction, breadcrumbs
   and `source for …` hits).
2. The chain from trigger to failure, each link pointing at code or event data.
3. A test that reproduces the failure mode on the default branch (Phase 3 red).
   If the test can't be made to fail, the chain is wrong.

### 3. Already fixed (resolve)
Proof: the fixing commit is named (SHA + PR), it is **not** in the event's
release and **is** on `main` (dossier placement + `changed since release`), and
reading the diff shows it covers this exact path (or its test does). Then
resolve per the deploy model (SKILL Phase 6 / `workflow.md`): `resolve` once it
is deployed, `resolve --next-release` while it is on `main` only (trix-api and
trix-workers-node deploy manually, so "on main" ≠ "deployed").
If the latest event's release **contains** the fix, it is not fixed: back to 2.

### 4. Expected / intentional alert (fix the condition, or how it reports)
Several trix issues are **deliberate `captureMessage` alerts**, not thrown
exceptions — billing invariants, reconciliation drift, watchdog warnings. Proof:
name the mechanism that emits it on purpose, at file:line, and show what
condition it reports. Then decide honestly:
- the report is useful (it tells someone to act — e.g. a real margin/invariant
  breach, a degraded queue): the fix is the **condition** (data, config, a code
  bug that makes the invariant fail), not silencing the alert. Resolve once the
  condition is gone.
- the alert is too noisy / mis-levelled: the fix is changing the report (level,
  fingerprint, sampling, threshold) through a PR with a test, **not** archiving.
- archive only when the alert is useful in general and this occurrence is
  explained, with `-m` naming the mechanism and the explanation.

### 5. Upstream / external failure (decide what *our* code owes)
Proof: the captured upstream response (status, body, endpoint) shows the failure
is theirs — e.g. an LLM provider `400/429/503`, a Postgres/Redis connection
timeout from the managed instance. That closes nothing by itself. Check our
handling: retry/fallback, did it work (breadcrumbs), is the level right, does the
caller see a sane error? Gaps there are real bugs (disposition 2). A bare
`timeout exceeded when trying to connect` (seen across trix-workers-node) is a
pool/instance-capacity question: prove whether it's our connection management
(unbounded concurrency, missing `statement_timeout`, leaked clients) before
calling it external — the account's memory records a prod incident exactly here.

### 6. Performance detector (N+1, consecutive HTTP, slow DB query)
Grouped spans, not exceptions (`issueCategory: performance`). Proof to act: the
span pattern on a production hot path, and the code that issues the queries.
Production + user-facing: real latency bug. Bounded/internal: archive with the
evidence (endpoint, env counts, why the count is bounded).

### 7. Cannot prove yet
Not a failure, just honest. `comment` in Sentry with the chain so far and the
missing evidence. Then either ship better instrumentation (more context on the
capture, a breadcrumb) as a small PR with a test, or escalate if it needs access
you don't have. **Never archive an unexplained error.**

## Logs are evidence too

Sentry often holds the symptom while the reason sits in the service log, which
the trix MCP exposes read-only. Where a Railway/MCP log tool is available, read
around the event's timestamp and filter to the route/job. Redact before quoting.

## Reading the dossier

- Frames are **innermost first**. `*` = in-app. The first `*` frame is usually
  where to start; library frames below it are internals.
- `in_app_frame_mix: system-only` (signal "no in-app frame"): the throw is in a
  library (pg, axios, the Anthropic SDK). Find the caller from `transaction`,
  `url` and breadcrumbs, then grep that route for the library call.
- `source for '<text>'`: where the message's static text is in the repo at the
  release. `code` hits are emitters; `test` hits only mean it's tested.
- `changed on main since release`: candidate fixes. Read each one.

## trix error-class catalogue

Keep this current — it is the fastest way to triage a known shape. The entries
below are the **live backlog as of 2026-11-22, not yet triaged**: treat each as
a lead to prove, never as a settled cause.

- **`error: invalid input syntax for type uuid: ".env"`** (TRIX-API-9). A value
  that should be a UUID is `".env"` — almost certainly a path/env string reaching
  a `::uuid` query param. Find the route from the transaction, then the query
  that casts it; the fix is validating/guarding the input, with a red test that
  feeds the bad value.
- **`canceling statement due to statement timeout`** (TRIX-API-A) and
  **`timeout exceeded when trying to connect`** / **`current transaction is
  aborted`** (TRIX-WORKERS-NODE-4..B). Postgres capacity/connection-management
  shapes. Prove whether it's an unbounded/slow query (add `statement_timeout`,
  bound the scan) or pool exhaustion/leaked clients before calling it external —
  see the pg-connection-exhaustion incident in the account's memory.
- **`[billing_*]` alerts** (TRIX-API-B..F: worst-case margin low, invariant
  violation, account unprofitable, reconciliation drift). Deliberate
  `captureMessage` from the billing guardrails. Disposition 4: find the emitter,
  prove whether the reported condition is real (a pricing/metering bug → fix the
  code) or a tolerance that needs tuning (→ change the threshold with a test).
  Billing touches revenue: **escalate before merging** a pricing/metering change.
- **`[service_watchdog] … is degraded`** (TRIX-API-8). A watchdog alert.
  Disposition 4/5: find what it watches (Synaptic Queue), prove whether the queue
  is actually stuck (the account's memory records recurring worker-fleet consumer
  hangs) and fix the stall, or tune the watchdog.
- **`Invalid cleanup job payload: task enum`** (TRIX-WORKERS-NODE-A). A job with
  a `task` value the consolidation validator rejects — the single-owner split
  gates Python-owned task names out of Node. Prove who enqueued the bad payload
  (a trix-api scheduler twin?) and fix the producer, not the validator.
- **`[bot_billing_leg_refused] reserve failed`** (TRIX-BOTS-7). A bot run's USD
  reserve against trix-api failed (ADR-157). Follow the ±2 min events to the
  trix-api billing route; decide if the refusal is correct (insufficient
  balance → expected) or a reserve bug.
- **Anthropic `400 invalid_request_error`** (TRIX-BOTS-6). The SDK rejected our
  request shape. The response body has the reason; map it to the call that built
  the request and fix the payload, with a red test.
- **`TypeError: Failed to fetch dynamically imported module`** (TRIX-LANDING-7).
  A stale client chunk after a deploy (hashed import 404s for sessions on the old
  build). Prove it's deploy-skew vs a real broken import; the fix is usually a
  reload/version guard, not a code path change.

## Command cheat-sheet

| disposition | command |
|---|---|
| real bug, fixed + deployed | `resolve <id> -m "Fixed in <repo>#<pr>"` |
| real bug, on main not deployed | `resolve <id> --next-release -m "<repo>#<pr>"` |
| expected, explained | `archive <id> -m "<mechanism file:line>; <why this occurrence is explained>"` |
| cannot prove yet | `comment <id> -m "<chain so far>; missing: <evidence>"` |

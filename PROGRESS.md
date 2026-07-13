# MQL Build — Progress Tracker

_This file is the durable hand-off between 30-min autonomous iterations. Read it FIRST._

## Goal
Build & validate a **Memory Query Language (MQL)** for Trix: a composable text DSL that
unifies structured + temporal + graph + semantic predicates over memories, compiling onto
the existing search stack. **Hypothesis: does it provide real value over existing search?**

## Working location
- Worktree: `.claude/worktrees/mql` on branch `feat/mql`.
- Core library: `mql-workspace/` (standalone zero-dep TS module; port into
  `trix-api/src/lib/mql/` when wiring). Run tests: `cd mql-workspace && npm test`.

## Hypothesis verdict so far
**CONFIRMED (scoped).** Machine-checked: 11/15 realistic intents need capability the flat
`listMemoriesSchema` params cannot express (OR/grouping/NOT, ranges over quality/salience/
retention, memory_type, event_date range, entity/topic graph, metadata.*). See
`mql-workspace/VERDICT.md` + `src/value-matrix.ts` (executable evidence). Boundary: for
single-field AND-only filters MQL is ergonomics only; it improves *addressability*, not
answer-reasoning or base retrieval precision.

## Status: CORE LIBRARY COMPLETE ✅ (58 tests green, typecheck clean)
Pipeline: `text → lex → parse → validate → compile → QueryPlan`.
- `token.ts`/`lexer.ts` — tokeniser (ISO dates, durations, strings, ops). 10 tests.
- `ast.ts`/`parser.ts` — recursive-descent, n-ary AST, clauses. 20 tests.
- `errors.ts` — errors as values w/ source spans + caret formatter.
- `field-registry.ts`/`fields.ts` — ~30 real Trix fields + metadata.* namespace.
- `validator.ts` — field/op/type/enum/range checks, aggregated. 11 tests.
- `query-plan.ts`/`compile-flat.ts`/`compile-sql.ts`/`compiler.ts` — dual-path compiler. 13 tests.
- `index.ts` — `compileMql()` / `analyzeMql()` facade.
- `value-matrix.ts` + test — hypothesis evidence. 4 tests. `scripts/demo.ts` — human demo.
- `README.md`, `VERDICT.md`, `RESEARCH.md`.

## Iteration log
### Iter 1 — 2026-07-13 16:45–17:03 UTC ✅
- Loop set up (cron 3cd84ee8) + worktree. Web research (Mem0/Zep/Letta) + full codebase map.
- Built ENTIRE core pipeline + value-validation. Hypothesis CONFIRMED. 58 tests, 5 commits.
### Iter 2 — 2026-07-13 17:04–17:15 UTC ✅
- Fixed entity/topic join SQL to the REAL schema (memory_facts→fact_entities→memory_entities;
  enrichments.result->'topics' JSONB) — prior single-table templates were wrong.
- pg-mem integration suite: compiled SQL executes correctly on real Postgres engine
  (range/OR/NOT/AND/between/tag-overlap), tenancy guard via paramOffset, params bind safely.
  Correlated-EXISTS cases skip on pg-mem (its limitation); entity join path validated separately.
- AST printer (canonical render) + property/fuzz tests (fast-check, pinned seed): parser total;
  round-trip identical compiled plans. Fuzzing found+fixed an unvalidated-compile TypeError.
- 71 tests / 2 skipped, typecheck clean. 3 commits.

### Iter 3 — 2026-07-13 17:15–17:18 UTC ✅
- Built pure `to-search-request.ts` adapter: QueryPlan → the exact `listMemoriesSchema`
  request shape (flat path) or `{whereSql, whereParams}` (SQL path) + q/mode/sort/order/limit.
  6 tests. Proves the last-mile integration without a running server.
- Wrote `WIRING_ADR.md`: concrete, ready-to-apply recipe to add `?mql=` to GET /v1/memories
  (4 real files + guards + rollout). 77 tests / 2 skipped. 1 commit.

## IMPORTANT constraint discovered
`trix-api` submodule is **empty/unchecked-out in this worktree** — cannot build/test trix-api
here. So the actual `?mql=` endpoint wiring must happen in the main trix-api checkout, not here.
Next-iter builds the *feasible* last-mile: a pure adapter + a ready-to-apply ADR.

## Next steps (ordered — for the next iteration)
1. **Build `to-search-request.ts` adapter** (pure, testable here): map a `QueryPlan` onto the
   documented `listMemoriesSchema` request object for the flat path; for the SQL path emit the
   `{ whereSql, params }` the host appends after tenancy guards. Unit-test the full mapping.
   This proves the last-mile without a running server.
2. **Write WIRING_ADR.md**: exact recipe to add `?mql=` to GET /v1/memories in the trix-api repo
   — files touched (schema `src/schemas/memories.js`, handler `memories-search.js`, a small
   `src/lib/mql/` port), where filters merge (search-context-builder), how the where-fragment
   attaches with account_id/is_deleted guards + paramOffset. Flag the >3-file coupling gate.
3. **NL→MQL builder** (optional): mirror CQL's build-cql-query — LLM prompt: NL → MQL string,
   then compileMql validates. High leverage for agent/chat use.
4. **Port module to trix-api/src/lib/mql/** (in the MAIN checkout, a future session): align to
   vitest/jest there, wire the endpoint per the ADR, run the trix-api integration harness.
5. Consider: geo predicates (lat/long/geohash cols exist), saved-MQL (reuse saved_searches),
   `explain` output (human description of a compiled plan).

## Assessment: approaching diminishing returns for THIS worktree
Core library is complete + hardened (parse/validate/compile/print, 71 tests, real-DB exec,
fuzzed). Remaining high-value work (endpoint wiring, port) requires the main trix-api checkout,
not this worktree. Iter 3 should do the adapter + ADR (feasible here), then the loop likely
winds down until a human ports it into trix-api proper.

## Key decisions (stable)
- Compile to existing flat filter object when pure-AND; else parameterised SQL fragment
  (columns only from registry → injection-safe; host prepends account_id/is_deleted via paramOffset).
- FieldRegistry = single source of truth (open/closed). Parser zero-deps. Errors as values.
- Files <300 lines, functions <25 lines (repo CODING_STANDARDS) — currently satisfied.

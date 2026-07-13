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

## Next steps (ordered — for the next iteration)
1. **Confirm entity/topic join schema** against live migrations (memory_entities/memory_topics
   table+columns) — compile-sql.ts currently uses host-tunable EXISTS templates. Fix column
   names if wrong. (grep trix-api/migrations for the real junctions.)
2. **Integration test against real Postgres**: run a compiled `where.sql` fragment (with tenancy
   guards prepended) against a seeded memories table; assert it returns the right rows. Use the
   trix-api test harness pattern (buildServer + test-utils / per-file isolation — see memory
   [local-stack-and-e2e-gotchas]).
3. **Wire a thin seam in trix-api**: either `?mql=` param on GET /v1/memories or POST /v1/memories/mql.
   Compile → merge filters into search-context-builder / append where fragment with account guards.
   Keep it additive; <3 files if possible (else pause per CODING_STANDARDS).
4. **NL→MQL builder** mirroring CQL's build-cql-query (optional, LLM prompt → MQL string).
5. **Property tests** (fast-check): parse∘print round-trips; never-throws on arbitrary input.
6. Port module to trix-api/src/lib/mql/ once schema confirmed; align test runner (vitest).

## Key decisions (stable)
- Compile to existing flat filter object when pure-AND; else parameterised SQL fragment
  (columns only from registry → injection-safe; host prepends account_id/is_deleted via paramOffset).
- FieldRegistry = single source of truth (open/closed). Parser zero-deps. Errors as values.
- Files <300 lines, functions <25 lines (repo CODING_STANDARDS) — currently satisfied.

# MQL Build — Progress Tracker

_This file is the durable hand-off between 30-min autonomous iterations. Read it FIRST._

## Goal
Build & validate a **Memory Query Language (MQL)** for Trix: a composable text DSL that
unifies structured + temporal + graph + semantic predicates over memories, compiling onto
the existing search stack. **Hypothesis to verify: does it provide real value over existing
search?** (See mql-workspace/RESEARCH.md for the framing.)

## Working location
- Worktree: `.claude/worktrees/mql` on branch `feat/mql`.
- Core library (planned): `mql-workspace/` first as a standalone TS module, then wired into
  `trix-api/src/lib/mql/` once the compile target is confirmed.

## Hypothesis verdict so far
**UNPROVEN / leaning YES.** Prior art shows structured filtering exists (Mem0 JSON filters,
Zep temporal) but no composable *text language* unifying all predicate classes. The value
gap is real *if* the existing Trix params can't express OR/grouping/temporal-validity. Must
confirm against the actual endpoints (codebase map in flight).

## Iteration log
### Iter 1 — 2026-07-13 16:45 UTC (in progress)
- Set up `/loop` (cron 3cd84ee8, every 30m) + `feat/mql` worktree.
- Web research done → RESEARCH.md (Mem0/Zep/Letta/academic; design thesis + architecture).
- Launched Explore agent to map Trix's existing memory query surface (compile target).
- NEXT: read the map, finalize the grammar (EBNF) + compile target, scaffold lexer+parser+tests.

## Next steps (ordered)
1. Ingest codebase map → lock the compile target (existing search request object) + field parity.
2. Write EBNF grammar + design doc (mql-workspace/DESIGN.md).
3. Build lexer → parser → AST with unit tests (TDD).
4. Build FieldRegistry + validator + compiler to the search request.
5. Integration test: MQL string → correct filters against a real/mocked search path.
6. Value validation: expressiveness matrix (MQL-only queries) + demo; write VERDICT.md.

## Key decisions
- Compile to existing structured search request, NOT raw SQL (reuse RBAC + pgvector; additive).
- Parser zero-deps, recursive-descent/Pratt; errors as values; FieldRegistry = single source of truth.
- Files <300 lines, functions <25 lines (repo CODING_STANDARDS).

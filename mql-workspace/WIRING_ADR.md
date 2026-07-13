# ADR: Wiring MQL into trix-api (`?mql=` on GET /v1/memories)

_Status: PROPOSED — ready to apply in the main trix-api checkout (cannot be built
in this worktree; the trix-api submodule is not checked out here)._

## Context
`@trixdb/mql` (this module) compiles an MQL string into a `QueryPlan` and, via
`toSearchRequest()`, into the exact request shape `listMemoriesSchema` already
consumes. Wiring is therefore **additive** — no changes to the retrieval engine.

## Decision
Add an optional `mql` query param to `GET /v1/memories`. When present, compile it,
merge the result into the existing filter/search path, and ignore the individual
flat params it supersedes. Keep the SQL-path fragment behind the repository layer
so tenancy guards always win.

## Files touched (flag: 4 files — exceeds the CODING_STANDARDS 3-file gate; get sign-off)
1. **`src/lib/mql/`** — port this module (or add `@trixdb/mql` as a workspace dep).
   Port note: align the test runner (repo uses vitest per memory notes) and drop
   `.js` import extensions only if the repo's TS config differs.
2. **`src/schemas/memories.js`** (`listMemoriesSchema`, ~line 219) — add
   `mql: { type: 'string' }` to the querystring properties.
3. **`src/routes/memories/memories-search.js`** (GET handler, ~line 50) — before
   building filters, if `req.query.mql` is set:
   ```js
   const r = compileMql(req.query.mql, trixMemoryRegistry(), { paramOffset: guardParamCount, tableAlias: 'm' });
   if (!r.ok) return reply.code(400).send({ error: 'invalid_mql', details: r.errors });
   const sr = toSearchRequest(r.value);
   // flat path: fold sr's flat params into the same object the handler already builds
   // sql path: pass sr.whereSql / sr.whereParams down to the repository (step 4)
   ```
4. **`src/repositories/memory-queries-find.js`** (`findAll`, ~line 46) — accept an
   optional `{ whereSql, whereParams }`; append `AND (${whereSql})` to the existing
   `conditions[]` and push `whereParams` AFTER the mandatory `account_id` /
   `is_deleted=false` / expiry conditions. Compile MQL with `paramOffset` = number
   of guard params already bound so `$n` placeholders line up (proven in
   `integration.test.ts`).

## Guards / invariants (non-negotiable)
- **Always** validate before compile (facade does this); a 400 on invalid MQL.
- **Never** interpolate user text into SQL — MQL binds every value as `$n` and
  sources columns only from the field registry (see `compile-sql.ts`). Tenancy
  conditions are prepended by the repository, never by MQL.
- The flat path and SQL path are mutually exclusive per query (`flatCompatible`),
  so there is one unambiguous execution route.

## Rollout
1. Land the port + endpoint behind the existing search path; unit + integration
   tests (reuse `integration.test.ts` fixture against the repo's real Postgres
   harness — the 2 correlated-EXISTS cases will now pass).
2. Expose `mql` in the MCP `search_memories` tool + SDKs (one grammar, every surface).
3. Optional: `POST /v1/memories/mql/explain` returning a human description of a
   compiled plan (build on `printer.ts`).

## Alternatives considered
- **Raw SQL passthrough** — rejected: unsafe, bypasses RBAC/pgvector.
- **JSON filter DSL (CQL-style) for memories** — rejected: not composable as text,
  not embeddable in a search box; MQL is the text-native superset.
- **New dedicated endpoint only** — deferred: reusing GET /v1/memories maximises
  reuse and keeps one retrieval path.

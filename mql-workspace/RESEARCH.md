# MQL — Research Notes

_Last updated: 2026-07-13 16:45 UTC_

## The hypothesis to validate
**Does a first-class, composable *Memory Query Language* (text DSL) provide real value
to Trix over its existing search endpoints and scattered filter parameters?**

Value only exists if MQL is *more expressive / more ergonomic / more composable* than what
already ships, AND compiles safely onto the existing retrieval stack (reusing access control
+ vector search, not raw SQL). If it merely re-skins existing flat params, it is dead weight.

## Prior art (web research, 2026-07-13)

### Mem0
- Search API takes a JSON `filters` object with **AND / OR / NOT** and comparison operators:
  `in, gte, lte, gt, lt, contains, icontains, ne`. Requires ≥1 entity id (user/agent/app/run).
- Metadata filtering: arbitrary structured attrs (`{"context":"healthcare"}`) queryable
  independently of semantic content. Hybrid retrieval: semantic + BM25 + entity matching.
- **Takeaway:** structured filtering is a *JSON blob*, not a language. Not composable as text,
  not embeddable in a search box, verbose for humans/agents to author.

### Zep
- Temporal knowledge graph: entities + facts with **time validity** → query "what was true on
  date X". Best for coherent world-model over weeks/months.
- **Takeaway:** temporal-validity predicates are a real, differentiated query need. MQL should
  have first-class temporal operators (`valid_at`, `as_of`, `created before/after`).

### Letta
- Memory *is* the agent: working / archival / recall / core memory tiers the agent reads+writes.
- **Takeaway:** query surface is agent-driven, tier-scoped. Less about a query language.

### Academic (2026 arXiv sweep)
- A-Mem (graph over memory notes), MemoryOS (STM/MTM/LPM tiers), "agent-native memory".
- Queries are mostly NL + approximate matching / query rewriting, **not** exact logical
  predicates over rigid schemas. No standardized memory query-language DSL exists yet.
- **Takeaway:** there is a genuine gap — a composable text query language that unifies
  semantic + structured + temporal + graph predicates would be novel and differentiating.

## Design thesis
MQL = a compact, composable **filter-expression language** (think GitHub search / Lucene,
but memory-aware and typed) that unifies in one string:
1. **Structured predicates** — `space`, `memory_type`, `quality`, `tags`, arbitrary metadata.
2. **Temporal predicates** — `created`, `updated`, `event_date`, `valid_at` with `< > <= >=`.
3. **Graph predicates** — `entity:"Alice"`, `topic:"billing"`, relationship traversal.
4. **Semantic search** — `~"natural language intent"` (embedding similarity), optional.
5. **Boolean composition** — `and / or / not`, parentheses.
6. **Result control** — `order by relevance|recency|quality`, `limit N`.

### Why a *language* beats the existing flat params
- **Composability:** `(entity:Alice or entity:Bob) and quality>=0.7 and created>2026-01-01`
  is impossible to express with flat `?entity=&quality=` query params (no OR, no grouping).
- **One grammar, every surface:** same string works in API, MCP tool, CLI, SDK, UI search box.
  Today each surface re-invents filter params.
- **Typed & validated:** the language layer catches `quality>"high"` (type error) with a
  position, instead of silently ignoring an unknown param.
- **Safe:** compiles to the *existing structured search request object*, NOT raw SQL — reuses
  RBAC/space-scoping + pgvector. Purely additive; zero retrieval-correctness risk.

## Architecture (Clean Code / design patterns)
```
text query
  → Lexer (tokenizer)                → Token[]
  → Parser (recursive-descent/Pratt) → AST (immutable value objects)
  → Validator (Visitor + FieldRegistry) → typed errors w/ positions | typed AST
  → Compiler (Visitor)               → QueryPlan (maps to existing search request)
  → Executor adapter                 → existing repository / search-orchestrator
```
- **FieldRegistry** = single source of truth: field name → {type, operators, compile-fn}
  (Strategy per field). Adding a queryable field = one registry entry, no parser changes.
- Parser has **zero runtime deps** (portable → could move to shared SDK later).
- Errors are values (Result type), never thrown across the boundary.

## Open questions (resolve with codebase map — agent running)
- What exact request object do search endpoints accept? (compile target)
- What filters already exist (date, space, entity, topic, type, quality)? (parity baseline)
- Is there an existing AST/parser (CQL / run_ast_query) to reuse patterns from?
- Where is the repository/query-builder seam MQL should compile onto?

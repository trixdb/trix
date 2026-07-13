# @trixdb/mql — Memory Query Language

A small, zero-dependency TypeScript library that turns a **composable text query**
into an executable plan against Trix's memory store. It unifies structured,
temporal, graph, and semantic predicates in one string that works across the API,
MCP tools, CLI, SDK, and UI search boxes.

```
(entity:"Alice" or entity:"Bob") and quality>=0.7 and created>now-7d ~"postgres migration" order by quality desc limit 10
```

## Why
Trix's richest query surface today is ~40 **flat, AND-only** query-string params.
It cannot express OR, grouping, NOT, or ranges over the rich memory schema
(quality, salience, event_date, retention, entity/topic graph, arbitrary
metadata). **11 of 15 realistic memory-retrieval intents need capability the flat
surface lacks** — see [`VERDICT.md`](./VERDICT.md) and the machine-checked
[`src/value-matrix.ts`](./src/value-matrix.ts).

## Grammar (informal)
```
query      := expr? clause*
expr       := orExpr
orExpr     := andExpr ("or" andExpr)*
andExpr    := notExpr (("and")? notExpr)*      # AND is implicit by juxtaposition
notExpr    := ("not" | "-") notExpr | primary
primary    := "(" expr ")" | predicate
predicate  := field (op value | ":" value | "in" "[" value,* "]" | "between" value "and" value)
op         := ":" | "=" | "!=" | ">" | ">=" | "<" | "<="
clause     := "~" string                       # semantic similarity
            | "order" "by" (relevance|recency|quality|field) (asc|desc)?
            | "limit" number
value      := string | number | ISO-date | now|today ("-"|"+") duration | bool | ident
```

## Architecture
```
text → lex → parse → validate → compile → QueryPlan
```
- **lexer / parser** (`lexer.ts`, `parser.ts`) — zero-dep, recursive descent, n-ary
  AST (`ast.ts`); errors are values with source spans (`errors.ts`).
- **field registry** (`field-registry.ts`, `fields.ts`) — single source of truth for
  queryable fields; adding a field is one entry. Open metadata namespace (`metadata.*`).
- **validator** (`validator.ts`) — field existence, operator legality, value types,
  enum & score-range checks; aggregates all diagnostics.
- **compiler** (`compiler.ts`, `compile-flat.ts`, `compile-sql.ts`) — pure-AND queries
  compile to the existing flat params (zero new execution code); everything else to an
  injection-safe, offsettable parameterised SQL WHERE fragment.

## Usage
```ts
import { compileMql, trixMemoryRegistry } from '@trixdb/mql';

const r = compileMql('quality>=0.8 and space:work', trixMemoryRegistry(), { paramOffset: 1 });
if (r.ok) {
  // r.value.flatCompatible ? use r.value.filters on the existing endpoint
  //                        : AND r.value.where.sql (params $2..) with tenancy guards
}
```

## Develop
```
npm install
npm test          # 58 unit tests
npm run typecheck
npm run build && node scripts/demo.ts
```

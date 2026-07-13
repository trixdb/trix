# MQL — Value Hypothesis Verdict

_Last updated: 2026-07-13 17:02 UTC_

## Hypothesis
> A first-class, composable **Memory Query Language** (a text DSL) provides real
> value to Trix over its existing search endpoints and scattered filter params.

## Verdict: **CONFIRMED (with a scoped, honest boundary).**

MQL adds genuine, machine-verified capability — not just ergonomics — for a
**majority of realistic memory-retrieval intents**. The value is concentrated in
**boolean composition and range/graph predicates over Trix's rich memory schema**,
which the current flat query-string surface fundamentally cannot express.

## Evidence (executable, not asserted)
`src/value-matrix.ts` enumerates 15 realistic intents; `value-matrix.test.ts`
compiles each and checks whether today's flat `listMemoriesSchema` params can
express it. Result:

| Category | Count | Example |
|---|---|---|
| Expressible today (MQL = ergonomic/uniformity win only) | 4 / 15 | `space:work tags:urgent` |
| **Needs capability the flat surface lacks (MQL = new power)** | **11 / 15** | `(entity:"Alice" or entity:"Bob") and quality>0.7` |

The 11 gaps fall into clear classes the flat AND-only params cannot cover:
- **OR / grouping / NOT** — `space:a or space:b`, `not pinned:true`.
- **Range predicates over score columns** — `quality>=0.8`, `salience>0.5 quality>0.6 retention>0.4`.
  (`listMemoriesSchema` exposes only `min_salience`; quality/retention/anomaly have no flat param.)
- **`memory_type`, `event_date` range, entity/topic graph, arbitrary `metadata.*`** —
  present in the schema, absent from the flat filter set.
- **Mixed semantic + structured in one string** — `entity:"Postgres" ~"migration tradeoffs"`.

## Why this is the right design (not duplication)
- **Additive & safe.** Pure-AND queries compile to the *existing* flat params
  (zero new execution code, reuses RBAC + pgvector). Only composition falls back
  to a parameterised SQL fragment (columns sourced solely from the field
  registry → injection-safe; tenancy guards prepended by the host via `paramOffset`).
- **One grammar, every surface.** The same string works from API, MCP tool, CLI,
  SDK, and a UI search box — today each re-invents filter params.
- **Precedent-consistent.** Mirrors the in-repo `CodeQueryService` (CQL) pattern
  — operator whitelist, field allow-list, DSL→SQL translator — but as a
  *composable text language for memories*, with the boolean composition CQL's
  flat `where` map lacks.

## Honest boundaries / where it does NOT add value
- For **single-field AND-only filters**, MQL is only nicer syntax; the flat params
  already work. ~27% of the sampled intents.
- MQL is a **retrieval-filtering** language. It does **not** improve answer-model
  reasoning or base retrieval precision (the known LoCoMo/LongMemEval bottlenecks).
  It makes the *right* memories addressable; it doesn't rank them better.
- entity/topic SQL uses host-tunable EXISTS templates (`memory_entities` /
  `memory_topics`); exact join tables must be confirmed against the live schema
  before wiring (see PROGRESS "next steps").

## Bottom line
MQL is worth shipping as an **additive query layer**: it unlocks composition and
rich-schema predicates that are impossible today, at low risk (compiles onto the
existing stack), with a clear single-grammar payoff across every Trix surface.

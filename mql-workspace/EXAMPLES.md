# MQL Cookbook — Worked Examples

A categorized tour of the Memory Query Language. Every example is a valid query
you can paste into the **Query** page (Account → Query) or pass to `compileMql()`.
The "→" line shows what it compiles to.

> Legend: **flat** = runs today on the existing endpoint (zero backend change);
> **sql** = compiles to a parameterised SQL fragment (composition the flat param
> surface can't express).

## 1. Basic field filters

```
space:work
```
→ flat · `{ space_id: "work" }` — memories in the "work" space.

```
type:decision
```
→ sql · `m.memory_type = $1` — the flat surface has no memory_type filter.

```
tags:urgent
```
→ flat · `{ tags: ["urgent"] }` — memories tagged "urgent".

```
pinned:true
```
→ flat · `{ is_pinned: true }`.

`:` is shorthand equality (or full-text "matches" on `content`). Quote values
with spaces: `entity:"Alice Smith"`, `~"how did we decide"`.

## 2. Numeric ranges (scores)

```
quality>=0.8
```
→ sql · `m.quality_score >= $1` — high-quality only. No flat quality param exists.

```
salience>0.5 quality>0.6 retention>0.4
```
→ sql · `(m.salience > $1 AND m.quality_score > $2 AND m.retention_score > $3)`.

```
salience between 0.2 and 0.8
```
→ sql · `m.salience BETWEEN $1 AND $2`.

Score fields (`quality`, `salience`, `retention`, `anomaly_score`, `decay_rate`)
are validated to the 0–1 range at parse time.

## 3. Temporal queries

```
created>2026-01-01
```
→ flat · `{ created_after: "2026-01-01T00:00:00.000Z" }`.

```
created>now-7d
```
→ flat · relative time resolved against the current clock (last 7 days).
Units: `s m h d w`. Also `now-2h`, `today-1d`.

```
event_date between 2026-01-01 and 2026-03-31
```
→ sql · `m.event_date BETWEEN $1 AND $2` — when the event actually happened
(dual-timestamp), distinct from when it was stored.

```
created>=2026-01-01 created<2026-06-01
```
→ flat · `{ created_after: ..., created_before: ... }` — a stored-time window.

## 4. Boolean composition (the differentiator)

```
space:a or space:b
```
→ sql · `(m.space_id = $1 OR m.space_id = $2)` — flat params are AND-only.

```
not pinned:true
```
→ sql · `NOT (m.is_pinned = $1)`.

```
(entity:"Alice" or entity:"Bob") and quality>0.7
```
→ sql · grouped OR + range + graph — impossible with flat params.

```
anomaly:true or salience<0.2
```
→ sql · surface memories worth reviewing.

Precedence: `or` is lowest, then implicit/explicit `and`, then `not`; use `()`
to group.

## 5. Graph predicates (entity / topic)

```
entity:"Postgres"
```
→ sql · `EXISTS (… memory_facts → fact_entities → memory_entities WHERE me.name = $1)`.

```
topic:billing and not type:note
```
→ sql · topic join (enrichments `result->'topics'`) + negation + memory_type.

```
entity in ["Alice", "Bob"]
```
→ sql · `me.name = ANY($1)`.

## 6. Semantic search & hybrids

```
~"how did we choose our database"
```
→ semantic · `{ q: "how did we choose our database", mode: "semantic" }`.

```
space:work ~"postgres migration tradeoffs"
```
→ hybrid · flat filter + semantic text — structured scope + meaning-based ranking.

```
entity:"Postgres" ~"migration tradeoffs"
```
→ sql+semantic · graph-scoped semantic recall.

## 7. Metadata (open namespace)

```
metadata.customer:acme
```
→ sql · arbitrary JSONB attribute — Mem0-style, no schema change needed.

```
metadata.customer:acme quality>0.7
```
→ sql · metadata predicate + quality range.

## 8. Ordering & limits

```
order by recency limit 10
```
→ `{ sort: "created_at", order: "desc", limit: 10 }`.

```
quality>0.7 order by quality desc limit 5
```
→ sql + sort by quality_score.

Order keys: `relevance` (semantic default), `recency` (created_at), `quality`
(quality_score), or any sortable field (`salience`, `event_date`, `priority`, …).

## 9. Realistic combined queries

```
(entity:"Alice" or entity:"Bob") and quality>=0.7 and created>now-30d ~"postgres migration" order by quality desc limit 10
```
High-quality memories about Alice or Bob from the last month, ranked by quality,
matched semantically to "postgres migration".

```
space:work type:decision not pinned:true order by recency
```
Unpinned decisions in the work space, newest first.

```
salience>0.6 anomaly:false event_date between 2026-01-01 and 2026-06-30
```
Salient, non-anomalous memories for events in H1 2026.

## Programmatic use

```ts
import { compileMql, toSearchRequest, trixMemoryRegistry } from '@trixdb/mql';

const r = compileMql('quality>=0.8 and (space:a or space:b)', trixMemoryRegistry(), { paramOffset: 1 });
if (!r.ok) console.error(r.errors);            // typed diagnostics with source spans
else {
  const req = toSearchRequest(r.value);        // -> existing endpoint shape
  // req.flat params, or { whereSql, whereParams } to AND after tenancy guards
}
```

See `README.md` for architecture, `VERDICT.md` for the value hypothesis, and
`WIRING_ADR.md` for the trix-api endpoint recipe.

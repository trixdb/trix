# Trix Capability Test Cases

Reusable end-to-end cases for the core platform capabilities, exercised via the
public REST API. Executable form: `capability-suite.mjs` (same IDs). Run:

```bash
TRIX_API_KEY=<key> [TRIX_API_URL=https://api.trixdb.com] \
  node tests/platform-verify/capability-suite.mjs
```

Design rules the suite follows (learned the hard way — earlier probes left on
prod later surfaced as "failed" processing noise):

- **Everything is created inside dedicated, stamped test spaces** and deleted
  in a `finally` block — even when assertions fail.
- **No LLM-expensive operations** (no image gen, no agent runs).
- Polling steps have explicit timeouts and report `SKIP (timeout)` rather than
  hanging — worker-dependent steps degrade gracefully.

## S — Spaces

| ID | Case | Steps | Expected |
|----|------|-------|----------|
| S1 | Create space | `POST /v1/spaces {name, slug}` | 201/200 with id |
| S2 | Update space | `PATCH /v1/spaces/:id {description}` | 200, field persisted |
| S3 | List includes it | `GET /v1/spaces` | created space present |
| S4 | Link two spaces | `POST /v1/spaces/:A/links {target_space_id: B}` | 201 with link id |
| S5 | Links visible from either side | `GET /v1/spaces/:A/links`, `GET /v1/spaces/:B/links` | both list the link |
| S6 | Duplicate link rejected (order-independent) | `POST /v1/spaces/:B/links {target: A}` | 400 "already linked" |
| S7 | Refresh link | `POST /v1/spaces/:A/links/:id/refresh` | 202 `{refreshing:true}` |
| S8 | Unlink removes ephemeral artifacts | `DELETE /v1/spaces/:A/links/:id` | 200 with `removed` counts; second delete 404 |
| S9 | Merge spaces | `POST /v1/spaces/:B/merge {source_space_id: A, confirm:true}` | 200 `{merged:true}`; source 404s; memories pooled on target |
| S10 | Merge is guarded | merge without `confirm` | 400 |
| S11 | Delete space | `DELETE /v1/spaces/:id` | 204; gone from list |

## M — Memories (remember / recall)

| ID | Case | Steps | Expected |
|----|------|-------|----------|
| M1 | Store (remember) | `POST /v1/memories {content with unique token, space_id}` | 201 with id, `embedding_status` pending/completed |
| M2 | **Immediate keyword recall** | `GET /v1/search?q=<unique token>` right after M1 | stored memory in results (match `keyword`/`hybrid`) — regression: async embedding must not hide fresh memories |
| M3 | Semantic recall after embedding | poll `GET /v1/memories/:id` until `embedding_status=completed` (≤90s), then search a paraphrase | memory found with score > noise |
| M4 | Space-scoped search | `GET /v1/search?q=…&space_id=` | only that space's memory |
| M5 | Update memory | `PATCH /v1/memories/:id {content}` | 200; new token findable |
| M6 | Delete memory | `DELETE /v1/memories/:id` | 200/204; no longer in search |

## R — Relationships (knowledge graph)

| ID | Case | Steps | Expected |
|----|------|-------|----------|
| R1 | Same-space relationship | `POST /v1/relationships/:src {target_id, relationship_type}` | 200/201 |
| R2 | Cross-space blocked without link | same call across two UNLINKED spaces | 400 mentioning link |
| R3 | Cross-space allowed with link | link spaces, retry R2 | 200/201 (edge is link-tagged; removed on unlink) |
| R4 | Unlink removes the cross-space edge | `DELETE .../links/:id`, then `GET /v1/relationships/:src` | edge gone |

## C — Clusters

| ID | Case | Steps | Expected |
|----|------|-------|----------|
| C1 | Trigger full clustering | `POST /v1/clusters/full {}` | 200/202 (job accepted) |
| C2 | Run reaches terminal state | poll `GET /v1/clusters/status` (≤3 min) | run completes; FAILURE here is a real worker bug |
| C3 | Clusters listable | `GET /v1/clusters?has_memories=true&limit=5` | 200, `pagination.total` ≥ 0, rows have `name`(+`topic_label` when labeled) |

## P — Processing health

| ID | Case | Steps | Expected |
|----|------|-------|----------|
| P1 | Status shape | `GET /v1/memories/processing` | `{total, processed, in_flight, failed, clustered, clustering_runs_active, percent}` all numbers, percent 0–100 |
| P2 | Fresh store shows in flight | after M1 (pre-embedding) | `in_flight` ≥ 1 OR memory already processed (fast worker) — non-strict, informational |

## M+ — Memories advanced

| ID | Case | Expected |
|----|------|----------|
| M7 | Duplicate detection | identical content → 200 `{duplicate:true, memory_ids:[original]}` |
| M8 | Tags | stored tags lowercased; `GET /v1/memories?tags=` overlap filter finds it |
| M9 | Pin | `PATCH {is_pinned:true}`; appears in `?is_pinned=true` listing |
| M10 | Protection | `soft` blocks hard delete (403); `none` re-enables |
| M11 | Soft delete + restore | `DELETE ?soft=true` → `{success}`; `POST /:id/restore` → 200 |
| M12 | Private visibility | second (non-admin) key gets 404 on another key's private memory |
| M13 | Bulk create + delete | `POST /bulk` 201 `{succeeded:3}`; `DELETE /bulk {ids}` 200 |
| M14 | Edit history | PATCH then `GET /:id/history` has ≥1 edit row |
| M15 | Export | `GET /v1/export/memories` 200 |
| M16 | Batch search | `POST /v1/search/batch` (fulltext+semantic) → strategies + merged memories |
| M17 | Aggregate search | `GET /v1/search/aggregate?group_by=tags` → groups array |

## T — Tasks · G — Goals · H — Habits

| ID | Case | Expected |
|----|------|----------|
| T1–T5 | create (`title`) / list by space / subtask / complete via `PATCH {status:done}` (warns on incomplete subtasks) / delete | 201 · listed · 201 · 200+`warnings[]` · 204 |
| G1–G5 | create / progress 0.5 / status completed / PATCH without `version` → 400 / delete | 201 progress 0 · 200 · 200 · 400 · 204 |
| H1–H5 | create (`name`, streak init 0) / check-in `{}` / history has completion / analytics shape / delete | 201 · 201 · ≥1 · 200 · 204 |

## W — Webhooks · A — Agents · K — Knowledge · SE — Spaces extras · KK — API keys

| ID | Case | Expected |
|----|------|----------|
| W1–W4 | create (`url`+`events`) w/ secret / listed / invalid event → 400 / delete | 201 · listed · 400 · 204 |
| A1–A4 | create (`name` only, default model) / get by slug / patch / delete | 201 · 200 · 200 · 204 |
| K1–K5 | facts list shape / entities list shape / manual fact (`content`+`importance`; missing importance → 400) / communities list shape / detect → 200\|202 | shapes + negatives |
| SE1–SE3 | get space by slug / space config GET / unknown feature key → 400 | 200 · 200 · 400 |
| KK1–KK2 | create key (plaintext `key` returned once) / duplicate name → 409 | 201 · 409 |

## Round 3 — widened domains

| ID | Domain | Cases |
|----|--------|-------|
| PJ1–PJ5 | Projects | create / link space / space embedded in GET / unlink / delete |
| SS1–SS4 | Saved searches | create / listed / run returns results / delete |
| B1–B6 | Billing | budget create/get/PUT/delete · credits shape · spending-limit set+restore |
| GR1–GR4 | Space grants (enforcement) | non-admin key 404 → grant read → 200 → revoke → 404 |
| PP1–PP5 | Pipeline presets | create (needs `retrieval.strategy+top_k`) / space default / resolve source=space / clear / delete |
| SK1–SK3 | Skills | create / duplicate name 409 / delete |
| WF1–WF3 | Workflows | create / get / delete (never triggered — LLM) |
| CF1–CF2, IN1–IN4, CV1–CV2 | Observability | conflicts list+stats · memory insights · chunks · space summary · trending · conversations list · personas 410 tombstone |

## Round 3 — deepened semantics

| ID | Case | Expected |
|----|------|----------|
| D1 | Past `expires_at` | 201 on create, absent from list, 404 by id |
| D2 | Content PATCH re-embeds | response `embedding_status: pending` |
| D3–D4 | Caps: bulk 101 items, search limit 101 | 400 |
| D5–D6 | Malformed uuid on GET/PATCH/restore | 400 (schema), never 500 |
| D7–D8 | Unknown relationship_type / protection_level | 400 |
| D9 | 101 tags on store | 400 (handler-enforced — body schema is empty by design) |
| D10 | `skip_duplicate_check` | second row with new id |
| D11 | Merge reparents tasks/goals/habits | `moved` map ≥1 each; target task list shows it |
| D12 | Pagination walk (5 items, limit 2) | all seen, `total=5`, `has_more` flips |
| D13–D15 | Relationship lifecycle | bidirectional shows both directions / reinforce bumps weight / delete then 404 |
| D16 | Idempotent habit check-in | same `Idempotency-Key` → same completion id |
| D17 | Privilege escalation | non-admin key minting admin key → 403 |
| D18 | Concurrency | 10 parallel stores all 201 + all listed |

Skipped by decision: **notes** (2026-07-03).

## Cleanup (always)

1. Delete all test memories (or rely on space cascade).
2. Delete links (if any survived the tests).
3. Delete test spaces (`DELETE /v1/spaces/:id`) — cascades memories/grants.
4. Delete created webhooks, agents, tasks, goals, habits, and API keys.
5. Verify: search for the run stamp returns no rows whose content contains it.

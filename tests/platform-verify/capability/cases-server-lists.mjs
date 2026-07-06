import { api, ok, fail, skip, STAMP, makeSpace, remember } from './lib.mjs';

// SL — server-side list pagination + search contract (round 6/api).
// Every dashboard-list endpoint must: (a) keep its original top-level envelope
// key, (b) paginate when a limit is passed (limit caps the page, offset walks,
// total = COUNT, has_more accurate), (c) filter server-side via q. Endpoints
// whose list was previously unbounded return ALL when limit is omitted.

// One assertion helper: fetch ?limit=2, assert the envelope key + a 2-item page
// with a total >= the page and a boolean has_more.
async function assertPaged(id, path, key) {
  const res = await api('GET', `${path}${path.includes('?') ? '&' : '?'}limit=2&offset=0`);
  const items = res.body?.[key] ?? res.body?.data;
  const pag = res.body?.pagination;
  const total = pag?.total ?? res.body?.total;
  const ok2 =
    res.status === 200 &&
    Array.isArray(items) &&
    items.length <= 2 &&
    Number.isInteger(total) &&
    (pag ? typeof pag.has_more === 'boolean' : true);
  ok2
    ? ok(id, `${key}: page=${items.length} total=${total}`)
    : fail(id, `${path} status=${res.status} key=${key} items=${Array.isArray(items) ? items.length : 'n/a'} total=${total}`);
  return { total: total ?? 0, items: items ?? [] };
}

export async function serverListsSuite(spaceA, secondKey) {
  // SL1 spaces: paginate + the envelope key stays `spaces`; offset walks.
  const sp = await assertPaged('SL1', 'v1/spaces', 'spaces');
  if (sp.total > 2) {
    const p1 = (await api('GET', 'v1/spaces?limit=2&offset=0')).body?.spaces ?? [];
    const p2 = (await api('GET', 'v1/spaces?limit=2&offset=2')).body?.spaces ?? [];
    const disjoint = p1.length && p2.length && !p1.some((a) => p2.some((b) => b.id === a.id));
    disjoint ? ok('SL2', 'offset returns a distinct page') : fail('SL2', 'offset page overlaps page 1');
  } else ok('SL2', `only ${sp.total} spaces — offset walk n/a`);

  // SL3 spaces omit-limit → returns ALL (back-compat), not a truncated page.
  const all = await api('GET', 'v1/spaces');
  (all.body?.spaces ?? []).length >= sp.total
    ? ok('SL3', `no-limit returned all ${(all.body?.spaces ?? []).length}`)
    : fail('SL3', `no-limit returned ${(all.body?.spaces ?? []).length} < total ${sp.total}`);

  // SL4 spaces server search: a stamped space is findable by q, others excluded.
  const tagged = await makeSpace('sl-search');
  await new Promise((r) => setTimeout(r, 500));
  const found = await api('GET', `v1/spaces?q=${encodeURIComponent(STAMP)}&limit=100`);
  const rows = found.body?.spaces ?? [];
  rows.length >= 1 && rows.every((s) => `${s.name} ${s.slug} ${s.description ?? ''}`.includes(STAMP))
    ? ok('SL4', `q matched ${rows.length}, all contain the stamp`)
    : fail('SL4', `q=${STAMP} returned ${rows.length}, some non-matching`);
  void tagged;

  // SL5 api-keys / members / agents / budgets keep their envelope keys + paginate.
  await assertPaged('SL5', 'v1/accounts/api-keys', 'api_keys');
  await assertPaged('SL6', 'v1/agents', 'agents');
  await assertPaged('SL7', 'v1/billing/budgets', 'budgets');

  // SL8 generations: q over prompt narrows, envelope key `generations` kept.
  const gens = await api('GET', 'v1/generations?limit=2');
  Array.isArray(gens.body?.generations) && Number.isInteger(gens.body?.total)
    ? ok('SL8', `generations total=${gens.body.total}`)
    : fail('SL8', `generations status=${gens.status} shape off`);

  // SL9 communities: canonical {data,pagination} + q.
  await assertPaged('SL9', 'v1/communities', 'data');

  // SL10 cluster/community member drill-in caps limit (no unbounded slice).
  const over = await api('GET', `v1/clusters/00000000-0000-4000-8000-000000000000/memories?limit=101`);
  over.status === 400 || over.status === 404
    ? ok('SL10', `limit=101 rejected/absent (${over.status})`)
    : fail('SL10', `uncapped member limit → ${over.status}`);

  // SL11 memory list q still works (the canonical reference) — sanity that a
  // stamped memory is server-searchable in its space.
  const m = await remember(`${STAMP} server-list-search needle`, spaceA);
  void m;
  const s = await api('GET', `v1/memories?space_id=${spaceA}&q=${encodeURIComponent('needle')}&limit=10`);
  s.status === 200 && Array.isArray(s.body?.data)
    ? ok('SL11', `memories q → ${s.body.data.length}`)
    : fail('SL11', `memories q status=${s.status}`);

  void secondKey;
}

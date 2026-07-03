#!/usr/bin/env node
// Trix capability suite — executable form of CAPABILITY-TEST-CASES.md.
// Zero deps. Creates everything inside stamped test spaces and cleans up in
// a finally block, pass or fail.
//
//   TRIX_API_KEY=<key> [TRIX_API_URL=https://api.trixdb.com] \
//     node tests/platform-verify/capability-suite.mjs

const API_URL = process.env.TRIX_API_URL ?? 'https://api.trixdb.com';
const API_KEY = process.env.TRIX_API_KEY;
const STAMP = `capsuite-${Date.now().toString(36)}`;

if (!API_KEY) {
  console.error('TRIX_API_KEY env var required');
  process.exit(2);
}

const results = [];
const ok = (id, note = '') => results.push({ id, pass: true, note });
const fail = (id, note) => results.push({ id, pass: false, note });
const skip = (id, note) => results.push({ id, pass: null, note });

async function api(method, path, body, timeoutMs = 30_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    let json = null;
    try { json = await res.json(); } catch { /* 204 etc. */ }
    return { status: res.status, body: json };
  } finally {
    clearTimeout(t);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pollUntil(fn, { timeoutMs = 90_000, everyMs = 3_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await fn();
    if (v) return v;
    await sleep(everyMs);
  }
  return null;
}

// ---------------------------------------------------------------------------
const state = { spaces: [], links: [], memories: [] };

async function makeSpace(tag) {
  const r = await api('POST', 'v1/spaces', { name: `${STAMP}-${tag}`, slug: `${STAMP}-${tag}` });
  if (r.status >= 300) throw new Error(`space create failed: ${r.status} ${JSON.stringify(r.body)}`);
  const id = r.body.id ?? r.body.space?.id;
  state.spaces.push(id);
  return id;
}

async function remember(content, spaceId) {
  const r = await api('POST', 'v1/memories', { content, space_id: spaceId });
  const id = r.body?.id ?? r.body?.memory?.id;
  if (id) state.memories.push(id);
  return { status: r.status, id, body: r.body };
}

async function recall(q, extra = '') {
  const r = await api('GET', `v1/search?q=${encodeURIComponent(q)}&limit=10&include=memories${extra}`);
  return r.body?.results ?? [];
}

// ---------------------------------------------------------------------------
async function spacesSuite() {
  const a = await makeSpace('a');
  ok('S1', `space ${a.slice(0, 8)}`);

  const upd = await api('PATCH', `v1/spaces/${a}`, { description: 'capability suite' });
  upd.status < 300 ? ok('S2') : fail('S2', `PATCH ${upd.status}`);

  const list = await api('GET', 'v1/spaces');
  const rows = list.body?.spaces ?? list.body?.data ?? list.body ?? [];
  (Array.isArray(rows) ? rows : []).some((s) => s.id === a)
    ? ok('S3')
    : fail('S3', 'created space not in list');

  const b = await makeSpace('b');
  const link = await api('POST', `v1/spaces/${a}/links`, { target_space_id: b });
  const linkId = link.body?.id;
  if (link.status === 201 && linkId) {
    ok('S4');
    state.links.push({ a, id: linkId });
  } else {
    fail('S4', `link ${link.status} ${JSON.stringify(link.body)}`);
  }

  const [la, lb] = await Promise.all([
    api('GET', `v1/spaces/${a}/links`),
    api('GET', `v1/spaces/${b}/links`),
  ]);
  const has = (r) => (r.body?.links ?? []).some((l) => l.id === linkId);
  has(la) && has(lb) ? ok('S5') : fail('S5', 'link not visible from both sides');

  const dup = await api('POST', `v1/spaces/${b}/links`, { target_space_id: a });
  dup.status === 400 ? ok('S6') : fail('S6', `expected 400, got ${dup.status}`);

  const refresh = await api('POST', `v1/spaces/${a}/links/${linkId}/refresh`);
  refresh.status === 202 ? ok('S7') : fail('S7', `refresh ${refresh.status}`);

  const unlink = await api('DELETE', `v1/spaces/${a}/links/${linkId}`);
  const again = await api('DELETE', `v1/spaces/${a}/links/${linkId}`);
  unlink.status < 300 && unlink.body?.removed && again.status === 404
    ? ok('S8', JSON.stringify(unlink.body.removed))
    : fail('S8', `unlink ${unlink.status}/${again.status}`);
  state.links = [];

  // Merge: b absorbs a fresh source space with one memory.
  const src = await makeSpace('merge-src');
  await remember(`${STAMP} merge payload`, src);
  const guard = await api('POST', `v1/spaces/${b}/merge`, { source_space_id: src });
  guard.status === 400 ? ok('S10') : fail('S10', `unconfirmed merge ${guard.status}`);

  const merge = await api('POST', `v1/spaces/${b}/merge`, { source_space_id: src, confirm: true });
  if (merge.status < 300 && merge.body?.merged) {
    const gone = await api('GET', `v1/spaces/${src}`);
    gone.status === 404 ? ok('S9', `moved=${JSON.stringify(merge.body.moved?.['memories.space_id'] ?? 0)}`)
      : fail('S9', 'source space still exists');
    state.spaces = state.spaces.filter((s) => s !== src);
  } else {
    fail('S9', `merge ${merge.status} ${JSON.stringify(merge.body)}`);
  }

  const del = await api('DELETE', `v1/spaces/${b}`);
  if (del.status === 204) {
    ok('S11');
    state.spaces = state.spaces.filter((s) => s !== b);
  } else {
    fail('S11', `delete ${del.status}`);
  }
  return { a };
}

async function memoriesSuite(spaceA) {
  const token = `${STAMP}zebra`;
  const m1 = await remember(`The ${token} protocol pairs kiwis with accordions`, spaceA);
  m1.status < 300 && m1.id ? ok('M1') : fail('M1', `store ${m1.status}`);

  const fresh = await recall(token);
  const hit = fresh.find((r) => r.id === m1.id);
  hit ? ok('M2', `match=${hit.match ?? 'n/a'}`) : fail('M2', 'fresh memory not keyword-recallable');

  const embedded = await pollUntil(async () => {
    const r = await api('GET', `v1/memories/${m1.id}`);
    const st = r.body?.embedding_status ?? r.body?.memory?.embedding_status;
    return st === 'completed' ? true : null;
  });
  if (!embedded) {
    skip('M3', 'embedding not completed within 90s');
  } else {
    const sem = await recall('which protocol pairs fruit with musical instruments?');
    sem.some((r) => r.id === m1.id) ? ok('M3') : fail('M3', 'semantic recall missed embedded memory');
  }

  const scoped = await recall(token, `&space_id=${spaceA}`);
  scoped.some((r) => r.id === m1.id) ? ok('M4') : fail('M4', 'space-scoped search missed it');

  const upd = await api('PATCH', `v1/memories/${m1.id}`, {
    content: `The ${token} protocol now pairs mangos with theremins`,
  });
  if (upd.status < 300) {
    const after = await recall(`${token} theremins`);
    after.some((r) => r.id === m1.id) ? ok('M5') : fail('M5', 'updated content not findable');
  } else {
    fail('M5', `PATCH ${upd.status}`);
  }

  const del = await api('DELETE', `v1/memories/${m1.id}`);
  if (del.status < 300) {
    const after = await recall(token);
    after.some((r) => r.id === m1.id) ? fail('M6', 'deleted memory still in search') : ok('M6');
    state.memories = state.memories.filter((id) => id !== m1.id);
  } else {
    fail('M6', `DELETE ${del.status}`);
  }
}

async function relationshipsSuite(spaceA) {
  const x = await remember(`${STAMP} rel-src`, spaceA);
  const y = await remember(`${STAMP} rel-tgt same space`, spaceA);
  const r1 = await api('POST', `v1/relationships/${x.id}`, {
    target_id: y.id,
    relationship_type: 'related_to',
  });
  r1.status < 300 ? ok('R1') : fail('R1', `same-space rel ${r1.status} ${JSON.stringify(r1.body)}`);

  const c = await makeSpace('rel-c');
  const z = await remember(`${STAMP} rel-cross`, c);
  const blocked = await api('POST', `v1/relationships/${x.id}`, {
    target_id: z.id,
    relationship_type: 'related_to',
  });
  blocked.status === 400 ? ok('R2') : fail('R2', `expected 400, got ${blocked.status}`);

  const link = await api('POST', `v1/spaces/${spaceA}/links`, { target_space_id: c });
  const linkId = link.body?.id;
  const allowed = await api('POST', `v1/relationships/${x.id}`, {
    target_id: z.id,
    relationship_type: 'related_to',
  });
  allowed.status < 300 ? ok('R3') : fail('R3', `linked cross-space rel ${allowed.status}`);

  await api('DELETE', `v1/spaces/${spaceA}/links/${linkId}`);
  const rels = await api('GET', `v1/relationships/${x.id}`);
  const edges = rels.body?.relationships ?? rels.body ?? [];
  const crossGone = !(Array.isArray(edges) ? edges : []).some(
    (e) => e.target_id === z.id || e.source_id === z.id
  );
  crossGone ? ok('R4') : fail('R4', 'cross-space edge survived unlink');
}

async function clustersSuite() {
  const trig = await api('POST', 'v1/clusters/full', {});
  trig.status < 300 ? ok('C1') : fail('C1', `trigger ${trig.status} ${JSON.stringify(trig.body)}`);

  const terminal = await pollUntil(
    async () => {
      const r = await api('GET', 'v1/clusters/status');
      const runs = r.body?.recent_runs ?? r.body?.runs ?? [];
      const latest = (Array.isArray(runs) ? runs : [])[0];
      if (!latest) return r.body?.status === 'completed' ? { status: 'completed' } : null;
      return ['completed', 'failed'].includes(latest.status) ? latest : null;
    },
    { timeoutMs: 180_000, everyMs: 5_000 }
  );
  if (!terminal) skip('C2', 'no terminal clustering state within 3 min');
  else if (terminal.status === 'completed') ok('C2');
  else fail('C2', `clustering run failed: ${JSON.stringify(terminal).slice(0, 160)}`);

  const list = await api('GET', 'v1/clusters?has_memories=true&limit=5');
  const total = list.body?.pagination?.total;
  list.status === 200 && Number.isInteger(total)
    ? ok('C3', `total=${total}`)
    : fail('C3', `clusters list ${list.status}`);
}

async function processingSuite() {
  const r = await api('GET', 'v1/memories/processing');
  const b = r.body ?? {};
  const keys = ['total', 'processed', 'in_flight', 'failed', 'clustered', 'clustering_runs_active', 'percent'];
  const shapeOk = r.status === 200 && keys.every((k) => Number.isFinite(b[k]));
  shapeOk && b.percent >= 0 && b.percent <= 100
    ? ok('P1', `percent=${b.percent} in_flight=${b.in_flight} failed=${b.failed}`)
    : fail('P1', `bad shape: ${r.status} ${JSON.stringify(b).slice(0, 120)}`);
}

// ---------------------------------------------------------------------------
async function cleanup() {
  for (const { a, id } of state.links) {
    await api('DELETE', `v1/spaces/${a}/links/${id}`).catch(() => {});
  }
  for (const id of state.memories) {
    await api('DELETE', `v1/memories/${id}`).catch(() => {});
  }
  for (const id of state.spaces) {
    await api('DELETE', `v1/spaces/${id}`).catch(() => {});
  }
  // Semantic search returns nearest-neighbors even for garbage queries, so
  // only rows whose CONTENT actually carries the stamp count as leftovers.
  const leftovers = (await recall(STAMP)).filter((r) => (r.content ?? '').includes(STAMP));
  if (leftovers.length > 0) {
    console.error(`CLEANUP WARNING: ${leftovers.length} stamped memories still searchable`);
  }
}

(async () => {
  console.log(`capability suite → ${API_URL} (stamp ${STAMP})`);
  try {
    const { a } = await spacesSuite();
    await memoriesSuite(a);
    await relationshipsSuite(a);
    await clustersSuite();
    await processingSuite();
  } catch (err) {
    fail('SUITE', String(err));
  } finally {
    await cleanup();
  }

  let failed = 0;
  for (const r of results) {
    const mark = r.pass === true ? 'PASS' : r.pass === false ? 'FAIL' : 'SKIP';
    if (r.pass === false) failed++;
    console.log(`${mark}  ${r.id}${r.note ? `  — ${r.note}` : ''}`);
  }
  console.log(`\n${results.filter((r) => r.pass).length} passed, ${failed} failed, ${results.filter((r) => r.pass === null).length} skipped`);
  process.exit(failed > 0 ? 1 : 0);
})();

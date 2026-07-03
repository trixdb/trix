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
const state = { spaces: [], links: [], memories: [], keys: [], webhooks: [], agents: [], tasks: [], goals: [], habits: [] };

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
// Expansion suites (see CAPABILITY-TEST-CASES.md §M+/T/G/H/W/A/K/SE/KK)

async function memoriesAdvancedSuite(spaceA, secondKey) {
  const tokenBase = `${STAMP}advanced`;

  // M7 duplicate detection: identical content -> 200 {duplicate:true, same id}
  const c1 = await remember(`${tokenBase} the moon is made of regolith`, spaceA);
  const dup = await api('POST', 'v1/memories', {
    content: `${tokenBase} the moon is made of regolith`,
    space_id: spaceA,
  });
  dup.status === 200 && dup.body?.duplicate === true && dup.body?.memory_ids?.[0] === c1.id
    ? ok('M7')
    : fail('M7', `expected duplicate:true w/ original id, got ${dup.status} ${JSON.stringify(dup.body).slice(0, 100)}`);

  // M8 tags: normalized lowercase + overlap filter on list
  const tagged = await api('POST', 'v1/memories', {
    content: `${tokenBase} tagged memory`,
    space_id: spaceA,
    tags: ['CapSuite', 'zeta'],
  });
  if (tagged.body?.id) state.memories.push(tagged.body.id);
  const lowered = (tagged.body?.tags ?? []).includes('capsuite');
  const byTag = await api('GET', `v1/memories?tags=capsuite&limit=50`);
  const listed = (byTag.body?.data ?? []).some((m) => m.id === tagged.body?.id);
  lowered && listed ? ok('M8') : fail('M8', `lowered=${lowered} listed=${listed}`);

  // M9 pin via PATCH + pinned listing
  await api('PATCH', `v1/memories/${tagged.body.id}`, { is_pinned: true });
  const pinned = await api('GET', 'v1/memories?is_pinned=true&limit=50');
  (pinned.body?.data ?? []).some((m) => m.id === tagged.body.id)
    ? ok('M9')
    : fail('M9', 'pinned memory not in is_pinned listing');

  // M10 protection: soft-protected blocks hard delete; none re-enables it
  await api('PATCH', `v1/memories/${tagged.body.id}`, { protection_level: 'soft' });
  const blocked = await api('DELETE', `v1/memories/${tagged.body.id}`);
  const unprotect = await api('PATCH', `v1/memories/${tagged.body.id}`, { protection_level: 'none' });
  blocked.status === 403 && unprotect.status === 200
    ? ok('M10')
    : fail('M10', `hard-delete on soft-protected ${blocked.status}, unprotect ${unprotect.status}`);

  // M11 soft delete + restore
  const soft = await api('DELETE', `v1/memories/${tagged.body.id}?soft=true`);
  const restored = await api('POST', `v1/memories/${tagged.body.id}/restore`);
  soft.status === 200 && soft.body?.success && restored.status === 200
    ? ok('M11')
    : fail('M11', `soft ${soft.status}, restore ${restored.status}`);

  // M12 private memory invisible to a second (non-admin) key
  if (!secondKey) {
    skip('M12', 'no second key');
  } else {
    const priv = await api('POST', 'v1/memories', { content: `${tokenBase} private`, is_private: true });
    if (priv.body?.id) state.memories.push(priv.body.id);
    const asOther = await fetch(`${API_URL}/v1/memories/${priv.body.id}`, {
      headers: { Authorization: `Bearer ${secondKey}` },
    });
    asOther.status === 404 ? ok('M12') : fail('M12', `other key sees private memory: ${asOther.status}`);
  }

  // M13 bulk create + bulk delete
  const bulk = await api('POST', 'v1/memories/bulk', {
    memories: [1, 2, 3].map((i) => ({ content: `${tokenBase} bulk ${i}`, space_id: spaceA })),
  });
  const bulkIds = (bulk.body?.succeeded ?? []).map((m) => m.id);
  const bulkDel = await api('DELETE', 'v1/memories/bulk', { ids: bulkIds });
  bulk.status === 201 && bulkIds.length === 3 && bulkDel.status === 200
    ? ok('M13')
    : fail('M13', `bulk ${bulk.status}/${bulkIds.length}, delete ${bulkDel.status}`);

  // M14 edit history records the PATCH
  await api('PATCH', `v1/memories/${tagged.body.id}`, { content: `${tokenBase} edited` });
  const hist = await api('GET', `v1/memories/${tagged.body.id}/history`);
  const edits = Array.isArray(hist.body) ? hist.body : hist.body?.edits ?? hist.body?.data ?? [];
  hist.status === 200 && edits.length >= 1 ? ok('M14') : fail('M14', `history ${hist.status} len=${edits.length}`);

  // M15 export (json)
  const exp = await api('GET', `v1/export/memories?space_id=${spaceA}&limit=10`);
  exp.status === 200 ? ok('M15') : fail('M15', `export ${exp.status}`);

  // M16 batch search across strategies
  const batch = await api('POST', 'v1/search/batch', {
    searches: [
      { strategy: 'fulltext', query: tokenBase, limit: 10 },
      { strategy: 'semantic', query: 'moon surface material', limit: 10 },
    ],
  });
  batch.status === 200 && Array.isArray(batch.body?.strategies) && Array.isArray(batch.body?.memories)
    ? ok('M16', `total=${batch.body.total_results}`)
    : fail('M16', `batch ${batch.status}`);

  // M17 aggregate search grouped by tags
  const agg = await api('GET', `v1/search/aggregate?query=${encodeURIComponent(tokenBase)}&group_by=tags&limit=5`);
  agg.status === 200 && Array.isArray(agg.body?.groups)
    ? ok('M17')
    : fail('M17', `aggregate ${agg.status} ${JSON.stringify(agg.body).slice(0, 80)}`);
}

async function tasksSuite(spaceA) {
  const t = await api('POST', 'v1/tasks', { title: `${STAMP} task`, space_id: spaceA });
  const taskId = t.body?.id;
  if (taskId) state.tasks.push(taskId);
  t.status === 201 && t.body?.status === 'todo' ? ok('T1') : fail('T1', `create ${t.status}`);

  const list = await api('GET', `v1/tasks?space_id=${spaceA}`);
  (list.body?.tasks ?? []).some((x) => x.id === taskId) ? ok('T2') : fail('T2', 'task not listed');

  const sub = await api('POST', `v1/tasks/${taskId}/subtasks`, { title: `${STAMP} subtask` });
  sub.status === 201 ? ok('T3') : fail('T3', `subtask ${sub.status}`);

  // Completing with an incomplete subtask succeeds WITH a warning
  const done = await api('PATCH', `v1/tasks/${taskId}`, { status: 'done' });
  done.status === 200 && done.body?.status === 'done' && Array.isArray(done.body?.warnings)
    ? ok('T4', done.body.warnings[0] ?? '')
    : fail('T4', `complete ${done.status} warnings=${JSON.stringify(done.body?.warnings)}`);

  const del = await api('DELETE', `v1/tasks/${taskId}`);
  if (del.status === 204) {
    ok('T5');
    state.tasks = state.tasks.filter((id) => id !== taskId);
  } else fail('T5', `delete ${del.status}`);
}

async function goalsSuite() {
  const g = await api('POST', 'v1/goals', { title: `${STAMP} goal` });
  const goalId = g.body?.id;
  if (goalId) state.goals.push(goalId);
  g.status === 201 && g.body?.progress === 0 ? ok('G1') : fail('G1', `create ${g.status}`);

  const prog = await api('POST', `v1/goals/${goalId}/progress`, { progress: 0.5 });
  prog.status === 200 && Number(prog.body?.progress) === 0.5 ? ok('G2') : fail('G2', `progress ${prog.status} ${prog.body?.progress}`);

  // Goals are born 'draft'; the lifecycle is draft -> active -> completed.
  await api('POST', `v1/goals/${goalId}/status`, { status: 'active' });
  const status = await api('POST', `v1/goals/${goalId}/status`, { status: 'completed' });
  status.status === 200 ? ok('G3') : fail('G3', `status ${status.status}`);

  // PATCH requires version (optimistic locking) — missing version is a 400
  const noVersion = await api('PATCH', `v1/goals/${goalId}`, { title: 'x' });
  noVersion.status === 400 ? ok('G4') : fail('G4', `expected 400, got ${noVersion.status}`);

  const del = await api('DELETE', `v1/goals/${goalId}`);
  if (del.status === 204) {
    ok('G5');
    state.goals = state.goals.filter((id) => id !== goalId);
  } else fail('G5', `delete ${del.status}`);
}

async function habitsSuite() {
  const h = await api('POST', 'v1/habits', { name: `${STAMP} habit` });
  const habitId = h.body?.id;
  if (habitId) state.habits.push(habitId);
  h.status === 201 && h.body?.streak && h.body.streak.current_streak === 0
    ? ok('H1')
    : fail('H1', `create ${h.status} streak=${JSON.stringify(h.body?.streak)}`);

  const ci = await api('POST', `v1/habits/${habitId}/check-in`, {});
  ci.status === 201 && ci.body?.completed_date ? ok('H2') : fail('H2', `check-in ${ci.status}`);

  const hist = await api('GET', `v1/habits/${habitId}/history`);
  (hist.body?.completions ?? []).length >= 1 ? ok('H3') : fail('H3', 'no completion in history');

  const analytics = await api('GET', `v1/habits/${habitId}/analytics`);
  analytics.status === 200 && Number.isFinite(analytics.body?.total_completions)
    ? ok('H4', `streak=${analytics.body.current_streak}`)
    : fail('H4', `analytics ${analytics.status}`);

  const del = await api('DELETE', `v1/habits/${habitId}`);
  if (del.status === 204) {
    ok('H5');
    state.habits = state.habits.filter((id) => id !== habitId);
  } else fail('H5', `delete ${del.status}`);
}

async function webhooksSuite() {
  const w = await api('POST', 'v1/webhooks', {
    url: 'https://example.com/capsuite-hook',
    events: ['memory.created'],
  });
  const hookId = w.body?.webhook?.id;
  if (hookId) state.webhooks.push(hookId);
  w.status === 201 && w.body?.webhook?.secret && w.body?.webhook?.status === 'active'
    ? ok('W1')
    : fail('W1', `create ${w.status}`);

  const list = await api('GET', 'v1/webhooks');
  (list.body?.webhooks ?? []).some((x) => x.id === hookId) ? ok('W2') : fail('W2', 'hook not listed');

  const bad = await api('POST', 'v1/webhooks', { url: 'https://example.com/x', events: ['not.a.real.event'] });
  bad.status === 400 ? ok('W3') : fail('W3', `invalid event ${bad.status}`);
  if (bad.body?.webhook?.id) state.webhooks.push(bad.body.webhook.id);

  const del = await api('DELETE', `v1/webhooks/${hookId}`);
  if (del.status === 204) {
    ok('W4');
    state.webhooks = state.webhooks.filter((id) => id !== hookId);
  } else fail('W4', `delete ${del.status}`);
}

async function agentsSuite() {
  const a = await api('POST', 'v1/agents', { name: `${STAMP} agent` });
  const agentId = a.body?.id;
  if (agentId) state.agents.push(agentId);
  a.status === 201 && a.body?.slug && a.body?.model ? ok('A1', a.body.model) : fail('A1', `create ${a.status}`);

  const bySlug = await api('GET', `v1/agents/${a.body?.slug}`);
  bySlug.status === 200 && bySlug.body?.id === agentId ? ok('A2') : fail('A2', `get-by-slug ${bySlug.status}`);

  const upd = await api('PATCH', `v1/agents/${agentId}`, { description: 'capability suite' });
  upd.status === 200 ? ok('A3') : fail('A3', `patch ${upd.status}`);

  const del = await api('DELETE', `v1/agents/${agentId}`);
  if (del.status === 204) {
    ok('A4');
    state.agents = state.agents.filter((id) => id !== agentId);
  } else fail('A4', `delete ${del.status}`);
}

async function knowledgeSuite(spaceA) {
  const facts = await api('GET', 'v1/knowledge/facts?limit=5');
  facts.status === 200 && Array.isArray(facts.body?.facts) && Number.isInteger(facts.body?.total)
    ? ok('K1', `total=${facts.body.total}`)
    : fail('K1', `facts ${facts.status}`);

  const entities = await api('GET', 'v1/knowledge/entities?limit=5');
  entities.status === 200 && Array.isArray(entities.body?.entities)
    ? ok('K2', `total=${entities.body.total}`)
    : fail('K2', `entities ${entities.status}`);

  // Manual fact on a memory (content + importance required)
  const mem = await remember(`${STAMP} fact host memory`, spaceA);
  const factOk = await api('POST', `v1/memories/${mem.id}/facts`, {
    content: 'capability suites catch wiring bugs',
    importance: 5,
  });
  const factBad = await api('POST', `v1/memories/${mem.id}/facts`, { content: 'missing importance' });
  factOk.status === 201 && factBad.status === 400
    ? ok('K3')
    : fail('K3', `fact ${factOk.status}, negative ${factBad.status}`);

  const comm = await api('GET', 'v1/communities?limit=5');
  comm.status === 200 && Array.isArray(comm.body?.data) && Number.isInteger(comm.body?.pagination?.total)
    ? ok('K4', `total=${comm.body.pagination.total}`)
    : fail('K4', `communities ${comm.status}`);

  // 200 = ran sync, 202 = queued, 503 = honestly unavailable on this deploy.
  // Anything else (esp. 500) is a wiring bug.
  const detect = await api('POST', 'v1/communities/detect', {});
  [200, 202, 503].includes(detect.status)
    ? ok('K5', `status=${detect.status}`)
    : fail('K5', `detect ${detect.status}`);
}

async function spacesExtrasSuite() {
  const slug = `${STAMP}-extras`;
  const sp = await api('POST', 'v1/spaces', { name: slug, slug });
  const spaceId = sp.body?.id ?? sp.body?.space?.id;
  state.spaces.push(spaceId);

  const bySlug = await api('GET', `v1/spaces/${slug}`);
  bySlug.status === 200 && bySlug.body?.id === spaceId ? ok('SE1') : fail('SE1', `by-slug ${bySlug.status}`);

  const cfg = await api('GET', `v1/spaces/${spaceId}/config`);
  cfg.status === 200 && cfg.body?.config ? ok('SE2') : fail('SE2', `config ${cfg.status}`);

  const feat = await api('PUT', `v1/spaces/${spaceId}/features/nonexistent-feature-key`, { enabled: false });
  feat.status === 400 ? ok('SE3') : fail('SE3', `unknown feature key ${feat.status}`);
}

async function apiKeysSuite() {
  const created = await api('POST', 'v1/accounts/api-keys', { name: `${STAMP}-secondary` });
  const keyId = created.body?.id;
  const keyValue = created.body?.key;
  if (keyId) state.keys.push(keyId);
  created.status === 201 && keyValue && created.body?.key_prefix
    ? ok('KK1')
    : fail('KK1', `create ${created.status}`);

  const dupName = await api('POST', 'v1/accounts/api-keys', { name: `${STAMP}-secondary` });
  dupName.status === 409 ? ok('KK2') : fail('KK2', `duplicate name ${dupName.status}`);
  if (dupName.body?.id) state.keys.push(dupName.body.id);

  return keyValue;
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
  for (const [kind, path] of [
    ['webhooks', 'v1/webhooks'],
    ['agents', 'v1/agents'],
    ['tasks', 'v1/tasks'],
    ['goals', 'v1/goals'],
    ['habits', 'v1/habits'],
    ['keys', 'v1/accounts/api-keys'],
  ]) {
    for (const id of state[kind]) {
      await api('DELETE', `${path}/${id}`).catch(() => {});
    }
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
    const secondKey = await apiKeysSuite();
    await memoriesAdvancedSuite(a, secondKey);
    await tasksSuite(a);
    await goalsSuite();
    await habitsSuite();
    await webhooksSuite();
    await agentsSuite();
    await knowledgeSuite(a);
    await spacesExtrasSuite();
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

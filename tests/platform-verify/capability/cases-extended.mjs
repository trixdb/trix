import { api, apiAs, ok, fail, skip, state, STAMP, API_URL, makeSpace, remember, recall, pollUntil, sleep } from './lib.mjs';

export async function memoriesAdvancedSuite(spaceA, secondKey) {
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
      headers: { Authorization: `Bearer ${secondKey.key}` },
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

export async function tasksSuite(spaceA) {
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

export async function goalsSuite() {
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

export async function habitsSuite() {
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

export async function webhooksSuite() {
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

export async function agentsSuite() {
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

export async function knowledgeSuite(spaceA) {
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

export async function spacesExtrasSuite() {
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

export async function apiKeysSuite() {
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

  return keyId && keyValue ? { id: keyId, key: keyValue } : null;
}

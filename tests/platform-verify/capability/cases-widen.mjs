import { api, apiAs, ok, fail, state, STAMP, makeSpace, remember } from './lib.mjs';

// W+ — widened domains: projects, saved searches, billing, grants,
// pipelines, skills, workflows, conflicts, insights, personas tombstone.

export async function projectsSuite() {
  const p = await api('POST', 'v1/projects', { name: `${STAMP} project` });
  const projectId = p.body?.id;
  if (projectId) state.projects.push(projectId);
  p.status === 201 ? ok('PJ1') : fail('PJ1', `create ${p.status}`);

  const sp = await makeSpace('proj');
  const link = await api('POST', `v1/projects/${projectId}/spaces`, { space_id: sp });
  link.status === 201 ? ok('PJ2') : fail('PJ2', `link space ${link.status}`);

  const got = await api('GET', `v1/projects/${projectId}`);
  (got.body?.spaces ?? []).some((s) => s.id === sp || s.space_id === sp)
    ? ok('PJ3')
    : fail('PJ3', 'linked space not embedded in project');

  const unlink = await api('DELETE', `v1/projects/${projectId}/spaces/${sp}`);
  unlink.status === 204 ? ok('PJ4') : fail('PJ4', `unlink ${unlink.status}`);

  const del = await api('DELETE', `v1/projects/${projectId}`);
  if (del.status === 204) {
    ok('PJ5');
    state.projects = state.projects.filter((id) => id !== projectId);
  } else fail('PJ5', `delete ${del.status}`);
}

export async function savedSearchesSuite() {
  const c = await api('POST', 'v1/searches/saved', {
    name: `${STAMP} saved`,
    query_params: { query: `${STAMP} anything`, mode: 'semantic' },
  });
  const id = c.body?.id;
  if (id) state.savedSearches.push(id);
  c.status === 201 ? ok('SS1') : fail('SS1', `create ${c.status}`);

  const list = await api('GET', 'v1/searches/saved');
  (list.body?.saved_searches ?? []).some((s) => s.id === id) ? ok('SS2') : fail('SS2', 'not listed');

  const run = await api('GET', `v1/searches/saved/${id}/run`);
  run.status === 200 && Array.isArray(run.body?.results)
    ? ok('SS3', `count=${run.body.count}`)
    : fail('SS3', `run ${run.status}`);

  const del = await api('DELETE', `v1/searches/saved/${id}`);
  if (del.status === 200 && del.body?.success) {
    ok('SS4');
    state.savedSearches = state.savedSearches.filter((x) => x !== id);
  } else fail('SS4', `delete ${del.status}`);
}

export async function billingSuite() {
  const b = await api('POST', 'v1/billing/budgets', { credit_limit: 1234 });
  const budgetId = b.body?.id;
  if (budgetId) state.budgets.push(budgetId);
  b.status === 201 ? ok('B1') : fail('B1', `create ${b.status}`);

  const got = await api('GET', `v1/billing/budgets/${budgetId}`);
  got.status === 200 ? ok('B2') : fail('B2', `get ${got.status}`);

  const upd = await api('PUT', `v1/billing/budgets/${budgetId}`, { credit_limit: 2345 });
  upd.status === 200 ? ok('B3') : fail('B3', `PUT ${upd.status}`);

  const del = await api('DELETE', `v1/billing/budgets/${budgetId}`);
  if (del.status === 204) {
    ok('B4');
    state.budgets = state.budgets.filter((x) => x !== budgetId);
  } else fail('B4', `delete ${del.status}`);

  const credits = await api('GET', 'v1/billing/credits');
  credits.status === 200 && credits.body?.balance ? ok('B5') : fail('B5', `credits ${credits.status}`);

  // Spending limit round-trip: set then restore the previous value.
  const before = await api('GET', 'v1/billing/spending-limit');
  const prev = before.body?.spending_limit ?? null;
  const set = await api('PUT', 'v1/billing/spending-limit', { limit: 999999 });
  const restore = await api('PUT', 'v1/billing/spending-limit', { limit: prev });
  set.status === 200 && restore.status === 200 ? ok('B6') : fail('B6', `set ${set.status} restore ${restore.status}`);
}

export async function grantsSuite(spaceA, secondKey) {
  if (!secondKey) {
    fail('GR1', 'no second key');
    return;
  }
  // Baseline: the (non-admin) second key cannot read a space-scoped memory.
  const m = await remember(`${STAMP} grants payload`, spaceA);
  const before = await apiAs(secondKey.key, 'GET', `v1/memories/${m.id}`);
  before.status === 404 ? ok('GR1') : fail('GR1', `pre-grant read ${before.status}`);

  const grant = await api('POST', `v1/spaces/${spaceA}/grants`, {
    actor_type: 'api_key',
    actor_id: secondKey.id,
    permission: 'read',
  });
  const grantId = grant.body?.id;
  grant.status === 201 ? ok('GR2') : fail('GR2', `grant ${grant.status} ${JSON.stringify(grant.body).slice(0, 80)}`);

  // With the grant, the same read now succeeds.
  const after = await apiAs(secondKey.key, 'GET', `v1/memories/${m.id}`);
  after.status === 200 ? ok('GR3') : fail('GR3', `post-grant read ${after.status}`);

  const revoke = await api('DELETE', `v1/spaces/${spaceA}/grants/${grantId}`);
  const again = await apiAs(secondKey.key, 'GET', `v1/memories/${m.id}`);
  revoke.status === 204 && again.status === 404
    ? ok('GR4')
    : fail('GR4', `revoke ${revoke.status}, post-revoke read ${again.status}`);
}

export async function pipelinesSuite(spaceA) {
  const name = `${STAMP}-preset`.slice(0, 60);
  // A preset is a full pipeline spec: retrieval.strategy + top_k are required.
  const c = await api('POST', 'v1/pipeline-presets', {
    name,
    retrieval: { strategy: 'hybrid', top_k: 20 },
  });
  if (c.status === 201) state.pipelinePresets.push(name);
  c.status === 201 ? ok('PP1') : fail('PP1', `create ${c.status} ${JSON.stringify(c.body).slice(0, 80)}`);

  const setDef = await api('POST', `v1/spaces/${spaceA}/default-pipeline/${name}`);
  setDef.status < 300 ? ok('PP2') : fail('PP2', `set default ${setDef.status}`);

  const resolve = await api('GET', `v1/pipeline-presets/_resolve?space_id=${spaceA}`);
  resolve.status === 200 && resolve.body?.source === 'space' && resolve.body?.name === name
    ? ok('PP3')
    : fail('PP3', `resolve ${resolve.status} ${JSON.stringify(resolve.body).slice(0, 80)}`);

  const clear = await api('DELETE', `v1/spaces/${spaceA}/default-pipeline`);
  clear.status === 204 ? ok('PP4') : fail('PP4', `clear ${clear.status}`);

  const del = await api('DELETE', `v1/pipeline-presets/${name}`);
  if (del.status === 204) {
    ok('PP5');
    state.pipelinePresets = state.pipelinePresets.filter((n) => n !== name);
  } else fail('PP5', `delete ${del.status}`);
}

export async function skillsSuite() {
  const body = { name: `${STAMP}-skill`, description: 'capability suite skill', content: '# Skill\nDo the thing.' };
  const c = await api('POST', 'v1/skills', body);
  const id = c.body?.id;
  if (id) state.skills.push(id);
  c.status === 201 ? ok('SK1') : fail('SK1', `create ${c.status}`);

  const dup = await api('POST', 'v1/skills', body);
  dup.status === 409 ? ok('SK2') : fail('SK2', `dup name ${dup.status}`);
  if (dup.body?.id) state.skills.push(dup.body.id);

  const del = await api('DELETE', `v1/skills/${id}`);
  if (del.status === 204) {
    ok('SK3');
    state.skills = state.skills.filter((x) => x !== id);
  } else fail('SK3', `delete ${del.status}`);
}

export async function workflowsSuite() {
  const c = await api('POST', 'v1/workflows', { name: `${STAMP} workflow` });
  const id = c.body?.id;
  if (id) state.workflows.push(id);
  c.status === 201 ? ok('WF1') : fail('WF1', `create ${c.status}`);

  const got = await api('GET', `v1/workflows/${id}`);
  got.status === 200 ? ok('WF2') : fail('WF2', `get ${got.status}`);

  const del = await api('DELETE', `v1/workflows/${id}`);
  if (del.status === 204) {
    ok('WF3');
    state.workflows = state.workflows.filter((x) => x !== id);
  } else fail('WF3', `delete ${del.status}`);
}

export async function observabilitySuite(spaceA) {
  const conflicts = await api('GET', 'v1/conflicts?status=pending&limit=5');
  conflicts.status === 200 && Array.isArray(conflicts.body?.conflicts)
    ? ok('CF1')
    : fail('CF1', `conflicts ${conflicts.status}`);

  const stats = await api('GET', 'v1/conflicts/stats');
  stats.status === 200 && Number.isFinite(stats.body?.total) ? ok('CF2') : fail('CF2', `stats ${stats.status}`);

  const m = await remember(`${STAMP} insights payload`, spaceA);
  const insights = await api('GET', `v1/memories/${m.id}/insights`);
  insights.status === 200 && insights.body?.memory_id === m.id
    ? ok('IN1')
    : fail('IN1', `insights ${insights.status}`);

  const chunks = await api('GET', `v1/memories/${m.id}/chunks`);
  chunks.status === 200 && Number.isInteger(chunks.body?.total_chunks)
    ? ok('IN2')
    : fail('IN2', `chunks ${chunks.status}`);

  const summary = await api('GET', `v1/spaces/${spaceA}/summary`);
  summary.status === 200 && Number.isInteger(summary.body?.memoryCount)
    ? ok('IN3')
    : fail('IN3', `space summary ${summary.status}`);

  const trending = await api('GET', 'v1/topics/trending?days=30&limit=5');
  trending.status === 200 ? ok('IN4') : fail('IN4', `trending ${trending.status}`);

  const conv = await api('GET', `v1/conversations?space_id=${spaceA}`);
  conv.status === 200 && Array.isArray(conv.body?.conversations ?? conv.body)
    ? ok('CV1')
    : fail('CV1', `conversations ${conv.status}`);

  const personas = await api('GET', 'v1/personas');
  personas.status === 410 && personas.body?.code === 'PERSONAS_MERGED_INTO_AGENTS'
    ? ok('CV2')
    : fail('CV2', `personas tombstone ${personas.status}`);
}

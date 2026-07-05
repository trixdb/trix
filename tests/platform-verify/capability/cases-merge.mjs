import { api, ok, fail, skip, state, STAMP, makeSpace, remember, recall } from './lib.mjs';

// MG — merge contract + blast radius (round 4, from recon-merge-contract.json
// and recon-blast-radius.json). Merge reparents every FK-to-spaces(id) column
// plus the NO_FK_REFS pair (budget_configs.scope_id, event_journal.space_id),
// resolves unique collisions by DROPPING the source row (target wins),
// hard-deletes the source, and reports it all in `moved`. These cases assert
// the recon-documented ACTUAL contract — no pending fix involved.

const movedCount = (v) => (typeof v === 'number' ? v : (v?.moved ?? 0) + (v?.dropped ?? 0));

async function merge(tgt, src) {
  const r = await api('POST', `v1/spaces/${tgt}/merge`, { source_space_id: src, confirm: true });
  if (r.status < 300) state.spaces = state.spaces.filter((s) => s !== src);
  return r;
}

const grantRows = (r) => (Array.isArray(r.body) ? r.body : (r.body?.grants ?? []));

export async function mergeContractSuite(secondKey) {
  // MG1 error matrix: self-merge (uuid AND slug alias of the same space),
  // confirm:false, bogus slug → 404 vs bogus UUID → 403 (identifier-form
  // asymmetry: UUIDs skip resolveSpace and die at canAccessSpace).
  const a = await makeSpace('mg1a');
  const b = await makeSpace('mg1b');
  const selfUuid = await api('POST', `v1/spaces/${a}/merge`, { source_space_id: a, confirm: true });
  const selfSlug = await api('POST', `v1/spaces/${STAMP}-mg1a/merge`, { source_space_id: a, confirm: true });
  const unconfirmed = await api('POST', `v1/spaces/${b}/merge`, { source_space_id: a, confirm: false });
  const bogusSlug = await api('POST', `v1/spaces/${b}/merge`, { source_space_id: `no-such-${STAMP}`, confirm: true });
  const bogusUuid = await api('POST', `v1/spaces/${b}/merge`, { source_space_id: crypto.randomUUID(), confirm: true });
  const intact = (await api('GET', `v1/spaces/${a}`)).status === 200;
  selfUuid.status === 400 && selfSlug.status === 400 && unconfirmed.status === 400
    && bogusSlug.status === 404 && bogusUuid.status === 403 && intact
    ? ok('MG1')
    : fail('MG1', `self=${selfUuid.status}/${selfSlug.status} confirm=${unconfirmed.status} slug=${bogusSlug.status} uuid=${bogusUuid.status} intact=${intact}`);

  await mergeCensus(secondKey);
  await mergeFeatureCollision();
  await mergeGrantCollision(secondKey);
}

async function mergeCensus(secondKey) {
  // MG2 moved-map census: seed one row of each reparented type in the source;
  // every corresponding key must appear in `moved` with count ≥ 1, the
  // NO_FK_REFS keys must exist even at zero, and the map covers the full FK
  // catalog (≥40 keys). MG3 then verifies each entity references the target.
  const src = await makeSpace('mg2src');
  const tgt = await makeSpace('mg2tgt');
  const mem = await remember(`${STAMP} mg2 census memory`, src);
  const hook = await api('POST', 'v1/webhooks', {
    url: 'https://example.com/capsuite-mg2', events: ['memory.created'], space_id: src,
  });
  const hookId = hook.body?.webhook?.id;
  if (hookId) state.webhooks.push(hookId);
  const note = await api('POST', 'v1/notes', { title: `${STAMP} mg2 note`, space_id: src });
  const noteId = note.body?.id ?? note.body?.note?.id;
  if (noteId) state.notes.push(noteId);
  const label = await api('POST', 'v1/labels', { name: `${STAMP}-mg2-label`, space_id: src });
  const featKey = ((await api('GET', `v1/spaces/${src}/features`)).body?.features ?? [])[0]?.key;
  const feat = featKey
    ? await api('PUT', `v1/spaces/${src}/features/${featKey}`, { enabled: false })
    : { status: 0 };
  const grant = secondKey
    ? await api('POST', `v1/spaces/${src}/grants`, { actor_type: 'api_key', actor_id: secondKey.id, permission: 'read' })
    : { status: 0 };
  const proj = await api('POST', 'v1/projects', { name: `${STAMP} mg2 project` });
  const projId = proj.body?.id;
  if (projId) state.projects.push(projId);
  await api('POST', `v1/projects/${projId}/spaces`, { space_id: src });

  const m = await merge(tgt, src);
  const moved = m.body?.moved ?? {};
  const seeded = ['memories.space_id', 'webhooks.space_id', 'notes.space_id', 'labels.space_id',
    'space_feature_configs.space_id', 'project_spaces.space_id'];
  if (secondKey) seeded.push('space_grants.space_id');
  const missing = seeded.filter((k) => movedCount(moved[k]) < 1);
  const noFk = 'budget_configs.scope_id' in moved && 'event_journal.space_id' in moved;
  m.status === 200 && m.body?.merged && m.body?.auditId && missing.length === 0
    && noFk && Object.keys(moved).length >= 40
    ? ok('MG2', `${Object.keys(moved).length} moved keys`)
    : fail('MG2', `merge=${m.status} missing=[${missing}] noFk=${noFk} keys=${Object.keys(moved).length} seeds=${[mem.status, hook.status, note.status, label.status, feat.status, grant.status, proj.status]}`);

  // MG3 seeded webhook/note/feature/grant/project all reference the target.
  const hooks = await api('GET', `v1/webhooks?space_id=${tgt}`);
  const hookMoved = (hooks.body?.webhooks ?? []).some((w) => w.id === hookId);
  const noteGot = await api('GET', `v1/notes/${noteId}`);
  const noteMoved = (noteGot.body?.space_id ?? noteGot.body?.note?.space_id) === tgt;
  const feats = (await api('GET', `v1/spaces/${tgt}/features`)).body?.features ?? [];
  // No catalog entry seeded (empty features list) => nothing to assert on.
  const featMoved = !featKey
    || feats.some((f) => f.key === featKey && f.enabled === false && f.is_default === false);
  const grantMoved = !secondKey
    || grantRows(await api('GET', `v1/spaces/${tgt}/grants`))
      .some((g) => g.actor_id === secondKey.id && g.permission === 'read');
  const projSpaces = (await api('GET', `v1/projects/${projId}`)).body?.spaces ?? [];
  const projMoved = projSpaces.some((s) => s.id === tgt || s.space_id === tgt);
  hookMoved && noteMoved && featMoved && grantMoved && projMoved
    ? ok('MG3')
    : fail('MG3', `webhook=${hookMoved} note=${noteMoved} feature=${featMoved} grant=${grantMoved} project=${projMoved}`);

  await api('DELETE', `v1/projects/${projId}`);
  state.projects = state.projects.filter((id) => id !== projId);
}

async function mergeFeatureCollision() {
  // MG4 unique-collision fallback: same feature key overridden on BOTH sides
  // → target's row wins, source's dropped, moved value flips to {moved,dropped}.
  const src = await makeSpace('mg4src');
  const tgt = await makeSpace('mg4tgt');
  const key = ((await api('GET', `v1/spaces/${src}/features`)).body?.features ?? [])[0]?.key;
  if (!key) { fail('MG4', 'no feature keys exposed'); return; }
  await api('PUT', `v1/spaces/${src}/features/${key}`, { enabled: false });
  await api('PUT', `v1/spaces/${tgt}/features/${key}`, { enabled: true });
  const m = await merge(tgt, src);
  const v = m.body?.moved?.['space_feature_configs.space_id'];
  const after = ((await api('GET', `v1/spaces/${tgt}/features`)).body?.features ?? [])
    .find((f) => f.key === key);
  m.status === 200 && typeof v === 'object' && (v?.dropped ?? 0) >= 1
    && after?.enabled === true && after?.is_default === false
    ? ok('MG4', `moved=${JSON.stringify(v)}`)
    : fail('MG4', `merge=${m.status} moved=${JSON.stringify(v)} target-config=${JSON.stringify(after ?? null)}`);
}

async function mergeGrantCollision(secondKey) {
  // MG5 grant collision: actor holds admin on source, read on target — after
  // merge exactly one grant survives and it is the target's LOWER one (silent
  // permission downgrade; merge never upgrades).
  if (!secondKey) { skip('MG5', 'no second key'); return; }
  const src = await makeSpace('mg5src');
  const tgt = await makeSpace('mg5tgt');
  const g1 = await api('POST', `v1/spaces/${src}/grants`, { actor_type: 'api_key', actor_id: secondKey.id, permission: 'admin' });
  const g2 = await api('POST', `v1/spaces/${tgt}/grants`, { actor_type: 'api_key', actor_id: secondKey.id, permission: 'read' });
  const m = await merge(tgt, src);
  const v = m.body?.moved?.['space_grants.space_id'];
  const rows = grantRows(await api('GET', `v1/spaces/${tgt}/grants`))
    .filter((g) => g.actor_type === 'api_key' && g.actor_id === secondKey.id);
  m.status === 200 && rows.length === 1 && rows[0].permission === 'read' && (v?.dropped ?? 0) >= 1
    ? ok('MG5', `moved=${JSON.stringify(v)}`)
    : fail('MG5', `merge=${m.status} seed=${g1.status}/${g2.status} grants=${JSON.stringify(rows)} moved=${JSON.stringify(v)}`);
}

export async function mergeBlastRadiusSuite() {
  await mergePipelineLoss();
  await mergeDirectLink();
  await mergeThirdSpaceLink();
  await mergeSourceGone();
  await mergeSavedSearchDangling();
}

async function mergePipelineLoss() {
  // MG6 the source's default pipeline preset lives on the deleted spaces row
  // — silently lost, never inherited by the target (documented actual).
  const src = await makeSpace('mg6src');
  const tgt = await makeSpace('mg6tgt');
  const name = `${STAMP}-mg6`.slice(0, 60);
  const preset = await api('POST', 'v1/pipeline-presets', { name, retrieval: { strategy: 'hybrid', top_k: 20 } });
  if (preset.status === 201) state.pipelinePresets.push(name);
  const set = await api('POST', `v1/spaces/${src}/default-pipeline/${name}`);
  const m = await merge(tgt, src);
  const after = await api('GET', `v1/spaces/${tgt}/default-pipeline`);
  m.status === 200 && set.status < 300 && after.status === 200 && after.body?.name === null
    ? ok('MG6', 'source preset lost as documented')
    : fail('MG6', `preset=${preset.status} set=${set.status} merge=${m.status} target-default=${JSON.stringify(after.body)}`);
  await api('DELETE', `v1/pipeline-presets/${name}`);
  state.pipelinePresets = state.pipelinePresets.filter((n) => n !== name);
}

async function mergeDirectLink() {
  // MG7 a link BETWEEN the merging pair is superseded (reported once) and its
  // tagged artifacts cascade — the cross-space edge dies even though both
  // memories end up co-located in the target.
  const src = await makeSpace('mg7src');
  const tgt = await makeSpace('mg7tgt');
  const link = await api('POST', `v1/spaces/${src}/links`, { target_space_id: tgt });
  const linkId = link.body?.id;
  if (linkId) state.links.push({ a: tgt, id: linkId });
  const x = await remember(`${STAMP} mg7 src memory`, src);
  const y = await remember(`${STAMP} mg7 tgt memory`, tgt);
  const rel = await api('POST', `v1/relationships/${x.id}`, { target_id: y.id, relationship_type: 'related_to' });
  const relId = rel.body?.id ?? rel.body?.relationship?.id;
  const m = await merge(tgt, src);
  if (m.status < 300) state.links = state.links.filter((l) => l.id !== linkId);
  const superseded = m.body?.moved?.['space_links.superseded'];
  const linkGone = !((await api('GET', `v1/spaces/${tgt}/links`)).body?.links ?? []).some((l) => l.id === linkId);
  const edges = (await api('GET', `v1/relationships/${x.id}`)).body?.relationships ?? [];
  // Track the SPECIFIC tagged edge: the relations-enrichment worker may
  // legitimately create fresh related_to edges between the now co-located
  // memories after the merge, so "any edge x<->y" is a flaky proxy.
  const edgeGone = !edges.some((e) => e.id === relId);
  const mx = await api('GET', `v1/memories/${x.id}`);
  const inTgt = (mx.body?.space_id ?? mx.body?.memory?.space_id) === tgt;
  m.status === 200 && superseded === 1 && linkGone && edgeGone && inTgt
    ? ok('MG7', 'link superseded; tagged edge cascade-deleted despite co-location')
    : fail('MG7', `merge=${m.status} rel=${rel.status} superseded=${superseded} linkGone=${linkGone} edgeGone=${edgeGone} inTgt=${inTgt}`);
}

async function mergeThirdSpaceLink() {
  // MG8 links to third spaces are reparented source→target keeping the SAME
  // link id; no superseded key when the pair itself is unlinked.
  const src = await makeSpace('mg8src');
  const tgt = await makeSpace('mg8tgt');
  const c = await makeSpace('mg8c');
  const link = await api('POST', `v1/spaces/${c}/links`, { target_space_id: src });
  const linkId = link.body?.id;
  if (linkId) state.links.push({ a: c, id: linkId });
  const m = await merge(tgt, src);
  const moved = m.body?.moved ?? {};
  const linkMoves = movedCount(moved['space_links.space_a_id']) + movedCount(moved['space_links.space_b_id']);
  const cLinks = (await api('GET', `v1/spaces/${c}/links`)).body?.links ?? [];
  const row = cLinks.find((l) => l.id === linkId);
  const endpoints = row && [row.space_a_id, row.space_b_id].sort().join() === [c, tgt].sort().join();
  const onTgt = ((await api('GET', `v1/spaces/${tgt}/links`)).body?.links ?? []).some((l) => l.id === linkId);
  m.status === 200 && !('space_links.superseded' in moved) && linkMoves === 1
    && cLinks.length === 1 && endpoints && onTgt
    ? ok('MG8')
    : fail('MG8', `merge=${m.status} linkMoves=${linkMoves} superseded=${'space_links.superseded' in moved} cLinks=${cLinks.length} endpoints=${endpoints} onTgt=${onTgt}`);
}

async function mergeSourceGone() {
  // MG9 source hard-deleted: dead id silently lists as empty (200, total 0 —
  // never 404), target absorbs the totals, moved memories searchable scoped
  // to the target.
  const src = await makeSpace('mg9src');
  const tgt = await makeSpace('mg9tgt');
  const token = `${STAMP}mgnine`;
  for (let i = 0; i < 3; i++) await remember(`${STAMP} ${token} src item ${i}`, src);
  for (let i = 0; i < 2; i++) await remember(`${STAMP} mg9 tgt item ${i}`, tgt);
  const pre = await api('GET', `v1/memories?space_id=${src}&limit=50`);
  const m = await merge(tgt, src);
  const srcGone = (await api('GET', `v1/spaces/${src}`)).status === 404;
  const dead = await api('GET', `v1/memories?space_id=${src}&limit=50`);
  const tgtTotal = (await api('GET', `v1/memories?space_id=${tgt}&limit=50`)).body?.pagination?.total;
  const found = (await recall(token, `&space_id=${tgt}`)).some((r) => (r.content ?? '').includes(token));
  m.status === 200 && pre.body?.pagination?.total === 3 && srcGone
    && dead.status === 200 && dead.body?.pagination?.total === 0 && (dead.body?.data ?? []).length === 0
    && tgtTotal === 5 && found
    ? ok('MG9')
    : fail('MG9', `merge=${m.status} pre=${pre.body?.pagination?.total} srcGone=${srcGone} dead=${dead.status}/${dead.body?.pagination?.total} tgt=${tgtTotal} search=${found}`);
}

async function mergeSavedSearchDangling() {
  // MG10 saved_searches.query_params is JSONB with no FK — merge never
  // rewrites it, so a saved search pinned to the source silently returns 0
  // results afterwards (documented actual: 200 + empty, NOT an error).
  const src = await makeSpace('mg10src');
  const tgt = await makeSpace('mg10tgt');
  const token = `mgten${Date.now().toString(36)}`;
  await remember(`${STAMP} ${token} saved-search payload`, src);
  const saved = await api('POST', 'v1/searches/saved', {
    name: `${STAMP} mg10`, query_params: { query: token, mode: 'fulltext', space_id: src },
  });
  const savedId = saved.body?.id;
  if (savedId) state.savedSearches.push(savedId);
  const pre = await api('GET', `v1/searches/saved/${savedId}/run`);
  const m = await merge(tgt, src);
  const post = await api('GET', `v1/searches/saved/${savedId}/run`);
  const listed = ((await api('GET', 'v1/searches/saved')).body?.saved_searches ?? []).find((s) => s.id === savedId);
  const stillSrc = listed?.query_params?.space_id === src;
  m.status === 200 && (pre.body?.results ?? []).length >= 1
    && post.status === 200 && (post.body?.results ?? []).length === 0 && stillSrc
    ? ok('MG10', 'dead space_id → silent empty, params unrewritten')
    : fail('MG10', `merge=${m.status} pre=${(pre.body?.results ?? []).length} post=${post.status}/${(post.body?.results ?? []).length} stillSrc=${stillSrc}`);
  await api('DELETE', `v1/searches/saved/${savedId}`);
  state.savedSearches = state.savedSearches.filter((x) => x !== savedId);
}

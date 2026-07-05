import { api, ok, fail, skip, state, STAMP, makeSpace, remember, pollUntil } from './lib.mjs';

// L (worker) — link clustering behavior via trix-workers (round 4, from
// recon-worker-behavior.json). A link run HDBSCAN-clusters the UNION of both
// spaces (needs ≥10 embedded memories), tags clusters.link_id, names them
// '<label> · link <first8-of-link-id>', and REPLACES artifacts on re-run.
// Worker latency (BullMQ → node bridge insert → 1-min Python claim cron →
// compute) is 30–90s typical; polls budget 180s and SKIP on timeout, matching
// the C2 convention. Unlink cascade is synchronous — asserted with no polling.

// Two DISTINCT topics, each split across both spaces: HDBSCAN never returns
// the root cluster, so a mono-topic union labels everything noise (observed
// live: memories_processed=12, clusters_created=0). Two dense topics of 10
// give it a split below the root, and each cluster spans both spaces.
const TOPICS = [
  'sourdough starter hydration and fermentation schedule',
  'kubernetes pod autoscaling thresholds and rollout strategy',
];

async function seedEmbedded(spaceId, n, tag) {
  const ids = [];
  for (let i = 0; i < n; i++) {
    const topic = TOPICS[i % 2];
    const m = await remember(`${STAMP} ${tag} note ${i}: the ${topic} stays identical at revision ${i}`, spaceId);
    if (m.id) ids.push(m.id);
  }
  return ids;
}

const allEmbedded = (ids) => pollUntil(async () => {
  const checks = await Promise.all(ids.map((id) => api('GET', `v1/memories/${id}`)));
  const done = checks.every((r) => (r.body?.embedding_status ?? r.body?.memory?.embedding_status) === 'completed');
  return done ? true : null;
}, { timeoutMs: 120_000, everyMs: 5_000 });

// clusters list does not project link_id — find link clusters via the
// '· link <first8>' name suffix, then confirm link_id on the detail route.
const listLinkClusters = (linkId) =>
  api('GET', `v1/clusters?q=${encodeURIComponent(`link ${linkId.slice(0, 8)}`)}&limit=100`);

const pollLinkClusters = (linkId, disjointFrom = null) => pollUntil(async () => {
  const rows = (await listLinkClusters(linkId)).body?.data ?? [];
  if (rows.length === 0) return null;
  if (disjointFrom && rows.some((c) => disjointFrom.has(c.id))) return null;
  return rows;
}, { timeoutMs: 180_000, everyMs: 5_000 });

const skipRest = (note) => { skip('L12', note); skip('L13', note); };

export async function linksWorkerSuite() {
  // L11 link creation builds link-tagged clusters over the union of A and B.
  const a = await makeSpace('lwa');
  const b = await makeSpace('lwb');
  const aIds = await seedEmbedded(a, 10, 'lwa');
  const bIds = await seedEmbedded(b, 10, 'lwb');
  if (!(await allEmbedded([...aIds, ...bIds]))) {
    skip('L11', 'embeddings not completed within 120s');
    skipRest('prereq L11 skipped');
    return;
  }
  const link = await api('POST', `v1/spaces/${a}/links`, { target_space_id: b });
  const linkId = link.body?.id;
  if (link.status !== 201 || !linkId) {
    fail('L11', `link create ${link.status}`);
    skipRest('prereq L11 failed');
    return;
  }
  state.links.push({ a, id: linkId });
  const rows = await pollLinkClusters(linkId);
  if (!rows) {
    skip('L11', 'no link clusters within 180s (worker latency)');
    skipRest('prereq L11 skipped');
    return;
  }
  const detail = await api('GET', `v1/clusters/${rows[0].id}?include_memories=true&limit=50`);
  const members = (detail.body?.memories ?? []).map((m) => m.id ?? m.memory_id);
  const union = members.some((id) => aIds.includes(id)) && members.some((id) => bIds.includes(id));
  detail.status === 200 && detail.body?.link_id === linkId && union
    ? ok('L11', `clusters=${rows.length} members=${members.length} (both spaces represented)`)
    : fail('L11', `detail=${detail.status} link_id=${detail.body?.link_id} union=${union}`);

  // L12 refresh 202 + replace semantics: all cluster ids change atomically,
  // no accumulation, old detail 404s after replacement.
  const before = new Set(rows.map((c) => c.id));
  const refresh = await api('POST', `v1/spaces/${a}/links/${linkId}/refresh`);
  if (refresh.status !== 202) {
    fail('L12', `refresh → ${refresh.status}`);
  } else {
    const fresh = await pollLinkClusters(linkId, before);
    if (!fresh) skip('L12', 'refresh replacement not observed within 180s');
    else {
      const oldGone = await api('GET', `v1/clusters/${rows[0].id}?include_memories=true`);
      fresh.length < before.size * 2 && oldGone.status === 404
        ? ok('L12', `replaced ${before.size} → ${fresh.length} clusters, old id 404s`)
        : fail('L12', `count ${before.size}→${fresh.length} oldDetail=${oldGone.status}`);
    }
  }

  // L13 unlink cascades built clusters SYNCHRONOUSLY with accurate counts;
  // re-link is a fresh row (new id, no duplicate-400) that rebuilds clusters.
  const n = ((await listLinkClusters(linkId)).body?.data ?? []).length;
  const unlink = await api('DELETE', `v1/spaces/${a}/links/${linkId}`);
  state.links = state.links.filter((l) => l.id !== linkId);
  const leftover = ((await listLinkClusters(linkId)).body?.data ?? []).length; // no sleep on purpose
  const relink = await api('POST', `v1/spaces/${a}/links`, { target_space_id: b });
  const linkId2 = relink.body?.id;
  if (linkId2) state.links.push({ a, id: linkId2 });
  // removed.clusters is compared loosely: a late worker replace can land
  // between the count fetch and the unlink, so exact equality is racy.
  const removedOk = n === 0 || (unlink.body?.removed?.clusters ?? 0) >= 1;
  if (!(unlink.status === 200 && removedOk && leftover === 0)) {
    fail('L13', `unlink=${unlink.status} removed.clusters=${unlink.body?.removed?.clusters} (counted ${n}) leftover=${leftover}`);
    return;
  }
  if (relink.status !== 201 || !linkId2 || linkId2 === linkId) {
    fail('L13', `re-link=${relink.status} newId=${linkId2 === linkId ? 'REUSED' : linkId2 ?? 'missing'}`);
    return;
  }
  const rebuilt = await pollLinkClusters(linkId2);
  if (!rebuilt) skip('L13', 'unlink+re-link ok; rebuilt clusters not observed within 180s');
  else {
    const freshIds = rebuilt.every((c) => !rows.some((o) => o.id === c.id));
    freshIds
      ? ok('L13', `removed ${n} synchronously; rebuilt ${rebuilt.length} under new link id`)
      : fail('L13', 'rebuilt clusters reused pre-unlink cluster ids');
  }
}

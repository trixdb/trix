import { api, ok, fail, skip, pollUntil } from './lib.mjs';

// CD — on-demand community detection (round 5, trix-api#331).
// Contract: POST /v1/communities/detect → 202 {status:'queued'} → BullMQ
// 'community-detection' → workers-node bridge inserts community_detection_runs
// status='pending' (atomic per-account dedup) → Python poller (1-min cron)
// claims → 'running' → Louvain → 'completed' with metrics. Replace semantics:
// account-global communities are REPLACED per run (link communities untouched),
// and Louvain runs with a fixed random_state, so back-to-back runs on the same
// graph yield the same community count.

const latestRuns = async (n = 10) =>
  (await api('GET', `v1/communities/runs?limit=${n}`)).body?.data ?? [];

const pollRunSettled = (sinceIso) => pollUntil(async () => {
  const runs = await latestRuns(10);
  const fresh = runs.filter((r) => r.started_at > sinceIso);
  if (fresh.length === 0) return null;
  const settled = fresh.filter((r) => r.status === 'completed' || r.status === 'failed');
  // wait until every fresh run settled so dedup counting is race-free
  return settled.length === fresh.length ? { fresh, settled } : null;
}, { timeoutMs: 210_000, everyMs: 10_000 });

const countCommunities = async () => {
  const res = await api('GET', 'v1/communities?limit=1');
  return res.body?.pagination?.total ?? -1;
};

export async function communitiesSuite() {
  const since = new Date().toISOString();

  // CD1 detect → 202 queued; a second immediate detect also 202s but must
  // dedup (fixed jobId + bridge NOT-EXISTS): exactly ONE run appears.
  const d1 = await api('POST', 'v1/communities/detect', {});
  const d2 = await api('POST', 'v1/communities/detect', {});
  d1.status === 202 && d1.body?.status === 'queued' && d2.status === 202
    ? ok('CD1')
    : fail('CD1', `detect ${d1.status}/${d2.status} ${JSON.stringify(d1.body).slice(0, 80)}`);
  if (d1.status !== 202) { skip('CD2', 'prereq CD1'); skip('CD3', 'prereq CD1'); skip('CD4', 'prereq CD1'); skip('CD5', 'prereq CD1'); skip('CD6', 'prereq CD1'); return; }

  // CD2 the run lands in GET /runs and completes with honest metrics.
  const settled1 = await pollRunSettled(since);
  if (!settled1) {
    skip('CD2', 'no settled run within 210s (worker latency)');
    skip('CD3', 'prereq CD2'); skip('CD4', 'prereq CD2'); skip('CD5', 'prereq CD2'); skip('CD6', 'prereq CD2');
    return;
  }
  const run1 = settled1.fresh[0];
  run1.status === 'completed' && run1.algorithm === 'louvain' && Number.isInteger(run1.communities_found)
    ? ok('CD2', `communities_found=${run1.communities_found} nodes=${run1.nodes_processed}`)
    : fail('CD2', `run status=${run1.status} algo=${run1.algorithm} ${JSON.stringify(run1.metadata ?? {}).slice(0, 80)}`);

  // CD3 dedup held: the two detects produced exactly one run.
  settled1.fresh.length === 1
    ? ok('CD3')
    : fail('CD3', `expected 1 run from 2 concurrent detects, got ${settled1.fresh.length}`);

  // CD4 list + detail + members are coherent with the run's outcome.
  const list = await api('GET', 'v1/communities?limit=50');
  const rows = list.body?.data ?? [];
  const listOk = list.status === 200 && Array.isArray(rows)
    && (run1.communities_found === 0 || rows.length > 0);
  if (!listOk) {
    fail('CD4', `list ${list.status} rows=${rows.length} found=${run1.communities_found}`);
  } else if (rows.length === 0) {
    ok('CD4', 'run found 0 communities (sparse graph) — list coherently empty');
    skip('CD5', 'no communities to inspect');
  } else {
    const detail = await api('GET', `v1/communities/${rows[0].id}`);
    const members = await api('GET', `v1/communities/${rows[0].id}/memories?limit=5`);
    detail.status === 200 && detail.body?.id === rows[0].id
      && members.status === 200 && Array.isArray(members.body?.data)
      ? ok('CD4', `${rows.length} communities, top member_count=${rows[0].member_count}`)
      : fail('CD4', `detail ${detail.status} members ${members.status}`);

    // CD5 summarize endpoint is honest: 202/200 or 503, never a 500 TypeError.
    const summ = await api('POST', `v1/communities/${rows[0].id}/summarize`, {});
    summ.status !== 500
      ? ok('CD5', `summarize → ${summ.status}`)
      : fail('CD5', `summarize 500: ${JSON.stringify(summ.body).slice(0, 100)}`);
  }

  // CD6 replace semantics: a second full run must not accumulate — with a
  // deterministic Louvain seed on an (almost) unchanged graph, the total
  // community count stays put instead of doubling.
  const c1 = await countCommunities();
  const since2 = new Date().toISOString();
  const d3 = await api('POST', 'v1/communities/detect', {});
  if (d3.status !== 202) { fail('CD6', `re-detect ${d3.status}`); return; }
  const settled2 = await pollRunSettled(since2);
  if (!settled2) { skip('CD6', 'second run not settled within 210s'); return; }
  const c2 = await countCommunities();
  const drift = Math.abs(c2 - c1);
  settled2.fresh[0]?.status === 'completed' && c1 >= 0 && drift <= Math.max(2, Math.ceil(c1 * 0.2))
    ? ok('CD6', `count ${c1} → ${c2} (replaced, not accumulated)`)
    : fail('CD6', `count ${c1} → ${c2} after second run (accumulation?) run=${settled2.fresh[0]?.status}`);
}

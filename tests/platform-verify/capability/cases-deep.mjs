import { api, apiAs, ok, fail, state, STAMP, remember, makeSpace } from './lib.mjs';

// D — deepened semantics: expiry, re-embed on edit, validation limits,
// idempotency, merge reparenting, pagination, relationship lifecycle,
// key privileges, light concurrency.

export async function deepMemoriesSuite(spaceA) {
  // D1 expiry: a past expires_at is accepted but the memory is invisible.
  const expired = await api('POST', 'v1/memories', {
    content: `${STAMP} already expired payload`,
    space_id: spaceA,
    expires_at: new Date(Date.now() - 60_000).toISOString(),
  });
  if (expired.body?.id) state.memories.push(expired.body.id);
  const listed = await api('GET', `v1/memories?space_id=${spaceA}&limit=100`);
  const inList = (listed.body?.data ?? []).some((m) => m.id === expired.body?.id);
  const byId = await api('GET', `v1/memories/${expired.body?.id}`);
  expired.status === 201 && !inList && byId.status === 404
    ? ok('D1')
    : fail('D1', `create ${expired.status} inList=${inList} byId=${byId.status}`);

  // D2 re-embed on edit: content PATCH resets embedding_status to pending.
  const m = await remember(`${STAMP} original content`, spaceA);
  const upd = await api('PATCH', `v1/memories/${m.id}`, { content: `${STAMP} edited content` });
  upd.status === 200 && upd.body?.embedding_status === 'pending'
    ? ok('D2')
    : fail('D2', `patch ${upd.status} status=${upd.body?.embedding_status}`);

  // D3 bulk create over the 100-item cap → 400.
  const over = await api('POST', 'v1/memories/bulk', {
    memories: Array.from({ length: 101 }, (_, i) => ({ content: `x${i}` })),
  });
  over.status === 400 ? ok('D3') : fail('D3', `bulk 101 → ${over.status}`);

  // D4 search limit over cap → 400.
  const lim = await api('GET', 'v1/search?q=x&limit=101');
  lim.status === 400 ? ok('D4') : fail('D4', `limit 101 → ${lim.status}`);

  // D5/D6 malformed uuid must 400 (schema), never 500 (SQL cast).
  const badGet = await api('GET', 'v1/memories/not-a-uuid');
  const badPatch = await api('PATCH', 'v1/memories/not-a-uuid', { content: 'x' });
  const badRestore = await api('POST', 'v1/memories/not-a-uuid/restore');
  badGet.status === 400 ? ok('D5') : fail('D5', `GET bad uuid → ${badGet.status}`);
  badPatch.status === 400 && badRestore.status === 400
    ? ok('D6')
    : fail('D6', `PATCH ${badPatch.status}, restore ${badRestore.status}`);

  // D7 unknown relationship_type → 400.
  const m2 = await remember(`${STAMP} rel type target`, spaceA);
  const badType = await api('POST', `v1/relationships/${m.id}`, {
    target_id: m2.id,
    relationship_type: 'not_a_real_type',
  });
  badType.status === 400 ? ok('D7') : fail('D7', `bad type → ${badType.status}`);

  // D8 invalid protection_level → 400.
  const badProt = await api('PATCH', `v1/memories/${m.id}`, { protection_level: 'adamantium' });
  badProt.status === 400 ? ok('D8') : fail('D8', `bad protection → ${badProt.status}`);

  // D9 tags over the 100 cap → 400.
  const manyTags = await api('POST', 'v1/memories', {
    content: `${STAMP} tag flood`,
    tags: Array.from({ length: 101 }, (_, i) => `t${i}`),
  });
  manyTags.status === 400 ? ok('D9') : fail('D9', `101 tags → ${manyTags.status}`);
  if (manyTags.body?.id) state.memories.push(manyTags.body.id);

  // D10 duplicate content with skip_duplicate_check creates a second row.
  const dupContent = `${STAMP} dedupe-opt-out payload`;
  const first = await api('POST', 'v1/memories', { content: dupContent, space_id: spaceA });
  const second = await api('POST', 'v1/memories', {
    content: dupContent,
    space_id: spaceA,
    skip_duplicate_check: true,
  });
  if (first.body?.id) state.memories.push(first.body.id);
  if (second.body?.id) state.memories.push(second.body.id);
  second.status === 201 && second.body?.id && second.body.id !== first.body?.id
    ? ok('D10')
    : fail('D10', `skip_dedup second → ${second.status} dup=${second.body?.duplicate}`);
}

export async function deepLifecycleSuite() {
  // D11 merge reparents tasks/goals/habits and lists reflect it.
  const src = await makeSpace('deep-src');
  const tgt = await makeSpace('deep-tgt');
  const task = await api('POST', 'v1/tasks', { title: `${STAMP} deep task`, space_id: src });
  const goal = await api('POST', 'v1/goals', { title: `${STAMP} deep goal`, space_id: src });
  const habit = await api('POST', 'v1/habits', { name: `${STAMP} deep habit`, space_id: src });
  if (task.body?.id) state.tasks.push(task.body.id);
  if (goal.body?.id) state.goals.push(goal.body.id);
  if (habit.body?.id) state.habits.push(habit.body.id);

  const merge = await api('POST', `v1/spaces/${tgt}/merge`, { source_space_id: src, confirm: true });
  state.spaces = state.spaces.filter((s) => s !== src);
  const moved = merge.body?.moved ?? {};
  const movedAll = ['tasks.space_id', 'goals.space_id', 'habits.space_id'].every(
    (k) => (typeof moved[k] === 'number' ? moved[k] : (moved[k]?.moved ?? 0)) >= 1
  );
  const listedTasks = await api('GET', `v1/tasks?space_id=${tgt}`);
  const taskThere = (listedTasks.body?.tasks ?? []).some((t) => t.id === task.body?.id);
  merge.status < 300 && movedAll && taskThere
    ? ok('D11', `moved=${JSON.stringify({ t: moved['tasks.space_id'], g: moved['goals.space_id'], h: moved['habits.space_id'] })}`)
    : fail('D11', `merge ${merge.status} movedAll=${movedAll} taskThere=${taskThere}`);

  // D12 pagination walk over 5 memories with limit=2.
  const pagSpace = await makeSpace('deep-pag');
  for (let i = 0; i < 5; i++) {
    await remember(`${STAMP} page item ${i}`, pagSpace);
  }
  const seen = new Set();
  let offset = 0;
  let hasMore = true;
  let total = null;
  let pages = 0;
  while (hasMore && pages < 6) {
    const page = await api('GET', `v1/memories?space_id=${pagSpace}&limit=2&offset=${offset}`);
    (page.body?.data ?? []).forEach((m) => seen.add(m.id));
    total = page.body?.pagination?.total ?? total;
    hasMore = page.body?.pagination?.has_more === true;
    offset += 2;
    pages++;
  }
  seen.size === 5 && total === 5
    ? ok('D12')
    : fail('D12', `walked ${seen.size}/5, total=${total}`);
}

export async function deepRelationshipsSuite(spaceA) {
  const x = await remember(`${STAMP} deep rel x`, spaceA);
  const y = await remember(`${STAMP} deep rel y`, spaceA);

  // D13 bidirectional creates the inverse; GET shows both directions.
  const bi = await api('POST', `v1/relationships/${x.id}`, {
    target_id: y.id,
    relationship_type: 'supports',
    bidirectional: true,
  });
  const rels = await api('GET', `v1/relationships/${x.id}`);
  const edges = rels.body?.relationships ?? [];
  const outgoing = edges.some((e) => e.target_id === y.id);
  const incoming = edges.some((e) => e.source_id === y.id);
  bi.status < 300 && outgoing && incoming
    ? ok('D13')
    : fail('D13', `bi ${bi.status} out=${outgoing} in=${incoming}`);

  // D14 reinforce bumps the weight.
  const beforeW = edges.find((e) => e.target_id === y.id)?.weight ?? null;
  const rf = await api('POST', `v1/relationships/${x.id}/${y.id}/supports/reinforce`, { boost: 1 });
  const afterW = rf.body?.relationship?.weight ?? null;
  rf.status === 200 && afterW !== null && Number(afterW) > Number(beforeW)
    ? ok('D14', `${beforeW} → ${afterW}`)
    : fail('D14', `reinforce ${rf.status} ${beforeW}→${afterW}`);

  // D15 delete the relationship; second delete 404.
  const del = await api('DELETE', `v1/relationships/${x.id}/${y.id}/supports`);
  const again = await api('DELETE', `v1/relationships/${x.id}/${y.id}/supports`);
  del.status === 204 && again.status === 404
    ? ok('D15')
    : fail('D15', `delete ${del.status}/${again.status}`);
}

export async function deepPlatformSuite(spaceA, secondKey) {
  // D16 idempotent habit check-in: same key twice → same completion id.
  const h = await api('POST', 'v1/habits', { name: `${STAMP} idem habit` });
  if (h.body?.id) state.habits.push(h.body.id);
  const idemKey = `${STAMP}-checkin`;
  const doCheckIn = () =>
    fetch(`${process.env.TRIX_API_URL ?? 'https://api.trixdb.com'}/v1/habits/${h.body.id}/check-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.TRIX_API_KEY}`,
        'Idempotency-Key': idemKey,
      },
      body: JSON.stringify({}),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  const ci1 = await doCheckIn();
  const ci2 = await doCheckIn();
  ci1.body?.id && ci2.body?.id === ci1.body.id
    ? ok('D16')
    : fail('D16', `ids ${ci1.body?.id} vs ${ci2.body?.id}`);

  // D17 a non-admin key cannot mint an admin key.
  if (!secondKey) {
    fail('D17', 'no second key');
  } else {
    const escalate = await apiAs(secondKey.key, 'POST', 'v1/accounts/api-keys', {
      name: `${STAMP}-escalation`,
      is_account_admin: true,
    });
    escalate.status === 403 ? ok('D17') : fail('D17', `escalation → ${escalate.status}`);
    if (escalate.body?.id) state.keys.push(escalate.body.id);
  }

  // D18 light concurrency: 10 parallel stores all succeed and all land.
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      api('POST', 'v1/memories', { content: `${STAMP} concurrent ${i}`, space_id: spaceA })
    )
  );
  results.forEach((r) => r.body?.id && state.memories.push(r.body.id));
  const allCreated = results.every((r) => r.status === 201);
  const list = await api('GET', `v1/memories?space_id=${spaceA}&tags=&limit=100`);
  const landed = results.filter((r) =>
    (list.body?.data ?? []).some((m) => m.id === r.body?.id)
  ).length;
  allCreated && landed === 10
    ? ok('D18')
    : fail('D18', `created=${results.filter((r) => r.status === 201).length}/10 landed=${landed}/10`);
}

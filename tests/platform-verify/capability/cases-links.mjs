import { api, ok, fail, state, STAMP, makeSpace, remember } from './lib.mjs';

// L — space-link contract (round 4, from recon-link-contract.json).
// Cases tagged "(post-fix)" assert the INTENDED contract delivered on the
// trix-api branch fix/link-route-gaps: non-UUID linkId params 400 instead of
// 500, DELETE /links/:linkId requires the link to touch :spaceId (as refresh
// already does), and POST /v1/relationships/batch enforces the same
// cross-space link gate as single-create, stamping link_id on batch edges.
// Against an unfixed build those cases FAIL — that is the point.

const REL = (source, target, type) => ({ source_id: source, target_id: target, relationship_type: type });

async function makeLink(a, b) {
  const r = await api('POST', `v1/spaces/${a}/links`, { target_space_id: b });
  if (r.status === 201 && r.body?.id) state.links.push({ a, id: r.body.id });
  return r;
}

const dropLink = (id) => { state.links = state.links.filter((l) => l.id !== id); };

export async function linksErrorContractSuite() {
  // L1 slugs resolve to UUIDs on create; link visible from both sides.
  const a = await makeSpace('l1a');
  const b = await makeSpace('l1b');
  const created = await api('POST', `v1/spaces/${STAMP}-l1a/links`, { target_space_id: `${STAMP}-l1b` });
  const linkId = created.body?.id;
  if (linkId) state.links.push({ a, id: linkId });
  const resolved = created.body?.space_a_id === a && created.body?.space_b_id === b;
  const [la, lb] = await Promise.all([
    api('GET', `v1/spaces/${a}/links`),
    api('GET', `v1/spaces/${b}/links`),
  ]);
  const bothSides = [la, lb].every((r) => (r.body?.links ?? []).some((l) => l.id === linkId));
  created.status === 201 && resolved && bothSides
    ? ok('L1')
    : fail('L1', `create ${created.status} resolved=${resolved} bothSides=${bothSides}`);

  // L2 self-link rejected.
  const self = await api('POST', `v1/spaces/${a}/links`, { target_space_id: a });
  self.status === 400 ? ok('L2') : fail('L2', `self-link → ${self.status}`);

  // L3 duplicate rejected in BOTH orders (uniqueness is LEAST/GREATEST-based).
  const dupAB = await api('POST', `v1/spaces/${a}/links`, { target_space_id: b });
  const dupBA = await api('POST', `v1/spaces/${b}/links`, { target_space_id: a });
  dupAB.status === 400 && dupBA.status === 400
    ? ok('L3')
    : fail('L3', `dup A→B ${dupAB.status}, B→A ${dupBA.status}`);

  // L4 nonexistent target: slug miss → 404; unknown valid UUID → 403 (create
  // short-circuits UUIDs past resolveSpace and dies at canAccessSpace; the
  // same asymmetry holds for GET links on a ghost-UUID space).
  const ghost = crypto.randomUUID();
  const bySlug = await api('POST', `v1/spaces/${a}/links`, { target_space_id: `no-such-${STAMP}` });
  const byUuid = await api('POST', `v1/spaces/${a}/links`, { target_space_id: ghost });
  const listGhost = await api('GET', `v1/spaces/${ghost}/links`);
  bySlug.status === 404 && byUuid.status === 403 && listGhost.status === 403
    ? ok('L4')
    : fail('L4', `slug→${bySlug.status} uuid→${byUuid.status} list→${listGhost.status}`);

  // L5 non-UUID linkId must 400 at the validation layer, never 500 (raw
  // uuid-cast 22P02 today). Asserts the fix on fix/link-route-gaps.
  const badDel = await api('DELETE', `v1/spaces/${a}/links/not-a-uuid`);
  const badRefresh = await api('POST', `v1/spaces/${a}/links/not-a-uuid/refresh`);
  badDel.status === 400 && badRefresh.status === 400
    ? ok('L5', '(post-fix)')
    : fail('L5', `DELETE→${badDel.status} refresh→${badRefresh.status}, want 400 (post-fix)`);

  // L6 DELETE scoping: the link must touch :spaceId — via an unrelated space
  // both refresh (already true) and DELETE (post-fix) 404, link untouched.
  const c = await makeSpace('l6c');
  const refViaC = await api('POST', `v1/spaces/${c}/links/${linkId}/refresh`);
  const delViaC = await api('DELETE', `v1/spaces/${c}/links/${linkId}`);
  const after = await api('GET', `v1/spaces/${a}/links`);
  const survived = (after.body?.links ?? []).some((l) => l.id === linkId);
  refViaC.status === 404 && delViaC.status === 404 && survived
    ? ok('L6', '(post-fix)')
    : fail('L6', `refresh→${refViaC.status} delete→${delViaC.status} survived=${survived} (post-fix)`);

  const bye = await api('DELETE', `v1/spaces/${a}/links/${linkId}`);
  if (bye.status < 300 || delViaC.status < 300) dropLink(linkId);
}

export async function linksRelationshipGateSuite() {
  // L7 single-create cross-space gate + link_id stamping on the edge.
  const a = await makeSpace('l7a');
  const b = await makeSpace('l7b');
  const x = await remember(`${STAMP} l7 gate source`, a);
  const y = await remember(`${STAMP} l7 gate target`, b);
  const blocked = await api('POST', `v1/relationships/${x.id}`, { target_id: y.id, relationship_type: 'related_to' });
  const link = await makeLink(a, b);
  const linkId = link.body?.id;
  const allowed = await api('POST', `v1/relationships/${x.id}`, { target_id: y.id, relationship_type: 'related_to' });
  const rels = await api('GET', `v1/relationships/${x.id}`);
  const edge = (rels.body?.relationships ?? []).find((e) => e.target_id === y.id);
  blocked.status === 400 && allowed.status < 300 && edge?.link_id === linkId
    ? ok('L7')
    : fail('L7', `unlinked→${blocked.status} linked→${allowed.status} edge.link_id=${edge?.link_id ?? 'missing'}`);

  // L8 unlink: removed counts include the tagged edge; memories and spaces
  // survive; the cross-space gate closes again.
  const unlink = await api('DELETE', `v1/spaces/${a}/links/${linkId}`);
  dropLink(linkId);
  const removed = unlink.body?.removed ?? {};
  const after = await api('GET', `v1/relationships/${x.id}`);
  const edgeGone = !(after.body?.relationships ?? []).some((e) => e.target_id === y.id || e.source_id === y.id);
  const checks = await Promise.all([
    api('GET', `v1/memories/${x.id}`), api('GET', `v1/memories/${y.id}`),
    api('GET', `v1/spaces/${a}`), api('GET', `v1/spaces/${b}`),
  ]);
  const intact = checks.every((r) => r.status === 200);
  const regated = await api('POST', `v1/relationships/${x.id}`, { target_id: y.id, relationship_type: 'supports' });
  unlink.status === 200 && (removed.relationships ?? 0) >= 1 && edgeGone && intact && regated.status === 400
    ? ok('L8', `removed=${JSON.stringify(removed)}`)
    : fail('L8', `unlink=${unlink.status} removed=${JSON.stringify(removed)} edgeGone=${edgeGone} intact=${intact} regate=${regated.status}`);
}

export async function linksBatchGateSuite() {
  // L9 batch gate parity (asserts fix/link-route-gaps): a cross-space item
  // between UNLINKED spaces is rejected per-item while the same-space item in
  // the same call succeeds. Unfixed builds create the cross-space edge.
  const a = await makeSpace('l9a');
  const b = await makeSpace('l9b');
  const x = await remember(`${STAMP} l9 batch x`, a);
  const y = await remember(`${STAMP} l9 batch y`, a);
  const z = await remember(`${STAMP} l9 batch z`, b);
  const batch = await api('POST', 'v1/relationships/batch', {
    relationships: [REL(x.id, y.id, 'related_to'), REL(x.id, z.id, 'related_to')],
  });
  // succeeded[] carries bare relationship rows (index is stripped by the route)
  const sameOk = (batch.body?.succeeded ?? []).some(
    (s) => s.source_id === x.id && s.target_id === y.id
  );
  const crossRejected = (batch.body?.failed ?? []).some((f) => f.index === 1);
  sameOk && crossRejected
    ? ok('L9', '(post-fix)')
    : fail('L9', `status=${batch.status} sameOk=${sameOk} crossRejected=${crossRejected} (post-fix: unlinked cross-space item must land in failed[])`);

  // L10 linked batch edges are stamped with link_id so unlink cascades them
  // (asserts fix/link-route-gaps — unfixed builds insert untagged edges that
  // survive unlink and are missing from the removed counts).
  const link = await makeLink(a, b);
  const linkId = link.body?.id;
  const batch2 = await api('POST', 'v1/relationships/batch', {
    relationships: [REL(x.id, z.id, 'supports')],
  });
  // succeeded[] elements ARE the relationship rows (RETURNING * incl. link_id)
  const edge = (batch2.body?.succeeded ?? [])[0];
  const unlink = await api('DELETE', `v1/spaces/${a}/links/${linkId}`);
  dropLink(linkId);
  const after = await api('GET', `v1/relationships/${x.id}`);
  const crossGone = !(after.body?.relationships ?? []).some((e) => e.target_id === z.id || e.source_id === z.id);
  batch2.status < 300 && edge?.link_id === linkId && (unlink.body?.removed?.relationships ?? 0) >= 1 && crossGone
    ? ok('L10', '(post-fix)')
    : fail('L10', `batch=${batch2.status} edge.link_id=${edge?.link_id ?? 'missing'} removed.relationships=${unlink.body?.removed?.relationships} crossGone=${crossGone} (post-fix)`);
}

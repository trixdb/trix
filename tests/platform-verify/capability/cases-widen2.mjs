import { api, ok, fail, state, STAMP } from './lib.mjs';

// NR — Notifications (ADR-054): per-account routing rules + in-app inbox.
// Genuinely uncovered by the rest of the suite (nothing else touches the
// notification domain). All routes are account-scoped via fastify.authenticate,
// so the suite's service API key drives them directly — no user-scoped key or
// email/password flow needed. Rules created here carry the run STAMP in their
// config and are tracked in state for cleanup, exactly like the other CRUD
// domains. Pairs the D7 "unknown relationship_type → 400" idea with an
// analogous "invalid event_pattern → 400" negative.

const RULE_PATTERN = 'memory.created'; // a real EVENT_TYPES key, NOT an ADR-054 default
const RULE_CHANNEL = 'in_app';
const NIL_UUID = '00000000-0000-4000-8000-000000000000';

// Self-heal: drop any leftover rule from a crashed prior run so the unique
// index (account_id, event_pattern, channel, space_id) can't 500 our create.
async function dropLeftoverRule() {
  const list = await api('GET', 'v1/notifications/rules');
  for (const r of list.body?.rules ?? []) {
    if (r.event_pattern === RULE_PATTERN && r.channel === RULE_CHANNEL && !r.space_id) {
      await api('DELETE', `v1/notifications/rules/${r.id}`).catch(() => {});
    }
  }
}

export async function notificationRulesSuite() {
  await dropLeftoverRule();

  // NR1 — rules list endpoint contract: 200 with a well-formed array. (Does
  // NOT assert seeded defaults — provisioning state the test doesn't control;
  // the create→list round-trip is proven controllably in NR4.)
  const base = await api('GET', 'v1/notifications/rules');
  const baseRules = base.body?.rules ?? [];
  base.status === 200 && Array.isArray(base.body?.rules)
    ? ok('NR1', `list ok, ${baseRules.length} existing rules`)
    : fail('NR1', `list ${base.status} ${JSON.stringify(base.body).slice(0, 80)}`);

  // NR2 — create a routing rule (valid event pattern).
  const c = await api('POST', 'v1/notifications/rules', {
    event_pattern: RULE_PATTERN, channel: RULE_CHANNEL, enabled: true, config: { stamp: STAMP },
  });
  const ruleId = c.body?.id;
  if (ruleId) state.notificationRules.push(ruleId);
  c.status === 201 && ruleId
    ? ok('NR2')
    : fail('NR2', `create ${c.status} ${JSON.stringify(c.body).slice(0, 80)}`);

  // NR3 — invalid event_pattern rejected at the handler (not just schema).
  const bad = await api('POST', 'v1/notifications/rules', {
    event_pattern: `${STAMP}.bogus`, channel: RULE_CHANNEL,
  });
  if (bad.body?.id) state.notificationRules.push(bad.body.id);
  bad.status === 400 && bad.body?.error === 'Invalid event_pattern'
    ? ok('NR3')
    : fail('NR3', `invalid pattern ${bad.status} ${JSON.stringify(bad.body).slice(0, 80)}`);

  // NR4 — the created rule is listed back with its fields intact.
  const after = await api('GET', 'v1/notifications/rules');
  const mine = (after.body?.rules ?? []).find((r) => r.id === ruleId);
  mine && mine.event_pattern === RULE_PATTERN && mine.channel === RULE_CHANNEL
    ? ok('NR4', `count ${baseRules.length} → ${after.body?.rules?.length}`)
    : fail('NR4', mine ? 'field mismatch' : 'created rule not listed');

  // NR5 — PATCH toggles a field; unknown id → 404.
  const upd = await api('PATCH', `v1/notifications/rules/${ruleId}`, { enabled: false });
  const miss = await api('PATCH', `v1/notifications/rules/${NIL_UUID}`, { enabled: false });
  upd.status === 200 && upd.body?.enabled === false && miss.status === 404
    ? ok('NR5')
    : fail('NR5', `patch ${upd.status} enabled=${upd.body?.enabled} miss ${miss.status}`);

  // NR6 — DELETE is 204; the second DELETE is an honest 404 (not-found).
  const del = await api('DELETE', `v1/notifications/rules/${ruleId}`);
  const again = ruleId ? await api('DELETE', `v1/notifications/rules/${ruleId}`) : { status: 0 };
  if (del.status === 204 && again.status === 404) {
    ok('NR6');
    state.notificationRules = state.notificationRules.filter((id) => id !== ruleId);
  } else fail('NR6', `delete ${del.status}, re-delete ${again.status}`);
}

export async function notificationInboxSuite() {
  // NR7 — inbox read-path contract: the list and unread-count endpoints each
  // return 200 with the documented shape (a shape/500 smoke test — makes no
  // coherence claim it can't control, since inbox rows aren't test-created).
  const inbox = await api('GET', 'v1/notifications/inbox?limit=5');
  const count = await api('GET', 'v1/notifications/inbox/unread-count');
  const listOk =
    inbox.status === 200 &&
    Array.isArray(inbox.body?.notifications) &&
    inbox.body.notifications.length <= 5; // honors the limit
  const countOk =
    count.status === 200 &&
    Number.isInteger(count.body?.unread_count) &&
    count.body.unread_count >= 0;
  listOk && countOk
    ? ok('NR7', `${inbox.body.notifications.length} shown, ${count.body.unread_count} unread`)
    : fail('NR7', `inbox ${inbox.status} list=${listOk} count ${count.status} badge=${countOk}`);
}

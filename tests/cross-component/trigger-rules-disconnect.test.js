/**
 * Regression test for the trigger_rules ↔ agent_triggers disconnect.
 *
 * Pins issues trixdb/trix-api#63 + trixdb/trix-bots#2:
 *   - POST /v1/trigger-rules writes to trigger_rules (API-side table)
 *   - trix-bots scheduler.ts reads from agent_triggers (bots-side table)
 *   - The two are not bridged → cron rules created via the public API never
 *     cause an agent to fire.
 *
 * Plus the secondary bug: even with a manually-seeded agent_triggers row,
 * the bots cron-execute worker crashes because of a job-shape mismatch.
 *
 * Both issues are now CLOSED. The two regression assertions below (formerly
 * `.fails()` catch-nets) are forward guards: they must pass against a live
 * stack, and a failure means the trigger_rules → agent_triggers bridge or the
 * bots cron-execute job shape has regressed.
 *
 * Spin-up: `docker compose up -d` from the monorepo root, then
 *   `npx vitest run tests/cross-component/trigger-rules-disconnect.test.js`
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { Client } from 'pg';

const API_URL = process.env.TRIX_API_URL ?? 'http://localhost:3737';
const PG_URL =
  process.env.TRIX_PG_URL ?? 'postgres://trix:Tr1x_L0cal_S3cret!@localhost:5433/trix';

const TAG = `trig-${Date.now().toString(36)}`;
let pg;
let apiKey;
let stackUp = false;

async function req(method, path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
}

async function poll(predicate, { tries = 30, intervalMs = 2000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const v = await predicate();
    if (v) return v;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

beforeAll(async () => {
  try {
    const r = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) });
    stackUp = r.ok;
  } catch {
    stackUp = false;
  }
  if (!stackUp) return;

  pg = new Client({ connectionString: PG_URL });
  await pg.connect();

  // Mint admin API key directly (matches trix-api/src/plugins/auth.js shape)
  const raw = `gdb_${randomBytes(24).toString('base64url')}`;
  const hash = createHash('sha256').update(raw).digest('hex');
  const prefix = raw.slice(0, 8);
  const { rows } = await pg.query(`SELECT id FROM accounts ORDER BY created_at LIMIT 1`);
  await pg.query(
    `INSERT INTO api_keys (account_id, name, description, key_prefix, key_hash, is_account_admin, is_service, is_active)
     VALUES ($1, $2, $3, $4, $5, true, true, true)`,
    [rows[0].id, `trig-test-${TAG}`, 'trigger-disconnect-regression', prefix, hash]
  );
  apiKey = raw;
});

afterAll(async () => {
  if (pg) await pg.end();
});

describe('trigger_rules ↔ agent_triggers disconnect (issues #63 + bots#2)', () => {
  // ── A. Document the existing disconnect at the schema level ─────────────

  it.skipIf(!stackUp)('the two tables exist with overlapping purposes', async () => {
    const { rows: tr } = await pg.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'trigger_rules' ORDER BY ordinal_position`
    );
    const { rows: at } = await pg.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'agent_triggers' ORDER BY ordinal_position`
    );

    const trColumns = tr.map((r) => r.column_name);
    const atColumns = at.map((r) => r.column_name);

    // Both tables carry agent_id, an enabled-flag, and a cron-like expression.
    expect(trColumns).toContain('agent_id');
    expect(atColumns).toContain('agent_id');
    expect(atColumns).toContain('cron_expression');
    // trigger_rules has source='cron' instead, with the expression inside action_config
    expect(trColumns).toContain('source');
    expect(trColumns).toContain('action_config');

    // The disconnect is documented (#63): API writes to trigger_rules,
    // bots scheduler reads agent_triggers. No bridge.
  });

  // ── B. The `agent_triggers` (working) path: event trigger fires a run ───
  // Loop iter 3 verified this works end-to-end. Reproduced here so the
  // suite has a positive baseline alongside the failing regressions.

  it.skipIf(!stackUp)('agent_triggers event row → memory.created → agent run fires', async () => {
    // 1. Create a read_only agent
    const agent = await req('POST', '/v1/agents', {
      name: `evt-${TAG}`,
      system_prompt: 'Reply once briefly.',
      model: 'claude-haiku-4-5-20250514',
      provider: 'anthropic',
      temperature: 0,
      max_turns_per_run: 1,
      memory_strategy: 'read_only',
      status: 'active',
    });
    expect(agent.body?.id).toBeTruthy();

    // 2. Seed an event trigger directly into agent_triggers (since the public
    //    /v1/trigger-rules endpoint is broken — see #63).
    const { rows: trigRows } = await pg.query(
      `INSERT INTO agent_triggers (agent_id, type, event_types, enabled)
       VALUES ($1, 'event', ARRAY['memory.created'], true)
       RETURNING id`,
      [agent.body.id]
    );
    const triggerId = trigRows[0].id;

    try {
      // 3. Find a space + emit a memory.created event by storing a memory
      const list = await req('GET', '/v1/spaces');
      const reuse = list.body?.spaces?.[0];
      expect(reuse?.id).toBeTruthy();

      const stored = await req('POST', '/v1/memories', {
        content: `event-probe-${TAG}`,
        tags: [TAG],
        space_id: reuse.id,
      });
      expect(stored.status).toBe(201);

      // 4. The bots PG NOTIFY listener should fire an event-type run within ~5s
      const runRow = await poll(
        async () => {
          const { rows } = await pg.query(
            `SELECT id, status FROM agent_runs
              WHERE agent_id = $1
                AND trigger_type = 'event'
                AND created_at > NOW() - INTERVAL '30 seconds'
              ORDER BY created_at DESC LIMIT 1`,
            [agent.body.id]
          );
          return rows[0] ?? null;
        },
        { tries: 15, intervalMs: 1500 }
      );
      expect(runRow?.id, 'agent_triggers event path should fire a run').toBeTruthy();
    } finally {
      // Cleanup: disable trigger (cannot delete due to FK on agent_runs)
      await pg.query(`UPDATE agent_triggers SET enabled=false WHERE id=$1`, [triggerId]);
    }
  }, 60000);

  // ── C. Regression catch-nets for the broken paths ───────────────────────

  it.skipIf(!stackUp)(
    'REGRESSION #63: cron rule via POST /v1/trigger-rules must fire an agent_run within 90s',
    async () => {
      const agent = await req('POST', '/v1/agents', {
        name: `cron-api-${TAG}`,
        system_prompt: 'Reply once.',
        model: 'claude-haiku-4-5-20250514',
        provider: 'anthropic',
        temperature: 0,
        max_turns_per_run: 1,
        memory_strategy: 'read_only',
        status: 'active',
      });
      const rule = await req('POST', '/v1/trigger-rules', {
        name: `regression-63-${TAG}`,
        source: 'cron',
        agent_id: agent.body.id,
        action_config: { cron_expression: '* * * * *', prompt_template: 'Cron tick.' },
      });
      expect(rule.body?.trigger_rule?.id ?? rule.body?.id).toBeTruthy();

      // After the next ~90s, the agent should have a cron-trigger-typed run
      const fired = await poll(
        async () => {
          const { rows } = await pg.query(
            `SELECT id FROM agent_runs
              WHERE agent_id = $1 AND trigger_type = 'cron'
                AND created_at > NOW() - INTERVAL '3 minutes'
              LIMIT 1`,
            [agent.body.id]
          );
          return rows[0]?.id ?? null;
        },
        { tries: 50, intervalMs: 2000 }
      );
      expect(fired, '/v1/trigger-rules cron rule should reach bots scheduler').toBeTruthy();
    },
    120000
  );

  it.skipIf(!stackUp)(
    'REGRESSION bots#2: even a directly-seeded agent_triggers cron row should reach status=completed at next tick',
    async () => {
      const agent = await req('POST', '/v1/agents', {
        name: `cron-direct-${TAG}`,
        system_prompt: 'Reply once.',
        model: 'claude-haiku-4-5-20250514',
        provider: 'anthropic',
        temperature: 0,
        max_turns_per_run: 1,
        memory_strategy: 'read_only',
        status: 'active',
      });
      const { rows } = await pg.query(
        `INSERT INTO agent_triggers (agent_id, type, cron_expression, timezone, enabled)
         VALUES ($1, 'cron', '* * * * *', 'UTC', true)
         RETURNING id`,
        [agent.body.id]
      );
      const triggerId = rows[0].id;
      try {
        // bots cron-execute handler will crash with "Cannot read properties of
        // undefined (reading 'trigger_type')" — no agent_run row gets created.
        const fired = await poll(
          async () => {
            const { rows: r2 } = await pg.query(
              `SELECT id, status FROM agent_runs
                WHERE agent_id = $1 AND trigger_type = 'cron'
                  AND status = 'completed'
                  AND created_at > NOW() - INTERVAL '3 minutes'
                LIMIT 1`,
              [agent.body.id]
            );
            return r2[0] ?? null;
          },
          { tries: 50, intervalMs: 2000 }
        );
        expect(fired, 'bots cron-execute worker should create + complete an agent_run').toBeTruthy();
      } finally {
        await pg.query(`UPDATE agent_triggers SET enabled=false WHERE id=$1`, [triggerId]);
      }
    },
    120000
  );
});

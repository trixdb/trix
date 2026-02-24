/**
 * BullMQ Worker — Processes bot-execution jobs.
 *
 * For each job: loads bot definition, instantiates BotRunner,
 * executes the run, and updates the bot_runs record.
 */

import { Worker, type Job } from 'bullmq';
import type { Pool } from 'pg';
import type pino from 'pino';
import type { Trix } from '@trixdb/client';
import type { LLMRouter } from './llm/llm-router.js';
import type { BotRunJob, BotDefinition, BotSkill } from './types.js';
import { BotRunner } from './runner/bot-runner.js';
import { QUEUE_NAME } from './lib/constants.js';

export interface WorkerDeps {
  redisUrl: string;
  pg: Pool;
  trix: Trix;
  llmRouter: LLMRouter;
  logger: pino.Logger;
  concurrency: number;
  maxTurns: number;
}

export function createWorker(deps: WorkerDeps): Worker {
  const { redisUrl, pg, trix, llmRouter, logger, concurrency, maxTurns } = deps;
  const url = new URL(redisUrl);

  const worker = new Worker<BotRunJob>(
    QUEUE_NAME,
    async (job: Job<BotRunJob>) => {
      const { runId, botId, accountId } = job.data;
      logger.info({ runId, botId }, 'Processing bot execution job');

      // Mark run as running
      await pg.query(
        `UPDATE bot_runs SET status = 'running', started_at = NOW() WHERE id = $1`,
        [runId]
      );

      try {
        // Load bot definition
        const bot = await loadBot(pg, botId, accountId);
        if (!bot) {
          throw new Error(`Bot ${botId} not found`);
        }

        // Load input from bot_runs
        const runRow = await pg.query(`SELECT * FROM bot_runs WHERE id = $1`, [runId]);
        const run = runRow.rows[0];

        // Execute
        const runner = new BotRunner({ trix, llmRouter, logger, maxTurns });
        const result = await runner.execute({
          bot,
          inputMessage: run.input_message,
          inputContext: run.input_context,
          privateSpaceId: bot.private_space_id,
          conversationId: run.input_context?.conversation_id,
        });

        // Update run with results
        await pg.query(
          `UPDATE bot_runs SET status = 'completed', completed_at = NOW(),
            output_message = $2, output_actions = $3, llm_tokens_used = $4,
            llm_model = $5, duration_ms = $6, memories_stored = $7, memories_searched = $8
           WHERE id = $1`,
          [
            runId, result.output_message, JSON.stringify(result.output_actions),
            result.llm_tokens_used, result.llm_model, result.duration_ms,
            result.memories_stored, result.memories_searched,
          ]
        );

        logger.info({ runId, botId, durationMs: result.duration_ms }, 'Bot run completed');
        return result;
      } catch (error) {
        const errMsg = sanitizeErrorMessage(
          error instanceof Error ? error.message : String(error)
        );
        await pg.query(
          `UPDATE bot_runs SET status = 'failed', completed_at = NOW(), error_message = $2
           WHERE id = $1`,
          [runId, errMsg]
        );
        logger.error({ runId, botId, error: errMsg }, 'Bot run failed');
        throw error;
      }
    },
    {
      connection: { host: url.hostname, port: parseInt(url.port || '6379', 10) },
      concurrency,
    }
  );

  worker.on('error', (err) => {
    logger.error({ error: err.message }, 'Worker error');
  });

  return worker;
}

/** Strip API keys and bearer tokens from error messages before storage. */
function sanitizeErrorMessage(msg: string): string {
  return msg
    .replace(/sk-[a-zA-Z0-9_-]+/g, '[REDACTED]')
    .replace(/key-[a-zA-Z0-9_-]+/g, '[REDACTED]')
    .replace(/Bearer\s+[a-zA-Z0-9_.-]+/g, 'Bearer [REDACTED]');
}

async function loadBot(pg: Pool, botId: string, accountId: string): Promise<BotDefinition | null> {
  const result = await pg.query(
    `SELECT b.*, json_agg(DISTINCT jsonb_build_object('space_id', bs.space_id, 'permission', bs.permission))
      FILTER (WHERE bs.space_id IS NOT NULL) as spaces
     FROM bots b
     LEFT JOIN bot_spaces bs ON bs.bot_id = b.id
     WHERE b.id = $1 AND b.account_id = $2
     GROUP BY b.id`,
    [botId, accountId]
  );
  if (result.rows.length === 0) { return null; }
  const row = result.rows[0];
  const skills = await loadBotSkills(pg, botId);
  return { ...row, spaces: row.spaces || [], skills };
}

async function loadBotSkills(pg: Pool, botId: string): Promise<BotSkill[]> {
  const result = await pg.query(
    `SELECT s.id, s.name, s.slug, s.description, s.content, s.allowed_tools,
            bs.enabled, bs.config, bs.priority
     FROM bot_skills bs
     JOIN skills s ON s.id = bs.skill_id
     WHERE bs.bot_id = $1 AND bs.enabled = true AND s.status = 'published'
     ORDER BY bs.priority ASC, s.name ASC`,
    [botId]
  );
  return result.rows;
}

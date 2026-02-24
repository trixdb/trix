/**
 * Output Handler — Processes bot run output.
 *
 * If memory_strategy is 'auto_store', stores the bot's response as a memory.
 * Prefers the private space when available.
 */

import type { Trix } from '@trixdb/client';
import type { BotDefinition } from '../types.js';

export interface OutputHandlerOptions {
  privateSpaceId?: string;
}

/**
 * Process the final output of a bot run.
 * Stores output as memory if auto_store strategy is enabled.
 * Prefers private space over shared space for auto-stored output.
 */
export async function handleOutput(
  trix: Trix,
  bot: BotDefinition,
  output: string,
  options: OutputHandlerOptions = {},
): Promise<number> {
  if (bot.memory_strategy !== 'auto_store' || !output) {
    return 0;
  }

  // Prefer private space, fall back to shared read_write space
  const targetSpaceId =
    options.privateSpaceId ||
    bot.spaces?.find((s) => s.permission === 'read_write')?.space_id;

  if (!targetSpaceId) {
    return 0;
  }

  await trix.memories.create({
    content: `[Bot: ${bot.name}] ${output}`,
    tags: ['bot-output', `bot:${bot.slug}`],
    spaceId: targetSpaceId,
  } as Parameters<typeof trix.memories.create>[0]);

  return 1;
}

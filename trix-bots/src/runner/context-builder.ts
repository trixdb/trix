/**
 * Context Builder — Fetches memory context from Trix API for bot runs.
 */

import type { Trix } from '@trixdb/client';
import type { BotDefinition } from '../types.js';

export interface MemoryContext {
  memories: string;
  searchCount: number;
}

export interface ContextBuilderOptions {
  privateSpaceId?: string;
  conversationId?: string;
}

/**
 * Search for relevant memories based on the input message.
 * Returns formatted context string for inclusion in the LLM prompt.
 *
 * When a private space and conversation ID are available, runs a split
 * search: private space scoped to conversation + shared spaces unscoped.
 */
export async function buildMemoryContext(
  trix: Trix,
  bot: BotDefinition,
  inputMessage: string | null,
  options: ContextBuilderOptions = {},
): Promise<MemoryContext> {
  if (!inputMessage || bot.memory_strategy === 'read_only') {
    return { memories: '', searchCount: 0 };
  }

  const { privateSpaceId, conversationId } = options;

  // If bot has a private space and we're in a conversation, do split search
  if (privateSpaceId && conversationId) {
    return buildSplitContext(trix, bot, inputMessage, privateSpaceId, conversationId);
  }

  return buildUnifiedContext(trix, bot, inputMessage);
}

/** Split search: private (conversation-scoped) + shared (unscoped). */
async function buildSplitContext(
  trix: Trix,
  bot: BotDefinition,
  inputMessage: string,
  privateSpaceId: string,
  conversationId: string,
): Promise<MemoryContext> {
  const limit = bot.search_limit || 20;
  const sharedSpaceIds = (bot.spaces || [])
    .filter((s) => s.space_id !== privateSpaceId)
    .map((s) => s.space_id);

  // Run both searches in parallel
  const [privateResults, sharedResults] = await Promise.all([
    searchSpace(trix, inputMessage, {
      spaceId: privateSpaceId,
      metadata: { conversation_id: conversationId },
      limit: Math.floor(limit / 2),
    }),
    sharedSpaceIds.length > 0
      ? searchSpaces(trix, inputMessage, { spaceIds: sharedSpaceIds, limit: Math.ceil(limit / 2) })
      : [],
  ]);

  const all = [...privateResults, ...sharedResults];
  return formatContext(all);
}

/** Unified search across all accessible spaces. */
async function buildUnifiedContext(
  trix: Trix,
  bot: BotDefinition,
  inputMessage: string,
): Promise<MemoryContext> {
  const spaceIds = bot.spaces?.map((s) => s.space_id) || [];
  const searchParams: Record<string, unknown> = {
    q: inputMessage,
    limit: bot.search_limit || 20,
  };

  // Fix: pass all space IDs, not just when length === 1
  if (spaceIds.length === 1) {
    searchParams.spaceId = spaceIds[0];
  } else if (spaceIds.length > 1) {
    searchParams.spaceIds = spaceIds.join(',');
  }

  const results = await trix.search.query(
    searchParams as Parameters<typeof trix.search.query>[0],
  );
  const memories = (results as { data?: Array<{ content: string }> }).data || [];
  return formatContext(memories);
}

async function searchSpace(
  trix: Trix,
  query: string,
  opts: { spaceId: string; metadata?: Record<string, unknown>; limit: number },
): Promise<Array<{ content: string }>> {
  const results = await trix.search.query({
    q: query,
    spaceId: opts.spaceId,
    limit: opts.limit,
    ...(opts.metadata ? { metadata: opts.metadata } : {}),
  } as Parameters<typeof trix.search.query>[0]);
  return (results as { data?: Array<{ content: string }> }).data || [];
}

async function searchSpaces(
  trix: Trix,
  query: string,
  opts: { spaceIds: string[]; limit: number },
): Promise<Array<{ content: string }>> {
  const results = await trix.search.query({
    q: query,
    spaceIds: opts.spaceIds.join(','),
    limit: opts.limit,
  } as Parameters<typeof trix.search.query>[0]);
  return (results as { data?: Array<{ content: string }> }).data || [];
}

function formatContext(
  memories: Array<{ content: string }>,
): MemoryContext {
  if (memories.length === 0) {
    return { memories: '', searchCount: 0 };
  }
  const formatted = memories
    .map((m, i) => `[Memory ${i + 1}] ${m.content}`)
    .join('\n\n');
  return { memories: formatted, searchCount: memories.length };
}

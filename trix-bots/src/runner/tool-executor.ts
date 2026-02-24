/**
 * Tool Executor — Executes tools during bot runs.
 *
 * Built-in tools:
 *   trix:search    — Search memories
 *   trix:store     — Store a memory (default: private space)
 *   trix:related   — Find related memories
 */

import type { Trix } from '@trixdb/client';
import type { LLMToolCall, ToolDefinition, ToolResult, ToolExecutorContext } from '../types.js';
import { BUILT_IN_TOOLS } from '../lib/constants.js';

/** Tool definitions exposed to LLMs for built-in Trix tools. */
export function getBuiltInToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: BUILT_IN_TOOLS.SEARCH,
      description: 'Search memories by semantic query. Returns relevant memory content.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          limit: { type: 'number', description: 'Max results (default: 10)' },
        },
        required: ['query'],
      },
    },
    {
      name: BUILT_IN_TOOLS.STORE,
      description:
        'Store a new memory. Stored privately by default. Set shared=true to write to shared space.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Memory content to store' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags for the memory' },
          shared: { type: 'boolean', description: 'Write to shared space instead of private' },
        },
        required: ['content'],
      },
    },
    {
      name: BUILT_IN_TOOLS.RELATED,
      description: 'Find memories related to a given memory ID.',
      parameters: {
        type: 'object',
        properties: {
          memoryId: { type: 'string', description: 'Memory ID to find related memories for' },
          limit: { type: 'number', description: 'Max results (default: 5)' },
        },
        required: ['memoryId'],
      },
    },
  ];
}

/** Execute a single tool call and return the result. */
export async function executeTool(
  toolCall: LLMToolCall,
  ctx: ToolExecutorContext,
): Promise<ToolResult & { memoriesStored: number; memoriesSearched: number }> {
  let args;
  try {
    args = JSON.parse(toolCall.function.arguments);
  } catch {
    return {
      tool_call_id: toolCall.id,
      content: 'Error: Invalid JSON in tool arguments. Please retry with valid JSON.',
      memoriesStored: ctx.memoriesStored,
      memoriesSearched: ctx.memoriesSearched,
    };
  }

  const content = await executeToolAction(toolCall.function.name, args, ctx);

  return {
    tool_call_id: toolCall.id,
    content,
    memoriesStored: ctx.memoriesStored,
    memoriesSearched: ctx.memoriesSearched,
  };
}

async function executeToolAction(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolExecutorContext,
): Promise<string> {
  switch (name) {
    case BUILT_IN_TOOLS.SEARCH:
      return executeSearch(args, ctx);
    case BUILT_IN_TOOLS.STORE:
      return executeStore(args, ctx);
    case BUILT_IN_TOOLS.RELATED:
      return executeRelated(args, ctx);
    default:
      return `Unknown tool: ${name}`;
  }
}

async function executeSearch(
  args: Record<string, unknown>,
  ctx: ToolExecutorContext,
): Promise<string> {
  const searchParams: Record<string, unknown> = {
    q: args.query,
    limit: (args.limit as number) || 10,
  };

  // Search across all accessible spaces (private + shared)
  const spaceIds = ctx.spaces?.map((s) => s.space_id) || [];
  if (spaceIds.length === 1) {
    searchParams.spaceId = spaceIds[0];
  } else if (spaceIds.length > 1) {
    searchParams.spaceIds = spaceIds.join(',');
  }

  const results = await ctx.trix.search.query(
    searchParams as Parameters<typeof ctx.trix.search.query>[0],
  );
  const data = (results as { data?: Array<{ content: string }> }).data || [];
  ctx.memoriesSearched += data.length;

  return data.length ? data.map((m, i) => `[${i + 1}] ${m.content}`).join('\n') : 'No memories found.';
}

async function executeStore(
  args: Record<string, unknown>,
  ctx: ToolExecutorContext,
): Promise<string> {
  // Default-private: write to private space unless shared=true
  const targetSpaceId = args.shared
    ? ctx.spaces?.find((s) => s.permission === 'read_write' && s.space_id !== ctx.privateSpaceId)
        ?.space_id
    : ctx.privateSpaceId;

  if (!targetSpaceId) {
    return 'Error: No writable space available.';
  }

  const createParams: Record<string, unknown> = {
    content: args.content,
    tags: args.tags,
    spaceId: targetSpaceId,
    metadata: {
      ...(ctx.conversationId ? { conversation_id: ctx.conversationId } : {}),
      ...(!args.shared ? { memory_type: 'working_memory' } : {}),
    },
  };

  await ctx.trix.memories.create(
    createParams as Parameters<typeof ctx.trix.memories.create>[0],
  );
  ctx.memoriesStored++;
  return 'Memory stored successfully.';
}

async function executeRelated(
  args: Record<string, unknown>,
  ctx: ToolExecutorContext,
): Promise<string> {
  const related = await ctx.trix.search.similar(
    args.memoryId as string,
    { limit: (args.limit as number) || 5 },
  );
  const data = (related as { data?: Array<{ content: string }> }).data || [];
  ctx.memoriesSearched += data.length;

  return data.length
    ? data.map((m, i) => `[${i + 1}] ${m.content}`).join('\n')
    : 'No related memories found.';
}

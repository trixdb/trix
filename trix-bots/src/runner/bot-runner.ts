/**
 * BotRunner — Core bot execution loop.
 *
 * 1. Load bot definition
 * 2. Build system prompt (bot.system_prompt + persona context)
 * 3. Fetch memory context via Trix SDK
 * 4. Build LLM messages array
 * 5. Call LLM
 * 6. If tool calls → execute → feed results back → loop
 * 7. Process final output (auto_store if configured)
 * 8. Return structured result
 */

import type { Trix } from '@trixdb/client';
import type pino from 'pino';
import type { LLMRouter } from '../llm/llm-router.js';
import type {
  BotDefinition,
  BotRunResult,
  LLMMessage,
  BotAction,
  ToolExecutorContext,
} from '../types.js';
import { buildMemoryContext } from './context-builder.js';
import { getBuiltInToolDefinitions, executeTool } from './tool-executor.js';
import { handleOutput } from './output-handler.js';
import { formatSkillsForPrompt } from './skill-loader.js';
import { MAX_TOOL_CALLS_PER_RUN } from '../lib/constants.js';

export interface BotRunnerDeps {
  trix: Trix;
  llmRouter: LLMRouter;
  logger: pino.Logger;
  maxTurns: number;
}

export interface RunInput {
  bot: BotDefinition;
  inputMessage: string | null;
  inputContext?: Record<string, unknown>;
  privateSpaceId?: string;
  conversationId?: string;
}

export class BotRunner {
  private trix: Trix;
  private llmRouter: LLMRouter;
  private logger: pino.Logger;
  private maxTurns: number;

  constructor(deps: BotRunnerDeps) {
    this.trix = deps.trix;
    this.llmRouter = deps.llmRouter;
    this.logger = deps.logger;
    this.maxTurns = deps.maxTurns;
  }

  async execute(input: RunInput): Promise<BotRunResult> {
    const startTime = Date.now();
    const { bot, inputMessage, privateSpaceId, conversationId } = input;
    const maxTurns = Math.min(bot.max_turns_per_run, this.maxTurns);

    // Build initial messages
    const messages: LLMMessage[] = await this.buildInitialMessages(bot, inputMessage);
    const tools = getBuiltInToolDefinitions();
    const actions: BotAction[] = [];
    let totalTokens = 0;
    let memoriesStored = 0;
    let memoriesSearched = 0;

    // Fetch memory context
    const memCtx = await buildMemoryContext(this.trix, bot, inputMessage, {
      privateSpaceId,
      conversationId,
    });
    memoriesSearched += memCtx.searchCount;
    if (memCtx.memories) {
      messages.push({
        role: 'user',
        content: `Relevant memories:\n${memCtx.memories}\n\nUser message: ${inputMessage || '(no message)'}`,
      });
    } else if (inputMessage) {
      messages.push({ role: 'user', content: inputMessage });
    }

    // Agentic loop
    const toolCtx: ToolExecutorContext = {
      trix: this.trix,
      spaces: bot.spaces || [],
      privateSpaceId,
      conversationId,
      memoriesStored,
      memoriesSearched,
    };
    let lastContent = '';
    let totalToolCalls = 0;
    for (let turn = 0; turn < maxTurns; turn++) {
      const response = await this.llmRouter.chat(bot.provider, {
        model: bot.model,
        messages,
        temperature: bot.temperature,
        maxTokens: bot.max_tokens,
        tools,
      });

      totalTokens += response.tokens_used;
      lastContent = response.content;

      // No tool calls — we're done
      if (!response.tool_calls?.length) {
        break;
      }

      // Add assistant message with tool calls
      messages.push({
        role: 'assistant',
        content: response.content,
        tool_calls: response.tool_calls,
      });

      // Execute each tool call
      for (const toolCall of response.tool_calls) {
        if (totalToolCalls >= MAX_TOOL_CALLS_PER_RUN) {
          messages.push({
            role: 'tool',
            content: 'Error: Tool call budget exceeded for this run.',
            tool_call_id: toolCall.id,
          });
          continue;
        }
        totalToolCalls++;

        const result = await executeTool(toolCall, toolCtx);
        memoriesStored = result.memoriesStored;
        memoriesSearched = result.memoriesSearched;

        messages.push({
          role: 'tool',
          content: result.content,
          tool_call_id: result.tool_call_id,
        });

        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(toolCall.function.arguments);
        } catch {
          // Arguments already handled as error by executeTool
        }

        actions.push({
          tool: toolCall.function.name,
          args: parsedArgs,
          result: result.content,
        });
      }
    }

    // Handle auto-store output
    const stored = await handleOutput(this.trix, bot, lastContent, { privateSpaceId });
    memoriesStored += stored;

    this.logger.info({
      botId: bot.id,
      tokens: totalTokens,
      actions: actions.length,
      durationMs: Date.now() - startTime,
    }, 'Bot run completed');

    return {
      output_message: lastContent,
      output_actions: actions,
      llm_tokens_used: totalTokens,
      llm_model: bot.model,
      duration_ms: Date.now() - startTime,
      memories_stored: memoriesStored,
      memories_searched: memoriesSearched,
    };
  }

  private async buildInitialMessages(
    bot: BotDefinition,
    _inputMessage: string | null,
  ): Promise<LLMMessage[]> {
    const systemParts = [bot.system_prompt];

    // Inject skill instructions
    if (bot.skills?.length) {
      const skillPrompt = formatSkillsForPrompt(bot.skills);
      if (skillPrompt) {
        systemParts.push(skillPrompt);
      }
    }

    if (bot.memory_strategy !== 'read_only') {
      systemParts.push(
        'You have access to a memory system. Use trix:search to find relevant information ' +
        'and trix:store to save important new information.'
      );
    }

    return [{ role: 'system', content: systemParts.join('\n\n') }];
  }
}

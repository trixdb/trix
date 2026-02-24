/**
 * Shared types for trix-bots.
 */

import type { Trix } from '@trixdb/client';

export interface BotSkill {
  id: string;
  name: string;
  slug: string;
  description: string;
  content: string;
  allowed_tools?: string[];
  enabled: boolean;
  config: Record<string, unknown>;
  priority: number;
}

export interface BotDefinition {
  id: string;
  account_id: string;
  persona_id?: string;
  name: string;
  slug: string;
  description?: string;
  status: 'active' | 'paused' | 'disabled';
  model: string;
  provider: string;
  temperature: number;
  max_tokens: number;
  system_prompt: string;
  memory_strategy: 'search' | 'auto_store' | 'read_only';
  search_limit: number;
  tools: BotTool[];
  max_turns_per_run: number;
  require_approval: string[];
  settings: Record<string, unknown>;
  metadata: Record<string, unknown>;
  spaces?: BotSpace[];
  skills?: BotSkill[];
  private_space_id?: string;
}

export interface BotTool {
  server: string;
  tools?: string[];
}

export interface BotSpace {
  space_id: string;
  permission: 'read' | 'read_write';
}

export interface BotRunJob {
  runId: string;
  botId: string;
  accountId: string;
  privateSpaceId?: string;
  conversationId?: string;
}

export interface ToolExecutorContext {
  trix: Trix;
  spaces: BotSpace[];
  privateSpaceId?: string;
  conversationId?: string;
  memoriesStored: number;
  memoriesSearched: number;
}

export interface BotRunResult {
  output_message: string;
  output_actions: BotAction[];
  llm_tokens_used: number;
  llm_model: string;
  duration_ms: number;
  memories_stored: number;
  memories_searched: number;
}

export interface BotAction {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: LLMToolCall[];
}

export interface LLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface LLMResponse {
  content: string;
  tool_calls?: LLMToolCall[];
  tokens_used: number;
  model: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolResult {
  tool_call_id: string;
  content: string;
}

export interface PgNotifyEvent {
  id: string;
  type: string;
  account_id: string;
  space_id?: string;
}

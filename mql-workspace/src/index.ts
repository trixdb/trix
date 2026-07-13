import { Query } from './ast.js';
import { compile } from './compiler.js';
import { FieldRegistry } from './field-registry.js';
import { trixMemoryRegistry } from './fields.js';
import { parse } from './parser.js';
import { CompileOptions, QueryPlan } from './query-plan.js';
import { Result } from './errors.js';
import { validate } from './validator.js';

export * from './ast.js';
export * from './errors.js';
export * from './field-registry.js';
export * from './query-plan.js';
export { parse } from './parser.js';
export { validate } from './validator.js';
export { compile } from './compiler.js';
export { print } from './printer.js';
export { toSearchRequest } from './to-search-request.js';
export type { SearchRequest } from './to-search-request.js';
export { trixMemoryRegistry } from './fields.js';
export { lex } from './lexer.js';

/**
 * Facade: parse → validate → compile in one call. This is the public entry
 * point a host (trix-api endpoint, MCP tool, CLI, SDK) uses. Errors from any
 * stage surface as a single {@link Result}.
 */
export function compileMql(
  source: string,
  registry: FieldRegistry = trixMemoryRegistry(),
  options: CompileOptions = {},
): Result<QueryPlan> {
  const parsed = parse(source);
  if (!parsed.ok) return parsed;
  const validated = validate(parsed.value, registry);
  if (!validated.ok) return validated;
  return { ok: true, value: compile(validated.value, registry, options) };
}

/** Parse + validate only (no compile) — for editors / linting / previews. */
export function analyzeMql(
  source: string,
  registry: FieldRegistry = trixMemoryRegistry(),
): Result<Query> {
  const parsed = parse(source);
  if (!parsed.ok) return parsed;
  return validate(parsed.value, registry);
}

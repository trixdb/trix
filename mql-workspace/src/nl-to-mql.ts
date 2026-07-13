import { FieldRegistry } from './field-registry.js';
import { trixMemoryRegistry } from './fields.js';
import { MqlError, Result, err, mqlError, ok } from './errors.js';
import { QueryPlan } from './query-plan.js';
import { analyzeMql, compileMql } from './index.js';

/**
 * Natural-language → MQL. Turns a user/agent utterance into a validated MQL
 * query by prompting an injected LLM, then running a *self-repair* loop: if the
 * model's MQL fails validation, the exact diagnostics are fed back for a fix.
 * The LLM is a dependency (not hard-wired), so prompt construction and the
 * repair loop are fully unit-testable. Mirrors the in-repo CQL `build_cql_query`
 * pattern, but for the composable memory language.
 */
export type LlmFn = (system: string, user: string) => Promise<string>;

export interface NlToMqlResult {
  readonly mql: string;
  readonly plan: QueryPlan;
  /** Number of repair round-trips used (0 = model got it first try). */
  readonly repairs: number;
}

export interface NlToMqlOptions {
  readonly registry?: FieldRegistry;
  readonly maxRepairs?: number;
  readonly now?: Date;
}

export async function nlToMql(
  nl: string,
  llm: LlmFn,
  options: NlToMqlOptions = {},
): Promise<Result<NlToMqlResult>> {
  const registry = options.registry ?? trixMemoryRegistry();
  const maxRepairs = options.maxRepairs ?? 2;
  const system = buildSystemPrompt(registry);
  let user = `Question: ${nl}\nMQL:`;
  let last: readonly MqlError[] = [];

  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    const mql = extractMql(await llm(system, user));
    const analysis = analyzeMql(mql, registry);
    if (analysis.ok) {
      const compiled = compileMql(mql, registry, options.now ? { now: options.now } : {});
      if (compiled.ok) return ok({ mql, plan: compiled.value, repairs: attempt });
      last = compiled.errors;
    } else {
      last = analysis.errors;
    }
    user = repairPrompt(nl, mql, last);
  }
  return err([mqlError('validate', `could not produce valid MQL after ${maxRepairs} repairs`, 0, nl.length), ...last]);
}

/** Data-driven system prompt: field reference is generated from the registry. */
export function buildSystemPrompt(registry: FieldRegistry): string {
  const fields = registry
    .fields()
    .map((f) => `- ${f.name}${f.aliases?.length ? ` (aka ${f.aliases.join(', ')})` : ''}: ${f.type}${f.enumValues ? ` [${f.enumValues.join('|')}]` : ''}${f.description ? ` — ${f.description}` : ''}`)
    .join('\n');
  return [
    'You translate a natural-language question about stored memories into a single MQL query.',
    'MQL grammar: `field op value` predicates joined by AND (juxtaposition) / `or` / `not`, with parentheses.',
    'Operators: `:` (equals/matches), `= != > >= < <=`, `in [a,b]`, `between x and y`.',
    'Values: quoted strings, numbers, ISO dates (2026-01-01), `now`/`today` with `-7d`/`-2h`, true/false.',
    'Clauses: `~"semantic text"` for meaning-based search, `order by relevance|recency|quality|<field> [asc|desc]`, `limit N`.',
    'Output ONLY the MQL query on one line — no prose, no code fences.',
    '',
    'Queryable fields:',
    fields,
    '',
    'Examples:',
    'Question: high-quality decisions about Alice from the last month',
    'MQL: (entity:"Alice") and type:decision and quality>=0.7 and created>now-30d',
    'Question: pinned memories in the work space, most recent first',
    'MQL: space:work pinned:true order by recency',
  ].join('\n');
}

function repairPrompt(nl: string, badMql: string, errors: readonly MqlError[]): string {
  const list = errors.map((e) => `- ${e.message}`).join('\n');
  return `Question: ${nl}\nYour MQL was invalid:\n${badMql}\nErrors:\n${list}\nReturn a corrected MQL query (one line, no prose).\nMQL:`;
}

/** Pull the MQL line out of a model response (tolerates fences / a label). */
export function extractMql(raw: string): string {
  const cleaned = raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
  const line = cleaned.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? '';
  return line.replace(/^MQL:\s*/i, '').trim();
}

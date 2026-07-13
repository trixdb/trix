import type { CompareOp, Expr, Predicate, Value } from './ast.js';
import type { FieldRegistry, ResolvedField } from './field-registry.js';
import type { SqlFragment } from './query-plan.js';
import { resolveLiteral } from './query-plan.js';

/**
 * Compiles a boolean {@link Expr} into a parameterised SQL WHERE fragment — the
 * capability the flat param surface cannot offer (OR / NOT / grouping / ranges).
 * Column identifiers come only from the {@link FieldRegistry} (never user text),
 * and every value is a bound `$n` parameter, so the output is injection-safe.
 * The fragment is a *predicate only*: the host must AND in tenancy guards.
 */
export interface SqlOptions {
  readonly now: Date;
  readonly paramOffset: number;
  readonly tableAlias: string;
}

const SCALAR_SQL: Readonly<Record<string, string>> = {
  ':': '=', '=': '=', '!=': '<>', '>': '>', '>=': '>=', '<': '<', '<=': '<=',
};

export function compileWhere(
  filter: Expr,
  registry: FieldRegistry,
  opts: SqlOptions,
): SqlFragment {
  const params: unknown[] = [];
  const ph = () => `$${opts.paramOffset + params.length}`; // call AFTER push
  const push = (v: unknown): string => {
    params.push(v);
    return ph();
  };
  const sql = emit(filter, registry, opts, push);
  return { sql, params };
}

type Push = (v: unknown) => string;

function emit(node: Expr, reg: FieldRegistry, o: SqlOptions, push: Push): string {
  switch (node.type) {
    case 'and':
      return group(node.operands.map((n) => emit(n, reg, o, push)), ' AND ');
    case 'or':
      return group(node.operands.map((n) => emit(n, reg, o, push)), ' OR ');
    case 'not':
      return `NOT ${wrap(emit(node.operand, reg, o, push))}`;
    case 'predicate':
      return emitPredicate(node, reg, o, push);
  }
}

function emitPredicate(p: Predicate, reg: FieldRegistry, o: SqlOptions, push: Push): string {
  const field = reg.resolve(p.field);
  if (!field) throw new Error(`MQL compile invariant: unresolved field '${p.field}' (validate before compile)`);
  const col = `${o.tableAlias}.${field.target ?? field.name}`;
  if (field.name === 'content') return `${col} @@ plainto_tsquery('english', ${push(scalar(p.value, o))})`;
  if (field.name === 'entity' || field.name === 'topic') return emitGraph(field, p, o, push);
  if (field.type === 'tag') return emitTag(col, p, o, push);
  if (p.op === 'in') return `${col} = ANY(${push(listValues(p.value, o))})`;
  if (p.op === 'between') return emitBetween(col, p, o, push);
  return `${col} ${SCALAR_SQL[p.op]} ${push(scalar(p.value, o))}`;
}

function emitBetween(col: string, p: Predicate, o: SqlOptions, push: Push): string {
  const [lo, hi] = p.value as readonly Value[];
  return `${col} BETWEEN ${push(resolveLiteral(lo!, o.now))} AND ${push(resolveLiteral(hi!, o.now))}`;
}

function emitTag(col: string, p: Predicate, o: SqlOptions, push: Push): string {
  if (p.op === 'in') return `${col} && ${push(listValues(p.value, o))}`;
  return `${push(scalar(p.value, o))} = ANY(${col})`;
}

/** entity/topic are graph joins; emit an EXISTS correlated on the memory id. */
function emitGraph(field: ResolvedField, p: Predicate, o: SqlOptions, push: Push): string {
  const idCol = `${o.tableAlias}.id`;
  return field.name === 'entity'
    ? emitEntityExists(idCol, p, o, push)
    : emitTopicExists(idCol, p, o, push);
}

/** memory -> memory_facts -> fact_entities -> memory_entities (name match). */
function emitEntityExists(idCol: string, p: Predicate, o: SqlOptions, push: Push): string {
  const match = p.op === 'in'
    ? `me.name = ANY(${push(listValues(p.value, o))})`
    : `me.name = ${push(scalar(p.value, o))}`;
  return `EXISTS (SELECT 1 FROM memory_facts mf JOIN fact_entities fe ON fe.fact_id = mf.id JOIN memory_entities me ON me.id = fe.entity_id WHERE mf.memory_id = ${idCol} AND ${match})`;
}

/** topics live in enrichments.result->'topics' JSONB (enrichment_type='topics'). */
function emitTopicExists(idCol: string, p: Predicate, o: SqlOptions, push: Push): string {
  const match = p.op === 'in'
    ? `t->>'name' = ANY(${push(listValues(p.value, o))})`
    : `t->>'name' = ${push(scalar(p.value, o))}`;
  return `EXISTS (SELECT 1 FROM enrichments e, jsonb_array_elements(e.result->'topics') t WHERE e.memory_id = ${idCol} AND e.enrichment_type = 'topics' AND e.status = 'completed' AND ${match})`;
}

function scalar(v: Value | readonly Value[], o: SqlOptions): string | number | boolean {
  return resolveLiteral(v as Value, o.now);
}

function listValues(v: Value | readonly Value[], o: SqlOptions): unknown[] {
  return (v as readonly Value[]).map((item) => resolveLiteral(item, o.now));
}

function group(parts: readonly string[], sep: string): string {
  return parts.length === 1 ? parts[0]! : `(${parts.join(sep)})`;
}

function wrap(sql: string): string {
  return sql.startsWith('(') ? sql : `(${sql})`;
}

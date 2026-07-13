import { CompareOp, Expr, Predicate } from './ast.js';
import { FieldRegistry } from './field-registry.js';
import { FlatFilters, resolveLiteral } from './query-plan.js';

/**
 * Attempts to compile a filter into the existing flat `listMemoriesSchema`
 * params — the "zero new execution code" path. Returns `null` when the query
 * uses composition (OR/NOT/grouping) or fields the flat surface cannot express
 * (quality, memory_type, event_date range, entity, topic, ...), signalling the
 * caller to fall back to the SQL WHERE fragment. Contract is all-or-nothing:
 * a non-null result fully and faithfully represents the query.
 */
type FlatRule = (p: Predicate, value: string | number | boolean) => Record<string, unknown> | null;

/** field name -> rule mapping (field, op) to the flat param it emits. */
const RULES: Readonly<Record<string, FlatRule>> = {
  space: eqParam('space_id'),
  session: eqParam('session_id'),
  cluster: eqParam('cluster'),
  content_type: eqParam('type'),
  origin: eqParam('origin_type'),
  source_type: eqParam('source_type'),
  pinned: eqParam('is_pinned'),
  protected: eqParam('is_protected'),
  tags: tagsRule,
  salience: minRule('min_salience'),
  created: rangeRule('created_after', 'created_before'),
  updated: rangeRule('updated_after', 'updated_before'),
};

const EQ_OPS = new Set<CompareOp>([':', '=']);

export function compileFlat(
  filter: Expr,
  registry: FieldRegistry,
  now: Date,
): FlatFilters | null {
  const predicates = flattenConjunction(filter);
  if (!predicates) return null; // contains OR / NOT / nested groups
  const out: Record<string, unknown> = {};
  for (const p of predicates) {
    const canonical = registry.resolve(p.field)!.name;
    const rule = RULES[canonical];
    if (!rule) return null; // field not expressible as a flat param
    const emitted = rule(p, resolveLiteral(asScalar(p), now));
    if (!emitted) return null; // op not flat-mappable for this field
    Object.assign(out, emitted);
  }
  return out as FlatFilters;
}

/** Flatten a top-level pure conjunction into predicates; null if any OR/NOT. */
function flattenConjunction(node: Expr): Predicate[] | null {
  if (node.type === 'predicate') return [node];
  if (node.type === 'and') {
    const acc: Predicate[] = [];
    for (const op of node.operands) {
      const inner = flattenConjunction(op);
      if (!inner) return null;
      acc.push(...inner);
    }
    return acc;
  }
  return null; // or / not
}

function asScalar(p: Predicate): import('./ast.js').Value {
  return p.value as import('./ast.js').Value;
}

function eqParam(param: string): FlatRule {
  return (p, value) => (EQ_OPS.has(p.op) ? { [param]: value } : null);
}

function tagsRule(p: Predicate, value: string | number | boolean): Record<string, unknown> | null {
  if (EQ_OPS.has(p.op)) return { tags: [String(value)] };
  return null; // `in` semantics differ (overlap) — route to SQL for fidelity
}

function minRule(param: string): FlatRule {
  return (p, value) => (p.op === '>=' || p.op === '>' ? { [param]: value } : null);
}

function rangeRule(afterParam: string, beforeParam: string): FlatRule {
  return (p, value) => {
    if (p.op === '>' || p.op === '>=') return { [afterParam]: value };
    if (p.op === '<' || p.op === '<=') return { [beforeParam]: value };
    return null;
  };
}

import type { Expr, Predicate, Query, Value } from './ast.js';
import type { FieldRegistry, FieldType, ResolvedField } from './field-registry.js';
import type { MqlError, Result } from './errors.js';
import { err, mqlError, ok } from './errors.js';
import { nearestName } from './suggest.js';

/**
 * Semantic analysis: checks a parsed {@link Query} against a {@link FieldRegistry}.
 * Verifies every field exists, every operator is legal for its field's type, and
 * every value's type is compatible. Aggregates ALL diagnostics (not fail-fast) so
 * a caller can surface every mistake at once.
 */
export function validate(query: Query, registry: FieldRegistry): Result<Query> {
  const errors: MqlError[] = [];
  if (query.filter) checkExpr(query.filter, registry, errors);
  checkOrderBy(query, registry, errors);
  return errors.length ? err(errors) : ok(query);
}

function checkExpr(node: Expr, reg: FieldRegistry, errors: MqlError[]): void {
  switch (node.type) {
    case 'and':
    case 'or':
      node.operands.forEach((o) => checkExpr(o, reg, errors));
      return;
    case 'not':
      checkExpr(node.operand, reg, errors);
      return;
    case 'predicate':
      checkPredicate(node, reg, errors);
  }
}

function checkPredicate(p: Predicate, reg: FieldRegistry, errors: MqlError[]): void {
  const field = reg.resolve(p.field);
  if (!field) {
    const hint = nearestName(p.field, reg.allNames());
    const msg = hint ? `unknown field '${p.field}' — did you mean '${hint}'?` : `unknown field '${p.field}'`;
    errors.push(mqlError('validate', msg, p.span.start, p.span.end));
    return;
  }
  if (!field.ops.includes(p.op)) {
    const allowed = field.ops.join(', ');
    errors.push(mqlError('validate', `operator '${p.op}' not allowed on '${field.name}' (allowed: ${allowed})`, p.span.start, p.span.end));
    return;
  }
  checkValues(p, field, errors);
}

function checkValues(p: Predicate, field: ResolvedField, errors: MqlError[]): void {
  const values = Array.isArray(p.value) ? p.value : [p.value as Value];
  if (p.op === 'between' && values.length !== 2)
    errors.push(mqlError('validate', 'between requires exactly two bounds', p.span.start, p.span.end));
  for (const v of values) {
    if (!valueMatchesType(v, field.type)) {
      errors.push(mqlError('validate', `'${field.name}' expects a ${field.type} value, got ${describe(v)}`, p.span.start, p.span.end));
    } else if (field.type === 'enum') {
      checkEnum(v, field, p, errors);
    } else if (field.type === 'number') {
      checkNumberRange(v, field, p, errors);
    }
  }
}

function checkEnum(v: Value, field: ResolvedField, p: Predicate, errors: MqlError[]): void {
  const literal = valueText(v).toLowerCase();
  const allowed = (field.enumValues ?? []).map((e) => e.toLowerCase());
  if (!allowed.length || allowed.includes(literal)) return;
  const hint = nearestName(valueText(v), field.enumValues ?? [], 2);
  const suffix = hint ? `did you mean '${hint}'?` : `one of: ${field.enumValues!.join(', ')}`;
  errors.push(mqlError('validate', `'${valueText(v)}' is not a valid ${field.name} — ${suffix}`, p.span.start, p.span.end));
}

function checkNumberRange(v: Value, field: ResolvedField, p: Predicate, errors: MqlError[]): void {
  if (v.kind !== 'number') return;
  const scoreFields = new Set(['quality', 'salience', 'retention', 'anomaly_score', 'decay_rate']);
  if (scoreFields.has(field.name) && (v.value < 0 || v.value > 1))
    errors.push(mqlError('validate', `'${field.name}' must be between 0 and 1`, p.span.start, p.span.end));
}

function checkOrderBy(query: Query, reg: FieldRegistry, errors: MqlError[]): void {
  const key = query.orderBy?.key;
  if (!key || typeof key === 'string') return; // relevance/recency/quality are built-in
  const field = reg.resolve(key.field);
  if (!field) {
    const hint = nearestName(key.field, reg.allNames());
    errors.push(mqlError('validate', `cannot order by unknown field '${key.field}'${hint ? ` — did you mean '${hint}'?` : ''}`, 0, 0));
  } else if (!field.sortable) {
    errors.push(mqlError('validate', `field '${field.name}' is not sortable`, 0, 0));
  }
}

function valueMatchesType(v: Value, type: FieldType): boolean {
  switch (type) {
    case 'date':
      return v.kind === 'date' || v.kind === 'relative';
    case 'number':
      return v.kind === 'number';
    case 'boolean':
      return v.kind === 'boolean';
    default: // text | id | enum | tag
      return v.kind === 'string' || v.kind === 'ident';
  }
}

function valueText(v: Value): string {
  return v.kind === 'relative' ? `${v.base}${v.sign < 0 ? '-' : '+'}${v.amount}${v.unit}` : String((v as { value: unknown }).value);
}

function describe(v: Value): string {
  return `${v.kind} (${valueText(v)})`;
}

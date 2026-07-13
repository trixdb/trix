import { CompareOp, Expr, OrderBy, Query, Value } from './ast.js';

/**
 * Renders a {@link Query} back to canonical MQL text. This is the inverse of the
 * parser and enables: echoing/normalising user queries, programmatic query
 * construction, and semantic round-trip testing (`parse(print(q))` compiles to
 * the same plan as `q`). Output is always valid MQL that re-parses equivalently.
 */
export function print(query: Query): string {
  const parts: string[] = [];
  if (query.filter) parts.push(printExpr(query.filter, 0));
  if (query.similarity) parts.push(`~${quote(query.similarity.text)}`);
  if (query.orderBy) parts.push(printOrder(query.orderBy));
  if (query.limit !== undefined) parts.push(`limit ${query.limit}`);
  return parts.join(' ');
}

/** `prec`: parent precedence (0=or, 1=and, 2=not) to add parens only when needed. */
function printExpr(node: Expr, prec: number): string {
  switch (node.type) {
    case 'or':
      return paren(node.operands.map((n) => printExpr(n, 1)).join(' or '), prec > 0);
    case 'and':
      return paren(node.operands.map((n) => printExpr(n, 2)).join(' and '), prec > 1);
    case 'not':
      return `not ${printExpr(node.operand, 2)}`;
    case 'predicate':
      return printPredicate(node);
  }
}

function printPredicate(p: { field: string; op: CompareOp; value: Value | readonly Value[] }): string {
  if (p.op === 'in') return `${p.field} in [${(p.value as readonly Value[]).map(printValue).join(', ')}]`;
  if (p.op === 'between') {
    const [lo, hi] = p.value as readonly Value[];
    return `${p.field} between ${printValue(lo!)} and ${printValue(hi!)}`;
  }
  const sep = p.op === ':' ? ':' : p.op;
  return `${p.field}${sep}${printValue(p.value as Value)}`;
}

function printValue(v: Value): string {
  switch (v.kind) {
    case 'string':
      return quote(v.value);
    case 'number':
      return String(v.value);
    case 'boolean':
      return String(v.value);
    case 'date':
      return v.value;
    case 'ident':
      return v.value;
    case 'relative':
      return `${v.base}${v.sign < 0 ? '-' : '+'}${v.amount}${v.unit}`;
  }
}

function printOrder(order: OrderBy): string {
  const key = typeof order.key === 'string' ? order.key : order.key.field;
  return `order by ${key} ${order.direction}`;
}

function quote(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function paren(s: string, needed: boolean): string {
  return needed ? `(${s})` : s;
}

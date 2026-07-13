/**
 * MQL abstract syntax tree — immutable value objects.
 *
 * A {@link Query} is the top-level result: an optional boolean predicate tree
 * ({@link Expr}) plus optional semantic-similarity, ordering, and limit clauses.
 * Boolean nodes are n-ary so the compiler can flatten `a and b and c` into one
 * conjunction rather than a nested chain.
 */

export interface Span {
  readonly start: number;
  readonly end: number;
}

/** Comparison operators. `:` is shorthand (equality, or "matches" for text). */
export type CompareOp = ':' | '=' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'between';

export type Value =
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'date'; readonly value: string }
  | { readonly kind: 'ident'; readonly value: string }
  | {
      readonly kind: 'relative';
      readonly base: 'now' | 'today';
      readonly sign: 1 | -1;
      readonly amount: number;
      readonly unit: 's' | 'm' | 'h' | 'd' | 'w';
    };

export interface Predicate {
  readonly type: 'predicate';
  readonly field: string;
  readonly op: CompareOp;
  /** scalar for most ops; array for `in`; [lo, hi] for `between`. */
  readonly value: Value | readonly Value[];
  readonly span: Span;
}

export interface And {
  readonly type: 'and';
  readonly operands: readonly Expr[];
}
export interface Or {
  readonly type: 'or';
  readonly operands: readonly Expr[];
}
export interface Not {
  readonly type: 'not';
  readonly operand: Expr;
}

export type Expr = Predicate | And | Or | Not;

export type OrderKey = 'relevance' | 'recency' | 'quality' | { readonly field: string };
export interface OrderBy {
  readonly key: OrderKey;
  readonly direction: 'asc' | 'desc';
}

export interface Similarity {
  readonly text: string;
  readonly span: Span;
}

export interface Query {
  readonly filter?: Expr;
  readonly similarity?: Similarity;
  readonly orderBy?: OrderBy;
  readonly limit?: number;
}

// --- constructors (keep parser terse and intent-revealing) ---------------

export function and(operands: readonly Expr[]): Expr {
  return operands.length === 1 ? operands[0]! : { type: 'and', operands };
}
export function or(operands: readonly Expr[]): Expr {
  return operands.length === 1 ? operands[0]! : { type: 'or', operands };
}
export function not(operand: Expr): Not {
  return { type: 'not', operand };
}
export function predicate(
  field: string,
  op: CompareOp,
  value: Value | readonly Value[],
  span: Span,
): Predicate {
  return { type: 'predicate', field, op, value, span };
}

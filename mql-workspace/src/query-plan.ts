import type { Value } from './ast.js';

/**
 * The compile target. A {@link QueryPlan} is what MQL produces for a host to
 * execute. It carries three complementary things:
 *  - `text`/`mode`: the semantic-search leg (from `~"..."`).
 *  - `filters` + `flatCompatible`: the pure-AND subset mapped 1:1 onto the
 *    existing flat `listMemoriesSchema` params — executable with ZERO new code.
 *  - `where`: the FULL boolean tree compiled to a parameterised SQL fragment —
 *    the net-new capability (OR / NOT / grouping / ranges) the flat surface
 *    cannot express. Params are `$1`-based and offsettable so the host can
 *    prepend mandatory tenancy guards (account_id, is_deleted).
 */
export interface FlatFilters {
  readonly [param: string]: string | number | boolean | readonly string[];
}

export interface SqlFragment {
  readonly sql: string;
  readonly params: readonly unknown[];
}

export interface PlanOrder {
  readonly column: string;
  readonly direction: 'asc' | 'desc';
}

export interface QueryPlan {
  readonly text?: string;
  readonly mode: 'structured' | 'semantic' | 'hybrid';
  readonly filters: FlatFilters;
  /** True when the entire filter maps to flat params (no SQL fragment needed). */
  readonly flatCompatible: boolean;
  readonly where?: SqlFragment;
  readonly orderBy?: PlanOrder;
  readonly limit?: number;
}

export interface CompileOptions {
  /** Reference time for `now`/`today`/relative values. Injected for determinism. */
  readonly now?: Date;
  /** Params in `where.sql` start at `$(paramOffset + 1)`. Default 0. */
  readonly paramOffset?: number;
  /** Table alias the SQL fragment is compiled against. Default `m`. */
  readonly tableAlias?: string;
}

const UNIT_MS: Readonly<Record<string, number>> = {
  s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000,
};

/** Resolve any temporal value (absolute, `now`/`today`, or relative) to a Date. */
export function resolveTemporal(v: Value, now: Date): Date {
  if (v.kind === 'date') {
    if (v.value === 'now') return now;
    if (v.value === 'today') return startOfDay(now);
    return new Date(v.value);
  }
  if (v.kind === 'relative') {
    const base = v.base === 'today' ? startOfDay(now) : now;
    return new Date(base.getTime() + v.sign * v.amount * UNIT_MS[v.unit]!);
  }
  throw new Error(`not a temporal value: ${v.kind}`);
}

/** Resolve a value to the JS primitive bound as a SQL/flat parameter. */
export function resolveLiteral(v: Value, now: Date): string | number | boolean {
  switch (v.kind) {
    case 'number':
      return v.value;
    case 'boolean':
      return v.value;
    case 'string':
    case 'ident':
      return v.value;
    case 'date':
    case 'relative':
      return resolveTemporal(v, now).toISOString();
  }
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setUTCHours(0, 0, 0, 0);
  return c;
}

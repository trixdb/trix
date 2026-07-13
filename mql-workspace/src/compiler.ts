import type { OrderBy, Query } from './ast.js';
import { compileFlat } from './compile-flat.js';
import { compileWhere } from './compile-sql.js';
import type { FieldRegistry } from './field-registry.js';
import type { CompileOptions, PlanOrder, QueryPlan } from './query-plan.js';

/**
 * Compiles a validated {@link Query} into an executable {@link QueryPlan}.
 * Strategy: prefer the flat-param path (reuses the existing endpoint verbatim);
 * fall back to a parameterised SQL WHERE fragment for anything the flat surface
 * cannot express. The two are mutually exclusive per query, so a host has an
 * unambiguous execution route.
 */
export function compile(query: Query, registry: FieldRegistry, options: CompileOptions = {}): QueryPlan {
  const now = options.now ?? new Date();
  const sqlOpts = { now, paramOffset: options.paramOffset ?? 0, tableAlias: options.tableAlias ?? 'm' };

  const flat = query.filter ? compileFlat(query.filter, registry, now) : {};
  const flatCompatible = flat !== null;
  const where = query.filter && !flatCompatible ? compileWhere(query.filter, registry, sqlOpts) : undefined;

  return {
    mode: resolveMode(query),
    filters: flat ?? {},
    flatCompatible,
    ...(query.similarity ? { text: query.similarity.text } : {}),
    ...(where ? { where } : {}),
    ...(resolveOrder(query.orderBy, registry) ? { orderBy: resolveOrder(query.orderBy, registry)! } : {}),
    ...(query.limit !== undefined ? { limit: query.limit } : {}),
  };
}

function resolveMode(query: Query): QueryPlan['mode'] {
  if (!query.similarity) return 'structured';
  return query.filter ? 'hybrid' : 'semantic';
}

/** Map an order clause to a concrete column + direction. */
function resolveOrder(order: OrderBy | undefined, registry: FieldRegistry): PlanOrder | undefined {
  if (!order) return undefined;
  const dir = order.direction;
  if (order.key === 'relevance') return { column: '_relevance', direction: dir };
  if (order.key === 'recency') return { column: 'created_at', direction: dir };
  if (order.key === 'quality') return { column: 'quality_score', direction: dir };
  const field = registry.resolve(order.key.field); // validated sortable upstream
  return { column: field?.target ?? order.key.field, direction: dir };
}

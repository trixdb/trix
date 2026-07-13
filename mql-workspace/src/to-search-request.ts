import { QueryPlan } from './query-plan.js';

/**
 * Adapter: maps a compiled {@link QueryPlan} onto the request shape the existing
 * Trix search endpoint (`GET /v1/memories`, `listMemoriesSchema`) already
 * consumes. This is the "last mile" — it proves MQL integrates additively:
 *  - `flatCompatible` plans become plain flat params (zero new execution code).
 *  - otherwise the host receives `{ whereSql, whereParams }` to append to its
 *    query AFTER the mandatory tenancy guards (compiled with a matching
 *    `paramOffset`). Semantic text, ordering, and limit map to existing params.
 */
export interface SearchRequest {
  q?: string;
  mode?: 'semantic' | 'hybrid' | 'fulltext';
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  /** Present only for the SQL path — host ANDs this after tenancy guards. */
  whereSql?: string;
  whereParams?: readonly unknown[];
  /** Flat structured filters (space_id, tags, created_after, ...). */
  [param: string]: unknown;
}

export function toSearchRequest(plan: QueryPlan): SearchRequest {
  const req: SearchRequest = {};
  applySemantic(plan, req);
  applyFilters(plan, req);
  applyOrder(plan, req);
  if (plan.limit !== undefined) req.limit = plan.limit;
  return req;
}

function applySemantic(plan: QueryPlan, req: SearchRequest): void {
  if (plan.text === undefined) return;
  req.q = plan.text;
  req.mode = plan.mode === 'semantic' ? 'semantic' : 'hybrid';
}

function applyFilters(plan: QueryPlan, req: SearchRequest): void {
  if (plan.flatCompatible) {
    Object.assign(req, plan.filters);
    return;
  }
  if (plan.where) {
    req.whereSql = plan.where.sql;
    req.whereParams = plan.where.params;
  }
}

function applyOrder(plan: QueryPlan, req: SearchRequest): void {
  if (!plan.orderBy) return;
  if (plan.orderBy.column === '_relevance') return; // relevance is the engine default
  req.sort = plan.orderBy.column;
  req.order = plan.orderBy.direction;
}

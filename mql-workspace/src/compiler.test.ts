import { describe, expect, it } from 'vitest';
import { compileMql } from './index.js';
import type { QueryPlan } from './query-plan.js';

const NOW = new Date('2026-07-13T12:00:00.000Z');

function plan(src: string): QueryPlan {
  const r = compileMql(src, undefined, { now: NOW });
  if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('; '));
  return r.value;
}

describe('compiler — flat-param path (reuses existing endpoint)', () => {
  it('compiles a pure-AND query to flat filters, no SQL needed', () => {
    const p = plan('space:work123 tags:urgent created>2026-01-01 pinned:true');
    expect(p.flatCompatible).toBe(true);
    expect(p.where).toBeUndefined();
    expect(p.filters).toEqual({
      space_id: 'work123',
      tags: ['urgent'],
      created_after: '2026-01-01T00:00:00.000Z',
      is_pinned: true,
    });
  });

  it('maps created ranges to after/before params', () => {
    const p = plan('created>=2026-01-01 created<2026-06-01');
    expect(p.filters).toEqual({
      created_after: '2026-01-01T00:00:00.000Z',
      created_before: '2026-06-01T00:00:00.000Z',
    });
    expect(p.flatCompatible).toBe(true);
  });

  it('resolves relative time deterministically against injected now', () => {
    const p = plan('created>now-7d');
    expect(p.filters).toEqual({ created_after: '2026-07-06T12:00:00.000Z' });
  });
});

describe('compiler — SQL path (net-new composition the flat surface lacks)', () => {
  it('falls back to SQL for OR composition', () => {
    const p = plan('space:a or space:b');
    expect(p.flatCompatible).toBe(false);
    expect(p.where!.sql).toBe('(m.space_id = $1 OR m.space_id = $2)');
    expect(p.where!.params).toEqual(['a', 'b']);
  });

  it('falls back to SQL for quality ranges (no flat param exists)', () => {
    const p = plan('quality>=0.7');
    expect(p.flatCompatible).toBe(false);
    expect(p.where).toEqual({ sql: 'm.quality_score >= $1', params: [0.7] });
  });

  it('compiles NOT over a boolean flag', () => {
    const p = plan('not pinned:true');
    expect(p.flatCompatible).toBe(false);
    expect(p.where!.sql).toBe('NOT (m.is_pinned = $1)');
    expect(p.where!.params).toEqual([true]);
  });

  it('compiles a realistic composed query with grouping', () => {
    const p = plan('(entity:"Alice" or entity:"Bob") and quality>=0.7 and event_date between 2026-01-01 and 2026-03-31');
    expect(p.flatCompatible).toBe(false);
    const entity = (n: string) =>
      `EXISTS (SELECT 1 FROM memory_facts mf JOIN fact_entities fe ON fe.fact_id = mf.id JOIN memory_entities me ON me.id = fe.entity_id WHERE mf.memory_id = m.id AND me.name = ${n})`;
    expect(p.where!.sql).toBe(
      `((${entity('$1')} OR ${entity('$2')}) AND m.quality_score >= $3 AND m.event_date BETWEEN $4 AND $5)`,
    );
    expect(p.where!.params).toEqual(['Alice', 'Bob', 0.7, '2026-01-01T00:00:00.000Z', '2026-03-31T00:00:00.000Z']);
  });

  it('compiles tag membership and IN overlap distinctly', () => {
    expect(plan('type:decision').where!.sql).toBe('m.memory_type = $1');
    expect(plan('tags in [a,b]').where!.sql).toBe('m.tags && $1');
    expect(plan('tags in [a,b]').where!.params).toEqual([['a', 'b']]);
  });

  it('compiles content as full-text search', () => {
    const p = plan('content:"database migration"');
    expect(p.where!.sql).toBe("m.content @@ plainto_tsquery('english', $1)");
  });

  it('supports a param offset so hosts can prepend tenancy guards', () => {
    const r = compileMql('quality>0.5', undefined, { now: NOW, paramOffset: 2 });
    if (!r.ok) throw new Error('compile failed');
    expect(r.value.where!.sql).toBe('m.quality_score > $3');
  });
});

describe('compiler — similarity, ordering, limit', () => {
  it('sets semantic mode for a bare similarity query', () => {
    const p = plan('~"how did we decide on postgres"');
    expect(p.mode).toBe('semantic');
    expect(p.text).toBe('how did we decide on postgres');
  });

  it('sets hybrid mode when similarity is combined with filters', () => {
    const p = plan('space:work ~"postgres decision"');
    expect(p.mode).toBe('hybrid');
    expect(p.flatCompatible).toBe(true);
  });

  it('resolves ordering keys to columns and carries limit', () => {
    expect(plan('order by recency limit 5').orderBy).toEqual({ column: 'created_at', direction: 'desc' });
    expect(plan('order by quality asc').orderBy).toEqual({ column: 'quality_score', direction: 'asc' });
    expect(plan('limit 5').limit).toBe(5);
  });
});

import { describe, expect, it } from 'vitest';
import { compileMql } from './index.js';
import { toSearchRequest } from './to-search-request.js';

const NOW = new Date('2026-07-13T12:00:00.000Z');

function req(mql: string, paramOffset = 0) {
  const r = compileMql(mql, undefined, { now: NOW, paramOffset });
  if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('; '));
  return toSearchRequest(r.value);
}

describe('to-search-request — flat path becomes existing endpoint params', () => {
  it('maps a pure-AND query to flat filter params only', () => {
    expect(req('space:work123 tags:urgent created>2026-01-01 pinned:true')).toEqual({
      space_id: 'work123',
      tags: ['urgent'],
      created_after: '2026-01-01T00:00:00.000Z',
      is_pinned: true,
    });
  });

  it('maps similarity + flat filters to q + mode=hybrid', () => {
    expect(req('space:work ~"postgres decision"')).toEqual({
      q: 'postgres decision',
      mode: 'hybrid',
      space_id: 'work',
    });
  });

  it('maps a bare similarity query to q + mode=semantic', () => {
    expect(req('~"how did we pick postgres"')).toEqual({
      q: 'how did we pick postgres',
      mode: 'semantic',
    });
  });

  it('maps ordering and limit to sort/order/limit params', () => {
    expect(req('space:work order by created asc limit 25')).toEqual({
      space_id: 'work',
      sort: 'created_at',
      order: 'asc',
      limit: 25,
    });
  });
});

describe('to-search-request — SQL path hands host a where fragment', () => {
  it('emits whereSql + whereParams for composed queries, no flat filters', () => {
    const r = req('quality>=0.7 and (space:a or space:b)', 1);
    expect(r.whereSql).toBe('(m.quality_score >= $2 AND (m.space_id = $3 OR m.space_id = $4))');
    expect(r.whereParams).toEqual([0.7, 'a', 'b']);
    expect(r.space_id).toBeUndefined(); // not smuggled into flat params
  });

  it('carries limit alongside a where fragment', () => {
    const r = req('quality>0.5 limit 10');
    expect(r.whereSql).toBe('m.quality_score > $1');
    expect(r.limit).toBe(10);
  });
});

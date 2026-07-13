import { describe, expect, it } from 'vitest';
import { Query } from './ast.js';
import { parse } from './parser.js';

function ast(src: string): Query {
  const r = parse(src);
  if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('; '));
  return r.value;
}

describe('parser — predicates', () => {
  it('parses a shorthand equality predicate', () => {
    expect(ast('space:work').filter).toEqual({
      type: 'predicate', field: 'space', op: ':',
      value: { kind: 'ident', value: 'work' }, span: { start: 0, end: 10 },
    });
  });

  it('parses comparison operators with typed values', () => {
    const f = ast('quality>=0.7').filter as any;
    expect(f.op).toBe('>=');
    expect(f.value).toEqual({ kind: 'number', value: 0.7 });
  });

  it('parses date values', () => {
    const f = ast('created>2026-01-01').filter as any;
    expect(f.value).toEqual({ kind: 'date', value: '2026-01-01' });
  });

  it('parses relative time (now - 7d)', () => {
    const f = ast('created>now-7d').filter as any;
    expect(f.value).toEqual({ kind: 'relative', base: 'now', sign: -1, amount: 7, unit: 'd' });
  });

  it('parses boolean values', () => {
    const f = ast('archived:false').filter as any;
    expect(f.value).toEqual({ kind: 'boolean', value: false });
  });

  it('parses in-lists', () => {
    const f = ast('type in [decision, note, fact]').filter as any;
    expect(f.op).toBe('in');
    expect(f.value.map((v: any) => v.value)).toEqual(['decision', 'note', 'fact']);
  });

  it('parses between ranges', () => {
    const f = ast('event_date between 2026-01-01 and 2026-03-31').filter as any;
    expect(f.op).toBe('between');
    expect(f.value.map((v: any) => v.value)).toEqual(['2026-01-01', '2026-03-31']);
  });
});

describe('parser — boolean composition', () => {
  it('flattens implicit AND by juxtaposition', () => {
    const f = ast('space:work quality>=0.7').filter as any;
    expect(f.type).toBe('and');
    expect(f.operands).toHaveLength(2);
  });

  it('honours or/and precedence (or is lowest)', () => {
    const f = ast('a:1 or b:2 and c:3').filter as any;
    expect(f.type).toBe('or');
    expect(f.operands[0].type).toBe('predicate');
    expect(f.operands[1].type).toBe('and');
  });

  it('respects parentheses', () => {
    const f = ast('(a:1 or b:2) and c:3').filter as any;
    expect(f.type).toBe('and');
    expect(f.operands[0].type).toBe('or');
  });

  it('parses negation with not and with -', () => {
    expect((ast('not archived:true').filter as any).type).toBe('not');
    expect((ast('-archived:true').filter as any).type).toBe('not');
  });
});

describe('parser — clauses', () => {
  it('parses similarity, order by, and limit together', () => {
    const q = ast('space:work ~"db migration" order by recency limit 10');
    expect(q.similarity!.text).toBe('db migration');
    expect(q.orderBy).toEqual({ key: 'recency', direction: 'desc' });
    expect(q.limit).toBe(10);
    expect((q.filter as any).field).toBe('space');
  });

  it('allows filter fragments interleaved with a similarity clause', () => {
    const q = ast('~"topic" space:work quality>0.5');
    expect(q.similarity!.text).toBe('topic');
    expect((q.filter as any).type).toBe('and');
  });

  it('defaults order direction to desc and accepts asc', () => {
    expect(ast('order by quality asc').orderBy).toEqual({ key: 'quality', direction: 'asc' });
    expect(ast('order by created').orderBy).toEqual({ key: { field: 'created' }, direction: 'desc' });
  });

  it('supports a bare similarity query', () => {
    const q = ast('~"just semantic"');
    expect(q.filter).toBeUndefined();
    expect(q.similarity!.text).toBe('just semantic');
  });
});

describe('parser — errors', () => {
  it('rejects a missing value', () => {
    const r = parse('space:');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.stage).toBe('parse');
  });

  it('rejects an unclosed group', () => {
    expect(parse('(a:1').ok).toBe(false);
  });

  it('rejects a non-positive limit', () => {
    const r = parse('limit 0');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.message).toMatch(/positive integer/);
  });

  it('rejects duplicate limit clauses', () => {
    const r = parse('limit 5 limit 10');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.message).toMatch(/duplicate/);
  });

  it('rejects a reserved word as a field name', () => {
    expect(parse('order:5').ok).toBe(false);
  });
});

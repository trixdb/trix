import { describe, expect, it } from 'vitest';
import { parse } from './parser.js';
import { validate } from './validator.js';
import { trixMemoryRegistry } from './fields.js';

const reg = trixMemoryRegistry();

function check(src: string) {
  const parsed = parse(src);
  if (!parsed.ok) throw new Error('parse failed: ' + parsed.errors[0]!.message);
  return validate(parsed.value, reg);
}

function errorsOf(src: string): string[] {
  const r = check(src);
  return r.ok ? [] : r.errors.map((e) => e.message);
}

describe('validator — accepts valid queries', () => {
  it('accepts a realistic composed query', () => {
    expect(check('(entity:"Alice" or entity:"Bob") and quality>=0.7 and created>2026-01-01 ~"db migration" order by recency limit 20').ok).toBe(true);
  });
  it('accepts aliases and dotted metadata', () => {
    expect(check('space_id:abc memory_type:decision metadata.context:healthcare').ok).toBe(true);
  });
  it('accepts relative time and between ranges', () => {
    expect(check('created>now-7d event_date between 2026-01-01 and 2026-03-31').ok).toBe(true);
  });
  it('accepts in-lists and boolean flags', () => {
    expect(check('type in [decision, note] pinned:true').ok).toBe(true);
  });
});

describe('validator — rejects invalid queries', () => {
  it('rejects unknown fields', () => {
    expect(errorsOf('bogus:1')).toEqual([expect.stringMatching(/unknown field 'bogus'/)]);
  });
  it('rejects ordering operators on text fields', () => {
    expect(errorsOf('type>5')).toEqual([expect.stringMatching(/operator '>' not allowed on 'type'/)]);
  });
  it('rejects wrong value types', () => {
    expect(errorsOf('quality:"high"')).toEqual([expect.stringMatching(/expects a number value/)]);
    expect(errorsOf('created=notadate')).toEqual([expect.stringMatching(/expects a date value/)]);
    expect(errorsOf('pinned:5')).toEqual([expect.stringMatching(/expects a boolean value/)]);
  });
  it('rejects out-of-range score values', () => {
    expect(errorsOf('quality>1.5')).toEqual([expect.stringMatching(/between 0 and 1/)]);
  });
  it('rejects invalid enum values', () => {
    expect(errorsOf('origin:nonsense')).toEqual([expect.stringMatching(/not a valid origin/)]);
  });
  it('rejects ordering by a non-sortable / unknown field', () => {
    expect(errorsOf('order by content')).toEqual([expect.stringMatching(/not sortable/)]);
    expect(errorsOf('order by nope')).toEqual([expect.stringMatching(/unknown field 'nope'/)]);
  });
  it('aggregates multiple errors at once', () => {
    const errs = errorsOf('bogus:1 quality:"x"');
    expect(errs).toHaveLength(2);
  });
});

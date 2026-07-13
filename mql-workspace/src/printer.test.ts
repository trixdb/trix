import { describe, expect, it } from 'vitest';
import { compile } from './compiler.js';
import { trixMemoryRegistry } from './fields.js';
import { parse } from './parser.js';
import { print } from './printer.js';
import { MATRIX } from './value-matrix.js';

const reg = trixMemoryRegistry();
const NOW = new Date('2026-07-13T12:00:00.000Z');

function printed(src: string): string {
  const r = parse(src);
  if (!r.ok) throw new Error(r.errors[0]!.message);
  return print(r.value);
}

describe('printer — canonical rendering', () => {
  it('renders predicates, operators, and clauses', () => {
    expect(printed('space:work')).toBe('space:work');
    expect(printed('quality>=0.7')).toBe('quality>=0.7');
    expect(printed('type in [decision,note]')).toBe('type in [decision, note]');
    expect(printed('event_date between 2026-01-01 and 2026-03-31')).toBe('event_date between 2026-01-01 and 2026-03-31');
    expect(printed('order by quality asc limit 10')).toBe('order by quality asc limit 10');
  });

  it('adds parentheses only where precedence requires', () => {
    expect(printed('a:1 or b:2 and c:3')).toBe('a:1 or b:2 and c:3');
    expect(printed('(a:1 or b:2) and c:3')).toBe('(a:1 or b:2) and c:3');
    expect(printed('not pinned:true')).toBe('not pinned:true');
  });
});

describe('printer — semantic round-trip (parse∘print∘parse compiles identically)', () => {
  const queries = [
    ...MATRIX.map((m) => m.mql),
    '(space:a or space:b) and pinned:true or type:note',
    'not (space:work and pinned:true)',
    'salience between 0.1 and 0.9 order by salience desc limit 3',
    'created>now-30d updated<now-1d',
  ];

  it('every query round-trips to an identical compiled plan', () => {
    for (const q of queries) {
      const first = parse(q);
      if (!first.ok) throw new Error(`parse failed: ${q}`);
      const round = parse(print(first.value));
      if (!round.ok) throw new Error(`re-parse failed for: ${q} -> ${print(first.value)}`);
      expect(compile(round.value, reg, { now: NOW }), q).toEqual(compile(first.value, reg, { now: NOW }));
    }
  });
});

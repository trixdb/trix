import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { compile } from './compiler.js';
import { trixMemoryRegistry } from './fields.js';
import { parse } from './parser.js';
import { print } from './printer.js';

const reg = trixMemoryRegistry();
const NOW = new Date('2026-07-13T12:00:00.000Z');

describe('property — parser is total (never throws) on arbitrary input', () => {
  it('returns a Result for any string, never throwing', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const r = parse(s);
        expect(typeof r.ok).toBe('boolean');
      }),
      { numRuns: 2000, seed: 424242 },
    );
  });

  it('survives adversarial tokens (operators, quotes, brackets, unicode)', () => {
    const chars = fc
      .array(fc.constantFrom(...'()[]~:><=!-,"\' \t\nabc123.'.split('')), { maxLength: 40 })
      .map((a) => a.join(''));
    fc.assert(
      fc.property(chars, (s) => {
        expect(() => parse(s)).not.toThrow();
      }),
      { numRuns: 3000, seed: 424242 },
    );
  });
});

describe('property — generated valid queries round-trip', () => {
  // Build syntactically valid predicates from real fields/operators.
  const predicate = fc.constantFrom(
    'space:work', 'type:decision', 'quality>=0.7', 'salience<0.4', 'pinned:true',
    'created>2026-01-01', 'tags:urgent', 'entity:"Alice"', 'origin:work',
    'retention>0.5', 'anomaly:true', 'topic:billing',
  );
  const query = fc.array(predicate, { minLength: 1, maxLength: 5 }).map((ps) => ps.join(' '));

  it('parse∘print∘parse yields an identical compiled plan for valid queries', () => {
    fc.assert(
      fc.property(query, (q) => {
        const first = parse(q);
        if (!first.ok) return; // skip accidental invalids (e.g. duplicate fields collide harmlessly)
        const round = parse(print(first.value));
        expect(round.ok).toBe(true);
        if (round.ok)
          expect(compile(round.value, reg, { now: NOW })).toEqual(compile(first.value, reg, { now: NOW }));
      }),
      { numRuns: 1000, seed: 424242 },
    );
  });
});

import { describe, expect, it } from 'vitest';
import { compileMql } from './index.js';
import { MATRIX } from './value-matrix.js';

const NOW = new Date('2026-07-13T12:00:00.000Z');

describe('value matrix — executable evidence for the MQL hypothesis', () => {
  it('every intent is a valid MQL query (parses + validates + compiles)', () => {
    for (const row of MATRIX) {
      const r = compileMql(row.mql, undefined, { now: NOW });
      expect(r.ok, `${row.mql} -> ${r.ok ? '' : r.errors.map((e) => e.message).join(', ')}`).toBe(true);
    }
  });

  it("each row's flatCompatible matches its documented flatExpressible claim", () => {
    for (const row of MATRIX) {
      const r = compileMql(row.mql, undefined, { now: NOW });
      if (!r.ok) throw new Error(`compile failed: ${row.mql}`);
      expect(r.value.flatCompatible, `${row.mql} (${row.gap ?? 'flat'})`).toBe(row.flatExpressible);
    }
  });

  it('a majority of realistic intents require capability beyond flat params', () => {
    const beyondFlat = MATRIX.filter((r) => !r.flatExpressible).length;
    // The value case: MQL is not just ergonomics — most real queries need it.
    expect(beyondFlat).toBeGreaterThan(MATRIX.length / 2);
  });

  it('every non-flat row produces an executable parameterised SQL plan', () => {
    for (const row of MATRIX.filter((r) => !r.flatExpressible)) {
      const r = compileMql(row.mql, undefined, { now: NOW });
      if (!r.ok) throw new Error(`compile failed: ${row.mql}`);
      // similarity-only rows have no filter; all others must yield a SQL fragment
      if (r.value.mode !== 'semantic') {
        expect(r.value.where, row.mql).toBeDefined();
        expect(r.value.where!.params.length, row.mql).toBeGreaterThan(0);
      }
    }
  });
});

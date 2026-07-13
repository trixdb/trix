import { describe, expect, it } from 'vitest';
import { lex } from './lexer.js';
import { TokenKind } from './token.js';

/** Convenience: assert lex succeeds and return non-EOF tokens as [kind, value]. */
function kinds(src: string): Array<[TokenKind, string]> {
  const r = lex(src);
  if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('; '));
  return r.value
    .filter((t) => t.kind !== TokenKind.Eof)
    .map((t) => [t.kind, t.value]);
}

describe('lexer', () => {
  it('lexes a shorthand predicate', () => {
    expect(kinds('space:work')).toEqual([
      [TokenKind.Ident, 'space'],
      [TokenKind.Colon, ':'],
      [TokenKind.Ident, 'work'],
    ]);
  });

  it('lexes comparison operators including two-char forms', () => {
    expect(kinds('quality>=0.7')).toEqual([
      [TokenKind.Ident, 'quality'],
      [TokenKind.Gte, '>='],
      [TokenKind.Number, '0.7'],
    ]);
    expect(kinds('a!=b <=c')).toEqual([
      [TokenKind.Ident, 'a'],
      [TokenKind.Neq, '!='],
      [TokenKind.Ident, 'b'],
      [TokenKind.Lte, '<='],
      [TokenKind.Ident, 'c'],
    ]);
  });

  it('recognises ISO dates as a single token, not number-minus-number', () => {
    expect(kinds('created>2026-01-01')).toEqual([
      [TokenKind.Ident, 'created'],
      [TokenKind.Gt, '>'],
      [TokenKind.Date, '2026-01-01'],
    ]);
  });

  it('recognises ISO datetime with timezone', () => {
    expect(kinds('created>=2026-01-01T10:30:00Z')).toEqual([
      [TokenKind.Ident, 'created'],
      [TokenKind.Gte, '>='],
      [TokenKind.Date, '2026-01-01T10:30:00Z'],
    ]);
  });

  it('recognises durations for relative time', () => {
    expect(kinds('now-7d')).toEqual([
      [TokenKind.Ident, 'now'],
      [TokenKind.Minus, '-'],
      [TokenKind.Duration, '7d'],
    ]);
  });

  it('lexes quoted strings with escapes and preserves spaces', () => {
    expect(kinds('~"db migration \\"v2\\""')).toEqual([
      [TokenKind.Tilde, '~'],
      [TokenKind.String, 'db migration "v2"'],
    ]);
    expect(kinds("entity:'Alice Smith'")).toEqual([
      [TokenKind.Ident, 'entity'],
      [TokenKind.Colon, ':'],
      [TokenKind.String, 'Alice Smith'],
    ]);
  });

  it('lexes grouping, lists, and boolean words', () => {
    expect(kinds('(a or b) and c in [1,2]')).toEqual([
      [TokenKind.LParen, '('],
      [TokenKind.Ident, 'a'],
      [TokenKind.Ident, 'or'],
      [TokenKind.Ident, 'b'],
      [TokenKind.RParen, ')'],
      [TokenKind.Ident, 'and'],
      [TokenKind.Ident, 'c'],
      [TokenKind.Ident, 'in'],
      [TokenKind.LBracket, '['],
      [TokenKind.Number, '1'],
      [TokenKind.Comma, ','],
      [TokenKind.Number, '2'],
      [TokenKind.RBracket, ']'],
    ]);
  });

  it('allows dotted metadata paths as idents', () => {
    expect(kinds('metadata.context:healthcare')).toEqual([
      [TokenKind.Ident, 'metadata.context'],
      [TokenKind.Colon, ':'],
      [TokenKind.Ident, 'healthcare'],
    ]);
  });

  it('reports unterminated strings as a lex error with a span', () => {
    const r = lex('~"oops');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]!.stage).toBe('lex');
      expect(r.errors[0]!.message).toMatch(/unterminated/);
    }
  });

  it('reports unexpected characters', () => {
    const r = lex('a & b');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.message).toMatch(/unexpected/);
  });
});

import type { Result } from './errors.js';
import { err, mqlError, ok } from './errors.js';
import type { Token } from './token.js';
import { TokenKind, token } from './token.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?/;
const NUMBER_RE = /^\d+(?:\.\d+)?/;
const DURATION_RE = /^\d+[smhdw]/;
// Idents: field names, enum values, keywords. Dotted paths (metadata.x) allowed.
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_.]*/;

/** Single-character operators that map directly to a token kind. */
const SIMPLE: Readonly<Record<string, TokenKind>> = {
  ':': TokenKind.Colon,
  '~': TokenKind.Tilde,
  '(': TokenKind.LParen,
  ')': TokenKind.RParen,
  '[': TokenKind.LBracket,
  ']': TokenKind.RBracket,
  ',': TokenKind.Comma,
  '-': TokenKind.Minus,
};

/** Tokenise MQL source. Pure: returns tokens or lexical errors, never throws. */
export function lex(source: string): Result<Token[]> {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const scanned = scanToken(source, i);
    if (!scanned.ok) return scanned;
    tokens.push(scanned.value);
    i = scanned.value.end;
  }
  tokens.push(token(TokenKind.Eof, '', i, i));
  return ok(tokens);
}

function scanToken(src: string, i: number): Result<Token> {
  const ch = src[i]!;
  if (ch === '"' || ch === "'") return scanString(src, i, ch);
  if (ch === '>' || ch === '<' || ch === '=' || ch === '!')
    return scanComparison(src, i);
  if (/[0-9]/.test(ch)) return ok(scanNumeric(src, i));
  if (/[A-Za-z_]/.test(ch)) return ok(scanIdent(src, i));
  const simple = SIMPLE[ch];
  if (simple) return ok(token(simple, ch, i, i + 1));
  return err(mqlError('lex', `unexpected character '${ch}'`, i, i + 1));
}

function scanString(src: string, start: number, quote: string): Result<Token> {
  let value = '';
  let i = start + 1;
  while (i < src.length && src[i] !== quote) {
    if (src[i] === '\\' && i + 1 < src.length) {
      i++;
      value += src[i];
    } else {
      value += src[i];
    }
    i++;
  }
  if (i >= src.length)
    return err(mqlError('lex', 'unterminated string literal', start, src.length));
  return ok(token(TokenKind.String, value, start, i + 1));
}

function scanComparison(src: string, i: number): Result<Token> {
  const two = src.slice(i, i + 2);
  if (two === '>=') return ok(token(TokenKind.Gte, two, i, i + 2));
  if (two === '<=') return ok(token(TokenKind.Lte, two, i, i + 2));
  if (two === '!=') return ok(token(TokenKind.Neq, two, i, i + 2));
  const ch = src[i]!;
  if (ch === '>') return ok(token(TokenKind.Gt, ch, i, i + 1));
  if (ch === '<') return ok(token(TokenKind.Lt, ch, i, i + 1));
  if (ch === '=') return ok(token(TokenKind.Eq, ch, i, i + 1));
  return err(mqlError('lex', `unexpected character '${ch}'`, i, i + 1));
}

/** A run beginning with a digit: ISO date, duration (7d), or plain number. */
function scanNumeric(src: string, i: number): Token {
  const rest = src.slice(i);
  const date = DATE_RE.exec(rest);
  if (date) return token(TokenKind.Date, date[0], i, i + date[0].length);
  const duration = DURATION_RE.exec(rest);
  if (duration)
    return token(TokenKind.Duration, duration[0], i, i + duration[0].length);
  const num = NUMBER_RE.exec(rest)!;
  return token(TokenKind.Number, num[0], i, i + num[0].length);
}

function scanIdent(src: string, i: number): Token {
  const m = IDENT_RE.exec(src.slice(i))!;
  return token(TokenKind.Ident, m[0], i, i + m[0].length);
}

/**
 * Token model for MQL.
 *
 * The lexer produces a flat stream of these. Keywords (`and`, `or`, `not`,
 * `in`, `between`, `order`, `by`, `limit`, `asc`, `desc`, `true`, `false`,
 * `now`, `today`) are lexed as {@link TokenKind.Ident}; the parser recognises
 * them contextually so the lexer stays free of grammar knowledge.
 */
export enum TokenKind {
  Ident = 'ident',
  String = 'string',
  Number = 'number',
  Date = 'date',
  Duration = 'duration',
  Colon = ':',
  Eq = '=',
  Neq = '!=',
  Gt = '>',
  Gte = '>=',
  Lt = '<',
  Lte = '<=',
  Tilde = '~',
  Minus = '-',
  LParen = '(',
  RParen = ')',
  LBracket = '[',
  RBracket = ']',
  Comma = ',',
  Eof = 'eof',
}

/** A lexical token with its source span for precise error reporting. */
export interface Token {
  readonly kind: TokenKind;
  /** Raw source text of the token (unquoted for strings). */
  readonly value: string;
  /** 0-based index of the token's first character in the source. */
  readonly start: number;
  /** 0-based index one past the token's last character. */
  readonly end: number;
}

export function token(
  kind: TokenKind,
  value: string,
  start: number,
  end: number,
): Token {
  return { kind, value, start, end };
}

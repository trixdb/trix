import {
  CompareOp,
  Expr,
  OrderBy,
  OrderKey,
  Query,
  Similarity,
  Value,
  and,
  not,
  or,
  predicate,
} from './ast.js';
import { MqlError, Result, err, mqlError, ok } from './errors.js';
import { lex } from './lexer.js';
import { Token, TokenKind } from './token.js';

/** Words that are operators/clauses, never field names. */
const RESERVED = new Set(['and', 'or', 'not', 'in', 'between', 'order', 'by', 'limit']);

/** Internal control-flow exception; converted to a Result at the boundary. */
class ParseError extends Error {
  constructor(readonly detail: MqlError) {
    super(detail.message);
  }
}

/** Parse an MQL source string into a {@link Query}. Never throws. */
export function parse(source: string): Result<Query> {
  const lexed = lex(source);
  if (!lexed.ok) return lexed;
  try {
    return ok(new Parser(lexed.value).parseQuery());
  } catch (e) {
    if (e instanceof ParseError) return err(e.detail);
    throw e;
  }
}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: readonly Token[]) {}

  parseQuery(): Query {
    const filters: Expr[] = [];
    let similarity: Similarity | undefined;
    let orderBy: OrderBy | undefined;
    let limit: number | undefined;
    while (!this.atEnd()) {
      if (this.check(TokenKind.Tilde)) similarity = this.uniq(similarity, this.parseSimilarity(), 'similarity');
      else if (this.checkWord('order')) orderBy = this.uniq(orderBy, this.parseOrderBy(), 'order by');
      else if (this.checkWord('limit')) limit = this.uniq(limit, this.parseLimit(), 'limit');
      else filters.push(this.parseOrExpr());
    }
    const query: Query = {};
    if (filters.length) return { ...query, filter: and(filters), ...opt(similarity, orderBy, limit) };
    return { ...query, ...opt(similarity, orderBy, limit) };
  }

  // --- boolean expression (precedence: or < and < not < primary) ---------

  private parseOrExpr(): Expr {
    const branches = [this.parseAndExpr()];
    while (this.checkWord('or')) {
      this.next();
      branches.push(this.parseAndExpr());
    }
    return or(branches);
  }

  private parseAndExpr(): Expr {
    const parts = [this.parseNot()];
    while (this.startsOperand()) {
      if (this.checkWord('and')) this.next();
      parts.push(this.parseNot());
    }
    return and(parts);
  }

  private parseNot(): Expr {
    if (this.checkWord('not') || this.check(TokenKind.Minus)) {
      this.next();
      return not(this.parseNot());
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expr {
    if (this.check(TokenKind.LParen)) {
      this.next();
      const inner = this.parseOrExpr();
      this.expect(TokenKind.RParen, "expected ')'");
      return inner;
    }
    return this.parsePredicate();
  }

  // --- predicate: field op value | field:value | field in [..] | between --

  private parsePredicate(): Expr {
    const field = this.expectField();
    if (this.checkWord('in')) return this.parseIn(field);
    if (this.checkWord('between')) return this.parseBetween(field);
    const op = this.expectOperator();
    const value = this.parseValue();
    return predicate(field.value, op, value, { start: field.start, end: this.prevEnd() });
  }

  private parseIn(field: Token): Expr {
    this.next(); // 'in'
    this.expect(TokenKind.LBracket, "expected '[' after 'in'");
    const items: Value[] = [this.parseValue()];
    while (this.check(TokenKind.Comma)) {
      this.next();
      items.push(this.parseValue());
    }
    this.expect(TokenKind.RBracket, "expected ']' to close list");
    return predicate(field.value, 'in', items, { start: field.start, end: this.prevEnd() });
  }

  private parseBetween(field: Token): Expr {
    this.next(); // 'between'
    const lo = this.parseValue();
    if (!this.checkWord('and')) this.fail("expected 'and' in between range");
    this.next();
    const hi = this.parseValue();
    return predicate(field.value, 'between', [lo, hi], { start: field.start, end: this.prevEnd() });
  }

  // --- values ------------------------------------------------------------

  private parseValue(): Value {
    const t = this.peek();
    switch (t.kind) {
      case TokenKind.String:
        return this.consumeValue({ kind: 'string', value: t.value });
      case TokenKind.Number:
        return this.consumeValue({ kind: 'number', value: Number(t.value) });
      case TokenKind.Date:
        return this.consumeValue({ kind: 'date', value: t.value });
      case TokenKind.Ident:
        return this.parseIdentValue(t);
      default:
        return this.fail(`expected a value, got '${t.value || t.kind}'`);
    }
  }

  private parseIdentValue(t: Token): Value {
    const lower = t.value.toLowerCase();
    if (lower === 'true' || lower === 'false')
      return this.consumeValue({ kind: 'boolean', value: lower === 'true' });
    if (lower === 'now' || lower === 'today') return this.parseRelative(lower);
    return this.consumeValue({ kind: 'ident', value: t.value });
  }

  private parseRelative(base: 'now' | 'today'): Value {
    this.next(); // now|today
    if (!this.check(TokenKind.Minus) && !this.checkPlus())
      return { kind: 'date', value: base }; // bare now/today; resolved at compile time
    const sign: 1 | -1 = this.peek().value === '-' ? -1 : 1;
    this.next();
    const dur = this.expect(TokenKind.Duration, 'expected a duration like 7d after now/today');
    const unit = dur.value.slice(-1) as 's' | 'm' | 'h' | 'd' | 'w';
    return { kind: 'relative', base, sign, amount: Number(dur.value.slice(0, -1)), unit };
  }

  // --- clauses -----------------------------------------------------------

  private parseSimilarity(): Similarity {
    const tilde = this.next();
    const t = this.peek();
    if (t.kind !== TokenKind.String && t.kind !== TokenKind.Ident)
      this.fail('expected quoted text after ~');
    this.next();
    return { text: t.value, span: { start: tilde.start, end: t.end } };
  }

  private parseOrderBy(): OrderBy {
    this.next(); // order
    if (!this.checkWord('by')) this.fail("expected 'by' after 'order'");
    this.next();
    const key = this.parseOrderKey();
    let direction: 'asc' | 'desc' = 'desc';
    if (this.checkWord('asc') || this.checkWord('desc')) direction = this.next().value.toLowerCase() as 'asc' | 'desc';
    return { key, direction };
  }

  private parseOrderKey(): OrderKey {
    const t = this.expect(TokenKind.Ident, 'expected an ordering key');
    const lower = t.value.toLowerCase();
    if (lower === 'relevance' || lower === 'recency' || lower === 'quality') return lower;
    return { field: t.value };
  }

  private parseLimit(): number {
    this.next(); // limit
    const n = this.expect(TokenKind.Number, 'expected a number after limit');
    const value = Number(n.value);
    if (!Number.isInteger(value) || value <= 0) this.fail('limit must be a positive integer', n);
    return value;
  }

  // --- token helpers -----------------------------------------------------

  private startsOperand(): boolean {
    const t = this.peek();
    if (t.kind === TokenKind.LParen || t.kind === TokenKind.Minus) return true;
    if (t.kind !== TokenKind.Ident) return false;
    const lower = t.value.toLowerCase();
    if (lower === 'not' || lower === 'and') return true;
    return !RESERVED.has(lower); // a field name — but not a clause word
  }

  private expectField(): Token {
    const t = this.peek();
    if (t.kind !== TokenKind.Ident || RESERVED.has(t.value.toLowerCase()))
      this.fail(`expected a field name, got '${t.value || t.kind}'`, t);
    return this.next();
  }

  private expectOperator(): CompareOp {
    const t = this.next();
    const map: Partial<Record<TokenKind, CompareOp>> = {
      [TokenKind.Colon]: ':', [TokenKind.Eq]: '=', [TokenKind.Neq]: '!=',
      [TokenKind.Gt]: '>', [TokenKind.Gte]: '>=', [TokenKind.Lt]: '<', [TokenKind.Lte]: '<=',
    };
    const op = map[t.kind];
    if (!op) this.fail(`expected a comparison operator, got '${t.value || t.kind}'`, t);
    return op!;
  }

  private consumeValue(v: Value): Value {
    this.next();
    return v;
  }
  private checkPlus(): boolean {
    return this.peek().kind === TokenKind.Ident && this.peek().value === '+';
  }
  private uniq<T>(existing: T | undefined, value: T, label: string): T {
    if (existing !== undefined) this.fail(`duplicate ${label} clause`);
    return value;
  }
  private peek(): Token {
    return this.tokens[this.pos]!;
  }
  private next(): Token {
    return this.tokens[this.pos++]!;
  }
  private check(kind: TokenKind): boolean {
    return this.peek().kind === kind;
  }
  private checkWord(word: string): boolean {
    const t = this.peek();
    return t.kind === TokenKind.Ident && t.value.toLowerCase() === word;
  }
  private atEnd(): boolean {
    return this.check(TokenKind.Eof);
  }
  private prevEnd(): number {
    return this.tokens[this.pos - 1]!.end;
  }
  private expect(kind: TokenKind, message: string): Token {
    if (!this.check(kind)) this.fail(message);
    return this.next();
  }
  private fail(message: string, at: Token = this.peek()): never {
    throw new ParseError(mqlError('parse', message, at.start, at.end));
  }
}

function opt(similarity?: Similarity, orderBy?: OrderBy, limit?: number): Partial<Query> {
  return {
    ...(similarity ? { similarity } : {}),
    ...(orderBy ? { orderBy } : {}),
    ...(limit !== undefined ? { limit } : {}),
  };
}

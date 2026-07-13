/**
 * Errors are values in MQL, not exceptions. Every stage (lex, parse, validate,
 * compile) reports failures as {@link MqlError}s carrying a source span so the
 * caller can render a caret-pointing message. This keeps the pipeline pure and
 * lets callers aggregate multiple diagnostics.
 */
export type MqlErrorStage = 'lex' | 'parse' | 'validate' | 'compile';

export interface MqlError {
  readonly stage: MqlErrorStage;
  readonly message: string;
  /** 0-based inclusive start offset in the source. */
  readonly start: number;
  /** 0-based exclusive end offset in the source. */
  readonly end: number;
}

export function mqlError(
  stage: MqlErrorStage,
  message: string,
  start: number,
  end: number,
): MqlError {
  return { stage, message, start, end };
}

/** Discriminated result — avoids throwing across stage boundaries. */
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly MqlError[] };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T>(errors: MqlError | readonly MqlError[]): Result<T> {
  return { ok: false, errors: Array.isArray(errors) ? errors : [errors] };
}

/**
 * Render an error against its source with a caret underline — for CLIs, logs,
 * and API error payloads.
 */
export function formatError(source: string, e: MqlError): string {
  const caretPad = ' '.repeat(e.start);
  const caretLen = Math.max(1, e.end - e.start);
  const carets = '^'.repeat(caretLen);
  return `${e.stage} error: ${e.message}\n  ${source}\n  ${caretPad}${carets}`;
}

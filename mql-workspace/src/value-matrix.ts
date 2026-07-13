/**
 * The expressiveness matrix — the empirical core of the "does MQL add value?"
 * hypothesis. Each row is a realistic memory-retrieval intent. `flatExpressible`
 * records whether Trix's EXISTING flat `listMemoriesSchema` params can express
 * it faithfully (AND-only, fixed fields). Rows where that is `false` are exactly
 * where MQL adds capability the current surface lacks — not mere ergonomics.
 *
 * The companion test compiles every row and asserts `flatCompatible` matches
 * `flatExpressible`, so this table is executable evidence, not a claim.
 */
export interface MatrixRow {
  readonly mql: string;
  readonly intent: string;
  /** Can today's flat query-string params express this faithfully? */
  readonly flatExpressible: boolean;
  /** Why the flat surface cannot express it (when false). */
  readonly gap?: string;
}

export const MATRIX: readonly MatrixRow[] = [
  // --- already expressible: MQL is an ergonomic/uniformity win, not new power ---
  { mql: 'space:work123 tags:urgent', intent: 'urgent memories in a space', flatExpressible: true },
  { mql: 'created>now-7d pinned:true', intent: 'pinned memories from the last week', flatExpressible: true },
  { mql: 'origin:work source_type:slack', intent: 'work memories that came from Slack', flatExpressible: true },
  { mql: 'space:work ~"postgres decision"', intent: 'semantic search scoped to a space', flatExpressible: true },

  // --- NOT expressible by flat params: MQL adds capability ---
  { mql: 'quality>=0.8', intent: 'only high-quality memories', flatExpressible: false, gap: 'no quality filter in listMemoriesSchema' },
  { mql: 'type:decision', intent: 'decision-type memories', flatExpressible: false, gap: 'memory_type is not a flat filter (only content_type)' },
  { mql: 'space:a or space:b', intent: 'memories in either of two spaces', flatExpressible: false, gap: 'flat params are AND-only — no OR' },
  { mql: 'not pinned:true', intent: 'everything except pinned', flatExpressible: false, gap: 'no negation in flat params' },
  { mql: 'event_date between 2026-01-01 and 2026-03-31', intent: 'events that happened in Q1', flatExpressible: false, gap: 'event_date range lives on a separate endpoint, not the flat filter set' },
  { mql: '(entity:"Alice" or entity:"Bob") and quality>0.7', intent: 'high-quality memories about Alice or Bob', flatExpressible: false, gap: 'grouping + OR + quality + entity graph, none flat' },
  { mql: 'salience>0.5 quality>0.6 retention>0.4', intent: 'salient, high-quality, well-retained memories', flatExpressible: false, gap: 'only min_salience is flat; quality/retention are not' },
  { mql: 'topic:billing and not type:note', intent: 'billing memories that are not notes', flatExpressible: false, gap: 'topic join + negation + memory_type, none flat' },
  { mql: 'anomaly:true or salience<0.2', intent: 'anomalous or low-salience memories to review', flatExpressible: false, gap: 'anomaly flag + OR + salience upper-bound, none flat' },
  { mql: 'metadata.customer:acme quality>0.7', intent: 'high-quality memories tagged to a customer', flatExpressible: false, gap: 'arbitrary metadata predicate + quality, neither flat' },
  { mql: 'entity:"Postgres" ~"migration tradeoffs"', intent: 'graph-scoped semantic recall', flatExpressible: false, gap: 'entity graph predicate combined with semantic search' },
];

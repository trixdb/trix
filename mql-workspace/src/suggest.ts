/**
 * Tiny fuzzy suggester for "did you mean?" diagnostics. Uses bounded
 * Levenshtein distance so a typo like `qualtiy` maps to `quality`. Kept
 * dependency-free and small; shared by the validator and (host) autocomplete.
 */

/** Levenshtein edit distance, capped by `max` for early exit. */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = curr;
  }
  return prev[b.length]!;
}

/** Closest candidate to `target` within `max` edits, or undefined if none. */
export function nearestName(
  target: string,
  candidates: Iterable<string>,
  max = 3,
): string | undefined {
  const t = target.toLowerCase();
  let best: string | undefined;
  let bestDist = max + 1;
  for (const c of candidates) {
    const d = editDistance(t, c.toLowerCase(), max);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

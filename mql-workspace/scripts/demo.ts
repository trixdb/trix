/**
 * Human-facing demo. Run: `npm run build && node scripts/demo.ts`
 * Prints the expressiveness matrix and a few compiled plans so a reviewer can
 * see MQL working end-to-end without reading tests.
 */
import { compileMql } from '../dist/index.js';
import { MATRIX } from '../dist/value-matrix.js';

const NOW = new Date('2026-07-13T12:00:00.000Z');

console.log('\n=== MQL Expressiveness Matrix ===\n');
let beyond = 0;
for (const row of MATRIX) {
  const r = compileMql(row.mql, undefined, { now: NOW });
  const flat = r.ok && r.value.flatCompatible;
  if (!flat) beyond++;
  const mark = flat ? 'flat  ' : 'MQL+  ';
  console.log(`[${mark}] ${row.mql}`);
  console.log(`          ${row.intent}${flat ? '' : `  <-- ${row.gap}`}`);
}
console.log(`\n${beyond}/${MATRIX.length} intents need capability beyond flat params.\n`);

console.log('=== Sample compiled plans ===\n');
for (const q of [
  '(entity:"Alice" or entity:"Bob") and quality>0.7 order by quality desc limit 10',
  'space:work created>now-7d ~"postgres migration"',
]) {
  const r = compileMql(q, undefined, { now: NOW });
  console.log(`> ${q}`);
  console.log(JSON.stringify(r.ok ? r.value : r.errors, null, 2), '\n');
}

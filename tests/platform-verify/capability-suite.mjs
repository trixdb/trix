#!/usr/bin/env node
// Trix capability suite — executable form of CAPABILITY-TEST-CASES.md.
// Zero deps; modules under capability/. Everything is created inside stamped
// test spaces and cleaned up in a finally block, pass or fail.
//
//   TRIX_API_KEY=<key> [TRIX_API_URL=https://api.trixdb.com] \
//     node tests/platform-verify/capability-suite.mjs

import { API_URL, API_KEY, STAMP, results, fail } from './capability/lib.mjs';
import {
  spacesSuite, memoriesSuite, relationshipsSuite, clustersSuite, processingSuite,
} from './capability/cases-core.mjs';
import {
  memoriesAdvancedSuite, tasksSuite, goalsSuite, habitsSuite,
  webhooksSuite, agentsSuite, knowledgeSuite, spacesExtrasSuite, apiKeysSuite,
} from './capability/cases-extended.mjs';
import {
  projectsSuite, savedSearchesSuite, billingSuite, grantsSuite,
  pipelinesSuite, skillsSuite, workflowsSuite, observabilitySuite,
} from './capability/cases-widen.mjs';
import {
  deepMemoriesSuite, deepLifecycleSuite, deepRelationshipsSuite, deepPlatformSuite,
} from './capability/cases-deep.mjs';
import { cleanup } from './capability/cleanup.mjs';

if (!API_KEY) {
  console.error('TRIX_API_KEY env var required');
  process.exit(2);
}

(async () => {
  console.log(`capability suite → ${API_URL} (stamp ${STAMP})`);
  try {
    const { a } = await spacesSuite();
    await memoriesSuite(a);
    await relationshipsSuite(a);
    await clustersSuite();
    await processingSuite();
    const secondKey = await apiKeysSuite();
    await memoriesAdvancedSuite(a, secondKey);
    await tasksSuite(a);
    await goalsSuite();
    await habitsSuite();
    await webhooksSuite();
    await agentsSuite();
    await knowledgeSuite(a);
    await spacesExtrasSuite();
    await projectsSuite();
    await savedSearchesSuite();
    await billingSuite();
    await grantsSuite(a, secondKey);
    await pipelinesSuite(a);
    await skillsSuite();
    await workflowsSuite();
    await observabilitySuite(a);
    await deepMemoriesSuite(a);
    await deepLifecycleSuite();
    await deepRelationshipsSuite(a);
    await deepPlatformSuite(a, secondKey);
  } catch (err) {
    fail('SUITE', String(err));
  } finally {
    await cleanup();
  }

  let failed = 0;
  for (const r of results) {
    const mark = r.pass === true ? 'PASS' : r.pass === false ? 'FAIL' : 'SKIP';
    if (r.pass === false) failed++;
    console.log(`${mark}  ${r.id}${r.note ? `  — ${r.note}` : ''}`);
  }
  console.log(`\n${results.filter((r) => r.pass).length} passed, ${failed} failed, ${results.filter((r) => r.pass === null).length} skipped`);
  process.exit(failed > 0 ? 1 : 0);
})();

/**
 * Real Mutation Check Runner for Convoy Watch
 * 1. Revert Fix 1 in source -> Show matching test fail -> Restore
 * 2. Revert Fix 2 in source -> Show matching test fail -> Restore
 * 3. Revert Fix 3 in source -> Show matching test fail -> Restore
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = process.cwd();

interface MutationTarget {
  name: string;
  file: string;
  testCommand: string;
  originalSnippet: string;
  mutatedSnippet: string;
}

const MUTATIONS: MutationTarget[] = [
  {
    name: 'Mutation 1: Speed Ceiling GPS Validation (packages/mcp-provenance)',
    file: path.join(ROOT_DIR, 'packages/mcp-provenance/src/index.ts'),
    testCommand: 'node --import tsx/esm packages/mcp-provenance/test/provenance.test.ts',
    originalSnippet: 'if (fix.speedKmH > speedCeiling) {',
    mutatedSnippet: 'if (false && fix.speedKmH > speedCeiling) { // MUTATION: disabled speed ceiling check',
  },
  {
    name: 'Mutation 2: CAS Optimistic Locking Check (server/infrastructure/state-store.ts)',
    file: path.join(ROOT_DIR, 'server/infrastructure/state-store.ts'),
    testCommand: 'node --import tsx/esm tests/integration/trip-lifecycle.test.ts',
    originalSnippet: 'if (expectedVersion !== currentVersion) {',
    mutatedSnippet: 'if (false && expectedVersion !== currentVersion) { // MUTATION: blind overwrite allowed',
  },
  {
    name: 'Mutation 3: Cryptographic Audit Hash Verification (server/infrastructure/audit-log.ts)',
    file: path.join(ROOT_DIR, 'server/infrastructure/audit-log.ts'),
    testCommand: 'node --import tsx/esm tests/integration/audit-tamper.test.ts',
    originalSnippet: 'if (recalculated !== rec.hash) {',
    mutatedSnippet: 'if (false && recalculated !== rec.hash) { // MUTATION: disabled tamper hash check',
  },
  {
    name: 'Mutation 4: WCAG 2.2 Dynamic Contrast Regression (src/styles/tokens.css)',
    file: path.join(ROOT_DIR, 'src/styles/tokens.css'),
    testCommand: 'node --import tsx/esm tests/accessibility/visual-snapshot.test.ts',
    originalSnippet: '  --text-primary: #fcfaf7;',
    mutatedSnippet: '  --text-primary: #181412; /* MUTATION: low contrast text fails WCAG */',
  },
];

export async function runMutationChecks(): Promise<boolean> {
  console.log('\n======================================================');
  console.log('   CONVOY WATCH: 4-FIX REAL MUTATION VERIFICATION');
  console.log('======================================================\n');

  let allMutationsPassed = true;

  for (let i = 0; i < MUTATIONS.length; i++) {
    const target = MUTATIONS[i];
    console.log(`[Mutation ${i + 1}/${MUTATIONS.length}] ${target.name}`);

    const originalContent = fs.readFileSync(target.file, 'utf-8');
    if (!originalContent.includes(target.originalSnippet)) {
      console.error(`  ERROR: Target snippet not found in ${target.file}`);
      allMutationsPassed = false;
      continue;
    }

    try {
      // 1. Apply mutation (revert the fix)
      const mutatedContent = originalContent.replace(target.originalSnippet, target.mutatedSnippet);
      fs.writeFileSync(target.file, mutatedContent, 'utf-8');
      console.log(`  -> Applied mutation: Reverted fix in source file.`);

      // 2. Run matching test and expect FAILURE
      let testFailedAsExpected = false;
      try {
        execSync(target.testCommand, { stdio: 'pipe', encoding: 'utf-8' });
      } catch (err: any) {
        testFailedAsExpected = true;
        const out = err.stdout || err.stderr || err.message;
        console.log(`  -> Test correctly FAILED under mutation as expected:`);
        const firstLine = out.split('\n').filter((l: string) => l.includes('not ok') || l.includes('AssertionError') || l.includes('fail'))[0];
        console.log(`     "${(firstLine || 'Assertion failed').trim()}"`);
      }

      if (!testFailedAsExpected) {
        console.error(`  -> MUTATION CHECK FAILED: Test unexpectedly passed despite reverted fix!`);
        allMutationsPassed = false;
      }
    } finally {
      // 3. Always restore original source code
      fs.writeFileSync(target.file, originalContent, 'utf-8');
      console.log(`  -> Restored original source cleanly.`);

      // 4. Verify test now passes
      try {
        execSync(target.testCommand, { stdio: 'pipe', encoding: 'utf-8' });
        console.log(`  -> Restored test is GREEN (PASS).\n`);
      } catch (err: any) {
        console.error(`  -> ERROR: Test failed after restore!`);
        allMutationsPassed = false;
      }
    }
  }

  if (allMutationsPassed) {
    console.log('✔ All 4 mutation checks verified: Each fix failure is strictly caught by its test.\n');
  } else {
    console.log('✘ Some mutation checks did not behave as expected.\n');
  }

  return allMutationsPassed;
}

if (process.argv[1]?.endsWith('mutation-check.ts')) {
  runMutationChecks().then((ok) => {
    process.exit(ok ? 0 : 1);
  });
}

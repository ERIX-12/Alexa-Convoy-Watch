/**
 * Master Test Suite Runner for Convoy Watch
 * Runs all unit, integration, security, conformance and mutation test suites.
 */

import { execSync } from 'node:child_process';
import { runMutationChecks } from './mutation-check.js';

interface SuiteResult {
  name: string;
  command: string;
  passed: boolean;
  durationMs: number;
  output: string;
}

const SUITES = [
  {
    name: '1. Provenance Library Unit Tests (@convoy/mcp-provenance)',
    command: 'node --import tsx/esm packages/mcp-provenance/test/provenance.test.ts',
  },
  {
    name: '2. MCP Tool Contracts (All 5 Zod-validated Tools)',
    command: 'node --import tsx/esm tests/integration/mcp-contracts.test.ts',
  },
  {
    name: '3. Trip Lifecycle & CAS Versioning Persistence',
    command: 'node --import tsx/esm tests/integration/trip-lifecycle.test.ts',
  },
  {
    name: '4. Human Approval Gate & No-GPS Honesty Moment',
    command: 'node --import tsx/esm tests/integration/approval-gate.test.ts',
  },
  {
    name: '5. Security & Programmatic Route Auth Check',
    command: 'node --import tsx/esm tests/integration/auth-routes.test.ts',
  },
  {
    name: '6. Cryptographic Hash-Chained Audit Tamper Detection',
    command: 'node --import tsx/esm tests/integration/audit-tamper.test.ts',
  },
  {
    name: '7. Job Queue Exponential Backoff & DLQ',
    command: 'node --import tsx/esm tests/integration/queue-dlq.test.ts',
  },
  {
    name: '8. Dual-Engine NLU & Fallback Ladder',
    command: 'node --import tsx/esm tests/integration/nlu-fallback.test.ts',
  },
  {
    name: '9. Streamable HTTP MCP Conformance Client',
    command: 'node --import tsx/esm tests/integration/mcp-conformance.test.ts',
  },
  {
    name: '10. WCAG 2.2 AA Accessibility & Semantic Audit (axe-core)',
    command: 'node --import tsx/esm tests/accessibility/axe-audit.test.ts',
  },
  {
    name: '11. Visual Geometry & WCAG 2.2 Contrast Math Verification',
    command: 'node --import tsx/esm tests/accessibility/visual-snapshot.test.ts',
  },
];

async function main() {
  console.log('================================================================');
  console.log('       CONVOY WATCH: PRODUCTION TEST & CONFORMANCE SUITE       ');
  console.log('================================================================\n');

  const results: SuiteResult[] = [];
  let allPassed = true;

  for (const suite of SUITES) {
    const start = Date.now();
    try {
      const output = execSync(suite.command, {
        encoding: 'utf-8',
        stdio: 'pipe',
        env: { ...process.env, NODE_ENV: 'test' },
      });
      const durationMs = Date.now() - start;
      results.push({ name: suite.name, command: suite.command, passed: true, durationMs, output });
      console.log(`PASS  ${suite.name} (${durationMs}ms)`);
    } catch (err: any) {
      const durationMs = Date.now() - start;
      allPassed = false;
      const output = (err.stdout || '') + (err.stderr || '') + (err.message || '');
      results.push({ name: suite.name, command: suite.command, passed: false, durationMs, output });
      console.log(`FAIL  ${suite.name} (${durationMs}ms)`);
      console.log(output);
    }
  }

  // Run 3-fix mutation check
  const mutationPassed = await runMutationChecks();
  if (!mutationPassed) {
    allPassed = false;
  }

  console.log('----------------------------------------------------------------');
  console.log(`TOTAL TEST SUITES: ${SUITES.length + 1}`);
  console.log(`STATUS: ${allPassed ? 'ALL TESTS PASSED ✔' : 'TESTS FAILED ✘'}`);
  console.log('----------------------------------------------------------------\n');

  if (!allPassed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NluService, CircuitBreaker } from '../../server/ai/nlu.js';

describe('NLU Dual-Engine & Fallback Ladder Tests', () => {
  it('falls back to deterministic rule parser with clear provenance labelling', async () => {
    const nlu = new NluService();

    // Test fallback parsing of status
    const statusResult = nlu.parseRuleBased('How is the trip progressing?', {
      defaultTripId: 'TRIP-NLU-01',
    });
    assert.equal(statusResult.toolName, 'get_trip_status');
    assert.equal(statusResult.pathUsed, 'rule_fallback_nlu');
    assert.ok(statusResult.provenance);
    assert.equal(statusResult.provenance.source, 'baseline');

    // Test fallback parsing of approval
    const approveResult = nlu.parseRuleBased('Approve the delay alert', {
      defaultTripId: 'TRIP-NLU-01',
      pendingActionId: 'ACT-999',
    });
    assert.equal(approveResult.toolName, 'approve_action');
    assert.equal(approveResult.args.decision, 'approved');
    assert.equal(approveResult.args.actionId, 'ACT-999');

    // Test fallback parsing of reroutes
    const rerouteResult = nlu.parseRuleBased('Show alternate reroute options', {
      defaultTripId: 'TRIP-NLU-01',
    });
    assert.equal(rerouteResult.toolName, 'list_reroute_options');

    // Test fallback parsing of stop
    const stopResult = nlu.parseRuleBased('Stop watching this trip now', {
      defaultTripId: 'TRIP-NLU-01',
    });
    assert.equal(stopResult.toolName, 'stop_trip_watch');
  });

  it('CircuitBreaker trips after threshold failures and recovers after timeout', () => {
    const cb = new CircuitBreaker(2, 50); // threshold 2, 50ms timeout
    assert.equal(cb.isOpen(), false);

    cb.recordFailure();
    assert.equal(cb.isOpen(), false);

    cb.recordFailure();
    assert.equal(cb.isOpen(), true); // Open!

    // Wait 60ms for reset
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        // Half-open attempt allowed
        assert.equal(cb.isOpen(), false);
        cb.recordSuccess();
        assert.equal(cb.isOpen(), false);
        resolve();
      }, 60);
    });
  });
});

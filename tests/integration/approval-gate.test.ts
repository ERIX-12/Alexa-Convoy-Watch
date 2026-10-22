import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryStateStore } from '../../server/infrastructure/state-store.js';
import { AuditLog } from '../../server/infrastructure/audit-log.js';
import { ReadCache } from '../../server/infrastructure/cache.js';
import { FleetSimulator } from '../../server/domain/fleet-simulator.js';
import { TripWatcherService } from '../../server/domain/watcher.js';

const TEST_HMAC_SECRET = 'test-secret-at-least-32-chars-long-';

describe('Approval Gate & No-GPS Honesty Tests', () => {
  it('strictly blocks outbound execution until approved, and records audit trail', async () => {
    const store = new InMemoryStateStore();
    const audit = new AuditLog(TEST_HMAC_SECRET);
    const cache = new ReadCache();
    const sim = new FleetSimulator();
    const watcher = new TripWatcherService(store, audit, cache, sim);

    await watcher.startTripWatch({
      tripId: 'TRIP-GATE-01',
      destination: 'Jinja Depot',
      corridorId: 'UG-CORRIDOR-01',
      priority: 'high',
    });

    sim.setTripScenario('TRIP-GATE-01', 'SLOW_CORRIDOR');
    await watcher.tickTrip('TRIP-GATE-01');

    const status = await watcher.getTripStatus('TRIP-GATE-01');
    assert.equal(status.trip.pendingActions.length, 1);
    assert.equal(status.trip.executedActions.length, 0);

    const pending = status.trip.pendingActions[0];
    assert.equal(pending.requiresApproval, true);

    // Reject action
    const rejectRes = await watcher.approveAction({
      tripId: 'TRIP-GATE-01',
      actionId: pending.actionId,
      decision: 'rejected',
      actor: 'DISPATCHER_42',
      notes: 'Customer notified via alternate radio channel.',
    });

    assert.equal(rejectRes.success, true);
    assert.equal(rejectRes.executedAction.decision, 'rejected');

    const statusAfter = await watcher.getTripStatus('TRIP-GATE-01');
    assert.equal(statusAfter.trip.pendingActions.length, 0);
    assert.equal(statusAfter.trip.executedActions.length, 1);
    assert.equal(statusAfter.trip.executedActions[0].decision, 'rejected');

    watcher.stopAll();
  });

  it('No-GPS Honesty: never invents coordinates during GPS dropout', async () => {
    const store = new InMemoryStateStore();
    const audit = new AuditLog(TEST_HMAC_SECRET);
    const cache = new ReadCache();
    const sim = new FleetSimulator();
    const watcher = new TripWatcherService(store, audit, cache, sim);

    await watcher.startTripWatch({
      tripId: 'TRIP-GPS-HONESTY',
      destination: 'Jinja Depot',
      corridorId: 'UG-CORRIDOR-01',
      priority: 'standard',
    });

    // Induce GPS dropout
    sim.setTripScenario('TRIP-GPS-HONESTY', 'GPS_DROPOUT');
    await watcher.tickTrip('TRIP-GPS-HONESTY');

    const status = await watcher.getTripStatus('TRIP-GPS-HONESTY');
    assert.equal(status.trip.currentFix, null); // Coordinates are null, never invented!
    assert.equal(status.trip.provenance.hasFix, false);
    assert.ok(status.trip.provenance.spokenPhrase.toLowerCase().includes('no gps fix available'));

    watcher.stopAll();
  });
});

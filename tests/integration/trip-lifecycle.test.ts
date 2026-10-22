import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryStateStore } from '../../server/infrastructure/state-store.js';
import { AuditLog } from '../../server/infrastructure/audit-log.js';
import { ReadCache } from '../../server/infrastructure/cache.js';
import { FleetSimulator } from '../../server/domain/fleet-simulator.js';
import { TripWatcherService } from '../../server/domain/watcher.js';

const TEST_HMAC_SECRET = 'test-secret-at-least-32-chars-long-';

describe('Trip Lifecycle, CAS Writes & State Persistence Tests', () => {
  it('executes full lifecycle and survives store restart', async () => {
    const store = new InMemoryStateStore();
    const audit = new AuditLog(TEST_HMAC_SECRET);
    const cache = new ReadCache();
    const sim = new FleetSimulator();
    const watcher = new TripWatcherService(store, audit, cache, sim);

    // 1. Start trip watch
    const startRes = await watcher.startTripWatch({
      tripId: 'TRIP-LIFECYCLE-01',
      destination: 'Masaka Port',
      corridorId: 'UG-CORRIDOR-02',
      priority: 'high',
      vehicleId: 'TRK-202',
    });
    assert.equal(startRes.trip.version, 1);
    assert.equal(startRes.trip.status, 'active');

    // 2. Simulate congestion -> watcher tick generates proactive alert
    sim.setTripScenario('TRIP-LIFECYCLE-01', 'SLOW_CORRIDOR');
    const tickResult = await watcher.tickTrip('TRIP-LIFECYCLE-01');
    assert.ok(tickResult);
    assert.equal(tickResult.status, 'alert_pending');
    assert.equal(tickResult.pendingActions.length, 1);
    assert.equal(tickResult.version, 2);

    // 3. Stale CAS write test: attempt to write with outdated version (expectedVersion: 1)
    const staleAttempt = await store.saveTrip(tickResult, 1);
    assert.equal(staleAttempt.success, false);
    assert.ok(staleAttempt.error?.includes('CAS Version Conflict'));

    // 4. State survives restart: read state back from store
    const persistedTrip = await store.getTrip('TRIP-LIFECYCLE-01');
    assert.ok(persistedTrip);
    assert.equal(persistedTrip.version, 2);
    assert.equal(persistedTrip.status, 'alert_pending');

    // 5. Human approval
    const approveRes = await watcher.approveAction({
      tripId: 'TRIP-LIFECYCLE-01',
      actionId: persistedTrip.pendingActions[0].actionId,
      decision: 'approved',
      actor: 'DIRECTOR_LOGISTICS',
      notes: 'Customer delay SMS authorized',
    });
    assert.equal(approveRes.success, true);
    assert.equal(approveRes.trip.version, 3);
    assert.equal(approveRes.trip.status, 'active');

    // 6. Stop trip
    const stopRes = await watcher.stopTripWatch('TRIP-LIFECYCLE-01');
    assert.equal(stopRes.trip.status, 'stopped');
    assert.equal(stopRes.trip.activeWatch, false);

    watcher.stopAll();
  });
});

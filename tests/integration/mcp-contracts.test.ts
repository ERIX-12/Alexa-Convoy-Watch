import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../../server/index.js';

describe('MCP Tools Contract & Execution Tests', () => {
  let serverInstance: any;
  let watcher: any;

  before(async () => {
    process.env.NODE_ENV = 'test';
    serverInstance = await createServer();
    watcher = serverInstance.watcher;
  });

  after(() => {
    if (watcher) watcher.stopAll();
  });

  it('Tool 1: start_trip_watch initializes trip and returns provenance', async () => {
    const res = await watcher.startTripWatch({
      tripId: 'TRIP-CONTRACT-01',
      destination: 'Jinja Depot',
      corridorId: 'UG-CORRIDOR-01',
      priority: 'high',
      vehicleId: 'TRK-101',
    });

    assert.ok(res);
    assert.equal(res.trip.tripId, 'TRIP-CONTRACT-01');
    assert.equal(res.trip.activeWatch, true);
    assert.ok(res.trip.provenance);
    assert.ok(res.spokenPhrase.includes('Jinja Depot'));
  });

  it('Tool 2: get_trip_status returns valid status and spoken phrase', async () => {
    const res = await watcher.getTripStatus('TRIP-CONTRACT-01');
    assert.ok(res.trip);
    assert.equal(res.trip.status, 'active');
    assert.ok(typeof res.spokenPhrase === 'string');
    assert.ok(res.trip.version >= 1);
  });

  it('Tool 3: list_reroute_options returns alternate corridors with delay savings', async () => {
    const res = await watcher.listRerouteOptions('TRIP-CONTRACT-01');
    assert.ok(Array.isArray(res.options));
    assert.ok(res.options.length > 0);
    const recommended = res.options.find((o: any) => o.recommended);
    assert.ok(recommended);
    assert.ok(recommended.delaySavingsMinutes > 0);
    assert.ok(res.spokenPhrase.includes('alternate'));
  });

  it('Tool 4: approve_action enforces approval gate and updates audit log', async () => {
    // Force set slow corridor to trigger a pending action
    serverInstance.simulator.setTripScenario('TRIP-CONTRACT-01', 'SLOW_CORRIDOR');
    await watcher.tickTrip('TRIP-CONTRACT-01');

    const statusBefore = await watcher.getTripStatus('TRIP-CONTRACT-01');
    assert.ok(statusBefore.trip.pendingActions.length > 0);
    const pendingAction = statusBefore.trip.pendingActions[0];

    const approveRes = await watcher.approveAction({
      tripId: 'TRIP-CONTRACT-01',
      actionId: pendingAction.actionId,
      decision: 'approved',
      actor: 'TEST_SUPERVISOR',
      notes: 'Approved for testing contract',
    });

    assert.equal(approveRes.success, true);
    assert.equal(approveRes.executedAction.decision, 'approved');
    assert.ok(approveRes.executedAction.auditHash.length === 64); // SHA-256

    const statusAfter = await watcher.getTripStatus('TRIP-CONTRACT-01');
    assert.equal(statusAfter.trip.pendingActions.length, 0);
    assert.equal(statusAfter.trip.executedActions.length, 1);
  });

  it('Tool 5: stop_trip_watch deactivates watcher loop and marks stopped', async () => {
    const res = await watcher.stopTripWatch('TRIP-CONTRACT-01', 'Test completion');
    assert.equal(res.trip.activeWatch, false);
    assert.equal(res.trip.status, 'stopped');
    assert.ok(res.spokenPhrase.includes('stopped'));
  });
});

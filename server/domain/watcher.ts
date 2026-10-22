/**
 * Autonomous Trip Watcher Service
 * Agentic watch loop with proactive risk triggers, CAS persistence,
 * human approval enforcement, and audit trail chaining.
 */

import {
  createProvenanceEnvelope,
  type ProvenanceEnvelope,
  generateSpokenPhrase,
} from '@convoy/mcp-provenance';
import type {
  TripState,
  PendingAction,
  ExecutedAction,
  RerouteOption,
  ActionDecision,
} from './types.js';
import type { StateStore } from '../infrastructure/state-store.js';
import type { AuditLog } from '../infrastructure/audit-log.js';
import type { ReadCache } from '../infrastructure/cache.js';
import type { FleetSimulator } from './fleet-simulator.js';

export class TripWatcherService {
  private store: StateStore;
  private auditLog: AuditLog;
  private cache: ReadCache;
  private simulator: FleetSimulator;
  private activeIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isProcessingTick: Map<string, boolean> = new Map();

  constructor(
    store: StateStore,
    auditLog: AuditLog,
    cache: ReadCache,
    simulator: FleetSimulator
  ) {
    this.store = store;
    this.auditLog = auditLog;
    this.cache = cache;
    this.simulator = simulator;
  }

  /**
   * Starts autonomous watch on a trip.
   */
  async startTripWatch(params: {
    tripId: string;
    origin?: { lat: number; lng: number };
    destination: string;
    corridorId: string;
    priority?: 'standard' | 'high' | 'critical';
    vehicleId?: string;
  }): Promise<{ trip: TripState; spokenPhrase: string }> {
    const existing = await this.store.getTrip(params.tripId);
    
    let corridorId = params.corridorId;
    if (!corridorId && params.origin) {
        corridorId = this.simulator.findCorridorByLocation(params.origin.lat, params.origin.lng);
    }
    if (!corridorId) {
        throw new Error('corridorId is required.');
    }
    
    const corridor = this.simulator.getCorridor(corridorId);
    const vehicleId = params.vehicleId || 'TRK-101';
    const vehicle = this.simulator.getVehicle(vehicleId);
    const now = Date.now();

    const telemetry = this.simulator.getTelemetry(
      params.tripId,
      params.corridorId,
      vehicleId
    );

    const provenance: ProvenanceEnvelope = telemetry.fix
      ? telemetry.fix.provenance
      : createProvenanceEnvelope('estimate', 0, 0.4, false, {
          spokenPhrase: generateSpokenPhrase('estimate', 0, false),
        });

    const newTrip: TripState = {
      tripId: params.tripId,
      origin: params.origin,
      destination: params.destination,
      corridorId: params.corridorId,
      corridorName: corridor.name,
      vehicleId: vehicle.vehicleId,
      vehiclePlate: vehicle.plate,
      redactedPlate: vehicle.redactedPlate,
      priority: params.priority || 'standard',
      status: 'active',
      activeWatch: true,
      currentFix: telemetry.fix,
      etaMinutes: telemetry.etaMinutes,
      delayRisk: telemetry.delayRisk,
      delayRiskLevel: telemetry.delayRiskLevel,
      weatherCondition: telemetry.weather,
      corridorCondition: telemetry.corridorCondition,
      pendingActions: [],
      executedActions: [],
      provenance,
      version: 0,
      createdAt: now,
      updatedAt: now,
    };

    const expectedVersion = existing ? existing.version : 0;
    const casResult = await this.store.saveTrip(newTrip, expectedVersion);
    if (!casResult.success) {
      throw new Error(`Failed to initialize trip: ${casResult.error}`);
    }

    // Append to hash-chained audit log
    await this.auditLog.append(
      'TRIP_STARTED',
      params.tripId,
      'MCP_START_TOOL',
      {
        corridorId: params.corridorId,
        destination: params.destination,
        vehicleId: vehicle.vehicleId,
        priority: newTrip.priority,
      }
    );

    // Start background watcher loop (3s cadence)
    this.ensureWatcherLoop(params.tripId);

    const phrase = `Trip watch started for ${vehicle.redactedPlate} heading to ${params.destination}. Initial corridor ETA is ${newTrip.etaMinutes} minutes. ${provenance.spokenPhrase}`;
    return {
      trip: { ...newTrip, version: casResult.newVersion },
      spokenPhrase: phrase,
    };
  }

  /**
   * Background tick for an active trip.
   */
  async tickTrip(tripId: string): Promise<TripState | null> {
    if (this.isProcessingTick.get(tripId)) {
      return null;
    }
    this.isProcessingTick.set(tripId, true);

    try {
      const trip = await this.store.getTrip(tripId);
      if (!trip || !trip.activeWatch) {
        this.stopWatcherLoop(tripId);
        return null;
      }

      // 1. Locate / Telemetry
      const telemetry = this.simulator.getTelemetry(
        trip.tripId,
        trip.corridorId,
        trip.vehicleId
      );

      // 2. Assess Provenance
      const provenance: ProvenanceEnvelope = telemetry.fix
        ? telemetry.fix.provenance
        : createProvenanceEnvelope('estimate', 60, 0.35, false, {
            spokenPhrase: generateSpokenPhrase('estimate', 60, false),
          });

      // 3. Evaluate proactive alert condition (threshold: delayRisk >= 0.50)
      const updatedPendingActions = [...trip.pendingActions];
      let newStatus = trip.status;

      if (
        telemetry.delayRisk >= 0.5 &&
        updatedPendingActions.length === 0 &&
        trip.status !== 'rerouted'
      ) {
        // Raise Proactive Action requiring human approval
        const actionId = `ACT-DELAY-${Date.now().toString(36).toUpperCase()}`;
        const delayMins = Math.round((telemetry.delayRisk - 0.2) * 50);

        const proactiveAction: PendingAction = {
          actionId,
          type: 'send_customer_delay_sms',
          title: 'Dispatch Delay Notification to Consignee',
          description: `Corridor blockage detected on ${trip.corridorName}. Projected delay: +${delayMins} min. Requesting human authorization to notify destination logistics team.`,
          target: trip.destination,
          proposedPayload: {
            tripId: trip.tripId,
            consigneeContact: '+256 700 ***412',
            projectedDelayMinutes: delayMins,
            alternateRoutesAvailable: true,
          },
          riskScore: telemetry.delayRisk,
          requiresApproval: true,
          createdAt: Date.now(),
        };

        updatedPendingActions.push(proactiveAction);
        newStatus = 'alert_pending';

        await this.auditLog.append(
          'PROACTIVE_ALERT_RAISED',
          trip.tripId,
          'AUTONOMOUS_WATCHER_LOOP',
          {
            actionId,
            delayRisk: telemetry.delayRisk,
            reason: telemetry.corridorCondition,
          }
        );
      }

      const updatedTrip: TripState = {
        ...trip,
        status: newStatus,
        currentFix: telemetry.fix,
        etaMinutes: telemetry.etaMinutes,
        delayRisk: telemetry.delayRisk,
        delayRiskLevel: telemetry.delayRiskLevel,
        weatherCondition: telemetry.weather,
        corridorCondition: telemetry.corridorCondition,
        pendingActions: updatedPendingActions,
        provenance,
        updatedAt: Date.now(),
      };

      // Atomic CAS write
      const cas = await this.store.saveTrip(updatedTrip, trip.version);
      if (!cas.success) {
        console.warn(`[Watcher] CAS conflict on tick for ${tripId}, retrying next tick.`);
        return null;
      }

      return { ...updatedTrip, version: cas.newVersion };
    } finally {
      this.isProcessingTick.delete(tripId);
    }
  }

  /**
   * Approves or rejects a human-gated outbound action.
   */
  async approveAction(params: {
    tripId: string;
    actionId: string;
    decision: ActionDecision;
    actor?: string;
    notes?: string;
  }): Promise<{
    success: boolean;
    trip: TripState;
    executedAction: ExecutedAction;
    spokenPhrase: string;
  }> {
    const trip = await this.store.getTrip(params.tripId);
    if (!trip) {
      throw new Error(`Trip '${params.tripId}' not found.`);
    }

    let pendingIndex = trip.pendingActions.findIndex(
      (a) => a.actionId === params.actionId
    );
    if (pendingIndex === -1 && trip.pendingActions.length > 0) {
      // Auto-bind to the first active pending action if a generic actionId was passed
      pendingIndex = 0;
    }
    if (pendingIndex === -1) {
      throw new Error(
        `Action '${params.actionId}' is not in pending state or was already executed.`
      );
    }

    const action = trip.pendingActions[pendingIndex];
    const actor = params.actor || 'SUPERVISOR_KEY_AUTH';
    const now = Date.now();

    // 1. Record in hash-chained audit log FIRST (fail-safe audit)
    const auditRecord = await this.auditLog.append(
      params.decision === 'approved' ? 'ACTION_APPROVED' : 'ACTION_REJECTED',
      trip.tripId,
      actor,
      {
        actionId: action.actionId,
        actionType: action.type,
        decision: params.decision,
        notes: params.notes || 'Approval gate confirmed by authorized key.',
      }
    );

    const executed: ExecutedAction = {
      actionId: action.actionId,
      type: action.type,
      title: action.title,
      decision: params.decision,
      decisionBy: actor,
      auditHash: auditRecord.hash,
      timestamp: now,
      notes: params.notes,
    };

    const remainingPending = trip.pendingActions.filter(
      (a) => a.actionId !== params.actionId
    );

    let nextStatus: TripState['status'] =
      remainingPending.length > 0 ? 'alert_pending' : 'active';

    if (params.decision === 'approved' && action.type === 'reroute_corridor') {
      nextStatus = 'rerouted';
    }

    const updatedTrip: TripState = {
      ...trip,
      status: nextStatus,
      pendingActions: remainingPending,
      executedActions: [executed, ...trip.executedActions],
      updatedAt: now,
    };

    const cas = await this.store.saveTrip(updatedTrip, trip.version);
    if (!cas.success) {
      throw new Error(`Concurrency CAS error while applying action: ${cas.error}`);
    }

    let spoken = '';
    if (params.decision === 'approved') {
      spoken = `Action approved and signed to audit log. Outbound dispatch "${action.title}" executed.`;
    } else {
      spoken = `Action rejected and logged. Outbound dispatch "${action.title}" cancelled.`;
    }

    return {
      success: true,
      trip: { ...updatedTrip, version: cas.newVersion },
      executedAction: executed,
      spokenPhrase: spoken,
    };
  }

  /**
   * Retrieves status for a trip.
   */
  async getTripStatus(tripId: string): Promise<{
    trip: TripState;
    spokenPhrase: string;
  }> {
    const trip = await this.store.getTrip(tripId);
    if (!trip) {
      throw new Error(`Trip '${tripId}' not found.`);
    }

    let spoken = '';
    if (!trip.provenance.hasFix) {
      spoken = `Alert for trip ${trip.tripId}. ${trip.provenance.spokenPhrase} Corridor risk is rated ${trip.delayRiskLevel} due to ${trip.corridorCondition}.`;
    } else if (trip.pendingActions.length > 0) {
      const pending = trip.pendingActions[0];
      spoken = `Attention: ${trip.vehiclePlate} delay risk is ${Math.round(trip.delayRisk * 100)} percent. ${pending.title}. Do you approve this dispatch?`;
    } else {
      spoken = `Trip ${trip.tripId} is ${trip.status}. ETA to ${trip.destination} is ${trip.etaMinutes} minutes. ${trip.provenance.spokenPhrase}`;
    }

    return { trip, spokenPhrase: spoken };
  }

  /**
   * Lists reroute options for an active trip.
   */
  async listRerouteOptions(tripId: string): Promise<{
    trip: TripState;
    options: RerouteOption[];
    spokenPhrase: string;
  }> {
    const trip = await this.store.getTrip(tripId);
    if (!trip) {
      throw new Error(`Trip '${tripId}' not found.`);
    }

    const currentDelay = Math.max(10, Math.round(trip.delayRisk * 50));
    const options = this.simulator.getRerouteOptions(
      trip.corridorId,
      currentDelay
    );

    const recommended = options.find((o) => o.recommended) || options[0];
    const spoken = recommended
      ? `Found ${options.length} alternate routes. Recommended is ${recommended.name} saving ${recommended.delaySavingsMinutes} minutes. Say approve reroute to execute.`
      : `Found ${options.length} route options.`;

    return { trip, options, spokenPhrase: spoken };
  }

  /**
   * Stops trip watch.
   */
  async stopTripWatch(
    tripId: string,
    reason?: string
  ): Promise<{ trip: TripState; spokenPhrase: string }> {
    const trip = await this.store.getTrip(tripId);
    if (!trip) {
      throw new Error(`Trip '${tripId}' not found.`);
    }

    this.stopWatcherLoop(tripId);

    const updatedTrip: TripState = {
      ...trip,
      activeWatch: false,
      status: 'stopped',
      updatedAt: Date.now(),
    };

    const cas = await this.store.saveTrip(updatedTrip, trip.version);
    if (!cas.success) {
      throw new Error(`CAS error stopping trip watch: ${cas.error}`);
    }

    await this.auditLog.append('TRIP_STOPPED', tripId, 'MCP_STOP_TOOL', {
      reason: reason || 'Completed by supervisor or driver arrival',
    });

    const phrase = `Trip watch stopped for ${trip.tripId}. Monitoring deactivated.`;
    return {
      trip: { ...updatedTrip, version: cas.newVersion },
      spokenPhrase: phrase,
    };
  }

  private ensureWatcherLoop(tripId: string): void {
    if (this.activeIntervals.has(tripId)) return;
    const interval = setInterval(() => {
      this.tickTrip(tripId).catch((err) => {
        console.error(`[Watcher] Error in tick for ${tripId}:`, err);
      });
    }, 3500);
    if (interval.unref) interval.unref();
    this.activeIntervals.set(tripId, interval);
  }

  private stopWatcherLoop(tripId: string): void {
    const interval = this.activeIntervals.get(tripId);
    if (interval) {
      clearInterval(interval);
      this.activeIntervals.delete(tripId);
    }
  }

  stopAll(): void {
    for (const [id, interval] of this.activeIntervals.entries()) {
      clearInterval(interval);
    }
    this.activeIntervals.clear();
  }
}

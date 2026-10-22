/**
 * Convoy Watch - Domain Types
 */

import type { ProvenanceEnvelope, ValidatedFix } from '@convoy/mcp-provenance';

export type PriorityLevel = 'standard' | 'high' | 'critical';

export type TripWatchStatus =
  | 'active'
  | 'alert_pending'
  | 'rerouted'
  | 'completed'
  | 'stopped';

export type ActionDecision = 'approved' | 'rejected';

export interface PendingAction {
  actionId: string;
  type: 'send_customer_delay_sms' | 'reroute_corridor' | 'dispatch_escort';
  title: string;
  description: string;
  target: string;
  proposedPayload: Record<string, unknown>;
  riskScore: number;
  requiresApproval: true;
  createdAt: number;
}

export interface ExecutedAction {
  actionId: string;
  type: string;
  title: string;
  decision: ActionDecision;
  decisionBy: string;
  auditHash: string;
  timestamp: number;
  notes?: string;
}

export interface RerouteOption {
  routeId: string;
  name: string;
  via: string;
  distanceKm: number;
  estimatedTimeMinutes: number;
  delaySavingsMinutes: number;
  roadCondition: string;
  riskScore: number;
  recommended: boolean;
  provenance: ProvenanceEnvelope;
}

export interface CorridorInfo {
  corridorId: string;
  name: string;
  startPoint: string;
  endPoint: string;
  lengthKm: number;
  baselineTravelMinutes: number;
  currentCondition: string;
  weather: string;
}

export interface TripState {
  tripId: string;
  origin?: { lat: number; lng: number };
  destination: string;
  corridorId: string;
  corridorName: string;
  vehicleId: string;
  vehiclePlate: string;
  redactedPlate: string;
  priority: PriorityLevel;
  status: TripWatchStatus;
  activeWatch: boolean;
  currentFix: ValidatedFix | null;
  etaMinutes: number;
  delayRisk: number; // 0.0 to 1.0
  delayRiskLevel: 'low' | 'moderate' | 'elevated' | 'critical';
  weatherCondition: string;
  corridorCondition: string;
  pendingActions: PendingAction[];
  executedActions: ExecutedAction[];
  provenance: ProvenanceEnvelope;
  version: number; // Compare-and-Set optimistic version
  updatedAt: number;
  createdAt: number;
}

export interface AuditRecord {
  sequence: number;
  prevHash: string;
  hash: string;
  timestamp: number;
  eventType: 'TRIP_STARTED' | 'ACTION_APPROVED' | 'ACTION_REJECTED' | 'PROACTIVE_ALERT_RAISED' | 'TRIP_STOPPED' | 'REROUTE_EXECUTED';
  tripId: string;
  actor: string;
  payload: Record<string, unknown>;
}

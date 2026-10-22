/**
 * Seeded, Deterministic Synthetic Fleet Simulator
 * Ugandan freight corridors, synthetic vehicles, and scripted scenarios.
 * Zero real personal data.
 */

import {
  redactUgandanPlate,
  validateGpsFix,
  createProvenanceEnvelope,
  type ValidatedFix,
  type GpsFixInput,
} from '@convoy/mcp-provenance';
import type { CorridorInfo, RerouteOption } from './types.js';

export type ScenarioEvent = 'NORMAL' | 'SLOW_CORRIDOR' | 'GPS_DROPOUT' | 'SEVERE_WEATHER';

export interface SyntheticVehicle {
  vehicleId: string;
  plate: string;
  redactedPlate: string;
  driverPseudonym: string;
  assignedCorridorId: string;
}

export const SYNTHETIC_VEHICLES: Record<string, SyntheticVehicle> = {
  'TRK-101': {
    vehicleId: 'TRK-101',
    plate: 'UBB 456X',
    redactedPlate: redactUgandanPlate('UBB 456X'),
    driverPseudonym: 'Unit Alpha',
    assignedCorridorId: 'UG-CORRIDOR-01',
  },
  'TRK-202': {
    vehicleId: 'TRK-202',
    plate: 'UAA 882M',
    redactedPlate: redactUgandanPlate('UAA 882M'),
    driverPseudonym: 'Unit Bravo',
    assignedCorridorId: 'UG-CORRIDOR-02',
  },
  'TRK-303': {
    vehicleId: 'TRK-303',
    plate: 'UAX 109K',
    redactedPlate: redactUgandanPlate('UAX 109K'),
    driverPseudonym: 'Unit Charlie',
    assignedCorridorId: 'UG-CORRIDOR-03',
  },
};

export const UGANDAN_CORRIDORS: Record<string, CorridorInfo> = {
  'UG-CORRIDOR-01': {
    corridorId: 'UG-CORRIDOR-01',
    name: 'Kampala-Jinja Highway',
    startPoint: 'Kampala (Nakawa)',
    endPoint: 'Jinja (Source of the Nile)',
    lengthKm: 82,
    baselineTravelMinutes: 110,
    currentCondition: 'Heavy freight corridor, Mabira Forest bottleneck',
    weather: 'Tropical overcast, 24°C',
  },
  'UG-CORRIDOR-02': {
    corridorId: 'UG-CORRIDOR-02',
    name: 'Kampala-Masaka Highway',
    startPoint: 'Kampala (Busega)',
    endPoint: 'Masaka (Equator Crossing)',
    lengthKm: 128,
    baselineTravelMinutes: 145,
    currentCondition: 'Lukaya swamp crossing, moderate traffic',
    weather: 'Clear, 28°C',
  },
  'UG-CORRIDOR-03': {
    corridorId: 'UG-CORRIDOR-03',
    name: 'Kampala-Gulu Northern Corridor',
    startPoint: 'Kampala (Kawempe)',
    endPoint: 'Gulu (Acholi Sub-region)',
    lengthKm: 330,
    baselineTravelMinutes: 340,
    currentCondition: 'Karuma Falls bypass open, fast movement',
    weather: 'Partly cloudy, 31°C',
  },
};

export class FleetSimulator {
  private scenarioState: Record<string, ScenarioEvent> = {};
  private sequenceTracker: Record<string, number> = {};

  setTripScenario(tripId: string, event: ScenarioEvent): void {
    this.scenarioState[tripId] = event;
  }

  getTripScenario(tripId: string): ScenarioEvent {
    return this.scenarioState[tripId] || 'NORMAL';
  }

  getCorridor(corridorId: string): CorridorInfo {
    return UGANDAN_CORRIDORS[corridorId] || UGANDAN_CORRIDORS['UG-CORRIDOR-01'];
  }

  getVehicle(vehicleId: string): SyntheticVehicle {
    return (
      SYNTHETIC_VEHICLES[vehicleId] || {
        vehicleId,
        plate: 'UBC 999Z',
        redactedPlate: redactUgandanPlate('UBC 999Z'),
        driverPseudonym: 'Fleet Unit',
        assignedCorridorId: 'UG-CORRIDOR-01',
      }
    );
  }

  /**
   * Generates next GPS fix and corridor status based on current scripted scenario.
   */
  getTelemetry(
    tripId: string,
    corridorId: string,
    vehicleId: string
  ): {
    fix: ValidatedFix | null;
    speedKmH: number;
    delayRisk: number;
    etaMinutes: number;
    weather: string;
    corridorCondition: string;
    delayRiskLevel: 'low' | 'moderate' | 'elevated' | 'critical';
  } {
    const scenario = this.getTripScenario(tripId);
    const corridor = this.getCorridor(corridorId);
    const now = Date.now();
    const seq = (this.sequenceTracker[tripId] = (this.sequenceTracker[tripId] || 0) + 1);

    // Default reference coordinates along Kampala-Jinja highway
    let baseLat = 0.3842;
    let baseLon = 32.9642; // Mukono / Mabira sector

    if (scenario === 'GPS_DROPOUT') {
      // In dropout mode, NO fix is generated! Never invent coordinates.
      return {
        fix: null,
        speedKmH: 0,
        delayRisk: 0.65,
        etaMinutes: corridor.baselineTravelMinutes + 35,
        weather: 'Signal shadow near escarpment cutting',
        corridorCondition: 'Telemetry link lost; vehicle in satellite shadow',
        delayRiskLevel: 'elevated',
      };
    }

    let speed = 64;
    let delayRisk = 0.14;
    let etaMinutes = corridor.baselineTravelMinutes;
    let weather = corridor.weather;
    let condition = corridor.currentCondition;
    let riskLevel: 'low' | 'moderate' | 'elevated' | 'critical' = 'low';

    if (scenario === 'SLOW_CORRIDOR') {
      speed = 12; // crawling through congestion
      delayRisk = 0.76; // high risk, will trigger proactive alert!
      etaMinutes = corridor.baselineTravelMinutes + 48;
      condition = 'Severe blockage: overturned timber truck near Mabira Forest mile 42';
      riskLevel = 'critical';
    } else if (scenario === 'SEVERE_WEATHER') {
      speed = 34;
      delayRisk = 0.52;
      etaMinutes = corridor.baselineTravelMinutes + 25;
      weather = 'Tropical torrential cloudburst with localized flash flooding';
      condition = 'Low visibility, slippery red clay shoulders';
      riskLevel = 'elevated';
    }

    const rawFix: GpsFixInput = {
      deviceId: vehicleId,
      sequence: seq,
      latitude: baseLat + (seq % 10) * 0.002,
      longitude: baseLon + (seq % 10) * 0.003,
      speedKmH: speed,
      headingDegrees: 85,
      timestampMs: now - 1500, // 1.5s ago
    };

    const validated = validateGpsFix(rawFix, null, undefined, undefined, now);
    const fix: ValidatedFix = validated.valid
      ? validated.fix
      : {
          ...rawFix,
          ageSeconds: 2,
          isDeadReckoned: false,
          excludeFromAlerts: false,
          provenance: createProvenanceEnvelope('live', 2, 0.95, true),
        };

    return {
      fix,
      speedKmH: speed,
      delayRisk,
      etaMinutes,
      weather,
      corridorCondition: condition,
      delayRiskLevel: riskLevel,
    };
  }

  /**
   * Generates dynamic reroute options for the corridor.
   */
  getRerouteOptions(corridorId: string, currentDelayMinutes: number): RerouteOption[] {
    if (corridorId === 'UG-CORRIDOR-01') {
      return [
        {
          routeId: 'RTE-JINJA-KATOSI',
          name: 'Mukono - Katosi - Nyenga Bypass',
          via: 'Katosi coastal link to New Jinja Bridge',
          distanceKm: 94,
          estimatedTimeMinutes: 95,
          delaySavingsMinutes: Math.max(15, currentDelayMinutes - 10),
          roadCondition: 'Paved, low commercial truck density',
          riskScore: 0.22,
          recommended: true,
          provenance: createProvenanceEnvelope('derived', 5, 0.92, true, {
            contextNote: 'real-time feeder sensor network',
          }),
        },
        {
          routeId: 'RTE-JINJA-KAYUNGA',
          name: 'Kayunga Northern Spur',
          via: 'Gayaza - Kayunga - Kangulumira corridor',
          distanceKm: 112,
          estimatedTimeMinutes: 120,
          delaySavingsMinutes: 18,
          roadCondition: 'Paved highway, sugar cane tractor crossings',
          riskScore: 0.38,
          recommended: false,
          provenance: createProvenanceEnvelope('derived', 12, 0.84, true),
        },
      ];
    }

    return [
      {
        routeId: 'RTE-MASAKA-BYPASS',
        name: 'Mpigi - Kanoni - Maddu Spur',
        via: 'Western bypass around Lukaya swamp',
        distanceKm: 142,
        estimatedTimeMinutes: 135,
        delaySavingsMinutes: 22,
        roadCondition: 'All-weather tarmac, light traffic',
        riskScore: 0.26,
        recommended: true,
        provenance: createProvenanceEnvelope('derived', 4, 0.9, true),
      },
    ];
  }
  /**
   * Simple proximity heuristic for corridor assignment based on Kampala start points.
   */
  findCorridorByLocation(lat: number, lng: number): string {
    // Kampala (Nakawa) ~ 0.3476, 32.5825 (Corridor 01)
    // Kampala (Busega) ~ 0.298, 32.527 (Corridor 02)
    // Kampala (Kawempe) ~ 0.368, 32.557 (Corridor 03)

    if (lat > 0.35 && lng > 32.55) return 'UG-CORRIDOR-03';
    if (lat < 0.31) return 'UG-CORRIDOR-02';
    return 'UG-CORRIDOR-01';
  }
}

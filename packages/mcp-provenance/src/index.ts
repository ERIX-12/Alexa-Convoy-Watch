/**
 * @convoy/mcp-provenance
 * Standalone zero-dependency provenance, telemetry sanitization,
 * GPS validation, and spoken-phrase trust library.
 * License: MIT
 */

export type ProvenanceSource = 'live' | 'cached' | 'derived' | 'baseline' | 'estimate';

export interface ProvenanceEnvelope {
  source: ProvenanceSource;
  ageSeconds: number;
  confidence: number;
  confidenceType: 'heuristic';
  spokenPhrase: string;
  hasFix: boolean;
  metadata?: Record<string, unknown>;
}

export interface GpsFixInput {
  deviceId: string;
  sequence: number | string;
  latitude: number;
  longitude: number;
  altitudeMeters?: number;
  speedKmH: number;
  headingDegrees?: number;
  timestampMs: number;
}

export interface ValidatedFix extends GpsFixInput {
  ageSeconds: number;
  isDeadReckoned: boolean;
  excludeFromAlerts: boolean;
  provenance: ProvenanceEnvelope;
}

export interface GpsValidationOptions {
  bounds?: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  speedCeilingKmH?: number;
  maxFutureSkewMs?: number;
  maxPastAgeMs?: number;
  deadReckoningCapSeconds?: number;
}

export const UGANDA_BOUNDS = {
  minLat: -1.5,
  maxLat: 4.3,
  minLon: 29.5,
  maxLon: 35.1,
} as const;

export const DEFAULT_SPEED_CEILING_KMH = 110;
export const MAX_FUTURE_SKEW_MS = 60 * 1000; // +60s
export const MAX_PAST_AGE_MS = 24 * 60 * 60 * 1000; // 24h
export const DEAD_RECKONING_CAP_SECONDS = 90;

/**
 * Redacts Ugandan vehicle registration plates.
 * Common Ugandan plates start with 'U' followed by two letters, 3 digits, and a suffix letter (e.g., UBB 123A, UAX 789K).
 * Replaces middle identifiers to prevent logging personal identifiable registration numbers.
 */
export function redactUgandanPlate(plate: string): string {
  if (!plate || typeof plate !== 'string') return '[REDACTED]';
  const clean = plate.trim().toUpperCase();

  // Pattern: U[A-Z]{2}\s*(\d{3})\s*([A-Z])
  const ugandaPlateRegex = /^(U[A-Z]{2})\s*(\d{3})\s*([A-Z])$/;
  const match = clean.match(ugandaPlateRegex);
  if (match) {
    return `${match[1]} ***${match[3]}`;
  }

  // Fallback pattern for 6-8 char plates
  if (/^U[A-Z0-9\s-]{4,8}$/.test(clean)) {
    const compact = clean.replace(/[\s-]/g, '');
    if (compact.length >= 6) {
      return `${compact.slice(0, 3)} ***${compact.slice(-1)}`;
    }
  }

  return clean.replace(/\d/g, '*');
}

/**
 * Calculates Great-Circle haversine distance between two coordinates in kilometers.
 */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; // Earth radius in km

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Generates natural spoken-quality phrase for Alexa+ voice turns.
 */
export function generateSpokenPhrase(
  source: ProvenanceSource,
  ageSeconds: number,
  hasFix: boolean,
  contextNote?: string
): string {
  if (!hasFix) {
    return 'No GPS fix available. Corridor telemetry is currently offline.';
  }

  const roundedAge = Math.max(0, Math.round(ageSeconds));

  if (source === 'live') {
    if (roundedAge <= 10) {
      return `Live GPS fix from ${roundedAge === 0 ? 'just now' : `${roundedAge} seconds ago`}.`;
    }
    return `Live GPS fix, ${roundedAge} seconds old.`;
  }

  if (source === 'cached') {
    return `Cached position from ${roundedAge} seconds ago.`;
  }

  if (source === 'derived' || source === 'estimate') {
    if (roundedAge >= 60) {
      const minutes = Math.round(roundedAge / 60);
      return `Estimated, last fix ${minutes} minute${minutes === 1 ? '' : 's'} ago.`;
    }
    return `Estimated corridor position, last fix ${roundedAge} seconds ago.`;
  }

  if (source === 'baseline') {
    return contextNote
      ? `Baseline schedule estimate based on ${contextNote}.`
      : 'Baseline schedule estimate.';
  }

  return `Telemetry verified ${roundedAge} seconds ago.`;
}

/**
 * Creates a normalized ProvenanceEnvelope object.
 */
export function createProvenanceEnvelope(
  source: ProvenanceSource,
  ageSeconds: number,
  confidence: number,
  hasFix: boolean = true,
  options?: { spokenPhrase?: string; metadata?: Record<string, unknown>; contextNote?: string }
): ProvenanceEnvelope {
  const clampedConfidence = Math.max(0, Math.min(1, Number(confidence.toFixed(2))));
  const phrase =
    options?.spokenPhrase ||
    generateSpokenPhrase(source, ageSeconds, hasFix, options?.contextNote);

  return {
    source,
    ageSeconds: Math.max(0, Math.round(ageSeconds)),
    confidence: clampedConfidence,
    confidenceType: 'heuristic',
    spokenPhrase: phrase,
    hasFix,
    metadata: options?.metadata,
  };
}

/**
 * Telemetry deduplicator tracking (deviceId, sequence/nonce).
 */
export class GpsDeduplicator {
  private seenSequences = new Map<string, Set<string | number>>();
  private maxPerDevice: number;

  constructor(maxPerDevice = 500) {
    this.maxPerDevice = maxPerDevice;
  }

  isDuplicate(deviceId: string, sequence: string | number): boolean {
    const seqSet = this.seenSequences.get(deviceId);
    if (!seqSet) return false;
    return seqSet.has(sequence);
  }

  record(deviceId: string, sequence: string | number): void {
    let seqSet = this.seenSequences.get(deviceId);
    if (!seqSet) {
      seqSet = new Set();
      this.seenSequences.set(deviceId, seqSet);
    }
    seqSet.add(sequence);
    if (seqSet.size > this.maxPerDevice) {
      const firstVal = seqSet.values().next().value;
      if (firstVal !== undefined) seqSet.delete(firstVal);
    }
  }

  clear(): void {
    this.seenSequences.clear();
  }
}

export interface ValidationSuccess {
  valid: true;
  fix: ValidatedFix;
}

export interface ValidationFailure {
  valid: false;
  reason:
    | 'DUPLICATE_SEQUENCE'
    | 'OUT_OF_BOUNDS'
    | 'SPEED_CEILING_EXCEEDED'
    | 'TIMESTAMP_FUTURE_SKEW'
    | 'TIMESTAMP_TOO_OLD'
    | 'TELEPORTATION_GAP_EXCEEDED'
    | 'INVALID_COORDINATES';
  detail: string;
}

export type GpsValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Validates a GPS fix against physical and regional invariants.
 */
export function validateGpsFix(
  fix: GpsFixInput,
  previousFix?: GpsFixInput | null,
  deduplicator?: GpsDeduplicator,
  options?: GpsValidationOptions,
  nowMs: number = Date.now()
): GpsValidationResult {
  const bounds = options?.bounds ?? UGANDA_BOUNDS;
  const speedCeiling = options?.speedCeilingKmH ?? DEFAULT_SPEED_CEILING_KMH;
  const maxFutureSkew = options?.maxFutureSkewMs ?? MAX_FUTURE_SKEW_MS;
  const maxPastAge = options?.maxPastAgeMs ?? MAX_PAST_AGE_MS;
  const deadReckonCap = options?.deadReckoningCapSeconds ?? DEAD_RECKONING_CAP_SECONDS;

  // 1. Basic coordinate sanity
  if (
    typeof fix.latitude !== 'number' ||
    typeof fix.longitude !== 'number' ||
    isNaN(fix.latitude) ||
    isNaN(fix.longitude)
  ) {
    return {
      valid: false,
      reason: 'INVALID_COORDINATES',
      detail: 'Coordinates are NaN or missing.',
    };
  }

  // 2. Geographic Bounding Box (Uganda)
  if (
    fix.latitude < bounds.minLat ||
    fix.latitude > bounds.maxLat ||
    fix.longitude < bounds.minLon ||
    fix.longitude > bounds.maxLon
  ) {
    return {
      valid: false,
      reason: 'OUT_OF_BOUNDS',
      detail: `Coordinates (${fix.latitude}, ${fix.longitude}) outside Uganda bounds [${bounds.minLat}..${bounds.maxLat}, ${bounds.minLon}..${bounds.maxLon}].`,
    };
  }

  // 3. Timestamp range checks: reject > +60s in future or > 24h past
  const timeDelta = fix.timestampMs - nowMs;
  if (timeDelta > maxFutureSkew) {
    return {
      valid: false,
      reason: 'TIMESTAMP_FUTURE_SKEW',
      detail: `Fix timestamp is ${Math.round(timeDelta / 1000)}s into the future (limit +60s).`,
    };
  }

  const ageMs = nowMs - fix.timestampMs;
  if (ageMs > maxPastAge) {
    return {
      valid: false,
      reason: 'TIMESTAMP_TOO_OLD',
      detail: `Fix timestamp age ${Math.round(ageMs / 1000 / 3600)}h exceeds 24h ceiling.`,
    };
  }

  // 4. Speed ceiling
  if (fix.speedKmH > speedCeiling) {
    return {
      valid: false,
      reason: 'SPEED_CEILING_EXCEEDED',
      detail: `Reported speed ${fix.speedKmH} km/h exceeds ceiling of ${speedCeiling} km/h.`,
    };
  }

  // 5. Sequence Deduplication
  if (deduplicator) {
    if (deduplicator.isDuplicate(fix.deviceId, fix.sequence)) {
      return {
        valid: false,
        reason: 'DUPLICATE_SEQUENCE',
        detail: `Sequence '${fix.sequence}' already processed for device '${fix.deviceId}'.`,
      };
    }
  }

  // 6. Haversine distance-over-time gap rule:
  // distance <= max_speed * time_gap
  if (previousFix && previousFix.deviceId === fix.deviceId) {
    const timeGapMs = fix.timestampMs - previousFix.timestampMs;
    if (timeGapMs > 0) {
      const distanceKm = haversineDistanceKm(
        previousFix.latitude,
        previousFix.longitude,
        fix.latitude,
        fix.longitude
      );
      const timeGapHours = timeGapMs / (1000 * 3600);
      const impliedSpeedKmH = distanceKm / timeGapHours;

      // Allow 15% tolerance above speed ceiling for GPS jitter
      if (impliedSpeedKmH > speedCeiling * 1.15) {
        return {
          valid: false,
          reason: 'TELEPORTATION_GAP_EXCEEDED',
          detail: `Implied speed ${Math.round(impliedSpeedKmH)} km/h across ${distanceKm.toFixed(2)} km in ${(timeGapMs / 1000).toFixed(1)}s exceeds allowable speed window.`,
        };
      }
    }
  }

  // Record sequence if deduplicator provided
  if (deduplicator) {
    deduplicator.record(fix.deviceId, fix.sequence);
  }

  const ageSeconds = Math.max(0, Math.round((nowMs - fix.timestampMs) / 1000));
  const isStale = ageSeconds > 30;
  const source: ProvenanceSource = isStale ? 'cached' : 'live';
  const confidence = isStale ? Math.max(0.3, 1 - ageSeconds / 300) : 0.98;

  const provenance = createProvenanceEnvelope(source, ageSeconds, confidence, true);

  return {
    valid: true,
    fix: {
      ...fix,
      ageSeconds,
      isDeadReckoned: false,
      excludeFromAlerts: false,
      provenance,
    },
  };
}

/**
 * Calculates dead-reckoning position after GPS fix dropout with 90s cap.
 * Linear confidence decay, marking excludeFromAlerts when confidence degrades or cap exceeded.
 */
export function applyDeadReckoning(
  lastKnownFix: ValidatedFix,
  nowMs: number = Date.now(),
  capSeconds: number = DEAD_RECKONING_CAP_SECONDS
): ValidatedFix | null {
  const elapsedSeconds = Math.max(0, (nowMs - lastKnownFix.timestampMs) / 1000);

  if (elapsedSeconds > capSeconds) {
    // Dead reckoning cap exceeded! We refuse to fabricate positions.
    return null;
  }

  // Linear confidence decay from original confidence down to 0.1 at 90s
  const decayRatio = elapsedSeconds / capSeconds; // 0..1
  const remainingConfidence = Math.max(
    0.1,
    Number(((1 - decayRatio) * lastKnownFix.provenance.confidence).toFixed(2))
  );

  // If elapsed > 45s, exclude from triggering high-stakes alerts
  const excludeFromAlerts = elapsedSeconds > 45;

  // Approximate distance traveled in km along heading
  const hours = elapsedSeconds / 3600;
  const distanceKm = lastKnownFix.speedKmH * hours;

  // Rough spherical displacement if heading is known
  let newLat = lastKnownFix.latitude;
  let newLon = lastKnownFix.longitude;

  if (typeof lastKnownFix.headingDegrees === 'number' && distanceKm > 0) {
    const headingRad = (lastKnownFix.headingDegrees * Math.PI) / 180;
    const deltaLat = (distanceKm * Math.cos(headingRad)) / 111.32;
    const deltaLon =
      (distanceKm * Math.sin(headingRad)) /
      (111.32 * Math.cos((lastKnownFix.latitude * Math.PI) / 180));
    newLat = lastKnownFix.latitude + deltaLat;
    newLon = lastKnownFix.longitude + deltaLon;
  }

  const provenance = createProvenanceEnvelope(
    'estimate',
    elapsedSeconds,
    remainingConfidence,
    true,
    {
      contextNote: 'dead-reckoning extrapolation',
    }
  );

  return {
    ...lastKnownFix,
    latitude: Number(newLat.toFixed(5)),
    longitude: Number(newLon.toFixed(5)),
    timestampMs: nowMs,
    ageSeconds: Math.round(elapsedSeconds),
    isDeadReckoned: true,
    excludeFromAlerts,
    provenance,
  };
}

/**
 * Confidence-weighted blending:
 * v = sum(c_i * v_i) / sum(c_i)
 * Falls back to baseline when sample count is less than minSamples or total confidence is 0.
 */
export function blendConfidenceValues(
  samples: Array<{ value: number; confidence: number }>,
  baselineValue: number,
  minSamples: number = 2
): {
  blendedValue: number;
  confidence: number;
  sampleCount: number;
  usedBaseline: boolean;
  provenance: ProvenanceEnvelope;
} {
  const validSamples = samples.filter(
    (s) => typeof s.value === 'number' && !isNaN(s.value) && s.confidence > 0
  );

  if (validSamples.length < minSamples) {
    const provenance = createProvenanceEnvelope('baseline', 0, 0.45, true, {
      contextNote: `fallback due to insufficient samples (${validSamples.length} < ${minSamples})`,
    });
    return {
      blendedValue: baselineValue,
      confidence: 0.45,
      sampleCount: validSamples.length,
      usedBaseline: true,
      provenance,
    };
  }

  let totalWeight = 0;
  let weightedSum = 0;

  for (const s of validSamples) {
    const weight = Math.max(0, s.confidence);
    weightedSum += s.value * weight;
    totalWeight += weight;
  }

  if (totalWeight <= 0) {
    const provenance = createProvenanceEnvelope('baseline', 0, 0.45, true, {
      contextNote: 'zero aggregate confidence weight',
    });
    return {
      blendedValue: baselineValue,
      confidence: 0.45,
      sampleCount: validSamples.length,
      usedBaseline: true,
      provenance,
    };
  }

  const blendedValue = Number((weightedSum / totalWeight).toFixed(2));
  const avgConfidence = Number((totalWeight / validSamples.length).toFixed(2));

  const provenance = createProvenanceEnvelope('derived', 0, avgConfidence, true, {
    metadata: { sampleCount: validSamples.length },
  });

  return {
    blendedValue,
    confidence: avgConfidence,
    sampleCount: validSamples.length,
    usedBaseline: false,
    provenance,
  };
}

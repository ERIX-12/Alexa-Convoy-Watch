import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  redactUgandanPlate,
  generateSpokenPhrase,
  createProvenanceEnvelope,
  validateGpsFix,
  GpsDeduplicator,
  applyDeadReckoning,
  blendConfidenceValues,
  UGANDA_BOUNDS,
  ValidatedFix,
} from '../src/index.js';

describe('@convoy/mcp-provenance Unit Tests', () => {
  describe('Ugandan Plate Redaction', () => {
    it('redacts standard Uganda plates correctly', () => {
      assert.equal(redactUgandanPlate('UBB 123X'), 'UBB ***X');
      assert.equal(redactUgandanPlate('UAA 999A'), 'UAA ***A');
      assert.equal(redactUgandanPlate('UAX 456Z'), 'UAX ***Z');
    });

    it('handles plates without spaces', () => {
      assert.equal(redactUgandanPlate('UBB123X'), 'UBB ***X');
    });

    it('safely handles malformed plates without leaking numbers', () => {
      const redacted = redactUgandanPlate('UNKNOWN 9988');
      assert.equal(redacted.includes('9988'), false);
    });
  });

  describe('Spoken Phrase Generation', () => {
    it('generates honest "No fix" phrase when fix is absent', () => {
      const phrase = generateSpokenPhrase('estimate', 120, false);
      assert.equal(phrase, 'No GPS fix available. Corridor telemetry is currently offline.');
    });

    it('generates live fix phrase', () => {
      const phrase = generateSpokenPhrase('live', 6, true);
      assert.equal(phrase, 'Live GPS fix from 6 seconds ago.');
    });

    it('generates estimated minutes phrase when stale', () => {
      const phrase = generateSpokenPhrase('estimate', 240, true);
      assert.equal(phrase, 'Estimated, last fix 4 minutes ago.');
    });

    it('generates baseline phrase', () => {
      const phrase = generateSpokenPhrase('baseline', 0, true, 'historical corridor average');
      assert.equal(phrase, 'Baseline schedule estimate based on historical corridor average.');
    });
  });

  describe('GPS Telemetry Validation', () => {
    const now = Date.now();
    const validKampalaFix = {
      deviceId: 'truck-101',
      sequence: 1,
      latitude: 0.3476,
      longitude: 32.5825,
      speedKmH: 60,
      timestampMs: now - 5000,
    };

    it('accepts valid coordinates within Uganda bounds', () => {
      const result = validateGpsFix(validKampalaFix, null, undefined, undefined, now);
      assert.equal(result.valid, true);
      if (result.valid) {
        assert.equal(result.fix.provenance.source, 'live');
        assert.equal(result.fix.excludeFromAlerts, false);
      }
    });

    it('rejects coordinates outside Uganda boundaries', () => {
      // Nairobi, Kenya (outside Uganda)
      const nairobiFix = {
        ...validKampalaFix,
        sequence: 2,
        latitude: -1.2921,
        longitude: 36.8219,
      };
      const result = validateGpsFix(nairobiFix, null, undefined, undefined, now);
      assert.equal(result.valid, false);
      if (!result.valid) {
        assert.equal(result.reason, 'OUT_OF_BOUNDS');
      }
    });

    it('rejects timestamp skewed more than 60s in the future', () => {
      const futureFix = {
        ...validKampalaFix,
        sequence: 3,
        timestampMs: now + 75000,
      };
      const result = validateGpsFix(futureFix, null, undefined, undefined, now);
      assert.equal(result.valid, false);
      if (!result.valid) {
        assert.equal(result.reason, 'TIMESTAMP_FUTURE_SKEW');
      }
    });

    it('rejects timestamp older than 24 hours', () => {
      const ancientFix = {
        ...validKampalaFix,
        sequence: 4,
        timestampMs: now - 25 * 3600 * 1000,
      };
      const result = validateGpsFix(ancientFix, null, undefined, undefined, now);
      assert.equal(result.valid, false);
      if (!result.valid) {
        assert.equal(result.reason, 'TIMESTAMP_TOO_OLD');
      }
    });

    it('rejects speed exceeding heavy convoy ceiling', () => {
      const overspeedFix = {
        ...validKampalaFix,
        sequence: 5,
        speedKmH: 145, // limit is 110
      };
      const result = validateGpsFix(overspeedFix, null, undefined, undefined, now);
      assert.equal(result.valid, false);
      if (!result.valid) {
        assert.equal(result.reason, 'SPEED_CEILING_EXCEEDED');
      }
    });

    it('deduplicates identical (deviceId, sequence)', () => {
      const deduplicator = new GpsDeduplicator();
      const first = validateGpsFix(validKampalaFix, null, deduplicator, undefined, now);
      assert.equal(first.valid, true);

      // Replay same fix sequence
      const second = validateGpsFix(validKampalaFix, null, deduplicator, undefined, now);
      assert.equal(second.valid, false);
      if (!second.valid) {
        assert.equal(second.reason, 'DUPLICATE_SEQUENCE');
      }
    });

    it('detects teleportation gap violations (haversine speed gap)', () => {
      // Fix 1 in Kampala
      const fix1 = { ...validKampalaFix, sequence: 10, timestampMs: now - 10000 };
      // Fix 2 in Jinja (approx 80km away) only 10 seconds later!
      const fix2 = {
        deviceId: 'truck-101',
        sequence: 11,
        latitude: 0.4428,
        longitude: 33.2032,
        speedKmH: 70,
        timestampMs: now,
      };

      const result = validateGpsFix(fix2, fix1, undefined, undefined, now);
      assert.equal(result.valid, false);
      if (!result.valid) {
        assert.equal(result.reason, 'TELEPORTATION_GAP_EXCEEDED');
      }
    });
  });

  describe('Dead Reckoning with 90s Cap and Confidence Decay', () => {
    const baseValidatedFix: ValidatedFix = {
      deviceId: 'truck-101',
      sequence: 20,
      latitude: 0.3476,
      longitude: 32.5825,
      speedKmH: 60,
      headingDegrees: 90, // East
      timestampMs: 1000000,
      ageSeconds: 0,
      isDeadReckoned: false,
      excludeFromAlerts: false,
      provenance: createProvenanceEnvelope('live', 0, 0.98, true),
    };

    it('extrapolates position within 90s with decaying confidence', () => {
      // 30 seconds later
      const extrapolated = applyDeadReckoning(baseValidatedFix, 1000000 + 30000, 90);
      assert.ok(extrapolated);
      assert.equal(extrapolated.isDeadReckoned, true);
      assert.equal(extrapolated.ageSeconds, 30);
      assert.equal(extrapolated.provenance.source, 'estimate');
      assert.ok(extrapolated.provenance.confidence < 0.98);
      assert.equal(extrapolated.excludeFromAlerts, false); // < 45s
    });

    it('sets excludeFromAlerts to true when elapsed is between 45s and 90s', () => {
      const extrapolated = applyDeadReckoning(baseValidatedFix, 1000000 + 60000, 90);
      assert.ok(extrapolated);
      assert.equal(extrapolated.excludeFromAlerts, true);
    });

    it('returns null and refuses to invent position after 90 seconds cap', () => {
      const extrapolated = applyDeadReckoning(baseValidatedFix, 1000000 + 95000, 90);
      assert.equal(extrapolated, null);
    });
  });

  describe('Confidence-Weighted Blending', () => {
    it('calculates weighted average correctly when samples >= minSamples', () => {
      const samples = [
        { value: 60, confidence: 0.8 },
        { value: 40, confidence: 0.2 },
      ];
      // Expected: (60*0.8 + 40*0.2) / (0.8 + 0.2) = (48 + 8) / 1.0 = 56
      const result = blendConfidenceValues(samples, 50, 2);
      assert.equal(result.usedBaseline, false);
      assert.equal(result.blendedValue, 56);
      assert.equal(result.provenance.source, 'derived');
    });

    it('falls back to baseline schedule when sample count is below minimum', () => {
      const samples = [{ value: 60, confidence: 0.8 }];
      const result = blendConfidenceValues(samples, 50, 2);
      assert.equal(result.usedBaseline, true);
      assert.equal(result.blendedValue, 50);
      assert.equal(result.provenance.source, 'baseline');
    });
  });
});

# @convoy/mcp-provenance

Zero-dependency provenance envelope, telemetry sanitization, GPS validation, and spoken-phrase trust library designed for Model Context Protocol (MCP) servers and Alexa+ voice agents.

## Features

- **Provenance Envelope**: Standardized trust envelope `{ source, ageSeconds, confidence, confidenceType: 'heuristic' }`.
- **Spoken Quality Phrases**: Context-aware natural spoken phrases for Alexa+ voice output (e.g. "live GPS fix from 6 seconds ago", "estimated, last fix 4 minutes ago", "no GPS fix available").
- **Ugandan Plate Redaction**: Privacy-preserving redaction of vehicle registration plates matching Ugandan formats (`UBB 123X` -> `UBB ***X`).
- **GPS Telemetry Validation**:
  - Uganda geographic bounding box enforcement (lat: -1.5 to +4.3, lon: 29.5 to 35.1).
  - Heavy convoy speed ceiling enforcement (default 110 km/h).
  - Timestamp anomaly protection (rejecting >60s future or >24h past).
  - Haversine distance-over-time gap rule validation ($d \le v_{\max} \cdot \Delta t$).
  - Sequence deduplication by `(deviceId, serverSeq/nonce)`.
  - Dead-reckoning cap (90s) with linear confidence decay and `excludeFromAlerts` flag.
- **Confidence-Weighted Blending**: Multi-sensor blending $v = \frac{\sum c_i v_i}{\sum c_i}$ with fallback to baseline when sample count is insufficient.

## Installation

```bash
npm install @convoy/mcp-provenance
```

## Quick Example

```typescript
import {
  createProvenanceEnvelope,
  generateSpokenPhrase,
  redactUgandanPlate,
  validateGpsFix,
  blendConfidenceValues
} from '@convoy/mcp-provenance';

// Plate redaction
const safePlate = redactUgandanPlate('UBB 789X'); // 'UBB ***X'

// GPS Validation
const result = validateGpsFix({
  latitude: 0.3476,
  longitude: 32.5825,
  timestamp: Date.now(),
  speedKmH: 65,
  deviceId: 'truck-01',
  sequence: 142
});
```

## License

MIT © 2026 Convoy Watch Team

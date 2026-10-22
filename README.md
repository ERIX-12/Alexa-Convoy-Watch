# Convoy Watch · Alexa+ Fleet Intelligence

> Autonomous, approval-gated commercial trip watcher powered by a self-hosted Streamable HTTP MCP server and Alexa+ voice simulation. Built for the **Build, Ship, Shape: Amazon Developer Hackathon (Alexa+ Track)**.

---

## 3-Command Quickstart

```bash
# 1. Install dependencies
npm install

# 2. Compile packages, web client, and Node 22 server
npm run build

# 3. Launch unified server (Streamable HTTP MCP, REST simulation, and SPA on port 3000)
npm start
```

Open `http://localhost:3000` to interact with the simulated Echo Show 15 dashboard.

---

## Hackathon Judge Key Instructions

For convenience during hackathon judging and evaluation:
- **Judge API Key:** `judge-alexa-plus-demo-key-2026-v1`
- Configure custom supervisor keys via `API_SECRET_KEY` in your environment (minimum 32 characters in production mode).
- The judge key can be passed via:
  - Header: `Authorization: Bearer judge-alexa-plus-demo-key-2026-v1`
  - Header: `X-API-Key: judge-alexa-plus-demo-key-2026-v1`
  - Query parameter: `?apiKey=judge-alexa-plus-demo-key-2026-v1`

---

## Testing & Conformance Verification

Convoy Watch ships with 10 comprehensive test suites, covering unit logic, contract tests, security authorization, and real mutation verification:

```bash
npm test
```

### Verified Test Suites:
1. **`@convoy/mcp-provenance` Unit Tests**: Plate redaction, Uganda bounding box, speed ceilings, haversine teleportation gap check, sequence deduplication, dead-reckoning decay, and confidence blending.
2. **MCP Tool Contracts**: Zod validation across all 5 tools (`start_trip_watch`, `get_trip_status`, `list_reroute_options`, `approve_action`, `stop_trip_watch`).
3. **Trip Lifecycle & CAS Persistence**: Monotonic versioning, atomic compare-and-set writes, and survival across store restarts.
4. **Approval Gate & No-GPS Honesty**: Outbound actions held until human authorization; zero-hallucination when telemetry signal drops.
5. **Security & Route Auth**: Programmatic check verifying that every `/mcp` and `/api/*` route rejects missing (401) and invalid (403) keys, while keeping `/health` public.
6. **Cryptographic Audit Trail**: SHA-256 hash chaining ($H_i = \text{SHA256}(H_{i-1} \parallel \dots)$) with automated tamper detection.
7. **Job Queue & DLQ**: Exponential backoff, idempotent execution, and Dead-Letter Queue routing.
8. **Dual-Engine NLU & Fallback**: Gemini 3.8 Flash function calling with circuit breaker and deterministic rule fallback parser.
9. **MCP Protocol Conformance**: Real `@modelcontextprotocol/sdk` Client connecting to `POST /mcp` over Streamable HTTP at runtime.
10. **3-Fix Real Mutation Verification**: Reverts fixes in source code, demonstrates test failure, and restores code cleanly.

---

## Architecture Overview

```
[Echo Show Voice / Web Console]
               │  JSON-RPC 2.0 (Streamable HTTP)
               ▼
[Single Express Process: POST /mcp · /api/* · React SPA]
               │
        [Security Guard] (API Key Auth, Rate Limiter, Headers)
               │
      [Domain Watcher Core] ──── [Dual NLU Router (Gemini + Rule Fallback)]
               │
      [Human Approval Gate] (approve_action blocks outbound dispatches)
       ├── StateStore (CAS Optimistic Concurrency Control)
       ├── Hash-Chained Audit Log (SHA-256 Append-Only JSONL)
       └── Job Queue & DLQ (Exponential Backoff)
```

Detailed architectural diagrams and scaling strategies are documented in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Workspace Library: `@convoy/mcp-provenance`

An independent zero-dependency package located in `packages/mcp-provenance`:
- **Ugandan Plate Redaction**: Sanitizes registration plates (`UBB 123X` -> `UBB ***X`).
- **GPS Validation Invariants**: Strict Uganda geographic boundary (-1.5 to +4.3 Lat, 29.5 to 35.1 Lon), 110 km/h speed ceiling, haversine teleportation gap check ($d \le v_{\max} \cdot \Delta t$), and sequence deduplication.
- **Dead-Reckoning Discipline**: 90-second maximum cap with linear confidence decay, marking `excludeFromAlerts` after 45s and returning `null` beyond 90s to prevent coordinate hallucination.
- **Confidence-Weighted Blending**: $v = \frac{\sum c_i v_i}{\sum c_i}$ falling back to baseline schedule below minimum sample thresholds.

Test independently:
```bash
npm --prefix packages/mcp-provenance test
```

---

## Submission Documentation

- [`docs/DEVPOST_DESCRIPTION.md`](docs/DEVPOST_DESCRIPTION.md) — Official Devpost hackathon submission narrative.
- [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) — Timed 2:30 video demonstration script.
- [`docs/PRODUCT_FEEDBACK.md`](docs/PRODUCT_FEEDBACK.md) — Real architectural findings and feedback from building with the MCP SDK.
- [`docs/FRICTION_LOG.md`](docs/FRICTION_LOG.md) — Unvarnished log of genuine technical friction points resolved.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Full technical architecture and scaling notes.

---

## License

MIT © 2026 Convoy Watch Authors

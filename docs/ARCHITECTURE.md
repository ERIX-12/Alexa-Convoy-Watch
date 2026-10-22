# Convoy Watch — System Architecture

Autonomous, approval-gated fleet trip watcher powered by a self-hosted Streamable HTTP MCP server and Alexa+ voice simulation.

```
                              ┌──────────────────────────────────────────────┐
                              │             Alexa+ Echo Show UI              │
                              │  (Voice Turns, Speech Synthesis, Web Speech) │
                              └──────────────────────┬───────────────────────┘
                                                     │
                                                     │ JSON-RPC 2.0
                                                     │ (over Streamable HTTP)
                                                     ▼
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│                                  Single Express Process                                    │
│                                                                                            │
│   ┌──────────────────────────┐    ┌──────────────────────────┐   ┌─────────────────────┐   │
│   │ POST /mcp · GET /mcp     │    │  /api/* Simulation REST  │   │ Static SPA Host     │   │
│   │ (Streamable HTTP Server) │    │  (Trips, Actions, Audit) │   │ (Built React App)   │   │
│   └────────────┬─────────────┘    └────────────┬─────────────┘   └─────────────────────┘   │
│                │                               │                                           │
│                ▼                               ▼                                           │
│   ┌──────────────────────────────────────────────────────────┐                             │
│   │               Authentication & Security Barrier          │                             │
│   │   (API Key Guard, IP Rate Limiter, Security Headers)     │                             │
│   └────────────────────────────┬─────────────────────────────┘                             │
│                                │                                                           │
│                                ▼                                                           │
│   ┌──────────────────────────────────────────────────────────┐                             │
│   │                     Domain Core Engine                   │                             │
│   │                                                          │                             │
│   │  ┌────────────────────┐   ┌───────────────────────────┐  │                             │
│   │  │   Trip Watcher     │   │     NLU Intent Router     │  │                             │
│   │  │ (Autonomous Ticks, │   │ (Gemini 3.8 Flash NLU     │  │                             │
│   │  │  Risk Thresholds)  │   │  + Rule Fallback Parser)  │  │                             │
│   │  └─────────┬──────────┘   └─────────────┬─────────────┘  │                             │
│   │            │                            │                │                             │
│   │            ▼                            ▼                │                             │
│   │  ┌────────────────────────────────────────────────────┐  │                             │
│   │  │           Human Approval Gate (approve_action)     │  │                             │
│   │  │     (Guards all outbound consignee notifications)  │  │                             │
│   │  └──────────────────────────┬─────────────────────────┘  │                             │
│   └─────────────────────────────┼────────────────────────────┘                             │
│                                 │                                                          │
│        ┌────────────────────────┼────────────────────────┐                                 │
│        ▼                        ▼                        ▼                                 │
│  ┌───────────────┐     ┌──────────────────┐     ┌──────────────────┐                       │
│  │ StateStore    │     │ Append-Only      │     │ In-Process       │                       │
│  │ (Versioned    │     │ Audit Log        │     │ Queue & DLQ      │                       │
│  │  CAS Writes)  │     │ (SHA-256 Chained)│     │ (Backoff + DLQ)  │                       │
│  └───────┬───────┘     └────────┬─────────┘     └────────┬─────────┘                       │
└──────────┼──────────────────────┼────────────────────────┼─────────────────────────────────┘
           │                      │                        │
           ▼                      ▼                        ▼
    ┌──────────────┐       ┌──────────────┐         ┌──────────────┐
    │ In-Memory or │       │ audit_log    │         │ Redis Queue  │
    │ Redis Store  │       │ .jsonl       │         │ (when env set│
    └──────────────┘       └──────────────┘         └──────────────┘
```

---

## 1. Component Boundaries

### A. MCP Server (@modelcontextprotocol/sdk)
- Self-hosted Streamable HTTP transport implementation serving `POST /mcp` and `GET /mcp`.
- 5 Zod-typed MCP tools:
  1. `start_trip_watch`
  2. `get_trip_status`
  3. `list_reroute_options`
  4. `approve_action` (approval gate)
  5. `stop_trip_watch`
- Adheres to MCP Spec 2025-11-25.

### B. Provenance & Trust Layer (`@convoy/mcp-provenance`)
- Zero-dependency standalone workspace package.
- Standardized Provenance Envelope: `{ source, ageSeconds, confidence, confidenceType: 'heuristic', spokenPhrase, hasFix }`.
- Deterministic Ugandan registration plate sanitization (`UBB 123X` -> `UBB ***X`).
- Bounding box enforcement (-1.5 to +4.3 Lat, 29.5 to 35.1 Lon), heavy vehicle speed ceiling (110 km/h), sequence deduplication, haversine teleportation gap check, dead-reckoning cap (90s with confidence decay and alert exclusion).
- Multi-sensor confidence blending: $v = \frac{\sum c_i v_i}{\sum c_i}$ falling back to baseline when sample count is insufficient.

### C. Watcher Engine & Proactive Alerts
- Autonomous background loop ticking every 3.5s per active monitored corridor.
- Performs: `locate -> corridor forecast -> weather -> delay-risk estimate -> reroute options`.
- Proactive Alert: Triggers when delay risk crosses the 0.50 threshold.
- Outbound Action Guard: Outbound communications (e.g. consignee delay SMS or rerouting) are strictly blocked from execution until human supervisor confirms via `approve_action`.

### D. Cryptographic Audit Log
- Append-only JSONL format (`audit_log.jsonl`).
- Every entry is SHA-256 hash-chained to the previous entry ($H_i = \text{SHA256}(H_{i-1} \parallel \text{seq} \parallel \text{timestamp} \parallel \text{event} \parallel \text{data})$).
- Genesis block identifier: `GENESIS_CONVOY_WATCH_V1`.
- Serialized execution mutex prevents concurrent race conditions.
- Runtime tamper detection algorithm (`verifyChain`) verifies sequence integrity and detects unauthorized record modifications.

### E. Optimistic Concurrency Control (CAS)
- Every trip record carries a monotonically increasing integer `version`.
- Updates must provide `expectedVersion`. Stale writes are rejected with a version conflict error, preventing blind overwrites across concurrent watcher ticks and approval actions.

---

## 2. Fallback Ladder & Reliability

| Tier | Component | Behavior | Provenance Label |
|------|-----------|----------|-------------------|
| Tier 1 | Gemini 3.8 Flash NLU | Function calling over MCP tool schemas | `derived` / `gemini_nlu` |
| Tier 2 | Rule-Based Fallback NLU | Deterministic regex / token matching | `baseline` / `rule_fallback_nlu` |
| Tier 3 | Circuit Breaker | Trips after 2 consecutive Gemini failures (15s half-open cooldown) | `baseline` |
| Tier 4 | Telemetry Dropout | Satellite blind spot: reports "No GPS fix available" (never fabricates position) | `hasFix: false`, `estimate` |

---

## 3. Scaling to Thousands of Trips & Multiple Nodes

For enterprise scale beyond a single node:
1. **Stateless Process Tier**: The Express server remains stateless. Client requests and Alexa+ turns can be load-balanced across multiple container instances.
2. **Distributed CAS via Redis / Postgres**: The `StateStore` interface supports a Redis adapter using Redis transactions (WATCH / MULTI / EXEC) or PostgreSQL `xmin` row versioning.
3. **Distributed Job Queue**: The `JobQueue` interface switches to Redis Streams / BullMQ for durable message delivery across crashes.
4. **Watcher Partitioning**: Trip watcher loops are partitioned across worker nodes using consistent hashing over `tripId` or Kafka consumer groups.

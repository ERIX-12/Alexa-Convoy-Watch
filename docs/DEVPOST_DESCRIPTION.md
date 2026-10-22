# Devpost Submission — Convoy Watch (Alexa+ Track)

## Inspiration
Heavy freight transport across developing economic corridors—such as the vital trade arteries linking Kampala, Jinja, and the Northern Ugandan corridor—faces severe operational unpredictability: sudden escarpment blockages, torrential tropical rainstorms, and intermittent GPS blackouts. Fleet supervisors managing dozens of long-haul convoys need continuous oversight without being overwhelmed by noisy raw telemetry.

When autonomous AI agents make decisions, unsupervised actions like broadcasting premature delivery delay alerts can spark chaos with consignees and customs brokers. We built **Convoy Watch** to solve this: an autonomous, stateful, approval-gated agent powered by a self-hosted Model Context Protocol (MCP) server and simulated Echo Show Alexa+ interface, backed by an uncompromising mathematical trust layer.

---

## What It Does
Convoy Watch continuously monitors commercial trips in real time:
- **Autonomous Watcher Engine**: Ticks every few seconds, chaining telemetry location, corridor congestion forecasts, localized weather shifts, and delay risks.
- **Proactive Voice Alerts**: When corridor delay risk crosses acceptable thresholds, the agent proactively generates an alert and formulates an outbound action (e.g. consignee delay SMS or Katosi bypass reroute).
- **Human Approval Gate (`approve_action`)**: Strictly prevents unvetted outbound communications or route modifications. The agent cannot dispatch notices until an authorized supervisor explicitly confirms.
- **Cryptographic Audit Trail**: Every approval, rejection, or proactive trigger is appended to a tamper-evident, SHA-256 hash-chained JSONL audit ledger.
- **Honest Provenance Layer**: Every reading carries an explicit data envelope (`{source, ageSeconds, confidence, spokenPhrase, hasFix}`). During GPS dropouts, it speaks: *"No GPS fix available. Corridor telemetry is currently offline"*—never fabricating positions.
- **Echo Show Experience**: Hands-free voice turns powered by the Web Speech API and Gemini 3.8 Flash NLU, with a 100% reliable deterministic rule fallback parser.

---

## How We Built It
- **MCP Server**: Built with the official `@modelcontextprotocol/sdk` (spec version 2025-11-25) over Streamable HTTP (`POST /mcp` and `GET /mcp`). 5 tools typed and strictly validated with Zod.
- **`@convoy/mcp-provenance`**: An independent, zero-dependency workspace package implementing Ugandan plate redaction (`UBB 123X` -> `UBB ***X`), geographic bounding box enforcement, haversine gap validation, dead-reckoning decay with a 90s cutoff, and confidence-weighted blending.
- **Architecture**: Single Express process serving the Streamable HTTP MCP server, the simulation REST endpoints, and the built React 19 / Tailwind CSS application.
- **Persistence & Concurrency**: Optimistic concurrency control (CAS) versioning prevents race conditions; state store interface with in-memory default and Redis adapter.
- **Reliability & Security**: Circuit breakers on the AI model, in-process queue with exponential backoff and Dead-Letter Queue (DLQ), 5-second single-flight read cache, programmatic route-level API key authorization, and rate limiting.

---

## Challenges We Overcame
1. **MCP Streamable HTTP in Express**: Adapting the `@modelcontextprotocol/sdk` Streamable HTTP server transport to work seamlessly within an Express server alongside REST simulation routes while maintaining strict authentication and zero session leakage.
2. **Honesty vs. Hallucination**: Implementing the dead-reckoning 90-second hard cap in `@convoy/mcp-provenance` to guarantee that when a truck enters a satellite shadow in Mabira Forest, the system reports telemetry loss rather than hallucinating coordinates.
3. **Optimistic Locking without Database Locks**: Designing atomic CAS writes with monotonically increasing sequence versions to ensure concurrent ticks and user voice approvals never cause lost updates.

---

## Accomplishments We're Proud Of
- 100% green test suite across 9 suites covering unit logic, MCP tool contracts, full trip lifecycle, route authorization, tamper detection, and real mutation checks.
- Zero mock or placeholder logic in the production path; deterministic synthetic fleet simulator grounded in real Ugandan geography.
- A seamless Alexa+ voice and visual dashboard that runs smoothly in browser environments.

---

## What We Learned
Model Context Protocol over Streamable HTTP is extraordinarily well-suited for voice-first agentic experiences, providing structured, discoverable tool schemas that LLMs can safely invoke with client-side validation.

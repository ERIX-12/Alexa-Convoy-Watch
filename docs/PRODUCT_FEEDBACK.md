# Product Feedback — Amazon Developer Hackathon (Alexa+ Track)

This document records real architectural findings and feedback encountered while building **Convoy Watch** using `@modelcontextprotocol/sdk` and Alexa+ voice simulation. No speculative or fabricated entries are included.

---

### 1. Model Context Protocol (MCP) Streamable HTTP Transport
- **Observation:** In `@modelcontextprotocol/sdk` (v1.32.1), `StreamableHTTPServerTransport` supports both stateful (`sessionIdGenerator: () => randomUUID()`) and stateless modes (`sessionIdGenerator: undefined`).
- **Real Issue Encountered:** When using `StreamableHTTPClientTransport` with the server in stateless mode, `client.connect()` successfully sends the initial `initialize` request, but the server response omits the `mcp-session-id` header. Subsequent protocol notifications (such as `notifications/initialized`) sent by the client fail with an HTTP error because the client transport expects a session ID when maintaining a persistent connection.
- **Resolution:** Initializing `StreamableHTTPServerTransport` with `sessionIdGenerator: () => randomUUID()` enables session persistence and ensures client reconnectability and multi-turn conversational tool execution over Streamable HTTP.
- **Recommendation for Spec / SDK Authors:** The SDK documentation should clarify that `StreamableHTTPClientTransport` defaults to stateful session tracking, and explicitly recommend `sessionIdGenerator` when integrating with Express or Hono servers.

---

### 2. Express Middleware Body-Consumption Coexistence
- **Observation:** Standard Express applications use `express.json()` or `body-parser` for REST endpoints.
- **Real Issue Encountered:** If `express.json()` processes the incoming `POST /mcp` request, the Node.js `IncomingMessage` stream is consumed. Passing `(req, res)` directly to `transport.handleRequest` without the third argument results in the transport attempting to read an empty stream.
- **Resolution:** The MCP SDK supports passing the pre-parsed body: `transport.handleRequest(req, res, req.body)`. This should be highlighted prominently in full-stack Express examples.

---

### 3. Background Watcher Loops and Test Runner Lifecycle
- **Observation:** In autonomous agent architectures, an active watcher loop periodically assesses corridor conditions (`setInterval`).
- **Real Issue Encountered:** Persistent background timers prevent Node.js test runners (`node:test`) and CI harnesses from exiting cleanly even after all test assertions pass.
- **Resolution:** Calling `.unref()` on background `setInterval` timers ensures the autonomous ticks continue during runtime while allowing the Node.js event loop to shut down immediately when tests complete or upon SIGTERM.

---

### 4. Zero-Hallucination Discipline in Voice Assistants
- **Observation:** LLMs and voice agents often extrapolate or smooth over telemetry dropouts.
- **Resolution:** Mathematical bounding boxes and a dead-reckoning 90-second hard cutoff in `@convoy/mcp-provenance` provide deterministic truth. When satellite coverage is lost, reporting `"No GPS fix available"` establishes genuine user trust rather than fabricated confidence.

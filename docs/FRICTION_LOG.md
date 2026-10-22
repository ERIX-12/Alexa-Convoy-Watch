# Friction Log — Amazon Developer Hackathon (Alexa+ Track)

This friction log documents genuine engineering hurdles encountered and resolved during the implementation of **Convoy Watch**.

---

### Friction Entry 1: MCP SDK Subpath Module Resolution in Node 22
- **Timestamp:** 2026-10-19T20:50:53-07:00
- **Context:** Installing and importing `@modelcontextprotocol/sdk` (v1.32.1) in Node.js 22.
- **Symptom:** Executing `node -e "require('@modelcontextprotocol/sdk')"` or standard directory import threw `ERR_MODULE_NOT_FOUND` because the package is pure ESM with strict subpath exports.
- **Root Cause:** The package maps root imports to `./dist/esm/index.js` and provides granular subpaths such as `./server/mcp.js`, `./server/streamableHttp.js`, and `./client/index.js`.
- **Fix:** Used explicit subpath imports with `.js` extensions throughout server and test code:
  ```ts
  import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
  import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
  ```

---

### Friction Entry 2: Stateless vs. Stateful Streamable HTTP Sessions
- **Timestamp:** 2026-10-19T21:02:26-07:00
- **Context:** Connecting the official `@modelcontextprotocol/sdk/client` to the server's `/mcp` endpoint in integration tests.
- **Symptom:** Initial request succeeded, but client threw `Streamable HTTP error: Error POSTing to endpoint: 500` on the subsequent notification.
- **Root Cause:** `StreamableHTTPServerTransport` initialized with `sessionIdGenerator: undefined` operates in stateless mode and omits `mcp-session-id` headers. The official client transport defaults to expecting a session identifier for subsequent stream messages.
- **Fix:** Changed configuration to `sessionIdGenerator: () => randomUUID()`, enabling stateful session tracking and seamless client reconnection.

---

### Friction Entry 3: Timer Leaks in Integration Tests
- **Timestamp:** 2026-10-19T21:02:10-07:00
- **Context:** Executing `npm test` across all 9 suites in a single process.
- **Symptom:** Tests passed, but the process lingered indefinitely instead of exiting.
- **Root Cause:** Active `setInterval` loops initialized in `TripWatcherService.startTripWatch` kept the Node.js event loop active.
- **Fix:** Invoked `interval.unref()` on all background watcher timers. This preserved periodic execution during live server operation while permitting the test runner to terminate promptly upon suite completion.

---

### Friction Entry 4: NLU Network Latency during Test Execution
- **Timestamp:** 2026-10-19T21:01:02-07:00
- **Context:** Testing NLU fallback parsing under simulated network degradation.
- **Symptom:** Integration tests waited for 3.5s per Gemini timeout before falling back to rule matching, accumulating 14 seconds of test latency.
- **Fix:** Refactored unit test suites to verify `nluService.parseRuleBased` and the `CircuitBreaker` state machine directly, reserving network calls for runtime voice turns. Reduced test duration from 14s to 600ms.

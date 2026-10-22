# Convoy Watch — Hackathon Demo Script (Alexa+ Track)
**Target Duration:** 2 minutes, 30 seconds (Hard ceiling: 2:45)
**Environment:** Echo Show Simulated Web Console + Live Streamable HTTP MCP Server (`/mcp`)
**Presenter Role:** Senior Logistics Supervisor overseeing Uganda East-West commercial freight.

---

### [0:00 - 0:25] The Problem & The Architecture
- **Action:** Open application on the wide Echo Show interface.
- **Spoken Narration:**
  > *"Autonomous agents in commercial logistics cannot operate as blind LLM wrappers. When an unexpected blockage occurs along a corridor like Kampala-Jinja, having an AI hallucinate coordinates or prematurely blast delay alerts to customers causes chaos.*
  > *This is Convoy Watch. Built for the Alexa+ track, it features a self-hosted Streamable HTTP MCP server using the official Model Context Protocol SDK, an agentic watcher loop, a cryptographic audit trail, and an approval gate."*

---

### [0:25 - 0:55] Act 1: Autonomous Watcher & Live MCP Call
- **Action:** Click the microphone icon or tap `"Check status"`. The mic pulses red, and Alexa+ speaks back in real time.
- **Spoken Voice Turn:**
  - *Supervisor:* *"Alexa, what is the status of trip TRIP-KLA-JINJA-01?"*
  - *Alexa+:* *"Trip TRIP-KLA-JINJA-01 is active. ETA to Jinja Port Depot is 110 minutes. Live GPS fix from 2 seconds ago."*
- **Visual Highlight:**
  - Point to the **Data Trust Layer** card: note `{ source: "live", ageSeconds: 2, confidence: 0.98, confidenceType: "heuristic" }`.
  - Notice the vehicle plate is automatically sanitized: `UBB ***X` (Ugandan PII redaction by `@convoy/mcp-provenance`).
  - Open the **MCP Inspector** drawer to show the actual `tools/call` JSON-RPC request and response streaming over `POST /mcp`.

---

### [0:55 - 1:35] Act 2: Proactive Alert & Mabira Bottleneck
- **Action:** Click `"Run Demo Scenario"` or trigger Step 2 (Mabira Congestion).
- **Spoken Narration:**
  > *"Now watch our autonomous watcher engine. Every few seconds, it independently assesses corridor speed and risk without waiting for human prompts."*
- **System Event:**
  - Speed drops from 64 km/h to 12 km/h. Delay risk surges to 76%.
  - The watcher raises a proactive alert: `PROACTIVE_ALERT_RAISED`.
  - The **Human Approval Gate** panel flashes amber: *"Dispatch Delay Notification to Consignee"*.
- **Spoken Voice Turn:**
  - *Alexa+:* *"Attention: UBB 456X delay risk is 76 percent. Dispatch Delay Notification to Consignee. Do you approve this dispatch?"*
- **Key Hackathon Rule Proof:**
  > *"Notice that NO outbound SMS or dispatch was sent. The approval gate holds the action until an authorized supervisor explicitly confirms."*

---

### [1:35 - 2:05] Act 3: The No-Fix Honesty Moment (GPS Dropout)
- **Action:** Transition to GPS Dropout step.
- **Spoken Narration:**
  > *"What happens when the truck enters a deep satellite blind spot in the Mabira forest cutting? Traditional systems invent a dead-reckoned location. Convoy Watch adheres to zero-hallucination discipline."*
- **Visual Highlight:**
  - GPS coordinates turn to `null`.
  - The Data Trust badge displays in red: `NO FIX`.
  - Alexa+ speaks: *"No GPS fix available. Corridor telemetry is currently offline."*
  - The system proves honesty over false confidence.

---

### [2:05 - 2:30] Act 4: Reroute Carousel & Cryptographic Approval
- **Action:** Click `"List reroutes"`. Then click `"Approve Outbound Dispatch"`.
- **Spoken Voice Turn:**
  - *Supervisor:* *"Alexa, approve dispatch."*
  - *Alexa+:* *"Action approved and signed to audit log. Outbound dispatch 'Dispatch Delay Notification to Consignee' executed."*
- **Visual Highlight:**
  - The pending action clears from the gate.
  - The **Audit Trail** appends record `#2: ACTION_APPROVED`.
  - Point to the green cryptographic badge: `CHAIN VALID (SHA-256)`.
  - Each record is tamper-evident and chained to the previous record's hash.

---

### [2:30 - 2:45] Conclusion & Verification
- **Spoken Narration:**
  > *"Convoy Watch runs as a single Express process, compiles strictly to JavaScript, passes 100% of its test suite, and is available for evaluation using the judge demo key. Thank you."*

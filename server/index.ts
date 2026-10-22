/**
 * Convoy Watch - Express Server & Streamable HTTP MCP Endpoint
 * Serves MCP Protocol at /mcp, simulation REST APIs at /api/*, and compiled React UI.
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { createStateStore } from './infrastructure/state-store.js';
import { AuditLog } from './infrastructure/audit-log.js';
import { ReadCache } from './infrastructure/cache.js';
import { createJobQueue } from './infrastructure/queue.js';
import { FleetSimulator } from './domain/fleet-simulator.js';
import { TripWatcherService } from './domain/watcher.js';
import { createConvoyMcpServer } from './mcp/server.js';
import { NluService } from './ai/nlu.js';
import { loadSecurityConfig, createSecurityMiddleware } from './security/auth.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createServer() {
  const securityConfig = loadSecurityConfig();
  const { securityHeaders, requireApiKey, requireSuperuserKey } = createSecurityMiddleware(securityConfig);

  const stateStore = createStateStore();
  const auditFilePath = path.join(process.cwd(), 'audit_log.jsonl');
  const auditLog = new AuditLog(securityConfig.auditHmacSecret, auditFilePath);
  await auditLog.init();

  const cache = new ReadCache();
  const queue = createJobQueue();
  const simulator = new FleetSimulator();
  const watcher = new TripWatcherService(stateStore, auditLog, cache, simulator);
  const nluService = new NluService();

  // Initialize MCP Server
  const mcpServer = createConvoyMcpServer(watcher);
  const mcpTransport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
  await mcpServer.connect(mcpTransport);

  const app = express();

  // Basic security and parsing
  app.use(securityHeaders);
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Seed default demonstration trip
  const defaultTripId = 'TRIP-KLA-JINJA-01';
  await watcher.startTripWatch({
    tripId: defaultTripId,
    destination: 'Jinja Port Depot',
    corridorId: 'UG-CORRIDOR-01',
    priority: 'high',
    vehicleId: 'TRK-101',
  }).catch((err) => {
    console.log('[Init] Default trip watch already seeded:', err.message);
  });

  // Health endpoint (Public / Unauthenticated)
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'convoy-watch',
      mcpSpec: '2025-11-25',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      activeTrips: 1,
    });
  });
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'convoy-watch',
      mcpSpec: '2025-11-25',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  // Streamable HTTP MCP Endpoint (GET & POST) - Authenticated
  app.all('/mcp', requireApiKey, async (req, res) => {
    try {
      await mcpTransport.handleRequest(req, res, req.body);
    } catch (err: unknown) {
      console.error('[MCP Transport Error]', err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal MCP Transport Error' },
          id: null,
        });
      }
    }
  });

  // SIMULATION REST ENDPOINTS (All authenticated via requireApiKey)

  // 1. List all monitored trips
  app.get('/api/trips', requireApiKey, async (req, res) => {
    console.log(`[Server Debug] Request to /api/trips`);
    try {
      const trips = await stateStore.listTrips();
      res.json({ trips, total: trips.length });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // 2. Get single trip status
  app.get('/api/trips/:tripId', requireApiKey, async (req, res) => {
    console.log(`[Server Debug] Request to /api/trips/${req.params.tripId}`);
    try {
      const result = await watcher.getTripStatus(req.params.tripId);
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(404).json({ error: msg });
    }
  });

  // 3. Start trip watch
  app.post('/api/trips/start', requireApiKey, requireSuperuserKey, async (req, res) => {
    try {
      const { tripId, destination, corridorId, priority, vehicleId } = req.body;
      if (!tripId || !destination) {
        res.status(400).json({ error: 'tripId and destination are required.' });
        return;
      }
      const result = await watcher.startTripWatch({
        tripId,
        origin: req.body.origin,
        destination,
        corridorId: corridorId,
        priority: priority || 'standard',
        vehicleId,
      });
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // 4. Manually trigger watcher tick
  app.post('/api/trips/:tripId/tick', requireApiKey, requireSuperuserKey, async (req, res) => {
    try {
      const trip = await watcher.tickTrip(req.params.tripId);
      res.json({ success: true, trip });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // 5. Change scenario state for deterministic testing & demo
  app.post('/api/trips/:tripId/scenario', requireApiKey, requireSuperuserKey, async (req, res) => {
    try {
      const { event } = req.body;
      const validEvents = ['NORMAL', 'SLOW_CORRIDOR', 'GPS_DROPOUT', 'SEVERE_WEATHER'];
      if (!validEvents.includes(event)) {
        res.status(400).json({ error: `Invalid scenario event. Must be one of: ${validEvents.join(', ')}` });
        return;
      }
      simulator.setTripScenario(req.params.tripId, event);
      // Immediately run a tick to reflect change
      const updatedTrip = await watcher.tickTrip(req.params.tripId);
      res.json({
        success: true,
        scenario: event,
        trip: updatedTrip,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // 6. List reroute options
  app.get('/api/trips/:tripId/reroutes', requireApiKey, async (req, res) => {
    try {
      const result = await watcher.listRerouteOptions(req.params.tripId);
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // 7. Human Approval Gate
  app.post('/api/trips/:tripId/actions/:actionId/approve', requireApiKey, requireSuperuserKey, async (req, res) => {
    try {
      const { decision, notes } = req.body;
      if (decision !== 'approved' && decision !== 'rejected') {
        res.status(400).json({ error: "decision must be 'approved' or 'rejected'." });
        return;
      }
      const actor = (req as any).auth?.actor || 'SUPERVISOR_KEY_AUTH';
      const result = await watcher.approveAction({
        tripId: req.params.tripId,
        actionId: req.params.actionId,
        decision,
        actor,
        notes,
      });
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // 8. Stop trip watch
  app.post('/api/trips/:tripId/stop', requireApiKey, requireSuperuserKey, async (req, res) => {
    try {
      const { reason } = req.body;
      const result = await watcher.stopTripWatch(req.params.tripId, reason);
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // 9. Alexa Voice Turn endpoint: NLU -> MCP Tool Execution -> Spoken & Card Reply
  app.post('/api/alexa/voice-turn', requireApiKey, async (req, res) => {
    try {
      const { query, tripId, actionId, engine } = req.body;
      if (!query || typeof query !== 'string') {
        res.status(400).json({ error: 'Query string is required.' });
        return;
      }

      // Step 1: NLU classification
      const nlu = await nluService.parseIntent(query, {
        defaultTripId: tripId || defaultTripId,
        pendingActionId: actionId,
        engine,
      });

      // Step 2: Execute corresponding MCP domain tool
      let executionResult: Record<string, unknown> = {};
      let spokenPhrase = '';

      switch (nlu.toolName) {
        case 'start_trip_watch': {
          const r = await watcher.startTripWatch({
            tripId: (nlu.args.tripId as string) || defaultTripId,
            origin: req.body.origin, // Capture from request if provided
            destination: (nlu.args.destination as string) || 'Jinja Port Depot',
            corridorId: (nlu.args.corridorId as string) || 'UG-CORRIDOR-01',
            priority: (nlu.args.priority as any) || 'high',
            vehicleId: (nlu.args.vehicleId as string) || 'TRK-101',
          });
          executionResult = r;
          spokenPhrase = r.spokenPhrase;
          break;
        }
        case 'get_trip_status': {
          const r = await watcher.getTripStatus((nlu.args.tripId as string) || defaultTripId);
          executionResult = r;
          spokenPhrase = r.spokenPhrase;
          break;
        }
        case 'list_reroute_options': {
          const r = await watcher.listRerouteOptions((nlu.args.tripId as string) || defaultTripId);
          executionResult = r;
          spokenPhrase = r.spokenPhrase;
          break;
        }
        case 'approve_action': {
          const targetTripId = (nlu.args.tripId as string) || defaultTripId;
          const tripData = await watcher.getTripStatus(targetTripId);
          if (!tripData?.trip?.pendingActions || tripData.trip.pendingActions.length === 0) {
            spokenPhrase = `There are currently no outbound actions pending authorization for ${targetTripId}.`;
            executionResult = { status: 'no_pending_actions' };
            break;
          }
          const targetActionId =
            (nlu.args.actionId as string) ||
            actionId ||
            tripData.trip.pendingActions[0].actionId;

          const r = await watcher.approveAction({
            tripId: targetTripId,
            actionId: targetActionId,
            decision: (nlu.args.decision as any) || 'approved',
            actor: (req as any).auth?.actor || 'ALEXA_SUPERVISOR_VOICE',
            notes: (nlu.args.notes as string) || 'Authorized via Alexa+ spoken turn',
          });
          executionResult = r;
          spokenPhrase = r.spokenPhrase;
          break;
        }
        case 'stop_trip_watch': {
          const r = await watcher.stopTripWatch(
            (nlu.args.tripId as string) || defaultTripId,
            (nlu.args.reason as string) || 'Spoken stop request'
          );
          executionResult = r;
          spokenPhrase = r.spokenPhrase;
          break;
        }
        default: {
          spokenPhrase = "I could not determine the fleet command. You can ask for trip status, reroute options, or to approve a pending dispatch.";
          break;
        }
      }

      res.json({
        spokenPhrase,
        nlu,
        executionResult,
        timestamp: Date.now(),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // 10. Audit Log & Tamper Verification
  app.get('/api/audit-log', requireApiKey, async (req, res) => {
    try {
      const records = auditLog.getRecords(req.query.tripId as string | undefined);
      const verification = AuditLog.verifyChain(records);
      res.json({
        records,
        total: records.length,
        chainIntegrity: verification,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // 11. DLQ inspection endpoint
  app.get('/api/dlq', requireApiKey, (req, res) => {
    res.json({
      deadLetterQueue: queue.getDeadLetterQueue(),
    });
  });

  // Static serving for built React frontend
  const staticPath = path.resolve(process.cwd(), 'dist');
  app.use(express.static(staticPath));

  app.get('*', (req, res) => {
    // If it's an API request that hasn't been handled by now, it's a 404
    if (req.path.startsWith('/api') || req.path.startsWith('/mcp')) {
      res.status(404).json({ error: 'Endpoint not found' });
      return;
    }
    
    // Otherwise serve the React app
    const indexFile = path.join(staticPath, 'index.html');
    res.sendFile(indexFile, (err) => {
      if (err) {
        res.status(500).send('React app build not found.');
      }
    });
  });

  return { app, watcher, stateStore, auditLog, simulator, nluService, securityConfig };
}

// Direct startup when executed with `node dist/server.js` or directly via CLI
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('server.js') || process.argv[1].endsWith('server/index.ts'));



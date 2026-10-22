/**
 * Model Context Protocol (MCP) Server for Convoy Watch
 * Self-hosted MCP Server adhering to the official @modelcontextprotocol/sdk.
 * Typed with Zod, validates every argument, returns structured content.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TripWatcherService } from '../domain/watcher.js';

export function createConvoyMcpServer(watcher: TripWatcherService): McpServer {
  const server = new McpServer({
    name: 'convoy-watch-mcp',
    version: '1.0.0',
  });

  // Tool 1: start_trip_watch
  server.tool(
    'start_trip_watch',
    'Starts autonomous telemetry watching and proactive risk monitoring on a freight trip.',
    {
      tripId: z.string().describe('Unique identifier for the trip (e.g. "TRIP-KLA-JINJA-01")'),
      destination: z.string().describe('Final destination city or facility (e.g. "Jinja Port Depot")'),
      corridorId: z.string().describe('Ugandan corridor ID (e.g. "UG-CORRIDOR-01", "UG-CORRIDOR-02", "UG-CORRIDOR-03")'),
      priority: z.enum(['standard', 'high', 'critical']).default('standard').describe('Trip priority level'),
      vehicleId: z.string().optional().describe('Vehicle fleet identifier (e.g. "TRK-101")'),
    },
    async (args) => {
      const result = await watcher.startTripWatch({
        tripId: args.tripId,
        destination: args.destination,
        corridorId: args.corridorId,
        priority: args.priority,
        vehicleId: args.vehicleId,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              action: 'start_trip_watch',
              success: true,
              spokenPhrase: result.spokenPhrase,
              trip: result.trip,
              provenance: result.trip.provenance,
            }),
          },
        ],
      };
    }
  );

  // Tool 2: get_trip_status
  server.tool(
    'get_trip_status',
    'Retrieves live trip status, corridor delay risk, GPS provenance, and pending human-approval actions.',
    {
      tripId: z.string().describe('Unique identifier for the trip'),
    },
    async (args) => {
      const result = await watcher.getTripStatus(args.tripId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              action: 'get_trip_status',
              spokenPhrase: result.spokenPhrase,
              trip: result.trip,
              provenance: result.trip.provenance,
              hasPendingApproval: result.trip.pendingActions.length > 0,
            }),
          },
        ],
      };
    }
  );

  // Tool 3: list_reroute_options
  server.tool(
    'list_reroute_options',
    'Lists corridor reroute options with delay savings, road conditions, and sensor provenance.',
    {
      tripId: z.string().describe('Unique identifier for the trip'),
    },
    async (args) => {
      const result = await watcher.listRerouteOptions(args.tripId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              action: 'list_reroute_options',
              spokenPhrase: result.spokenPhrase,
              tripId: args.tripId,
              options: result.options,
              totalOptions: result.options.length,
            }),
          },
        ],
      };
    }
  );

  // Tool 4: approve_action (HUMAN APPROVAL GATE)
  server.tool(
    'approve_action',
    'Approval gate tool to explicitly authorize or reject outbound fleet actions (e.g. consignee notifications or reroutes). Records decision to hash-chained tamper-evident audit log.',
    {
      tripId: z.string().describe('Unique identifier for the trip'),
      actionId: z.string().describe('Unique ID of the pending action requiring human approval'),
      decision: z.enum(['approved', 'rejected']).describe('Human supervisor decision'),
      notes: z.string().optional().describe('Optional justification or notes for the audit trail'),
    },
    async (args) => {
      const result = await watcher.approveAction({
        tripId: args.tripId,
        actionId: args.actionId,
        decision: args.decision,
        notes: args.notes,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              action: 'approve_action',
              success: result.success,
              spokenPhrase: result.spokenPhrase,
              executedAction: result.executedAction,
              trip: result.trip,
              auditHash: result.executedAction.auditHash,
            }),
          },
        ],
      };
    }
  );

  // Tool 5: stop_trip_watch
  server.tool(
    'stop_trip_watch',
    'Deactivates the autonomous watcher loop and marks trip monitoring complete.',
    {
      tripId: z.string().describe('Unique identifier for the trip'),
      reason: z.string().optional().describe('Reason for concluding watch'),
    },
    async (args) => {
      const result = await watcher.stopTripWatch(args.tripId, args.reason);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              action: 'stop_trip_watch',
              spokenPhrase: result.spokenPhrase,
              trip: result.trip,
            }),
          },
        ],
      };
    }
  );

  return server;
}

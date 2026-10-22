import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createServer } from '../../server/index.js';

describe('MCP Conformance & Protocol Inspection Tests', () => {
  let server: http.Server;
  let port: number;
  let watcher: any;

  before(async () => {
    process.env.NODE_ENV = 'test';
    const serverInstance = await createServer();
    watcher = serverInstance.watcher;
    server = http.createServer(serverInstance.app);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        port = addr.port;
        resolve();
      });
    });
  });

  after(() => {
    if (watcher) watcher.stopAll();
    if (server) server.close();
  });

  async function callMcpEndpoint(payload: Record<string, unknown>): Promise<any> {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(payload);
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/mcp',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
            Authorization: 'Bearer judge-alexa-plus-demo-key-2026-v1',
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try {
              resolve(JSON.parse(body));
            } catch {
              resolve({ raw: body, status: res.statusCode });
            }
          });
        }
      );
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  it('MCP Protocol Conformance: connects official MCP SDK Client over Streamable HTTP', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');

    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${port}/mcp`),
      {
        requestInit: {
          headers: {
            Authorization: 'Bearer judge-alexa-plus-demo-key-2026-v1',
          },
        },
      }
    );

    const client = new Client({ name: 'conformance-inspector', version: '1.0.0' }, { capabilities: {} });
    await client.connect(transport);

    // 1. List tools
    const toolsResult = await client.listTools();
    assert.ok(toolsResult.tools);
    const toolNames = toolsResult.tools.map((t) => t.name);
    assert.ok(toolNames.includes('start_trip_watch'));
    assert.ok(toolNames.includes('get_trip_status'));
    assert.ok(toolNames.includes('list_reroute_options'));
    assert.ok(toolNames.includes('approve_action'));
    assert.ok(toolNames.includes('stop_trip_watch'));
    assert.equal(toolNames.length, 5);

    // 2. Call get_trip_status
    const statusCall = await client.callTool({
      name: 'get_trip_status',
      arguments: {
        tripId: 'TRIP-KLA-JINJA-01',
      },
    });
    assert.ok(statusCall.content);
    const statusText = (statusCall.content as any)[0].text;
    const statusData = JSON.parse(statusText);
    assert.equal(statusData.action, 'get_trip_status');
    assert.equal(statusData.trip.tripId, 'TRIP-KLA-JINJA-01');

    // 3. Call list_reroute_options
    const rerouteCall = await client.callTool({
      name: 'list_reroute_options',
      arguments: {
        tripId: 'TRIP-KLA-JINJA-01',
      },
    });
    assert.ok(rerouteCall.content);
    const rerouteData = JSON.parse((rerouteCall.content as any)[0].text);
    assert.equal(rerouteData.action, 'list_reroute_options');
    assert.ok(rerouteData.options.length > 0);

    await client.close();
    if (watcher) watcher.stopAll();
    if (server) server.close();
  });
});

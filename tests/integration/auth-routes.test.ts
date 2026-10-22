import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createServer } from '../../server/index.js';

describe('Security & Programmatic Route Auth Tests', () => {
  let server: http.Server;
  let port: number;

  before(async () => {
    process.env.NODE_ENV = 'test';
    const { app, watcher } = await createServer();
    watcher.stopAll();

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        port = addr.port;
        resolve();
      });
    });
  });

  after(() => {
    if (server) server.close();
  });

  const routesToTest = [
    { method: 'POST', path: '/mcp', isWrite: true },
    { method: 'GET', path: '/api/trips', isWrite: false },
    { method: 'GET', path: '/api/trips/TRIP-KLA-JINJA-01', isWrite: false },
    { method: 'POST', path: '/api/trips/start', isWrite: true },
    { method: 'POST', path: '/api/trips/TRIP-KLA-JINJA-01/tick', isWrite: true },
    { method: 'POST', path: '/api/trips/TRIP-KLA-JINJA-01/scenario', isWrite: true },
    { method: 'GET', path: '/api/trips/TRIP-KLA-JINJA-01/reroutes', isWrite: false },
    { method: 'POST', path: '/api/trips/TRIP-KLA-JINJA-01/actions/ACT-1/approve', isWrite: true },
    { method: 'POST', path: '/api/trips/TRIP-KLA-JINJA-01/stop', isWrite: true },
    { method: 'POST', path: '/api/alexa/voice-turn', isWrite: false }, // Alexa turn is allowed for judge key
    { method: 'GET', path: '/api/audit-log', isWrite: false },
    { method: 'GET', path: '/api/dlq', isWrite: false },
  ];

  function makeRequest(method: string, path: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => resolve({ status: res.statusCode || 0, body }));
        }
      );
      req.on('error', reject);
      if (method === 'POST') {
        req.write(JSON.stringify({ test: true }));
      }
      req.end();
    });
  }

  it('allows public access to /health without any credentials', async () => {
    const res = await makeRequest('GET', '/health', {});
    assert.equal(res.status, 200);
    const parsed = JSON.parse(res.body);
    assert.equal(parsed.status, 'ok');
  });

  for (const route of routesToTest) {
    it(`rejects missing key on ${route.method} ${route.path} with 401`, async () => {
      const res = await makeRequest(route.method, route.path, {});
      assert.equal(res.status, 401, `Route ${route.path} should reject missing key with 401`);
    });

    it(`rejects invalid key on ${route.method} ${route.path} with 403`, async () => {
      const res = await makeRequest(route.method, route.path, {
        Authorization: 'Bearer invalid-hacker-attempt-9999',
      });
      assert.equal(res.status, 403, `Route ${route.path} should reject invalid key with 403`);
    });

    it(`accepts valid judge key on ${route.method} ${route.path} as expected`, async () => {
      const res = await makeRequest(route.method, route.path, {
        Authorization: 'Bearer judge-alexa-plus-demo-key-2026-v1',
      });
      
      if (route.isWrite) {
        assert.equal(res.status, 403, `Route ${route.path} should reject write with 403`);
      } else {
        assert.notEqual(res.status, 401);
        assert.notEqual(res.status, 403);
      }
    });
  }
});

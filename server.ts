/**
 * Development & Full-Stack Server Entry Point
 * Mounts Vite dev middleware in development mode and Express API/MCP routes.
 */

import { createServer as createViteServer } from 'vite';
import { createServer as createConvoyServer } from './server/index.ts';

async function start() {
  const { app } = await createConvoyServer();
  const port = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`[Convoy Watch] Unified dev server listening on http://0.0.0.0:${port}`);
    console.log(`[Convoy Watch] MCP Streamable HTTP endpoint: http://0.0.0.0:${port}/mcp`);
    console.log(`[Convoy Watch] Simulation API: http://0.0.0.0:${port}/api/trips`);
  });
}

start().catch((err) => {
  console.error('[Convoy Watch Fatal Error]:', err);
  process.exit(1);
});

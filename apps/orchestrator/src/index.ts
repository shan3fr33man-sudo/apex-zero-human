/**
 * APEX Orchestrator — PM2 Entry Point
 * Runs as a standalone Node.js process, separate from the Next.js frontend.
 * Connects to Supabase via SERVICE ROLE key (full database access).
 * Exposes /health endpoint on ORCHESTRATOR_HEALTH_PORT (default 3001).
 */
import http from 'node:http';
import { Engine } from './core/engine.js';
import { createLogger } from './lib/logger.js';

const log = createLogger('Main');

async function main(): Promise<void> {
  log.info('APEX Orchestrator starting', {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    tickMs: process.env.ORCHESTRATOR_TICK_MS ?? '5000',
  });

  const engine = new Engine();
  const startedAt = new Date().toISOString();

  // === Health Check HTTP Server ===
  const healthPort = Number(process.env.ORCHESTRATOR_HEALTH_PORT) || 3001;
  const healthServer = http.createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        service: 'apex-orchestrator',
        startedAt,
        uptime: process.uptime(),
        memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  healthServer.listen(healthPort, () => {
    log.info('Health check server started', { port: healthPort });
  });

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    log.info(`Received ${signal}, shutting down gracefully...`);
    healthServer.close();
    await engine.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Unhandled error handlers — log but don't crash
  process.on('unhandledRejection', (reason) => {
    log.error('Unhandled rejection', {
      error: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  process.on('uncaughtException', (err) => {
    log.error('Uncaught exception', {
      error: err.message,
      stack: err.stack,
    });
    // Let PM2 restart the process
    process.exit(1);
  });

  // Start the engine
  await engine.start();

  log.info('APEX Orchestrator running — all modules active');
}

main().catch((err) => {
  console.error('[APEX Orchestrator] Fatal startup error:', err);
  process.exit(1);
});

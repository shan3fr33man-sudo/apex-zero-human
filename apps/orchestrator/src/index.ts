/**
 * APEX Orchestrator — PM2 Entry Point
 * Runs as a standalone Node.js process, separate from the Next.js frontend.
 * Connects to Supabase via SERVICE ROLE key (full database access).
 */
import { Engine } from './core/engine.js';
import { createLogger } from './lib/logger.js';

const log = createLogger('Main');

async function main(): Promise<void> {
  log.info('APEX Orchestrator starting', {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    tickMs: process.env.ORCHESTRATOR_TICK_MS ?? '5000',
  });

  const engine = new Engine();

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    log.info(`Received ${signal}, shutting down gracefully...`);
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

/**
 * APEX — PM2 Ecosystem Configuration
 * Deploy: pm2 start ecosystem.config.js
 * Reload: pm2 reload ecosystem.config.js --update-env
 *
 * All env vars come from process.env or .env files — NEVER hardcoded here.
 * Log rotation: pm2 install pm2-logrotate (50M max, 7 day retention, gzip)
 */
module.exports = {
  apps: [
    // ─── Next.js Dashboard ────────────────────────────────────────────
    {
      name: 'apex-web',
      cwd: './apps/web',
      script: 'node_modules/.bin/next',
      args: 'start',
      instances: 2,
      exec_mode: 'cluster',
      max_memory_restart: '1G',
      restart_delay: 3000,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      log_file: './logs/apex-web.log',
      error_file: './logs/apex-web-error.log',
      out_file: './logs/apex-web-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },

    // ─── Orchestrator Engine ──────────────────────────────────────────
    {
      name: 'apex-orchestrator',
      cwd: './apps/orchestrator',
      script: 'dist/index.js',
      node_args: '-r dotenv/config',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '2G',
      restart_delay: 5000,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        ORCHESTRATOR_TICK_MS: '5000',
        AUTOSCALER_TICK_MS: '30000',
        STALL_CHECK_MS: '300000',
      },
      log_file: './logs/apex-orchestrator.log',
      error_file: './logs/apex-orchestrator-error.log',
      out_file: './logs/apex-orchestrator-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },

    // ─── Self-Evolution Engine (background, no port) ──────────────────
    {
      name: 'apex-see',
      cwd: './apps/orchestrator',
      script: 'dist/see/index.js',
      node_args: '-r dotenv/config',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      restart_delay: 30000,
      max_restarts: 5,
      env: {
        NODE_ENV: 'production',
        SEE_MODE: 'autonomous',
        SEE_DEPLOYMENT_WINDOW_START: '2',
        SEE_DEPLOYMENT_WINDOW_END: '4',
        SEE_MAX_BUDGET_PER_TEST_USD: '10',
      },
      log_file: './logs/apex-see.log',
      error_file: './logs/apex-see-error.log',
      out_file: './logs/apex-see-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};

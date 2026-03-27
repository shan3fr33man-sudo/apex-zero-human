/**
 * SEE — Self-Evolution Engine Entry Point
 *
 * PM2 process: apex-see
 * This is a SEPARATE process from the orchestrator.
 * It runs independently and NEVER crashes the main APEX system.
 *
 * All errors are silently caught. SEE failing is invisible
 * to operators — they never know it exists.
 */
import { Chronicle } from './chronicle.js';
import { Sentinel } from './sentinel.js';
import { Cartographer } from './cartographer.js';
import { Alchemist } from './alchemist.js';
import { Crucible } from './crucible.js';
import { Architect } from './architect.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('SEE');

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main SEE execution loop.
 * Initializes all 6 agents and starts independent loops.
 */
async function runSEE(): Promise<void> {
  const chronicle = new Chronicle();
  const sentinel = new Sentinel(chronicle);
  const cartographer = new Cartographer(chronicle);
  const alchemist = new Alchemist(chronicle);
  const crucible = new Crucible(chronicle);
  const architect = new Architect(chronicle);

  await chronicle.log('SEE_STARTED', { timestamp: new Date().toISOString() });

  log.info('SEE initialized — all agents active');

  // All loops run independently — none block each other
  void runSentinelLoop(sentinel, cartographer, crucible, architect, chronicle);
  void runAlchemistLoop(alchemist, crucible, architect, chronicle);
  void runDeploymentWindow(architect, chronicle);
  void runWeeklyReport(chronicle);

  // Keep the process alive
  await sleep(Number.MAX_SAFE_INTEGER);
}

/**
 * Sentinel loop — scans every 6 hours for new AI developments.
 * Discoveries → Cartographer mapping → Crucible testing → Architect queue.
 */
async function runSentinelLoop(
  sentinel: Sentinel,
  cartographer: Cartographer,
  crucible: Crucible,
  architect: Architect,
  chronicle: Chronicle
): Promise<void> {
  while (true) {
    try {
      const discoveries = await sentinel.scan();

      for (const discovery of discoveries) {
        await chronicle.logDiscovery(discovery);

        if (discovery.relevance_score >= 40) {
          const proposal = await cartographer.map(discovery);
          const proposalId = await chronicle.logProposal(proposal);
          if (proposalId) proposal.id = proposalId;

          if (proposal.shadow_testable) {
            const result = await crucible.test(proposal);
            await chronicle.logTestResult(result);

            if (result.verdict === 'APPROVE') {
              await architect.queueForDeployment(proposal, result);
            }
          }
        }
      }
    } catch (err) {
      await chronicle.logError('SENTINEL_LOOP', err);
    }

    await sleep(6 * 60 * 60 * 1000); // 6 hours
  }
}

/**
 * Alchemist loop — runs every Sunday at 3 AM.
 * Performance-driven prompt evolution.
 */
async function runAlchemistLoop(
  alchemist: Alchemist,
  crucible: Crucible,
  architect: Architect,
  chronicle: Chronicle
): Promise<void> {
  while (true) {
    try {
      const now = new Date();
      // Run on Sundays (day 0) at 3 AM
      if (now.getDay() === 0 && now.getHours() === 3) {
        log.info('Alchemist evolution cycle starting');

        const proposals = await alchemist.evolve();

        for (const proposal of proposals) {
          const proposalId = await chronicle.logProposal(proposal);
          if (proposalId) proposal.id = proposalId;

          if (proposal.shadow_testable) {
            const result = await crucible.test(proposal);
            await chronicle.logTestResult(result);

            if (result.verdict === 'APPROVE') {
              await architect.queueForDeployment(proposal, result);
            }
          }
        }
      }
    } catch (err) {
      await chronicle.logError('ALCHEMIST_LOOP', err);
    }

    await sleep(60 * 60 * 1000); // Check every hour
  }
}

/**
 * Deployment window — checks every 15 minutes.
 * Deploys queued proposals during 2 AM - 4 AM only.
 */
async function runDeploymentWindow(
  architect: Architect,
  chronicle: Chronicle
): Promise<void> {
  while (true) {
    if (architect.isInDeploymentWindow()) {
      try {
        const pending = await architect.getPendingDeployments();

        if (pending.length > 0) {
          log.info('Deployment window open — processing queue', {
            pendingCount: pending.length,
          });

          for (const d of pending) {
            await architect.deploy(d);
          }
        }
      } catch (err) {
        await chronicle.logError('ARCHITECT_DEPLOY', err);
      }
    }

    await sleep(15 * 60 * 1000); // Check every 15 minutes
  }
}

/**
 * Weekly report — generates every Sunday at midnight.
 */
async function runWeeklyReport(chronicle: Chronicle): Promise<void> {
  while (true) {
    try {
      const now = new Date();
      if (now.getDay() === 0 && now.getHours() === 0) {
        await chronicle.generateWeeklyReport();
      }
    } catch (err) {
      await chronicle.logError('WEEKLY_REPORT', err);
    }

    await sleep(60 * 60 * 1000); // Check every hour
  }
}

// ─── Silent Entry ──────────────────────────────────────────────────
// SEE NEVER crashes the main orchestrator. All errors are caught.
runSEE().catch(err => {
  const message = err instanceof Error ? err.message : String(err);
  log.error('SEE fatal error', { error: message });

  // Try to alert via internal webhook (best effort)
  const webhook = process.env.SEE_INTERNAL_ALERT_WEBHOOK;
  if (webhook) {
    fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'SEE_FATAL', error: message }),
    }).catch(() => {
      // Silent — if the webhook fails, there's nothing else we can do
    });
  }
});

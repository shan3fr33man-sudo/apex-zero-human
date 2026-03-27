/**
 * APEX Orchestrator Engine — Main Loop
 *
 * Wires all 7 core modules together + the APEX Memory System.
 * Runs as a single PM2 process, ticking every ORCHESTRATOR_TICK_MS (default 5s).
 *
 * Each tick:
 * 1. Get all active companies
 * 2. For each company: find idle agents, assign available issues, monitor progress
 * 3. AutoScaler and StallDetector run on their own intervals
 */
import { getSupabaseAdmin } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import { TokenGateway } from './token-gateway.js';
import { HeartbeatStateMachine } from './heartbeat.js';
import { TaskRouter } from './task-router.js';
import { EventBus } from './event-bus.js';
import { AutoScaler } from './autoscaler.js';
import { StallDetector } from '../escalation/stall-detector.js';
import { ModelRouter } from '../models/router.js';
import { ApexMemorySystem } from '../memory/ams.js';
import { VectorStore } from '../memory/vector-store.js';
import { Scheduler } from '../routines/scheduler.js';
import { Reactor } from '../routines/reactor.js';

const log = createLogger('Engine');

export class Engine {
  private supabase = getSupabaseAdmin();

  // Core modules
  readonly tokenGateway: TokenGateway;
  readonly heartbeat: HeartbeatStateMachine;
  readonly taskRouter: TaskRouter;
  readonly eventBus: EventBus;
  readonly autoScaler: AutoScaler;
  readonly stallDetector: StallDetector;
  readonly modelRouter: ModelRouter;
  readonly memory: ApexMemorySystem;
  readonly scheduler: Scheduler;
  readonly reactor: Reactor;

  private running = false;
  private tickHandle: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Initialize all modules
    this.tokenGateway = new TokenGateway();
    this.heartbeat = new HeartbeatStateMachine();
    this.taskRouter = new TaskRouter();
    this.eventBus = new EventBus();
    this.autoScaler = new AutoScaler();
    this.stallDetector = new StallDetector(this.taskRouter);
    this.modelRouter = new ModelRouter(this.tokenGateway);
    this.memory = new ApexMemorySystem(new VectorStore());
    this.scheduler = new Scheduler();
    this.reactor = new Reactor(this.eventBus);

    log.info('Engine initialized — all modules loaded');
  }

  /**
   * Start the orchestrator engine.
   */
  async start(): Promise<void> {
    if (this.running) {
      log.warn('Engine already running');
      return;
    }

    log.info('Starting APEX Orchestrator Engine...');

    // Start the event bus (Postgres LISTEN/NOTIFY)
    try {
      await this.eventBus.start();
    } catch (err) {
      log.error('Event bus failed to start — continuing without real-time events', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Get active companies for autoscaler
    const companies = await this.getActiveCompanyIds();

    // Start background subsystems
    this.autoScaler.start(companies);
    this.stallDetector.start();

    // Start routines engine (scheduler + reactor)
    this.scheduler.start();
    this.reactor.start();
    log.info('Routines engine started (scheduler + reactor)');

    // Start main tick loop
    const tickMs = Number(process.env.ORCHESTRATOR_TICK_MS) || 5000;
    this.tickHandle = setInterval(async () => {
      try {
        await this.tick();
      } catch (err) {
        log.error('Engine tick error', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }, tickMs);

    this.running = true;
    log.info('APEX Orchestrator Engine started', { tickMs });
  }

  /**
   * Stop the engine gracefully.
   */
  async stop(): Promise<void> {
    log.info('Stopping APEX Orchestrator Engine...');

    this.running = false;

    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }

    this.scheduler.stop();
    this.reactor.stop();
    this.autoScaler.stop();
    this.stallDetector.stop();
    await this.eventBus.stop();

    log.info('APEX Orchestrator Engine stopped');
  }

  /**
   * Main engine tick — runs every ORCHESTRATOR_TICK_MS.
   */
  private async tick(): Promise<void> {
    const companies = await this.getActiveCompanyIds();

    for (const companyId of companies) {
      await this.processCompany(companyId);
    }

    // Periodic memory garbage collection (every ~5 minutes)
    if (Math.random() < 0.017) { // ~1/60 ticks at 5s interval ≈ every 5 min
      await this.memory.garbageCollect();
    }
  }

  /**
   * Process one company: assign work to idle agents.
   */
  private async processCompany(companyId: string): Promise<void> {
    // Find idle agents for this company
    const { data: idleAgents } = await this.supabase
      .from('agents')
      .select('id, role')
      .eq('company_id', companyId)
      .eq('status', 'idle');

    if (!idleAgents || idleAgents.length === 0) return;

    for (const agent of idleAgents) {
      // Find the next available issue for this agent's role
      const issueId = await this.taskRouter.findNextIssue(agent.role, companyId);
      if (!issueId) continue;

      // Attempt to claim it
      const claimed = await this.taskRouter.claimIssue(agent.id, issueId);
      if (!claimed) continue;

      log.info('Agent assigned to issue', {
        agentId: agent.id,
        role: agent.role,
        issueId,
        companyId,
      });

      // The agent execution loop (heartbeat → work → handoff) will be
      // implemented in Phase 3 when we build the Base Agent class.
      // For now, the claim is recorded and the agent status is set to 'working'.
    }
  }

  /**
   * Get all active company IDs.
   */
  private async getActiveCompanyIds(): Promise<string[]> {
    const { data } = await this.supabase
      .from('companies')
      .select('id')
      .eq('status', 'active');

    return (data ?? []).map(c => c.id);
  }
}

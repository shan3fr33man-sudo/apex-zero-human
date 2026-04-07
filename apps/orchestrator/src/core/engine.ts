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
import { CeoPlanner } from '../routines/ceo-planner.js';
import { createAgent } from '../agents/registry.js';
import type { AgentConfig, Issue } from '../agents/types.js';

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
  readonly ceoPlanner: CeoPlanner;

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
    this.ceoPlanner = new CeoPlanner();

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
    this.ceoPlanner.start();
    log.info('Routines engine started (scheduler + reactor + ceoPlanner)');

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
    this.ceoPlanner.stop();
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
    // Load company context once for AgentConfig
    const { data: company } = await this.supabase
      .from('companies')
      .select('id, name, settings')
      .eq('id', companyId)
      .single();

    const companyName = (company?.name as string) ?? '';
    const companyGoal =
      ((company?.settings ?? {}) as Record<string, unknown>).goal as string | undefined ?? '';

    // Find idle agents for this company
    const { data: idleAgents } = await this.supabase
      .from('agents')
      .select('id, role, name, persona, model, reports_to, config')
      .eq('company_id', companyId)
      .eq('status', 'idle');

    if (!idleAgents || idleAgents.length === 0) return;

    const executions: Promise<void>[] = [];

    for (const agent of idleAgents) {
      const issueId = await this.taskRouter.findNextIssue(agent.role, companyId, agent.id);
      if (!issueId) continue;

      const claimed = await this.taskRouter.claimIssue(agent.id, issueId);
      if (!claimed) continue;

      log.info('Agent assigned to issue', {
        agentId: agent.id,
        role: agent.role,
        issueId,
        companyId,
      });

      const baseAgent = createAgent(agent.role, {
        tokenGateway: this.tokenGateway,
        heartbeat: this.heartbeat,
        taskRouter: this.taskRouter,
        modelRouter: this.modelRouter,
        memory: this.memory,
      });
      if (!baseAgent) {
        log.warn('No agent class registered for role', { role: agent.role, agentId: agent.id });
        continue;
      }

      // Load full issue row
      const { data: issueRow } = await this.supabase
        .from('issues')
        .select('*')
        .eq('id', issueId)
        .single();
      if (!issueRow) continue;

      const cfg = (agent as { config?: Record<string, unknown> }).config ?? {};
      const agentConfig: AgentConfig = {
        id: agent.id,
        company_id: companyId,
        company_name: companyName,
        company_goal: companyGoal,
        name: (agent as { name: string }).name,
        role: agent.role,
        persona: (agent as { persona: string | null }).persona ?? null,
        model_tier: (((cfg.model_tier as string) ?? 'TECHNICAL') as AgentConfig['model_tier']),
        reports_to: (agent as { reports_to: string | null }).reports_to ?? null,
        reports_to_name: (cfg.reports_to_name as string) ?? null,
        reports_to_role: (cfg.reports_to_role as string) ?? null,
        custom_rules: (cfg.custom_rules as string[]) ?? [],
        installed_skills: (cfg.installed_skills as string[]) ?? [],
        brand_guide: (cfg.brand_guide as string) ?? null,
      };

      // Fire-and-forget per-agent execution; failures don't block siblings
      executions.push(
        baseAgent
          .execute(agentConfig, issueRow as Issue)
          .then((result) => {
            log.info('Agent execution finished', {
              agentId: agent.id,
              issueId,
              success: result.success,
              tokens: result.tokensUsed,
            });
          })
          .catch((err) => {
            log.error('Agent execution threw', {
              agentId: agent.id,
              issueId,
              error: err instanceof Error ? err.message : String(err),
            });
          })
      );
    }

    if (executions.length > 0) {
      await Promise.all(executions);
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

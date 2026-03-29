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

      // Execute agent asynchronously — don't block the tick loop
      this.executeAgent(agent.id, issueId, companyId).catch(err => {
        log.error('Agent execution failed', {
          agentId: agent.id,
          issueId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
  }

  /**
   * Execute an agent on an issue through the full heartbeat cycle.
   * Loads the agent config, resolves the issue, and delegates to the
   * appropriate agent class based on role.
   */
  private async executeAgent(agentId: string, issueId: string, companyId: string): Promise<void> {
    // Load agent details
    const { data: agent } = await this.supabase
      .from('agents')
      .select('id, company_id, name, slug, role, persona, system_prompt, model, reports_to, heartbeat_checklist, config')
      .eq('id', agentId)
      .single();

    if (!agent) {
      log.error('Agent not found for execution', { agentId });
      return;
    }

    // Load company details
    const { data: company } = await this.supabase
      .from('companies')
      .select('id, name, description, brand')
      .eq('id', companyId)
      .single();

    if (!company) {
      log.error('Company not found for execution', { companyId });
      return;
    }

    // Load reporting chain
    let reportsToName: string | null = null;
    let reportsToRole: string | null = null;
    if (agent.reports_to) {
      const { data: manager } = await this.supabase
        .from('agents')
        .select('name, role')
        .eq('id', agent.reports_to)
        .single();
      if (manager) {
        reportsToName = manager.name;
        reportsToRole = manager.role;
      }
    }

    // Load issue
    const { data: issue } = await this.supabase
      .from('issues')
      .select('*')
      .eq('id', issueId)
      .single();

    if (!issue) {
      log.error('Issue not found for execution', { issueId });
      await this.taskRouter.releaseIssue(issueId);
      return;
    }

    // Build AgentConfig
    const agentConfig = {
      id: agent.id,
      company_id: agent.company_id,
      company_name: company.name,
      company_description: company.description ?? '',
      name: agent.name,
      slug: agent.slug,
      role: agent.role,
      persona: agent.persona,
      system_prompt: agent.system_prompt,
      model: agent.model,
      reports_to: agent.reports_to,
      reports_to_name: reportsToName,
      reports_to_role: reportsToRole,
      heartbeat_checklist: agent.heartbeat_checklist ?? {},
      config: agent.config ?? {},
      brand_guide: (company.brand as Record<string, unknown>)?.guide as string ?? null,
    };

    // Resolve agent class based on role
    const { resolveAgentForRole } = await import('../agents/role-resolver.js');
    const agentInstance = resolveAgentForRole(
      agent.role,
      this.heartbeat,
      this.tokenGateway,
      this.taskRouter,
      this.modelRouter,
      this.memory,
    );

    log.info('Executing agent heartbeat cycle', {
      agentId: agent.id,
      agentName: agent.name,
      role: agent.role,
      issueId: issue.id,
      issueTitle: issue.title,
    });

    try {
      const result = await agentInstance.execute(agentConfig, issue);

      if (result.success) {
        log.info('Agent execution completed successfully', {
          agentId: agent.id,
          issueId: issue.id,
          tokensUsed: result.tokensUsed,
        });

        // Record actual tokens on the issue
        await this.supabase
          .from('issues')
          .update({ actual_tokens: result.tokensUsed })
          .eq('id', issueId);

        // Record token spend
        await this.tokenGateway.recordUsage(companyId, agentId, issueId, {
          model: result.model,
          inputTokens: Math.floor(result.tokensUsed * 0.7), // estimate split
          outputTokens: Math.floor(result.tokensUsed * 0.3),
          costUsd: result.tokensUsed * 0.000003, // rough estimate
        });

        // Update agent token counter
        await this.tokenGateway.recordAgentUsage(agentId, result.tokensUsed);

        // Emit completion event
        await this.eventBus.emit(companyId, 'issue.completed', agentId, {
          issue_id: issueId,
          agent_id: agentId,
          tokens_used: result.tokensUsed,
        });
      } else {
        log.warn('Agent execution failed', {
          agentId: agent.id,
          issueId: issue.id,
          error: result.error,
        });
        await this.taskRouter.releaseIssue(issueId, 'open');
      }
    } catch (err) {
      log.error('Agent execution threw error', {
        agentId: agent.id,
        issueId: issue.id,
        error: err instanceof Error ? err.message : String(err),
      });
      await this.heartbeat.fail(agentId, issueId, err instanceof Error ? err.message : String(err));
      await this.taskRouter.releaseIssue(issueId, 'open');
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

/**
 * Module 5: AutoScaler
 *
 * Checks queue depth every 30 seconds (configurable via AUTOSCALER_TICK_MS).
 * Scales agent concurrency up/down automatically based on workload.
 *
 * Rules:
 * - If queue > 80% of current workers → scale up (if under max concurrency)
 * - If queue < 20% of current workers → scale down (if above minimum 1)
 * - Never exceed per-role max concurrency set in company settings
 */
import { getSupabaseAdmin } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('AutoScaler');

interface ScaleDecision {
  role: string;
  action: 'scale_up' | 'scale_down' | 'hold';
  currentWorkers: number;
  queueDepth: number;
  maxConcurrency: number;
}

export class AutoScaler {
  private supabase = getSupabaseAdmin();
  private activeWorkers: Map<string, number> = new Map();
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  /**
   * Start the autoscaler tick loop.
   */
  start(companies: string[]): void {
    const tickMs = Number(process.env.AUTOSCALER_TICK_MS) || 30000;
    log.info('AutoScaler started', { tickMs, companyCount: companies.length });

    this.intervalHandle = setInterval(async () => {
      for (const companyId of companies) {
        try {
          await this.tick(companyId);
        } catch (err) {
          log.error('AutoScaler tick error', {
            companyId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }, tickMs);
  }

  /**
   * Stop the autoscaler.
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      log.info('AutoScaler stopped');
    }
  }

  /**
   * Run one autoscaler tick for a company.
   * Evaluates each agent role and decides whether to scale up/down.
   */
  async tick(companyId: string): Promise<ScaleDecision[]> {
    const decisions: ScaleDecision[] = [];

    // Get all distinct roles with idle agents in this company
    const { data: agents } = await this.supabase
      .from('agents')
      .select('id, role, status')
      .eq('company_id', companyId)
      .neq('status', 'terminated');

    if (!agents || agents.length === 0) return decisions;

    // Group agents by role
    const roleMap = new Map<string, { total: number; working: number; idle: number }>();
    for (const agent of agents) {
      const current = roleMap.get(agent.role) ?? { total: 0, working: 0, idle: 0 };
      current.total++;
      if (agent.status === 'working') current.working++;
      if (agent.status === 'idle') current.idle++;
      roleMap.set(agent.role, current);
    }

    for (const [role, counts] of roleMap) {
      const queueDepth = await this.getQueueDepth(companyId);
      const maxConcurrency = await this.getMaxConcurrency(role, companyId);
      const currentWorkers = counts.working;

      let action: ScaleDecision['action'] = 'hold';

      if (queueDepth > currentWorkers * 0.8 && currentWorkers < maxConcurrency && counts.idle > 0) {
        action = 'scale_up';
        // Mark one idle agent as ready to pick up work
        await this.activateIdleAgent(role, companyId);
      } else if (queueDepth < currentWorkers * 0.2 && currentWorkers > 1) {
        action = 'scale_down';
        // Don't actually terminate — just let agents naturally go idle
      }

      const decision: ScaleDecision = {
        role,
        action,
        currentWorkers,
        queueDepth,
        maxConcurrency,
      };

      if (action !== 'hold') {
        log.info('Scale decision', {
          role: decision.role,
          action: decision.action,
          currentWorkers: decision.currentWorkers,
          queueDepth: decision.queueDepth,
          maxConcurrency: decision.maxConcurrency,
        });
      }

      decisions.push(decision);
      this.activeWorkers.set(role, currentWorkers);
    }

    return decisions;
  }

  /**
   * Get the number of open, unassigned issues for a company.
   */
  private async getQueueDepth(companyId: string): Promise<number> {
    const { count } = await this.supabase
      .from('issues')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'open')
      .is('locked_by', null);

    return count ?? 0;
  }

  /**
   * Get max concurrency for a role (from company settings or default).
   */
  private async getMaxConcurrency(role: string, companyId: string): Promise<number> {
    const { data } = await this.supabase
      .from('companies')
      .select('settings')
      .eq('id', companyId)
      .single();

    const settings = data?.settings as Record<string, unknown> | null;
    const concurrencyConfig = settings?.max_concurrency as Record<string, number> | undefined;

    return concurrencyConfig?.[role] ?? 3; // Default: 3 concurrent workers per role
  }

  /**
   * Activate one idle agent of the specified role.
   * The engine loop will then assign them work on the next tick.
   */
  private async activateIdleAgent(role: string, companyId: string): Promise<void> {
    const { data: idleAgent } = await this.supabase
      .from('agents')
      .select('id')
      .eq('company_id', companyId)
      .eq('role', role)
      .eq('status', 'idle')
      .limit(1)
      .single();

    if (idleAgent) {
      log.debug('Activated idle agent', { agentId: idleAgent.id, role });
    }
  }
}

/**
 * Module 1: Token Gateway
 * Build FIRST — every other module depends on it.
 *
 * Checks token budget before every LLM call. Deducts tokens after use.
 * If budget is exceeded, pauses the issue and alerts the operator via inbox.
 */
import { getSupabaseAdmin } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('TokenGateway');

export interface TokenCheckResult {
  allowed: boolean;
  remaining: number;
  reason?: string;
}

export interface TokenUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
}

export class TokenGateway {
  private supabase = getSupabaseAdmin();

  /**
   * Call this BEFORE every LLM API call.
   * Uses the atomic check_and_deduct_tokens RPC to prevent race conditions.
   */
  async checkBudget(companyId: string, estimatedTokens: number): Promise<TokenCheckResult> {
    log.debug('Checking budget', { companyId, estimatedTokens });

    const { data, error } = await this.supabase.rpc('check_and_deduct_tokens', {
      p_company_id: companyId,
      p_tokens_needed: estimatedTokens,
    });

    if (error) {
      log.error('Token gateway RPC error', { companyId, error: error.message });
      throw new Error(`Token gateway error: ${error.message}`);
    }

    if (!data) {
      log.warn('Budget exceeded', { companyId, estimatedTokens });
      await this.handleBudgetExceeded(companyId, estimatedTokens);
      return { allowed: false, remaining: 0, reason: 'BUDGET_EXCEEDED' };
    }

    // Fetch remaining budget for the response
    const remaining = await this.getRemaining(companyId);

    log.debug('Budget check passed', { companyId, remaining });
    return { allowed: true, remaining };
  }

  /**
   * Log token usage after a successful LLM call.
   * This is separate from the budget deduction — budget is pre-deducted,
   * this records the actual usage for analytics.
   */
  async recordUsage(
    companyId: string,
    agentId: string,
    issueId: string | null,
    usage: TokenUsage
  ): Promise<void> {
    const { error } = await this.supabase.from('token_spend_log').insert({
      company_id: companyId,
      agent_id: agentId,
      issue_id: issueId,
      model: usage.model,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      total_tokens: usage.inputTokens + usage.outputTokens,
      estimated_cost: usage.costUsd ?? null,
    });

    if (error) {
      log.error('Failed to record token usage', { companyId, agentId, error: error.message });
    }
  }

  /**
   * Get remaining token budget for a company.
   */
  async getRemaining(companyId: string): Promise<number> {
    const { data } = await this.supabase
      .from('companies')
      .select('token_budget, tokens_used')
      .eq('id', companyId)
      .single();

    if (!data) return 0;
    return Math.max(0, data.token_budget - data.tokens_used);
  }

  /**
   * Get budget utilization percentage.
   */
  async getUtilization(companyId: string): Promise<number> {
    const { data } = await this.supabase
      .from('companies')
      .select('token_budget, tokens_used')
      .eq('id', companyId)
      .single();

    if (!data || data.token_budget === 0) return 0;
    return (data.tokens_used / data.token_budget) * 100;
  }

  /**
   * Reset monthly token usage (called by scheduled routine at month start).
   */
  async resetMonthlyUsage(companyId: string): Promise<void> {
    log.info('Resetting monthly token usage', { companyId });

    const { error } = await this.supabase
      .from('companies')
      .update({ tokens_used: 0 })
      .eq('id', companyId);

    if (error) {
      log.error('Failed to reset monthly usage', { companyId, error: error.message });
    }
  }

  /**
   * Record agent-level token usage (increment tokens_used on agents table).
   */
  async recordAgentUsage(agentId: string, tokensUsed: number): Promise<void> {
    const { data: agent } = await this.supabase
      .from('agents')
      .select('tokens_used')
      .eq('id', agentId)
      .single();

    if (!agent) return;

    const { error } = await this.supabase
      .from('agents')
      .update({ tokens_used: (agent.tokens_used ?? 0) + tokensUsed })
      .eq('id', agentId);

    if (error) {
      log.warn('Failed to increment agent tokens', { agentId, error: error.message });
    }
  }

  /**
   * Pre-execution budget check with graduated alerts.
   * Returns whether the agent should proceed, and the urgency level.
   *
   * Budget thresholds:
   *   > 10% remaining  → proceed normally
   *   5-10% remaining  → proceed, but pause non-critical agents
   *   1-5% remaining   → proceed only for critical/high priority
   *   0% remaining     → reject, pause all agents
   */
  async preExecutionCheck(
    companyId: string,
    issueId: string,
    issuePriority: string,
    estimatedTokens: number,
  ): Promise<{ allowed: boolean; urgency: 'normal' | 'low_budget' | 'critical' | 'exhausted'; remaining: number }> {
    const utilization = await this.getUtilization(companyId);
    const remaining = await this.getRemaining(companyId);

    // 0% — reject everything
    if (remaining <= 0 || utilization >= 100) {
      await this.handleBudgetExceeded(companyId, estimatedTokens);
      return { allowed: false, urgency: 'exhausted', remaining: 0 };
    }

    // 1-5% — only critical/high priority
    if (utilization >= 95) {
      const isCritical = issuePriority === 'critical' || issuePriority === 'high';
      if (!isCritical) {
        log.warn('Budget critically low — rejecting non-critical issue', {
          companyId, issueId, utilization: Math.round(utilization),
        });
        return { allowed: false, urgency: 'critical', remaining };
      }
      // Alert once when crossing 95%
      await this.createThresholdAlert(companyId, 5, remaining);
      return { allowed: true, urgency: 'critical', remaining };
    }

    // 5-10% — alert, pause non-critical
    if (utilization >= 90) {
      await this.createThresholdAlert(companyId, 10, remaining);
      return { allowed: true, urgency: 'low_budget', remaining };
    }

    // > 10% — proceed normally
    return { allowed: true, urgency: 'normal', remaining };
  }

  /**
   * Estimate tokens needed for an issue based on complexity.
   */
  estimateTokensForIssue(priority: string, hasSubIssues: boolean): number {
    if (hasSubIssues) return 20000;   // Complex: CEO + team creation
    if (priority === 'critical' || priority === 'high') return 8000; // Moderate
    return 2000; // Simple
  }

  /**
   * Create a threshold alert in the inbox (deduplicated — only once per threshold per day).
   */
  private async createThresholdAlert(
    companyId: string,
    thresholdPercent: number,
    remaining: number,
  ): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const alertKey = `budget_threshold_${thresholdPercent}_${today}`;

    // Check if we already sent this alert today
    const { data: existing } = await this.supabase
      .from('inbox_items')
      .select('id')
      .eq('company_id', companyId)
      .eq('item_type', 'BUDGET_ALERT')
      .gte('created_at', `${today}T00:00:00Z`)
      .limit(1);

    if (existing && existing.length > 0) return; // Already alerted today

    await this.supabase.from('inbox_items').insert({
      company_id: companyId,
      item_type: 'BUDGET_ALERT',
      title: `Token budget at ${100 - thresholdPercent}% — ${remaining.toLocaleString()} tokens remaining`,
      body: thresholdPercent <= 5
        ? 'Your AI team is almost out of tokens. Only critical tasks will continue. Add more credits to keep your team running.'
        : 'Your AI team is running low on tokens. Consider adding more credits soon.',
      status: 'pending',
      priority: thresholdPercent <= 5 ? 'high' : 'medium',
      metadata: {
        threshold_percent: thresholdPercent,
        remaining_tokens: remaining,
        alert_key: alertKey,
      },
    });

    log.info('Budget threshold alert created', {
      companyId, thresholdPercent, remaining,
    });
  }

  /**
   * Handle budget exceeded — create inbox alert for operator.
   */
  private async handleBudgetExceeded(companyId: string, requested: number): Promise<void> {
    const { error } = await this.supabase.from('inbox_items').insert({
      company_id: companyId,
      item_type: 'BUDGET_ALERT',
      title: 'Token budget exceeded',
      description: `An agent requested ${requested.toLocaleString()} tokens but the monthly budget is exhausted. All agent work is paused until the budget is increased or reset.`,
      payload: {
        requested_tokens: requested,
        timestamp: new Date().toISOString(),
      },
    });

    if (error) {
      log.error('Failed to create budget alert inbox item', { companyId, error: error.message });
    }

    // Pause all active issues for this company
    await this.supabase
      .from('issues')
      .update({ status: 'blocked' })
      .eq('company_id', companyId)
      .eq('status', 'in_progress');

    log.warn('All in-progress issues paused due to budget exceeded', { companyId });
  }
}

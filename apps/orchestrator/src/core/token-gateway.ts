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

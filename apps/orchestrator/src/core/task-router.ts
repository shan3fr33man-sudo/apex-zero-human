/**
 * Module 3: Task Router
 *
 * Assigns issues to agents using Postgres advisory locks to prevent
 * two agents from claiming the same issue simultaneously.
 * Respects issue dependencies — blocked issues are skipped.
 */
import { getSupabaseAdmin } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('TaskRouter');

export interface ClaimResult {
  claimed: boolean;
  issueId: string;
  reason?: string;
}

export class TaskRouter {
  private supabase = getSupabaseAdmin();

  /**
   * Claim an issue using Postgres advisory lock.
   * Returns true if the agent successfully claimed the issue.
   * Returns false if the issue was already claimed or locked.
   */
  async claimIssue(agentId: string, issueId: string): Promise<boolean> {
    log.debug('Attempting to claim issue', { agentId, issueId });

    const { data, error } = await this.supabase.rpc('claim_issue', {
      p_issue_id: issueId,
      p_agent_id: agentId,
    });

    if (error) {
      log.error('Claim issue RPC error', { agentId, issueId, error: error.message });
      return false;
    }

    const claimed = data === true;

    if (claimed) {
      log.info('Issue claimed', { agentId, issueId });

      // Update agent status to working + set current issue
      await this.supabase
        .from('agents')
        .update({ status: 'working', current_issue_id: issueId })
        .eq('id', agentId);
    } else {
      log.debug('Issue claim failed (already taken)', { agentId, issueId });
    }

    return claimed;
  }

  /**
   * Find the next available issue for an agent based on their role.
   * Skips issues that are blocked by unfinished dependencies.
   * Returns the highest-priority unclaimed issue, or null if none available.
   */
  async findNextIssue(agentRole: string, companyId: string): Promise<string | null> {
    // Query for open, unblocked, unclaimed issues
    // We filter out issues that have unresolved dependencies in application code
    // because Supabase JS client doesn't support subquery NOT IN filters cleanly.
    const { data: candidates } = await this.supabase
      .from('issues')
      .select('id, priority')
      .eq('company_id', companyId)
      .eq('status', 'open')
      .is('locked_by', null)
      .order('priority', { ascending: false })
      .limit(20);

    if (!candidates || candidates.length === 0) return null;

    // Filter out issues with unresolved dependencies
    for (const candidate of candidates) {
      const isBlocked = await this.isBlocked(candidate.id);
      if (!isBlocked) {
        return candidate.id;
      }
    }

    return null;
  }

  /**
   * Release an issue lock — used when an agent finishes, fails, or is force-released.
   */
  async releaseIssue(issueId: string, newStatus: string = 'open'): Promise<void> {
    log.info('Releasing issue', { issueId, newStatus });

    const { data: issue } = await this.supabase
      .from('issues')
      .select('locked_by')
      .eq('id', issueId)
      .single();

    // Clear the agent's current_issue_id if they were working on this
    if (issue?.locked_by) {
      await this.supabase
        .from('agents')
        .update({ status: 'idle', current_issue_id: null })
        .eq('id', issue.locked_by);
    }

    await this.supabase
      .from('issues')
      .update({
        status: newStatus,
        locked_by: null,
        locked_at: null,
      })
      .eq('id', issueId);
  }

  /**
   * Force release a stuck lock (called by stall detector).
   * Also writes to audit_log for traceability.
   */
  async forceRelease(issueId: string, reason: string): Promise<void> {
    log.warn('Force releasing issue', { issueId, reason });

    // Get current state before modification for audit
    const { data: before } = await this.supabase
      .from('issues')
      .select('*')
      .eq('id', issueId)
      .single();

    await this.releaseIssue(issueId, 'open');

    // Write audit log entry — append only, service role insert
    if (before) {
      await this.supabase.from('audit_log').insert({
        company_id: before.company_id,
        agent_id: before.locked_by,
        action: 'FORCE_RELEASE',
        entity_type: 'issues',
        entity_id: issueId,
        before_state: before as Record<string, unknown>,
        after_state: { status: 'open', locked_by: null, locked_at: null },
        reversible: false,
      });
    }
  }

  /**
   * Complete an issue — mark as completed, release lock, update agent stats.
   */
  async completeIssue(issueId: string, qualityScore?: number): Promise<void> {
    log.info('Completing issue', { issueId, qualityScore });

    const { data: issue } = await this.supabase
      .from('issues')
      .select('locked_by, company_id, tokens_used')
      .eq('id', issueId)
      .single();

    if (!issue) return;

    // Update issue status
    await this.supabase
      .from('issues')
      .update({
        status: 'completed',
        locked_by: null,
        locked_at: null,
        quality_score: qualityScore ?? null,
      })
      .eq('id', issueId);

    // Update agent stats
    if (issue.locked_by) {
      // Increment tasks done, reset to idle
      const { data: agent } = await this.supabase
        .from('agents')
        .select('total_tasks_done, total_tokens_used')
        .eq('id', issue.locked_by)
        .single();

      if (agent) {
        await this.supabase
          .from('agents')
          .update({
            status: 'idle',
            current_issue_id: null,
            total_tasks_done: (agent.total_tasks_done ?? 0) + 1,
            total_tokens_used: (agent.total_tokens_used ?? 0) + (issue.tokens_used ?? 0),
          })
          .eq('id', issue.locked_by);
      }
    }
  }

  /**
   * Get queue depth for a specific role within a company.
   */
  async getQueueDepth(role: string, companyId: string): Promise<number> {
    const { count } = await this.supabase
      .from('issues')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'open')
      .is('locked_by', null);

    return count ?? 0;
  }

  /**
   * Check if an issue is blocked by unresolved dependencies.
   */
  private async isBlocked(issueId: string): Promise<boolean> {
    const { data: deps } = await this.supabase
      .from('issue_dependencies')
      .select('blocked_by_id')
      .eq('issue_id', issueId);

    if (!deps || deps.length === 0) return false;

    // Check if any blocking issue is not yet completed
    const blockerIds = deps.map(d => d.blocked_by_id);
    const { data: blockers } = await this.supabase
      .from('issues')
      .select('id, status')
      .in('id', blockerIds)
      .neq('status', 'completed');

    return (blockers?.length ?? 0) > 0;
  }
}

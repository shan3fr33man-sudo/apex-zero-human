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

      // Update agent status to working
      await this.supabase
        .from('agents')
        .update({ status: 'working' })
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
   *
   * QA agents also see 'in_review' issues (sent by non-QA agents for review).
   */
  async findNextIssue(agentRole: string, companyId: string): Promise<string | null> {
    // QA agents can pick up both open and in_review issues.
    // All other agents only see open issues.
    const statuses = (agentRole === 'qa' || agentRole === 'qa_engineer')
      ? ['open', 'in_review']
      : ['open'];

    const { data: candidates } = await this.supabase
      .from('issues')
      .select('id, priority')
      .eq('company_id', companyId)
      .in('status', statuses)
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

    // Reset agent to idle if they were working on this
    if (issue?.locked_by) {
      await this.supabase
        .from('agents')
        .update({ status: 'idle' })
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
   * Complete an issue — mark as done, release lock, update agent stats.
   * Call this BEFORE releaseIssue() so locked_by is still set for stat tracking.
   */
  async completeIssue(issueId: string, qualityScore?: number): Promise<void> {
    log.info('Completing issue', { issueId, qualityScore });

    const { data: issue } = await this.supabase
      .from('issues')
      .select('locked_by, company_id, actual_tokens, metadata')
      .eq('id', issueId)
      .single();

    if (!issue) return;

    const now = new Date().toISOString();

    // Merge quality_score into existing metadata (don't overwrite)
    const updatedMetadata = {
      ...((issue.metadata as Record<string, unknown>) ?? {}),
      ...(qualityScore != null ? { quality_score: qualityScore } : {}),
      completed_at_iso: now,
    };

    // Update issue status
    await this.supabase
      .from('issues')
      .update({
        status: 'done',
        locked_by: null,
        locked_at: null,
        completed_at: now,
        metadata: updatedMetadata,
      })
      .eq('id', issueId);

    // Update agent stats
    if (issue.locked_by) {
      const { data: agent } = await this.supabase
        .from('agents')
        .select('issues_completed, tokens_used')
        .eq('id', issue.locked_by)
        .single();

      if (agent) {
        await this.supabase
          .from('agents')
          .update({
            status: 'idle',
            issues_completed: (agent.issues_completed ?? 0) + 1,
            tokens_used: (agent.tokens_used ?? 0) + (issue.actual_tokens ?? 0),
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

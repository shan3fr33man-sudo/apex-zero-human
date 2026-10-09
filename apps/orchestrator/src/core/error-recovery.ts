/**
 * Self-Healing Error Recovery — 5-Level Recovery Hierarchy
 *
 * When an agent fails, the system automatically recovers without
 * surfacing technical errors to the operator.
 *
 * Recovery levels:
 *   L1: Retry (same agent, same issue, fresh context)
 *   L2: Reassign (different agent of same role, if available)
 *   L3: CEO Escalation (CEO creates recovery plan)
 *   L4: Model Fallback (switch from sonnet to haiku or vice versa)
 *   L5: Human Notification (inbox item with plain-English explanation)
 *
 * Circuit breakers:
 *   - Max 3 retries per issue per agent
 *   - Max $5 token spend per single issue
 *   - Repetition detector (same output 2x = escalate)
 *   - Stall timeout: 60min per heartbeat state (existing)
 */
import { getSupabaseAdmin } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('ErrorRecovery');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RETRIES_PER_AGENT = 3;
const MAX_TOKEN_SPEND_PER_ISSUE = 150000; // ~$5 worth at sonnet rates
const RETRY_BACKOFF_MS = [2000, 5000, 10000]; // 2s, 5s, 10s

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecoveryLevel = 'L1_RETRY' | 'L2_REASSIGN' | 'L3_CEO_ESCALATE' | 'L4_MODEL_FALLBACK' | 'L5_HUMAN_NOTIFY';

export interface RecoveryAction {
  level: RecoveryLevel;
  action: string;          // What the recovery system will do
  agentId: string | null;  // Which agent to use (null = create inbox item)
  issueId: string;
  delay: number;           // ms to wait before executing
  metadata: Record<string, unknown>;
}

export interface FailureContext {
  agentId: string;
  agentRole: string;
  issueId: string;
  companyId: string;
  error: string;
  tokensUsed: number;
}

// ---------------------------------------------------------------------------
// Retry Tracking (in-memory — resets on restart, which is fine)
// ---------------------------------------------------------------------------

const retryCounters = new Map<string, number>(); // key: `${agentId}:${issueId}`
const issueTokenSpend = new Map<string, number>(); // key: issueId

function getRetryKey(agentId: string, issueId: string): string {
  return `${agentId}:${issueId}`;
}

function getRetryCount(agentId: string, issueId: string): number {
  return retryCounters.get(getRetryKey(agentId, issueId)) ?? 0;
}

function incrementRetry(agentId: string, issueId: string): number {
  const key = getRetryKey(agentId, issueId);
  const count = (retryCounters.get(key) ?? 0) + 1;
  retryCounters.set(key, count);
  return count;
}

function trackTokenSpend(issueId: string, tokens: number): number {
  const total = (issueTokenSpend.get(issueId) ?? 0) + tokens;
  issueTokenSpend.set(issueId, total);
  return total;
}

/**
 * Clean up tracking data for completed issues.
 * Call this when an issue is successfully completed.
 */
export function clearIssueTracking(issueId: string): void {
  issueTokenSpend.delete(issueId);
  // Clean all retry counters for this issue
  for (const [key] of retryCounters) {
    if (key.endsWith(`:${issueId}`)) {
      retryCounters.delete(key);
    }
  }
}

// ---------------------------------------------------------------------------
// Recovery Decision Logic
// ---------------------------------------------------------------------------

/**
 * Determine the appropriate recovery action for a failure.
 */
export async function determineRecovery(ctx: FailureContext): Promise<RecoveryAction> {
  const { agentId, agentRole, issueId, companyId, error, tokensUsed } = ctx;
  const supabase = getSupabaseAdmin();

  // Track token spend
  const totalSpend = trackTokenSpend(issueId, tokensUsed);

  // Circuit breaker: token budget exceeded
  if (totalSpend > MAX_TOKEN_SPEND_PER_ISSUE) {
    log.warn('Token budget exceeded for issue', { issueId, totalSpend });
    return {
      level: 'L5_HUMAN_NOTIFY',
      action: 'Token budget exceeded for this task. Pausing and notifying operator.',
      agentId: null,
      issueId,
      delay: 0,
      metadata: { reason: 'token_budget_exceeded', total_spend: totalSpend },
    };
  }

  // L1: Retry with same agent (if under retry limit)
  const retryCount = getRetryCount(agentId, issueId);
  if (retryCount < MAX_RETRIES_PER_AGENT) {
    const newCount = incrementRetry(agentId, issueId);
    const delay = RETRY_BACKOFF_MS[Math.min(newCount - 1, RETRY_BACKOFF_MS.length - 1)];

    log.info('L1: Retry same agent', {
      agentId, issueId, retryCount: newCount, delay,
    });

    return {
      level: 'L1_RETRY',
      action: `Retrying with same agent (attempt ${newCount}/${MAX_RETRIES_PER_AGENT})`,
      agentId,
      issueId,
      delay,
      metadata: { retry_count: newCount, error_summary: error.substring(0, 200) },
    };
  }

  // L2: Reassign to different agent of same role
  const { data: alternateAgents } = await supabase
    .from('agents')
    .select('id')
    .eq('company_id', companyId)
    .eq('role', agentRole)
    .neq('id', agentId)
    .eq('status', 'idle');

  if (alternateAgents && alternateAgents.length > 0) {
    const altAgent = alternateAgents[0] as { id: string };
    log.info('L2: Reassign to alternate agent', {
      originalAgent: agentId,
      newAgent: altAgent.id,
      issueId,
    });

    return {
      level: 'L2_REASSIGN',
      action: 'Reassigning to another agent with the same role',
      agentId: altAgent.id,
      issueId,
      delay: 1000,
      metadata: { original_agent: agentId, reason: 'max_retries_exceeded' },
    };
  }

  // L3: Escalate to CEO
  const { data: ceoAgent } = await supabase
    .from('agents')
    .select('id')
    .eq('company_id', companyId)
    .eq('role', 'ceo')
    .maybeSingle();

  if (ceoAgent && (ceoAgent as { id: string }).id !== agentId) {
    log.info('L3: Escalate to CEO', { issueId, agentId });

    return {
      level: 'L3_CEO_ESCALATE',
      action: 'Escalating to CEO for recovery plan',
      agentId: (ceoAgent as { id: string }).id,
      issueId,
      delay: 2000,
      metadata: {
        original_agent: agentId,
        original_role: agentRole,
        error_summary: error.substring(0, 500),
        recovery_instruction: 'A task failed after multiple retries. Create a recovery plan or break this into simpler sub-tasks.',
      },
    };
  }

  // L5: Human notification (L4 model fallback handled at execution time)
  log.warn('L5: Human notification — all recovery levels exhausted', {
    issueId, agentId, companyId,
  });

  return {
    level: 'L5_HUMAN_NOTIFY',
    action: 'All automated recovery failed. Notifying operator.',
    agentId: null,
    issueId,
    delay: 0,
    metadata: {
      original_agent: agentId,
      original_role: agentRole,
      error_summary: error.substring(0, 500),
      retries_exhausted: true,
    },
  };
}

// ---------------------------------------------------------------------------
// Recovery Execution
// ---------------------------------------------------------------------------

/**
 * Execute a recovery action.
 */
export async function executeRecovery(action: RecoveryAction): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Wait for backoff delay
  if (action.delay > 0) {
    await new Promise(resolve => setTimeout(resolve, action.delay));
  }

  switch (action.level) {
    case 'L1_RETRY': {
      // Reset issue to open so the engine picks it up on next tick
      await supabase
        .from('issues')
        .update({
          status: 'open',
          locked_by: null,
          locked_at: null,
          metadata: {
            recovery_level: 'L1_RETRY',
            retry_count: action.metadata.retry_count,
            last_error: action.metadata.error_summary,
          },
        })
        .eq('id', action.issueId);

      // Reset agent to idle
      if (action.agentId) {
        await supabase
          .from('agents')
          .update({ status: 'idle' })
          .eq('id', action.agentId);
      }

      log.info('L1 recovery executed — issue reset for retry', {
        issueId: action.issueId,
      });
      break;
    }

    case 'L2_REASSIGN': {
      // Reassign issue to alternate agent
      await supabase
        .from('issues')
        .update({
          status: 'open',
          assigned_to: action.agentId,
          locked_by: null,
          locked_at: null,
          metadata: {
            recovery_level: 'L2_REASSIGN',
            original_agent: action.metadata.original_agent,
          },
        })
        .eq('id', action.issueId);

      // Reset original agent to idle
      if (action.metadata.original_agent) {
        await supabase
          .from('agents')
          .update({ status: 'idle' })
          .eq('id', action.metadata.original_agent as string);
      }

      log.info('L2 recovery executed — issue reassigned', {
        issueId: action.issueId,
        newAgent: action.agentId,
      });
      break;
    }

    case 'L3_CEO_ESCALATE': {
      // Create a recovery issue for the CEO
      const { data: originalIssue } = await supabase
        .from('issues')
        .select('title, description')
        .eq('id', action.issueId)
        .single();

      const title = (originalIssue as { title: string } | null)?.title || 'Unknown task';

      await supabase.from('issues').insert({
        company_id: (await supabase
          .from('issues')
          .select('company_id')
          .eq('id', action.issueId)
          .single()).data?.company_id,
        title: `Recovery needed: ${title}`,
        description: `## Automated Recovery — CEO Action Required

A task failed after multiple retry attempts and needs your intervention.

**Original task:** ${title}
**Failed agent role:** ${action.metadata.original_role}
**Error:** ${action.metadata.error_summary}

## Your Options
1. Break this into simpler sub-tasks that individual agents can handle
2. Reassign to a different agent with different instructions
3. Mark as blocked and notify the operator

Take the approach most likely to succeed.`,
        status: 'open',
        priority: 'high',
        type: 'task',
        assigned_to: action.agentId,
        parent_id: action.issueId,
        metadata: {
          source: 'error_recovery',
          recovery_level: 'L3_CEO_ESCALATE',
          original_issue: action.issueId,
        },
      });

      // Mark original issue as blocked
      await supabase
        .from('issues')
        .update({ status: 'blocked', locked_by: null, locked_at: null })
        .eq('id', action.issueId);

      log.info('L3 recovery executed — CEO escalation issue created', {
        issueId: action.issueId,
      });
      break;
    }

    case 'L5_HUMAN_NOTIFY': {
      // Create inbox item for the operator
      const { data: issue } = await supabase
        .from('issues')
        .select('title, company_id')
        .eq('id', action.issueId)
        .single();

      const companyId = (issue as { company_id: string } | null)?.company_id;
      const issueTitle = (issue as { title: string } | null)?.title || 'a task';

      if (companyId) {
        await supabase.from('inbox_items').insert({
          company_id: companyId,
          item_type: 'SYSTEM_ALERT',
          title: `Task needs attention: ${issueTitle}`,
          body: `Your AI team tried to complete "${issueTitle}" but ran into an issue it couldn't resolve automatically. You may want to simplify the request or provide more context.`,
          status: 'pending',
          priority: 'high',
          metadata: {
            source: 'error_recovery',
            recovery_level: 'L5_HUMAN_NOTIFY',
            issue_id: action.issueId,
            error_summary: action.metadata.error_summary,
          },
        });
      }

      // Mark issue as needing human review
      await supabase
        .from('issues')
        .update({ status: 'human_review_required', locked_by: null, locked_at: null })
        .eq('id', action.issueId);

      log.info('L5 recovery executed — human notified via inbox', {
        issueId: action.issueId,
      });
      break;
    }
  }

  // Audit log entry
  const { data: issueData } = await supabase
    .from('issues')
    .select('company_id')
    .eq('id', action.issueId)
    .single();

  if (issueData) {
    await supabase.from('audit_log').insert({
      company_id: (issueData as { company_id: string }).company_id,
      action: 'error_recovery',
      details: {
        level: action.level,
        action_taken: action.action,
        issue_id: action.issueId,
        agent_id: action.agentId,
        metadata: action.metadata,
      },
    });
  }
}

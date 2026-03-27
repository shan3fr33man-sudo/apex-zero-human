/**
 * Module 6: Stall Detector + Escalation
 *
 * Runs every 5 minutes (configurable via STALL_CHECK_MS).
 * Catches agents that have stopped progressing on their assigned issues.
 *
 * Two thresholds:
 * - 1x stall_threshold_minutes → escalate to inbox (human review)
 * - 2x stall_threshold_minutes → force release the issue lock
 */
import { getSupabaseAdmin } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import { TaskRouter } from '../core/task-router.js';

const log = createLogger('StallDetector');

interface StalledIssue {
  id: string;
  company_id: string;
  assigned_to: string | null;
  stall_threshold_minutes: number;
  title: string;
  updated_at: string;
}

export class StallDetector {
  private supabase = getSupabaseAdmin();
  private taskRouter: TaskRouter;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(taskRouter: TaskRouter) {
    this.taskRouter = taskRouter;
  }

  /**
   * Start the stall detection loop.
   */
  start(): void {
    const intervalMs = Number(process.env.STALL_CHECK_MS) || 300000;
    log.info('Stall detector started', { intervalMs });

    this.intervalHandle = setInterval(async () => {
      try {
        await this.check();
      } catch (err) {
        log.error('Stall check error', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }, intervalMs);
  }

  /**
   * Stop the stall detector.
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      log.info('Stall detector stopped');
    }
  }

  /**
   * Run a single stall check across all in-progress issues.
   */
  async check(): Promise<void> {
    // Find all in-progress issues that haven't been updated recently
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data: candidates } = await this.supabase
      .from('issues')
      .select('id, company_id, assigned_to, stall_threshold_minutes, title, updated_at')
      .eq('status', 'in_progress')
      .lt('updated_at', fiveMinutesAgo);

    if (!candidates || candidates.length === 0) return;

    for (const issue of candidates as StalledIssue[]) {
      const stallThresholdMs = (issue.stall_threshold_minutes ?? 60) * 60 * 1000;
      const timeSinceUpdate = Date.now() - new Date(issue.updated_at).getTime();

      if (timeSinceUpdate > stallThresholdMs * 2) {
        // Double threshold — force release
        await this.forceRelease(issue);
      } else if (timeSinceUpdate > stallThresholdMs) {
        // Single threshold — escalate to inbox
        await this.escalate(issue);
      }
    }
  }

  /**
   * Escalate a stalled issue — notify operator via inbox and mark for human review.
   */
  private async escalate(issue: StalledIssue): Promise<void> {
    const stalledMinutes = Math.round(
      (Date.now() - new Date(issue.updated_at).getTime()) / 60000
    );

    log.warn('Issue stalled, escalating', {
      issueId: issue.id,
      companyId: issue.company_id,
      agentId: issue.assigned_to,
      stalledMinutes,
    });

    // Create inbox alert
    await this.supabase.from('inbox_items').insert({
      company_id: issue.company_id,
      item_type: 'STALL_ALERT',
      title: `Agent stalled on: ${issue.title}`,
      description: `Issue has not progressed for ${stalledMinutes} minutes (threshold: ${issue.stall_threshold_minutes}min). The agent may be stuck or waiting on a dependency.`,
      payload: {
        issue_id: issue.id,
        agent_id: issue.assigned_to,
        stalled_minutes: stalledMinutes,
        threshold_minutes: issue.stall_threshold_minutes,
      },
    });

    // Mark issue as needing human review
    await this.supabase
      .from('issues')
      .update({ status: 'human_review_required' })
      .eq('id', issue.id);

    // Mark agent as stalled
    if (issue.assigned_to) {
      await this.supabase
        .from('agents')
        .update({ status: 'stalled' })
        .eq('id', issue.assigned_to);
    }
  }

  /**
   * Force release a stuck issue — happens at 2x the stall threshold.
   */
  private async forceRelease(issue: StalledIssue): Promise<void> {
    const stalledMinutes = Math.round(
      (Date.now() - new Date(issue.updated_at).getTime()) / 60000
    );

    log.error('Issue force-released', {
      issueId: issue.id,
      companyId: issue.company_id,
      agentId: issue.assigned_to,
      stalledMinutes,
    });

    await this.taskRouter.forceRelease(
      issue.id,
      `Force released after ${stalledMinutes} minutes of inactivity (2x threshold of ${issue.stall_threshold_minutes}min)`
    );

    // Create a more urgent inbox alert
    await this.supabase.from('inbox_items').insert({
      company_id: issue.company_id,
      item_type: 'STALL_ALERT',
      title: `FORCE RELEASED: ${issue.title}`,
      description: `Issue was force-released after ${stalledMinutes} minutes of inactivity (2x the ${issue.stall_threshold_minutes}min threshold). The issue is now back in the open queue for reassignment.`,
      payload: {
        issue_id: issue.id,
        agent_id: issue.assigned_to,
        stalled_minutes: stalledMinutes,
        action: 'force_released',
      },
    });
  }
}

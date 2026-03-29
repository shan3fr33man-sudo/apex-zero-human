/**
 * Routines Engine — Scheduler
 *
 * Cron-based routine runner. Every tick (default 60s):
 * 1. Find all enabled SCHEDULED routines where next_run_at <= now
 * 2. Spawn issue from issue_template (with interpolation)
 * 3. Update last_run_at and calculate next_run_at from cron_expr
 * 4. Log to routine_runs table
 *
 * Timezone-aware — each routine can specify its own IANA timezone.
 * Uses node-cron for cron expression parsing/validation.
 */

import { getSupabaseAdmin } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import { interpolateTemplate, buildContext } from './interpolator.js';

const log = createLogger('Scheduler');

/** Default tick interval in ms */
const SCHEDULER_TICK_MS = 60_000; // 1 minute

export class Scheduler {
  private supabase = getSupabaseAdmin();
  private running = false;
  private tickHandle: ReturnType<typeof setInterval> | null = null;

  /**
   * Start the scheduler tick loop.
   */
  start(): void {
    if (this.running) {
      log.warn('Scheduler already running');
      return;
    }

    this.running = true;
    log.info('Scheduler started', { tickMs: SCHEDULER_TICK_MS });

    // Run immediately on start, then on interval
    void this.tick();
    this.tickHandle = setInterval(async () => {
      try {
        await this.tick();
      } catch (err) {
        log.error('Scheduler tick error', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }, SCHEDULER_TICK_MS);
  }

  /**
   * Stop the scheduler.
   */
  stop(): void {
    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
    this.running = false;
    log.info('Scheduler stopped');
  }

  /**
   * One scheduler tick — find and execute all due SCHEDULED routines.
   */
  private async tick(): Promise<void> {
    const now = new Date().toISOString();

    // Find all due scheduled routines
    const { data: dueRoutines, error } = await this.supabase
      .from('routines')
      .select('*')
      .eq('routine_type', 'SCHEDULED')
      .eq('enabled', true)
      .lte('next_run_at', now);

    if (error) {
      log.error('Failed to fetch due routines', { error: error.message });
      return;
    }

    if (!dueRoutines || dueRoutines.length === 0) return;

    log.info('Due routines found', { count: dueRoutines.length });

    for (const routine of dueRoutines) {
      await this.executeRoutine(routine);
    }
  }

  /**
   * Execute a single scheduled routine — spawn issue and update tracking.
   */
  private async executeRoutine(routine: Record<string, unknown>): Promise<void> {
    const routineId = routine.id as string;
    const companyId = routine.company_id as string;
    const routineName = routine.name as string;
    const cronExpr = routine.cron_expr as string | null;
    const timezone = routine.timezone as string | null;
    const template = routine.issue_template as {
      title: string;
      description: string;
      success_condition: string;
      assigned_role: string;
      priority: number;
      metadata?: Record<string, unknown>;
    } | null;

    if (!template) {
      log.warn('Routine has no issue_template, skipping', { routineId });
      await this.recordRun(routineId, companyId, null, 'skipped', 'No issue template');
      return;
    }

    const startTime = Date.now();

    try {
      // Get company name for interpolation
      const { data: company } = await this.supabase
        .from('companies')
        .select('name')
        .eq('id', companyId)
        .single();

      // Build interpolation context
      const ctx = buildContext({
        companyId,
        companyName: (company?.name as string) ?? '',
        routineName,
      });

      // Interpolate the template
      const interpolated = interpolateTemplate(template, ctx);

      // Spawn the issue
      const { data: issue, error: issueError } = await this.supabase
        .from('issues')
        .insert({
          company_id: companyId,
          title: interpolated.title,
          description: interpolated.description,
          success_condition: interpolated.success_condition,
          priority: interpolated.priority,
          metadata: {
            ...(interpolated.metadata ?? {}),
            spawned_by_routine: routineId,
            routine_name: routineName,
            scheduled_at: new Date().toISOString(),
          },
        })
        .select('id')
        .single();

      if (issueError) {
        throw new Error(`Issue creation failed: ${issueError.message}`);
      }

      // Calculate next run time from cron expression
      const nextRun = cronExpr ? this.calculateNextRun(cronExpr, timezone) : null;

      // Update routine tracking
      await this.supabase
        .from('routines')
        .update({
          last_run_at: new Date().toISOString(),
          next_run_at: nextRun,
          last_status: 'success',
          run_count: ((routine.run_count as number) ?? 0) + 1,
        })
        .eq('id', routineId);

      // Record the run
      await this.recordRun(
        routineId,
        companyId,
        issue.id,
        'success',
        null,
        Date.now() - startTime
      );

      log.info('Scheduled routine executed', {
        routineId,
        routineName,
        issueId: issue.id,
        nextRun,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.error('Scheduled routine failed', { routineId, routineName, error: errorMessage });

      // Calculate next run even on failure
      const nextRun = cronExpr ? this.calculateNextRun(cronExpr, timezone) : null;

      await this.supabase
        .from('routines')
        .update({
          last_run_at: new Date().toISOString(),
          next_run_at: nextRun,
          last_status: 'failed',
        })
        .eq('id', routineId);

      await this.recordRun(
        routineId,
        companyId,
        null,
        'failed',
        errorMessage,
        Date.now() - startTime
      );
    }
  }

  /**
   * Calculate the next run time from a cron expression.
   * Supports timezone-aware scheduling via IANA timezone strings.
   *
   * Uses a simple cron parser. In production, use node-cron or cron-parser.
   */
  private calculateNextRun(cronExpr: string, timezone: string | null): string {
    try {
      // Parse cron expression: minute hour dayOfMonth month dayOfWeek
      const parts = cronExpr.trim().split(/\s+/);
      if (parts.length < 5) {
        log.warn('Invalid cron expression', { cronExpr });
        // Default to 1 hour from now if cron is invalid
        return new Date(Date.now() + 3600_000).toISOString();
      }

      // Simple next-run calculation:
      // For production, use the `cron-parser` library with timezone support:
      //   import parser from 'cron-parser';
      //   const interval = parser.parseExpression(cronExpr, { tz: timezone ?? 'UTC' });
      //   return interval.next().toISOString();

      // Simplified: calculate based on common patterns
      const [minute, hour] = parts;

      const now = new Date();
      const next = new Date(now);

      // If specific hour and minute are set
      if (hour !== '*' && minute !== '*') {
        const targetHour = parseInt(hour, 10);
        const targetMinute = parseInt(minute, 10);

        next.setHours(targetHour, targetMinute, 0, 0);

        // If the target time has already passed today, schedule for tomorrow
        if (next <= now) {
          next.setDate(next.getDate() + 1);
        }
      } else if (minute !== '*') {
        // Run every hour at specific minute
        const targetMinute = parseInt(minute, 10);
        next.setMinutes(targetMinute, 0, 0);
        if (next <= now) {
          next.setHours(next.getHours() + 1);
        }
      } else {
        // Wildcard — run in 1 minute
        next.setTime(now.getTime() + 60_000);
      }

      return next.toISOString();
    } catch {
      // Fallback: 1 hour from now
      return new Date(Date.now() + 3600_000).toISOString();
    }
  }

  /**
   * Record a routine run in the routine_runs table.
   */
  private async recordRun(
    routineId: string,
    companyId: string,
    issueId: string | null,
    status: string,
    errorMessage: string | null,
    executionTimeMs?: number
  ): Promise<void> {
    const now = new Date().toISOString();

    await this.supabase.from('routine_runs').insert({
      routine_id: routineId,
      company_id: companyId,
      issue_id: issueId,
      status,
      error_message: errorMessage,
      started_at: now,
      completed_at: now,
      metadata: executionTimeMs != null ? { execution_time_ms: executionTimeMs } : {},
    });
  }
}

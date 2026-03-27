/**
 * Routines Engine — Reactor
 *
 * Event-triggered routine engine. Listens to the Event Bus.
 * For each incoming event:
 * 1. Find all REACTIVE routines matching event_pattern for that company
 * 2. Spawn issue immediately from issue_template with event payload interpolated
 * 3. Log to routine_runs
 *
 * The Reactor registers itself as an EventBus handler. It does NOT poll —
 * events arrive in real-time via Postgres LISTEN/NOTIFY.
 */

import { getSupabaseAdmin } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import { EventBus, type ApexEvent } from '../core/event-bus.js';
import { interpolateTemplate, buildContext } from './interpolator.js';

const log = createLogger('Reactor');

export class Reactor {
  private supabase = getSupabaseAdmin();
  private eventBus: EventBus;
  private running = false;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Start the reactor — register wildcard handler on the event bus.
   */
  start(): void {
    if (this.running) {
      log.warn('Reactor already running');
      return;
    }

    // Register a wildcard handler to catch ALL events
    this.eventBus.on('*', async (event: ApexEvent) => {
      try {
        await this.handleEvent(event);
      } catch (err) {
        log.error('Reactor event handling failed', {
          eventType: event.event_type,
          companyId: event.company_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    this.running = true;
    log.info('Reactor started — listening for all events');
  }

  /**
   * Stop the reactor. The event bus handler remains registered but the
   * reactor flag prevents processing.
   */
  stop(): void {
    this.running = false;
    log.info('Reactor stopped');
  }

  /**
   * Handle an incoming event — find matching REACTIVE routines and spawn issues.
   */
  private async handleEvent(event: ApexEvent): Promise<void> {
    if (!this.running) return;

    // Find all enabled REACTIVE routines for this company
    const { data: routines, error } = await this.supabase
      .from('routines')
      .select('*')
      .eq('company_id', event.company_id)
      .eq('routine_type', 'REACTIVE')
      .eq('enabled', true);

    if (error) {
      log.error('Failed to fetch reactive routines', { error: error.message });
      return;
    }

    if (!routines || routines.length === 0) return;

    // Filter routines whose event_pattern matches this event
    const matching = routines.filter((routine) => {
      const pattern = routine.event_pattern as string | null;
      if (!pattern) return false;
      return this.matchesPattern(event.event_type, pattern);
    });

    if (matching.length === 0) return;

    log.info('Reactive routines matched', {
      eventType: event.event_type,
      companyId: event.company_id,
      matchCount: matching.length,
    });

    for (const routine of matching) {
      await this.executeRoutine(routine, event);
    }
  }

  /**
   * Execute a single reactive routine — spawn issue with event data interpolated.
   */
  private async executeRoutine(
    routine: Record<string, unknown>,
    event: ApexEvent
  ): Promise<void> {
    const routineId = routine.id as string;
    const companyId = event.company_id;
    const routineName = routine.name as string;
    const template = routine.issue_template as {
      title: string;
      description: string;
      success_condition: string;
      assigned_role: string;
      priority: number;
      metadata?: Record<string, unknown>;
    } | null;

    if (!template) {
      log.warn('Reactive routine has no issue_template, skipping', { routineId });
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

      // Build interpolation context with event data
      const ctx = buildContext({
        companyId,
        companyName: (company?.name as string) ?? '',
        routineName,
        event: {
          event_type: event.event_type,
          payload: event.payload,
        },
      });

      // Interpolate the template with event data
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
            triggered_by_event: event.id,
            event_type: event.event_type,
            event_payload: event.payload,
          },
        })
        .select('id')
        .single();

      if (issueError) {
        throw new Error(`Issue creation failed: ${issueError.message}`);
      }

      // Update routine tracking
      await this.supabase
        .from('routines')
        .update({
          last_run_at: new Date().toISOString(),
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

      log.info('Reactive routine executed', {
        routineId,
        routineName,
        eventType: event.event_type,
        issueId: issue.id,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.error('Reactive routine failed', { routineId, routineName, error: errorMessage });

      await this.supabase
        .from('routines')
        .update({
          last_run_at: new Date().toISOString(),
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
   * Simple wildcard pattern matching.
   * 'missed_*' matches 'missed_call', 'missed_sms', etc.
   * '*' matches everything.
   */
  private matchesPattern(eventType: string, pattern: string): boolean {
    if (pattern === '*') return true;
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(eventType);
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

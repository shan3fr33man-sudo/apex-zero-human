/**
 * Module 4: Event Bus
 *
 * Uses Postgres LISTEN/NOTIFY for real-time event processing.
 * Events are fired by skills, webhooks, and agents.
 * Reactive routines subscribe to event patterns and auto-create issues.
 *
 * Uses raw `pg` client for LISTEN — Supabase JS client doesn't support it.
 */
import { Client as PgClient } from 'pg';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('EventBus');

export interface ApexEvent {
  id: string;
  company_id: string;
  event_type: string;
  payload: Record<string, unknown>;
}

type EventHandler = (event: ApexEvent) => Promise<void>;

export class EventBus {
  private supabase = getSupabaseAdmin();
  private pgClient: PgClient | null = null;
  private handlers: Map<string, EventHandler[]> = new Map();
  private connected = false;

  /**
   * Start listening for Postgres NOTIFY events on the apex_events channel.
   */
  async start(): Promise<void> {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('[EventBus] Missing DATABASE_URL — required for LISTEN/NOTIFY');
    }

    this.pgClient = new PgClient({ connectionString });

    try {
      await this.pgClient.connect();
      this.connected = true;
      log.info('Connected to Postgres for LISTEN/NOTIFY');

      // Listen on both channels
      await this.pgClient.query('LISTEN apex_events');
      await this.pgClient.query('LISTEN apex_inbox');

      this.pgClient.on('notification', async (msg) => {
        if (!msg.payload) return;

        try {
          const event = JSON.parse(msg.payload) as ApexEvent;
          log.debug('Event received', { channel: msg.channel, eventType: event.event_type });

          if (msg.channel === 'apex_events') {
            await this.routeEvent(event);
          }
        } catch (err) {
          log.error('Failed to process notification', {
            channel: msg.channel ?? 'unknown',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });

      this.pgClient.on('error', (err) => {
        log.error('Postgres client error', { error: err.message });
        this.connected = false;
        // Delegate to reconnect() which handles its own backoff timing.
        // Don't wrap in setTimeout here — reconnect() manages delays internally.
        this.reconnect();
      });

    } catch (err) {
      log.error('Failed to connect to Postgres', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /**
   * Emit an event — inserts into the events table.
   * The table trigger will fire pg_notify, which this bus will receive.
   */
  async emit(companyId: string, eventType: string, sourceAgentId: string | null, payload: Record<string, unknown>): Promise<string> {
    const { data, error } = await this.supabase
      .from('events')
      .insert({
        company_id: companyId,
        event_type: eventType,
        source_agent_id: sourceAgentId,
        payload,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error) {
      log.error('Failed to emit event', { companyId, eventType, error: error.message });
      throw new Error(`Event emit failed: ${error.message}`);
    }

    log.info('Event emitted', { eventId: data.id, companyId, eventType, sourceAgentId });
    return data.id;
  }

  /**
   * Register a handler for a specific event pattern.
   * Patterns support wildcards: 'missed_*' matches 'missed_call', 'missed_sms', etc.
   */
  on(pattern: string, handler: EventHandler): void {
    const existing = this.handlers.get(pattern) ?? [];
    existing.push(handler);
    this.handlers.set(pattern, existing);
    log.debug('Handler registered', { pattern });
  }

  /**
   * Stop the event bus and close the Postgres connection.
   */
  async stop(): Promise<void> {
    if (this.pgClient && this.connected) {
      await this.pgClient.end();
      this.connected = false;
      log.info('Event bus stopped');
    }
  }

  /**
   * Route an event to matching reactive routines and registered handlers.
   */
  private async routeEvent(event: ApexEvent): Promise<void> {
    // 1. Find reactive routines matching this event type
    const { data: routines } = await this.supabase
      .from('routines')
      .select('*')
      .eq('company_id', event.company_id)
      .eq('routine_type', 'REACTIVE')
      .eq('enabled', true);

    for (const routine of routines ?? []) {
      if (routine.event_pattern && this.matchesPattern(event.event_type, routine.event_pattern)) {
        log.info('Routine triggered', {
          routineId: routine.id,
          routineName: routine.name,
          eventType: event.event_type,
        });
        await this.spawnIssueFromRoutine(routine, event);
      }
    }

    // 2. Call registered in-memory handlers
    for (const [pattern, handlers] of this.handlers) {
      if (this.matchesPattern(event.event_type, pattern)) {
        for (const handler of handlers) {
          try {
            await handler(event);
          } catch (err) {
            log.error('Handler error', {
              pattern,
              eventType: event.event_type,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    }

    // 3. Mark event as processed
    await this.supabase
      .from('events')
      .update({ status: 'processed', processed_at: new Date().toISOString() })
      .eq('id', event.id);
  }

  /**
   * Create an issue from a reactive routine template.
   */
  private async spawnIssueFromRoutine(
    routine: Record<string, unknown>,
    event: ApexEvent
  ): Promise<void> {
    const template = routine.issue_template as Record<string, unknown> | undefined;
    if (!template) return;

    const { data: issue, error } = await this.supabase
      .from('issues')
      .insert({
        company_id: event.company_id,
        title: (template.title as string) ?? `Auto: ${event.event_type}`,
        description: (template.description as string) ?? JSON.stringify(event.payload),
        priority: (template.priority as string) ?? 'medium',
        type: 'task',
        metadata: { triggered_by_event: event.id, routine_id: routine.id, event_payload: event.payload },
      })
      .select('id')
      .single();

    if (error) {
      log.error('Failed to spawn issue from routine', {
        routineId: routine.id as string,
        error: error.message,
      });
      return;
    }

    // Update routine stats
    await this.supabase
      .from('routines')
      .update({
        last_run_at: new Date().toISOString(),
        last_status: 'success',
        run_count: ((routine.run_count as number) ?? 0) + 1,
      })
      .eq('id', routine.id as string);

    // Record routine run
    await this.supabase.from('routine_runs').insert({
      routine_id: routine.id as string,
      company_id: event.company_id,
      issue_id: issue.id,
      status: 'success',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });

    log.info('Issue spawned from routine', { issueId: issue.id, routineId: routine.id });
  }

  /**
   * Simple wildcard pattern matching.
   * 'missed_*' matches 'missed_call', 'missed_sms', etc.
   */
  private matchesPattern(eventType: string, pattern: string): boolean {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(eventType);
  }

  /**
   * Reconnect after a connection drop.
   * Uses exponential backoff with jitter and a max retry limit.
   */
  private reconnectAttempts = 0;
  private static readonly MAX_RECONNECT_ATTEMPTS = 10;

  private async reconnect(): Promise<void> {
    this.reconnectAttempts++;

    if (this.reconnectAttempts > EventBus.MAX_RECONNECT_ATTEMPTS) {
      log.error('Max reconnection attempts exceeded — event bus giving up. Process should be restarted.', {
        attempts: this.reconnectAttempts,
      });
      // Don't process.exit() — let PM2 handle restarts via health check failure
      return;
    }

    // Exponential backoff: 5s, 10s, 20s, 40s... capped at 60s, plus jitter
    const baseDelay = Math.min(5000 * Math.pow(2, this.reconnectAttempts - 1), 60000);
    const jitter = Math.random() * 3000;
    const delay = baseDelay + jitter;

    log.info('Attempting to reconnect to Postgres...', {
      attempt: this.reconnectAttempts,
      maxAttempts: EventBus.MAX_RECONNECT_ATTEMPTS,
      delayMs: Math.round(delay),
    });

    setTimeout(async () => {
      try {
        if (this.pgClient) {
          await this.pgClient.end().catch(() => {});
        }
        await this.start();
        this.reconnectAttempts = 0; // Reset on success
        log.info('Reconnected to Postgres successfully');
      } catch (err) {
        log.error('Reconnection failed', {
          attempt: this.reconnectAttempts,
          error: err instanceof Error ? err.message : String(err),
        });
        await this.reconnect();
      }
    }, delay);
  }
}

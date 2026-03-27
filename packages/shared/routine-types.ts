/**
 * Routine Types — Shared type definitions for the Routines Engine.
 *
 * Routines are recurring or event-triggered automations.
 * SCHEDULED routines run on a cron expression.
 * REACTIVE routines fire when a matching event arrives.
 *
 * Fully generic — no business-specific logic. Templates define what
 * issues get created; the routine engine just executes them.
 */

/**
 * Routine type enum.
 */
export type RoutineType = 'SCHEDULED' | 'REACTIVE';

/**
 * Routine execution status.
 */
export type RoutineStatus = 'success' | 'failed' | 'skipped' | 'timeout';

/**
 * A routine run record — one entry per execution.
 */
export interface RoutineRun {
  id: string;
  routine_id: string;
  company_id: string;
  issue_id: string | null;
  status: RoutineStatus;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  execution_time_ms: number | null;
  metadata: Record<string, unknown>;
}

/**
 * Issue template — defines the issue that gets created when a routine fires.
 * Supports {{variable}} interpolation for dynamic values from events or context.
 */
export interface IssueTemplate {
  /** Title with optional {{variable}} tokens */
  title: string;
  /** Description with optional {{variable}} tokens */
  description: string;
  /** Agent role to assign the issue to */
  assigned_role: string;
  /** Priority 0-100 (higher = more urgent) */
  priority: number;
  /** Success condition — how the agent knows it's done */
  success_condition: string;
  /** Optional metadata to attach to the spawned issue */
  metadata?: Record<string, unknown>;
}

/**
 * Full routine definition as stored in the database.
 */
export interface Routine {
  id: string;
  company_id: string;
  name: string;
  description: string;
  routine_type: RoutineType;
  enabled: boolean;

  /** Cron expression for SCHEDULED routines (null for REACTIVE) */
  cron_expr: string | null;
  /** IANA timezone for cron evaluation (e.g., 'America/Los_Angeles') */
  timezone: string | null;

  /** Event pattern for REACTIVE routines (null for SCHEDULED). Supports wildcards. */
  event_pattern: string | null;

  /** Template for the issue created on each run */
  issue_template: IssueTemplate;

  /** Execution tracking */
  last_run_at: string | null;
  next_run_at: string | null;
  last_status: RoutineStatus | null;
  run_count: number;

  created_at: string;
  updated_at: string;
}

/**
 * Input for creating a new routine (subset of full Routine).
 */
export interface CreateRoutineInput {
  company_id: string;
  name: string;
  description: string;
  routine_type: RoutineType;
  enabled?: boolean;
  cron_expr?: string | null;
  timezone?: string | null;
  event_pattern?: string | null;
  issue_template: IssueTemplate;
}

/**
 * Input for updating a routine.
 */
export interface UpdateRoutineInput {
  name?: string;
  description?: string;
  enabled?: boolean;
  cron_expr?: string | null;
  timezone?: string | null;
  event_pattern?: string | null;
  issue_template?: IssueTemplate;
}

/**
 * Runtime interpolation context — available variables for {{token}} replacement.
 */
export interface InterpolationContext {
  /** Current ISO date string */
  date: string;
  /** Current ISO time string */
  time: string;
  /** Current ISO datetime string */
  datetime: string;
  /** Company name */
  company_name: string;
  /** Company ID */
  company_id: string;
  /** Routine name */
  routine_name: string;
  /** Event payload (for REACTIVE routines) */
  event?: Record<string, unknown>;
  /** Event type (for REACTIVE routines) */
  event_type?: string;
  /** Any additional custom variables */
  [key: string]: unknown;
}

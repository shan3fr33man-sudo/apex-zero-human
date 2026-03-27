/**
 * Template Interpolator
 *
 * Replaces {{variable}} tokens in issue template strings with actual values
 * from event payloads or runtime context. Used by both Scheduler and Reactor.
 *
 * Supports:
 * - Simple tokens: {{company_name}}, {{date}}, {{time}}
 * - Nested event data: {{event.caller_number}}, {{event.payload.amount}}
 * - Default values: {{event.name|Unknown Caller}}
 * - Conditional presence: tokens that don't resolve are left as empty string
 */

import { createLogger } from '../lib/logger.js';

const log = createLogger('Interpolator');

/**
 * Interpolation context — flat or nested key-value map.
 */
export interface InterpolationContext {
  [key: string]: unknown;
}

/**
 * Interpolate all {{variable}} tokens in a string.
 *
 * @param template - String containing {{variable}} tokens
 * @param context - Key-value map of variable values (supports nested via dot notation)
 * @returns Interpolated string with all tokens replaced
 */
export function interpolate(template: string, context: InterpolationContext): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, expression: string) => {
    const trimmed = expression.trim();

    // Support default values: {{variable|default}}
    const [path, ...defaultParts] = trimmed.split('|');
    const defaultValue = defaultParts.length > 0 ? defaultParts.join('|').trim() : '';

    const value = resolveNestedPath(context, path.trim());

    if (value === undefined || value === null) {
      return defaultValue;
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  });
}

/**
 * Interpolate an entire IssueTemplate object.
 * Applies interpolation to title, description, and success_condition.
 */
export function interpolateTemplate(
  template: {
    title: string;
    description: string;
    success_condition: string;
    assigned_role: string;
    priority: number;
    metadata?: Record<string, unknown>;
  },
  context: InterpolationContext
): {
  title: string;
  description: string;
  success_condition: string;
  assigned_role: string;
  priority: number;
  metadata?: Record<string, unknown>;
} {
  return {
    title: interpolate(template.title, context),
    description: interpolate(template.description, context),
    success_condition: interpolate(template.success_condition, context),
    assigned_role: template.assigned_role, // Role is never interpolated
    priority: template.priority,           // Priority is never interpolated
    metadata: template.metadata,
  };
}

/**
 * Build a standard interpolation context from runtime data.
 */
export function buildContext(options: {
  companyId: string;
  companyName?: string;
  routineName: string;
  event?: { event_type: string; payload: Record<string, unknown> };
  extra?: Record<string, unknown>;
}): InterpolationContext {
  const now = new Date();

  const ctx: InterpolationContext = {
    date: now.toISOString().split('T')[0],
    time: now.toTimeString().split(' ')[0],
    datetime: now.toISOString(),
    timestamp: now.getTime(),
    company_id: options.companyId,
    company_name: options.companyName ?? '',
    routine_name: options.routineName,
  };

  if (options.event) {
    ctx.event_type = options.event.event_type;
    ctx.event = options.event.payload;
  }

  if (options.extra) {
    Object.assign(ctx, options.extra);
  }

  return ctx;
}

/**
 * Resolve a dot-notation path against a nested object.
 * E.g., resolveNestedPath({ event: { caller: { name: "John" } } }, "event.caller.name") → "John"
 */
function resolveNestedPath(obj: InterpolationContext, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

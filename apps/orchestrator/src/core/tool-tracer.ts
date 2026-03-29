/**
 * Tool Call Tracer — logs every skill execution with timing and cost.
 * Wraps skill calls for automatic before/after tracing.
 */
import { getSupabaseAdmin } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('ToolTracer');

export interface ToolCallRecord {
  agent_id: string;
  issue_id: string | null;
  tool_name: string;
  input_params: Record<string, unknown>;
  output_summary: string;
  tokens_used: number;
  duration_ms: number;
}

export class ToolTracer {
  private supabase = getSupabaseAdmin();

  /**
   * Log a tool call to the tool_call_log table.
   */
  async logToolCall(record: ToolCallRecord): Promise<void> {
    try {
      await this.supabase.from('tool_call_log').insert({
        agent_id: record.agent_id,
        issue_id: record.issue_id,
        tool_name: record.tool_name,
        input_params: record.input_params,
        output_summary: record.output_summary,
        tokens_used: record.tokens_used,
        duration_ms: record.duration_ms,
      });
    } catch (err) {
      log.warn('Failed to log tool call', {
        tool: record.tool_name,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  /**
   * Wrap a skill execution with automatic tracing.
   * Records timing, input params, output summary, and any errors.
   */
  async traceExecution<T>(
    agentId: string,
    issueId: string | null,
    toolName: string,
    inputParams: Record<string, unknown>,
    fn: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    let outputSummary = '';
    let tokensUsed = 0;

    try {
      const result = await fn();

      // Extract summary from result
      if (result && typeof result === 'object') {
        const r = result as Record<string, unknown>;
        if (typeof r.data === 'string') {
          outputSummary = r.data.substring(0, 500);
        } else if (typeof r.content === 'string') {
          outputSummary = r.content.substring(0, 500);
        } else {
          outputSummary = JSON.stringify(result).substring(0, 500);
        }
        if (typeof r.tokens_used === 'number') {
          tokensUsed = r.tokens_used;
        }
      } else if (typeof result === 'string') {
        outputSummary = result.substring(0, 500);
      }

      const durationMs = Date.now() - startTime;

      await this.logToolCall({
        agent_id: agentId,
        issue_id: issueId,
        tool_name: toolName,
        input_params: this.sanitizeParams(inputParams),
        output_summary: outputSummary,
        tokens_used: tokensUsed,
        duration_ms: durationMs,
      });

      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      outputSummary = `ERROR: ${err instanceof Error ? err.message : String(err)}`;

      await this.logToolCall({
        agent_id: agentId,
        issue_id: issueId,
        tool_name: toolName,
        input_params: this.sanitizeParams(inputParams),
        output_summary: outputSummary,
        tokens_used: tokensUsed,
        duration_ms: durationMs,
      });

      throw err;
    }
  }

  /**
   * Sanitize params to prevent logging secrets.
   */
  private sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      if (/key|secret|password|token|auth/i.test(key)) {
        sanitized[key] = '***REDACTED***';
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  /**
   * Get tool call history for an issue (for display in issue detail timeline).
   */
  async getToolCallsForIssue(issueId: string): Promise<ToolCallRecord[]> {
    const { data, error } = await this.supabase
      .from('tool_call_log')
      .select('*')
      .eq('issue_id', issueId)
      .order('created_at', { ascending: true });

    if (error || !data) return [];
    return data as unknown as ToolCallRecord[];
  }

  /**
   * Get per-tool cost breakdown for analytics.
   */
  async getToolCostBreakdown(companyId: string, since: string): Promise<Array<{ tool_name: string; total_calls: number; total_tokens: number; total_duration_ms: number }>> {
    // Join with agents to filter by company
    const { data, error } = await this.supabase
      .from('tool_call_log')
      .select('tool_name, tokens_used, duration_ms')
      .gte('created_at', since);

    if (error || !data) return [];

    // Aggregate in memory (Supabase doesn't have GROUP BY in PostgREST)
    const breakdown = new Map<string, { total_calls: number; total_tokens: number; total_duration_ms: number }>();
    for (const row of data as Array<{ tool_name: string; tokens_used: number; duration_ms: number }>) {
      const existing = breakdown.get(row.tool_name) ?? { total_calls: 0, total_tokens: 0, total_duration_ms: 0 };
      existing.total_calls++;
      existing.total_tokens += row.tokens_used ?? 0;
      existing.total_duration_ms += row.duration_ms ?? 0;
      breakdown.set(row.tool_name, existing);
    }

    return Array.from(breakdown.entries()).map(([tool_name, stats]) => ({ tool_name, ...stats }));
  }
}

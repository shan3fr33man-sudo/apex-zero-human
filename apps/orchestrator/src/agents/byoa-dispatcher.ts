/**
 * BYOA Dispatcher — enables external agents to participate in APEX.
 *
 * Any HTTP endpoint that accepts a heartbeat JSON payload and returns
 * a result is hireable as an APEX agent.
 *
 * Agent types:
 *   - apex_native: runs locally via BaseAgent subclasses
 *   - http_agent: POST heartbeat payload to external endpoint
 *   - openClaw: OpenAI-compatible agent API
 *   - bash: runs a local bash command with JSON input/output
 */
import { createLogger } from '../lib/logger.js';
import type { AgentConfig, Issue, AgentExecutionResult, HandoffResult } from './types.js';

const log = createLogger('BYOADispatcher');

export type AgentType = 'apex_native' | 'http_agent' | 'openClaw' | 'bash';

export interface HeartbeatPayload {
  agent_id: string;
  agent_name: string;
  agent_role: string;
  company_id: string;
  company_name: string;
  company_goal: string;
  issue: {
    id: string;
    title: string;
    description: string | null;
    success_condition: string | null;
    priority: string;
    metadata: Record<string, unknown>;
  };
  memory_context: string;
  research_context: string;
  installed_skills: string[];
}

export interface ExternalAgentResponse {
  status: 'success' | 'error';
  content: string;
  handoff?: {
    target_agent_id: string | null;
    summary: string;
    artifacts: string[];
    quality_score_self: number;
    memory_to_save: string | null;
  };
  tokens_used?: number;
  error?: string;
}

export class BYOADispatcher {
  /**
   * Test connectivity to an external agent endpoint.
   * Returns true if the endpoint responds correctly.
   */
  async testConnection(endpoint: string): Promise<{ success: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'health_check', timestamp: new Date().toISOString() }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const latencyMs = Date.now() - start;

      if (!response.ok) {
        return { success: false, latencyMs, error: `HTTP ${response.status}` };
      }

      return { success: true, latencyMs };
    } catch (err) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Dispatch a heartbeat to an external HTTP agent.
   * Sends the full issue context and waits for a response.
   */
  async dispatchToHttpAgent(
    endpoint: string,
    payload: HeartbeatPayload
  ): Promise<AgentExecutionResult> {
    log.info('Dispatching to external agent', {
      endpoint,
      agentId: payload.agent_id,
      issueId: payload.issue.id,
    });

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 300_000); // 5 min timeout

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        log.error('External agent returned error', { endpoint, status: response.status });
        return this.errorResult(`External agent HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json() as ExternalAgentResponse;

      if (data.status === 'error') {
        return this.errorResult(data.error ?? 'External agent reported error');
      }

      const handoff: HandoffResult = data.handoff
        ? {
            targetAgentId: data.handoff.target_agent_id,
            summary: data.handoff.summary,
            artifacts: data.handoff.artifacts ?? [],
            qualityScoreSelf: data.handoff.quality_score_self ?? 50,
            memoryToSave: data.handoff.memory_to_save,
          }
        : {
            targetAgentId: null,
            summary: data.content.substring(0, 500),
            artifacts: [],
            qualityScoreSelf: 50,
            memoryToSave: null,
          };

      return {
        success: true,
        content: data.content,
        handoff,
        tokensUsed: data.tokens_used ?? 0,
        model: 'external',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('External agent dispatch failed', { endpoint, error: message });
      return this.errorResult(message);
    }
  }

  /**
   * Build a HeartbeatPayload from APEX internal types.
   */
  buildPayload(
    config: AgentConfig,
    issue: Issue,
    memoryContext: string,
    researchContext: string
  ): HeartbeatPayload {
    return {
      agent_id: config.id,
      agent_name: config.name,
      agent_role: config.role,
      company_id: config.company_id,
      company_name: config.company_name,
      company_goal: config.company_description,
      issue: {
        id: issue.id,
        title: issue.title,
        description: issue.description,
        success_condition: (issue.metadata?.success_condition as string) ?? null,
        priority: issue.priority,
        metadata: issue.metadata,
      },
      memory_context: memoryContext,
      research_context: researchContext,
      installed_skills: ((config.config as Record<string, unknown>)?.installed_skills as string[]) ?? [],
    };
  }

  private errorResult(error: string): AgentExecutionResult {
    return {
      success: false,
      content: '',
      handoff: { targetAgentId: null, summary: '', artifacts: [], qualityScoreSelf: 0, memoryToSave: null },
      tokensUsed: 0,
      model: 'external',
      error,
    };
  }
}

/**
 * Custom Tracing Plugin — send traces to external observability tools.
 * Supports generic webhook-based tracing (Datadog, Honeycomb, etc.)
 */
import { createLogger } from '../lib/logger.js';
import type { ApexPlugin, ApexPluginContext } from './types.js';

const log = createLogger('CustomTracingPlugin');

export class CustomTracingPlugin implements ApexPlugin {
  readonly name = 'custom-tracing';
  readonly version = '1.0.0';
  private webhookUrl: string | null = null;

  async initialize(ctx: ApexPluginContext): Promise<void> {
    this.webhookUrl = process.env.TRACING_WEBHOOK_URL ?? null;
    if (!this.webhookUrl) {
      log.warn('No TRACING_WEBHOOK_URL configured — tracing disabled');
    } else {
      log.info('Custom tracing plugin initialized', { companyId: ctx.companyId });
    }
  }

  async onAgentStart(agentId: string, agentRole: string, issueId: string): Promise<void> {
    await this.sendTrace({
      event: 'agent.start',
      agent_id: agentId,
      agent_role: agentRole,
      issue_id: issueId,
      timestamp: new Date().toISOString(),
    });
  }

  async onAgentComplete(agentId: string, agentRole: string, issueId: string, result: { success: boolean; tokensUsed: number; qualityScore: number }): Promise<void> {
    await this.sendTrace({
      event: 'agent.complete',
      agent_id: agentId,
      agent_role: agentRole,
      issue_id: issueId,
      success: result.success,
      tokens_used: result.tokensUsed,
      quality_score: result.qualityScore,
      timestamp: new Date().toISOString(),
    });
  }

  async onIssueCreated(issueId: string, title: string, assignedRole: string | null): Promise<void> {
    await this.sendTrace({
      event: 'issue.created',
      issue_id: issueId,
      title,
      assigned_role: assignedRole,
      timestamp: new Date().toISOString(),
    });
  }

  async onEventReceived(eventType: string, payload: Record<string, unknown>): Promise<void> {
    await this.sendTrace({
      event: 'event.received',
      event_type: eventType,
      payload,
      timestamp: new Date().toISOString(),
    });
  }

  async shutdown(): Promise<void> {
    log.info('Custom tracing plugin shut down');
  }

  private async sendTrace(data: Record<string, unknown>): Promise<void> {
    if (!this.webhookUrl) return;
    try {
      await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch {
      // Silent — tracing failures should never block execution
    }
  }
}

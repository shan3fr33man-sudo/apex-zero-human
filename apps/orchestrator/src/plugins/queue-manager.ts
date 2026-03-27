/**
 * Queue Manager Plugin — plug in external job queues (Bull, etc.)
 * Routes APEX events and tasks to external queue systems.
 */
import { createLogger } from '../lib/logger.js';
import type { ApexPlugin, ApexPluginContext } from './types.js';

const log = createLogger('QueueManagerPlugin');

export class QueueManagerPlugin implements ApexPlugin {
  readonly name = 'queue-manager';
  readonly version = '1.0.0';
  private queueUrl: string | null = null;

  async initialize(ctx: ApexPluginContext): Promise<void> {
    this.queueUrl = process.env.EXTERNAL_QUEUE_URL ?? null;
    if (!this.queueUrl) {
      log.warn('No EXTERNAL_QUEUE_URL configured — queue manager disabled');
    } else {
      log.info('Queue manager plugin initialized', { companyId: ctx.companyId });
    }
  }

  async onAgentStart(agentId: string, agentRole: string, issueId: string): Promise<void> {
    await this.enqueue('agent.start', { agentId, agentRole, issueId });
  }

  async onAgentComplete(agentId: string, agentRole: string, issueId: string, result: { success: boolean; tokensUsed: number; qualityScore: number }): Promise<void> {
    await this.enqueue('agent.complete', { agentId, agentRole, issueId, ...result });
  }

  async onIssueCreated(issueId: string, title: string, assignedRole: string | null): Promise<void> {
    await this.enqueue('issue.created', { issueId, title, assignedRole });
  }

  async onEventReceived(eventType: string, payload: Record<string, unknown>): Promise<void> {
    await this.enqueue('event', { eventType, ...payload });
  }

  async shutdown(): Promise<void> {
    log.info('Queue manager plugin shut down');
  }

  private async enqueue(jobType: string, data: Record<string, unknown>): Promise<void> {
    if (!this.queueUrl) return;
    try {
      await fetch(this.queueUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_type: jobType, data, queued_at: new Date().toISOString() }),
      });
    } catch {
      // Silent — queue failures should never block execution
    }
  }
}

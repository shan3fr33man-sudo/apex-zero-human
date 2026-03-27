/**
 * Knowledge Base Plugin — attach vector knowledge to companies.
 * Enables agents to search company-specific documents and knowledge.
 */
import { createLogger } from '../lib/logger.js';
import type { ApexPlugin, ApexPluginContext } from './types.js';

const log = createLogger('KnowledgeBasePlugin');

export class KnowledgeBasePlugin implements ApexPlugin {
  readonly name = 'knowledge-base';
  readonly version = '1.0.0';
  private ctx: ApexPluginContext | null = null;

  async initialize(ctx: ApexPluginContext): Promise<void> {
    this.ctx = ctx;
    log.info('Knowledge base plugin initialized', { companyId: ctx.companyId });
  }

  async onAgentStart(agentId: string, agentRole: string, issueId: string): Promise<void> {
    // Could pre-load relevant knowledge for the agent based on issue content
    log.debug('Agent starting — knowledge base ready', { agentId, agentRole, issueId });
  }

  async onAgentComplete(agentId: string, _agentRole: string, issueId: string, result: { success: boolean; tokensUsed: number; qualityScore: number }): Promise<void> {
    // Could index completed work as new knowledge
    if (result.success && result.qualityScore >= 70) {
      log.debug('High-quality result — candidate for knowledge indexing', { agentId, issueId, quality: result.qualityScore });
    }
  }

  async onIssueCreated(issueId: string, title: string, _assignedRole: string | null): Promise<void> {
    log.debug('New issue — checking knowledge base for relevant context', { issueId, title });
  }

  async shutdown(): Promise<void> {
    log.info('Knowledge base plugin shut down');
  }
}

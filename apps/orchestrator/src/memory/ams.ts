/**
 * APEX Memory System (AMS)
 *
 * Provides a high-level API for agent memory operations:
 * - Identity memories: who the agent is, their role, persona
 * - Plan memories: current plans and strategies
 * - Learning memories: lessons learned from past tasks
 * - Rule memories: custom rules set by operators
 * - Context memories: short-lived context for current work
 *
 * Built on top of the VectorStore for semantic retrieval.
 * Agents use AMS during the MEMORY_LOADED heartbeat phase.
 */
import { VectorStore, type MemoryRecord, type MemorySearchResult } from './vector-store.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('AMS');

export interface MemoryContext {
  identity: MemoryRecord[];
  rules: MemoryRecord[];
  recentLearnings: MemoryRecord[];
  relevantContext: MemorySearchResult[];
}

export class ApexMemorySystem {
  private vectorStore: VectorStore;

  constructor(vectorStore?: VectorStore) {
    this.vectorStore = vectorStore ?? new VectorStore();
  }

  /**
   * Load full memory context for an agent during the MEMORY_LOADED heartbeat phase.
   * This is the primary API agents call to get their memories.
   *
   * @param agentId - The agent loading memories
   * @param issueContext - Description of the current task (for semantic search)
   */
  async loadContext(agentId: string, issueContext: string): Promise<MemoryContext> {
    log.debug('Loading memory context', { agentId });

    const [identity, rules, recentLearnings, relevantContext] = await Promise.all([
      // Always load identity — who am I?
      this.vectorStore.getByType(agentId, 'identity'),
      // Always load rules — what constraints do I have?
      this.vectorStore.getByType(agentId, 'rule'),
      // Recent learnings — what have I learned recently?
      this.getRecentLearnings(agentId, 5),
      // Semantic search for context relevant to this issue
      this.vectorStore.search(agentId, issueContext, 10),
    ]);

    log.debug('Memory context loaded', {
      agentId,
      identityCount: identity.length,
      rulesCount: rules.length,
      learningsCount: recentLearnings.length,
      contextCount: relevantContext.length,
    });

    return { identity, rules, recentLearnings, relevantContext };
  }

  /**
   * Store an identity memory (persistent, never expires).
   */
  async storeIdentity(agentId: string, companyId: string, content: string): Promise<string> {
    return this.vectorStore.store(agentId, companyId, 'identity', content);
  }

  /**
   * Store a plan memory (medium-lived, expires after 7 days).
   */
  async storePlan(agentId: string, companyId: string, content: string): Promise<string> {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    return this.vectorStore.store(agentId, companyId, 'plan', content, expiresAt);
  }

  /**
   * Store a learning memory (long-lived, expires after 30 days).
   */
  async storeLearning(agentId: string, companyId: string, content: string): Promise<string> {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    return this.vectorStore.store(agentId, companyId, 'learning', content, expiresAt);
  }

  /**
   * Store a rule memory (persistent, set by operators or the CEO agent).
   */
  async storeRule(agentId: string, companyId: string, content: string): Promise<string> {
    return this.vectorStore.store(agentId, companyId, 'rule', content);
  }

  /**
   * Store a context memory (short-lived, expires after 24 hours).
   */
  async storeContext(agentId: string, companyId: string, content: string): Promise<string> {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    return this.vectorStore.store(agentId, companyId, 'context', content, expiresAt);
  }

  /**
   * Search for memories semantically related to a query.
   */
  async recall(agentId: string, query: string, limit: number = 10): Promise<MemorySearchResult[]> {
    return this.vectorStore.search(agentId, query, limit);
  }

  /**
   * Format memories into a prompt-ready string for injection into agent system prompts.
   */
  formatForPrompt(context: MemoryContext): string {
    const sections: string[] = [];

    if (context.identity.length > 0) {
      sections.push(
        '<identity_memories>\n' +
        context.identity.map(m => m.content).join('\n\n') +
        '\n</identity_memories>'
      );
    }

    if (context.rules.length > 0) {
      sections.push(
        '<rule_memories>\n' +
        context.rules.map(m => m.content).join('\n\n') +
        '\n</rule_memories>'
      );
    }

    if (context.recentLearnings.length > 0) {
      sections.push(
        '<recent_learnings>\n' +
        context.recentLearnings.map(m => m.content).join('\n\n') +
        '\n</recent_learnings>'
      );
    }

    if (context.relevantContext.length > 0) {
      sections.push(
        '<relevant_context>\n' +
        context.relevantContext
          .map(m => `[similarity: ${m.similarity.toFixed(3)}] ${m.content}`)
          .join('\n\n') +
        '\n</relevant_context>'
      );
    }

    return sections.join('\n\n');
  }

  /**
   * Garbage collect — purge expired memories and decay old relevance scores.
   */
  async garbageCollect(): Promise<void> {
    const purged = await this.vectorStore.purgeExpired();
    if (purged > 0) {
      log.info('Memory garbage collection completed', { purged });
    }
  }

  /**
   * Get the N most recent learning memories for an agent.
   */
  private async getRecentLearnings(agentId: string, limit: number): Promise<MemoryRecord[]> {
    const all = await this.vectorStore.getByType(agentId, 'learning');
    return all.slice(0, limit);
  }
}

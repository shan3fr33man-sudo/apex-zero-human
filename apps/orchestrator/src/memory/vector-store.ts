/**
 * Vector Store — pgvector integration for semantic memory search.
 *
 * Uses the agent_memories table with vector(1536) embedding column.
 * Embeddings are generated via the ModelRouter (using a small model call
 * or a dedicated embedding endpoint if available).
 *
 * For now, we use a simple character-hash-based placeholder embedding
 * until a real embedding endpoint is configured. In production, this
 * should use an actual embedding model.
 */
import { getSupabaseAdmin } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('VectorStore');

const EMBEDDING_DIMENSION = 1536;

export interface MemoryRecord {
  id: string;
  agentId: string;
  companyId: string;
  memoryType: 'identity' | 'plan' | 'learning' | 'rule' | 'context';
  content: string;
  relevanceScore: number;
  createdAt: string;
  expiresAt: string | null;
}

export interface MemorySearchResult {
  id: string;
  content: string;
  memoryType: string;
  similarity: number;
}

export class VectorStore {
  private supabase = getSupabaseAdmin();

  /**
   * Store a memory with its embedding vector.
   */
  async store(
    agentId: string,
    companyId: string,
    memoryType: MemoryRecord['memoryType'],
    content: string,
    expiresAt?: string
  ): Promise<string> {
    const embedding = await this.generateEmbedding(content);

    const { data, error } = await this.supabase
      .from('agent_memories')
      .insert({
        agent_id: agentId,
        company_id: companyId,
        memory_type: memoryType,
        content,
        embedding: this.vectorToString(embedding),
        expires_at: expiresAt ?? null,
      })
      .select('id')
      .single();

    if (error) {
      log.error('Failed to store memory', { agentId, memoryType, error: error.message });
      throw new Error(`Memory store failed: ${error.message}`);
    }

    log.debug('Memory stored', { memoryId: data.id, agentId, memoryType });
    return data.id;
  }

  /**
   * Semantic search — find memories similar to a query.
   * Uses the search_agent_memories RPC function with pgvector cosine similarity.
   */
  async search(
    agentId: string,
    query: string,
    limit: number = 10
  ): Promise<MemorySearchResult[]> {
    const embedding = await this.generateEmbedding(query);

    const { data, error } = await this.supabase.rpc('search_agent_memories', {
      p_agent_id: agentId,
      p_query_embedding: this.vectorToString(embedding),
      p_limit: limit,
    });

    if (error) {
      log.error('Memory search failed', { agentId, error: error.message });
      return [];
    }

    return (data ?? []).map((row: { id: string; content: string; memory_type: string; similarity: number }) => ({
      id: row.id,
      content: row.content,
      memoryType: row.memory_type,
      similarity: row.similarity,
    }));
  }

  /**
   * Get all memories of a specific type for an agent.
   */
  async getByType(
    agentId: string,
    memoryType: MemoryRecord['memoryType']
  ): Promise<MemoryRecord[]> {
    const { data } = await this.supabase
      .from('agent_memories')
      .select('*')
      .eq('agent_id', agentId)
      .eq('memory_type', memoryType)
      .order('created_at', { ascending: false });

    return (data ?? []).map(row => ({
      id: row.id,
      agentId: row.agent_id,
      companyId: row.company_id,
      memoryType: row.memory_type as MemoryRecord['memoryType'],
      content: row.content,
      relevanceScore: Number(row.relevance_score),
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    }));
  }

  /**
   * Delete expired memories (garbage collection).
   */
  async purgeExpired(): Promise<number> {
    const { data } = await this.supabase
      .from('agent_memories')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .not('expires_at', 'is', null)
      .select('id');

    const count = data?.length ?? 0;
    if (count > 0) {
      log.info('Purged expired memories', { count });
    }
    return count;
  }

  /**
   * Update relevance score for a memory (decay or boost).
   */
  async updateRelevance(memoryId: string, newScore: number): Promise<void> {
    await this.supabase
      .from('agent_memories')
      .update({ relevance_score: newScore })
      .eq('id', memoryId);
  }

  /**
   * Generate an embedding vector for text content.
   *
   * TODO: Replace with real embedding API call (e.g., Anthropic's embedding
   * endpoint or a dedicated embedding model). For now, uses a deterministic
   * hash-based placeholder that preserves some lexical similarity.
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // Deterministic placeholder embedding based on text hash.
    // In production, this should call an actual embedding API.
    const embedding = new Array(EMBEDDING_DIMENSION).fill(0);
    const normalized = text.toLowerCase().trim();

    for (let i = 0; i < normalized.length; i++) {
      const idx = i % EMBEDDING_DIMENSION;
      embedding[idx] += normalized.charCodeAt(i) / 255;
    }

    // Normalize to unit vector
    const magnitude = Math.sqrt(
      embedding.reduce((sum: number, val: number) => sum + val * val, 0)
    );

    if (magnitude > 0) {
      for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
        embedding[i] /= magnitude;
      }
    }

    return embedding;
  }

  /**
   * Convert a number array to a Postgres vector string: '[0.1,0.2,...]'
   */
  private vectorToString(embedding: number[]): string {
    return `[${embedding.join(',')}]`;
  }
}

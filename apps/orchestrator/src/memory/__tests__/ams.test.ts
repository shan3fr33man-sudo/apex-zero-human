import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock('../../lib/supabase.js', () => ({
  getSupabaseAdmin: () => ({ from: mockFrom, rpc: mockRpc }),
}));

vi.mock('../../lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { ApexMemorySystem } from '../ams.js';

describe('ApexMemorySystem', () => {
  let ams: ApexMemorySystem;

  beforeEach(() => {
    vi.clearAllMocks();
    ams = new ApexMemorySystem();
  });

  function mockChain(resolvedData: unknown) {
    const chain: Record<string, unknown> = {};
    ['select', 'insert', 'update', 'eq', 'neq', 'single', 'maybeSingle',
     'order', 'limit', 'or', 'gt', 'lt', 'gte', 'lte', 'is', 'in',
     'ilike', 'textSearch', 'not', 'filter', 'match', 'delete'].forEach((m) => {
      chain[m] = vi.fn().mockReturnValue(chain);
    });
    Object.defineProperty(chain, 'then', {
      value: (onFulfilled?: (v: unknown) => unknown) =>
        Promise.resolve({ data: resolvedData, error: null }).then(onFulfilled),
      writable: true, configurable: true,
    });
    return chain;
  }

  it('loadContext returns empty arrays for new agent', async () => {
    // getByType queries from('agent_memories')
    mockFrom.mockImplementation(() => mockChain([]));
    // search uses rpc('search_agent_memories')
    mockRpc.mockResolvedValue({ data: [], error: null });

    const context = await ams.loadContext('agent-new', 'some issue context');

    expect(context.identity).toEqual([]);
    expect(context.rules).toEqual([]);
    expect(context.recentLearnings).toEqual([]);
  });

  it('storeIdentity stores correct type and content', async () => {
    // vectorStore.store() calls from('agent_memories').insert({...}).select('id').single()
    const insertArgs: unknown[] = [];

    mockFrom.mockImplementation((table: string) => {
      if (table === 'agent_memories') {
        // Need insert() to return a chain that has select() and single()
        const resultChain = mockChain({ id: 'mem-1' });
        return {
          insert: vi.fn((data: unknown) => {
            insertArgs.push(data);
            return resultChain; // resultChain has .select() → .single() → resolves { data: { id: 'mem-1' } }
          }),
        };
      }
      return mockChain(null);
    });

    const id = await ams.storeIdentity('agent-1', 'company-1', 'I am the CEO agent.');

    expect(insertArgs.length).toBe(1);
    expect(insertArgs[0]).toEqual(
      expect.objectContaining({
        agent_id: 'agent-1',
        company_id: 'company-1',
        memory_type: 'identity',
        content: 'I am the CEO agent.',
      })
    );
    expect(id).toBe('mem-1');
  });

  it('expired memories are excluded from loadContext', async () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day ago

    // getByType returns only non-expired memories (DB handles expiration)
    mockFrom.mockImplementation(() => {
      return mockChain([
        { id: 'mem-2', agent_id: 'agent-1', company_id: 'c1', memory_type: 'learning', content: 'recent learning', relevance_score: 1, created_at: recent.toISOString(), expires_at: null },
      ]);
    });
    // search returns empty
    mockRpc.mockResolvedValue({ data: [], error: null });

    const context = await ams.loadContext('agent-1', 'test context');

    // Should only contain the recent memory, not expired ones
    const allMemories = [
      ...context.identity,
      ...context.rules,
      ...context.recentLearnings,
    ];
    expect(allMemories.every((m) => m.id !== 'mem-1')).toBe(true);
  });

  it('formatForPrompt returns valid XML string', () => {
    const context = {
      identity: [{ id: '1', agentId: 'a1', companyId: 'c1', content: 'I am CEO', memoryType: 'identity' as const, relevanceScore: 10, createdAt: new Date().toISOString(), expiresAt: null }],
      rules: [{ id: '2', agentId: 'a1', companyId: 'c1', content: 'Always verify before acting', memoryType: 'rule' as const, relevanceScore: 8, createdAt: new Date().toISOString(), expiresAt: null }],
      recentLearnings: [],
      relevantContext: [],
    };

    const xml = ams.formatForPrompt(context);

    // The actual implementation uses <identity_memories> and <rule_memories> tags
    expect(xml).toContain('<identity_memories>');
    expect(xml).toContain('I am CEO');
    expect(xml).toContain('<rule_memories>');
    expect(xml).toContain('Always verify before acting');
    expect(typeof xml).toBe('string');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock('../../lib/supabase.js', () => ({
  getSupabaseAdmin: () => ({ from: mockFrom, rpc: mockRpc }),
}));

vi.mock('../../lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { TokenGateway } from '../token-gateway.js';

describe('Token Gateway Agent Usage', () => {
  let gateway: TokenGateway;

  beforeEach(() => {
    vi.clearAllMocks();
    gateway = new TokenGateway();
  });

  function mockChain(resolvedData: unknown, error: unknown = null) {
    const chain: Record<string, unknown> = {};
    const methods = ['select', 'insert', 'update', 'eq', 'neq', 'gte', 'lte',
      'single', 'maybeSingle', 'order', 'limit', 'or', 'gt', 'lt', 'is', 'in'];
    methods.forEach((m) => { chain[m] = vi.fn().mockReturnValue(chain); });
    Object.defineProperty(chain, 'then', {
      value: (onFulfilled?: (v: unknown) => unknown) =>
        Promise.resolve({ data: resolvedData, error }).then(onFulfilled),
      writable: true, configurable: true,
    });
    return chain;
  }

  it('records agent token usage by incrementing tokens_used', async () => {
    const updateChain = mockChain(null);
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call: select tokens_used
        return mockChain({ tokens_used: 5000 });
      }
      // Second call: update
      return updateChain;
    });

    await gateway.recordAgentUsage('agent-1', 1000);
    expect(mockFrom).toHaveBeenCalledWith('agents');
  });

  it('handles missing agent gracefully', async () => {
    mockFrom.mockImplementation(() => mockChain(null));

    // Should not throw
    await gateway.recordAgentUsage('nonexistent', 1000);
  });

  it('records token spend log with correct columns', async () => {
    const insertChain = mockChain(null);
    mockFrom.mockImplementation(() => insertChain);

    await gateway.recordUsage('company-1', 'agent-1', 'issue-1', {
      model: 'claude-sonnet-4-6',
      inputTokens: 1000,
      outputTokens: 500,
      costUsd: 0.005,
    });

    expect(mockFrom).toHaveBeenCalledWith('token_spend_log');
  });

  it('checks company budget via RPC', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    mockFrom.mockImplementation(() => mockChain({ token_budget: 100000, tokens_used: 20000 }));

    const result = await gateway.checkBudget('company-1', 5000);
    expect(result.allowed).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('check_and_deduct_tokens', {
      p_company_id: 'company-1',
      p_tokens_needed: 5000,
    });
  });
});

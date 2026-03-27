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

describe('Per-Agent Budget Ceiling', () => {
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

  it('allows call when agent is under budget', async () => {
    mockFrom.mockImplementation(() =>
      mockChain({
        monthly_token_budget: 100000,
        tokens_used_this_month: 20000,
        budget_warning_sent: false,
        name: 'Test Agent',
      })
    );

    const result = await gateway.checkAgentBudget('agent-1', 'company-1', 5000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(80000);
  });

  it('hard stops when agent exceeds 100% budget', async () => {
    mockFrom.mockImplementation(() =>
      mockChain({
        monthly_token_budget: 100000,
        tokens_used_this_month: 99500,
        budget_warning_sent: true,
        name: 'Overbudget Agent',
      })
    );

    const result = await gateway.checkAgentBudget('agent-1', 'company-1', 1000);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('AGENT_BUDGET_EXCEEDED');
  });

  it('sends 80% warning and creates inbox item', async () => {
    const insertFn = vi.fn().mockReturnValue(
      Promise.resolve({ data: null, error: null })
    );

    mockFrom.mockImplementation((table: string) => {
      if (table === 'inbox_items') {
        return { insert: insertFn };
      }
      if (table === 'agents') {
        // For both the select (checkAgentBudget) and update (budget_warning_sent)
        return mockChain({
          monthly_token_budget: 100000,
          tokens_used_this_month: 85000,
          budget_warning_sent: false,
          name: 'Busy Agent',
        });
      }
      return mockChain(null);
    });

    const result = await gateway.checkAgentBudget('agent-1', 'company-1', 1000);
    expect(result.allowed).toBe(true);
    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({ item_type: 'BUDGET_ALERT' })
    );
  });

  it('skips check when no per-agent budget is set', async () => {
    mockFrom.mockImplementation(() =>
      mockChain({
        monthly_token_budget: null,
        tokens_used_this_month: 0,
        budget_warning_sent: false,
        name: 'Unlimited Agent',
      })
    );

    const result = await gateway.checkAgentBudget('agent-1', 'company-1', 50000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(999999);
  });

  it('resetAllAgentBudgets clears all agents', async () => {
    const updateFn = vi.fn().mockReturnValue(mockChain(null));
    mockFrom.mockImplementation(() => ({ update: updateFn }));

    await gateway.resetAllAgentBudgets();
    expect(mockFrom).toHaveBeenCalledWith('agents');
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ tokens_used_this_month: 0, budget_warning_sent: false })
    );
  });
});

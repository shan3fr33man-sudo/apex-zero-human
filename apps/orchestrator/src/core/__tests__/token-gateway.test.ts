import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase before importing the module under test
const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock('../../lib/supabase.js', () => ({
  getSupabaseAdmin: () => ({ from: mockFrom, rpc: mockRpc }),
}));

vi.mock('../../lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { TokenGateway } from '../token-gateway.js';

describe('TokenGateway', () => {
  let gateway: TokenGateway;

  beforeEach(() => {
    vi.clearAllMocks();
    gateway = new TokenGateway();
  });

  function mockChain(resolvedData: unknown, error: unknown = null) {
    const chain: Record<string, unknown> = {};
    const methods = ['select', 'insert', 'update', 'eq', 'neq', 'gte', 'lte',
      'single', 'maybeSingle', 'order', 'limit', 'or', 'gt', 'lt', 'sum', 'is', 'in'];
    methods.forEach((m) => { chain[m] = vi.fn().mockReturnValue(chain); });
    Object.defineProperty(chain, 'then', {
      value: (onFulfilled?: (v: unknown) => unknown) =>
        Promise.resolve({ data: resolvedData, error }).then(onFulfilled),
      writable: true, configurable: true,
    });
    return chain;
  }

  it('checkBudget returns false when budget exceeded', async () => {
    // checkBudget calls this.supabase.rpc('check_and_deduct_tokens', ...)
    // When data is falsy (null/false), budget is exceeded
    mockRpc.mockResolvedValue({ data: false, error: null });

    // getRemaining is called but only if budget passes — since budget fails,
    // it calls handleBudgetExceeded instead which uses from('inbox_items') and from('issues')
    mockFrom.mockImplementation(() => mockChain(null));

    const result = await gateway.checkBudget('company-1', 10);
    expect(result.allowed).toBe(false);
  });

  it('checkBudget returns true when within budget', async () => {
    // RPC returns truthy → budget allowed
    mockRpc.mockResolvedValue({ data: true, error: null });

    // getRemaining fetches from companies table
    mockFrom.mockImplementation((table: string) => {
      if (table === 'companies') {
        return mockChain({ token_budget: 1000, tokens_used: 100 });
      }
      return mockChain(null);
    });

    const result = await gateway.checkBudget('company-1', 50);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThan(0);
  });

  it('handleBudgetExceeded creates BUDGET_ALERT inbox item', async () => {
    const insertFn = vi.fn().mockReturnValue(
      Promise.resolve({ data: null, error: null })
    );

    mockFrom.mockImplementation((table: string) => {
      if (table === 'inbox_items') {
        return { insert: insertFn };
      }
      // issues update for pausing
      return mockChain(null);
    });

    // Access private method via prototype workaround
    await (gateway as unknown as { handleBudgetExceeded(companyId: string, requested: number): Promise<void> })
      .handleBudgetExceeded('company-1', 950);

    expect(mockFrom).toHaveBeenCalledWith('inbox_items');
    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({ item_type: 'BUDGET_ALERT' })
    );
  });

  it('recordUsage writes correct record to token_spend_log', async () => {
    const insertFn = vi.fn().mockReturnValue(
      Promise.resolve({ data: null, error: null })
    );

    mockFrom.mockImplementation((table: string) => {
      if (table === 'token_spend_log') {
        return { insert: insertFn };
      }
      return mockChain(null);
    });

    await gateway.recordUsage('company-1', 'agent-1', 'issue-1', {
      model: 'claude-haiku-4-5',
      inputTokens: 500,
      outputTokens: 200,
    });

    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 'company-1',
        agent_id: 'agent-1',
        issue_id: 'issue-1',
        model: 'claude-haiku-4-5',
      })
    );
  });
});

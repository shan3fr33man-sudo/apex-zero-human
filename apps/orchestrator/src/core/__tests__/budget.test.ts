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

describe('Budget enforcement integration', () => {
  let gateway: TokenGateway;

  function mockChain(resolvedData: unknown) {
    const chain: Record<string, unknown> = {};
    ['select', 'insert', 'update', 'eq', 'neq', 'single', 'maybeSingle',
     'order', 'limit', 'or', 'gt', 'lt', 'gte', 'lte', 'is', 'in',
     'not', 'filter', 'sum'].forEach((m) => {
      chain[m] = vi.fn().mockReturnValue(chain);
    });
    Object.defineProperty(chain, 'then', {
      value: (onFulfilled?: (v: unknown) => unknown) =>
        Promise.resolve({ data: resolvedData, error: null }).then(onFulfilled),
      writable: true, configurable: true,
    });
    return chain;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    gateway = new TokenGateway();
  });

  it('agent with zero budget cannot execute', async () => {
    // checkBudget uses rpc('check_and_deduct_tokens') — falsy data means budget exceeded
    mockRpc.mockResolvedValue({ data: false, error: null });
    // handleBudgetExceeded uses from('inbox_items') and from('issues')
    mockFrom.mockImplementation(() => mockChain(null));

    const result = await gateway.checkBudget('company-1', 100);
    expect(result.allowed).toBe(false);
  });

  it('budget check returns correct remaining tokens', async () => {
    // rpc returns truthy → allowed
    mockRpc.mockResolvedValue({ data: true, error: null });
    // getRemaining fetches from companies
    mockFrom.mockImplementation((table: string) => {
      if (table === 'companies') {
        return mockChain({ token_budget: 10000, tokens_used: 7500 });
      }
      return mockChain(null);
    });

    const result = await gateway.checkBudget('company-1', 500);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2500);
  });

  it('inbox item created on budget exceeded', async () => {
    // Budget check fails
    mockRpc.mockResolvedValue({ data: false, error: null });

    const insertCalls: Array<Record<string, unknown>> = [];

    mockFrom.mockImplementation((table: string) => {
      if (table === 'inbox_items') {
        return {
          insert: vi.fn((data: Record<string, unknown>) => {
            insertCalls.push(data);
            return Promise.resolve({ data: { id: 'inbox-1' }, error: null });
          }),
        };
      }
      // issues update for pausing
      return mockChain(null);
    });

    const result = await gateway.checkBudget('company-1', 50);
    expect(result.allowed).toBe(false);

    // handleBudgetExceeded should have created an inbox item
    expect(insertCalls.length).toBe(1);
    expect(insertCalls[0]).toEqual(
      expect.objectContaining({ item_type: 'BUDGET_ALERT' })
    );
  });

  it('tokens deducted correctly after successful execution', async () => {
    const insertCalls: Array<Record<string, unknown>> = [];

    mockFrom.mockImplementation((table: string) => {
      if (table === 'token_spend_log') {
        return {
          insert: vi.fn((data: Record<string, unknown>) => {
            insertCalls.push(data);
            return Promise.resolve({ data: null, error: null });
          }),
        };
      }
      return mockChain(null);
    });

    await gateway.recordUsage('company-1', 'agent-1', 'issue-1', {
      model: 'claude-haiku-4-5',
      inputTokens: 300,
      outputTokens: 150,
    });

    expect(insertCalls.length).toBe(1);
    expect(insertCalls[0]).toEqual(
      expect.objectContaining({
        company_id: 'company-1',
        agent_id: 'agent-1',
      })
    );
  });
});

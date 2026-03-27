import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock('../../lib/supabase.js', () => ({
  getSupabaseAdmin: () => ({ from: mockFrom, rpc: mockRpc }),
}));

vi.mock('../../lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { TaskRouter } from '../task-router.js';

describe('TaskRouter', () => {
  let router: TaskRouter;

  beforeEach(() => {
    vi.clearAllMocks();
    router = new TaskRouter();
  });

  function mockChain(resolvedData: unknown, error: unknown = null) {
    const chain: Record<string, unknown> = {};
    ['select', 'insert', 'update', 'eq', 'neq', 'single', 'maybeSingle',
     'order', 'limit', 'or', 'gt', 'lt', 'gte', 'lte', 'is', 'in', 'not',
     'match', 'filter', 'delete'].forEach((m) => {
      chain[m] = vi.fn().mockReturnValue(chain);
    });
    Object.defineProperty(chain, 'then', {
      value: (onFulfilled?: (v: unknown) => unknown) =>
        Promise.resolve({ data: resolvedData, error }).then(onFulfilled),
      writable: true, configurable: true,
    });
    return chain;
  }

  it('claimIssue returns true on successful advisory lock', async () => {
    // RPC advisory lock succeeds
    mockRpc.mockResolvedValue({ data: true, error: null });

    // Issue update succeeds
    mockFrom.mockImplementation(() => {
      return mockChain({ id: 'issue-1', status: 'in_progress', assigned_to: 'agent-1' });
    });

    const result = await router.claimIssue('agent-1', 'issue-1');
    expect(result).toBe(true);
  });

  it('claimIssue returns false when issue already locked', async () => {
    // RPC advisory lock fails (already locked)
    mockRpc.mockResolvedValue({ data: false, error: null });

    const result = await router.claimIssue('agent-1', 'issue-1');
    expect(result).toBe(false);
  });

  it('findNextIssue skips blocked issues (dependency not complete)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'issues') {
        return mockChain([
          { id: 'issue-2', status: 'open', priority: 'high', depends_on: null },
        ]);
      }
      if (table === 'issue_dependencies') {
        // No dependencies for issue-2
        return mockChain([]);
      }
      return mockChain(null);
    });

    const issueId = await router.findNextIssue('developer', 'company-1');
    expect(issueId).toBe('issue-2');
  });

  it('forceRelease clears lock and writes audit log', async () => {
    // forceRelease first does: from('issues').select('*').eq('id', ...).single()
    // then calls releaseIssue which does from('issues').select('locked_by')... and from('issues').update(...)
    // then does from('audit_log').insert(...)
    const auditInsertArgs: unknown[] = [];

    mockFrom.mockImplementation((table: string) => {
      if (table === 'issues') {
        return mockChain({ id: 'issue-1', status: 'in_progress', locked_by: 'agent-1', company_id: 'company-1' });
      }
      if (table === 'agents') {
        return mockChain(null);
      }
      if (table === 'audit_log') {
        const chain = mockChain(null);
        (chain as Record<string, unknown>).insert = vi.fn((data: unknown) => {
          auditInsertArgs.push(data);
          return Promise.resolve({ data: null, error: null });
        });
        return chain;
      }
      return mockChain(null);
    });

    await router.forceRelease('issue-1', 'Stall detected');

    expect(mockFrom).toHaveBeenCalledWith('issues');
    expect(mockFrom).toHaveBeenCalledWith('audit_log');
    expect(auditInsertArgs.length).toBe(1);
    expect(auditInsertArgs[0]).toEqual(
      expect.objectContaining({ action: 'FORCE_RELEASE' })
    );
  });
});

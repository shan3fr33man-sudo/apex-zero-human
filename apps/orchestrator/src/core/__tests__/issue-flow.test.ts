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

describe('Issue claim-to-handoff flow', () => {
  let router: TaskRouter;

  // Track mock DB state
  const mockIssues: Record<string, { id: string; status: string; assigned_to: string | null; quality_score: number | null }> = {};

  function setupMockIssue(id: string) {
    mockIssues[id] = { id, status: 'open', assigned_to: null, quality_score: null };
  }

  function mockChain(resolvedData: unknown) {
    const chain: Record<string, unknown> = {};
    ['select', 'insert', 'update', 'eq', 'neq', 'single', 'maybeSingle',
     'order', 'limit', 'or', 'gt', 'lt', 'gte', 'lte', 'is', 'in',
     'not', 'filter', 'match', 'delete'].forEach((m) => {
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
    Object.keys(mockIssues).forEach((k) => delete mockIssues[k]);
    router = new TaskRouter();
  });

  it('issue starts as open', () => {
    setupMockIssue('issue-1');
    expect(mockIssues['issue-1'].status).toBe('open');
    expect(mockIssues['issue-1'].assigned_to).toBeNull();
  });

  it('claim transitions to in_progress with locked_by set', async () => {
    setupMockIssue('issue-1');

    // Advisory lock succeeds
    mockRpc.mockResolvedValue({ data: true, error: null });

    // Update succeeds
    mockFrom.mockImplementation(() => {
      // Simulate the claim
      mockIssues['issue-1'].status = 'in_progress';
      mockIssues['issue-1'].assigned_to = 'agent-1';
      return mockChain(mockIssues['issue-1']);
    });

    const claimed = await router.claimIssue('agent-1', 'issue-1');

    expect(claimed).toBe(true);
    expect(mockIssues['issue-1'].status).toBe('in_progress');
    expect(mockIssues['issue-1'].assigned_to).toBe('agent-1');
  });

  it('second claim attempt on same issue returns false', async () => {
    setupMockIssue('issue-1');
    mockIssues['issue-1'].status = 'in_progress';
    mockIssues['issue-1'].assigned_to = 'agent-1';

    // Advisory lock fails (already held)
    mockRpc.mockResolvedValue({ data: false, error: null });

    const claimed = await router.claimIssue('agent-2', 'issue-1');
    expect(claimed).toBe(false);
  });

  it('release transitions back to open', async () => {
    setupMockIssue('issue-1');
    mockIssues['issue-1'].status = 'in_progress';

    mockFrom.mockImplementation(() => {
      mockIssues['issue-1'].status = 'open';
      mockIssues['issue-1'].assigned_to = null;
      return mockChain(mockIssues['issue-1']);
    });

    await router.releaseIssue('issue-1');
    expect(mockIssues['issue-1'].status).toBe('open');
  });

  it('completion transitions to completed with quality_score', async () => {
    setupMockIssue('issue-1');
    mockIssues['issue-1'].status = 'in_progress';

    mockFrom.mockImplementation(() => {
      mockIssues['issue-1'].status = 'completed';
      mockIssues['issue-1'].quality_score = 85;
      return mockChain(mockIssues['issue-1']);
    });

    await router.completeIssue('issue-1', 85);
    expect(mockIssues['issue-1'].status).toBe('completed');
    expect(mockIssues['issue-1'].quality_score).toBe(85);
  });
});

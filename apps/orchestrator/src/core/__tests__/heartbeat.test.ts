import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();

vi.mock('../../lib/supabase.js', () => ({
  getSupabaseAdmin: () => ({ from: mockFrom }),
}));

vi.mock('../../lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { HeartbeatStateMachine } from '../heartbeat.js';

describe('HeartbeatStateMachine', () => {
  let heartbeat: HeartbeatStateMachine;

  beforeEach(() => {
    vi.clearAllMocks();
    heartbeat = new HeartbeatStateMachine();
  });

  function mockChain(resolvedData: unknown, error: unknown = null) {
    const chain: Record<string, unknown> = {};
    ['select', 'insert', 'update', 'eq', 'neq', 'single', 'maybeSingle',
     'order', 'limit', 'or', 'gt', 'lt', 'gte', 'lte', 'is', 'in', 'delete', 'not'].forEach((m) => {
      chain[m] = vi.fn().mockReturnValue(chain);
    });
    Object.defineProperty(chain, 'then', {
      value: (onFulfilled?: (v: unknown) => unknown) =>
        Promise.resolve({ data: resolvedData, error }).then(onFulfilled),
      writable: true, configurable: true,
    });
    return chain;
  }

  const VALID_ORDER = [
    'IDENTITY_CONFIRMED',
    'MEMORY_LOADED',
    'PLAN_READ',
    'RESEARCH_COMPLETE',
    'ASSIGNMENT_CLAIMED',
    'EXECUTING',
    'HANDOFF_COMPLETE',
  ] as const;

  it('states advance in correct sequential order', async () => {
    // Each call to advance should succeed when the previous state is correct
    for (let i = 0; i < VALID_ORDER.length; i++) {
      const prevState = i > 0 ? VALID_ORDER[i - 1] : null;

      mockFrom.mockImplementation((table: string) => {
        if (table === 'agent_heartbeats') {
          // For getCurrentState lookup, return the previous state
          return mockChain(prevState ? { state: prevState } : null);
        }
        return mockChain(null);
      });

      // Should not throw
      await expect(
        heartbeat.advance('agent-1', 'issue-1', VALID_ORDER[i])
      ).resolves.not.toThrow();
    }
  });

  it('throws on invalid state transition (cannot skip states)', async () => {
    // Current state is IDENTITY_CONFIRMED, trying to jump to EXECUTING
    mockFrom.mockImplementation((table: string) => {
      if (table === 'agent_heartbeats') {
        return mockChain({ state: 'IDENTITY_CONFIRMED' });
      }
      return mockChain(null);
    });

    await expect(
      heartbeat.advance('agent-1', 'issue-1', 'EXECUTING')
    ).rejects.toThrow();
  });

  it('fail() writes FAILED state with error message', async () => {
    // fail() first calls getCurrentState, then inserts FAILED state
    // getCurrentState reads from agent_heartbeats
    const insertArgs: unknown[] = [];

    mockFrom.mockImplementation((table: string) => {
      if (table === 'agent_heartbeats') {
        const chain = mockChain(null); // no current state
        // Override insert to capture args
        (chain as Record<string, unknown>).insert = vi.fn((data: unknown) => {
          insertArgs.push(data);
          return Promise.resolve({ data: null, error: null });
        });
        return chain;
      }
      return mockChain(null);
    });

    await heartbeat.fail('agent-1', 'issue-1', 'Budget exceeded');

    expect(insertArgs.length).toBeGreaterThan(0);
    expect(insertArgs[0]).toEqual(
      expect.objectContaining({
        state: 'FAILED',
        agent_id: 'agent-1',
        issue_id: 'issue-1',
      })
    );
  });

  it('getCurrentState returns correct last state', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'agent_heartbeats') {
        return mockChain({ state: 'PLAN_READ' });
      }
      return mockChain(null);
    });

    const state = await heartbeat.getCurrentState('agent-1', 'issue-1');
    expect(state).toBe('PLAN_READ');
  });
});

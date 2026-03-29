import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();

vi.mock('../../lib/supabase.js', () => ({
  getSupabaseAdmin: () => ({ from: mockFrom }),
}));

vi.mock('../../lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { ConfigVersioning } from '../config-versioning.js';

describe('ConfigVersioning', () => {
  let cv: ConfigVersioning;

  beforeEach(() => {
    vi.clearAllMocks();
    cv = new ConfigVersioning();
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

  it('recordChange inserts into agent_config_history', async () => {
    const chain = mockChain({ id: 'history-1' });
    mockFrom.mockImplementation(() => chain);

    const result = await cv.recordChange({
      agent_id: 'agent-1',
      changed_field: 'custom_rules',
      old_value: ['rule1'],
      new_value: ['rule1', 'rule2'],
      changed_by: 'operator',
    });

    expect(mockFrom).toHaveBeenCalledWith('agent_config_history');
    expect(result).toBe('history-1');
  });

  it('recordChanges only records fields that actually changed', async () => {
    const insertCalls: unknown[] = [];
    mockFrom.mockImplementation(() => {
      const chain = mockChain({ id: 'h-1' });
      const origInsert = chain.insert as ReturnType<typeof vi.fn>;
      chain.insert = vi.fn((...args: unknown[]) => {
        insertCalls.push(args[0]);
        return origInsert(...args);
      });
      return chain;
    });

    await cv.recordChanges(
      'agent-1',
      'operator',
      { name: 'Agent Alpha', model_tier: 'ROUTINE', custom_rules: [] },
      { name: 'Agent Alpha', model_tier: 'TECHNICAL', custom_rules: ['new rule'] }
    );

    // name didn't change, so only 2 inserts (model_tier + custom_rules)
    expect(insertCalls.length).toBe(2);
  });

  it('rollbackToVersion reverts fields after target', async () => {
    // First call: get target record timestamp
    // Second call: get changes to revert
    // Third call: update agents table
    // Fourth call: record the rollback itself
    let callCount = 0;

    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === 'agent_config_history' && callCount <= 2) {
        if (callCount === 1) {
          // Target record
          return mockChain({ created_at: '2026-03-20T00:00:00Z' });
        }
        // Changes to revert
        return mockChain([
          { changed_field: 'model_tier', old_value: 'ROUTINE' },
          { changed_field: 'custom_rules', old_value: ['original'] },
        ]);
      }
      if (table === 'agents') {
        return mockChain(null);
      }
      // Record rollback change
      return mockChain({ id: 'rollback-1' });
    });

    const result = await cv.rollbackToVersion('agent-1', 'history-5');
    expect(result.success).toBe(true);
    expect(result.fieldsRolledBack).toContain('model_tier');
    expect(result.fieldsRolledBack).toContain('custom_rules');
  });

  it('rollbackToVersion returns failure when target not found', async () => {
    mockFrom.mockImplementation(() => mockChain(null));

    const result = await cv.rollbackToVersion('agent-1', 'nonexistent');
    expect(result.success).toBe(false);
    expect(result.fieldsRolledBack).toEqual([]);
  });
});

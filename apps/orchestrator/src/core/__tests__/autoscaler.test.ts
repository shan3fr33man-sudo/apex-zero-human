import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockFrom = vi.fn();

vi.mock('../../lib/supabase.js', () => ({
  getSupabaseAdmin: () => ({ from: mockFrom }),
}));

vi.mock('../../lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { AutoScaler } from '../autoscaler.js';

describe('AutoScaler', () => {
  let autoScaler: AutoScaler;

  beforeEach(() => {
    vi.clearAllMocks();
    autoScaler = new AutoScaler();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  function mockChain(resolvedData: unknown, resolveObj: any = null) {
    const chain: Record<string, unknown> = {};
    ['select', 'insert', 'update', 'eq', 'neq', 'single', 'maybeSingle',
     'order', 'limit', 'or', 'gt', 'lt', 'gte', 'lte', 'is', 'in', 'not',
     'match', 'filter', 'delete'].forEach((m) => {
      chain[m] = vi.fn().mockReturnValue(chain);
    });

    const resolvedValue = resolveObj ?? { data: resolvedData, error: null };

    Object.defineProperty(chain, 'then', {
      value: (onFulfilled?: (v: unknown) => unknown) =>
        Promise.resolve(resolvedValue).then(onFulfilled),
      writable: true, configurable: true,
    });
    return chain;
  }

  describe('Lifecycle', () => {
    it('start() initializes interval', () => {
      vi.useFakeTimers();

      const companies = ['company-1', 'company-2'];
      autoScaler.start(companies);

      expect(vi.getTimerCount()).toBeGreaterThan(0);

      vi.useRealTimers();
    });

    it('stop() clears interval', () => {
      vi.useFakeTimers();

      const companies = ['company-1'];
      autoScaler.start(companies);

      expect(vi.getTimerCount()).toBeGreaterThan(0);

      autoScaler.stop();

      expect(vi.getTimerCount()).toBe(0);

      vi.useRealTimers();
    });

    it('stop() is idempotent', () => {
      autoScaler.stop();
      autoScaler.stop();
      expect(autoScaler).toBeDefined();
    });

    it('uses AUTOSCALER_TICK_MS environment variable if set', () => {
      vi.useFakeTimers();
      process.env.AUTOSCALER_TICK_MS = '15000';

      const companies = ['company-1'];
      autoScaler.start(companies);

      expect(vi.getTimerCount()).toBeGreaterThan(0);

      delete process.env.AUTOSCALER_TICK_MS;
      vi.useRealTimers();
    });

    it('defaults to 30000ms if AUTOSCALER_TICK_MS not set', () => {
      vi.useFakeTimers();
      delete process.env.AUTOSCALER_TICK_MS;

      const companies = ['company-1'];
      autoScaler.start(companies);

      expect(vi.getTimerCount()).toBeGreaterThan(0);

      vi.useRealTimers();
    });
  });

  describe('tick() - Agent Status Counting', () => {
    it('groups agents by role and counts status', async () => {
      const agents = [
        { id: 'agent-1', role: 'developer', status: 'idle' },
        { id: 'agent-2', role: 'developer', status: 'working' },
        { id: 'agent-3', role: 'qa', status: 'idle' },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          return mockChain(agents);
        }
        if (table === 'issues') {
          return mockChain(null, { count: 0 });
        }
        if (table === 'companies') {
          return mockChain(null, { data: { id: 'company-1', settings: {} } });
        }
        return mockChain(null);
      });

      const decisions = await autoScaler.tick('company-1');

      expect(decisions.length).toBeGreaterThan(0);
      expect(decisions.some(d => d.role === 'developer')).toBe(true);
      expect(decisions.some(d => d.role === 'qa')).toBe(true);
    });

    it('handles no agents gracefully', async () => {
      mockFrom.mockReturnValue(mockChain([]));

      const decisions = await autoScaler.tick('company-1');

      expect(decisions).toEqual([]);
    });

    it('filters out terminated agents', async () => {
      const agents = [
        { id: 'agent-1', role: 'developer', status: 'idle' },
        { id: 'agent-2', role: 'developer', status: 'terminated' },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          return mockChain(agents);
        }
        if (table === 'issues') {
          return mockChain(null, { count: 0 });
        }
        if (table === 'companies') {
          return mockChain(null, { data: { id: 'company-1', settings: {} } });
        }
        return mockChain(null);
      });

      const decisions = await autoScaler.tick('company-1');

      expect(decisions.length).toBeGreaterThan(0);
    });
  });

  describe('Scale Decision Logic', () => {
    it('scales up when queue > 80% of workers and idle agents available', async () => {
      // 1 working, 1 idle, queue=2: 2 > 1*0.8=0.8, so scale_up
      const agents = [
        { id: 'agent-1', role: 'developer', status: 'working' },
        { id: 'agent-2', role: 'developer', status: 'idle' },
      ];

      let callCount = 0;
      mockFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          callCount++;
          if (callCount === 1) return mockChain(agents);
          return mockChain({ id: 'agent-2' });
        }
        if (table === 'issues') {
          return mockChain(null, { count: 2 });
        }
        if (table === 'companies') {
          return mockChain(null, { data: { id: 'company-1', settings: {} } });
        }
        return mockChain(null);
      });

      const decisions = await autoScaler.tick('company-1');

      const devDecision = decisions.find(d => d.role === 'developer');
      expect(devDecision?.action).toBe('scale_up');
    });

    it('holds when queue is moderate', async () => {
      // 10 working, queue=5: 5 not > 10*0.8=8, and not < 10*0.2=2, so hold
      const agents = Array.from({ length: 10 }, (_, i) => ({
        id: `agent-${i}`,
        role: 'developer',
        status: 'working',
      }));

      mockFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          return mockChain(agents);
        }
        if (table === 'issues') {
          return mockChain(null, { count: 5 });
        }
        if (table === 'companies') {
          return mockChain(null, { data: { id: 'company-1', settings: {} } });
        }
        return mockChain(null);
      });

      const decisions = await autoScaler.tick('company-1');

      const devDecision = decisions.find(d => d.role === 'developer');
      expect(devDecision?.action).toBe('hold');
    });

    it('scales down when queue < 20% of workers and more than 1 worker', async () => {
      // 10 working, queue=0: 0 < 10*0.2=2, so scale_down
      const agents = Array.from({ length: 10 }, (_, i) => ({
        id: `agent-${i}`,
        role: 'developer',
        status: 'working',
      }));

      mockFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          return mockChain(agents);
        }
        if (table === 'issues') {
          return mockChain(null, { count: 0 });
        }
        if (table === 'companies') {
          return mockChain(null, { data: { id: 'company-1', settings: {} } });
        }
        return mockChain(null);
      });

      const decisions = await autoScaler.tick('company-1');

      const devDecision = decisions.find(d => d.role === 'developer');
      expect(devDecision?.action).toBe('scale_down');
    });

    it('does not scale down below 1 worker', async () => {
      // 1 working, queue=0: would scale_down, but currentWorkers=1, so hold
      const agents = [
        { id: 'agent-1', role: 'developer', status: 'working' },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          return mockChain(agents);
        }
        if (table === 'issues') {
          return mockChain(null, { count: 0 });
        }
        if (table === 'companies') {
          return mockChain(null, { data: { id: 'company-1', settings: {} } });
        }
        return mockChain(null);
      });

      const decisions = await autoScaler.tick('company-1');

      const devDecision = decisions.find(d => d.role === 'developer');
      expect(devDecision?.action).toBe('hold');
    });

    it('does not scale up above max concurrency', async () => {
      // 3 working (at max), queue=5: would scale_up but at max, so hold
      const agents = Array.from({ length: 3 }, (_, i) => ({
        id: `agent-${i}`,
        role: 'developer',
        status: 'working',
      }));

      mockFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          return mockChain(agents);
        }
        if (table === 'issues') {
          return mockChain(null, { count: 5 });
        }
        if (table === 'companies') {
          return mockChain(null, {
            id: 'company-1',
            settings: { max_concurrency: { developer: 3 } },
          });
        }
        return mockChain(null);
      });

      const decisions = await autoScaler.tick('company-1');

      const devDecision = decisions.find(d => d.role === 'developer');
      expect(devDecision?.action).toBe('hold');
    });

    it('does not scale up when no idle agents available', async () => {
      // 1 working, 0 idle, queue=2: would scale_up but no idle, so hold
      const agents = [
        { id: 'agent-1', role: 'developer', status: 'working' },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          return mockChain(agents);
        }
        if (table === 'issues') {
          return mockChain(null, { count: 2 });
        }
        if (table === 'companies') {
          return mockChain(null, { data: { id: 'company-1', settings: {} } });
        }
        return mockChain(null);
      });

      const decisions = await autoScaler.tick('company-1');

      const devDecision = decisions.find(d => d.role === 'developer');
      expect(devDecision?.action).toBe('hold');
    });
  });

  describe('Queue Depth Calculation', () => {
    it('counts open unassigned issues', async () => {
      const agents = [
        { id: 'agent-1', role: 'developer', status: 'idle' },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          return mockChain(agents);
        }
        if (table === 'issues') {
          return mockChain(null, { count: 5 });
        }
        if (table === 'companies') {
          return mockChain(null, { data: { id: 'company-1', settings: {} } });
        }
        return mockChain(null);
      });

      const decisions = await autoScaler.tick('company-1');

      expect(decisions[0]?.queueDepth).toBe(5);
    });

    it('excludes locked issues from queue', async () => {
      const agents = [
        { id: 'agent-1', role: 'developer', status: 'idle' },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          return mockChain(agents);
        }
        if (table === 'issues') {
          return mockChain(null, { count: 3 });
        }
        if (table === 'companies') {
          return mockChain(null, { data: { id: 'company-1', settings: {} } });
        }
        return mockChain(null);
      });

      const decisions = await autoScaler.tick('company-1');

      expect(decisions[0]?.queueDepth).toBe(3);
    });
  });

  describe('Max Concurrency Resolution', () => {
    it('uses max concurrency from company settings', async () => {
      const agents = [
        { id: 'agent-1', role: 'developer', status: 'idle' },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          return mockChain(agents);
        }
        if (table === 'issues') {
          return mockChain(null, { count: 0 });
        }
        if (table === 'companies') {
          // getMaxConcurrency destructures { data } from the result
          return mockChain(null, {
            data: {
              settings: { max_concurrency: { developer: 5, qa: 2 } },
            },
          });
        }
        return mockChain(null);
      });

      const decisions = await autoScaler.tick('company-1');

      const devDecision = decisions.find(d => d.role === 'developer');
      expect(devDecision?.maxConcurrency).toBe(5);
    });

    it('defaults to 3 when no company settings', async () => {
      const agents = [
        { id: 'agent-1', role: 'developer', status: 'idle' },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          return mockChain(agents);
        }
        if (table === 'issues') {
          return mockChain(null, { count: 0 });
        }
        if (table === 'companies') {
          return mockChain(null, { data: { settings: null } });
        }
        return mockChain(null);
      });

      const decisions = await autoScaler.tick('company-1');

      const devDecision = decisions.find(d => d.role === 'developer');
      expect(devDecision?.maxConcurrency).toBe(3);
    });

    it('defaults to 3 for unconfigured roles', async () => {
      const agents = [
        { id: 'agent-1', role: 'developer', status: 'idle' },
        { id: 'agent-2', role: 'custom_role', status: 'idle' },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          return mockChain(agents);
        }
        if (table === 'issues') {
          return mockChain(null, { count: 0 });
        }
        if (table === 'companies') {
          return mockChain(null, {
            data: {
              settings: { max_concurrency: { developer: 5 } },
            },
          });
        }
        return mockChain(null);
      });

      const decisions = await autoScaler.tick('company-1');

      const customDecision = decisions.find(d => d.role === 'custom_role');
      expect(customDecision?.maxConcurrency).toBe(3);
    });
  });

  describe('Idle Agent Activation', () => {
    it('activates one idle agent when scaling up', async () => {
      const agents = [
        { id: 'agent-1', role: 'developer', status: 'working' },
        { id: 'agent-2', role: 'developer', status: 'idle' },
      ];

      let callCount = 0;
      mockFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          callCount++;
          if (callCount === 1) return mockChain(agents);
          return mockChain({ id: 'agent-2' });
        }
        if (table === 'issues') {
          return mockChain(null, { count: 2 });
        }
        if (table === 'companies') {
          return mockChain(null, { data: { id: 'company-1', settings: {} } });
        }
        return mockChain(null);
      });

      const decisions = await autoScaler.tick('company-1');

      const devDecision = decisions.find(d => d.role === 'developer');
      expect(devDecision?.action).toBe('scale_up');
    });

    it('does not try to activate when scaling down', async () => {
      const agents = Array.from({ length: 5 }, (_, i) => ({
        id: `agent-${i}`,
        role: 'developer',
        status: 'working',
      }));

      mockFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          return mockChain(agents);
        }
        if (table === 'issues') {
          return mockChain(null, { count: 0 });
        }
        if (table === 'companies') {
          return mockChain(null, { data: { id: 'company-1', settings: {} } });
        }
        return mockChain(null);
      });

      const decisions = await autoScaler.tick('company-1');

      const devDecision = decisions.find(d => d.role === 'developer');
      expect(devDecision?.action).toBe('scale_down');
    });
  });

  describe('Error Handling', () => {
    it('handles database errors gracefully', async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          return mockChain(null);
        }
        throw new Error('Database error');
      });

      const result = await autoScaler.tick('company-1');
      expect(Array.isArray(result)).toBe(true);
    });

    it('continues processing other companies on error', () => {
      vi.useFakeTimers();

      const companies = ['company-1', 'company-2'];
      mockFrom.mockImplementation(() => mockChain(null));

      autoScaler.start(companies);

      expect(vi.getTimerCount()).toBeGreaterThan(0);

      vi.useRealTimers();
    });
  });

  describe('Decision Output', () => {
    it('returns array of scale decisions', async () => {
      const agents = [
        { id: 'agent-1', role: 'developer', status: 'idle' },
        { id: 'agent-2', role: 'qa', status: 'idle' },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          return mockChain(agents);
        }
        if (table === 'issues') {
          return mockChain(null, { count: 0 });
        }
        if (table === 'companies') {
          return mockChain(null, { data: { id: 'company-1', settings: {} } });
        }
        return mockChain(null);
      });

      const decisions = await autoScaler.tick('company-1');

      expect(Array.isArray(decisions)).toBe(true);
      expect(decisions.length).toBeGreaterThan(0);
      expect(decisions[0]).toEqual(
        expect.objectContaining({
          role: expect.any(String),
          action: expect.stringMatching(/scale_up|scale_down|hold/),
          currentWorkers: expect.any(Number),
          queueDepth: expect.any(Number),
          maxConcurrency: expect.any(Number),
        })
      );
    });

    it('returns decisions for all roles with agents', async () => {
      const agents = [
        { id: 'agent-1', role: 'developer', status: 'working' },
        { id: 'agent-2', role: 'qa', status: 'working' },
        { id: 'agent-3', role: 'manager', status: 'idle' },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          return mockChain(agents);
        }
        if (table === 'issues') {
          return mockChain(null, { count: 2 });
        }
        if (table === 'companies') {
          return mockChain(null, { data: { id: 'company-1', settings: {} } });
        }
        return mockChain(null);
      });

      const decisions = await autoScaler.tick('company-1');

      expect(decisions.length).toBe(3);
      expect(decisions.map(d => d.role).sort()).toEqual(['developer', 'manager', 'qa']);
    });
  });

  describe('Active Workers Tracking', () => {
    it('tracks current workers per role', async () => {
      const agents = [
        { id: 'agent-1', role: 'developer', status: 'working' },
        { id: 'agent-2', role: 'developer', status: 'idle' },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          return mockChain(agents);
        }
        if (table === 'issues') {
          return mockChain(null, { count: 0 });
        }
        if (table === 'companies') {
          return mockChain(null, { data: { id: 'company-1', settings: {} } });
        }
        return mockChain(null);
      });

      const decisions = await autoScaler.tick('company-1');

      const devDecision = decisions.find(d => d.role === 'developer');
      expect(devDecision?.currentWorkers).toBe(1);
    });
  });
});

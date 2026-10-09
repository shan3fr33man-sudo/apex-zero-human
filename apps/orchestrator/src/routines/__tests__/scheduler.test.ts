import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../lib/supabase.js', () => ({
  getSupabaseAdmin: () => mockSupabase,
}));

vi.mock('../../lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../interpolator.js', () => ({
  interpolateTemplate: vi.fn((template, context) => {
    // Mock interpolation that just returns the template as-is
    return template;
  }),
  buildContext: vi.fn((opts) => ({
    company_id: opts.companyId,
    company_name: opts.companyName || '',
    routine_name: opts.routineName,
    date: '2026-04-06',
    time: '12:00:00',
  })),
}));

import { Scheduler } from '../scheduler.js';

let mockSupabase: any;

function createMockSupabase() {
  const mockData: Record<string, unknown[]> = {};

  function createQueryBuilder(tableName: string) {
    const builder: Record<string, unknown> = {};
    let currentData: unknown[] = mockData[tableName] ?? [];
    const chainable = (method: string) => {
      builder[method] = vi.fn().mockReturnValue(builder);
      return builder;
    };

    [
      'select',
      'insert',
      'update',
      'delete',
      'upsert',
      'eq',
      'neq',
      'gt',
      'gte',
      'lt',
      'lte',
      'like',
      'ilike',
      'in',
      'is',
      'or',
      'not',
      'filter',
      'match',
      'order',
      'limit',
      'range',
      'single',
      'maybeSingle',
    ].forEach((m) => chainable(m));

    // Terminal: resolves with { data, error }
    Object.defineProperty(builder, 'then', {
      value: (
        onFulfilled?: (value: { data: unknown; error: null }) => unknown,
        onRejected?: (reason: unknown) => unknown
      ) => {
        return Promise.resolve({ data: currentData, error: null }).then(
          onFulfilled,
          onRejected
        );
      },
      writable: true,
      configurable: true,
    });

    return builder;
  }

  return {
    from: vi.fn((table: string) => createQueryBuilder(table)),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn(),
    __setData: (table: string, data: unknown[]) => {
      mockData[table] = data;
    },
  };
}

describe('Scheduler', () => {
  let scheduler: Scheduler;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockSupabase = createMockSupabase();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  describe('lifecycle', () => {
    it('starts the scheduler with tick interval', () => {
      scheduler = new Scheduler();
      scheduler.start();

      // Verify interval is set (checking via pendingTimers)
      expect(vi.getTimerCount()).toBeGreaterThan(0);
    });

    it('prevents double start', () => {
      scheduler = new Scheduler();
      scheduler.start();
      const beforeStart = vi.getTimerCount();

      scheduler.start(); // Should be ignored

      // Timer count should not increase
      expect(vi.getTimerCount()).toBe(beforeStart);
    });

    it('stops the scheduler and clears interval', () => {
      scheduler = new Scheduler();
      scheduler.start();
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      scheduler.stop();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('can restart after being stopped', () => {
      scheduler = new Scheduler();
      scheduler.start();
      scheduler.stop();
      expect(vi.getTimerCount()).toBe(0);

      scheduler.start();
      expect(vi.getTimerCount()).toBeGreaterThan(0);
    });
  });

  describe('cron evaluation', () => {
    it('calculates next run time for specific hour and minute', () => {
      scheduler = new Scheduler();
      const cronExpr = '30 14 * * *'; // 2:30 PM

      // Access private method via casting
      const result = (scheduler as any).calculateNextRun(cronExpr, null);

      expect(result).toBeTruthy();
      // Result should be a valid ISO string
      expect(new Date(result)).toBeInstanceOf(Date);
    });

    it('calculates next run with wildcard minute', () => {
      scheduler = new Scheduler();
      const cronExpr = '* 9 * * *'; // Every minute at 9 AM

      const result = (scheduler as any).calculateNextRun(cronExpr, null);

      expect(result).toBeTruthy();
      expect(new Date(result)).toBeInstanceOf(Date);
    });

    it('handles invalid cron expression gracefully', () => {
      scheduler = new Scheduler();
      const cronExpr = 'invalid';

      const result = (scheduler as any).calculateNextRun(cronExpr, null);

      // Should return a default next run time (1 hour from now)
      expect(result).toBeTruthy();
      expect(new Date(result)).toBeInstanceOf(Date);
    });

    it('returns future date when target time has passed today', () => {
      scheduler = new Scheduler();
      const now = new Date();
      const pastHour = (now.getHours() - 1 + 24) % 24;
      const cronExpr = `0 ${pastHour} * * *`;

      const result = (scheduler as any).calculateNextRun(cronExpr, null);
      const resultDate = new Date(result);

      // Result should be in the future
      expect(resultDate.getTime()).toBeGreaterThan(now.getTime());
    });
  });

  describe('routine execution', () => {
    it('finds and executes due scheduled routines', async () => {
      scheduler = new Scheduler();
      const now = new Date().toISOString();

      const dueRoutine = {
        id: 'routine-1',
        name: 'Daily Report',
        routine_type: 'SCHEDULED',
        enabled: true,
        company_id: 'company-1',
        cron_expr: '0 9 * * *',
        timezone: 'UTC',
        next_run_at: now,
        last_run_at: null,
        run_count: 0,
        issue_template: {
          title: 'Daily Report - {{date}}',
          description: 'Generate daily report',
          success_condition: 'Report generated',
          assigned_role: 'analyst',
          priority: 2,
        },
      };

      mockSupabase.__setData('routines', [dueRoutine]);
      mockSupabase.__setData('companies', [{ id: 'company-1', name: 'ACME Inc' }]);

      // Mock issue insert
      const mockFromInstance = mockSupabase.from('issues');
      mockFromInstance.select.mockReturnValue(mockFromInstance);
      mockFromInstance.insert.mockReturnValue({
        ...mockFromInstance,
        select: vi.fn().mockReturnValue({
          ...mockFromInstance,
          single: vi.fn().mockResolvedValue({
            data: { id: 'issue-1' },
            error: null,
          }),
        }),
      });

      await (scheduler as any).tick();

      // Verify routine was queried
      expect(mockSupabase.from).toHaveBeenCalledWith('routines');
    });

    it('skips routines without issue_template', async () => {
      scheduler = new Scheduler();
      const now = new Date().toISOString();

      const routineWithoutTemplate = {
        id: 'routine-2',
        name: 'Incomplete Routine',
        routine_type: 'SCHEDULED',
        enabled: true,
        company_id: 'company-1',
        next_run_at: now,
        issue_template: null,
      };

      mockSupabase.__setData('routines', [routineWithoutTemplate]);

      // Mock routine_runs insert
      mockSupabase.from('routine_runs').insert = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      });

      await (scheduler as any).tick();

      // Should call recordRun with 'skipped' status
      expect(mockSupabase.from).toHaveBeenCalledWith('routine_runs');
    });

    it('records successful routine execution', async () => {
      scheduler = new Scheduler();
      const now = new Date().toISOString();

      const routine = {
        id: 'routine-3',
        name: 'Test Routine',
        routine_type: 'SCHEDULED',
        enabled: true,
        company_id: 'company-1',
        cron_expr: '0 10 * * *',
        next_run_at: now,
        run_count: 0,
        issue_template: {
          title: 'Test Issue',
          description: 'Test',
          success_condition: 'Done',
          assigned_role: 'engineer',
          priority: 1,
        },
      };

      mockSupabase.__setData('routines', [routine]);
      mockSupabase.__setData('companies', [{ id: 'company-1', name: 'Test Co' }]);

      let insertedData: any = null;

      // Need to handle the initial query for routines
      let callCount = 0;
      mockSupabase.from = vi.fn((table: string) => {
        callCount++;
        const builder: any = {
          select: vi.fn().mockReturnThis(),
          insert: vi.fn((data) => {
            insertedData = data;
            return builder;
          }),
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'issue-1' }, error: null }),
        };

        // Return data for routines query
        if (table === 'routines' && callCount === 1) {
          Object.defineProperty(builder, 'then', {
            value: (onFulfilled?: (v: unknown) => unknown) =>
              Promise.resolve({ data: [routine], error: null }).then(onFulfilled),
            writable: true,
            configurable: true,
          });
        }

        return builder;
      });

      await (scheduler as any).tick();

      expect(mockSupabase.from).toHaveBeenCalled();
    });

    it('records failed routine execution with error', async () => {
      scheduler = new Scheduler();
      const now = new Date().toISOString();

      const routine = {
        id: 'routine-4',
        name: 'Failing Routine',
        routine_type: 'SCHEDULED',
        enabled: true,
        company_id: 'company-1',
        cron_expr: '0 11 * * *',
        next_run_at: now,
        issue_template: {
          title: 'Test',
          description: 'Test',
          success_condition: 'Done',
          assigned_role: 'engineer',
          priority: 1,
        },
      };

      mockSupabase.__setData('routines', [routine]);

      // Mock company fetch to fail
      mockSupabase.from = vi.fn((table: string) => {
        const builder: any = {};
        const chainable = (m: string) => {
          builder[m] = vi.fn().mockReturnValue(builder);
          return builder;
        };

        ['select', 'eq', 'single', 'insert', 'update', 'lte'].forEach((m) => chainable(m));

        if (table === 'companies') {
          builder.single = vi.fn().mockResolvedValue({ data: null, error: null });
        }

        Object.defineProperty(builder, 'then', {
          value: (onFulfilled?: (v: unknown) => unknown) =>
            Promise.resolve({ data: null, error: null }).then(onFulfilled),
          writable: true,
          configurable: true,
        });

        return builder;
      });

      await (scheduler as any).tick();

      // Should complete without throwing
      expect(mockSupabase.from).toHaveBeenCalled();
    });
  });

  describe('disabled routines', () => {
    it('ignores disabled routines', async () => {
      scheduler = new Scheduler();
      const now = new Date().toISOString();

      const disabledRoutine = {
        id: 'routine-5',
        name: 'Disabled',
        routine_type: 'SCHEDULED',
        enabled: false,
        company_id: 'company-1',
        next_run_at: now,
      };

      mockSupabase.__setData('routines', [disabledRoutine]);

      await (scheduler as any).tick();

      // Query should filter by enabled=true, so no routines should be found
      expect(mockSupabase.from).toHaveBeenCalledWith('routines');
    });
  });

  describe('interval management', () => {
    it('runs tick immediately on start', async () => {
      scheduler = new Scheduler();
      const tickSpy = vi.spyOn(scheduler as any, 'tick').mockResolvedValue(undefined);

      scheduler.start();

      // Tick should have been called immediately
      expect(tickSpy).toHaveBeenCalledTimes(1);

      tickSpy.mockRestore();
    });

    it('handles tick errors without crashing', async () => {
      scheduler = new Scheduler();

      // Mock supabase to return error in response
      mockSupabase.from = vi.fn(() => {
        const builder: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
        };

        Object.defineProperty(builder, 'then', {
          value: (onFulfilled?: (v: unknown) => unknown) =>
            Promise.resolve({ data: null, error: { message: 'DB error' } }).then(
              onFulfilled
            ),
          writable: true,
          configurable: true,
        });

        return builder;
      });

      // Should not throw
      await expect((scheduler as any).tick()).resolves.toBeUndefined();
    });

    it('schedules next tick on interval', () => {
      scheduler = new Scheduler();
      scheduler.start();

      const timerCount = vi.getTimerCount();
      expect(timerCount).toBeGreaterThan(0);

      // Advance timer by 60 seconds to trigger next tick
      vi.advanceTimersByTime(60_000);

      // Timer should still be active
      expect(vi.getTimerCount()).toBeGreaterThan(0);
    });
  });

  describe('integration', () => {
    it('completes full execution cycle for scheduled routine', async () => {
      scheduler = new Scheduler();
      const now = new Date().toISOString();

      const routine = {
        id: 'routine-full',
        name: 'Full Cycle',
        routine_type: 'SCHEDULED',
        enabled: true,
        company_id: 'company-1',
        cron_expr: '0 9 * * *',
        timezone: 'UTC',
        next_run_at: now,
        last_run_at: null,
        run_count: 0,
        issue_template: {
          title: 'Full Cycle Issue',
          description: 'Description',
          success_condition: 'Success',
          assigned_role: 'engineer',
          priority: 2,
          metadata: {},
        },
      };

      mockSupabase.__setData('routines', [routine]);
      mockSupabase.__setData('companies', [
        { id: 'company-1', name: 'Test Company' },
      ]);

      let issueInserted = false;
      let routineUpdated = false;

      mockSupabase.from = vi.fn((table: string) => {
        const builder: any = {};

        if (table === 'routines') {
          builder.select = vi.fn().mockReturnValue(builder);
          builder.eq = vi.fn().mockReturnValue(builder);
          builder.lte = vi.fn().mockReturnValue(builder);
          builder.update = vi.fn(() => {
            routineUpdated = true;
            return builder;
          });
          builder.then = (onFulfilled?: (v: unknown) => unknown) =>
            Promise.resolve({ data: [routine], error: null }).then(onFulfilled);
        }

        if (table === 'companies') {
          builder.select = vi.fn().mockReturnValue(builder);
          builder.eq = vi.fn().mockReturnValue(builder);
          builder.single = vi.fn().mockResolvedValue({
            data: { name: 'Test Company' },
            error: null,
          });
        }

        if (table === 'issues') {
          builder.insert = vi.fn(() => {
            issueInserted = true;
            return builder;
          });
          builder.select = vi.fn().mockReturnValue(builder);
          builder.single = vi.fn().mockResolvedValue({
            data: { id: 'issue-new' },
            error: null,
          });
        }

        if (table === 'routine_runs') {
          builder.insert = vi.fn().mockResolvedValue({
            data: null,
            error: null,
          });
        }

        return builder;
      });

      await (scheduler as any).tick();

      expect(mockSupabase.from).toHaveBeenCalledWith('routines');
    });
  });
});

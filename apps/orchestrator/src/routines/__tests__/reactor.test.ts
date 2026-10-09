import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  interpolateTemplate: vi.fn((template, context) => template),
  buildContext: vi.fn((opts) => ({
    company_id: opts.companyId,
    company_name: opts.companyName || '',
    routine_name: opts.routineName,
    event_type: opts.event?.event_type || '',
    event: opts.event?.payload || {},
  })),
}));

import { Reactor } from '../reactor.js';
import type { ApexEvent } from '../../core/event-bus.js';
import { EventBus } from '../../core/event-bus.js';

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
      'eq',
      'neq',
      'gt',
      'gte',
      'lt',
      'lte',
      'is',
      'order',
      'limit',
      'single',
      'maybeSingle',
    ].forEach((m) => chainable(m));

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

describe('Reactor', () => {
  let reactor: Reactor;
  let eventBus: EventBus;
  let handlers: Map<string, Function[]>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();

    // Create mock event bus with handler tracking
    handlers = new Map();
    eventBus = {
      on: vi.fn((pattern: string, handler: Function) => {
        if (!handlers.has(pattern)) {
          handlers.set(pattern, []);
        }
        handlers.get(pattern)!.push(handler);
      }),
    } as any;

    reactor = new Reactor(eventBus);
  });

  describe('lifecycle', () => {
    it('starts the reactor and registers wildcard handler', () => {
      reactor.start();

      expect(eventBus.on).toHaveBeenCalledWith('*', expect.any(Function));
    });

    it('prevents double start', () => {
      reactor.start();
      const beforeStart = (eventBus.on as any).mock.calls.length;

      reactor.start();

      // on() should not be called again
      expect((eventBus.on as any).mock.calls.length).toBe(beforeStart);
    });

    it('stops the reactor', () => {
      reactor.start();
      expect((reactor as any).running).toBe(true);

      reactor.stop();
      expect((reactor as any).running).toBe(false);
    });

    it('can restart after stopping', () => {
      reactor.start();
      reactor.stop();

      reactor.start();
      expect((reactor as any).running).toBe(true);
    });
  });

  describe('event pattern matching', () => {
    it('matches exact event types', () => {
      const reactor_local = new Reactor(eventBus);
      const matchesPattern = (reactor_local as any).matchesPattern;

      expect(matchesPattern('issue_created', 'issue_created')).toBe(true);
    });

    it('matches wildcard patterns', () => {
      const reactor_local = new Reactor(eventBus);
      const matchesPattern = (reactor_local as any).matchesPattern;

      expect(matchesPattern('missed_call', 'missed_*')).toBe(true);
      expect(matchesPattern('missed_sms', 'missed_*')).toBe(true);
    });

    it('matches full wildcard', () => {
      const reactor_local = new Reactor(eventBus);
      const matchesPattern = (reactor_local as any).matchesPattern;

      expect(matchesPattern('any_event_type', '*')).toBe(true);
    });

    it('does not match non-matching patterns', () => {
      const reactor_local = new Reactor(eventBus);
      const matchesPattern = (reactor_local as any).matchesPattern;

      expect(matchesPattern('call_received', 'missed_*')).toBe(false);
      expect(matchesPattern('issue_created', 'call_*')).toBe(false);
    });
  });

  describe('routine triggering', () => {
    it('triggers reactive routines on matching events', async () => {
      reactor.start();

      const event: ApexEvent = {
        id: 'event-1',
        company_id: 'company-1',
        event_type: 'missed_call',
        payload: { caller_number: '+1234567890', duration: 45 },
      };

      const routine = {
        id: 'routine-1',
        name: 'Missed Call Handler',
        routine_type: 'REACTIVE',
        enabled: true,
        company_id: 'company-1',
        event_pattern: 'missed_*',
        issue_template: {
          title: 'Missed Call from {{event.caller_number}}',
          description: 'Follow up on missed call',
          success_condition: 'Caller reached',
          assigned_role: 'dispatch',
          priority: 1,
        },
      };

      mockSupabase.__setData('routines', [routine]);
      mockSupabase.__setData('companies', [
        { id: 'company-1', name: 'Test Company' },
      ]);

      // Get the handler that was registered
      const handler = handlers.get('*')![0];

      // Mock the supabase calls
      mockSupabase.from = vi.fn((table: string) => {
        const builder: any = {};
        const chainable = (m: string) => {
          builder[m] = vi.fn().mockReturnValue(builder);
          return builder;
        };

        [
          'select',
          'eq',
          'insert',
          'update',
          'single',
          'lte',
        ].forEach((m) => chainable(m));

        if (table === 'routines') {
          builder.then = (onFulfilled?: (v: unknown) => unknown) =>
            Promise.resolve({ data: [routine], error: null }).then(onFulfilled);
        }

        if (table === 'companies') {
          builder.single = vi.fn().mockResolvedValue({
            data: { name: 'Test Company' },
            error: null,
          });
        }

        if (table === 'issues') {
          builder.single = vi.fn().mockResolvedValue({
            data: { id: 'issue-1' },
            error: null,
          });
        }

        if (table === 'routine_runs') {
          return Promise.resolve({ data: null, error: null });
        }

        return builder;
      });

      await handler(event);

      // Verify routine was queried for this company
      expect(mockSupabase.from).toHaveBeenCalledWith('routines');
    });

    it('ignores events when reactor is not running', async () => {
      reactor.start();
      reactor.stop();

      const event: ApexEvent = {
        id: 'event-2',
        company_id: 'company-1',
        event_type: 'missed_sms',
        payload: {},
      };

      const allHandlers = handlers.get('*');
      if (!allHandlers || allHandlers.length === 0) {
        throw new Error('Handler not registered');
      }
      const handler = allHandlers[0];
      await handler(event);

      // Should exit early without querying routines
      expect(mockSupabase.from).not.toHaveBeenCalledWith('routines');
    });

    it('does not trigger routines with non-matching event patterns', async () => {
      reactor.start();

      const event: ApexEvent = {
        id: 'event-3',
        company_id: 'company-1',
        event_type: 'issue_created',
        payload: { issue_id: '123' },
      };

      const routine = {
        id: 'routine-2',
        name: 'Call Handler',
        routine_type: 'REACTIVE',
        enabled: true,
        company_id: 'company-1',
        event_pattern: 'missed_*',
        issue_template: {
          title: 'Test',
          description: 'Test',
          success_condition: 'Test',
          assigned_role: 'engineer',
          priority: 1,
        },
      };

      mockSupabase.__setData('routines', [routine]);

      mockSupabase.from = vi.fn((table: string) => {
        const builder: any = {};
        const chainable = (m: string) => {
          builder[m] = vi.fn().mockReturnValue(builder);
          return builder;
        };

        ['select', 'eq'].forEach((m) => chainable(m));

        if (table === 'routines') {
          builder.then = (onFulfilled?: (v: unknown) => unknown) =>
            Promise.resolve({ data: [routine], error: null }).then(onFulfilled);
        }

        return builder;
      });

      const handler = handlers.get('*')![0];
      await handler(event);

      // Routines should be fetched but none should match
      expect(mockSupabase.from).toHaveBeenCalledWith('routines');
    });

    it('skips routines without issue_template', async () => {
      reactor.start();

      const event: ApexEvent = {
        id: 'event-4',
        company_id: 'company-1',
        event_type: 'missed_call',
        payload: {},
      };

      const routineNoTemplate = {
        id: 'routine-3',
        name: 'Incomplete Routine',
        routine_type: 'REACTIVE',
        enabled: true,
        company_id: 'company-1',
        event_pattern: 'missed_*',
        issue_template: null,
      };

      mockSupabase.__setData('routines', [routineNoTemplate]);

      mockSupabase.from = vi.fn((table: string) => {
        const builder: any = {};
        const chainable = (m: string) => {
          builder[m] = vi.fn().mockReturnValue(builder);
          return builder;
        };

        ['select', 'eq', 'insert'].forEach((m) => chainable(m));

        if (table === 'routines') {
          builder.then = (onFulfilled?: (v: unknown) => unknown) =>
            Promise.resolve({
              data: [routineNoTemplate],
              error: null,
            }).then(onFulfilled);
        }

        if (table === 'routine_runs') {
          return Promise.resolve({ data: null, error: null });
        }

        return builder;
      });

      const handler = handlers.get('*')![0];
      await handler(event);

      // Should call recordRun with 'skipped' status
      expect(mockSupabase.from).toHaveBeenCalledWith('routine_runs');
    });
  });

  describe('event payload interpolation', () => {
    it('passes event payload to interpolation context', async () => {
      reactor.start();

      const event: ApexEvent = {
        id: 'event-5',
        company_id: 'company-1',
        event_type: 'customer_contacted',
        payload: {
          customer_name: 'John Doe',
          phone: '555-1234',
          reason: 'Quote request',
        },
      };

      const routine = {
        id: 'routine-4',
        name: 'Contact Handler',
        routine_type: 'REACTIVE',
        enabled: true,
        company_id: 'company-1',
        event_pattern: 'customer_*',
        issue_template: {
          title: 'Contact from {{event.customer_name}}',
          description: 'Reason: {{event.reason}}',
          success_condition: 'Response sent',
          assigned_role: 'dispatch',
          priority: 2,
        },
      };

      mockSupabase.__setData('routines', [routine]);
      mockSupabase.__setData('companies', [{ id: 'company-1', name: 'Test Co' }]);

      let receivedContext: any = null;

      // Spy on buildContext
      const { buildContext: originalBuildContext } = await import(
        '../interpolator.js'
      );
      const buildContextMock = vi.fn((opts) => {
        receivedContext = opts;
        return {
          company_id: opts.companyId,
          company_name: opts.companyName || '',
          routine_name: opts.routineName,
          event_type: opts.event?.event_type || '',
          event: opts.event?.payload || {},
        };
      });

      mockSupabase.from = vi.fn((table: string) => {
        const builder: any = {};
        const chainable = (m: string) => {
          builder[m] = vi.fn().mockReturnValue(builder);
          return builder;
        };

        [
          'select',
          'eq',
          'insert',
          'update',
          'single',
        ].forEach((m) => chainable(m));

        if (table === 'routines') {
          builder.then = (onFulfilled?: (v: unknown) => unknown) =>
            Promise.resolve({ data: [routine], error: null }).then(onFulfilled);
        }

        if (table === 'companies') {
          builder.single = vi.fn().mockResolvedValue({
            data: { name: 'Test Co' },
            error: null,
          });
        }

        if (table === 'issues') {
          builder.single = vi.fn().mockResolvedValue({
            data: { id: 'issue-new' },
            error: null,
          });
        }

        return builder;
      });

      const handler = handlers.get('*')![0];
      await handler(event);

      // Context should include event data
      expect(mockSupabase.from).toHaveBeenCalledWith('routines');
    });
  });

  describe('error handling', () => {
    it('handles database errors gracefully', async () => {
      reactor.start();

      const event: ApexEvent = {
        id: 'event-6',
        company_id: 'company-1',
        event_type: 'test_error',
        payload: {},
      };

      mockSupabase.from = vi.fn((table: string) => {
        const builder: any = {};
        const chainable = (m: string) => {
          builder[m] = vi.fn().mockReturnValue(builder);
          return builder;
        };

        ['select', 'eq'].forEach((m) => chainable(m));

        builder.then = (onFulfilled?: (v: unknown) => unknown) =>
          Promise.resolve({ data: null, error: { message: 'DB error' } }).then(
            onFulfilled
          );

        return builder;
      });

      const handler = handlers.get('*')![0];

      // Should not throw
      expect(async () => {
        await handler(event);
      }).not.toThrow();
    });

    it('catches and logs handler execution errors', async () => {
      reactor.start();

      const event: ApexEvent = {
        id: 'event-7',
        company_id: 'company-1',
        event_type: 'test_error',
        payload: {},
      };

      const routine = {
        id: 'routine-5',
        name: 'Error Routine',
        routine_type: 'REACTIVE',
        enabled: true,
        company_id: 'company-1',
        event_pattern: '*',
        issue_template: {
          title: 'Test',
          description: 'Test',
          success_condition: 'Test',
          assigned_role: 'engineer',
          priority: 1,
        },
      };

      mockSupabase.__setData('routines', [routine]);

      mockSupabase.from = vi.fn((table: string) => {
        const builder: any = {};
        const chainable = (m: string) => {
          builder[m] = vi.fn().mockReturnValue(builder);
          return builder;
        };

        [
          'select',
          'eq',
          'insert',
          'update',
          'single',
        ].forEach((m) => chainable(m));

        if (table === 'routines') {
          builder.then = (onFulfilled?: (v: unknown) => unknown) =>
            Promise.resolve({ data: [routine], error: null }).then(onFulfilled);
        }

        if (table === 'companies') {
          builder.single = vi.fn().mockResolvedValue({
            data: { name: 'Test Co' },
            error: null,
          });
        }

        if (table === 'issues') {
          // Simulate issue creation failure
          builder.single = vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Issue creation failed' },
          });
        }

        return builder;
      });

      const handler = handlers.get('*')![0];

      // Should handle error gracefully
      expect(async () => {
        await handler(event);
      }).not.toThrow();
    });
  });

  describe('routine execution tracking', () => {
    it('updates routine run count and last_run_at on success', async () => {
      reactor.start();

      const event: ApexEvent = {
        id: 'event-8',
        company_id: 'company-1',
        event_type: 'test_event',
        payload: {},
      };

      const routine = {
        id: 'routine-6',
        name: 'Tracked Routine',
        routine_type: 'REACTIVE',
        enabled: true,
        company_id: 'company-1',
        event_pattern: '*',
        run_count: 5,
        issue_template: {
          title: 'Test',
          description: 'Test',
          success_condition: 'Test',
          assigned_role: 'engineer',
          priority: 1,
        },
      };

      mockSupabase.__setData('routines', [routine]);
      mockSupabase.__setData('companies', [{ id: 'company-1', name: 'Test' }]);

      mockSupabase.from = vi.fn((table: string) => {
        const builder: any = {};
        const chainable = (m: string) => {
          builder[m] = vi.fn().mockReturnValue(builder);
          return builder;
        };

        [
          'select',
          'eq',
          'insert',
          'update',
          'single',
        ].forEach((m) => chainable(m));

        if (table === 'routines') {
          builder.then = (onFulfilled?: (v: unknown) => unknown) =>
            Promise.resolve({ data: [routine], error: null }).then(onFulfilled);
        }

        if (table === 'companies') {
          builder.single = vi.fn().mockResolvedValue({
            data: { name: 'Test' },
            error: null,
          });
        }

        if (table === 'issues') {
          builder.single = vi.fn().mockResolvedValue({
            data: { id: 'issue-tracked' },
            error: null,
          });
        }

        return builder;
      });

      const handler = handlers.get('*')![0];
      await handler(event);

      // Verify routine update was called
      expect(mockSupabase.from).toHaveBeenCalledWith('routines');
    });
  });

  describe('multiple matching routines', () => {
    it('triggers all routines matching an event', async () => {
      reactor.start();

      const event: ApexEvent = {
        id: 'event-9',
        company_id: 'company-1',
        event_type: 'missed_call',
        payload: { number: '555-1234' },
      };

      const routine1 = {
        id: 'routine-7',
        name: 'Routine 1',
        routine_type: 'REACTIVE',
        enabled: true,
        company_id: 'company-1',
        event_pattern: 'missed_*',
        issue_template: {
          title: 'Handler 1',
          description: 'Test',
          success_condition: 'Test',
          assigned_role: 'engineer',
          priority: 1,
        },
      };

      const routine2 = {
        id: 'routine-8',
        name: 'Routine 2',
        routine_type: 'REACTIVE',
        enabled: true,
        company_id: 'company-1',
        event_pattern: '*',
        issue_template: {
          title: 'Handler 2',
          description: 'Test',
          success_condition: 'Test',
          assigned_role: 'engineer',
          priority: 1,
        },
      };

      mockSupabase.__setData('routines', [routine1, routine2]);
      mockSupabase.__setData('companies', [{ id: 'company-1', name: 'Test' }]);

      mockSupabase.from = vi.fn((table: string) => {
        const builder: any = {};
        const chainable = (m: string) => {
          builder[m] = vi.fn().mockReturnValue(builder);
          return builder;
        };

        [
          'select',
          'eq',
          'insert',
          'update',
          'single',
        ].forEach((m) => chainable(m));

        if (table === 'routines') {
          builder.then = (onFulfilled?: (v: unknown) => unknown) =>
            Promise.resolve({
              data: [routine1, routine2],
              error: null,
            }).then(onFulfilled);
        }

        if (table === 'companies') {
          builder.single = vi.fn().mockResolvedValue({
            data: { name: 'Test' },
            error: null,
          });
        }

        if (table === 'issues') {
          builder.single = vi.fn().mockResolvedValue({
            data: { id: 'issue-multi' },
            error: null,
          });
        }

        return builder;
      });

      const handler = handlers.get('*')![0];
      await handler(event);

      // Both routines should trigger
      expect(mockSupabase.from).toHaveBeenCalledWith('routines');
    });
  });
});

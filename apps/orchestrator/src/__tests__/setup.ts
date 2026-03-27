/**
 * Vitest global setup — mocks all external services.
 * Every test gets a fresh mock Supabase client.
 */
import { vi } from 'vitest';

// ─── Mock Supabase Admin ────────────────────────────────────────────────
// All core modules call getSupabaseAdmin() — return a chainable mock
vi.mock('../lib/supabase.js', () => ({
  getSupabaseAdmin: () => createMockSupabase(),
}));

// ─── Mock Logger ────────────────────────────────────────────────────────
vi.mock('../lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ─── Mock pg Client (for EventBus LISTEN/NOTIFY) ───────────────────────
vi.mock('pg', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue({ rows: [] }),
    on: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
  })),
}));

// ─── Mock Anthropic SDK ─────────────────────────────────────────────────
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Mock LLM response' }],
        model: 'claude-haiku-4-5',
        usage: { input_tokens: 100, output_tokens: 50 },
        stop_reason: 'end_turn',
      }),
    },
  })),
}));

/**
 * Create a mock Supabase client with chainable query builder.
 * Usage: getSupabaseAdmin() returns this mock.
 */
export function createMockSupabase(overrides?: Record<string, unknown>) {
  const mockData: Record<string, unknown[]> = {};

  function createQueryBuilder(tableName: string) {
    const builder: Record<string, unknown> = {};
    let currentData: unknown[] = mockData[tableName] ?? [];
    let filterFn: ((item: Record<string, unknown>) => boolean) | null = null;

    const chainable = (method: string) => {
      builder[method] = vi.fn().mockReturnValue(builder);
      return builder;
    };

    // All chainable methods
    ['select', 'insert', 'update', 'delete', 'upsert',
     'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in', 'is',
     'or', 'not', 'filter', 'match',
     'order', 'limit', 'range', 'single', 'maybeSingle',
     'textSearch', 'containedBy', 'contains',
    ].forEach((m) => chainable(m));

    // Terminal: resolves with { data, error }
    builder.then = (resolve: (val: { data: unknown; error: null }) => void) => {
      resolve({ data: currentData, error: null });
    };

    // Make it thenable (Promise-like)
    Object.defineProperty(builder, 'then', {
      value: (
        onFulfilled?: (value: { data: unknown; error: null }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => {
        return Promise.resolve({ data: currentData, error: null }).then(
          onFulfilled,
          onRejected,
        );
      },
      writable: true,
      configurable: true,
    });

    return builder;
  }

  const supabase = {
    from: vi.fn((table: string) => createQueryBuilder(table)),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn(),
    // Allow tests to inject mock data
    __setData: (table: string, data: unknown[]) => {
      mockData[table] = data;
    },
    ...overrides,
  };

  return supabase;
}

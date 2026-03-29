import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();

vi.mock('../../lib/supabase.js', () => ({
  getSupabaseAdmin: () => ({ from: mockFrom }),
}));

vi.mock('../../lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { ToolTracer } from '../tool-tracer.js';

describe('ToolTracer', () => {
  let tracer: ToolTracer;

  beforeEach(() => {
    vi.clearAllMocks();
    tracer = new ToolTracer();
  });

  it('logToolCall inserts record to tool_call_log', async () => {
    const insertFn = vi.fn().mockReturnValue(
      Promise.resolve({ data: null, error: null })
    );
    mockFrom.mockImplementation(() => ({ insert: insertFn }));

    await tracer.logToolCall({
      agent_id: 'agent-1',
      issue_id: 'issue-1',
      tool_name: 'firecrawl.search',
      input_params: { query: 'test' },
      output_summary: 'Found 3 results',
      tokens_used: 100,
      duration_ms: 450,
    });

    expect(mockFrom).toHaveBeenCalledWith('tool_call_log');
    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        tool_name: 'firecrawl.search',
        agent_id: 'agent-1',
      })
    );
  });

  it('traceExecution wraps function with timing', async () => {
    const insertFn = vi.fn().mockReturnValue(
      Promise.resolve({ data: null, error: null })
    );
    mockFrom.mockImplementation(() => ({ insert: insertFn }));

    const result = await tracer.traceExecution(
      'agent-1',
      'issue-1',
      'test-tool',
      { param1: 'value1' },
      async () => ({ data: 'hello world', tokens_used: 50 })
    );

    expect(result).toEqual({ data: 'hello world', tokens_used: 50 });
    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        tool_name: 'test-tool',
        tokens_used: 50,
      })
    );
  });

  it('traceExecution logs errors and re-throws', async () => {
    const insertFn = vi.fn().mockReturnValue(
      Promise.resolve({ data: null, error: null })
    );
    mockFrom.mockImplementation(() => ({ insert: insertFn }));

    await expect(
      tracer.traceExecution(
        'agent-1',
        'issue-1',
        'fail-tool',
        {},
        async () => { throw new Error('tool broke'); }
      )
    ).rejects.toThrow('tool broke');

    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        output_summary: expect.stringContaining('ERROR: tool broke'),
      })
    );
  });

  it('sanitizes secrets from input params', async () => {
    const insertFn = vi.fn().mockReturnValue(
      Promise.resolve({ data: null, error: null })
    );
    mockFrom.mockImplementation(() => ({ insert: insertFn }));

    await tracer.traceExecution(
      'agent-1',
      null,
      'auth-tool',
      { apiKey: 'sk-secret-123', query: 'safe value' },
      async () => 'ok'
    );

    const insertedRecord = insertFn.mock.calls[0][0];
    expect(insertedRecord.input_params.apiKey).toBe('***REDACTED***');
    expect(insertedRecord.input_params.query).toBe('safe value');
  });
});

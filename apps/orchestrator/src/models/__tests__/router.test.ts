import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock('../../lib/supabase.js', () => ({
  getSupabaseAdmin: () => ({ from: mockFrom, rpc: mockRpc }),
}));

vi.mock('../../lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const mockAnthropicCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockAnthropicCreate },
  })),
}));

import { ModelRouter } from '../router.js';
import { TokenGateway } from '../../core/token-gateway.js';

describe('ModelRouter', () => {
  let router: ModelRouter;
  let tokenGateway: TokenGateway;

  beforeEach(() => {
    vi.clearAllMocks();
    // Set the API key so ModelRouter constructor doesn't throw
    process.env.ANTHROPIC_API_KEY = 'test-key-for-vitest';

    tokenGateway = new TokenGateway();
    router = new ModelRouter(tokenGateway);

    // Default: successful LLM call
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Hello from model' }],
      model: 'claude-haiku-4-5',
      usage: { input_tokens: 100, output_tokens: 50 },
      stop_reason: 'end_turn',
    });
  });

  it('returns correct model for STRATEGIC tier', () => {
    const model = router.getModel('STRATEGIC');
    expect(model).toContain('claude');
    // STRATEGIC uses the best model
    expect(model).toMatch(/claude-sonnet-4-6|claude-opus/);
  });

  it('returns correct model for TECHNICAL tier', () => {
    const model = router.getModel('TECHNICAL');
    expect(model).toContain('claude');
  });

  it('returns correct model for ROUTINE tier', () => {
    const model = router.getModel('ROUTINE');
    expect(model).toContain('claude');
    expect(model).toMatch(/haiku/);
  });

  it('uses override model when provided', () => {
    const model = router.getModel('ROUTINE', 'claude-sonnet-4-6');
    expect(model).toBe('claude-sonnet-4-6');
  });

  it('falls back to secondary model after 3 primary failures', async () => {
    // First 3 calls fail
    mockAnthropicCreate
      .mockRejectedValueOnce(new Error('Rate limited'))
      .mockRejectedValueOnce(new Error('Rate limited'))
      .mockRejectedValueOnce(new Error('Rate limited'))
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Fallback response' }],
        model: 'claude-haiku-4-5',
        usage: { input_tokens: 50, output_tokens: 25 },
        stop_reason: 'end_turn',
      });

    // Mock tokenGateway
    vi.spyOn(tokenGateway, 'checkBudget').mockResolvedValue({
      allowed: true,
      remaining: 999999,
    });
    vi.spyOn(tokenGateway, 'recordUsage').mockResolvedValue(undefined);

    const response = await router.call({
      companyId: 'c1',
      agentId: 'a1',
      issueId: null,
      tier: 'ROUTINE',
      systemPrompt: 'test',
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(response.content).toBe('Fallback response');
  });

  it('throws after all fallbacks exhausted', async () => {
    mockAnthropicCreate.mockRejectedValue(new Error('Service unavailable'));

    vi.spyOn(tokenGateway, 'checkBudget').mockResolvedValue({
      allowed: true,
      remaining: 999999,
    });

    await expect(
      router.call({
        companyId: 'c1',
        agentId: 'a1',
        issueId: null,
        tier: 'ROUTINE',
        systemPrompt: 'test',
        messages: [{ role: 'user', content: 'hello' }],
      })
    ).rejects.toThrow();
  });

  it('estimateTokens returns conservative positive integer', () => {
    const estimate = router.estimateTokens('Hello, this is a test message for token estimation.');
    expect(estimate).toBeGreaterThan(0);
    expect(Number.isInteger(estimate)).toBe(true);
  });
});

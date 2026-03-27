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

import { TokenGateway } from '../../core/token-gateway.js';
import { HeartbeatStateMachine } from '../../core/heartbeat.js';
import { TaskRouter } from '../../core/task-router.js';
import { ModelRouter } from '../../models/router.js';
import { ApexMemorySystem } from '../../memory/ams.js';
import { CeoAgent } from '../ceo-agent.js';
import type { AgentConfig, Issue } from '../types.js';

describe('CEO Agent — full lifecycle integration', () => {
  let ceo: CeoAgent;
  let tokenGateway: TokenGateway;
  let heartbeat: HeartbeatStateMachine;
  let taskRouter: TaskRouter;
  let modelRouter: ModelRouter;
  let memory: ApexMemorySystem;

  const heartbeatStates: string[] = [];

  function mockChain(resolvedData: unknown) {
    const chain: Record<string, unknown> = {};
    ['select', 'insert', 'update', 'eq', 'neq', 'single', 'maybeSingle',
     'order', 'limit', 'or', 'gt', 'lt', 'gte', 'lte', 'is', 'in',
     'ilike', 'textSearch', 'not', 'filter', 'match', 'delete'].forEach((m) => {
      chain[m] = vi.fn().mockReturnValue(chain);
    });
    Object.defineProperty(chain, 'then', {
      value: (onFulfilled?: (v: unknown) => unknown) =>
        Promise.resolve({ data: resolvedData, error: null }).then(onFulfilled),
      writable: true, configurable: true,
    });
    return chain;
  }

  const testConfig: AgentConfig = {
    id: 'agent-1',
    company_id: 'company-1',
    company_name: 'Test Corp',
    company_goal: 'Build a moving company',
    name: 'CEO Agent',
    role: 'ceo',
    persona: null,
    model_tier: 'STRATEGIC',
    reports_to: null,
    reports_to_name: null,
    reports_to_role: null,
    custom_rules: [],
    installed_skills: [],
    brand_guide: null,
  };

  const testIssue: Issue = {
    id: 'issue-1',
    company_id: 'company-1',
    title: 'Launch company',
    description: 'Build strategy',
    success_condition: null,
    status: 'open',
    priority: 90,
    assigned_to: null,
    parent_issue_id: null,
    metadata: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    heartbeatStates.length = 0;

    // Set env so ModelRouter doesn't throw
    process.env.ANTHROPIC_API_KEY = 'test-key-for-vitest';

    mockFrom.mockImplementation(() => mockChain([]));
    mockRpc.mockResolvedValue({ data: true, error: null });

    tokenGateway = new TokenGateway();
    heartbeat = new HeartbeatStateMachine();
    taskRouter = new TaskRouter();
    modelRouter = new ModelRouter(tokenGateway);
    memory = new ApexMemorySystem();
    ceo = new CeoAgent(tokenGateway, heartbeat, taskRouter, modelRouter, memory);

    // Track heartbeat state advances
    vi.spyOn(heartbeat, 'advance').mockImplementation(async (_agentId, _issueId, state) => {
      heartbeatStates.push(state);
    });
    vi.spyOn(heartbeat, 'getCurrentState').mockResolvedValue(null);
    vi.spyOn(heartbeat, 'fail').mockResolvedValue(undefined);

    // Mock budget check
    vi.spyOn(tokenGateway, 'checkBudget').mockResolvedValue({ allowed: true, remaining: 999999 });
    vi.spyOn(tokenGateway, 'recordUsage').mockResolvedValue(undefined);

    // Mock task router
    vi.spyOn(taskRouter, 'claimIssue').mockResolvedValue(true);
    vi.spyOn(taskRouter, 'releaseIssue').mockResolvedValue(undefined);
    vi.spyOn(taskRouter, 'completeIssue').mockResolvedValue(undefined);

    // Mock memory
    vi.spyOn(memory, 'loadContext').mockResolvedValue({
      identity: [],
      rules: [],
      recentLearnings: [],
      relevantContext: [],
    });
    vi.spyOn(memory, 'formatForPrompt').mockReturnValue('<memory></memory>');
    vi.spyOn(memory, 'storeLearning').mockResolvedValue('mem-1');

    // Mock LLM — response with valid handoff JSON
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"target_agent_id": null, "summary": "Done", "artifacts": [], "quality_score_self": 85, "memory_to_save": "Learned something"}' }],
      model: 'claude-sonnet-4-6',
      usage: { input_tokens: 200, output_tokens: 100 },
      stop_reason: 'end_turn',
    });
  });

  it('completes full heartbeat sequence in correct order', async () => {
    await ceo.execute(testConfig, testIssue);

    // Heartbeat states should follow the correct order
    expect(heartbeatStates[0]).toBe('IDENTITY_CONFIRMED');
    expect(heartbeatStates[1]).toBe('MEMORY_LOADED');
    expect(heartbeatStates).toContain('EXECUTING');
    expect(heartbeatStates).toContain('HANDOFF_COMPLETE');
  });

  it('budget check fires before any LLM call', async () => {
    const budgetCheckOrder: string[] = [];

    vi.spyOn(tokenGateway, 'checkBudget').mockImplementation(async () => {
      budgetCheckOrder.push('budget_check');
      return { allowed: true, remaining: 999999 };
    });

    mockAnthropicCreate.mockImplementation(async () => {
      budgetCheckOrder.push('llm_call');
      return {
        content: [{ type: 'text', text: '{"target_agent_id": null, "summary": "Done", "artifacts": [], "quality_score_self": 85, "memory_to_save": null}' }],
        model: 'claude-sonnet-4-6',
        usage: { input_tokens: 100, output_tokens: 50 },
        stop_reason: 'end_turn',
      };
    });

    await ceo.execute(testConfig, testIssue);

    const budgetIdx = budgetCheckOrder.indexOf('budget_check');
    const llmIdx = budgetCheckOrder.indexOf('llm_call');
    expect(budgetIdx).toBeLessThan(llmIdx);
  });

  it('memory is loaded at MEMORY_LOADED state', async () => {
    const loadContextSpy = vi.spyOn(memory, 'loadContext');

    await ceo.execute(testConfig, testIssue);

    expect(loadContextSpy).toHaveBeenCalledWith('agent-1', expect.any(String));
    expect(heartbeatStates).toContain('MEMORY_LOADED');
  });

  it('issue is claimed before EXECUTING state', async () => {
    // Note: in current base-agent, claimIssue is not called directly —
    // The heartbeat just advances through ASSIGNMENT_CLAIMED.
    // The engine calls claimIssue before execute. But we verify the state order.
    await ceo.execute(testConfig, testIssue);

    const assignedIdx = heartbeatStates.indexOf('ASSIGNMENT_CLAIMED');
    const execIdx = heartbeatStates.indexOf('EXECUTING');
    expect(assignedIdx).toBeLessThan(execIdx);
    expect(assignedIdx).toBeGreaterThanOrEqual(0);
  });
});

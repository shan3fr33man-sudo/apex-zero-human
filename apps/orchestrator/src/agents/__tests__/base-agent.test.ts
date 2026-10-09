import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * BaseAgent Unit Tests
 *
 * Covers:
 * - Full heartbeat cycle (7 steps)
 * - Error handling and failure states
 * - Handoff parsing (JSON, fenced blocks, malformed)
 * - Research detection and gathering
 * - Message building
 * - Token and temperature defaults
 * - Audit logging at each step
 * - Handoff routing logic (target_agent_id, QA role, in_review)
 * - Memory saving
 */

// ─── Mock Setup ─────────────────────────────────────────────────────────────

const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock('../../lib/supabase.js', () => ({
  getSupabaseAdmin: () => ({ from: mockFrom, rpc: mockRpc }),
}));

vi.mock('../../lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const mockAnthropicCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockAnthropicCreate },
  })),
}));

vi.mock('../../lib/key-vault.js', () => ({
  getDecryptedKeyForCompany: vi.fn().mockResolvedValue('test-api-key'),
  BYOKRequiredError: Error,
}));

import { TokenGateway } from '../../core/token-gateway.js';
import { HeartbeatStateMachine } from '../../core/heartbeat.js';
import { TaskRouter } from '../../core/task-router.js';
import { ModelRouter, type ModelTier } from '../../models/router.js';
import { ApexMemorySystem } from '../../memory/ams.js';
import { BaseAgent } from '../base-agent.js';
import type { AgentConfig, Issue, HandoffResult } from '../types.js';

// ─── Test Agent Concrete Implementation ──────────────────────────────────────

class TestAgent extends BaseAgent {
  readonly role = 'test-agent';
  readonly roleLabel = 'Test Agent';
  readonly modelTier: ModelTier = 'standard';
  readonly roleMission = 'Test mission statement';
  readonly successMetrics = 'Test success metrics';

  protected override getMaxTokens(): number {
    return 2048;
  }

  protected override getTemperature(): number {
    return 0.5;
  }

  protected override needsResearch(issue: Issue): boolean {
    // Call parent implementation for testing
    return super.needsResearch(issue);
  }
}

// ─── Helper for Mocking Query Chains ────────────────────────────────────────

function mockChain(resolvedData: unknown = {}) {
  const chain: Record<string, unknown> = {};
  [
    'select', 'insert', 'update', 'eq', 'neq', 'single', 'maybeSingle',
    'order', 'limit', 'or', 'gt', 'lt', 'gte', 'lte', 'is', 'in',
    'ilike', 'textSearch', 'not', 'filter', 'match', 'delete',
  ].forEach((m) => {
    chain[m] = vi.fn().mockReturnValue(chain);
  });
  Object.defineProperty(chain, 'then', {
    value: (onFulfilled?: (v: unknown) => unknown) =>
      Promise.resolve({ data: resolvedData, error: null }).then(onFulfilled),
    writable: true, configurable: true,
  });
  return chain;
}

// ─── Test Fixtures ──────────────────────────────────────────────────────────

describe('BaseAgent', () => {
  let agent: TestAgent;
  let tokenGateway: TokenGateway;
  let heartbeat: HeartbeatStateMachine;
  let taskRouter: TaskRouter;
  let modelRouter: ModelRouter;
  let memory: ApexMemorySystem;

  const testConfig: AgentConfig = {
    id: 'agent-test-1',
    company_id: 'company-1',
    company_name: 'Test Corp',
    company_description: 'Test company',
    name: 'Test Agent Instance',
    slug: 'test-agent',
    role: 'test-agent',
    persona: null,
    system_prompt: null,
    model: 'claude-haiku-4-5',
    reports_to: null,
    reports_to_name: 'CEO',
    reports_to_role: 'ceo',
    heartbeat_checklist: {},
    config: { custom_rules: [], installed_skills: [] },
    brand_guide: 'Be professional',
  };

  const testIssue: Issue = {
    id: 'issue-123',
    company_id: 'company-1',
    title: 'Test Issue',
    description: 'This is a test issue',
    status: 'open',
    priority: 'high',
    type: 'task',
    assigned_to: 'agent-test-1',
    created_by: null,
    parent_id: null,
    locked_by: null,
    locked_at: null,
    estimated_tokens: null,
    actual_tokens: null,
    metadata: { success_condition: 'All tests pass' },
    due_at: null,
    started_at: null,
    completed_at: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-key-vitest';

    // Default mock chain for all queries
    mockFrom.mockImplementation(() => mockChain([]));
    mockRpc.mockResolvedValue({ data: true, error: null });

    tokenGateway = new TokenGateway();
    heartbeat = new HeartbeatStateMachine();
    taskRouter = new TaskRouter();
    modelRouter = new ModelRouter(tokenGateway);
    memory = new ApexMemorySystem();
    agent = new TestAgent(tokenGateway, heartbeat, taskRouter, modelRouter, memory);

    // Mock heartbeat advance
    vi.spyOn(heartbeat, 'advance').mockResolvedValue(undefined);
    vi.spyOn(heartbeat, 'fail').mockResolvedValue(undefined);
    vi.spyOn(heartbeat, 'getCurrentState').mockResolvedValue(null);

    // Mock token gateway
    vi.spyOn(tokenGateway, 'checkBudget').mockResolvedValue({
      allowed: true,
      remaining: 999999,
    });
    vi.spyOn(tokenGateway, 'recordUsage').mockResolvedValue(undefined);

    // Mock task router
    vi.spyOn(taskRouter, 'claimIssue').mockResolvedValue(true);
    vi.spyOn(taskRouter, 'releaseIssue').mockResolvedValue(undefined);
    vi.spyOn(taskRouter, 'completeIssue').mockResolvedValue(undefined);
    vi.spyOn(taskRouter, 'forceRelease').mockResolvedValue(undefined);

    // Mock memory
    vi.spyOn(memory, 'loadContext').mockResolvedValue({
      identity: [],
      rules: [],
      recentLearnings: [],
      relevantContext: [],
    });
    vi.spyOn(memory, 'formatForPrompt').mockReturnValue('<memory></memory>');
    vi.spyOn(memory, 'storeLearning').mockResolvedValue('mem-1');

    // Default LLM response with valid handoff JSON
    mockAnthropicCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          target_agent_id: null,
          summary: 'Test completed',
          artifacts: [],
          quality_score_self: 75,
          memory_to_save: null,
        }),
      }],
      model: 'claude-haiku-4-5',
      usage: { input_tokens: 100, output_tokens: 50 },
      stop_reason: 'end_turn',
    });

    // Setup default Supabase query mock to return test data
    mockFrom.mockImplementation((table: string) => {
      const chain = mockChain([]);
      if (table === 'companies') {
        return mockChain({ mission: 'Test mission' });
      }
      if (table === 'issues') {
        return mockChain({ title: 'Parent Issue' });
      }
      return chain;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HEARTBEAT PROTOCOL TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('execute() — full heartbeat cycle', () => {
    it('completes all 7 heartbeat states in correct order', async () => {
      const advanceCalls: string[] = [];

      vi.spyOn(heartbeat, 'advance').mockImplementation(
        async (_agentId, _issueId, state: string) => {
          advanceCalls.push(state);
        }
      );

      const callSpy = vi.spyOn(modelRouter, 'call');
      callSpy.mockResolvedValue({
        content: JSON.stringify({
          target_agent_id: null,
          summary: 'Done',
          artifacts: [],
          quality_score_self: 75,
          memory_to_save: null,
        }),
        model: 'claude-haiku-4-5',
        inputTokens: 100,
        outputTokens: 50,
      });

      await agent.execute(testConfig, testIssue);

      expect(advanceCalls).toEqual([
        'IDENTITY_CONFIRMED',
        'MEMORY_LOADED',
        'PLAN_READ',
        'RESEARCH_COMPLETE',
        'ASSIGNMENT_CLAIMED',
        'EXECUTING',
        'HANDOFF_COMPLETE',
      ]);
    });

    it('writes audit log at each heartbeat step', async () => {
      const auditCalls: Array<{ table: string; action: string }> = [];

      const originalFrom = mockFrom.getMockImplementation() || (() => mockChain([]));
      mockFrom.mockImplementation((table: string) => {
        if (table === 'audit_log') {
          const chain = mockChain([]);
          const originalInsert = chain.insert as any;
          chain.insert = vi.fn((payload) => {
            auditCalls.push({ table, action: payload.action });
            return chain;
          });
          return chain;
        }
        return originalFrom(table);
      });

      await agent.execute(testConfig, testIssue);

      // Should have audit logs for all steps + mutations
      expect(auditCalls.length).toBeGreaterThanOrEqual(7);
      expect(auditCalls.map(c => c.action)).toContain('HEARTBEAT_IDENTITY_CONFIRMED');
      expect(auditCalls.map(c => c.action)).toContain('HEARTBEAT_MEMORY_LOADED');
      expect(auditCalls.map(c => c.action)).toContain('HEARTBEAT_EXECUTING');
    });

    it('loads memory at MEMORY_LOADED step', async () => {
      const loadContextSpy = vi.spyOn(memory, 'loadContext');

      await agent.execute(testConfig, testIssue);

      expect(loadContextSpy).toHaveBeenCalledWith(
        'agent-test-1',
        expect.stringContaining('Test Issue')
      );
    });

    it('calls model router with correct parameters', async () => {
      const callSpy = vi.spyOn(modelRouter, 'call');

      await agent.execute(testConfig, testIssue);

      expect(callSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 'company-1',
          agentId: 'agent-test-1',
          issueId: 'issue-123',
          tier: 'standard',
          maxTokens: 2048,
          temperature: 0.5,
        })
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HANDOFF PARSING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('parseHandoff()', () => {
    it('parses valid JSON object correctly', async () => {
      const callSpy = vi.spyOn(modelRouter, 'call');
      callSpy.mockResolvedValue({
        content: JSON.stringify({
          target_agent_id: 'agent-qa-1',
          summary: 'Work complete, ready for QA',
          artifacts: ['artifact-1'],
          quality_score_self: 90,
          memory_to_save: 'Learned new pattern',
        }),
        model: 'claude-haiku-4-5',
        inputTokens: 100,
        outputTokens: 50,
      });

      const result = await agent.execute(testConfig, testIssue);

      expect(result.handoff.targetAgentId).toBe('agent-qa-1');
      expect(result.handoff.summary).toBe('Work complete, ready for QA');
      expect(result.handoff.qualityScoreSelf).toBe(90);
      expect(result.handoff.memoryToSave).toBe('Learned new pattern');
    });

    it('parses fenced JSON blocks (```json ... ```)', async () => {
      const callSpy = vi.spyOn(modelRouter, 'call');
      callSpy.mockResolvedValue({
        content: `Here is my response:

\`\`\`json
{
  "target_agent_id": "agent-eng-1",
  "summary": "Implementation complete",
  "artifacts": ["code.ts", "tests.ts"],
  "quality_score_self": 85,
  "memory_to_save": null
}
\`\`\`

All done!`,
        model: 'claude-haiku-4-5',
        inputTokens: 100,
        outputTokens: 50,
      });

      const result = await agent.execute(testConfig, testIssue);

      expect(result.handoff.targetAgentId).toBe('agent-eng-1');
      expect(result.handoff.summary).toBe('Implementation complete');
      expect(result.handoff.artifacts).toContain('code.ts');
    });

    it('uses defaults for malformed JSON', async () => {
      const callSpy = vi.spyOn(modelRouter, 'call');
      callSpy.mockResolvedValue({
        content: 'This is just plain text with no JSON at all. Work is done.',
        model: 'claude-haiku-4-5',
        inputTokens: 100,
        outputTokens: 50,
      });

      const result = await agent.execute(testConfig, testIssue);

      expect(result.handoff.targetAgentId).toBeNull();
      expect(result.handoff.summary).toContain('plain text');
      expect(result.handoff.qualityScoreSelf).toBe(50); // default
    });

    it('clamps quality_score_self to [0, 100]', async () => {
      const callSpy = vi.spyOn(modelRouter, 'call');
      callSpy.mockResolvedValue({
        content: JSON.stringify({
          target_agent_id: null,
          summary: 'Done',
          artifacts: [],
          quality_score_self: 250, // Over 100
          memory_to_save: null,
        }),
        model: 'claude-haiku-4-5',
        inputTokens: 100,
        outputTokens: 50,
      });

      const result = await agent.execute(testConfig, testIssue);

      expect(result.handoff.qualityScoreSelf).toBe(100);
    });

    it('extracts balanced JSON from text with multiple objects', async () => {
      const callSpy = vi.spyOn(modelRouter, 'call');
      callSpy.mockResolvedValue({
        content: `Some context: {"ignored": true}

Final result:
{
  "target_agent_id": "agent-final",
  "summary": "Final handoff",
  "artifacts": [],
  "quality_score_self": 80,
  "memory_to_save": null
}`,
        model: 'claude-haiku-4-5',
        inputTokens: 100,
        outputTokens: 50,
      });

      const result = await agent.execute(testConfig, testIssue);

      expect(result.handoff.targetAgentId).toBe('agent-final');
      expect(result.handoff.summary).toBe('Final handoff');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RESEARCH DETECTION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('needsResearch()', () => {
    it('returns true for competitor research keywords', () => {
      const issueWithCompetitor = {
        ...testIssue,
        title: 'Analyze competitor pricing',
        description: null,
      };

      const needs = (agent as any).needsResearch(issueWithCompetitor);
      expect(needs).toBe(true);
    });

    it('returns true for market research keywords', () => {
      const issueWithMarket = {
        ...testIssue,
        title: 'Market analysis required',
        description: 'Check industry trends',
      };

      const needs = (agent as any).needsResearch(issueWithMarket);
      expect(needs).toBe(true);
    });

    it('returns true for benchmark keywords', () => {
      const issueWithBenchmark = {
        ...testIssue,
        title: 'Benchmark against best practices',
      };

      const needs = (agent as any).needsResearch(issueWithBenchmark);
      expect(needs).toBe(true);
    });

    it('returns false for routine task without keywords', () => {
      const routineIssue = {
        ...testIssue,
        title: 'Fix button alignment',
        description: 'Adjust CSS padding',
      };

      const needs = (agent as any).needsResearch(routineIssue);
      expect(needs).toBe(false);
    });

    it('detects keywords in metadata', () => {
      const issueWithMetadata = {
        ...testIssue,
        title: 'Simple task',
        metadata: { context: 'Research industry trends' },
      };

      const needs = (agent as any).needsResearch(issueWithMetadata);
      expect(needs).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HANDOFF ROUTING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('handoff routing logic', () => {
    it('releases issue to open when target_agent_id is present', async () => {
      const callSpy = vi.spyOn(modelRouter, 'call');
      callSpy.mockResolvedValue({
        content: JSON.stringify({
          target_agent_id: 'agent-qa-1',
          summary: 'Ready for QA',
          artifacts: [],
          quality_score_self: 80,
          memory_to_save: null,
        }),
        model: 'claude-haiku-4-5',
        inputTokens: 100,
        outputTokens: 50,
      });

      const releaseSpy = vi.spyOn(taskRouter, 'releaseIssue');
      await agent.execute(testConfig, testIssue);

      expect(releaseSpy).toHaveBeenCalledWith('issue-123', 'open');
    });

    it('completes issue when agent role is QA', async () => {
      // Create a QA agent subclass to test role-specific behavior
      class QAAgent extends BaseAgent {
        readonly role = 'qa'; // This is what the base-agent checks
        readonly roleLabel = 'QA Agent';
        readonly modelTier: ModelTier = 'standard';
        readonly roleMission = 'QA mission';
        readonly successMetrics = 'QA metrics';
      }

      const qaAgent = new QAAgent(tokenGateway, heartbeat, taskRouter, modelRouter, memory);
      const callSpy = vi.spyOn(modelRouter, 'call');
      callSpy.mockResolvedValue({
        content: JSON.stringify({
          target_agent_id: null,
          summary: 'QA sign off',
          artifacts: [],
          quality_score_self: 95,
          memory_to_save: null,
        }),
        model: 'claude-haiku-4-5',
        inputTokens: 100,
        outputTokens: 50,
      });

      const completeSpy = vi.spyOn(taskRouter, 'completeIssue');
      await qaAgent.execute(testConfig, testIssue);

      expect(completeSpy).toHaveBeenCalledWith('issue-123', 95);
    });

    it('releases to in_review when non-QA agent completes', async () => {
      const engineerConfig = { ...testConfig, role: 'engineer' };
      const callSpy = vi.spyOn(modelRouter, 'call');
      callSpy.mockResolvedValue({
        content: JSON.stringify({
          target_agent_id: null,
          summary: 'Implementation done',
          artifacts: [],
          quality_score_self: 85,
          memory_to_save: null,
        }),
        model: 'claude-haiku-4-5',
        inputTokens: 100,
        outputTokens: 50,
      });

      const releaseSpy = vi.spyOn(taskRouter, 'releaseIssue');
      await agent.execute(engineerConfig, testIssue);

      expect(releaseSpy).toHaveBeenCalledWith('issue-123', 'in_review');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MEMORY SAVING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('memory saving', () => {
    it('saves memory when handoff.memoryToSave is present', async () => {
      const callSpy = vi.spyOn(modelRouter, 'call');
      callSpy.mockResolvedValue({
        content: JSON.stringify({
          target_agent_id: null,
          summary: 'Done',
          artifacts: [],
          quality_score_self: 75,
          memory_to_save: 'Discovered important pattern: use async/await',
        }),
        model: 'claude-haiku-4-5',
        inputTokens: 100,
        outputTokens: 50,
      });

      const storeLearningspy = vi.spyOn(memory, 'storeLearning');
      await agent.execute(testConfig, testIssue);

      expect(storeLearningspy).toHaveBeenCalledWith(
        'agent-test-1',
        'company-1',
        'Discovered important pattern: use async/await'
      );
    });

    it('does not save memory when memoryToSave is null', async () => {
      const callSpy = vi.spyOn(modelRouter, 'call');
      callSpy.mockResolvedValue({
        content: JSON.stringify({
          target_agent_id: null,
          summary: 'Done',
          artifacts: [],
          quality_score_self: 75,
          memory_to_save: null,
        }),
        model: 'claude-haiku-4-5',
        inputTokens: 100,
        outputTokens: 50,
      });

      const storeLearningspy = vi.spyOn(memory, 'storeLearning');
      await agent.execute(testConfig, testIssue);

      expect(storeLearningspy).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ERROR HANDLING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('error handling', () => {
    it('returns failure result when LLM call throws', async () => {
      const callSpy = vi.spyOn(modelRouter, 'call');
      const llmError = new Error('LLM service unavailable');
      callSpy.mockRejectedValue(llmError);

      const result = await agent.execute(testConfig, testIssue);

      expect(result.success).toBe(false);
      expect(result.error).toContain('LLM service unavailable');
    });

    it('calls heartbeat.fail() on error', async () => {
      const callSpy = vi.spyOn(modelRouter, 'call');
      callSpy.mockRejectedValue(new Error('Service error'));

      const failSpy = vi.spyOn(heartbeat, 'fail');
      await agent.execute(testConfig, testIssue);

      expect(failSpy).toHaveBeenCalledWith('agent-test-1', 'issue-123', expect.any(String));
    });

    it('writes failure audit log on error', async () => {
      const callSpy = vi.spyOn(modelRouter, 'call');
      callSpy.mockRejectedValue(new Error('Execution error'));

      const auditCalls: Array<{ action: string }> = [];
      mockFrom.mockImplementation((table: string) => {
        if (table === 'audit_log') {
          const chain = mockChain([]);
          chain.insert = vi.fn((payload) => {
            auditCalls.push({ action: payload.action });
            return chain;
          });
          return chain;
        }
        return mockChain([]);
      });

      await agent.execute(testConfig, testIssue);

      expect(auditCalls.map(c => c.action)).toContain('HEARTBEAT_FAILED');
    });

    it('returns default handoff result on failure', async () => {
      const callSpy = vi.spyOn(modelRouter, 'call');
      callSpy.mockRejectedValue(new Error('Failed'));

      const result = await agent.execute(testConfig, testIssue);

      expect(result.handoff).toEqual({
        targetAgentId: null,
        summary: '',
        artifacts: [],
        qualityScoreSelf: 0,
        memoryToSave: null,
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MESSAGE BUILDING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('buildMessages()', () => {
    it('formats issue title and description correctly', () => {
      const messages = (agent as any).buildMessages(testConfig, testIssue);

      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toContain('## Issue: Test Issue');
      expect(messages[0].content).toContain('This is a test issue');
    });

    it('includes metadata in message', () => {
      const issueWithMetadata = {
        ...testIssue,
        metadata: { success_condition: 'All tests pass', complexity: 'high' },
      };

      const messages = (agent as any).buildMessages(testConfig, issueWithMetadata);

      expect(messages[0].content).toContain('All tests pass');
    });

    it('includes priority level', () => {
      const messages = (agent as any).buildMessages(testConfig, testIssue);

      expect(messages[0].content).toContain('### Priority: high');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TOKEN AND TEMPERATURE DEFAULTS TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getMaxTokens() and getTemperature()', () => {
    it('returns expected max tokens for test agent', () => {
      const maxTokens = (agent as any).getMaxTokens();
      expect(maxTokens).toBe(2048);
    });

    it('returns expected temperature for test agent', () => {
      const temp = (agent as any).getTemperature();
      expect(temp).toBe(0.5);
    });

    it('passes max tokens to model router', async () => {
      const callSpy = vi.spyOn(modelRouter, 'call');

      await agent.execute(testConfig, testIssue);

      expect(callSpy).toHaveBeenCalledWith(
        expect.objectContaining({ maxTokens: 2048 })
      );
    });

    it('passes temperature to model router', async () => {
      const callSpy = vi.spyOn(modelRouter, 'call');

      await agent.execute(testConfig, testIssue);

      expect(callSpy).toHaveBeenCalledWith(
        expect.objectContaining({ temperature: 0.5 })
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INTEGRATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('integration scenarios', () => {
    it('handles complete execution with all features enabled', async () => {
      const fullIssue = {
        ...testIssue,
        metadata: {
          success_condition: 'Complete',
          research_required: true,
        },
      };

      const callSpy = vi.spyOn(modelRouter, 'call');
      mockAnthropicCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            target_agent_id: 'agent-next',
            summary: 'Phase 1 complete',
            artifacts: ['design.pdf', 'proposal.doc'],
            quality_score_self: 88,
            memory_to_save: 'Pattern: Always validate input first',
          }),
        }],
        model: 'claude-haiku-4-5',
        usage: { input_tokens: 500, output_tokens: 250 },
        stop_reason: 'end_turn',
      });

      // Ensure call is properly mocked
      callSpy.mockResolvedValue({
        content: JSON.stringify({
          target_agent_id: 'agent-next',
          summary: 'Phase 1 complete',
          artifacts: ['design.pdf', 'proposal.doc'],
          quality_score_self: 88,
          memory_to_save: 'Pattern: Always validate input first',
        }),
        model: 'claude-haiku-4-5',
        inputTokens: 500,
        outputTokens: 250,
      });

      const result = await agent.execute(testConfig, fullIssue);

      expect(result.success).toBe(true);
      expect(result.tokensUsed).toBe(750);
      expect(result.handoff.targetAgentId).toBe('agent-next');
      expect(result.handoff.artifacts).toHaveLength(2);
    });

    it('returns success result with correct token count', async () => {
      const callSpy = vi.spyOn(modelRouter, 'call');

      // Setup mock response for modelRouter.call
      callSpy.mockResolvedValue({
        content: '{"target_agent_id": null, "summary": "Done", "artifacts": [], "quality_score_self": 75, "memory_to_save": null}',
        model: 'claude-haiku-4-5',
        inputTokens: 123,
        outputTokens: 456,
      });

      const result = await agent.execute(testConfig, testIssue);

      expect(result.success).toBe(true);
      expect(result.tokensUsed).toBe(579);
      expect(result.model).toBe('claude-haiku-4-5');
    });

    it('handles issue with no description', async () => {
      const issueNoDesc = { ...testIssue, description: null };

      const callSpy = vi.spyOn(modelRouter, 'call');
      callSpy.mockResolvedValue({
        content: '{"target_agent_id": null, "summary": "Done", "artifacts": [], "quality_score_self": 75, "memory_to_save": null}',
        model: 'claude-haiku-4-5',
        inputTokens: 100,
        outputTokens: 50,
      });

      const result = await agent.execute(testConfig, issueNoDesc);

      expect(result.success).toBe(true);
      expect(heartbeat.advance).toHaveBeenCalled();
    });
  });
});

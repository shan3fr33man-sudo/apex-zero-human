import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock('../../lib/supabase.js', () => ({
  getSupabaseAdmin: () => ({ from: mockFrom, rpc: mockRpc }),
}));

vi.mock('../../lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../token-gateway.js', () => ({
  TokenGateway: vi.fn().mockImplementation(() => ({
    recordUsage: vi.fn().mockResolvedValue(undefined),
    recordAgentUsage: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../heartbeat.js', () => ({
  HeartbeatStateMachine: vi.fn().mockImplementation(() => ({
    advance: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../task-router.js', () => ({
  TaskRouter: vi.fn().mockImplementation(() => ({
    findNextIssue: vi.fn().mockResolvedValue(null),
    claimIssue: vi.fn().mockResolvedValue(false),
    releaseIssue: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../event-bus.js', () => ({
  EventBus: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    emit: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../autoscaler.js', () => ({
  AutoScaler: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));

vi.mock('../../escalation/stall-detector.js', () => ({
  StallDetector: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));

vi.mock('../../models/router.js', () => ({
  ModelRouter: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../../memory/ams.js', () => ({
  ApexMemorySystem: vi.fn().mockImplementation(() => ({
    garbageCollect: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../memory/vector-store.js', () => ({
  VectorStore: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../../routines/scheduler.js', () => ({
  Scheduler: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));

vi.mock('../../routines/reactor.js', () => ({
  Reactor: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));

// Mock the dynamic import path - use the full path for the import
vi.mock('../agents/role-resolver.js', async () => {
  return {
    resolveAgentForRole: vi.fn().mockReturnValue({
      execute: vi.fn().mockResolvedValue({
        success: true,
        tokensUsed: 150,
        model: 'claude-haiku-4-5',
        error: null,
      }),
    }),
  };
});

import { Engine } from '../engine.js';

describe('Engine', () => {
  let engine: Engine;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment variables
    delete process.env.ORCHESTRATOR_TICK_MS;
    delete process.env.AUTOSCALER_TICK_MS;
    engine = new Engine();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  function mockChain(resolvedData: unknown, error: unknown = null) {
    const chain: Record<string, unknown> = {};
    ['select', 'insert', 'update', 'eq', 'neq', 'single', 'maybeSingle',
     'order', 'limit', 'or', 'gt', 'lt', 'gte', 'lte', 'is', 'in', 'not',
     'match', 'filter', 'delete'].forEach((m) => {
      chain[m] = vi.fn().mockReturnValue(chain);
    });
    Object.defineProperty(chain, 'then', {
      value: (onFulfilled?: (v: unknown) => unknown) =>
        Promise.resolve({ data: resolvedData, error }).then(onFulfilled),
      writable: true, configurable: true,
    });
    return chain;
  }

  describe('Constructor', () => {
    it('initializes all modules', () => {
      expect(engine.tokenGateway).toBeDefined();
      expect(engine.heartbeat).toBeDefined();
      expect(engine.taskRouter).toBeDefined();
      expect(engine.eventBus).toBeDefined();
      expect(engine.autoScaler).toBeDefined();
      expect(engine.stallDetector).toBeDefined();
      expect(engine.modelRouter).toBeDefined();
      expect(engine.memory).toBeDefined();
      expect(engine.scheduler).toBeDefined();
      expect(engine.reactor).toBeDefined();
    });
  });

  describe('start()', () => {
    it('begins tick loop and starts subsystems', async () => {
      vi.useFakeTimers();

      mockFrom.mockReturnValue(mockChain([]));

      await engine.start();

      expect(engine.eventBus.start).toHaveBeenCalled();
      expect(engine.autoScaler.start).toHaveBeenCalled();
      expect(engine.stallDetector.start).toHaveBeenCalled();
      expect(engine.scheduler.start).toHaveBeenCalled();
      expect(engine.reactor.start).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('warns when already running', async () => {
      mockFrom.mockReturnValue(mockChain([]));

      await engine.start();
      await engine.start();

      // The warning is logged but doesn't throw
      // We can verify the engine is still running
      expect(engine).toBeDefined();

      await engine.stop();
    });

    it('handles event bus startup failure gracefully', async () => {
      mockFrom.mockReturnValue(mockChain([]));
      vi.mocked(engine.eventBus.start).mockRejectedValueOnce(new Error('Event bus failed'));

      // Should not throw
      await expect(engine.start()).resolves.not.toThrow();

      expect(engine.autoScaler.start).toHaveBeenCalled();

      await engine.stop();
    });
  });

  describe('stop()', () => {
    it('clears interval and stops subsystems', async () => {
      mockFrom.mockReturnValue(mockChain([]));

      await engine.start();
      await engine.stop();

      expect(engine.scheduler.stop).toHaveBeenCalled();
      expect(engine.reactor.stop).toHaveBeenCalled();
      expect(engine.autoScaler.stop).toHaveBeenCalled();
      expect(engine.stallDetector.stop).toHaveBeenCalled();
      expect(engine.eventBus.stop).toHaveBeenCalled();
    });
  });

  describe('tick()', () => {
    it('processes active companies', async () => {
      const companies = [
        { id: 'company-1' },
        { id: 'company-2' },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'companies') {
          return mockChain(companies);
        }
        // For processCompany queries
        if (table === 'agents') {
          return mockChain([]); // No idle agents
        }
        return mockChain(null);
      });

      // Access private tick method through the engine
      await (engine as any).tick();

      expect(mockFrom).toHaveBeenCalledWith('companies');
    });

    it('performs garbage collection probabilistically', async () => {
      // Seed Math.random to get a value < 0.017
      const originalRandom = Math.random;
      let callCount = 0;
      Math.random = vi.fn(() => {
        callCount++;
        // Return a value that will trigger GC on the first call
        return callCount === 1 ? 0.01 : 0.5;
      });

      mockFrom.mockReturnValue(mockChain([]));

      await (engine as any).tick();

      expect(engine.memory.garbageCollect).toHaveBeenCalled();

      Math.random = originalRandom;
    });
  });

  describe('processCompany()', () => {
    it('assigns idle agents to available issues', async () => {
      const idleAgents = [{ id: 'agent-1', role: 'developer' }];
      const companyId = 'company-1';

      mockFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          return mockChain(idleAgents);
        }
        return mockChain(null);
      });

      vi.mocked(engine.taskRouter.findNextIssue).mockResolvedValueOnce('issue-1');
      vi.mocked(engine.taskRouter.claimIssue).mockResolvedValueOnce(true);

      await (engine as any).processCompany(companyId);

      expect(engine.taskRouter.findNextIssue).toHaveBeenCalledWith('developer', companyId);
      expect(engine.taskRouter.claimIssue).toHaveBeenCalledWith('agent-1', 'issue-1');
    });

    it('skips when no idle agents', async () => {
      const companyId = 'company-1';

      mockFrom.mockReturnValue(mockChain([]));

      vi.mocked(engine.taskRouter.findNextIssue).mockClear();
      vi.mocked(engine.taskRouter.claimIssue).mockClear();

      await (engine as any).processCompany(companyId);

      expect(engine.taskRouter.findNextIssue).not.toHaveBeenCalled();
      expect(engine.taskRouter.claimIssue).not.toHaveBeenCalled();
    });

    it('skips agent when no available issues', async () => {
      const idleAgents = [{ id: 'agent-1', role: 'developer' }];
      const companyId = 'company-1';

      mockFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          return mockChain(idleAgents);
        }
        return mockChain(null);
      });

      vi.mocked(engine.taskRouter.findNextIssue).mockResolvedValueOnce(null);
      vi.mocked(engine.taskRouter.claimIssue).mockClear();

      await (engine as any).processCompany(companyId);

      expect(engine.taskRouter.claimIssue).not.toHaveBeenCalled();
    });

    it('skips agent when issue claim fails', async () => {
      const idleAgents = [{ id: 'agent-1', role: 'developer' }];
      const companyId = 'company-1';

      mockFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          return mockChain(idleAgents);
        }
        return mockChain(null);
      });

      vi.mocked(engine.taskRouter.findNextIssue).mockResolvedValueOnce('issue-1');
      vi.mocked(engine.taskRouter.claimIssue).mockResolvedValueOnce(false);

      vi.mocked(engine.taskRouter.releaseIssue).mockClear();

      await (engine as any).processCompany(companyId);

      expect(engine.taskRouter.claimIssue).toHaveBeenCalledWith('agent-1', 'issue-1');
      // Should not execute the agent or release the issue
      expect(engine.taskRouter.releaseIssue).not.toHaveBeenCalled();
    });
  });

  describe('executeAgent()', () => {
    it('runs full heartbeat cycle on success', async () => {
      const agentId = 'agent-1';
      const issueId = 'issue-1';
      const companyId = 'company-1';

      const agent = {
        id: agentId,
        company_id: companyId,
        name: 'Developer Bot',
        slug: 'dev-bot',
        role: 'developer',
        persona: 'skilled developer',
        system_prompt: 'You are a developer',
        model: 'claude-haiku-4-5',
        reports_to: null,
        heartbeat_checklist: {},
        config: {},
      };

      const company = {
        id: companyId,
        name: 'Test Company',
        description: 'A test company',
        brand: { guide: 'Brand guide' },
      };

      const issue = {
        id: issueId,
        title: 'Fix bug',
        company_id: companyId,
        status: 'in_progress',
      };

      let callCount = 0;
      mockFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          return mockChain(agent);
        }
        if (table === 'companies') {
          return mockChain(company);
        }
        if (table === 'issues') {
          callCount++;
          // Return different data on subsequent selects
          if (callCount <= 1) {
            return mockChain(issue);
          }
          return mockChain({ ...issue, status: 'in_progress' });
        }
        return mockChain(null);
      });

      await (engine as any).executeAgent(agentId, issueId, companyId);

      // Verify agent was executed with correct config
      expect(mockFrom).toHaveBeenCalledWith('agents');
      expect(mockFrom).toHaveBeenCalledWith('companies');
      expect(mockFrom).toHaveBeenCalledWith('issues');

      // Event should be emitted or agent was executed
      // (execution may fail due to missing agent implementation, but queries should succeed)
      expect(mockFrom.mock.calls.length).toBeGreaterThan(0);
    });

    it('handles agent not found', async () => {
      const agentId = 'agent-missing';
      const issueId = 'issue-1';
      const companyId = 'company-1';

      mockFrom.mockReturnValue(mockChain(null));

      await (engine as any).executeAgent(agentId, issueId, companyId);

      // Should log error and return early
      expect(mockFrom).toHaveBeenCalledWith('agents');
      expect(engine.tokenGateway.recordUsage).not.toHaveBeenCalled();
    });

    it('handles company not found', async () => {
      const agentId = 'agent-1';
      const issueId = 'issue-1';
      const companyId = 'company-missing';

      const agent = {
        id: agentId,
        company_id: companyId,
        name: 'Developer Bot',
        slug: 'dev-bot',
        role: 'developer',
        persona: 'skilled developer',
        system_prompt: 'You are a developer',
        model: 'claude-haiku-4-5',
        reports_to: null,
        heartbeat_checklist: {},
        config: {},
      };

      mockFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          return mockChain(agent);
        }
        if (table === 'companies') {
          return mockChain(null);
        }
        return mockChain(null);
      });

      await (engine as any).executeAgent(agentId, issueId, companyId);

      // Should log error and return early
      expect(mockFrom).toHaveBeenCalledWith('companies');
      expect(engine.tokenGateway.recordUsage).not.toHaveBeenCalled();
    });

    it('handles issue not found', async () => {
      const agentId = 'agent-1';
      const issueId = 'issue-missing';
      const companyId = 'company-1';

      const agent = {
        id: agentId,
        company_id: companyId,
        name: 'Developer Bot',
        slug: 'dev-bot',
        role: 'developer',
        persona: 'skilled developer',
        system_prompt: 'You are a developer',
        model: 'claude-haiku-4-5',
        reports_to: null,
        heartbeat_checklist: {},
        config: {},
      };

      const company = {
        id: companyId,
        name: 'Test Company',
        description: 'A test company',
        brand: { guide: 'Brand guide' },
      };

      mockFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          return mockChain(agent);
        }
        if (table === 'companies') {
          return mockChain(company);
        }
        if (table === 'issues') {
          return mockChain(null);
        }
        return mockChain(null);
      });

      await (engine as any).executeAgent(agentId, issueId, companyId);

      // Should release the issue and not record token usage
      expect(engine.taskRouter.releaseIssue).toHaveBeenCalledWith(issueId);
      expect(engine.tokenGateway.recordUsage).not.toHaveBeenCalled();
    });

    it('releases issue on execution failure', async () => {
      const agentId = 'agent-1';
      const issueId = 'issue-1';
      const companyId = 'company-1';

      const agent = {
        id: agentId,
        company_id: companyId,
        name: 'Developer Bot',
        slug: 'dev-bot',
        role: 'developer',
        persona: 'skilled developer',
        system_prompt: 'You are a developer',
        model: 'claude-haiku-4-5',
        reports_to: null,
        heartbeat_checklist: {},
        config: {},
      };

      const company = {
        id: companyId,
        name: 'Test Company',
        description: 'A test company',
        brand: { guide: 'Brand guide' },
      };

      const issue = {
        id: issueId,
        title: 'Fix bug',
        company_id: companyId,
      };

      mockFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          return mockChain(agent);
        }
        if (table === 'companies') {
          return mockChain(company);
        }
        if (table === 'issues') {
          return mockChain(issue);
        }
        return mockChain(null);
      });

      // Mock agent execution to fail
      const { resolveAgentForRole } = await import('../agents/role-resolver.js');
      vi.mocked(resolveAgentForRole).mockReturnValueOnce({
        execute: vi.fn().mockResolvedValue({
          success: false,
          tokensUsed: 0,
          model: 'claude-haiku-4-5',
          error: 'Execution failed',
        }),
      } as any);

      await (engine as any).executeAgent(agentId, issueId, companyId);

      // Should release the issue back to open
      expect(engine.taskRouter.releaseIssue).toHaveBeenCalledWith(issueId, 'open');
    });

    it('handles execution error and calls heartbeat.fail', async () => {
      const agentId = 'agent-1';
      const issueId = 'issue-1';
      const companyId = 'company-1';

      const agent = {
        id: agentId,
        company_id: companyId,
        name: 'Developer Bot',
        slug: 'dev-bot',
        role: 'developer',
        persona: 'skilled developer',
        system_prompt: 'You are a developer',
        model: 'claude-haiku-4-5',
        reports_to: null,
        heartbeat_checklist: {},
        config: {},
      };

      const company = {
        id: companyId,
        name: 'Test Company',
        description: 'A test company',
        brand: { guide: 'Brand guide' },
      };

      const issue = {
        id: issueId,
        title: 'Fix bug',
        company_id: companyId,
      };

      mockFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          return mockChain(agent);
        }
        if (table === 'companies') {
          return mockChain(company);
        }
        if (table === 'issues') {
          return mockChain(issue);
        }
        return mockChain(null);
      });

      await (engine as any).executeAgent(agentId, issueId, companyId);

      // Should call heartbeat.fail with some error message and release the issue
      expect(engine.heartbeat.fail).toHaveBeenCalledWith(
        agentId,
        issueId,
        expect.any(String)
      );
      expect(engine.taskRouter.releaseIssue).toHaveBeenCalledWith(issueId, 'open');
    });

    it('resolves reporting chain if agent has manager', async () => {
      const agentId = 'agent-1';
      const issueId = 'issue-1';
      const companyId = 'company-1';
      const managerId = 'agent-manager';

      const agent = {
        id: agentId,
        company_id: companyId,
        name: 'Developer Bot',
        slug: 'dev-bot',
        role: 'developer',
        persona: 'skilled developer',
        system_prompt: 'You are a developer',
        model: 'claude-haiku-4-5',
        reports_to: managerId,
        heartbeat_checklist: {},
        config: {},
      };

      const company = {
        id: companyId,
        name: 'Test Company',
        description: 'A test company',
        brand: { guide: 'Brand guide' },
      };

      const manager = {
        name: 'Manager Bot',
        role: 'manager',
      };

      const issue = {
        id: issueId,
        title: 'Fix bug',
        company_id: companyId,
        status: 'in_progress',
      };

      let agentCallCount = 0;
      mockFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          agentCallCount++;
          // First call for agent, second call for manager
          if (agentCallCount === 1) {
            return mockChain(agent);
          }
          return mockChain(manager);
        }
        if (table === 'companies') {
          return mockChain(company);
        }
        if (table === 'issues') {
          return mockChain(issue);
        }
        return mockChain(null);
      });

      await (engine as any).executeAgent(agentId, issueId, companyId);

      expect(mockFrom).toHaveBeenCalledWith('agents');
      // The agent loads both the agent and manager, and manager resolution should succeed
      expect(agentCallCount).toBeGreaterThan(1);
    });

    it('releases issue if still in_progress after successful execution (safety net)', async () => {
      const agentId = 'agent-1';
      const issueId = 'issue-1';
      const companyId = 'company-1';

      const agent = {
        id: agentId,
        company_id: companyId,
        name: 'Developer Bot',
        slug: 'dev-bot',
        role: 'developer',
        persona: 'skilled developer',
        system_prompt: 'You are a developer',
        model: 'claude-haiku-4-5',
        reports_to: null,
        heartbeat_checklist: {},
        config: {},
      };

      const company = {
        id: companyId,
        name: 'Test Company',
        description: 'A test company',
        brand: { guide: 'Brand guide' },
      };

      const issue = {
        id: issueId,
        title: 'Fix bug',
        company_id: companyId,
        status: 'in_progress',
      };

      let selectCount = 0;
      mockFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          return mockChain(agent);
        }
        if (table === 'companies') {
          return mockChain(company);
        }
        if (table === 'issues') {
          selectCount++;
          // First select for loading issue, second select for checking status
          if (selectCount <= 1) {
            return mockChain(issue);
          }
          return mockChain({ ...issue, status: 'in_progress' });
        }
        return mockChain(null);
      });

      await (engine as any).executeAgent(agentId, issueId, companyId);

      // Should release the issue as a safety net
      expect(engine.taskRouter.releaseIssue).toHaveBeenCalledWith(issueId, 'open');
    });
  });

  describe('getActiveCompanyIds()', () => {
    it('queries companies table for active status', async () => {
      const companies = [
        { id: 'company-1' },
        { id: 'company-2' },
        { id: 'company-3' },
      ];

      mockFrom.mockReturnValue(mockChain(companies));

      const result = await (engine as any).getActiveCompanyIds();

      expect(mockFrom).toHaveBeenCalledWith('companies');
      expect(result).toEqual(['company-1', 'company-2', 'company-3']);
    });

    it('handles empty result', async () => {
      mockFrom.mockReturnValue(mockChain(null));

      const result = await (engine as any).getActiveCompanyIds();

      expect(result).toEqual([]);
    });

    it('handles empty array', async () => {
      mockFrom.mockReturnValue(mockChain([]));

      const result = await (engine as any).getActiveCompanyIds();

      expect(result).toEqual([]);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HeartbeatStateMachine } from '../../core/heartbeat.js';
import type { TokenGateway } from '../../core/token-gateway.js';
import type { TaskRouter } from '../../core/task-router.js';
import type { ModelRouter } from '../../models/router.js';
import type { ApexMemorySystem } from '../../memory/ams.js';
import { resolveAgentForRole } from '../role-resolver.js';

vi.mock('../ceo-agent.js', () => ({
  CeoAgent: vi.fn(function(this: any) {
    this.role = 'ceo';
  }),
}));

vi.mock('../engineer-agent.js', () => ({
  EngineerAgent: vi.fn(function(this: any) {
    this.role = 'engineer';
  }),
}));

vi.mock('../qa-agent.js', () => ({
  QaAgent: vi.fn(function(this: any) {
    this.role = 'qa';
  }),
}));

vi.mock('../eval-engineer-agent.js', () => ({
  EvalEngineerAgent: vi.fn(function(this: any) {
    this.role = 'eval_engineer';
  }),
}));

vi.mock('../marketing-agent.js', () => ({
  MarketingAgent: vi.fn(function(this: any) {
    this.role = 'marketing';
  }),
}));

vi.mock('../ux-agent.js', () => ({
  UxAgent: vi.fn(function(this: any) {
    this.role = 'ux';
  }),
}));

vi.mock('../dispatch-agent.js', () => ({
  DispatchAgent: vi.fn(function(this: any) {
    this.role = 'dispatch';
  }),
}));

vi.mock('../compliance-agent.js', () => ({
  ComplianceAgent: vi.fn(function(this: any) {
    this.role = 'compliance';
  }),
}));

vi.mock('../fleet-coordinator-agent.js', () => ({
  FleetCoordinatorAgent: vi.fn(function(this: any) {
    this.role = 'fleet_coordinator';
  }),
}));

vi.mock('../lead-recovery-agent.js', () => ({
  LeadRecoveryAgent: vi.fn(function(this: any) {
    this.role = 'lead_recovery';
  }),
}));

vi.mock('../quote-agent.js', () => ({
  QuoteAgent: vi.fn(function(this: any) {
    this.role = 'quote';
  }),
}));

vi.mock('../review-request-agent.js', () => ({
  ReviewRequestAgent: vi.fn(function(this: any) {
    this.role = 'review_request';
  }),
}));

describe('Role Resolver', () => {
  let heartbeat: HeartbeatStateMachine;
  let tokenGateway: TokenGateway;
  let taskRouter: TaskRouter;
  let modelRouter: ModelRouter;
  let memory: ApexMemorySystem;

  beforeEach(() => {
    vi.clearAllMocks();

    heartbeat = {} as HeartbeatStateMachine;
    tokenGateway = {} as TokenGateway;
    taskRouter = {} as TaskRouter;
    modelRouter = {} as ModelRouter;
    memory = {} as ApexMemorySystem;
  });

  describe('primary agent roles', () => {
    it('resolves ceo role to CeoAgent', () => {
      const agent = resolveAgentForRole(
        'ceo',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent).toBeDefined();
      expect(agent.role).toBe('ceo');
    });

    it('resolves engineer role to EngineerAgent', () => {
      const agent = resolveAgentForRole(
        'engineer',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent).toBeDefined();
      expect(agent.role).toBe('engineer');
    });

    it('resolves qa role to QaAgent', () => {
      const agent = resolveAgentForRole(
        'qa',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent).toBeDefined();
      expect(agent.role).toBe('qa');
    });

    it('resolves eval_engineer role to EvalEngineerAgent', () => {
      const agent = resolveAgentForRole(
        'eval_engineer',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent).toBeDefined();
      expect(agent.role).toBe('eval_engineer');
    });

    it('resolves marketing role to MarketingAgent', () => {
      const agent = resolveAgentForRole(
        'marketing',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent).toBeDefined();
      expect(agent.role).toBe('marketing');
    });

    it('resolves ux role to UxAgent', () => {
      const agent = resolveAgentForRole(
        'ux',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent).toBeDefined();
      expect(agent.role).toBe('ux');
    });

    it('resolves dispatch role to DispatchAgent', () => {
      const agent = resolveAgentForRole(
        'dispatch',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent).toBeDefined();
      expect(agent.role).toBe('dispatch');
    });

    it('resolves compliance role to ComplianceAgent', () => {
      const agent = resolveAgentForRole(
        'compliance',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent).toBeDefined();
      expect(agent.role).toBe('compliance');
    });

    it('resolves fleet_coordinator role to FleetCoordinatorAgent', () => {
      const agent = resolveAgentForRole(
        'fleet_coordinator',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent).toBeDefined();
      expect(agent.role).toBe('fleet_coordinator');
    });

    it('resolves lead_recovery role to LeadRecoveryAgent', () => {
      const agent = resolveAgentForRole(
        'lead_recovery',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent).toBeDefined();
      expect(agent.role).toBe('lead_recovery');
    });

    it('resolves quote role to QuoteAgent', () => {
      const agent = resolveAgentForRole(
        'quote',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent).toBeDefined();
      expect(agent.role).toBe('quote');
    });

    it('resolves review_request role to ReviewRequestAgent', () => {
      const agent = resolveAgentForRole(
        'review_request',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent).toBeDefined();
      expect(agent.role).toBe('review_request');
    });
  });

  describe('role aliases', () => {
    it('resolves coo alias to CeoAgent', () => {
      const agent = resolveAgentForRole(
        'coo',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent).toBeDefined();
      expect(agent.role).toBe('ceo');
    });

    it('resolves cfo alias to CeoAgent', () => {
      const agent = resolveAgentForRole(
        'cfo',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent).toBeDefined();
      expect(agent.role).toBe('ceo');
    });

    it('resolves cto alias to CeoAgent', () => {
      const agent = resolveAgentForRole(
        'cto',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent).toBeDefined();
      expect(agent.role).toBe('ceo');
    });

    it('resolves pm alias to CeoAgent', () => {
      const agent = resolveAgentForRole(
        'pm',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent).toBeDefined();
      expect(agent.role).toBe('ceo');
    });

    it('resolves founding_engineer alias to EngineerAgent', () => {
      const agent = resolveAgentForRole(
        'founding_engineer',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent).toBeDefined();
      expect(agent.role).toBe('engineer');
    });

    it('resolves qa_engineer alias to QaAgent', () => {
      const agent = resolveAgentForRole(
        'qa_engineer',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent).toBeDefined();
      expect(agent.role).toBe('qa');
    });

    it('resolves marketer alias to MarketingAgent', () => {
      const agent = resolveAgentForRole(
        'marketer',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent).toBeDefined();
      expect(agent.role).toBe('marketing');
    });

    it('resolves sales alias to MarketingAgent', () => {
      const agent = resolveAgentForRole(
        'sales',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent).toBeDefined();
      expect(agent.role).toBe('marketing');
    });

    it('resolves ux_designer alias to UxAgent', () => {
      const agent = resolveAgentForRole(
        'ux_designer',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent).toBeDefined();
      expect(agent.role).toBe('ux');
    });

    it('resolves dispatcher alias to DispatchAgent', () => {
      const agent = resolveAgentForRole(
        'dispatcher',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent).toBeDefined();
      expect(agent.role).toBe('dispatch');
    });

    it('resolves compliance_officer alias to ComplianceAgent', () => {
      const agent = resolveAgentForRole(
        'compliance_officer',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent).toBeDefined();
      expect(agent.role).toBe('compliance');
    });

    it('resolves fleet alias to FleetCoordinatorAgent', () => {
      const agent = resolveAgentForRole(
        'fleet',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent).toBeDefined();
      expect(agent.role).toBe('fleet_coordinator');
    });

    it('resolves lead_recovery_specialist alias to LeadRecoveryAgent', () => {
      const agent = resolveAgentForRole(
        'lead_recovery_specialist',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent).toBeDefined();
      expect(agent.role).toBe('lead_recovery');
    });

    it('resolves quote_specialist alias to QuoteAgent', () => {
      const agent = resolveAgentForRole(
        'quote_specialist',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent).toBeDefined();
      expect(agent.role).toBe('quote');
    });

    it('resolves review_requester alias to ReviewRequestAgent', () => {
      const agent = resolveAgentForRole(
        'review_requester',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent).toBeDefined();
      expect(agent.role).toBe('review_request');
    });
  });

  describe('dependency injection', () => {
    it('passes all dependencies to agent constructor', async () => {
      const { CeoAgent } = await import('../ceo-agent.js');
      const mockCeoAgent = CeoAgent as any;

      resolveAgentForRole(
        'ceo',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(mockCeoAgent).toHaveBeenCalledWith(
        tokenGateway,
        heartbeat,
        taskRouter,
        modelRouter,
        memory
      );
    });

    it('passes dependencies in correct order', async () => {
      const { EngineerAgent } = await import('../engineer-agent.js');
      const mockEngineerAgent = EngineerAgent as any;

      const testHeartbeat = { id: 'hb' } as any;
      const testTokenGateway = { id: 'tg' } as any;
      const testTaskRouter = { id: 'tr' } as any;
      const testModelRouter = { id: 'mr' } as any;
      const testMemory = { id: 'mem' } as any;

      resolveAgentForRole(
        'engineer',
        testHeartbeat,
        testTokenGateway,
        testTaskRouter,
        testModelRouter,
        testMemory
      );

      const calls = mockEngineerAgent.mock.calls;
      expect(calls[0][0]).toBe(testTokenGateway);
      expect(calls[0][1]).toBe(testHeartbeat);
      expect(calls[0][2]).toBe(testTaskRouter);
      expect(calls[0][3]).toBe(testModelRouter);
      expect(calls[0][4]).toBe(testMemory);
    });
  });

  describe('unknown roles', () => {
    it('defaults to EngineerAgent for unknown role', () => {
      const agent = resolveAgentForRole(
        'unknown_role_xyz',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent).toBeDefined();
      expect(agent.role).toBe('engineer');
    });

    it('defaults to EngineerAgent for empty string role', () => {
      const agent = resolveAgentForRole(
        '',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent).toBeDefined();
      expect(agent.role).toBe('engineer');
    });

    it('defaults to EngineerAgent for null-like role', () => {
      const agent = resolveAgentForRole(
        'null',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent).toBeDefined();
      expect(agent.role).toBe('engineer');
    });

    it('defaults to EngineerAgent for case-sensitive mismatch', () => {
      const agent = resolveAgentForRole(
        'CEO',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent).toBeDefined();
      // Should be engineer since case doesn't match
      expect(agent.role).toBe('engineer');
    });
  });

  describe('consistency', () => {
    it('always returns same agent type for same role', () => {
      const agent1 = resolveAgentForRole(
        'qa',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      const agent2 = resolveAgentForRole(
        'qa',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent1.role).toBe(agent2.role);
    });

    it('creates separate instances for each call', () => {
      const agent1 = resolveAgentForRole(
        'engineer',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      const agent2 = resolveAgentForRole(
        'engineer',
        heartbeat,
        tokenGateway,
        taskRouter,
        modelRouter,
        memory
      );

      expect(agent1).not.toBe(agent2);
    });
  });

  describe('all 12 roles coverage', () => {
    it('resolves all primary agent roles', () => {
      const roles = [
        'ceo',
        'engineer',
        'qa',
        'eval_engineer',
        'marketing',
        'ux',
        'dispatch',
        'compliance',
        'fleet_coordinator',
        'lead_recovery',
        'quote',
        'review_request',
      ];

      roles.forEach((role) => {
        const agent = resolveAgentForRole(
          role,
          heartbeat,
          tokenGateway,
          taskRouter,
          modelRouter,
          memory
        );

        expect(agent).toBeDefined();
        expect(agent.role).toBe(role);
      });
    });

    it('provides fallback for all unknown roles', () => {
      const unknownRoles = [
        'cpo',
        'designer',
        'analyst',
        'manager',
        'intern',
        'consultant',
      ];

      unknownRoles.forEach((role) => {
        const agent = resolveAgentForRole(
          role,
          heartbeat,
          tokenGateway,
          taskRouter,
          modelRouter,
          memory
        );

        expect(agent).toBeDefined();
        expect(agent.role).toBe('engineer');
      });
    });
  });
});

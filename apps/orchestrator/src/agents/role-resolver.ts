/**
 * Role Resolver — maps agent roles to their agent class implementations.
 *
 * CRITICAL: Case values must match the `role` property on each agent class.
 * All 12 agent types must be imported and mapped here.
 */
import type { HeartbeatStateMachine } from '../core/heartbeat.js';
import type { TokenGateway } from '../core/token-gateway.js';
import type { TaskRouter } from '../core/task-router.js';
import type { ModelRouter } from '../models/router.js';
import type { ApexMemorySystem } from '../memory/ams.js';
import type { BaseAgent } from './base-agent.js';
import { CeoAgent } from './ceo-agent.js';
import { EngineerAgent } from './engineer-agent.js';
import { QaAgent } from './qa-agent.js';
import { EvalEngineerAgent } from './eval-engineer-agent.js';
import { MarketingAgent } from './marketing-agent.js';
import { UxAgent } from './ux-agent.js';
import { DispatchAgent } from './dispatch-agent.js';
import { ComplianceAgent } from './compliance-agent.js';
import { FleetCoordinatorAgent } from './fleet-coordinator-agent.js';
import { LeadRecoveryAgent } from './lead-recovery-agent.js';
import { QuoteAgent } from './quote-agent.js';
import { ReviewRequestAgent } from './review-request-agent.js';

/**
 * Resolve the correct agent class for a given role.
 * Falls back to EngineerAgent for unknown roles.
 */
export function resolveAgentForRole(
  role: string,
  heartbeat: HeartbeatStateMachine,
  tokenGateway: TokenGateway,
  taskRouter: TaskRouter,
  modelRouter: ModelRouter,
  memory: ApexMemorySystem,
): BaseAgent {
  const args = [tokenGateway, heartbeat, taskRouter, modelRouter, memory] as const;

  switch (role) {
    // C-suite / leadership
    case 'ceo':
    case 'coo':
    case 'cfo':
    case 'cto':
    case 'pm':
      return new CeoAgent(...args);

    // Engineering
    case 'engineer':
    case 'founding_engineer':
      return new EngineerAgent(...args);

    // QA
    case 'qa':
    case 'qa_engineer':
      return new QaAgent(...args);

    // Eval / Performance
    case 'eval_engineer':
      return new EvalEngineerAgent(...args);

    // Marketing & Sales
    case 'marketing':
    case 'marketer':
    case 'sales':
      return new MarketingAgent(...args);

    // UX / Design
    case 'ux':
    case 'ux_designer':
      return new UxAgent(...args);

    // Dispatch / Scheduling
    case 'dispatch':
    case 'dispatcher':
      return new DispatchAgent(...args);

    // Compliance / Legal
    case 'compliance':
    case 'compliance_officer':
      return new ComplianceAgent(...args);

    // Fleet Management
    case 'fleet_coordinator':
    case 'fleet':
      return new FleetCoordinatorAgent(...args);

    // Lead Recovery
    case 'lead_recovery':
    case 'lead_recovery_specialist':
      return new LeadRecoveryAgent(...args);

    // Quoting
    case 'quote':
    case 'quote_specialist':
      return new QuoteAgent(...args);

    // Review Requests
    case 'review_requester':
    case 'review_request':
      return new ReviewRequestAgent(...args);

    default:
      return new EngineerAgent(...args);
  }
}

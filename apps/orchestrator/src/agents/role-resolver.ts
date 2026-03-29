/**
 * Role Resolver — maps agent roles to their agent class implementations.
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
    case 'ceo':
    case 'coo':
    case 'cfo':
    case 'cto':
    case 'pm':
      return new CeoAgent(...args);

    case 'founding_engineer':
      return new EngineerAgent(...args);

    case 'qa_engineer':
      return new QaAgent(...args);

    case 'eval_engineer':
      return new EvalEngineerAgent(...args);

    case 'marketer':
    case 'sales':
      return new MarketingAgent(...args);

    default:
      return new EngineerAgent(...args);
  }
}

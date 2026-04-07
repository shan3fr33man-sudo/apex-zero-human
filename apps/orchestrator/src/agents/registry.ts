/**
 * Agent Registry — maps role strings to BaseAgent subclass factories.
 *
 * Used by Engine.processCompany() to instantiate the right agent class
 * for a claimed issue and call .execute().
 */
import type { BaseAgent } from './base-agent.js';
import type { TokenGateway } from '../core/token-gateway.js';
import type { HeartbeatStateMachine } from '../core/heartbeat.js';
import type { TaskRouter } from '../core/task-router.js';
import type { ModelRouter } from '../models/router.js';
import type { ApexMemorySystem } from '../memory/ams.js';

import { CeoAgent } from './ceo-agent.js';
import { MarketingAgent } from './marketing-agent.js';
import { EngineerAgent } from './engineer-agent.js';
import { QaAgent } from './qa-agent.js';
import { UxAgent } from './ux-agent.js';
import { DispatchAgent } from './dispatch-agent.js';
import { ComplianceAgent } from './compliance-agent.js';
import { EvalEngineerAgent } from './eval-engineer-agent.js';
import { FleetCoordinatorAgent } from './fleet-coordinator-agent.js';
import { LeadRecoveryAgent } from './lead-recovery-agent.js';
import { QuoteAgent } from './quote-agent.js';
import { ReviewRequestAgent } from './review-request-agent.js';

export interface AgentDeps {
  tokenGateway: TokenGateway;
  heartbeat: HeartbeatStateMachine;
  taskRouter: TaskRouter;
  modelRouter: ModelRouter;
  memory: ApexMemorySystem;
}

type AgentCtor = new (
  tg: TokenGateway,
  hb: HeartbeatStateMachine,
  tr: TaskRouter,
  mr: ModelRouter,
  mem: ApexMemorySystem
) => BaseAgent;

const REGISTRY: Record<string, AgentCtor> = {
  ceo: CeoAgent,
  marketing: MarketingAgent,
  marketer: MarketingAgent,
  engineer: EngineerAgent,
  qa: QaAgent,
  ux: UxAgent,
  designer: UxAgent,
  dispatch: DispatchAgent,
  compliance: ComplianceAgent,
  eval_engineer: EvalEngineerAgent,
  fleet_coordinator: FleetCoordinatorAgent,
  lead_recovery: LeadRecoveryAgent,
  quote: QuoteAgent,
  review_request: ReviewRequestAgent,
};

export function createAgent(role: string, deps: AgentDeps): BaseAgent | null {
  const Ctor = REGISTRY[role.toLowerCase().trim()];
  if (!Ctor) return null;
  return new Ctor(deps.tokenGateway, deps.heartbeat, deps.taskRouter, deps.modelRouter, deps.memory);
}

export function knownRoles(): string[] {
  return Object.keys(REGISTRY);
}

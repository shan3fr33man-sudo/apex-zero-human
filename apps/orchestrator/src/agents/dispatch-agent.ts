/**
 * Dispatch Agent — TECHNICAL Tier
 *
 * Schedules jobs, assigns resources, optimizes routes.
 * Generic — fleet roster, service area, CRM connector, and resource-specific
 * notes all come from company config.
 *
 * Reports to: CEO Agent
 * Skills: crm-connector, fleet-coordinator
 * Model: claude-sonnet-4-5 (TECHNICAL tier)
 *
 * Reactive triggers: new_booking, cancellation, resource_unavailable
 */
import { BaseAgent } from './base-agent.js';
import type { AgentConfig, Issue } from './types.js';
import type { ModelTier } from '../models/router.js';

export class DispatchAgent extends BaseAgent {
  readonly role = 'dispatch';
  readonly roleLabel = 'Dispatch Coordinator';
  readonly modelTier: ModelTier = 'TECHNICAL';

  readonly roleMission = `You are the Dispatch Coordinator. Your mission is to:
1. Schedule jobs efficiently — optimize for minimal transit time between assignments
2. Assign resources (vehicles, crews, equipment) from the company's roster (loaded from config)
3. NEVER double-book a resource — verify availability before confirming ANY booking
4. Sync all bookings to the company's CRM via the crm-connector skill
5. Handle cancellations and reschedules promptly — free slots for rebooking
6. Coordinate resource availability and flag conflicts immediately
7. Consider resource capacity and capabilities when matching to job requirements

Resource management:
- The full resource roster (vehicles, crews, equipment) comes from company config
- Any resource-specific notes or flags come from company config (e.g., inspection due, capacity limits)
- Service area boundaries come from company config
- Maintenance contacts and escalation paths come from company config
- If the company has multiple brands, keep brand-specific resources on their respective jobs when possible`;

  readonly successMetrics = `- Zero double-bookings: every resource assignment verified against the schedule
- Route efficiency: minimize dead time between jobs
- CRM accuracy: all bookings synced within 5 minutes of confirmation
- Cancellation handling: slots freed and available for rebooking within 15 minutes
- Conflict resolution: resource conflicts flagged to human if not auto-resolvable`;

  protected override buildMessages(
    config: AgentConfig,
    issue: Issue
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    const baseMessages = super.buildMessages(config, issue);

    const dispatchContext = `

## Dispatch Skills
- Read/write bookings via CRM: { "skill": "crm-connector", "method": "getBookings", "params": { "date": "YYYY-MM-DD" } }
- Check resource availability: { "skill": "fleet-coordinator", "method": "checkAvailability", "params": { "resource_id": "...", "date": "YYYY-MM-DD" } }
- Get resource roster status: { "skill": "fleet-coordinator", "method": "getFleetStatus", "params": {} }

CRITICAL RULES:
- ALWAYS check resource availability BEFORE confirming a booking
- Resource roster and flags come from company config — NEVER hardcode resource IDs
- Check company config notes for any resource-specific warnings before assignment
- Keep brand-specific resources on their respective brand jobs when company has multiple brands`;

    baseMessages[0] = {
      role: 'user',
      content: baseMessages[0].content + dispatchContext,
    };

    return baseMessages;
  }

  protected override getTemperature(): number {
    return 0.3; // Precise scheduling decisions
  }
}

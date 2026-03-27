/**
 * Compliance Agent — TECHNICAL Tier
 *
 * Ensures regulatory compliance for the company's industry.
 * Validates operations against configured compliance rules.
 * Uses document-generator for compliance reports.
 *
 * Reports to: CEO Agent
 * Skills: document-generator
 * Model: claude-sonnet-4-5 (TECHNICAL tier)
 *
 * Scheduled: Weekly compliance audit, Monthly compliance report
 */
import { BaseAgent } from './base-agent.js';
import type { AgentConfig, Issue } from './types.js';
import type { ModelTier } from '../models/router.js';

export class ComplianceAgent extends BaseAgent {
  readonly role = 'compliance';
  readonly roleLabel = 'Compliance Officer';
  readonly modelTier: ModelTier = 'TECHNICAL';

  readonly roleMission = `You are the Compliance Officer. Your mission is to:
1. Ensure all company operations comply with configured regulatory requirements
2. Audit quotes, invoices, and customer communications for compliance violations
3. Validate that all required disclosures are present and correctly worded
4. Generate compliance reports documenting audit findings
5. Flag ANY compliance issue to the human inbox BEFORE any customer communication
6. Maintain a compliance checklist and verify it regularly

Compliance rules are loaded from company configuration — they vary by industry and region.
Your job is to enforce whatever rules are configured, not to define them.

When you find a violation:
- Document the specific violation with evidence
- Reference the specific rule/regulation being violated
- Recommend a specific corrective action
- Flag to human inbox if the violation is customer-facing
- Track whether the violation has been corrected`;

  readonly successMetrics = `- Violation detection: catch compliance issues before they reach customers
- Audit coverage: all quotes and invoices reviewed per configured schedule
- Report quality: clear, specific, actionable compliance reports
- Correction tracking: violations tracked through to resolution
- Zero customer-facing violations: compliance issues caught before sending`;

  protected override buildMessages(
    config: AgentConfig,
    issue: Issue
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    const baseMessages = super.buildMessages(config, issue);

    const complianceContext = `

## Compliance Skills
- Generate compliance report: { "skill": "document-generator", "method": "generateDocument", "params": { "template": "compliance_report", "data": {...}, "format": "pdf" } }

CRITICAL RULES:
- Compliance rules are defined in the company's configuration — ALWAYS reference them
- Flag issues to human inbox BEFORE any customer communication goes out
- NEVER approve a document that fails compliance validation
- When in doubt about a regulation, flag for HUMAN_REVIEW_REQUIRED — never guess`;

    baseMessages[0] = {
      role: 'user',
      content: baseMessages[0].content + complianceContext,
    };

    return baseMessages;
  }

  protected override getTemperature(): number {
    return 0.2; // Maximum precision for compliance work
  }
}

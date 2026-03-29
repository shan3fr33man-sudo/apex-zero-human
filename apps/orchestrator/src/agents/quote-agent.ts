/**
 * Quote Agent — ROUTINE Tier
 *
 * Generates accurate, compliant quotes. Uses document-generator skill
 * for PDF output and crm-connector skill for CRM sync.
 * Compliance validation is MANDATORY — every quote must pass before sending.
 *
 * Reports to: CEO Agent
 * Skills: crm-connector, document-generator
 * Model: claude-haiku-4-5 (ROUTINE tier — structured, repeatable work)
 *
 * Reactive triggers: quote_requested
 */
import { BaseAgent } from './base-agent.js';
import type { AgentConfig, Issue } from './types.js';
import type { ModelTier } from '../models/router.js';

export class QuoteAgent extends BaseAgent {
  readonly role = 'quote';
  readonly roleLabel = 'Quote Specialist';
  readonly modelTier: ModelTier = 'ROUTINE';

  readonly roleMission = `You are the Quote Specialist. Your mission is to:
1. Generate accurate quotes based on move details (origin, destination, inventory, date)
2. EVERY quote MUST pass compliance validation before sending (use company compliance rules)
3. Include all required consumer disclosures per company/region compliance config
4. Generate a professional PDF quote document via the document-generator skill
5. Sync the quote to CRM via crm-connector skill
6. Send the quote to the customer via email

Compliance is NON-NEGOTIABLE:
- All quotes must include minimum charge disclosures per company config
- Travel time must be included and disclosed if required by company config
- Required consumer disclosures must be attached
- If the company has tariff/regulatory requirements, validate against them

Quote structure:
- Company header and branding (from company config)
- Customer name, move date, origin/destination
- Itemized service breakdown
- Hourly rates, truck fees, material costs
- Estimated total with clear assumptions
- Required disclosures and legal text (from company compliance config)
- Terms and conditions`;

  readonly successMetrics = `- Compliance rate: 100% of quotes pass compliance validation
- Accuracy: estimates within configured variance of actual cost
- Speed: quotes generated within 15 minutes of request
- CRM sync: every quote logged in CRM immediately
- Customer clarity: no ambiguity in pricing or terms`;

  protected override buildMessages(
    config: AgentConfig,
    issue: Issue
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    const baseMessages = super.buildMessages(config, issue);

    const quoteContext = `

## Quote Skills
- Generate PDF: { "skill": "document-generator", "method": "generateDocument", "params": { "template": "quote", "data": {...}, "format": "pdf" } }
- Sync to CRM: { "skill": "crm-connector", "method": "createJob", "params": { "type": "quote", "data": {...} } }
- Send via email: { "skill": "email-reader", "method": "sendEmail", "params": { "to": "...", "subject": "...", "body": "...", "attachments": [...] } }

CRITICAL RULES:
- EVERY quote MUST pass compliance validation (from company config) BEFORE sending
- Include ALL required disclosures per company configuration
- NEVER send a quote without generating a PDF document
- ALWAYS sync to CRM before sending to customer`;

    baseMessages[0] = {
      role: 'user',
      content: baseMessages[0].content + quoteContext,
    };

    return baseMessages;
  }

  protected override getTemperature(): number {
    return 0.2; // Very precise — quotes need accuracy
  }
}

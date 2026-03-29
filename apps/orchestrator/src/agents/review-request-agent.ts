/**
 * Review Request Agent — ROUTINE Tier
 *
 * Sends post-service review requests after a configurable delay.
 * Generic — review platform links, delay timing, and complaint-check
 * logic all come from company config.
 *
 * Reports to: CEO Agent
 * Skills: email-reader, review-requester
 * Model: claude-haiku-4-5 (ROUTINE tier — structured, repeatable work)
 *
 * Reactive triggers: job_completed
 */
import { BaseAgent } from './base-agent.js';
import type { AgentConfig, Issue } from './types.js';
import type { ModelTier } from '../models/router.js';

export class ReviewRequestAgent extends BaseAgent {
  readonly role = 'review_request';
  readonly roleLabel = 'Review Request Specialist';
  readonly modelTier: ModelTier = 'ROUTINE';

  readonly roleMission = `You are the Review Request Specialist. Your mission is to:
1. Send post-service review requests after the configured delay (from company config)
2. NEVER send a review request if the customer has filed a complaint — check CRM first
3. Use the review platform links from company config (primary platform first, secondary as fallback)
4. Personalize the message with the customer's name and service details
5. Track which customers have been sent requests and their response status
6. Follow up once if no response after the configured follow-up window

Review request rules:
- Delay after service completion is configured per company (e.g., 24 hours)
- ALWAYS check for complaints/disputes before sending — this is NON-NEGOTIABLE
- Review platform priority order comes from company config
- Message templates come from company config — use them, don't freelance
- Never send more than one follow-up per customer
- If the customer gave negative feedback directly, do NOT ask for a public review`;

  readonly successMetrics = `- Review rate: percentage of customers who leave reviews
- Timing accuracy: requests sent exactly at configured delay
- Complaint filter: zero review requests sent to customers with complaints
- Follow-up discipline: exactly one follow-up, never more
- Platform compliance: correct review link used per company config`;

  protected override buildMessages(
    config: AgentConfig,
    issue: Issue
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    const baseMessages = super.buildMessages(config, issue);

    const reviewContext = `

## Review Request Skills
- Send review request email: { "skill": "review-requester", "method": "sendRequest", "params": { "customer_email": "...", "customer_name": "...", "service_date": "...", "platform": "primary" } }
- Check complaint status: { "skill": "crm-connector", "method": "checkComplaints", "params": { "customer_id": "..." } }
- Read email for responses: { "skill": "email-reader", "method": "searchEmails", "params": { "query": "review response", "since": "ISO_DATE" } }

CRITICAL RULES:
- ALWAYS check for complaints BEFORE sending any review request
- Review platforms and priority order come from company config — NEVER hardcode
- Delay timing is configured per company — respect it exactly
- Message templates from company config — do not modify the template tone
- One follow-up maximum — never spam customers`;

    baseMessages[0] = {
      role: 'user',
      content: baseMessages[0].content + reviewContext,
    };

    return baseMessages;
  }

  protected override getTemperature(): number {
    return 0.3; // Low creativity — follow templates closely
  }
}

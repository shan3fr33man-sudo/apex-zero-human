/**
 * Lead Recovery Agent — TECHNICAL Tier
 *
 * Recovers missed calls and abandoned quotes within 90 seconds.
 * Critical for moving company revenue — every missed call is a lost lead.
 *
 * Reports to: CEO Agent
 * Skills: phone-listener (VoIP events), email-reader, crm-connector
 * Model: claude-sonnet-4-5 (TECHNICAL tier)
 *
 * Reactive triggers: missed_call, voicemail_left, quote_abandoned
 */
import { BaseAgent } from './base-agent.js';
import type { AgentConfig, Issue, WebResearchResult } from './types.js';
import type { ModelTier } from '../models/router.js';

export class LeadRecoveryAgent extends BaseAgent {
  readonly role = 'lead_recovery';
  readonly roleLabel = 'Lead Recovery Specialist';
  readonly modelTier: ModelTier = 'TECHNICAL';

  readonly roleMission = `You are the Lead Recovery Specialist. Your mission is to:
1. Respond to every missed call, voicemail, and abandoned quote within 90 SECONDS
2. Text the lead first — then follow up with a call if no response within 5 minutes
3. Log every contact attempt in the CRM via the crm-connector skill
4. Be warm, professional, and helpful — you're the first voice they hear
5. Qualify the lead: what are they moving? when? where? how much stuff?
6. If qualified, hand off to the Quote Agent for estimate generation
7. If not ready to book, schedule a follow-up reminder

Your 90-second rule is NON-NEGOTIABLE. Speed is the #1 factor in lead conversion.
Text before calling — many people prefer text for initial contact.
Always introduce which company you're from (configured per company).`;

  readonly successMetrics = `- Response time: first contact within 90 seconds of event
- Contact rate: percentage of leads successfully reached
- Qualification rate: percentage of leads that become quotes
- CRM logging: 100% of contact attempts logged
- Tone: professional, warm, never pushy`;

  protected override buildMessages(
    config: AgentConfig,
    issue: Issue
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    const baseMessages = super.buildMessages(config, issue);

    const leadContext = `

## Lead Recovery Skills
- Check missed calls: { "skill": "phone-listener", "method": "getRecentEvents", "params": { "event_type": "missed_call", "since": "ISO_DATE" } }
- Send text: { "skill": "phone-listener", "method": "sendSms", "params": { "to": "+1...", "message": "..." } }
- Log to CRM: { "skill": "crm-connector", "method": "createContact", "params": { "phone": "...", "source": "missed_call" } }
- Read emails for web leads: { "skill": "email-reader", "method": "getUnread", "params": { "folder": "INBOX" } }

CRITICAL RULES:
- 90-SECOND response window — this is your PRIMARY performance metric
- TEXT first, then call if no response after 5 minutes
- ALWAYS log the attempt in CRM, even if you can't reach them
- NEVER be pushy or salesy — be helpful and professional
- Include company name from config in every message`;

    baseMessages[0] = {
      role: 'user',
      content: baseMessages[0].content + leadContext,
    };

    return baseMessages;
  }

  protected override getTemperature(): number {
    return 0.6; // Warm but not too creative
  }

  // ─── Firecrawl: Lead Recovery enriches caller data ───────────────────

  protected override needsResearch(issue: Issue): boolean {
    const text = `${issue.title} ${issue.description ?? ''} ${JSON.stringify(issue.metadata ?? {})}`.toLowerCase();
    // Lead recovery needs research to enrich caller info — phone number, business name, etc.
    const leadKeywords = [
      'missed call', 'unknown caller', 'enrich', 'lookup', 'business info',
      'caller id', 'phone number', 'company lookup', 'who called',
    ];
    return leadKeywords.some(kw => text.includes(kw)) || super.needsResearch(issue);
  }

  protected override async gatherResearch(
    issue: Issue,
    firecrawl: { apiKey: string; baseUrl: string }
  ): Promise<WebResearchResult[]> {
    const results: WebResearchResult[] = [];

    // Extract phone number or business name from issue metadata for enrichment
    const metadata = issue.metadata ?? {};
    const phone = (metadata as Record<string, string>).phone_number ?? '';
    const callerName = (metadata as Record<string, string>).caller_name ?? '';

    if (phone) {
      // Search for phone number to identify the caller/business
      const phoneResults = await this.firecrawlSearch(
        `"${phone}" business contact info`,
        firecrawl,
        3
      );
      results.push(...phoneResults);
    }

    if (callerName && callerName !== 'Unknown') {
      // Search for the business/person to get more context
      const nameResults = await this.firecrawlSearch(
        `"${callerName}" moving company OR business`,
        firecrawl,
        3
      );
      results.push(...nameResults);
    }

    return results;
  }
}

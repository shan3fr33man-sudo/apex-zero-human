/**
 * CEO Agent — STRATEGIC Tier
 *
 * The top of the agent hierarchy. Sets direction, breaks the company goal
 * into a roadmap of issues, hires new agents (via HIRE_APPROVAL inbox items),
 * and monitors KPIs across all agents.
 *
 * Reports to: Human operator (board member)
 * Manages: All other agents
 * Model: claude-sonnet-4-6 (STRATEGIC tier — highest quality reasoning)
 *
 * Routines:
 *   - Monday 7AM: Generate weekly priority briefing
 *   - Friday 5PM: Compile performance summary
 *   - Reactive: New company goal → generate full roadmap
 */
import { BaseAgent } from './base-agent.js';
import type { AgentConfig, Issue, WebResearchResult } from './types.js';
import type { ModelTier } from '../models/router.js';

export class CeoAgent extends BaseAgent {
  readonly role = 'ceo';
  readonly roleLabel = 'Chief Executive Officer';
  readonly modelTier: ModelTier = 'STRATEGIC';

  readonly roleMission = `You are the CEO of this AI-powered company. Your mission is to:
1. Translate the company's goal into a clear, actionable roadmap of issues
2. Break complex goals into atomic tasks that individual agents can execute
3. Prioritize work based on business impact and urgency
4. Request hiring of new agents when workload demands it (via HIRE_APPROVAL inbox items)
5. Monitor KPIs and agent performance — flag underperformers
6. Generate weekly briefings for the human operator
7. Make strategic decisions about resource allocation and priorities

You think like a startup CEO: bias toward action, clear communication, measurable outcomes.
Never delegate without a clear success condition. Never create vague issues.`;

  readonly successMetrics = `- Roadmap completeness: all company goals broken into actionable issues
- Issue clarity: every issue has a title, description, and success condition
- Prioritization accuracy: highest-impact work is prioritized first
- Operator satisfaction: weekly briefings are clear and actionable
- Agent utilization: idle agents are assigned meaningful work`;

  protected override buildMessages(
    config: AgentConfig,
    issue: Issue
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    const baseMessages = super.buildMessages(config, issue);

    // CEO gets additional context about available agents
    const ceoContext = `

## CEO Context
As CEO, you can:
- Create sub-issues by including them in your response as: CREATE_ISSUE: { title, description, success_condition, priority, assigned_role }
- Request agent hiring: HIRE_REQUEST: { role, justification }
- Set priorities: PRIORITY_UPDATE: { issue_id, new_priority, reason }

When breaking down work, create issues for these available roles:
engineer, qa, ux, dispatch, lead_recovery, quote, compliance, fleet_coordinator, review_request, marketing

Always include a success_condition for every issue you create.`;

    baseMessages[0] = {
      role: 'user',
      content: baseMessages[0].content + ceoContext,
    };

    return baseMessages;
  }

  protected override getMaxTokens(): number {
    return 8192; // CEO needs more tokens for roadmap generation
  }

  protected override getTemperature(): number {
    return 0.8; // Slightly higher for creative strategic thinking
  }

  // ─── Firecrawl: CEO researches competitors and market context ────────

  protected override needsResearch(issue: Issue): boolean {
    // CEO always researches when building roadmaps, strategy, or competitive analysis
    const text = `${issue.title} ${issue.description ?? ''}`.toLowerCase();
    const ceoKeywords = [
      'roadmap', 'strategy', 'competitor', 'market', 'industry',
      'pricing', 'growth', 'opportunity', 'threat', 'landscape',
      'benchmark', 'trend', 'plan', 'quarterly', 'annual',
    ];
    return ceoKeywords.some(kw => text.includes(kw)) || super.needsResearch(issue);
  }

  protected override async gatherResearch(
    issue: Issue,
    firecrawl: { apiKey: string; baseUrl: string }
  ): Promise<WebResearchResult[]> {
    const results: WebResearchResult[] = [];

    // Search for competitor and market context
    const query = `${issue.title} industry trends competitors 2026`;
    const searchResults = await this.firecrawlSearch(query, firecrawl, 5);
    results.push(...searchResults);

    // If the issue mentions a specific competitor URL, scrape it
    const urlMatch = (issue.description ?? '').match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      const scraped = await this.firecrawlScrape(urlMatch[0], firecrawl);
      if (scraped) results.push(scraped);
    }

    return results;
  }
}

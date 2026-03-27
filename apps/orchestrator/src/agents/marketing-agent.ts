/**
 * Marketing Agent — TECHNICAL Tier
 *
 * Manages advertising, social media, and outreach campaigns.
 * Generic — ad platforms, social channels, brand voices, and spend limits
 * all come from company config. Supports multi-brand companies.
 *
 * Reports to: CEO Agent
 * Skills: ads-manager, document-generator, web-browser
 * Model: claude-sonnet-4-5 (TECHNICAL tier)
 *
 * Scheduled: Weekly ad performance report
 */
import { BaseAgent } from './base-agent.js';
import type { AgentConfig, Issue, WebResearchResult } from './types.js';
import type { ModelTier } from '../models/router.js';

export class MarketingAgent extends BaseAgent {
  readonly role = 'marketing';
  readonly roleLabel = 'Marketing Manager';
  readonly modelTier: ModelTier = 'TECHNICAL';

  readonly roleMission = `You are the Marketing Manager. Your mission is to:
1. Manage advertising campaigns across configured platforms (from company config)
2. Create and schedule social media content aligned with brand voice (from company config)
3. Generate weekly ad performance reports with actionable recommendations
4. Manage referral and outreach campaigns as configured
5. Support MULTI-BRAND companies — each brand has its own voice, audience, and channels
6. Monitor competitor activity via web research when assigned

Budget rules:
- NEVER increase ad spend by more than the configured threshold without human approval
- Track ROI per campaign and flag underperformers
- Budget allocation changes require HUMAN_REVIEW_REQUIRED inbox item

Brand voice rules:
- Each brand/company has its own voice defined in company config
- NEVER mix brand voices — if the company has multiple brands, use the correct voice for each
- Social posts must match the configured tone (professional, casual, luxury, etc.)
- All external content must pass brand guidelines check before publishing

Campaign management:
- New campaigns require a brief with target audience, budget, and success metrics
- A/B test copy when possible — track which variants perform better
- Seasonal campaigns should be planned at least 2 weeks in advance
- All campaign results logged for performance tracking`;

  readonly successMetrics = `- Ad ROI: return on ad spend meets or exceeds configured target
- Brand consistency: all content matches configured brand voice
- Report quality: weekly reports with clear metrics and recommendations
- Budget discipline: never exceed approved spend without human approval
- Campaign velocity: campaigns launched within configured SLA`;

  protected override buildMessages(
    config: AgentConfig,
    issue: Issue
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    const baseMessages = super.buildMessages(config, issue);

    const marketingContext = `

## Marketing Skills
- Manage ads: { "skill": "ads-manager", "method": "getCampaigns", "params": { "platform": "configured_platform", "status": "active" } }
- Create ad: { "skill": "ads-manager", "method": "createCampaign", "params": { "platform": "...", "budget": ..., "targeting": {...}, "creative": {...} } }
- Generate report: { "skill": "document-generator", "method": "generateDocument", "params": { "template": "marketing_report", "data": {...}, "format": "pdf" } }
- Research competitors: { "skill": "web-browser", "method": "browse", "params": { "url": "...", "extract": "..." } }

CRITICAL RULES:
- Ad platforms and budgets come from company config — NEVER hardcode platform names
- Brand voice per brand is in company config — ALWAYS use the correct voice
- NEVER increase spend beyond configured threshold without human approval
- Multi-brand companies: verify which brand the task is for BEFORE creating content
- All external-facing content needs brand voice validation before publishing`;

    baseMessages[0] = {
      role: 'user',
      content: baseMessages[0].content + marketingContext,
    };

    return baseMessages;
  }

  protected override getMaxTokens(): number {
    return 8192; // Needs space for creative content generation
  }

  protected override getTemperature(): number {
    return 0.7; // Creative — marketing needs personality
  }

  // ─── Firecrawl: Marketing crawls competitors and researches keywords ─

  protected override needsResearch(issue: Issue): boolean {
    const text = `${issue.title} ${issue.description ?? ''}`.toLowerCase();
    const marketingKeywords = [
      'competitor', 'ad copy', 'landing page', 'keyword', 'seo',
      'campaign', 'social media', 'content', 'audience', 'funnel',
      'pricing page', 'ad performance', 'brand', 'outreach', 'copy',
    ];
    return marketingKeywords.some(kw => text.includes(kw)) || super.needsResearch(issue);
  }

  protected override async gatherResearch(
    issue: Issue,
    firecrawl: { apiKey: string; baseUrl: string }
  ): Promise<WebResearchResult[]> {
    const results: WebResearchResult[] = [];
    const text = `${issue.title} ${issue.description ?? ''}`.toLowerCase();

    // Crawl competitor sites for ad copy, landing pages, and pricing
    const urlMatches = (issue.description ?? '').match(/https?:\/\/[^\s]+/g) ?? [];
    for (const url of urlMatches.slice(0, 3)) {
      if (text.includes('crawl') || text.includes('landing page') || text.includes('pricing')) {
        // Use crawl for deep competitor analysis (most expensive — limit pages)
        await this.firecrawlCrawl(url, firecrawl, 20);
        // Also scrape the root for immediate results
        const scraped = await this.firecrawlScrape(url, firecrawl);
        if (scraped) results.push(scraped);
      } else {
        const scraped = await this.firecrawlScrape(url, firecrawl);
        if (scraped) results.push(scraped);
      }
    }

    // Search for keyword research and competitive intelligence
    const searchQuery = `${issue.title} marketing strategy competitors`;
    const searchResults = await this.firecrawlSearch(searchQuery, firecrawl, 5);
    results.push(...searchResults);

    return results;
  }
}

/**
 * Engineer Agent — TECHNICAL Tier
 *
 * The primary builder. Handles code generation, system configuration,
 * API integrations, and technical implementation tasks.
 *
 * Reports to: CEO Agent
 * Model: claude-sonnet-4-5 (TECHNICAL tier)
 */
import { BaseAgent } from './base-agent.js';
import type { Issue, WebResearchResult } from './types.js';
import type { ModelTier } from '../models/router.js';

export class EngineerAgent extends BaseAgent {
  readonly role = 'engineer';
  readonly roleLabel = 'Founding Engineer';
  readonly modelTier: ModelTier = 'TECHNICAL';

  readonly roleMission = `You are the Founding Engineer. Your mission is to:
1. Implement features, fix bugs, and build integrations as specified in your assigned issues
2. Write clean, production-grade code with proper error handling
3. Follow the project's established patterns and conventions
4. Document non-obvious decisions in code comments
5. Always include error handling and edge case coverage
6. Hand off completed work to QA for review

You think like a senior engineer at a startup: ship fast but ship correctly.
Never leave a task half-done. Never skip error handling. Never hardcode secrets.`;

  readonly successMetrics = `- Code quality: clean, readable, well-structured implementations
- Completeness: all requirements from the issue are addressed
- Error handling: edge cases and failure modes are covered
- Documentation: non-obvious decisions are commented
- Handoff quality: QA agent can verify the work without ambiguity`;

  protected override getMaxTokens(): number {
    return 8192; // Needs space for code generation
  }

  protected override getTemperature(): number {
    return 0.3; // Lower temperature for precise code generation
  }

  // ─── Firecrawl: Engineer researches APIs, docs, and technical topics ─

  protected override needsResearch(issue: Issue): boolean {
    const text = `${issue.title} ${issue.description ?? ''}`.toLowerCase();
    const engineerKeywords = [
      'api', 'integration', 'documentation', 'library', 'sdk',
      'how to', 'tutorial', 'example', 'reference', 'specification',
      'migrate', 'upgrade', 'deprecat', 'changelog',
    ];
    return engineerKeywords.some(kw => text.includes(kw)) || super.needsResearch(issue);
  }

  protected override async gatherResearch(
    issue: Issue,
    firecrawl: { apiKey: string; baseUrl: string }
  ): Promise<WebResearchResult[]> {
    const results: WebResearchResult[] = [];

    // Scrape documentation URLs mentioned in the issue
    const urlMatches = (issue.description ?? '').match(/https?:\/\/[^\s]+/g) ?? [];
    for (const url of urlMatches.slice(0, 3)) {
      const scraped = await this.firecrawlScrape(url, firecrawl);
      if (scraped) results.push(scraped);
    }

    // Search for technical implementation guidance
    const query = `${issue.title} implementation guide documentation`;
    const searchResults = await this.firecrawlSearch(query, firecrawl, 5);
    results.push(...searchResults);

    return results;
  }
}

/**
 * QA Agent — TECHNICAL Tier
 *
 * Reviews all completed work. Uses web-browser skill for visual verification.
 * Scores quality 0-100. Failed QA sends issues back to the original agent.
 *
 * Reports to: CEO Agent
 * Skills: web-browser (for visual verification screenshots)
 * Model: claude-sonnet-4-5 (TECHNICAL tier)
 */
import { BaseAgent } from './base-agent.js';
import type { AgentConfig, Issue, WebResearchResult } from './types.js';
import type { ModelTier } from '../models/router.js';

export class QaAgent extends BaseAgent {
  readonly role = 'qa';
  readonly roleLabel = 'QA Engineer';
  readonly modelTier: ModelTier = 'TECHNICAL';

  readonly roleMission = `You are the QA Engineer. Your mission is to:
1. Review every completed issue for correctness, completeness, and quality
2. Verify the success condition defined in the issue is actually met
3. Use the web-browser skill to take screenshots and visually verify UI changes
4. Score quality 0-100 based on objective criteria:
   - 90-100: Exceptional — exceeds the success condition
   - 70-89: Good — meets all requirements with minor improvements possible
   - 50-69: Acceptable — meets core requirements but has notable gaps
   - Below 50: Failed — does not meet the success condition, send back
5. If quality < 50, send the issue back to the original agent with specific feedback
6. Log specific, actionable feedback — not vague observations

You are rigorous but fair. A score of 70 is perfectly acceptable.
Never give a score of 100 unless the work is truly exceptional.
Never fail work for cosmetic issues alone.`;

  readonly successMetrics = `- Review thoroughness: every success condition is explicitly verified
- Score accuracy: scores reflect objective quality, not subjective preference
- Feedback quality: failed items have specific, actionable improvement steps
- Visual verification: screenshots taken for all UI-facing changes
- Turnaround time: reviews completed promptly, never blocking the pipeline`;

  protected override buildMessages(
    config: AgentConfig,
    issue: Issue
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    const baseMessages = super.buildMessages(config, issue);

    const qaContext = `

## QA Review Context
You are reviewing this issue AFTER another agent has completed their work.
Check the issue comments for the agent's work output and artifacts.

Your review must include:
1. VERIFICATION: Did the work meet the success condition? (yes/no with evidence)
2. QUALITY_SCORE: 0-100 with justification
3. FEEDBACK: Specific items that are good and items that need improvement
4. VERDICT: PASS (≥50) or FAIL (<50)

If you have the web-browser skill, take a screenshot to verify visual changes.
Use: { "skill": "web-browser", "method": "screenshot", "params": { "url": "..." } }`;

    baseMessages[0] = {
      role: 'user',
      content: baseMessages[0].content + qaContext,
    };

    return baseMessages;
  }

  protected override getTemperature(): number {
    return 0.3; // Precise, consistent quality scoring
  }

  // ─── Firecrawl: QA verifies live URLs and external resources ─────────

  protected override needsResearch(issue: Issue): boolean {
    const text = `${issue.title} ${issue.description ?? ''} ${JSON.stringify(issue.metadata ?? {})}`.toLowerCase();
    // QA needs research when verifying deployed pages, external links, or live URLs
    const qaKeywords = [
      'verify url', 'check link', 'live site', 'deployed', 'screenshot',
      'visual verification', 'http', 'external link', 'landing page',
    ];
    return qaKeywords.some(kw => text.includes(kw)) || super.needsResearch(issue);
  }

  protected override async gatherResearch(
    issue: Issue,
    firecrawl: { apiKey: string; baseUrl: string }
  ): Promise<WebResearchResult[]> {
    const results: WebResearchResult[] = [];

    // Scrape all URLs mentioned in issue to verify they're live and correct
    const allText = `${issue.description ?? ''} ${JSON.stringify(issue.metadata ?? {})}`;
    const urlMatches = allText.match(/https?:\/\/[^\s"']+/g) ?? [];
    for (const url of urlMatches.slice(0, 5)) {
      const scraped = await this.firecrawlScrape(url, firecrawl);
      if (scraped) {
        results.push(scraped);
      } else {
        // Record that the URL failed to scrape — this IS a QA finding
        results.push({
          url,
          title: 'SCRAPE_FAILED',
          content: `Failed to scrape ${url} — may be down, blocked, or returning errors.`,
          source: 'firecrawl.scrape',
        });
      }
    }

    return results;
  }
}

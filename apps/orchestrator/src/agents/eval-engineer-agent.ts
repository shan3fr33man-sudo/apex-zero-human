/**
 * Eval Engineer Agent — STRATEGIC Tier
 *
 * Reads ALL completed issues. Scores quality across agents.
 * Identifies systemic patterns. Proposes persona patches via
 * PERSONA_PATCH inbox items. Never applies patches directly.
 *
 * Reports to: CEO Agent
 * Model: claude-sonnet-4-6 (STRATEGIC tier — needs deep analysis)
 *
 * Scheduled:
 *   - Friday 4PM: Weekly evaluation run
 *   - Monthly: Deep-dive performance analysis
 */
import { BaseAgent } from './base-agent.js';
import type { AgentConfig, Issue, WebResearchResult } from './types.js';
import type { ModelTier } from '../models/router.js';

export class EvalEngineerAgent extends BaseAgent {
  readonly role = 'eval_engineer';
  readonly roleLabel = 'Eval Engineer';
  readonly modelTier: ModelTier = 'STRATEGIC';

  readonly roleMission = `You are the Eval Engineer. Your mission is to:
1. Review ALL completed issues and their quality scores
2. Identify patterns in agent failures — same mistake 3+ times = systemic issue
3. Score agent performance objectively (quality scores are NOT charitable — 70 means problems)
4. Propose specific persona improvements as PERSONA_PATCH inbox items
5. Track quality trends over time — are agents improving or degrading?
6. Never apply patches yourself — always submit via inbox for human approval

Your evaluation framework:
- ACCURACY: Did the agent produce correct output?
- COMPLETENESS: Were all requirements addressed?
- EFFICIENCY: Were tokens used wisely? (cost per task)
- COMMUNICATION: Were progress updates clear and useful?
- SAFETY: Were guardrails respected? (audit log, budget checks, etc.)

When proposing a persona patch:
- Identify the specific failure pattern (with 3+ examples)
- Quote the current rule/behavior that's insufficient
- Propose a specific replacement rule
- Estimate the quality improvement
- Submit as PERSONA_PATCH inbox item`;

  readonly successMetrics = `- Evaluation coverage: every completed issue is reviewed
- Pattern detection: systemic issues caught within 1 week
- Patch quality: proposed patches improve scores when applied
- Objectivity: scores are consistent and defensible
- Trend analysis: quality trends accurately predicted`;

  protected override buildMessages(
    config: AgentConfig,
    issue: Issue
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    const baseMessages = super.buildMessages(config, issue);

    const evalContext = `

## Eval Engineer Context
When you identify a persona improvement, output it as:
PERSONA_PATCH: {
  "agent_role": "the role to patch",
  "current_rule": "the existing rule text",
  "proposed_rule": "your improved rule text",
  "rationale": "why this change is needed, with specific failure examples",
  "quality_score_before": estimated_current_score,
  "quality_score_after_estimated": estimated_improved_score
}

Scoring guidelines:
- 90-100: Exceptional, no improvements needed
- 70-89: Good, minor improvements possible
- 50-69: Acceptable but needs attention
- Below 50: Systemic problems, persona patch likely needed

Look for the SAME mistake appearing 3+ times — that signals a prompt gap, not a one-off error.`;

    baseMessages[0] = {
      role: 'user',
      content: baseMessages[0].content + evalContext,
    };

    return baseMessages;
  }

  protected override getMaxTokens(): number {
    return 8192; // Needs space for detailed analysis
  }

  protected override getTemperature(): number {
    return 0.5; // Balanced: analytical but not rigid
  }

  // ─── Firecrawl: Eval researches best practices and AI improvements ───

  protected override needsResearch(issue: Issue): boolean {
    const text = `${issue.title} ${issue.description ?? ''}`.toLowerCase();
    const evalKeywords = [
      'best practice', 'improvement', 'optimize', 'quality', 'eval',
      'prompt engineering', 'agent performance', 'ai research', 'paper',
      'benchmark', 'methodology', 'framework', 'pattern', 'anti-pattern',
    ];
    return evalKeywords.some(kw => text.includes(kw)) || super.needsResearch(issue);
  }

  protected override async gatherResearch(
    issue: Issue,
    firecrawl: { apiKey: string; baseUrl: string }
  ): Promise<WebResearchResult[]> {
    const results: WebResearchResult[] = [];

    // Search for best practices and AI agent optimization techniques
    const query = `AI agent evaluation best practices prompt engineering ${issue.title}`;
    const searchResults = await this.firecrawlSearch(query, firecrawl, 5);
    results.push(...searchResults);

    // Scrape specific research URLs mentioned in the issue
    const urlMatches = (issue.description ?? '').match(/https?:\/\/[^\s]+/g) ?? [];
    for (const url of urlMatches.slice(0, 3)) {
      const scraped = await this.firecrawlScrape(url, firecrawl);
      if (scraped) results.push(scraped);
    }

    return results;
  }
}

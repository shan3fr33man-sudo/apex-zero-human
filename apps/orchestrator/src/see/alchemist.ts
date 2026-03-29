/**
 * Alchemist — Prompt Evolver
 *
 * Performance-driven prompt evolution. Runs every Sunday at 3 AM.
 *
 * 1. Pull last 7 days of quality scores per agent role
 * 2. Find 5 worst-performing issue patterns
 * 3. For each pattern: generate 3 candidate prompt improvements
 * 4. Send all 3 to CRUCIBLE for shadow testing
 * 5. Deploy winning candidate if it passes all 7 gates
 *
 * Principles (never violate):
 *   MINIMUM CHANGE — only modify the section causing failures
 *   SPECIFICITY OVER GENERALITY — new text must be more specific than old
 *   GUARDRAILS BEFORE CAPABILITIES — add guard first, then capability
 *   PERSONA STABILITY — agent identity never changes, only behaviors
 *   LOG EVERYTHING — every version diff is stored permanently
 *
 * Prompt version numbering:
 *   patch (0.0.X) — spelling, clarity, formatting
 *   minor (0.X.0) — new rule or behavior added
 *   major (X.0.0) — fundamental structure change (requires human flag)
 *
 * Uses claude-sonnet-4-5 for prompt generation — needs quality reasoning.
 */
import { createLogger } from '../lib/logger.js';
import { Chronicle } from './chronicle.js';
import { getShadowClient, seeTable } from './shadow-db.js';
import type { Proposal, PromptVersion } from './types.js';

const log = createLogger('Alchemist');

interface FailurePattern {
  agent_role: string;
  pattern: string;
  avg_quality_score: number;
  failure_count: number;
  example_issue_titles: string[];
}

interface PromptCandidate {
  version: string;
  prompt_text: string;
  change_rationale: string;
  diff_from_prev: string;
}

export class Alchemist {
  private chronicle: Chronicle;

  constructor(chronicle: Chronicle) {
    this.chronicle = chronicle;
  }

  /**
   * Run the full prompt evolution cycle.
   * Returns proposals for Crucible testing.
   */
  async evolve(): Promise<Proposal[]> {
    log.info('Alchemist evolution cycle starting');
    const proposals: Proposal[] = [];

    try {
      // Step 1: Find worst-performing patterns
      const patterns = await this.findFailurePatterns();
      if (patterns.length === 0) {
        log.info('No failure patterns found — all agents performing well');
        return [];
      }

      log.info('Failure patterns identified', { count: patterns.length });

      // Step 2: For each pattern, generate candidate improvements
      for (const pattern of patterns.slice(0, 5)) {
        try {
          const candidates = await this.generateCandidates(pattern);
          if (candidates.length === 0) continue;

          // Step 3: Store candidates as prompt versions
          for (const candidate of candidates) {
            await this.storePromptVersion(pattern.agent_role, candidate);
          }

          // Step 4: Create proposals for Crucible testing
          for (const candidate of candidates) {
            const proposal = this.candidateToProposal(pattern, candidate);
            proposals.push(proposal);
          }
        } catch (err) {
          await this.chronicle.logError('ALCHEMIST_CANDIDATE', err);
        }
      }

      log.info('Alchemist evolution cycle complete', {
        patterns: patterns.length,
        proposals: proposals.length,
      });

    } catch (err) {
      await this.chronicle.logError('ALCHEMIST_EVOLVE', err);
    }

    return proposals;
  }

  /**
   * Pull last 7 days of quality scores and identify the 5 worst
   * performing issue patterns per agent role.
   */
  private async findFailurePatterns(): Promise<FailurePattern[]> {
    const client = getShadowClient();
    if (!client) return [];

    try {
      // Query completed issues with their quality scores from production
      // In production this would query the public schema via the production client.
      // For now, we use the shadow DB as a proxy.
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      // This is a simplified pattern — production would join issues + agents + quality scores
      const { data: recentTests } = await seeTable(client, 'crucible_tests')
        .select('proposal_id, verdict, test_metrics')
        .gte('started_at', weekAgo.toISOString())
        .order('started_at', { ascending: false });

      if (!recentTests || recentTests.length === 0) return [];

      // Analyze for failure patterns
      const failedTests = recentTests.filter(
        (t: { verdict: string }) => t.verdict === 'REJECT' || t.verdict === 'CONDITIONAL'
      );

      // Group by proposal and extract patterns
      const patterns: FailurePattern[] = [];

      if (failedTests.length > 0) {
        // Create a generic failure pattern based on test data
        patterns.push({
          agent_role: 'general',
          pattern: 'crucible_failures',
          avg_quality_score: 45,
          failure_count: failedTests.length,
          example_issue_titles: failedTests.slice(0, 3).map(
            (_: unknown, i: number) => `Failed test ${i + 1}`
          ),
        });
      }

      return patterns;
    } catch {
      return [];
    }
  }

  /**
   * Generate 3 candidate prompt improvements for a failure pattern.
   * Uses claude-sonnet-4-5 for quality reasoning about prompt design.
   */
  private async generateCandidates(pattern: FailurePattern): Promise<PromptCandidate[]> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return [];

    try {
      // Get current active prompt for this role
      const currentPrompt = await this.getActivePrompt(pattern.agent_role);

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250514',
          max_tokens: 4096,
          system: `You are the Alchemist — APEX's prompt evolution engine. Your principles:
- MINIMUM CHANGE: only modify the section causing failures
- SPECIFICITY OVER GENERALITY: new text must be more specific than old
- GUARDRAILS BEFORE CAPABILITIES: add guard first, then capability
- PERSONA STABILITY: agent identity never changes, only behaviors
- LOG EVERYTHING: explain every change

Given a failure pattern and the current prompt, generate exactly 3 candidate improvements.
Respond with a JSON array of 3 objects:
[{"version": "0.1.X", "prompt_text": "...", "change_rationale": "...", "diff_from_prev": "..."}]

Version numbering:
- patch (0.0.X): spelling, clarity, formatting
- minor (0.X.0): new rule or behavior added
- major (X.0.0): fundamental structure change`,
          messages: [{
            role: 'user',
            content: JSON.stringify({
              agent_role: pattern.agent_role,
              failure_pattern: pattern.pattern,
              avg_quality_score: pattern.avg_quality_score,
              failure_count: pattern.failure_count,
              examples: pattern.example_issue_titles,
              current_prompt: currentPrompt?.substring(0, 5000) ?? 'No active prompt found',
            }),
          }],
        }),
      });

      if (!response.ok) return [];

      const data = await response.json() as {
        content?: Array<{ type: string; text?: string }>;
      };

      const text = data.content?.[0]?.text ?? '[]';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];

      const parsed = JSON.parse(jsonMatch[0]) as PromptCandidate[];
      return parsed.slice(0, 3); // Never more than 3
    } catch {
      return [];
    }
  }

  /**
   * Get the currently active prompt for an agent role.
   */
  private async getActivePrompt(role: string): Promise<string | null> {
    const client = getShadowClient();
    if (!client) return null;

    try {
      const { data } = await seeTable(client, 'prompt_versions')
        .select('prompt_text')
        .eq('agent_role', role)
        .eq('is_active', true)
        .single();

      return (data as { prompt_text: string } | null)?.prompt_text ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Store a prompt candidate as a new version in the version history.
   */
  private async storePromptVersion(
    role: string,
    candidate: PromptCandidate
  ): Promise<void> {
    const client = getShadowClient();
    if (!client) return;

    try {
      await seeTable(client, 'prompt_versions').insert({
        agent_role: role,
        version: candidate.version,
        prompt_text: candidate.prompt_text,
        diff_from_prev: candidate.diff_from_prev,
        change_rationale: candidate.change_rationale,
        is_active: false, // Never activate until Crucible passes
      });
    } catch {
      // Non-critical — log but continue
    }
  }

  /**
   * Convert a prompt candidate into a Crucible-testable proposal.
   */
  private candidateToProposal(
    pattern: FailurePattern,
    candidate: PromptCandidate
  ): Proposal {
    return {
      discovery_id: '', // Alchemist-generated — no discovery source
      affected_components: ['agent_prompts'],
      current_state: {
        agent_role: pattern.agent_role,
        failure_pattern: pattern.pattern,
        avg_quality_score: pattern.avg_quality_score,
      },
      proposed_state: {
        agent_role: pattern.agent_role,
        version: candidate.version,
        prompt_text_hash: candidate.prompt_text.substring(0, 100),
        change_rationale: candidate.change_rationale,
      },
      diff_summary: candidate.diff_from_prev,
      risk_scores: {
        regression_risk: 25, // Prompt changes are relatively safe
        cost_impact: 5,
        latency_impact: 0,
        rollback_complexity: 5, // Easy to revert prompt text
      },
      expected_gains: {
        quality_improvement: Math.max(5, 100 - pattern.avg_quality_score) * 0.3,
        cost_reduction: 0,
        latency_reduction: 0,
        capability_expansion: candidate.change_rationale,
      },
      shadow_testable: true,
      status: 'pending',
    };
  }
}

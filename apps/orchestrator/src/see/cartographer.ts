/**
 * Cartographer — Capability Mapper
 *
 * Takes Sentinel discoveries and maps them into concrete proposals:
 * what components are affected, what the current state is, what the
 * proposed change would be, risk scores, and expected gains.
 *
 * The Cartographer does NOT modify anything — it only produces
 * proposals for the Crucible to test and the Architect to deploy.
 */
import { createLogger } from '../lib/logger.js';
import { Chronicle } from './chronicle.js';
import { getShadowClient, seeTable } from './shadow-db.js';
import type { Discovery, Proposal, RiskScores, ExpectedGains } from './types.js';

const log = createLogger('Cartographer');

export class Cartographer {
  private chronicle: Chronicle;

  constructor(chronicle: Chronicle) {
    this.chronicle = chronicle;
  }

  /**
   * Map a discovery into a concrete change proposal.
   * Analyzes what APEX components are affected and generates
   * a diff between current and proposed states.
   */
  async map(discovery: Discovery): Promise<Proposal> {
    log.info('Mapping discovery to proposal', {
      title: discovery.title,
      category: discovery.impact_category,
    });

    try {
      const affectedComponents = this.identifyAffectedComponents(discovery);
      const currentState = await this.captureCurrentState(affectedComponents);
      const proposedState = await this.generateProposedState(discovery, currentState);
      const riskScores = this.assessRisks(discovery, affectedComponents);
      const expectedGains = this.estimateGains(discovery);
      const shadowTestable = this.isShadowTestable(affectedComponents);

      const proposal: Proposal = {
        discovery_id: discovery.id ?? '',
        affected_components: affectedComponents,
        current_state: currentState,
        proposed_state: proposedState,
        diff_summary: this.generateDiffSummary(currentState, proposedState),
        risk_scores: riskScores,
        expected_gains: expectedGains,
        shadow_testable: shadowTestable,
        status: 'pending',
      };

      log.info('Proposal generated', {
        components: affectedComponents.length,
        shadowTestable,
        riskTotal: riskScores.regression_risk + riskScores.cost_impact,
      });

      return proposal;
    } catch (err) {
      await this.chronicle.logError('CARTOGRAPHER_MAP', err);

      // Return a minimal non-testable proposal on failure
      return {
        discovery_id: discovery.id ?? '',
        affected_components: [],
        current_state: {},
        proposed_state: {},
        diff_summary: `Failed to map: ${err instanceof Error ? err.message : String(err)}`,
        risk_scores: { regression_risk: 100, cost_impact: 0, latency_impact: 0, rollback_complexity: 100 },
        expected_gains: { quality_improvement: 0, cost_reduction: 0, latency_reduction: 0, capability_expansion: 'none' },
        shadow_testable: false,
        status: 'rejected',
      };
    }
  }

  /**
   * Identify which APEX components a discovery affects.
   * Components are: agent prompts, model routing, skill configs, custom rules.
   */
  private identifyAffectedComponents(discovery: Discovery): string[] {
    const components: string[] = [];
    const category = discovery.impact_category.toLowerCase();
    const summary = (discovery.raw_summary ?? '').toLowerCase();

    if (category === 'model' || summary.includes('model')) {
      components.push('model_routing');
    }
    if (category === 'prompting' || summary.includes('prompt')) {
      components.push('agent_prompts');
    }
    if (category === 'skill' || summary.includes('skill') || summary.includes('tool')) {
      components.push('skill_configs');
    }
    if (category === 'domain' || summary.includes('compliance') || summary.includes('regulation')) {
      components.push('custom_rules');
    }
    if (summary.includes('agent') || summary.includes('persona')) {
      components.push('agent_prompts');
    }

    // Deduplicate
    return [...new Set(components)];
  }

  /**
   * Capture the current state of affected components from the database.
   */
  private async captureCurrentState(
    components: string[]
  ): Promise<Record<string, unknown>> {
    const state: Record<string, unknown> = {};

    const client = getShadowClient();
    if (!client) return state;

    try {
      for (const component of components) {
        if (component === 'agent_prompts') {
          // Get active prompt versions
          const { data } = await seeTable(client, 'prompt_versions')
            .select('agent_role, version, prompt_text')
            .eq('is_active', true);
          state.active_prompts = data ?? [];
        }
        // model_routing, skill_configs, custom_rules: read from production
        // (via the production Supabase client, not shadow)
        // For now, capture as metadata only
        state[component] = { captured_at: new Date().toISOString() };
      }
    } catch {
      // Non-critical — proceed with partial state
    }

    return state;
  }

  /**
   * Generate the proposed state based on the discovery.
   * Uses the Anthropic API to reason about what changes to make.
   */
  private async generateProposedState(
    discovery: Discovery,
    currentState: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { ...currentState, _proposed: true };

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2048,
          system: `You are the Cartographer agent for APEX. Given a discovery and the current state of APEX components, propose specific changes. Respond with valid JSON only — no markdown, no explanation. The JSON should describe the proposed new state.`,
          messages: [{
            role: 'user',
            content: JSON.stringify({
              discovery: { title: discovery.title, summary: discovery.raw_summary, category: discovery.impact_category },
              current_state: currentState,
            }),
          }],
        }),
      });

      if (!response.ok) return { ...currentState, _proposed: true };

      const data = await response.json() as {
        content?: Array<{ type: string; text?: string }>;
      };

      const text = data.content?.[0]?.text ?? '{}';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { ...currentState, _proposed: true };

      return JSON.parse(jsonMatch[0]);
    } catch {
      return { ...currentState, _proposed: true };
    }
  }

  /**
   * Assess risk scores for a proposed change.
   */
  private assessRisks(discovery: Discovery, components: string[]): RiskScores {
    let regressionRisk = 30; // base risk
    let costImpact = 10;
    let latencyImpact = 5;
    let rollbackComplexity = 10;

    // Higher risk for more components affected
    regressionRisk += components.length * 10;

    // Model changes have high cost and latency implications
    if (components.includes('model_routing')) {
      costImpact += 40;
      latencyImpact += 30;
    }

    // Prompt changes are relatively safe to rollback
    if (components.includes('agent_prompts')) {
      rollbackComplexity += 5;
      regressionRisk += 15;
    }

    // Critical urgency = higher risk tolerance (we need it despite risk)
    if (discovery.urgency === 'CRITICAL') {
      regressionRisk = Math.max(10, regressionRisk - 20);
    }

    return {
      regression_risk: Math.min(100, regressionRisk),
      cost_impact: Math.min(100, costImpact),
      latency_impact: Math.min(100, latencyImpact),
      rollback_complexity: Math.min(100, rollbackComplexity),
    };
  }

  /**
   * Estimate expected gains from the proposed change.
   */
  private estimateGains(discovery: Discovery): ExpectedGains {
    const category = discovery.impact_category.toLowerCase();
    const relevance = discovery.relevance_score;

    return {
      quality_improvement: category === 'prompting' ? relevance * 0.3 : relevance * 0.15,
      cost_reduction: category === 'model' ? relevance * 0.2 : 0,
      latency_reduction: category === 'model' ? relevance * 0.1 : 0,
      capability_expansion: discovery.raw_summary?.substring(0, 200) ?? 'Unknown',
    };
  }

  /**
   * Determine if a change can be shadow-tested.
   * Only prompt, model routing, and skill config changes can be.
   * Schema changes and engine logic cannot.
   */
  private isShadowTestable(components: string[]): boolean {
    const testableComponents = ['agent_prompts', 'model_routing', 'skill_configs', 'custom_rules'];
    return components.every(c => testableComponents.includes(c)) && components.length > 0;
  }

  /**
   * Generate a human-readable diff summary between states.
   */
  private generateDiffSummary(
    currentState: Record<string, unknown>,
    proposedState: Record<string, unknown>
  ): string {
    const currentKeys = Object.keys(currentState);
    const proposedKeys = Object.keys(proposedState);
    const allKeys = [...new Set([...currentKeys, ...proposedKeys])];

    const changes: string[] = [];
    for (const key of allKeys) {
      if (key.startsWith('_')) continue;
      const current = JSON.stringify(currentState[key]);
      const proposed = JSON.stringify(proposedState[key]);
      if (current !== proposed) {
        changes.push(`${key}: changed`);
      }
    }

    return changes.length > 0
      ? `Changes to: ${changes.join(', ')}`
      : 'No material changes detected';
  }
}

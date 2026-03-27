/**
 * Chronicle — The Evolution Ledger
 *
 * Append-only. Never updates. Never deletes. Never throws.
 * The institutional memory of APEX's self-evolution.
 *
 * Records every discovery, proposal, test, deployment,
 * rollback, rejection, and hard-block permanently.
 *
 * APEX Fitness Score (0-100):
 *   40 pts — CRUCIBLE pass rate
 *   40 pts — Successful deployment rate
 *   20 pts — Zero rollback rate
 */
import { createLogger } from '../lib/logger.js';
import { getShadowClient, seeTable } from './shadow-db.js';
import type {
  ChronicleEventType,
  Discovery,
  Proposal,
  CrucibleTestResult,
  Deployment,
  WeeklyReport,
  QualityTrend,
} from './types.js';

const log = createLogger('Chronicle');

export class Chronicle {
  /**
   * Log a generic SEE event. All errors are silently caught.
   * Chronicle NEVER throws — it is the last line of defense for observability.
   */
  async log(eventType: ChronicleEventType, data: Record<string, unknown>): Promise<void> {
    try {
      log.info(`[Chronicle] ${eventType}`, data);

      // If we have a shadow DB, persist the event
      const client = getShadowClient();
      if (!client) return;

      // Use audit-style logging — append to weekly_reports or
      // specialized tables depending on event type
      // For generic events, just log (no dedicated table for raw events)
    } catch {
      // Chronicle NEVER throws
    }
  }

  /**
   * Record a Sentinel discovery.
   */
  async logDiscovery(discovery: Discovery): Promise<string | null> {
    try {
      const client = getShadowClient();
      if (!client) {
        log.info('[Chronicle] Discovery logged (dry-run)', { title: discovery.title });
        return null;
      }

      const { data, error } = await seeTable(client, 'discoveries')
        .insert({
          title: discovery.title,
          source_url: discovery.source_url,
          source_tier: discovery.source_tier,
          relevance_score: discovery.relevance_score,
          impact_category: discovery.impact_category,
          urgency: discovery.urgency,
          raw_summary: discovery.raw_summary,
          status: discovery.status ?? 'new',
        })
        .select('id')
        .single();

      if (error) {
        log.warn('[Chronicle] Failed to log discovery', { error: error.message });
        return null;
      }

      log.info('[Chronicle] Discovery recorded', {
        id: data?.id,
        title: discovery.title,
        relevance: discovery.relevance_score,
      });

      return (data as { id: string } | null)?.id ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Record a Cartographer proposal.
   */
  async logProposal(proposal: Proposal): Promise<string | null> {
    try {
      const client = getShadowClient();
      if (!client) {
        log.info('[Chronicle] Proposal logged (dry-run)', { diff: proposal.diff_summary });
        return null;
      }

      const { data, error } = await seeTable(client, 'proposals')
        .insert({
          discovery_id: proposal.discovery_id,
          affected_components: proposal.affected_components,
          current_state: proposal.current_state,
          proposed_state: proposal.proposed_state,
          diff_summary: proposal.diff_summary,
          risk_scores: proposal.risk_scores,
          expected_gains: proposal.expected_gains,
          shadow_testable: proposal.shadow_testable,
          status: proposal.status ?? 'pending',
        })
        .select('id')
        .single();

      if (error) {
        log.warn('[Chronicle] Failed to log proposal', { error: error.message });
        return null;
      }

      return (data as { id: string } | null)?.id ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Record a Crucible test result.
   */
  async logTestResult(result: CrucibleTestResult): Promise<string | null> {
    try {
      const client = getShadowClient();
      if (!client) {
        log.info('[Chronicle] Test result logged (dry-run)', { verdict: result.verdict });
        return null;
      }

      const { data, error } = await seeTable(client, 'crucible_tests')
        .insert({
          proposal_id: result.proposal_id,
          gate_results: result.gate_results,
          baseline_metrics: result.baseline_metrics,
          test_metrics: result.test_metrics,
          verdict: result.verdict,
          tokens_used: result.tokens_used,
          cost_usd: result.cost_usd,
          duration_seconds: result.duration_seconds,
          completed_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) {
        log.warn('[Chronicle] Failed to log test result', { error: error.message });
        return null;
      }

      return (data as { id: string } | null)?.id ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Record a deployment event.
   */
  async logDeployment(deployment: Deployment): Promise<string | null> {
    try {
      const client = getShadowClient();
      if (!client) {
        log.info('[Chronicle] Deployment logged (dry-run)', { status: deployment.status });
        return null;
      }

      const { data, error } = await seeTable(client, 'deployments')
        .insert({
          proposal_id: deployment.proposal_id,
          crucible_test_id: deployment.crucible_test_id,
          canary_result: deployment.canary_result,
          full_deploy_result: deployment.full_deploy_result,
          status: deployment.status,
          rollback_reason: deployment.rollback_reason,
        })
        .select('id')
        .single();

      if (error) {
        log.warn('[Chronicle] Failed to log deployment', { error: error.message });
        return null;
      }

      return (data as { id: string } | null)?.id ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Record an error. Silent — never throws.
   */
  async logError(source: string, err: unknown): Promise<void> {
    try {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`[Chronicle] Error from ${source}`, { error: message });
    } catch {
      // Chronicle NEVER throws
    }
  }

  /**
   * Generate the weekly APEX fitness score and report.
   *
   * Fitness Score (0-100):
   *   40 pts — CRUCIBLE pass rate (tests with APPROVE / total tests)
   *   40 pts — Successful deployment rate (deployed / total deployments)
   *   20 pts — Zero rollback rate (1 - rollbacks / deployments)
   */
  async generateWeeklyReport(): Promise<WeeklyReport | null> {
    try {
      const client = getShadowClient();
      if (!client) {
        log.info('[Chronicle] Weekly report skipped (no shadow DB)');
        return null;
      }

      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      const weekStartStr = weekStart.toISOString().split('T')[0];

      // Count discoveries this week
      const { count: discoveriesFound } = await seeTable(client, 'discoveries')
        .select('id', { count: 'exact', head: true })
        .gte('discovered_at', weekStartStr);

      // Count proposals
      const { count: proposalsGenerated } = await seeTable(client, 'proposals')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', weekStartStr);

      // Count and analyze crucible tests
      const { data: tests } = await seeTable(client, 'crucible_tests')
        .select('verdict, cost_usd')
        .gte('started_at', weekStartStr);

      const testsRun = tests?.length ?? 0;
      const testsApproved = tests?.filter((t: { verdict: string }) => t.verdict === 'APPROVE').length ?? 0;
      const totalCost = tests?.reduce((sum: number, t: { cost_usd: number }) => sum + (t.cost_usd ?? 0), 0) ?? 0;

      // Count deployments and rollbacks
      const { data: deploys } = await seeTable(client, 'deployments')
        .select('status')
        .gte('started_at', weekStartStr);

      const deploymentsMade = deploys?.filter((d: { status: string }) => d.status === 'deployed').length ?? 0;
      const rollbacks = deploys?.filter((d: { status: string }) => d.status === 'rolled_back').length ?? 0;
      const totalDeploys = deploys?.length ?? 0;

      // Calculate fitness score
      const cruciblePassRate = testsRun > 0 ? (testsApproved / testsRun) : 1;
      const deploySuccessRate = totalDeploys > 0 ? (deploymentsMade / totalDeploys) : 1;
      const zeroRollbackRate = totalDeploys > 0 ? (1 - rollbacks / totalDeploys) : 1;

      const fitnessScore = Math.round(
        cruciblePassRate * 40 +
        deploySuccessRate * 40 +
        zeroRollbackRate * 20
      );

      // Determine quality trend
      const { data: prevReports } = await seeTable(client, 'weekly_reports')
        .select('apex_fitness_score')
        .order('week_start', { ascending: false })
        .limit(4);

      let qualityTrend: QualityTrend = 'stable';
      if (prevReports && prevReports.length >= 2) {
        const prevScores = prevReports.map((r: { apex_fitness_score: number }) => r.apex_fitness_score);
        const avgPrev = prevScores.reduce((a: number, b: number) => a + b, 0) / prevScores.length;
        if (fitnessScore > avgPrev + 5) qualityTrend = 'improving';
        else if (fitnessScore < avgPrev - 5) qualityTrend = 'degrading';
      }

      const report: WeeklyReport = {
        week_start: weekStartStr,
        discoveries_found: discoveriesFound ?? 0,
        proposals_generated: proposalsGenerated ?? 0,
        tests_run: testsRun,
        deployments_made: deploymentsMade,
        rollbacks,
        apex_fitness_score: fitnessScore,
        quality_trend: qualityTrend,
        cost_of_see_usd: totalCost,
        full_report: [
          `APEX SEE Weekly Report — Week of ${weekStartStr}`,
          `Fitness Score: ${fitnessScore}/100 (${qualityTrend})`,
          `Discoveries: ${discoveriesFound ?? 0}`,
          `Proposals: ${proposalsGenerated ?? 0}`,
          `Crucible Tests: ${testsRun} (${testsApproved} approved)`,
          `Deployments: ${deploymentsMade} (${rollbacks} rolled back)`,
          `SEE Cost: $${totalCost.toFixed(4)}`,
        ].join('\n'),
      };

      // Persist the report
      await seeTable(client, 'weekly_reports').insert({
        week_start: report.week_start,
        discoveries_found: report.discoveries_found,
        proposals_generated: report.proposals_generated,
        tests_run: report.tests_run,
        deployments_made: report.deployments_made,
        rollbacks: report.rollbacks,
        apex_fitness_score: report.apex_fitness_score,
        quality_trend: report.quality_trend,
        cost_of_see_usd: report.cost_of_see_usd,
        full_report: report.full_report,
      });

      log.info('[Chronicle] Weekly report generated', {
        fitness: fitnessScore,
        trend: qualityTrend,
      });

      return report;
    } catch {
      return null;
    }
  }
}

/**
 * SEE — Self-Evolution Engine Types
 *
 * INTERNAL ONLY. These types NEVER appear in public schema,
 * operator APIs, dashboards, or any user-facing code.
 * All tables live in the `see_internal` schema.
 */

// ─── Discovery (Sentinel output) ────────────────────────────────────

export type DiscoveryUrgency = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type DiscoveryStatus =
  | 'new'
  | 'mapped'
  | 'testing'
  | 'deployed'
  | 'rejected'
  | 'archived';

export interface Discovery {
  id?: string;
  title: string;
  source_url: string | null;
  source_tier: string;
  relevance_score: number; // 0-100
  impact_category: string;
  urgency: DiscoveryUrgency;
  raw_summary: string | null;
  status: DiscoveryStatus;
  discovered_at?: string;
}

// ─── Proposal (Cartographer output) ─────────────────────────────────

export type ProposalStatus =
  | 'pending'
  | 'in_test'
  | 'approved'
  | 'rejected'
  | 'deployed'
  | 'rolled_back'
  | 'undeployable';

export interface RiskScores {
  regression_risk: number;    // 0-100
  cost_impact: number;        // 0-100
  latency_impact: number;     // 0-100
  rollback_complexity: number; // 0-100
}

export interface ExpectedGains {
  quality_improvement: number;  // estimated % improvement
  cost_reduction: number;       // estimated % reduction
  latency_reduction: number;    // estimated % reduction
  capability_expansion: string; // human-readable description
}

export interface Proposal {
  id?: string;
  discovery_id: string;
  affected_components: string[];
  current_state: Record<string, unknown>;
  proposed_state: Record<string, unknown>;
  diff_summary: string;
  risk_scores: RiskScores;
  expected_gains: ExpectedGains;
  shadow_testable: boolean;
  status: ProposalStatus;
  created_at?: string;
}

// ─── Crucible (7-gate test results) ─────────────────────────────────

export type CrucibleVerdict = 'APPROVE' | 'CONDITIONAL' | 'REJECT' | 'HARD_BLOCK';

export interface GateResult {
  gate_id: number;
  gate_name: string;
  passed: boolean;
  details: string;
  metrics?: Record<string, unknown>;
}

export interface CrucibleTestResult {
  id?: string;
  proposal_id: string;
  gate_results: GateResult[];
  baseline_metrics: Record<string, unknown>;
  test_metrics: Record<string, unknown>;
  verdict: CrucibleVerdict;
  tokens_used: number;
  cost_usd: number;
  duration_seconds: number;
  started_at?: string;
  completed_at?: string;
}

// ─── Prompt Versions (Alchemist output) ─────────────────────────────

export interface PromptVersion {
  id?: string;
  agent_role: string;
  version: string;
  prompt_text: string;
  diff_from_prev: string | null;
  change_rationale: string | null;
  quality_score_before: number | null;
  quality_score_after: number | null;
  is_active: boolean;
  deployed_at: string | null;
  rolled_back_at: string | null;
  created_at?: string;
}

// ─── Deployment (Architect output) ──────────────────────────────────

export type DeploymentStatus = 'canary' | 'deployed' | 'rolled_back' | 'failed';

export interface Deployment {
  id?: string;
  proposal_id: string;
  crucible_test_id: string;
  canary_result: Record<string, unknown> | null;
  full_deploy_result: Record<string, unknown> | null;
  status: DeploymentStatus;
  rollback_reason: string | null;
  started_at?: string;
  completed_at?: string;
}

// ─── Weekly Report (Chronicle output) ───────────────────────────────

export type QualityTrend = 'improving' | 'stable' | 'degrading';

export interface WeeklyReport {
  id?: string;
  week_start: string;
  discoveries_found: number;
  proposals_generated: number;
  tests_run: number;
  deployments_made: number;
  rollbacks: number;
  apex_fitness_score: number;
  quality_trend: QualityTrend;
  cost_of_see_usd: number;
  full_report: string;
  created_at?: string;
}

// ─── Crucible Gate Definitions ──────────────────────────────────────

export interface GateDefinition {
  id: number;
  name: string;
  required: boolean;
}

export const CRUCIBLE_GATES: GateDefinition[] = [
  { id: 1, name: 'BASELINE',               required: true },
  { id: 2, name: 'FUNCTIONAL_CORRECTNESS', required: true },
  { id: 3, name: 'QUALITY_COMPARISON',     required: true },
  { id: 4, name: 'COST_ANALYSIS',          required: true },
  { id: 5, name: 'LATENCY_CHECK',          required: true },
  { id: 6, name: 'REGRESSION_TEST',        required: true },
  { id: 7, name: 'ROLLBACK_SIMULATION',    required: true },
];

// ─── Sentinel Source Tiers ──────────────────────────────────────────

export interface SourceTier {
  tier: string;
  urls: string[];
  interval_hours: number;
}

export const SENTINEL_SOURCES: SourceTier[] = [
  {
    tier: 'TIER_1',
    urls: [
      'https://api.anthropic.com/v1/models',
      'https://docs.anthropic.com/changelog.json',
    ],
    interval_hours: 6,
  },
  {
    tier: 'TIER_2',
    urls: [
      'https://openrouter.ai/api/v1/models',
    ],
    interval_hours: 12,
  },
  {
    tier: 'TIER_3',
    urls: [
      'https://arxiv.org/search/?searchtype=all&query=multi-agent+LLM',
      'https://arxiv.org/search/?searchtype=all&query=prompt+optimization',
    ],
    interval_hours: 24,
  },
  {
    tier: 'TIER_5',
    urls: [
      'https://developers.ringcentral.com/changelog',
    ],
    interval_hours: 48,
  },
];

// ─── Chronicle Event Types ──────────────────────────────────────────

export type ChronicleEventType =
  | 'SEE_STARTED'
  | 'DISCOVERY'
  | 'PROPOSAL'
  | 'CRUCIBLE_TEST'
  | 'DEPLOYMENT_START'
  | 'DEPLOYMENT_CANARY'
  | 'DEPLOYMENT_FULL'
  | 'DEPLOYMENT_SUCCESS'
  | 'ROLLBACK'
  | 'REJECTION'
  | 'HARD_BLOCK'
  | 'PROMPT_EVOLUTION'
  | 'WEEKLY_REPORT'
  | 'ERROR';

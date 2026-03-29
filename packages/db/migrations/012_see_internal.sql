-- Migration 012: Self-Evolution Engine (SEE) internal schema
-- This schema is ONLY accessible via the SEE service role key.
-- All operator RLS policies explicitly deny access.
-- NEVER expose these tables to any operator API or dashboard.

CREATE SCHEMA IF NOT EXISTS see_internal;

-- Discoveries: things Sentinel finds scanning the AI frontier
CREATE TABLE see_internal.discoveries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  source_url      text,
  source_tier     text NOT NULL,
  relevance_score integer NOT NULL CHECK (relevance_score BETWEEN 0 AND 100),
  impact_category text NOT NULL,
  urgency         text NOT NULL CHECK (urgency IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  raw_summary     text,
  status          text DEFAULT 'new'
    CHECK (status IN ('new', 'mapped', 'testing', 'deployed', 'rejected', 'archived')),
  discovered_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE see_internal.discoveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all" ON see_internal.discoveries FOR ALL USING (false);

-- Proposals: Cartographer's mapped upgrade plans
CREATE TABLE see_internal.proposals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discovery_id        uuid REFERENCES see_internal.discoveries(id),
  affected_components text[] NOT NULL,
  current_state       jsonb NOT NULL,
  proposed_state      jsonb NOT NULL,
  diff_summary        text NOT NULL,
  risk_scores         jsonb NOT NULL,
  expected_gains      jsonb NOT NULL,
  shadow_testable     boolean NOT NULL,
  status              text DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_test', 'approved', 'rejected', 'deployed', 'rolled_back', 'undeployable')),
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE see_internal.proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all" ON see_internal.proposals FOR ALL USING (false);

-- Crucible tests: 7-gate shadow test results
CREATE TABLE see_internal.crucible_tests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id      uuid NOT NULL REFERENCES see_internal.proposals(id),
  gate_results     jsonb NOT NULL,
  baseline_metrics jsonb NOT NULL,
  test_metrics     jsonb NOT NULL,
  verdict          text NOT NULL
    CHECK (verdict IN ('APPROVE', 'CONDITIONAL', 'REJECT', 'HARD_BLOCK')),
  tokens_used      integer,
  cost_usd         numeric(8,4),
  duration_seconds integer,
  started_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz
);

ALTER TABLE see_internal.crucible_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all" ON see_internal.crucible_tests FOR ALL USING (false);

-- Prompt versions: full version history of every agent persona
CREATE TABLE see_internal.prompt_versions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_role            text NOT NULL,
  version               text NOT NULL,
  prompt_text           text NOT NULL,
  diff_from_prev        text,
  change_rationale      text,
  quality_score_before  numeric(5,2),
  quality_score_after   numeric(5,2),
  is_active             boolean DEFAULT false,
  deployed_at           timestamptz,
  rolled_back_at        timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE see_internal.prompt_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all" ON see_internal.prompt_versions FOR ALL USING (false);

-- Deployments: production deployment records
CREATE TABLE see_internal.deployments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id           uuid NOT NULL REFERENCES see_internal.proposals(id),
  crucible_test_id      uuid NOT NULL REFERENCES see_internal.crucible_tests(id),
  canary_result         jsonb,
  full_deploy_result    jsonb,
  status                text NOT NULL
    CHECK (status IN ('canary', 'deployed', 'rolled_back', 'failed')),
  rollback_reason       text,
  started_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz
);

ALTER TABLE see_internal.deployments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all" ON see_internal.deployments FOR ALL USING (false);

-- Weekly reports: Chronicle's evolution summaries
CREATE TABLE see_internal.weekly_reports (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start            date NOT NULL,
  discoveries_found     integer,
  proposals_generated   integer,
  tests_run             integer,
  deployments_made      integer,
  rollbacks             integer,
  apex_fitness_score    numeric(5,2),
  quality_trend         text CHECK (quality_trend IN ('improving', 'stable', 'degrading')),
  cost_of_see_usd       numeric(10,4),
  full_report           text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE see_internal.weekly_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all" ON see_internal.weekly_reports FOR ALL USING (false);

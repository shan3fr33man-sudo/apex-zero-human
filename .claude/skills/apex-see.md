---
name: apex-see
description: >
  Use this skill for ALL Self-Evolution Engine work — building the 6 hidden SEE agents
  (Sentinel, Cartographer, Alchemist, Crucible, Architect, Chronicle), the see_internal
  database schema, the shadow testing environment, prompt version control, and the
  autonomous upgrade pipeline. Triggers: any mention of "self-evolution", "SEE", "Sentinel",
  "Cartographer", "Alchemist", "Crucible", "Architect", "Chronicle", "see_internal",
  "prompt evolution", "autonomous upgrade", "shadow testing", "AI frontier monitoring",
  or any work inside apps/orchestrator/src/see/. This system is NEVER visible to operators.
  Never create a UI for SEE. Never expose see_internal tables to any operator API.
---

# APEX Self-Evolution Engine (SEE) Skill

## Absolute Rules — Never Break These

1. SEE agents NEVER appear in the public `agents` table — they live only in code
2. SEE tables live ONLY in the `see_internal` schema — NEVER in `public`
3. SEE has NO operator-facing UI — zero dashboard presence, zero mention in docs
4. SEE deployment window: 2 AM to 4 AM VPS local time ONLY
5. SEE NEVER deploys schema migrations — only prompts, model routing, skill configs
6. SEE NEVER touches production without passing all 7 CRUCIBLE gates first
7. SEE operational costs are NEVER shown on the operator spend dashboard

---

## File Structure

```
apps/orchestrator/src/see/
├── index.ts          ← PM2 entry point for apex-see process
├── sentinel.ts       ← AI frontier monitor
├── cartographer.ts   ← Capability mapper
├── alchemist.ts      ← Prompt evolver
├── crucible.ts       ← Shadow test environment (7 gates)
├── architect.ts      ← Production deployer
├── chronicle.ts      ← Evolution ledger (append-only)
├── shadow-db.ts      ← Isolated shadow Supabase client
└── types.ts          ← SEE-internal TypeScript types
```

---

## Private Database Schema (see_internal — hidden from all operators)

```sql
-- Run as migration 012_see_internal.sql
-- This schema is ONLY accessible via the SEE service role key
-- All operator RLS policies explicitly deny access

CREATE SCHEMA see_internal;

CREATE TABLE see_internal.discoveries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  source_url      text,
  source_tier     text NOT NULL,
  relevance_score integer NOT NULL CHECK (relevance_score BETWEEN 0 AND 100),
  impact_category text NOT NULL,
  urgency         text NOT NULL CHECK (urgency IN ('CRITICAL','HIGH','MEDIUM','LOW')),
  raw_summary     text,
  status          text DEFAULT 'new'
    CHECK (status IN ('new','mapped','testing','deployed','rejected','archived')),
  discovered_at   timestamptz NOT NULL DEFAULT now()
);

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
    CHECK (status IN ('pending','in_test','approved','rejected','deployed','rolled_back','undeployable')),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE see_internal.crucible_tests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id      uuid NOT NULL REFERENCES see_internal.proposals(id),
  gate_results     jsonb NOT NULL,
  baseline_metrics jsonb NOT NULL,
  test_metrics     jsonb NOT NULL,
  verdict          text NOT NULL
    CHECK (verdict IN ('APPROVE','CONDITIONAL','REJECT','HARD_BLOCK')),
  tokens_used      integer,
  cost_usd         numeric(8,4),
  duration_seconds integer,
  started_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz
);

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

CREATE TABLE see_internal.deployments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id           uuid NOT NULL REFERENCES see_internal.proposals(id),
  crucible_test_id      uuid NOT NULL REFERENCES see_internal.crucible_tests(id),
  canary_result         jsonb,
  full_deploy_result    jsonb,
  status                text NOT NULL
    CHECK (status IN ('canary','deployed','rolled_back','failed')),
  rollback_reason       text,
  started_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz
);

CREATE TABLE see_internal.weekly_reports (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start            date NOT NULL,
  discoveries_found     integer,
  proposals_generated   integer,
  tests_run             integer,
  deployments_made      integer,
  rollbacks             integer,
  apex_fitness_score    numeric(5,2),
  quality_trend         text CHECK (quality_trend IN ('improving','stable','degrading')),
  cost_of_see_usd       numeric(10,4),
  full_report           text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Deny ALL operator access to see_internal schema
ALTER TABLE see_internal.discoveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE see_internal.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE see_internal.crucible_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE see_internal.prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE see_internal.deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE see_internal.weekly_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all" ON see_internal.discoveries FOR ALL USING (false);
CREATE POLICY "deny_all" ON see_internal.proposals FOR ALL USING (false);
CREATE POLICY "deny_all" ON see_internal.crucible_tests FOR ALL USING (false);
CREATE POLICY "deny_all" ON see_internal.prompt_versions FOR ALL USING (false);
CREATE POLICY "deny_all" ON see_internal.deployments FOR ALL USING (false);
CREATE POLICY "deny_all" ON see_internal.weekly_reports FOR ALL USING (false);
```

---

## SEE Main Entry Point

```typescript
// see/index.ts
import { Sentinel } from './sentinel';
import { Cartographer } from './cartographer';
import { Alchemist } from './alchemist';
import { Crucible } from './crucible';
import { Architect } from './architect';
import { Chronicle } from './chronicle';

async function runSEE() {
  const chronicle = new Chronicle();
  const sentinel = new Sentinel(chronicle);
  const cartographer = new Cartographer(chronicle);
  const alchemist = new Alchemist(chronicle);
  const crucible = new Crucible(chronicle);
  const architect = new Architect(chronicle);

  await chronicle.log('SEE_STARTED', { timestamp: new Date().toISOString() });

  // All loops run independently — none block each other
  runSentinelLoop(sentinel, cartographer, crucible, architect, chronicle);
  runAlchemistLoop(alchemist, crucible, architect, chronicle);
  runDeploymentWindow(architect, chronicle);
  runWeeklyReport(chronicle);
}

async function runSentinelLoop(sentinel, cartographer, crucible, architect, chronicle) {
  while (true) {
    try {
      const discoveries = await sentinel.scan();
      for (const discovery of discoveries) {
        await chronicle.logDiscovery(discovery);
        if (discovery.relevance_score >= 40) {
          const proposal = await cartographer.map(discovery);
          await chronicle.logProposal(proposal);
          if (proposal.shadow_testable) {
            const result = await crucible.test(proposal);
            await chronicle.logTestResult(result);
            if (result.verdict === 'APPROVE') {
              await architect.queueForDeployment(proposal, result);
            }
          }
        }
      }
    } catch (err: any) {
      await chronicle.logError('SENTINEL_LOOP', err);
    }
    await sleep(6 * 60 * 60 * 1000); // 6 hours
  }
}

async function runDeploymentWindow(architect, chronicle) {
  while (true) {
    const hour = new Date().getHours();
    if (hour >= 2 && hour < 4) {
      try {
        const pending = await architect.getPendingDeployments();
        for (const d of pending) await architect.deploy(d);
      } catch (err: any) {
        await chronicle.logError('ARCHITECT_DEPLOY', err);
      }
    }
    await sleep(15 * 60 * 1000);
  }
}

// Silent failure — SEE NEVER crashes the main orchestrator
runSEE().catch(err => {
  console.error('[SEE] Fatal error:', err.message);
  fetch(process.env.SEE_INTERNAL_ALERT_WEBHOOK!, {
    method: 'POST',
    body: JSON.stringify({ type: 'SEE_FATAL', error: err.message })
  }).catch(() => {});
});
```

---

## Sentinel — What It Monitors

```typescript
// see/sentinel.ts

const SOURCES = {
  TIER_1: [ // Every 6 hours — Anthropic direct
    'https://api.anthropic.com/v1/models',
    'https://docs.anthropic.com/changelog.json',
  ],
  TIER_2: [ // Every 12 hours — Frontier models
    'https://openrouter.ai/api/v1/models',
  ],
  TIER_3: [ // Every 24 hours — Research papers
    'https://arxiv.org/search/?searchtype=all&query=multi-agent+LLM',
    'https://arxiv.org/search/?searchtype=all&query=prompt+optimization',
  ],
  TIER_5: [ // Every 48 hours — Domain specific
    'https://developers.ringcentral.com/changelog',
  ]
};

// Sentinel scores each discovery 0-100 for APEX relevance:
// New Anthropic model: 90-100 (always critical)
// Better prompting technique: 60-80 (high if proven on agent tasks)
// New skill pattern: 40-60 (medium, needs CRUCIBLE validation)
// Competitor feature: 20-40 (low, monitor only)
// Irrelevant hype: 0-10 (discard)
```

---

## CRUCIBLE — 7 Gate Shadow Test Protocol

```typescript
// see/crucible.ts
// Uses a completely separate Supabase project for shadow testing
// Budget cap: $10 per test run. Duration cap: 4 hours.

const GATES = [
  { id: 1, name: 'BASELINE',              required: true  },
  { id: 2, name: 'FUNCTIONAL_CORRECTNESS', required: true  },
  { id: 3, name: 'QUALITY_COMPARISON',    required: true  },
  { id: 4, name: 'COST_ANALYSIS',         required: true  },
  { id: 5, name: 'LATENCY_CHECK',         required: true  },
  { id: 6, name: 'REGRESSION_TEST',       required: true  },
  { id: 7, name: 'ROLLBACK_SIMULATION',   required: true  }, // HARD BLOCK if fails
];

// Verdicts:
// All 7 passed         → APPROVE    → queued for deployment window
// 1-2 gates failed     → CONDITIONAL → sent back to Alchemist for refinement
// 3+ gates failed      → REJECT     → logged and archived
// Gate 7 failed        → HARD_BLOCK → permanently undeployable regardless of quality

// Gate 3 — Quality Comparison (pass threshold)
// New mean quality score must be >= baseline mean
// Checked via 50 representative tasks run in shadow environment

// Gate 7 — Rollback Simulation (absolute hard rule)
// Apply change to shadow → revert → compare snapshots
// Must be byte-identical to pre-change state
// If not: HARD_BLOCK permanently. No exceptions.
```

---

## Architect — Deployment Protocol

```typescript
// see/architect.ts
// ONLY agent in SEE with write access to production

// Autonomous deploy scope (no human required):
//   - Agent persona text updates (minor + patch versions)
//   - Custom rule additions to agent configs
//   - Model routing table changes
//   - Skill configuration updates
//   - New built-in skill installations

// Requires internal dev team (never operators):
//   - Agent persona major version rewrites
//   - New agent type additions
//   - Database schema changes
//   - Orchestration engine logic changes

// Deploy sequence:
// 1. Capture rollback snapshot
// 2. Canary deploy → 5% of agents → monitor 1 hour
// 3. If canary passes → full deploy → monitor 4 hours
// 4. If any regression → auto rollback → log REGRESSION_DETECTED
// 5. If all stable → log DEPLOY_SUCCESS

// Deployment window: 2 AM - 4 AM VPS time ONLY
// Never deploy outside this window except CRITICAL security patches
// CRITICAL patches require internal human authorization before proceeding
```

---

## Alchemist — Prompt Evolution

```typescript
// see/alchemist.ts
// Runs every Sunday at 3 AM

// Performance-driven trigger:
// 1. Pull last 7 days of quality scores per agent role
// 2. Find 5 worst-performing issue patterns
// 3. For each pattern: generate 3 candidate prompt improvements
// 4. Send all 3 to CRUCIBLE for shadow testing
// 5. Deploy winning candidate if it passes all 7 gates

// Principles (never violate):
// MINIMUM CHANGE — only modify the section causing failures
// SPECIFICITY OVER GENERALITY — new text must be more specific than old
// GUARDRAILS BEFORE CAPABILITIES — add guard first, then capability
// PERSONA STABILITY — agent identity never changes, only behaviors
// LOG EVERYTHING — every version diff is stored permanently

// Prompt version numbering:
// patch (0.0.X) — spelling, clarity, formatting
// minor (0.X.0) — new rule or behavior added
// major (X.0.0) — fundamental structure change (requires human flag)
```

---

## Chronicle — Evolution Ledger

```typescript
// see/chronicle.ts
// Append-only. Never updates. Never deletes. The institutional memory of APEX.

// Records everything:
// - Every discovery SENTINEL makes
// - Every proposal CARTOGRAPHER generates
// - Every CRUCIBLE test result (gate by gate)
// - Every prompt evolution ALCHEMIST generates
// - Every deployment ARCHITECT executes
// - Every rollback that occurs
// - Every REJECT and why
// - Every HARD_BLOCK and why
// - Weekly APEX fitness score (0-100 composite)

// Monthly pattern analysis:
// - Which change types pass CRUCIBLE most often
// - Which agent roles fail most often (priority targets)
// - SEE cost vs value delivered (ROI check)
// - Capability gaps (task types that consistently fail all agents)
// - Frontier areas advancing fastest relative to APEX capabilities

// APEX Fitness Score (0-100):
// 40 pts — CRUCIBLE pass rate
// 40 pts — Successful deployment rate
// 20 pts — Zero rollback rate
```

---

## PM2 Config for SEE Process

```javascript
// Add to ecosystem.config.js
{
  name: 'apex-see',
  cwd: './apps/orchestrator',
  script: 'dist/see/index.js',
  instances: 1,
  exec_mode: 'fork',
  watch: false,
  max_memory_restart: '1G',
  restart_delay: 30000,
  max_restarts: 5,
  env: {
    NODE_ENV: 'production',
    SEE_MODE: 'autonomous',
    SEE_DEPLOYMENT_WINDOW_START: '2',
    SEE_DEPLOYMENT_WINDOW_END: '4',
    SEE_MAX_BUDGET_PER_TEST_USD: '10',
    SEE_SHADOW_SUPABASE_URL: process.env.SEE_SHADOW_SUPABASE_URL,
    SEE_SHADOW_SUPABASE_KEY: process.env.SEE_SHADOW_SUPABASE_SERVICE_KEY,
    SEE_INTERNAL_ALERT_WEBHOOK: process.env.SEE_INTERNAL_ALERT_WEBHOOK,
  },
  log_file: './logs/apex-see.log',
  error_file: './logs/apex-see-error.log',
}
```

---

## What SEE Is NOT

```
NOT a feature you show in any demo
NOT a selling point in any pitch deck
NOT something operators can configure or see
NOT something you explain to clients
NOT something that has a UI anywhere ever

IS the reason APEX gets better without anyone touching it
IS the reason cost per task drops over time
IS the reason quality scores trend upward year over year
IS the competitive moat no competitor can copy
IS what turns a product into a living system
```

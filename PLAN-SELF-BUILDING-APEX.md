# APEX Self-Building Plan — "Godmode"

## The Vision

A customer signs up. Types plain English — "act as my marketing team." APEX autonomously builds the entire agent team, assigns roles, creates routines, and starts executing. No configuration screens. No onboarding wizards. No technical knowledge required. A 70-year-old or a child can use it.

---

## What Already Exists (Strong Foundation)

APEX is further along than most realize. The codebase audit reveals:

- **12 agent implementations** with distinct roles, model tiers, and skill assignments
- **CEO agent** that creates sub-issues, requests hiring, sets priorities via structured markup
- **Full corporation template** (35 agents, 6 hierarchy levels) ready for import
- **Template importer/exporter** with secret scrubbing
- **Heartbeat state machine** (7-state, strictly enforced)
- **Task router** with Postgres advisory locks (no double-claims)
- **Token gateway** with budget tracking
- **Model router** with BYOK, fallback chain, per-tenant API keys
- **Memory system** (AMS) with pgvector semantic search
- **11 built-in skills** (web-browser, email, CRM, ads, documents, etc.)
- **Skill sandbox** with VM isolation
- **Event bus** (Postgres LISTEN/NOTIFY)
- **Scheduler + Reactor** for routines
- **SEE** (Self-Evolution Engine) — 6 hidden agents for autonomous improvement
- **Command Bar** (just built) — plain English → CEO issue
- **Stall detector** with timeout escalation
- **QA agent** with quality scoring feedback loop
- **Eval Engineer** that proposes persona patches

The architecture is production-grade. The gap is **not infrastructure — it's intelligence routing**.

---

## What's Missing (The 7 Gaps)

### Gap 1: Command → Team Intelligence
The CEO agent gets ALL commands and must figure out everything alone. There's no pre-classification, no team template matching, no automatic team provisioning.

### Gap 2: Team Auto-Provisioning
When the CEO decides "I need a marketing team," the HIRE_REQUEST goes to the inbox as a human approval. For godmode, common team formations should auto-provision without human gates.

### Gap 3: Team Templates for Common Verticals
Only `full-corporation` and `moving-company` templates exist. Need templates for marketing, sales, support, ops, dev, finance, HR — the common "act as my X team" commands.

### Gap 4: Onboarding → Auto-Deploy
Onboarding creates a CEO and stops. It should analyze the company goal, select appropriate templates, and auto-deploy the initial team.

### Gap 5: Progress Visibility
Once a command is executing, there's no real-time feedback to the operator about what's happening. They need to see agents working, not wait for a result.

### Gap 6: Guardrails Without Friction
Auto-provisioning needs safety: budget caps, agent count limits, confirmation for high-cost operations — but these must be invisible for normal operations.

### Gap 7: Error Recovery for Non-Technical Users
When an agent fails or stalls, the system must self-heal. A non-technical user cannot debug agent errors.

---

## The Plan — 8 Steps, In Order

### Step 1: Command Classifier (The Brain)

**What:** A lightweight classification layer that runs BEFORE the CEO gets a command. It analyzes the plain English input and produces structured intent.

**Why this first:** Everything downstream depends on knowing what the user wants. Without classification, the CEO agent does all the thinking, which is slow and expensive.

**Architecture:**
```
User Command → Command Classifier → Structured Intent → Route to action
```

**The classifier outputs:**
```typescript
interface CommandIntent {
  type: 'BUILD_TEAM' | 'EXECUTE_TASK' | 'CONFIGURE' | 'QUERY' | 'UNKNOWN';
  team_type?: string;        // marketing, sales, support, ops, dev, custom
  specific_task?: string;    // "run a facebook ad campaign"
  confidence: number;        // 0-100
  requires_new_agents: boolean;
  estimated_complexity: 'simple' | 'moderate' | 'complex';
}
```

**Implementation:** Single Claude Haiku call with structured output (cheap, fast, <500ms). NOT a separate agent — a utility function in the command API route.

**Key insight from research:** CrewAI's success comes from role-based abstraction that mirrors human teams. Devin's success comes from planning first, then executing. APEX should classify intent, plan the team, then execute — not dump everything on the CEO.

**Files to create/modify:**
- `apps/orchestrator/src/core/command-classifier.ts` (new)
- `apps/web/src/app/api/apex/command/route.ts` (modify to call classifier)

---

### Step 2: Team Templates Library

**What:** Pre-built team configurations for every common "act as my X" command, stored as importable JSON templates.

**Why:** The CEO agent shouldn't reinvent team structures from scratch. Research shows autonomous agents work best when given proven starting configurations and adapting from there — not building from zero.

**Templates to build:**

| Template | Agents | Key Skills |
|----------|--------|-----------|
| `marketing-team` | CMO, Content Writer, SEO Specialist, Ad Manager, Social Media Manager | ads-manager, document-generator, web-browser |
| `sales-team` | Sales Director, SDR, Account Executive, Sales Ops | crm-connector, email-reader, document-generator |
| `support-team` | Support Lead, Tier 1 Agent, Tier 2 Agent, Knowledge Base Manager | email-reader, web-browser, crm-connector |
| `operations-team` | Ops Director, Process Analyst, Compliance Officer | compliance-checker, document-generator |
| `dev-team` | Tech Lead, Backend Engineer, Frontend Engineer, QA Engineer | web-browser, firecrawl |
| `finance-team` | CFO, Bookkeeper, Accounts Receivable | document-generator, email-reader |
| `hr-team` | HR Director, Recruiter, Onboarding Specialist | email-reader, document-generator |
| `moving-company` | (existing) Full moving vertical | All moving-specific skills |
| `custom` | CEO only — builds from scratch | All available |

**Template structure:** Same as existing `ExportedTemplate` interface. Each template includes agents with roles, model tiers, personas, skills, and initial routines.

**Files to create:**
- `templates/marketing-team/template.json`
- `templates/sales-team/template.json`
- `templates/support-team/template.json`
- `templates/operations-team/template.json`
- `templates/dev-team/template.json`
- `templates/finance-team/template.json`
- `templates/hr-team/template.json`

---

### Step 3: Auto-Provisioning Engine

**What:** When the classifier detects `BUILD_TEAM` intent, automatically import the matching template — creating all agents, assigning skills, and setting up initial routines — without human approval.

**Why:** The inbox approval gate is the #1 friction point. Research on no-code platforms shows that the moment you ask a non-technical user to "approve" something they don't understand, you lose them. Softr and Lovable succeed because they just build it.

**Flow:**
```
Command "act as my marketing team"
  → Classifier: { type: BUILD_TEAM, team_type: 'marketing', confidence: 95 }
  → Auto-Provisioner:
      1. Load templates/marketing-team/template.json
      2. Check budget (can we afford these agents?)
      3. Import via TemplateExporter.importTemplate()
      4. Create initial "team setup" issue for new team lead
      5. Return confirmation to user: "Marketing team deployed. CMO is planning your first campaign."
```

**Safety guardrails (invisible to user):**
- Max 10 agents per auto-provision (anything bigger → inbox approval)
- Must have budget headroom for at least 1 hour of agent work
- Duplicate team detection (don't create 2 marketing teams)
- Confidence threshold: auto-provision only if classifier confidence > 80%

**Files to create/modify:**
- `apps/orchestrator/src/core/auto-provisioner.ts` (new)
- `apps/web/src/app/api/apex/command/route.ts` (modify to use provisioner)
- `apps/orchestrator/src/core/template-export.ts` (extend for template library loading)

---

### Step 4: Smart Onboarding

**What:** Replace the current "name + goal → CEO spawned" onboarding with an intelligent first-run experience that auto-deploys the right team based on the company goal.

**Why:** The current onboarding creates a CEO agent and stops. The user then has to know to go to the command bar and type something. For a 70-year-old, the flow should be: sign up → describe your business → APEX is running.

**New onboarding flow:**
```
1. User enters: Company Name + "What does your company do?" (not "goal" — too vague)
2. Classifier analyzes the business description
3. System selects 1-3 appropriate templates
4. Shows user: "I'll set up your [Marketing/Sales/Support] team. Sound good?"
   → Single green button: "Launch APEX"
   → Optional: "Customize first" (for power users)
5. Auto-provisions selected templates
6. CEO agent gets first issue: "Analyze [company name]'s business and create initial roadmap"
7. Redirect to dashboard — agents already working
```

**Key UX insight from research:** Softr's "describe in plain language what you need" approach converts at 3x the rate of configuration wizards. Bubble offers customization but it's optional. The default path should be zero-config.

**Files to modify:**
- `apps/web/src/app/(auth)/onboarding/page.tsx`
- `apps/web/src/app/api/auth/onboard/route.ts`

---

### Step 5: Real-Time Execution Feed

**What:** A live activity feed in the dashboard showing what every agent is doing right now — visible progress that builds trust.

**Why:** Research on AI agent platforms shows the #1 reason users abandon is "I don't know if it's working." Devin shows real-time shell output, browser screenshots, and plan progress. APEX needs the same visibility.

**Implementation:**
```
Activity Feed (center panel or overlay):
├── [10:32:01] CMO claimed issue: "Create Q2 marketing strategy"
├── [10:32:15] CMO → MEMORY_LOADED (loading company context)
├── [10:32:28] CMO → RESEARCH_COMPLETE (analyzed 3 competitor sites)
├── [10:33:01] CMO → EXECUTING (drafting strategy document)
├── [10:34:12] CMO created sub-issue: "Write blog post series" → Content Writer
├── [10:34:13] CMO created sub-issue: "Set up Google Ads campaign" → Ad Manager
├── [10:34:45] CMO → HANDOFF_COMPLETE (strategy complete, score: 88/100)
├── [10:34:46] Content Writer claimed: "Write blog post series"
└── ...
```

**Data source:** Already exists. `agent_heartbeats` table records every state transition. `issue_comments` records handoffs. `audit_log` records every action. We just need a frontend component that subscribes to these via Supabase Realtime.

**Files to create:**
- `apps/web/src/components/ActivityFeed.tsx` (new)
- `apps/web/src/app/api/apex/activity/route.ts` (new — aggregates heartbeats + audit_log)

---

### Step 6: Self-Healing Error Recovery

**What:** When agents fail, the system automatically diagnoses and recovers — without surfacing technical errors to the operator.

**Why:** Research identifies 6 primary AI agent failure modes. Non-technical users cannot handle any of them. The system must be self-healing or it breaks the "zero-human" promise.

**Recovery hierarchy:**
```
Agent fails
  → Level 1: Retry (same agent, same issue, fresh context)
  → Level 2: Reassign (different agent of same role, if available)
  → Level 3: Escalate to CEO (CEO creates recovery plan)
  → Level 4: Fallback model (switch from sonnet to haiku or vice versa)
  → Level 5: Human notification (inbox item with plain-English explanation)
```

**Circuit breakers (from research):**
- Max 3 retries per issue per agent
- Max $5 token spend per single issue (configurable)
- Repetition detector: if agent produces same output 2x, escalate
- Stall timeout: 60 minutes per heartbeat state (already exists)

**What the user sees:**
- Nothing, if Level 1-4 resolve it
- Plain English inbox item if Level 5: "Your marketing strategy hit a snag. The CEO is working on a fix. No action needed from you."

**Files to create/modify:**
- `apps/orchestrator/src/core/error-recovery.ts` (new)
- `apps/orchestrator/src/core/engine.ts` (modify tick to use recovery)

---

### Step 7: Budget Enforcement (The Invisible Guardrail)

**What:** Token gateway enforces hard budget limits before any agent claims an issue. Includes pre-execution cost estimation and automatic pause when approaching limits.

**Why:** Without budget enforcement, a recursive CEO agent creating sub-issues could burn through $100 of API calls in minutes. This is the safety net that makes godmode possible.

**Implementation:**
```
Before issue claim:
  1. Estimate tokens needed (based on issue complexity + model tier)
  2. Check remaining budget
  3. If < 10% remaining → pause all non-critical agents, notify operator
  4. If < 5% remaining → pause ALL agents, send urgent inbox item
  5. If 0% remaining → reject claim, queue for when budget refills
```

**Cost estimation heuristic:**
- Simple issues (single agent, no sub-issues): ~2K tokens
- Moderate issues (agent + research): ~8K tokens
- Complex issues (CEO + team creation): ~20K tokens
- Adjust based on historical actuals for this company

**Files to modify:**
- `apps/orchestrator/src/core/token-gateway.ts` (add enforcement + estimation)
- `apps/orchestrator/src/core/engine.ts` (check budget before claim)

---

### Step 8: End-to-End Testing & Hardening

**What:** Comprehensive test suite that simulates the entire user journey: signup → command → team deployment → execution → results.

**Why:** This is what makes it "bulletproof." Every path must work. Every edge case must be handled. A child or senior citizen will find every bug a developer won't.

**Test scenarios:**
```
1. Happy path: "act as my marketing team" → team deployed → agents working
2. Duplicate team: "act as my marketing team" (already exists) → handled gracefully
3. Budget exceeded: command when budget is at 95% → appropriate response
4. Unknown command: "asdfghjkl" → graceful "I didn't understand, try something like..."
5. Agent failure: simulated failure during execution → self-heals
6. Concurrent commands: 2 commands at once → both handled correctly
7. Empty company: command before any agents exist → CEO created first
8. Template not found: "act as my underwater basket weaving team" → custom team built
9. Network failure: Supabase connection drops → reconnects, resumes
10. Token exhaustion: mid-execution budget runs out → graceful pause
```

**Files to create:**
- `apps/orchestrator/src/__tests__/self-building.test.ts`
- `apps/web/src/__tests__/e2e/command-to-execution.test.ts`

---

## Execution Priority

| Priority | Step | Effort | Impact |
|----------|------|--------|--------|
| 1 | Command Classifier | 2 hours | Unlocks everything |
| 2 | Team Templates | 3 hours | Content creation, no new code patterns |
| 3 | Auto-Provisioner | 3 hours | The magic moment — teams deploy automatically |
| 4 | Smart Onboarding | 2 hours | First impression = everything |
| 5 | Activity Feed | 2 hours | Trust builder |
| 6 | Error Recovery | 3 hours | Bulletproof layer |
| 7 | Budget Enforcement | 2 hours | Safety net |
| 8 | E2E Testing | 4 hours | Confidence |

**Total estimated: ~21 hours of focused work.**

---

## What Makes This Different From Every Other AI Platform

Most multi-agent platforms (CrewAI, AutoGen, LangGraph) are **developer tools**. They require Python code, YAML configs, or notebook setups. Their user is an engineer.

APEX is a **product**. The user is a business owner who types English and gets a working team. The key differentiators:

1. **No code, no config, no YAML** — plain English only
2. **Pre-built team templates** — not "define your agents" but "I'll build the team for you"
3. **Autonomous hiring** — CEO agent grows the team as needed
4. **Self-healing** — errors never reach the user
5. **Real-time visibility** — watch your agents work, like a security camera for your business
6. **Budget-safe** — impossible to accidentally spend $1000 on API calls
7. **Self-evolving** — SEE engine continuously improves agent performance

The closest competitor is Relevance AI (agent marketplace), but they still require manual agent configuration. APEX is the first platform where the AI builds the AI team.

---

## Key Insights From Research

1. **CrewAI pattern:** Role-based abstraction mirrors human teams — APEX already does this with agent roles. The key lesson is that pre-defined roles + clear missions outperform free-form agent definitions.

2. **Devin pattern:** Plan first, execute second, show progress. APEX needs the activity feed to match this transparency.

3. **Softr pattern:** "Describe what you need in plain language" → system builds it. This is exactly what the command classifier + auto-provisioner achieves.

4. **Failure research:** 6 primary failure modes, all solvable with retry chains + circuit breakers. The 5-level recovery hierarchy covers them all.

5. **Enterprise adoption:** 40% of enterprise apps will embed AI agents by end of 2026. The market is ready. But governance (audit trail, budget limits, human gates for irreversible actions) is what separates toys from products.

6. **Intent classification:** LLM-based classification outperforms rule-based for natural language commands. A single Haiku call is cheap and fast enough to classify every command.

---

## Start Here

Step 1: Build `command-classifier.ts`. This is the brain that makes everything else possible.

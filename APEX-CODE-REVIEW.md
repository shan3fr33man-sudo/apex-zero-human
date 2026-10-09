# APEX Code Review — Full Codebase Audit

**Date:** April 1, 2026
**Scope:** All orchestrator, agent, frontend, database, deployment, and skills code
**Files Reviewed:** 130+

---

## Executive Summary

The APEX codebase is architecturally sound — the orchestrator heartbeat loop works, agents execute real Claude API calls, and the frontend renders a functional dashboard. However, this review uncovered **12 CRITICAL**, **17 HIGH**, and **20+ MEDIUM** severity issues across all layers. The biggest themes are:

1. **The completion race condition is real** — `engine.ts` never calls `completeIssue()`, so issues pile up as `in_progress`
2. **Role resolver is broken** — only 5 of 12 agents are mapped, and case values don't match role strings
3. **Frontend auth is bypassed** — `APEX_AUTH_BYPASS=true` disables all protection; API routes have zero ownership checks
4. **Skills sandbox is fake** — code scanning exists but no actual process isolation
5. **Heartbeat enum mismatch** — `RESEARCH_COMPLETE` exists in code but not in the DB constraint

---

## CRITICAL — Fix Before Running Again

### 1. engine.ts never calls completeIssue()
**File:** `apps/orchestrator/src/core/engine.ts`
After agent execution succeeds, the engine emits `issue.completed` but never transitions the issue status from `in_progress` to `done`. This is the root cause of the race condition discovered during testing where the third test issue stayed stuck.
**Fix:** Call `taskRouter.completeIssue(issueId)` after successful agent execution.

### 2. Role resolver only maps 5 of 12 agents
**File:** `apps/orchestrator/src/agents/role-resolver.ts`
Only CEO, Engineer, QA, EvalEngineer, and Marketing are imported. The remaining 7 (UX, Dispatch, Compliance, FleetCoordinator, LeadRecovery, Quote, ReviewRequest) all fall back to EngineerAgent. Worse, the case values don't match role strings — `'founding_engineer'` vs actual `'engineer'`, `'qa_engineer'` vs `'qa'`, `'marketer'` vs `'marketing'`.
**Fix:** Import all 12 agent classes. Align case values with actual role properties.

### 3. Auth bypass active in production
**File:** `apps/web/src/lib/supabase/middleware.ts`
`APEX_AUTH_BYPASS=true` completely disables Supabase session validation. Any unauthenticated user can access the entire dashboard.
**Fix:** Remove the bypass flag entirely. Fix the underlying auth callback 502 instead.

### 4. API routes have no ownership checks
**Files:** All `apps/web/src/app/api/apex/*/route.ts`
Every API route uses `getSupabaseServiceRole()` (bypassing RLS) but never validates that the requesting user owns the target `company_id`. Any authenticated user can read/write data for any company.
**Fix:** Extract user from JWT, verify org membership, then filter by company.

### 5. Agent PATCH accepts arbitrary fields
**File:** `apps/web/src/app/api/apex/agents/[id]/route.ts`
`const body = await req.json(); supabase.update(body)` — no schema validation. Attacker can set any field on any agent.
**Fix:** Validate body with zod schema; whitelist allowed fields.

### 6. Heartbeat state enum missing RESEARCH_COMPLETE
**File:** `packages/db/migrations/011_vertical_templates.sql`
The CHECK constraint on `agent_heartbeats.state` doesn't include `RESEARCH_COMPLETE`, but `packages/shared/constants.ts` and the running orchestrator both use it.
**Fix:** ALTER TABLE to add the state (already done manually once — needs a proper migration).

### 7. Skills sandbox has no actual isolation
**File:** `skills/sandbox.ts`
DANGEROUS_PATTERNS regex scanning exists but skills execute in the same Node.js process. A skill can access `process.env`, the filesystem, and network without restriction despite the "sandbox."
**Fix:** Execute skills in worker_threads or child_process with restricted capabilities.

### 8. Stall detector races with agent execution
**Files:** `engine.ts`, `stall-detector.ts`
`executeAgent()` is fire-and-forget (`.catch()` attached but not awaited). If an LLM call takes >5 minutes, the stall detector can force-release the issue while the agent is still working.
**Fix:** Track heartbeat progress timestamps; stall detector should check last heartbeat advance, not `issue.updated_at`.

### 9. Audit log not written before external mutations
**File:** `apps/orchestrator/src/agents/base-agent.ts`
INSTRUCTIONS.md Prime Directive #5: "Never let an agent mutate external state without writing to audit_log first." Current code writes issue comments and releases issues *before* audit logging.
**Fix:** Reorder to audit_log → mutation → confirm.

### 10. No orchestrator health endpoint
**Files:** `ecosystem.config.js`, `nginx.conf`
Nginx has `/api/health` but it only hits Next.js. The orchestrator has no health check. A dead orchestrator won't process issues and nobody will know.
**Fix:** Add `/health` endpoint to orchestrator; configure PM2 `wait_ready`.

### 11. organizations table missing BYOK columns
**File:** `packages/db/migrations/013_byok.sql`
Migration adds BYOK columns to `tenants`, but `store-byok-key.mjs` updates `organizations.api_key_encrypted`. Schema and code are out of sync.
**Fix:** Decide if BYOK is tenant-level or org-level; align migration with usage.

### 12. Advisory lock in claim_issue() not verified
**File:** `packages/db/migrations/004_issues.sql`
Prime Directive #6 requires advisory locks. The RPC uses `pg_try_advisory_xact_lock()` but has a race window between lock acquisition and status check.
**Fix:** Move status check inside the lock-protected section; use serializable isolation.

---

## HIGH — Fix Before Day 1

### Orchestrator
- **Event bus reconnection has no backoff/jitter or max retries** — infinite retry loop at exactly 10s intervals. Add exponential backoff with jitter and max 10 attempts.
- **AutoScaler `activateIdleAgent()` is a no-op** — queries for idle agent but never updates status. Either implement or document that engine handles this.
- **No graceful shutdown cleanup** — `engine.stop()` doesn't close Supabase or clean up pooled connections.
- **Token budget bypass risk** — agents could import Anthropic directly and skip `modelRouter.call()`. Add lint rule preventing direct Anthropic imports.

### Agents
- **Handoff JSON parsing uses naive regex** — `content.match(/\{[\s\S]*?"target_agent_id"[\s\S]*?\}/)` breaks on nested objects and escaped quotes. Use proper JSON extraction.
- **CEO CREATE_ISSUE instruction in prompt has no parser** — system prompt tells CEO to create sub-issues but no code handles it. Either implement or remove from prompt.
- **Firecrawl API key is global, not per-company** — multi-tenant violation. All companies share one Firecrawl key with no per-company rate limiting.
- **Temperature and maxTokens hardcoded per agent class** — not configurable per company without code deploy.

### Frontend
- **`x-auth-id` header is client-provided and trusted** — API routes should extract user ID from JWT, never from headers.
- **Onboarding accepts `authId` from request body** — allows impersonation. Extract from session.
- **Companies endpoint returns ALL companies** — no org filtering. Any user sees every company.
- **No pagination on issue/agent/audit lists** — will break at scale.

### Database
- **audit_log company_id is nullable** — can't guarantee tenant isolation on audit records. Make NOT NULL.
- **Missing compound indexes** — `issues(company_id, status, priority)`, `agent_heartbeats(agent_id, issue_id, state)`, `agent_memories(agent_id, expires_at)`.
- **Missing SEE_INTERNAL dedicated key** — uses same service role key as orchestrator, violating separation.
- **ENCRYPTION_SECRET not in any env schema** — operators won't know to set it; BYOK will fail silently.

### Deployment
- **PM2 missing `min_uptime`** — crash loop can restart 10 times in milliseconds.
- **Log rotation not confirmed installed** — `pm2-logrotate` referenced but not verified. Logs could fill disk.
- **Nginx missing CSP and Permissions-Policy headers** — allows inline script execution.

### Skills
- **Domain whitelist bypass via redirects** — `createSafeFetch()` validates domain at request time but doesn't block redirect chains.
- **Skill config values not type-validated** — only presence checked, not type safety.

---

## MEDIUM — Fix During First Week

### Orchestrator
- Token estimate uses hardcoded +200 buffer (overestimates small prompts by 7x) — use percentage-based buffer
- Task router dependency check is O(N^2) — 20 candidates x 2 queries each per tick. Use SQL view
- BYOK client cache never evicts expired entries — memory leak over months
- Stall detector only checks `in_progress` issues, not `blocked` — blind spot
- No per-state heartbeat timeouts — only 5-minute stall detector as safeguard
- AutoScaler uses polling interval instead of LISTEN/NOTIFY (violates Prime Directive #9)

### Agents
- Memory context loaded without size check — could exceed context window
- Research results not deduplicated before prompt injection
- QA agent references `web-browser` skill without checking if installed
- LeadRecoveryAgent doesn't validate phone numbers before Firecrawl search
- Compliance and UX agents don't override `needsResearch()`
- DispatchAgent uses TECHNICAL tier but does routine work — cost waste

### Frontend
- Orphaned org linking in auth callback has race condition for simultaneous signups
- No rate limiting on auth endpoints (signup, onboard)
- Input sanitization missing — agent personas accept raw user text (prompt injection vector)
- No CSRF token validation on mutating operations
- Realtime subscription hook has no error state — silent failures
- Billing page shows hardcoded "free" plan regardless of actual subscription

### Database
- Routine type mismatches — TypeScript expects `timezone`, `skipped`, `timeout`, `execution_time_ms` but DB doesn't have them
- `packages/db/types.ts` missing BYOK fields from migration 013
- Missing RLS INSERT policy for organizations table (bootstrapping problem)
- FIRECRAWL_API_KEY required by orchestrator but optional for web — inconsistent

### Skills
- No audit trail for skill execution in audit_log table
- Network timeout equals overall timeout (30s each) — leaves no time for processing

---

## Recommended Fix Order

**Week 1 (before any more production runs):**
1. Add `completeIssue()` call in engine.ts (fixes the race condition)
2. Fix role-resolver.ts imports and case values
3. Remove AUTH_BYPASS; fix auth callback 502
4. Add ownership checks to all API routes
5. Add RESEARCH_COMPLETE to heartbeat state constraint (proper migration)
6. Add orchestrator health endpoint

**Week 2:**
7. Reorder audit logging before mutations in base-agent.ts
8. Add backoff/jitter to event bus reconnection
9. Implement proper handoff JSON parsing
10. Add pagination to all list endpoints
11. Add compound indexes to hot query paths
12. Fix BYOK column location (org vs tenant)

**Week 3:**
13. Implement real skills sandboxing (worker_threads)
14. Add JWT-based auth to all API routes (replace x-auth-id)
15. CEO CREATE_ISSUE parser implementation
16. Per-company Firecrawl key configuration
17. PM2 health checks and min_uptime
18. Nginx security headers

---

*Review performed by APEX Build Intelligence — April 1, 2026*

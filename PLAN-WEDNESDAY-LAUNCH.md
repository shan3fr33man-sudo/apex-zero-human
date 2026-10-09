# APEX Wednesday Launch Plan — April 6-8, 2026

## Current Reality Check

**What's BUILT (local, not deployed):**
- Godmode system: Command Classifier → Auto-Provisioner → Team Templates (9 templates)
- Activity Feed (live agent visibility)
- Self-Healing Error Recovery (5-level hierarchy)
- Budget Enforcement (graduated thresholds)
- Smart Onboarding (auto-deploy teams from signup)
- CommandBar UI + API
- 12 agent implementations + role resolver
- Full orchestrator engine (7 modules + AMS)
- 11 built-in skills + sandbox
- SEE (Self-Evolution Engine)
- All 9 dashboard pages with real data
- Auth flow (Google OAuth + email)
- BYOK + Model Router

**What's on PROD VPS (deployed):**
- Previous version of dashboard pages (before useRealtimeTable fixes)
- Orchestrator running (agents executing, 401 audit entries, 15 heartbeats)
- 6 agents, 18 issues, 3 companies active
- Auth callback has a known 502 bypass

**The GAP: ~120 files changed/added locally that aren't deployed.**

---

## The 3-Day Sprint

### MONDAY April 7 — Deploy Everything + Fix Auth

**Block 1: Mass Deploy to VPS (3 hours)**
The biggest risk is the deployment gap. 120+ files locally that aren't on the VPS.

1. Create a deployment tarball of ALL changed files
2. Upload to VPS via hPanel web terminal
3. Extract and overwrite in /root/apex-zero-human/
4. Run `pm2 restart all` (apex-web, apex-orchestrator, apex-see)
5. Verify each dashboard page loads with real data

**Block 2: Fix Auth Callback (2 hours)**
The 502 on auth callback is the #1 blocker for new signups. Without working auth, nobody can use APEX.

1. Debug the actual 502 cause (likely Supabase callback URL mismatch or cookie issue)
2. Test full signup → onboard → dashboard flow
3. Verify Google OAuth + email/password both work
4. Test the new smart onboarding (company creation + optional team provisioning)

**Block 3: Test Command Bar Live (1 hour)**
1. Type "act as my marketing team" on production
2. Verify: classifier → auto-provisioner → 5 agents created → kickoff issue
3. Verify Activity Feed shows the provisioning
4. Verify CommandBar shows success message
5. Test CEO fallback path: type a non-team command, verify it creates a CEO issue

**Monday Exit Criteria:**
- All files deployed to VPS
- Auth works end-to-end (new user can sign up)
- Command Bar works (team provisioning + CEO routing)
- Activity Feed shows live data

---

### TUESDAY April 8 — Harden + Test Every Path

**Block 1: Error Recovery Testing (2 hours)**
1. Simulate agent failure (create issue with impossible task)
2. Verify L1 retry fires (check audit_log for recovery entries)
3. Verify L3 CEO escalation creates recovery issue
4. Verify L5 human notification creates inbox item
5. Verify budget threshold alerts at 90% and 95% utilization

**Block 2: Onboarding Polish (2 hours)**
1. Update the onboarding page UI to include team selection
2. Add team type buttons: "Marketing", "Sales", "Support", "Operations", "Dev", "Full Company", "Custom"
3. Wire buttons to pass `teamType` to the onboard API
4. Test: new user → select "Marketing" → lands on dashboard with 6 agents (CEO + 5 marketing)

**Block 3: Edge Case Hardening (2 hours)**
1. Duplicate team detection: try "act as my marketing team" twice → graceful message
2. Empty company: command before onboarding → clear error
3. Budget exhaustion: set budget to 0, try command → proper notification
4. Bad input: gibberish command → friendly suggestion
5. Concurrent commands: 2 commands rapid-fire → both handled
6. Mobile responsiveness: verify dashboard on phone-sized viewport

**Tuesday Exit Criteria:**
- Error recovery proven working
- Onboarding has team selection UI
- All edge cases handled gracefully
- No crashes or 500 errors on any user path

---

### WEDNESDAY April 9 — Final Sweep + Soft Launch

**Block 1: Stripe Setup (2 hours)**
The last remaining piece from INSTRUCTIONS.md Phase 9.

1. Create Stripe account + products (Free tier, Pro tier, Enterprise)
2. Set up checkout session API (already have routes scaffolded)
3. Wire webhook for subscription events
4. Connect token budget to Stripe plan tier
5. Test: checkout → subscription active → budget unlocked

**Block 2: Landing Page + Marketing Copy (1 hour)**
1. Polish the landing page (apps/web/src/app/page.tsx)
2. Clear value prop: "Type English. Get an AI team. Zero setup."
3. CTA: "Start Free" → signup → onboard → dashboard
4. Add pricing section linking to Stripe checkout

**Block 3: Final Smoke Test (1 hour)**
The full journey, start to finish:
1. Hit landing page as a stranger
2. Click "Start Free"
3. Sign up with email
4. Onboarding: enter company name + select "Marketing Team"
5. Land on dashboard with CEO + 5 marketing agents
6. Activity Feed shows agents initializing
7. Type "write a blog post about our launch" in Command Bar
8. Watch CEO create sub-issue → Content Writer picks it up
9. Check inbox for any alerts
10. Check spend page for token usage

**Block 4: Deploy Final + Monitor (1 hour)**
1. Deploy all changes to VPS
2. Run PM2 restart
3. Monitor logs for 30 minutes
4. Fix any last issues
5. Share URL

**Wednesday Exit Criteria:**
- Stripe payments working
- Full user journey works end-to-end
- APEX is live and accepting signups

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Auth 502 can't be fixed | Medium | Critical | Fallback: bypass auth for demo, fix post-launch |
| VPS deployment breaks something | Medium | High | Keep tarball backup, can rollback in 2 min |
| Stripe setup takes too long | Low | Medium | Launch without payments, add billing week 2 |
| Agent execution stalls on prod | Medium | Medium | Error recovery is built — will self-heal |
| Templates have bad data | Low | Medium | Test each template type on Tuesday |

---

## What We're NOT Doing Before Wednesday

These are real but can wait for Week 2:
- E2E Playwright test suite (manual testing covers it)
- Moving company vertical wiring (SmartMoving, RingCentral)
- SEE agent fine-tuning
- Custom domain SSL
- Performance optimization
- Multi-tenant data isolation audit
- Comprehensive error monitoring (Sentry etc.)

---

## Priority Stack (If Time Gets Tight)

If we run out of time, cut from the bottom:
1. **MUST: Deploy + Fix Auth** (without this, nothing works)
2. **MUST: Command Bar working live** (this IS the product)
3. **MUST: Onboarding team selection** (first impression)
4. **SHOULD: Error recovery tested** (safety net)
5. **SHOULD: Edge cases hardened** (polish)
6. **NICE: Stripe** (can launch free-only first)
7. **NICE: Landing page polish** (can iterate after launch)

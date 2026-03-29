---
name: apex-orchestrator
description: >
  Use this skill for ALL orchestrator engine work — the Node.js autonomous engine that
  coordinates agents, manages heartbeats, routes tasks, handles events, tracks tokens,
  and autoscales. Triggers: any mention of "orchestrator", "engine", "heartbeat",
  "task router", "event bus", "token gateway", "autoscaler", "stall detector",
  "model router", "PM2 process", or any work inside apps/orchestrator/. Read this skill
  before writing any orchestrator code. The orchestrator is a SEPARATE PM2 process from
  the Next.js frontend — never mix them.
---

# APEX Orchestrator Skill

## Architecture Overview

The orchestrator is a standalone Node.js 20 LTS + TypeScript service.
It runs as `apex-orchestrator` in PM2, completely separate from the Next.js app.
It connects to Supabase using the SERVICE ROLE key (full database access).
It never serves HTTP to operators — it's a background engine only.

```
apps/orchestrator/src/
├── index.ts              ← PM2 entry point
├── core/
│   ├── engine.ts         ← Main loop — wires all modules
│   ├── heartbeat.ts      ← Agent heartbeat state machine
│   ├── task-router.ts    ← Issue assignment + advisory locks
│   ├── event-bus.ts      ← Postgres LISTEN/NOTIFY
│   ├── token-gateway.ts  ← Budget check before every LLM call
│   └── autoscaler.ts     ← Dynamic concurrency management
├── agents/               ← Agent implementations
├── memory/               ← APEX Memory System
├── models/               ← Smart model routing + fallback
├── skills/               ← Skill sandbox + registry
├── routines/             ← Scheduler + reactor
├── escalation/           ← Stall detector + notifier
└── see/                  ← Self-Evolution Engine (separate process)
```

---

## Module 1: Token Gateway

**Build this FIRST. Every other module depends on it.**

```typescript
// core/token-gateway.ts
import { createClient } from '@supabase/supabase-js';
import { Database } from '../../../packages/db/types';

interface TokenCheckResult {
  allowed: boolean;
  remaining: number;
  reason?: string;
}

export class TokenGateway {
  private supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Call this BEFORE every LLM API call
  async checkBudget(companyId: string, estimatedTokens: number): Promise<TokenCheckResult> {
    const { data, error } = await this.supabase
      .rpc('check_and_deduct_tokens', {
        p_company_id: companyId,
        p_tokens_needed: estimatedTokens
      });

    if (error) throw new Error(`Token gateway error: ${error.message}`);

    if (!data) {
      // Budget exceeded — pause the issue
      await this.handleBudgetExceeded(companyId, estimatedTokens);
      return { allowed: false, remaining: 0, reason: 'BUDGET_EXCEEDED' };
    }

    const { data: company } = await this.supabase
      .from('companies')
      .select('token_budget, tokens_used')
      .eq('id', companyId)
      .single();

    return {
      allowed: true,
      remaining: (company?.token_budget ?? 0) - (company?.tokens_used ?? 0)
    };
  }

  async deductTokens(companyId: string, agentId: string, issueId: string | null, usage: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd?: number;
  }): Promise<void> {
    await this.supabase.from('token_spend_log').insert({
      company_id: companyId,
      agent_id: agentId,
      issue_id: issueId,
      model: usage.model,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      cost_usd: usage.costUsd
    });
  }

  private async handleBudgetExceeded(companyId: string, requested: number): Promise<void> {
    // Create inbox alert for operator
    await this.supabase.from('inbox_items').insert({
      company_id: companyId,
      item_type: 'BUDGET_ALERT',
      title: 'Token budget exceeded',
      description: `An agent requested ${requested} tokens but the monthly budget is exhausted.`,
      payload: { requested_tokens: requested, timestamp: new Date().toISOString() }
    });
  }
}
```

---

## Module 2: Heartbeat State Machine

States (must execute in order, cannot skip):
`IDENTITY_CONFIRMED → MEMORY_LOADED → PLAN_READ → ASSIGNMENT_CLAIMED → EXECUTING → HANDOFF_COMPLETE`

```typescript
// core/heartbeat.ts
export type HeartbeatState =
  | 'IDENTITY_CONFIRMED'
  | 'MEMORY_LOADED'
  | 'PLAN_READ'
  | 'ASSIGNMENT_CLAIMED'
  | 'EXECUTING'
  | 'HANDOFF_COMPLETE'
  | 'FAILED';

const STATE_ORDER: HeartbeatState[] = [
  'IDENTITY_CONFIRMED',
  'MEMORY_LOADED',
  'PLAN_READ',
  'ASSIGNMENT_CLAIMED',
  'EXECUTING',
  'HANDOFF_COMPLETE'
];

export class HeartbeatStateMachine {
  async advance(agentId: string, issueId: string, toState: HeartbeatState): Promise<void> {
    const current = await this.getCurrentState(agentId, issueId);

    // Enforce state order — cannot skip states
    const currentIdx = current ? STATE_ORDER.indexOf(current) : -1;
    const nextIdx = STATE_ORDER.indexOf(toState);

    if (nextIdx !== currentIdx + 1) {
      throw new Error(
        `Invalid state transition: ${current} → ${toState}. ` +
        `Expected: ${STATE_ORDER[currentIdx + 1]}`
      );
    }

    await this.supabase.from('agent_heartbeats').insert({
      agent_id: agentId,
      issue_id: issueId,
      state: toState,
      started_at: new Date().toISOString()
    });
  }

  async fail(agentId: string, issueId: string, reason: string): Promise<void> {
    await this.supabase.from('agent_heartbeats').insert({
      agent_id: agentId,
      issue_id: issueId,
      state: 'FAILED',
      error_message: reason,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString()
    });
  }

  private async getCurrentState(agentId: string, issueId: string): Promise<HeartbeatState | null> {
    const { data } = await this.supabase
      .from('agent_heartbeats')
      .select('state')
      .eq('agent_id', agentId)
      .eq('issue_id', issueId)
      .order('started_at', { ascending: false })
      .limit(1)
      .single();
    return data?.state as HeartbeatState ?? null;
  }
}
```

---

## Module 3: Task Router

```typescript
// core/task-router.ts
export class TaskRouter {
  // Claim an issue using Postgres advisory lock
  async claimIssue(agentId: string, issueId: string): Promise<boolean> {
    const { data } = await this.supabase.rpc('claim_issue', {
      p_issue_id: issueId,
      p_agent_id: agentId
    });
    return data === true;
  }

  // Find the next available issue for an agent role
  async findNextIssue(agentRole: string, companyId: string): Promise<string | null> {
    const { data } = await this.supabase
      .from('issues')
      .select('id, priority')
      .eq('company_id', companyId)
      .eq('status', 'open')
      .is('locked_by', null)
      .not('id', 'in', `(
        SELECT issue_id FROM issue_dependencies d
        JOIN issues i ON i.id = d.blocked_by_id
        WHERE i.status != 'completed'
      )`)
      .order('priority', { ascending: false })
      .limit(1)
      .single();

    return data?.id ?? null;
  }

  // Release a stuck lock (called by stall detector)
  async forceRelease(issueId: string, reason: string): Promise<void> {
    await this.supabase
      .from('issues')
      .update({ status: 'open', locked_by: null, locked_at: null })
      .eq('id', issueId);

    await this.auditLog('FORCE_RELEASE', 'issues', issueId, { reason });
  }
}
```

---

## Module 4: Event Bus

```typescript
// core/event-bus.ts
import { createClient } from '@supabase/supabase-js';

export class EventBus {
  private pgClient: any; // raw pg client for LISTEN/NOTIFY

  async start(): Promise<void> {
    // Use raw pg for LISTEN — Supabase client doesn't support it
    const { Client } = await import('pg');
    this.pgClient = new Client({ connectionString: process.env.DATABASE_URL });
    await this.pgClient.connect();

    await this.pgClient.query('LISTEN apex_events');

    this.pgClient.on('notification', async (msg: any) => {
      const event = JSON.parse(msg.payload);
      await this.routeEvent(event);
    });
  }

  private async routeEvent(event: { company_id: string; event_type: string; payload: any }): Promise<void> {
    // Find reactive routines matching this event type
    const { data: routines } = await this.supabase
      .from('routines')
      .select('*')
      .eq('company_id', event.company_id)
      .eq('routine_type', 'REACTIVE')
      .eq('enabled', true);

    for (const routine of routines ?? []) {
      if (this.matchesPattern(event.event_type, routine.event_pattern)) {
        await this.spawnIssueFromRoutine(routine, event.payload);
      }
    }

    // Mark event as processed
    await this.supabase
      .from('events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('id', event.id);
  }

  private matchesPattern(eventType: string, pattern: string): boolean {
    // Simple wildcard matching: 'missed_call' matches 'missed_*'
    const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
    return regex.test(eventType);
  }
}
```

---

## Module 5: Smart Model Router

```typescript
// models/router.ts
export type ModelTier = 'STRATEGIC' | 'TECHNICAL' | 'ROUTINE';

const MODEL_ROUTING: Record<ModelTier, { primary: string; fallback: string; cost_per_1k: number }> = {
  STRATEGIC: {
    primary: 'claude-sonnet-4-6',      // CEO, Eval Engineer
    fallback: 'claude-sonnet-4-5',
    cost_per_1k: 0.003
  },
  TECHNICAL: {
    primary: 'claude-sonnet-4-5',      // Engineer, QA, UX, Dispatch
    fallback: 'claude-haiku-4-5',
    cost_per_1k: 0.003
  },
  ROUTINE: {
    primary: 'claude-haiku-4-5',       // Content, Fleet, Review Requester
    fallback: 'claude-haiku-4-5',
    cost_per_1k: 0.00025
  }
};

export class ModelRouter {
  getModel(tier: ModelTier, override?: string): string {
    return override ?? MODEL_ROUTING[tier].primary;
  }

  async callWithFallback(tier: ModelTier, params: any): Promise<any> {
    const { primary, fallback } = MODEL_ROUTING[tier];

    for (const model of [primary, fallback]) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          return await this.callClaude({ ...params, model });
        } catch (err: any) {
          if (err.status === 400 || err.status === 401) throw err; // Don't retry client errors
          if (attempt < 3) await this.sleep(500 * Math.pow(2, attempt - 1));
        }
      }
    }

    throw new Error(`All models failed for tier ${tier}`);
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 3.5); // Conservative estimate
  }

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

## Module 6: AutoScaler

```typescript
// core/autoscaler.ts
// Checks queue depth every 30 seconds. Scales agent concurrency up/down automatically.

export class AutoScaler {
  private activeWorkers: Map<string, number> = new Map(); // role → count

  async tick(companyId: string): Promise<void> {
    const { data: roles } = await this.supabase
      .from('agents')
      .select('role')
      .eq('company_id', companyId)
      .eq('status', 'idle');

    for (const { role } of roles ?? []) {
      const queueDepth = await this.getQueueDepth(role, companyId);
      const currentWorkers = this.activeWorkers.get(role) ?? 0;
      const maxConcurrency = await this.getMaxConcurrency(role, companyId);

      if (queueDepth > currentWorkers * 0.8 && currentWorkers < maxConcurrency) {
        await this.scaleUp(role, companyId);
      } else if (queueDepth < currentWorkers * 0.2 && currentWorkers > 1) {
        await this.scaleDown(role, companyId);
      }
    }
  }
}
```

---

## Module 7: Stall Detector

```typescript
// escalation/stall-detector.ts
// Runs every 5 minutes. Catches agents that have stopped progressing.

export class StallDetector {
  async check(): Promise<void> {
    const { data: stalledIssues } = await this.supabase
      .from('issues')
      .select('id, company_id, assigned_to, stall_threshold_minutes, title')
      .eq('status', 'in_progress')
      .lt('updated_at', new Date(Date.now() - 5 * 60 * 1000).toISOString());

    for (const issue of stalledIssues ?? []) {
      const stallMinutes = issue.stall_threshold_minutes ?? 60;
      const stalledFor = (Date.now() - new Date(issue.updated_at).getTime()) / 60000;

      if (stalledFor > stallMinutes) {
        await this.escalate(issue);
      }
      if (stalledFor > stallMinutes * 2) {
        await this.forceRelease(issue); // Double threshold = force release
      }
    }
  }

  private async escalate(issue: any): Promise<void> {
    await this.supabase.from('inbox_items').insert({
      company_id: issue.company_id,
      item_type: 'STALL_ALERT',
      title: `Agent stalled on: ${issue.title}`,
      description: `Issue has not progressed past its stall threshold.`,
      payload: { issue_id: issue.id, agent_id: issue.assigned_to }
    });

    await this.supabase
      .from('issues')
      .update({ status: 'human_review_required' })
      .eq('id', issue.id);
  }
}
```

---

## PM2 Config for Orchestrator

```javascript
// ecosystem.config.js
{
  name: 'apex-orchestrator',
  cwd: './apps/orchestrator',
  script: 'dist/index.js',
  instances: 1,
  exec_mode: 'fork',
  watch: false,
  max_memory_restart: '2G',
  restart_delay: 5000,
  env: {
    NODE_ENV: 'production',
    ORCHESTRATOR_TICK_MS: '5000',    // Main loop interval
    AUTOSCALER_TICK_MS: '30000',     // AutoScaler check interval
    STALL_CHECK_MS: '300000',        // Stall detector interval (5 min)
  }
}
```

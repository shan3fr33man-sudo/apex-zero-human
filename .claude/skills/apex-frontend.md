---
name: apex-frontend
description: >
  Use this skill for ALL frontend work in APEX — the Next.js 14 dashboard, design system,
  reusable components, API routes, auth flow, and all 9 dashboard pages. Triggers: any
  mention of "dashboard", "frontend", "UI", "component", "page", "Next.js", "Tailwind",
  "shadcn", "auth", "login", "signup", "kanban", "issue board", "agent card", "spend meter",
  "inbox", "command center", or any work inside apps/web/. Always use the APEX dark
  industrial design system defined below. Never use purple gradients or Inter font.
---

# APEX Frontend Skill

## Design System — APEX Dark Industrial Command Center

```
Theme: Dark industrial. Think Bloomberg Terminal meets Mission Control.
Not "cool startup". Operator-grade. Every pixel earns its place.

COLORS (CSS variables):
  --apex-bg:          #0A0A0A   (near black background)
  --apex-surface:     #111111   (card/panel backgrounds)
  --apex-border:      #1F1F1F   (subtle borders)
  --apex-text:        #F5F5F5   (primary text)
  --apex-muted:       #6B6B6B   (secondary text, labels)
  --apex-accent:      #00FF88   (APEX green — active states, CTAs, indicators)
  --apex-warning:     #FFB800   (budget alerts, stall warnings)
  --apex-danger:      #FF4444   (errors, failures, terminated agents)
  --apex-info:        #3B82F6   (informational, in-review states)

TYPOGRAPHY:
  Display/Numbers:  'Space Mono' (monospace — data tables, token counts, costs)
  Body/UI:          'DM Sans' (clean, readable — labels, descriptions, prose)
  Code:             'JetBrains Mono' (issue comments, artifacts, system prompts)

SPACING: 4px base grid. Use multiples: 4, 8, 12, 16, 24, 32, 48, 64
RADIUS:  4px for data elements, 8px for cards, 0px for tables
MOTION:  Minimal. Only purposeful: status changes, real-time updates, alerts.
```

---

## Layout Structure

```tsx
// app/(dashboard)/layout.tsx
// THREE PANEL LAYOUT — never change this structure

<div className="flex h-screen bg-[--apex-bg] overflow-hidden">
  {/* LEFT: Company sidebar (240px fixed) */}
  <CompanySidebar />

  {/* CENTER: Main content (flex-1, scrollable) */}
  <main className="flex-1 overflow-auto">
    {children}
  </main>

  {/* RIGHT: Inbox + APEX Advisor (320px fixed, collapsible) */}
  <RightPanel />
</div>
```

---

## Core Components

### AgentStatusCard
```tsx
// components/agent-card/AgentStatusCard.tsx
// Shows agent role, current status, quality score, tokens used, current issue

type AgentStatus = 'idle' | 'working' | 'paused' | 'stalled' | 'terminated';

const STATUS_COLORS: Record<AgentStatus, string> = {
  idle:       'text-[--apex-muted] border-[--apex-border]',
  working:    'text-[--apex-accent] border-[--apex-accent] shadow-[0_0_12px_rgba(0,255,136,0.2)]',
  paused:     'text-[--apex-warning] border-[--apex-warning]',
  stalled:    'text-[--apex-danger] border-[--apex-danger] animate-pulse',
  terminated: 'text-[--apex-muted] border-[--apex-border] opacity-50',
};

export function AgentStatusCard({ agent }: { agent: Agent }) {
  return (
    <div className={`border rounded p-4 bg-[--apex-surface] font-['DM_Sans'] ${STATUS_COLORS[agent.status]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-widest text-[--apex-muted]">{agent.role}</span>
        <StatusDot status={agent.status} />
      </div>
      <div className="text-base font-medium text-[--apex-text] mb-3">{agent.name}</div>
      <div className="grid grid-cols-3 gap-2 text-xs font-['Space_Mono']">
        <div>
          <div className="text-[--apex-muted] mb-1">QUALITY</div>
          <div className={agent.avg_quality_score < 70 ? 'text-[--apex-danger]' : 'text-[--apex-accent]'}>
            {agent.avg_quality_score?.toFixed(0) ?? '--'}/100
          </div>
        </div>
        <div>
          <div className="text-[--apex-muted] mb-1">TOKENS</div>
          <div className="text-[--apex-text]">{formatTokens(agent.total_tokens_used)}</div>
        </div>
        <div>
          <div className="text-[--apex-muted] mb-1">TASKS</div>
          <div className="text-[--apex-text]">{agent.total_tasks_done}</div>
        </div>
      </div>
      {agent.current_issue && (
        <div className="mt-3 pt-3 border-t border-[--apex-border] text-xs text-[--apex-muted] truncate">
          ▶ {agent.current_issue_title}
        </div>
      )}
    </div>
  );
}
```

### TokenBudgetGauge
```tsx
// components/spend-meter/TokenBudgetGauge.tsx
// Animated ring chart showing budget consumption. Turns orange at 80%, red at 95%.

export function TokenBudgetGauge({ used, total }: { used: number; total: number }) {
  const pct = Math.min(100, (used / total) * 100);
  const color = pct > 95 ? '#FF4444' : pct > 80 ? '#FFB800' : '#00FF88';
  const circumference = 2 * Math.PI * 40;
  const dashOffset = circumference * (1 - pct / 100);

  return (
    <div className="relative w-24 h-24">
      <svg viewBox="0 0 100 100" className="rotate-[-90deg]">
        <circle cx="50" cy="50" r="40" fill="none" stroke="#1F1F1F" strokeWidth="8" />
        <circle
          cx="50" cy="50" r="40"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center rotate-0">
        <span className="text-lg font-['Space_Mono'] font-bold" style={{ color }}>
          {pct.toFixed(0)}%
        </span>
        <span className="text-[10px] text-[--apex-muted] font-['DM_Sans']">BUDGET</span>
      </div>
    </div>
  );
}
```

### Real-Time Issue Board
```tsx
// components/issue-board/IssueBoard.tsx
// Supabase Realtime kanban — updates live as agents work

'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const COLUMNS = ['open', 'in_progress', 'in_review', 'completed'] as const;

export function IssueBoard({ companyId }: { companyId: string }) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const supabase = createClient();

  useEffect(() => {
    // Initial load
    supabase.from('issues').select('*').eq('company_id', companyId)
      .then(({ data }) => setIssues(data ?? []));

    // Real-time subscription
    const channel = supabase
      .channel(`issues:${companyId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'issues',
        filter: `company_id=eq.${companyId}`
      }, (payload) => {
        setIssues(prev => {
          if (payload.eventType === 'INSERT') return [...prev, payload.new as Issue];
          if (payload.eventType === 'UPDATE') return prev.map(i => i.id === payload.new.id ? payload.new as Issue : i);
          if (payload.eventType === 'DELETE') return prev.filter(i => i.id !== payload.old.id);
          return prev;
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [companyId]);

  return (
    <div className="grid grid-cols-4 gap-4 h-full p-4">
      {COLUMNS.map(col => (
        <div key={col} className="flex flex-col gap-2">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs uppercase tracking-widest text-[--apex-muted] font-['Space_Mono']">
              {col.replace('_', ' ')}
            </span>
            <span className="text-xs bg-[--apex-surface] text-[--apex-muted] px-2 py-0.5 rounded font-['Space_Mono']">
              {issues.filter(i => i.status === col).length}
            </span>
          </div>
          {issues.filter(i => i.status === col).map(issue => (
            <IssueCard key={issue.id} issue={issue} />
          ))}
        </div>
      ))}
    </div>
  );
}
```

---

## All 9 Pages — Build Order

### 1. /dashboard — Command Center (BUILD FIRST)
```
Layout: 3-column on desktop
Left col (40%): Live agent grid (AgentStatusCard × all agents)
Center col (35%): Real-time issue board (compact — last 10 active issues)
Right col (25%): APEX Advisor daily briefing + Inbox preview (3 newest items)
Top bar: Company name + total token gauge + company switcher
```

### 2. /companies — Company Manager
```
List of all companies with: name, status badge, agent count, token gauge, last activity
"New Company" button → modal: name + goal text area → auto-spawns CEO
"Import Template" button → shows template cards (moving-company, saas-startup, etc.)
```

### 3. /agents — Agent Roster
```
Top: Visual org chart (SVG tree, CEO at top, branches to all agents)
Below: Grid of AgentStatusCard for all agents
Click agent: Side panel with full config, heartbeat history, quality trend, custom rules editor
"Hire Agent" button → role selector + model tier + reports_to
"Terminate" button → requires typing agent name to confirm
```

### 4. /issues — Issue Tracker
```
Full-width real-time Kanban: IssueBoard component
Click issue: Full side panel — title, description, success condition, comment thread, 
  agent handoff history, tokens spent, quality score, artifacts
"New Issue" button → form: title + description + assigned_to + priority
```

### 5. /inbox — Approval Queue
```
List of pending inbox items sorted by created_at
Types displayed differently:
  HIRE_APPROVAL: "CEO wants to hire [role] — Approve / Reject"
  BUDGET_ALERT: Red banner — "Company X is at 95% budget"
  STALL_ALERT: Orange — "Agent stalled on [issue] for [N] minutes"
  PERSONA_PATCH: Blue — "Eval Engineer proposes prompt improvement — Review diff"
  IRREVERSIBLE_ACTION: Red — "Agent wants to [action] — Approve / Reject"
Empty state: "✓ No pending approvals" in APEX green
```

### 6. /spend — Token Analytics
```
Monthly spend chart (line chart — total tokens by day)
Table: Per-agent breakdown (tokens, cost, tasks, cost-per-task)
Budget config per company (editable)
Alert threshold config (warn at X%, pause at Y%)
Model cost breakdown (how much spent on each model tier)
```

### 7. /skills — Skill Marketplace
```
Tab 1: Built-in APEX Skills (web-browser, ringcentral-listener, etc.)
Tab 2: Installed Skills (per company, with version + SHA + safety score)
Tab 3: Install New (URL input → scan → confirm → assign to agent)
Skill card: name, version, permissions list, safety badge (green/yellow/red)
```

### 8. /routines — Automation Center
```
Tab 1: Scheduled Routines (list with cron expression + next run time + enable/disable)
Tab 2: Reactive Routines (event pattern + assigned agent role + enable/disable)
Tab 3: Run History (last 30 routine executions with token cost + success/fail)
"New Routine" button → type selector → form (scheduled: cron builder, reactive: event pattern)
```

### 9. /audit — Audit Log Viewer
```
Immutable log of all agent actions — sorted by created_at desc
Filters: company, agent, action type, date range
Each row: timestamp, agent name, action, entity, before/after (expandable JSON)
Export to CSV button
No delete or edit controls — read only forever
```

---

## Supabase Client Setup

```typescript
// lib/supabase/client.ts (browser)
import { createBrowserClient } from '@supabase/ssr';
export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

// lib/supabase/server.ts (server components + API routes)
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
export const createServerSupabase = () =>
  createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookies().get(name)?.value } }
  );

// lib/supabase/admin.ts (server-only, service role — NEVER import in client components)
import { createClient } from '@supabase/supabase-js';
export const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // Never in NEXT_PUBLIC_
);
```

---

## Google Fonts Setup (in layout.tsx)

```tsx
import { Space_Mono, DM_Sans } from 'next/font/google';

const spaceMono = Space_Mono({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-space-mono',
});

const dmSans = DM_Sans({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-dm-sans',
});

export default function RootLayout({ children }) {
  return (
    <html className={`${spaceMono.variable} ${dmSans.variable}`}>
      <body className="bg-[#0A0A0A] text-[#F5F5F5]">{children}</body>
    </html>
  );
}
```

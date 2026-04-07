'use client';

import { useMemo } from 'react';
import { useActiveCompany, useRealtimeTable } from '@/lib/hooks';
import { speak } from '@/lib/speech';
import { useEffect, useRef } from 'react';

interface AgentRow {
  id: string;
  name: string;
  role: string;
  status: string;
  updated_at: string;
  company_id: string;
}

interface IssueRow {
  id: string;
  title: string;
  status: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  company_id: string;
  metadata: Record<string, unknown> | null;
}

type FeedEntry = {
  id: string;
  ts: string;
  icon: string;
  summary: string;
  speakable?: string;
};

const ROLE_LABELS: Record<string, string> = {
  ceo: 'CEO',
  cmo: 'Marketing lead',
  cfo: 'Finance lead',
  cto: 'Tech lead',
  coo: 'Operations lead',
  marketing: 'Marketer',
  sales: 'Sales rep',
  support: 'Support agent',
  engineer: 'Engineer',
  qa: 'QA tester',
};

function friendlyRole(role: string): string {
  return ROLE_LABELS[role.toLowerCase()] ?? role;
}

function friendlyAgent(agent: AgentRow): string {
  const role = friendlyRole(agent.role);
  if (agent.name && agent.name.toLowerCase() !== agent.role.toLowerCase()) {
    return `${agent.name} (your ${role})`;
  }
  return `your ${role}`;
}

function summarizeAgent(agent: AgentRow): FeedEntry | null {
  const who = friendlyAgent(agent);
  let summary = '';
  let icon = '·';
  switch (agent.status) {
    case 'working':
      summary = `${who} started working.`;
      icon = '⚙';
      break;
    case 'idle':
      summary = `${who} is ready for the next task.`;
      icon = '○';
      break;
    case 'paused':
      summary = `${who} is paused.`;
      icon = '⏸';
      break;
    case 'stalled':
      summary = `${who} got stuck and needs a hand.`;
      icon = '⚠';
      break;
    case 'terminated':
      summary = `${who} finished up and signed off.`;
      icon = '✓';
      break;
    default:
      return null;
  }
  return {
    id: `agent-${agent.id}-${agent.updated_at}`,
    ts: agent.updated_at,
    icon,
    summary,
    speakable: summary,
  };
}

function summarizeIssue(issue: IssueRow, agents: AgentRow[]): FeedEntry | null {
  const assignee = agents.find((a) => a.id === issue.assigned_to);
  const who = assignee ? friendlyAgent(assignee) : 'someone on your team';
  let summary = '';
  let icon = '·';
  switch (issue.status) {
    case 'open':
      summary = `New task for ${who}: ${issue.title}.`;
      icon = '＋';
      break;
    case 'in_progress':
      summary = `${who} is working on "${issue.title}".`;
      icon = '⚙';
      break;
    case 'completed':
      summary = `${who} finished "${issue.title}".`;
      icon = '✓';
      break;
    case 'blocked':
      summary = `${who} is blocked on "${issue.title}".`;
      icon = '⚠';
      break;
    case 'failed':
      summary = `${who} couldn't finish "${issue.title}". Will try again.`;
      icon = '✕';
      break;
    default:
      return null;
  }
  return {
    id: `issue-${issue.id}-${issue.updated_at}`,
    ts: issue.updated_at || issue.created_at,
    icon,
    summary,
    speakable: summary,
  };
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function ActivityFeed() {
  const { companyId } = useActiveCompany();
  const { data: agents } = useRealtimeTable<AgentRow>('agents', companyId);
  const { data: issues } = useRealtimeTable<IssueRow>('issues', companyId);

  const entries = useMemo<FeedEntry[]>(() => {
    const out: FeedEntry[] = [];
    for (const a of agents) {
      const e = summarizeAgent(a);
      if (e) out.push(e);
    }
    for (const i of issues) {
      const e = summarizeIssue(i, agents);
      if (e) out.push(e);
    }
    out.sort((x, y) => new Date(y.ts).getTime() - new Date(x.ts).getTime());
    return out.slice(0, 25);
  }, [agents, issues]);

  // Speak the latest entry once per session if it changes
  const lastSpokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!entries.length) return;
    const top = entries[0];
    if (lastSpokenRef.current === top.id) return;
    // skip on first load to avoid speaking history
    if (lastSpokenRef.current === null) {
      lastSpokenRef.current = top.id;
      return;
    }
    lastSpokenRef.current = top.id;
    if (top.speakable) {
      const muted = typeof window !== 'undefined' && localStorage.getItem('apex-voice-muted') === '1';
      speak(top.speakable, { muted });
    }
  }, [entries]);

  if (!companyId) {
    return (
      <div className="p-4 text-sm text-apex-muted font-sans">
        Pick a company to see what your team is doing.
      </div>
    );
  }

  if (!entries.length) {
    return (
      <div className="p-4 text-sm text-apex-muted font-sans">
        Your team is quiet right now. Tell them what to do.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto" aria-live="polite" aria-label="Team activity">
      <ul className="divide-y divide-apex-border">
        {entries.map((e) => (
          <li key={e.id} className="px-4 py-3 flex items-start gap-3">
            <span className="text-apex-accent text-base flex-shrink-0 w-5 text-center" aria-hidden>
              {e.icon}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-apex-text font-sans leading-snug">{e.summary}</p>
              <p className="text-[10px] text-apex-muted font-mono mt-0.5">{timeAgo(e.ts)}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

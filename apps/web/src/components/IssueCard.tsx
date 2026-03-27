'use client';

import { cn, timeAgo } from '@/lib/utils';

interface Issue {
  id: string;
  title: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  agent_name?: string;
  created_at: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-apex-danger/20 text-apex-danger',
  high: 'bg-apex-warning/20 text-apex-warning',
  medium: 'bg-apex-info/20 text-apex-info',
  low: 'bg-apex-border text-apex-muted',
};

const STATUS_BADGES: Record<string, string> = {
  open: 'bg-apex-accent/20 text-apex-accent',
  in_progress: 'bg-apex-info/20 text-apex-info',
  in_review: 'bg-apex-warning/20 text-apex-warning',
  completed: 'bg-apex-muted/20 text-apex-muted',
};

export function IssueCard({
  issue,
  onClick,
}: {
  issue: Issue;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="bg-apex-surface border border-apex-border rounded p-3 cursor-pointer
        hover:border-apex-muted transition-colors"
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className={cn(
            'text-[9px] font-mono uppercase px-1.5 py-0.5 rounded',
            STATUS_BADGES[issue.status] ?? 'bg-apex-border text-apex-muted'
          )}
        >
          {issue.status.replace(/_/g, ' ')}
        </span>
        <span
          className={cn(
            'text-[9px] font-mono uppercase px-1.5 py-0.5 rounded',
            PRIORITY_COLORS[issue.priority] ?? 'bg-apex-border text-apex-muted'
          )}
        >
          {issue.priority}
        </span>
      </div>

      <p className="text-sm text-apex-text font-sans truncate mb-2">
        {issue.title}
      </p>

      <div className="flex items-center justify-between text-[10px] text-apex-muted font-mono">
        <span>{issue.agent_name ?? 'Unassigned'}</span>
        <span>{timeAgo(issue.created_at)}</span>
      </div>
    </div>
  );
}

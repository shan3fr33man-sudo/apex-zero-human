'use client';

import { cn, formatTokens } from '@/lib/utils';

type AgentStatus = 'idle' | 'working' | 'paused' | 'stalled' | 'terminated';

interface Agent {
  id: string;
  role: string;
  name: string;
  status: AgentStatus;
  avg_quality_score: number | null;
  total_tokens_used: number | null;
  total_tasks_done: number | null;
  current_issue_id: string | null;
  current_issue_title?: string;
}

const STATUS_STYLES: Record<AgentStatus, string> = {
  idle: 'border-apex-border',
  working: 'border-apex-accent shadow-[0_0_12px_rgba(0,255,136,0.15)]',
  paused: 'border-apex-warning',
  stalled: 'border-apex-danger animate-pulse',
  terminated: 'border-apex-border opacity-50',
};

const STATUS_DOTS: Record<AgentStatus, string> = {
  idle: 'bg-apex-muted',
  working: 'bg-apex-accent',
  paused: 'bg-apex-warning',
  stalled: 'bg-apex-danger',
  terminated: 'bg-apex-muted',
};

export function AgentStatusCard({
  agent,
  onClick,
}: {
  agent: Agent;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'border rounded-lg p-4 bg-apex-surface cursor-pointer hover:bg-apex-bg transition-colors',
        STATUS_STYLES[agent.status]
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-widest text-apex-muted font-mono">
          {agent.role}
        </span>
        <span
          className={cn('w-2 h-2 rounded-full', STATUS_DOTS[agent.status])}
        />
      </div>

      <div className="text-sm font-medium text-apex-text font-sans mb-3">
        {agent.name}
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs font-mono">
        <div>
          <div className="text-apex-muted mb-0.5">QUALITY</div>
          <div
            className={
              (agent.avg_quality_score ?? 0) < 70
                ? 'text-apex-danger'
                : 'text-apex-accent'
            }
          >
            {agent.avg_quality_score?.toFixed(0) ?? '--'}/100
          </div>
        </div>
        <div>
          <div className="text-apex-muted mb-0.5">TOKENS</div>
          <div className="text-apex-text">
            {formatTokens(agent.total_tokens_used)}
          </div>
        </div>
        <div>
          <div className="text-apex-muted mb-0.5">TASKS</div>
          <div className="text-apex-text">{agent.total_tasks_done ?? 0}</div>
        </div>
      </div>

      {agent.current_issue_id && (
        <div className="mt-3 pt-3 border-t border-apex-border text-xs text-apex-muted truncate font-sans">
          ▶ {agent.current_issue_title ?? 'Working on issue...'}
        </div>
      )}
    </div>
  );
}

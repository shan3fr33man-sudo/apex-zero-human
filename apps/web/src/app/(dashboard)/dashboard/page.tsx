'use client';

import { useActiveCompany, useRealtimeTable } from '@/lib/hooks';
import { AgentStatusCard } from '@/components/AgentStatusCard';
import { IssueCard } from '@/components/IssueCard';
import { TokenBudgetGauge } from '@/components/TokenBudgetGauge';

interface AgentRow {
  id: string;
  role: string;
  name: string;
  status: 'idle' | 'working' | 'paused' | 'stalled' | 'terminated';
  avg_quality_score: number | null;
  total_tokens_used: number | null;
  total_tasks_done: number | null;
  current_issue_id: string | null;
  company_id: string;
}

interface IssueRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  created_at: string;
  company_id: string;
}

export default function CommandCenterPage() {
  const { companyId } = useActiveCompany();
  const { data: agents, loading: agentsLoading } = useRealtimeTable<AgentRow>(
    'agents',
    companyId
  );
  const { data: issues, loading: issuesLoading } = useRealtimeTable<IssueRow>(
    'issues',
    companyId
  );

  const totalTokens = agents.reduce(
    (sum, a) => sum + (a.total_tokens_used ?? 0),
    0
  );
  const activeIssues = issues
    .filter((i) => i.status !== 'completed')
    .slice(0, 10);

  if (!companyId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-apex-muted font-sans">
          Select a company to view the command center.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-sans font-semibold text-apex-text">
          Command Center
        </h1>
        <TokenBudgetGauge used={totalTokens} total={10_000_000} size={64} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Left: Agent Grid */}
        <div>
          <h2 className="text-[10px] text-apex-muted font-mono uppercase tracking-widest mb-3">
            Active Agents
          </h2>
          {agentsLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-32 bg-apex-surface border border-apex-border rounded-lg animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {agents.map((agent) => (
                <AgentStatusCard key={agent.id} agent={agent} />
              ))}
            </div>
          )}
        </div>

        {/* Right: Active Issues */}
        <div>
          <h2 className="text-[10px] text-apex-muted font-mono uppercase tracking-widest mb-3">
            Active Issues
          </h2>
          {issuesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-20 bg-apex-surface border border-apex-border rounded animate-pulse"
                />
              ))}
            </div>
          ) : activeIssues.length === 0 ? (
            <div className="text-sm text-apex-muted font-sans p-8 text-center bg-apex-surface border border-apex-border rounded-lg">
              No active issues. Agents are idle.
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-auto">
              {activeIssues.map((issue) => (
                <IssueCard key={issue.id} issue={issue} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

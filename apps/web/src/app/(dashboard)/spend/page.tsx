'use client';

import { useActiveCompany, useRealtimeTable } from '@/lib/hooks';
import { TokenBudgetGauge } from '@/components/TokenBudgetGauge';
import { formatTokens, formatCost } from '@/lib/utils';

interface AgentRow {
  id: string;
  name: string;
  role: string;
  model_tier: string;
  total_tokens_used: number | null;
  total_tasks_done: number | null;
  company_id: string;
}

interface TokenLogRow {
  id: string;
  agent_id: string;
  tokens_used: number;
  model: string;
  created_at: string;
  company_id: string;
}

const MODEL_COSTS: Record<string, number> = {
  'claude-sonnet-4-6': 0.015,   // per 1K tokens (blended)
  'claude-sonnet-4-5': 0.009,
  'claude-haiku-4-5': 0.001,
};

const TIER_MODEL: Record<string, string> = {
  STRATEGIC: 'claude-sonnet-4-6',
  TECHNICAL: 'claude-sonnet-4-5',
  ROUTINE: 'claude-haiku-4-5',
};

export default function SpendPage() {
  const { companyId } = useActiveCompany();
  const { data: agents, loading: agentsLoading } = useRealtimeTable<AgentRow>(
    'agents',
    companyId
  );
  const { data: tokenLogs, loading: logsLoading } =
    useRealtimeTable<TokenLogRow>('token_logs', companyId);

  const totalTokens = agents.reduce(
    (sum, a) => sum + (a.total_tokens_used ?? 0),
    0
  );

  // Per-model breakdown
  const modelBreakdown = agents.reduce<Record<string, { tokens: number; cost: number }>>(
    (acc, a) => {
      const model = TIER_MODEL[a.model_tier] ?? 'unknown';
      const tokens = a.total_tokens_used ?? 0;
      const costPer1K = MODEL_COSTS[model] ?? 0.01;
      if (!acc[model]) acc[model] = { tokens: 0, cost: 0 };
      acc[model].tokens += tokens;
      acc[model].cost += (tokens / 1000) * costPer1K;
      return acc;
    },
    {}
  );

  const totalCost = Object.values(modelBreakdown).reduce(
    (sum, m) => sum + m.cost,
    0
  );

  if (!companyId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-apex-muted font-sans">Select a company first.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-sans font-semibold text-apex-text">
        Token Spend Analytics
      </h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-apex-surface border border-apex-border rounded-lg p-4 flex items-center gap-4">
          <TokenBudgetGauge used={totalTokens} total={10_000_000} size={72} />
          <div>
            <div className="text-[10px] text-apex-muted font-mono uppercase">
              Total Tokens
            </div>
            <div className="text-lg font-mono font-bold text-apex-text">
              {formatTokens(totalTokens)}
            </div>
          </div>
        </div>

        <div className="bg-apex-surface border border-apex-border rounded-lg p-4">
          <div className="text-[10px] text-apex-muted font-mono uppercase mb-2">
            Total Cost
          </div>
          <div className="text-lg font-mono font-bold text-apex-text">
            {formatCost(totalCost)}
          </div>
        </div>

        <div className="bg-apex-surface border border-apex-border rounded-lg p-4">
          <div className="text-[10px] text-apex-muted font-mono uppercase mb-2">
            Active Agents
          </div>
          <div className="text-lg font-mono font-bold text-apex-text">
            {agents.length}
          </div>
        </div>

        <div className="bg-apex-surface border border-apex-border rounded-lg p-4">
          <div className="text-[10px] text-apex-muted font-mono uppercase mb-2">
            Cost / Task
          </div>
          <div className="text-lg font-mono font-bold text-apex-text">
            {formatCost(
              totalCost /
                Math.max(
                  1,
                  agents.reduce((s, a) => s + (a.total_tasks_done ?? 0), 0)
                )
            )}
          </div>
        </div>
      </div>

      {/* Per-Agent Table */}
      <div className="bg-apex-surface border border-apex-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-apex-border">
              <th className="text-left text-[10px] text-apex-muted font-mono uppercase tracking-wider p-3">
                Agent
              </th>
              <th className="text-left text-[10px] text-apex-muted font-mono uppercase tracking-wider p-3">
                Role
              </th>
              <th className="text-right text-[10px] text-apex-muted font-mono uppercase tracking-wider p-3">
                Model
              </th>
              <th className="text-right text-[10px] text-apex-muted font-mono uppercase tracking-wider p-3">
                Tokens
              </th>
              <th className="text-right text-[10px] text-apex-muted font-mono uppercase tracking-wider p-3">
                Tasks
              </th>
              <th className="text-right text-[10px] text-apex-muted font-mono uppercase tracking-wider p-3">
                Est. Cost
              </th>
            </tr>
          </thead>
          <tbody>
            {agentsLoading ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-apex-muted text-sm">
                  Loading...
                </td>
              </tr>
            ) : agents.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-apex-muted text-sm">
                  No agents yet.
                </td>
              </tr>
            ) : (
              agents.map((agent) => {
                const model = TIER_MODEL[agent.model_tier] ?? 'unknown';
                const tokens = agent.total_tokens_used ?? 0;
                const cost = (tokens / 1000) * (MODEL_COSTS[model] ?? 0.01);
                return (
                  <tr
                    key={agent.id}
                    className="border-b border-apex-border last:border-0 hover:bg-apex-bg transition-colors"
                  >
                    <td className="p-3 text-sm font-sans text-apex-text">
                      {agent.name}
                    </td>
                    <td className="p-3 text-xs font-mono text-apex-muted uppercase">
                      {agent.role}
                    </td>
                    <td className="p-3 text-xs font-mono text-apex-muted text-right">
                      {model}
                    </td>
                    <td className="p-3 text-xs font-mono text-apex-text text-right">
                      {formatTokens(tokens)}
                    </td>
                    <td className="p-3 text-xs font-mono text-apex-text text-right">
                      {agent.total_tasks_done ?? 0}
                    </td>
                    <td className="p-3 text-xs font-mono text-apex-accent text-right">
                      {formatCost(cost)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Model Cost Breakdown */}
      <div className="bg-apex-surface border border-apex-border rounded-lg p-4">
        <h2 className="text-[10px] text-apex-muted font-mono uppercase tracking-widest mb-3">
          Model Cost Breakdown
        </h2>
        <div className="space-y-2">
          {Object.entries(modelBreakdown).map(([model, data]) => (
            <div
              key={model}
              className="flex items-center justify-between text-sm"
            >
              <span className="font-mono text-apex-muted text-xs">{model}</span>
              <div className="flex items-center gap-6">
                <span className="font-mono text-apex-text text-xs">
                  {formatTokens(data.tokens)} tokens
                </span>
                <span className="font-mono text-apex-accent text-xs">
                  {formatCost(data.cost)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

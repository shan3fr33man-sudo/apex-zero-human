'use client';

import { useState } from 'react';
import { useActiveCompany, useRealtimeTable } from '@/lib/hooks';
import { AgentStatusCard } from '@/components/AgentStatusCard';
import { OrgChart } from '@/components/OrgChart';
import { HeartbeatTimeline } from '@/components/HeartbeatTimeline';
import { createClient } from '@/lib/supabase/client';

interface AgentRow {
  id: string;
  company_id: string;
  role: string;
  name: string;
  slug: string;
  status: 'idle' | 'working' | 'paused' | 'stalled' | 'terminated';
  model: string;
  reports_to: string | null;
  persona: string;
  tokens_used: number | null;
  issues_completed: number | null;
  config: Record<string, unknown>;
}

export default function AgentsPage() {
  const { companyId } = useActiveCompany();
  const { data: agents, loading } = useRealtimeTable<AgentRow>(
    'agents',
    companyId
  );
  const [selectedAgent, setSelectedAgent] = useState<AgentRow | null>(null);
  const [showHire, setShowHire] = useState(false);
  const [hireRole, setHireRole] = useState('');
  const [hireName, setHireName] = useState('');
  const [hireTier, setHireTier] = useState('ROUTINE');
  const [hireReportsTo, setHireReportsTo] = useState('');
  const [hiring, setHiring] = useState(false);

  async function handleHire() {
    if (!companyId || !hireRole.trim() || !hireName.trim()) return;
    setHiring(true);
    const supabase = createClient();
    await supabase.from('agents').insert({
      company_id: companyId,
      role: hireRole.toLowerCase().replace(/\s+/g, '-'),
      name: hireName,
      model: hireTier === 'STRATEGIC' ? 'claude-sonnet-4-6' : 'claude-sonnet-4-5',
      slug: hireName.toLowerCase().replace(/\s+/g, '-'),
      status: 'idle',
      reports_to: hireReportsTo || null,
      persona: `You are the ${hireRole} agent.`,
      config: {},
      heartbeat_checklist: {},
    });
    setShowHire(false);
    setHireRole('');
    setHireName('');
    setHiring(false);
  }

  if (!companyId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-apex-muted font-sans">Select a company first.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-sans font-semibold text-apex-text">
          Agent Roster
        </h1>
        <button
          onClick={() => setShowHire(true)}
          className="text-sm font-sans font-medium py-2 px-4 rounded
            bg-apex-accent text-apex-bg hover:bg-apex-accent/90 transition-colors"
        >
          + Hire Agent
        </button>
      </div>

      {/* Org Chart */}
      {!loading && agents.length > 0 && (
        <div className="bg-apex-surface border border-apex-border rounded-lg p-4 overflow-x-auto">
          <h2 className="text-[10px] text-apex-muted font-mono uppercase tracking-widest mb-3">
            Organization Chart
          </h2>
          <OrgChart agents={agents} />
        </div>
      )}

      {/* Agent Grid */}
      {loading ? (
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-36 bg-apex-surface border border-apex-border rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {agents.map((agent) => (
            <AgentStatusCard
              key={agent.id}
              agent={agent}
              onClick={() => setSelectedAgent(agent)}
            />
          ))}
        </div>
      )}

      {/* Side Panel — Agent Detail */}
      {selectedAgent && (
        <div className="fixed inset-y-0 right-0 w-[480px] bg-apex-surface border-l border-apex-border z-50 overflow-auto">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-sans font-semibold text-apex-text">
                {selectedAgent.name}
              </h2>
              <button
                onClick={() => setSelectedAgent(null)}
                className="text-apex-muted hover:text-apex-text text-xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-apex-muted font-mono uppercase tracking-widest">
                  Role
                </label>
                <p className="text-sm text-apex-text font-sans">
                  {selectedAgent.role}
                </p>
              </div>

              <div>
                <label className="text-[10px] text-apex-muted font-mono uppercase tracking-widest">
                  Model Tier
                </label>
                <p className="text-sm text-apex-text font-mono">
                  {selectedAgent.model}
                </p>
              </div>

              <div>
                <label className="text-[10px] text-apex-muted font-mono uppercase tracking-widest">
                  Status
                </label>
                <p className="text-sm text-apex-text font-sans capitalize">
                  {selectedAgent.status}
                </p>
              </div>

              <div>
                <label className="text-[10px] text-apex-muted font-mono uppercase tracking-widest">
                  Heartbeat
                </label>
                <div className="mt-2">
                  <HeartbeatTimeline entries={[]} />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-apex-muted font-mono uppercase tracking-widest">
                  Persona
                </label>
                <textarea
                  defaultValue={selectedAgent.persona}
                  rows={4}
                  className="w-full mt-1 text-xs font-mono resize-none"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hire Modal */}
      {showHire && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-apex-surface border border-apex-border rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-sans font-semibold text-apex-text mb-4">
              Hire New Agent
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-apex-muted font-mono uppercase tracking-wider mb-1">
                  Role
                </label>
                <input
                  value={hireRole}
                  onChange={(e) => setHireRole(e.target.value)}
                  className="w-full"
                  placeholder="e.g. Marketing Manager"
                />
              </div>
              <div>
                <label className="block text-xs text-apex-muted font-mono uppercase tracking-wider mb-1">
                  Name
                </label>
                <input
                  value={hireName}
                  onChange={(e) => setHireName(e.target.value)}
                  className="w-full"
                  placeholder="e.g. Marketing Agent"
                />
              </div>
              <div>
                <label className="block text-xs text-apex-muted font-mono uppercase tracking-wider mb-1">
                  Model Tier
                </label>
                <select
                  value={hireTier}
                  onChange={(e) => setHireTier(e.target.value)}
                  className="w-full"
                >
                  <option value="STRATEGIC">STRATEGIC (claude-sonnet-4-6)</option>
                  <option value="TECHNICAL">TECHNICAL (claude-sonnet-4-5)</option>
                  <option value="ROUTINE">ROUTINE (claude-haiku-4-5)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-apex-muted font-mono uppercase tracking-wider mb-1">
                  Reports To
                </label>
                <select
                  value={hireReportsTo}
                  onChange={(e) => setHireReportsTo(e.target.value)}
                  className="w-full"
                >
                  <option value="">None (top level)</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.role})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleHire}
                  disabled={hiring}
                  className="flex-1 text-sm font-sans font-medium py-2 px-4 rounded
                    bg-apex-accent text-apex-bg hover:bg-apex-accent/90 disabled:opacity-50"
                >
                  {hiring ? 'Hiring...' : 'Hire Agent'}
                </button>
                <button
                  onClick={() => setShowHire(false)}
                  className="text-sm font-sans text-apex-muted py-2 px-4 rounded
                    border border-apex-border hover:bg-apex-bg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

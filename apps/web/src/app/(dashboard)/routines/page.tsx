'use client';

import { useState, useEffect } from 'react';
import { useActiveCompany } from '@/lib/hooks';
import { createClient } from '@/lib/supabase/client';
import { timeAgo, cn } from '@/lib/utils';

interface RoutineRow {
  id: string;
  company_id: string;
  name: string;
  routine_type: 'SCHEDULED' | 'REACTIVE';
  enabled: boolean;
  cron_expr: string | null;
  event_pattern: string | null;
  agent_role: string;
  next_run_at: string | null;
  created_at: string;
}

interface RoutineRunRow {
  id: string;
  routine_id: string;
  status: string;
  tokens_used: number | null;
  created_at: string;
  company_id: string;
}

type Tab = 'scheduled' | 'reactive' | 'history';

export default function RoutinesPage() {
  const { companyId } = useActiveCompany();
  const [activeTab, setActiveTab] = useState<Tab>('scheduled');
  const [routines, setRoutines] = useState<RoutineRow[]>([]);
  const [runs, setRuns] = useState<RoutineRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'SCHEDULED' | 'REACTIVE'>('SCHEDULED');
  const [newCron, setNewCron] = useState('');
  const [newPattern, setNewPattern] = useState('');
  const [newRole, setNewRole] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    const supabase = createClient();

    Promise.all([
      supabase
        .from('routines')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false }),
      supabase
        .from('routine_runs')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(30),
    ]).then(([routinesRes, runsRes]) => {
      setRoutines((routinesRes.data as RoutineRow[]) ?? []);
      setRuns((runsRes.data as RoutineRunRow[]) ?? []);
      setLoading(false);
    });
  }, [companyId]);

  async function toggleRoutine(id: string, enabled: boolean) {
    const supabase = createClient();
    await supabase.from('routines').update({ enabled }).eq('id', id);
    setRoutines((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled } : r))
    );
  }

  async function handleCreate() {
    if (!companyId || !newName.trim()) return;
    setCreating(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('routines')
      .insert({
        company_id: companyId,
        name: newName,
        routine_type: newType,
        cron_expr: newType === 'SCHEDULED' ? newCron : null,
        event_pattern: newType === 'REACTIVE' ? newPattern : null,
        agent_role: newRole,
        enabled: true,
        template: { title: newName, description: '' },
      })
      .select()
      .single();
    if (data) setRoutines((prev) => [data as RoutineRow, ...prev]);
    setShowCreate(false);
    setNewName('');
    setCreating(false);
  }

  const scheduledRoutines = routines.filter(
    (r) => r.routine_type === 'SCHEDULED'
  );
  const reactiveRoutines = routines.filter(
    (r) => r.routine_type === 'REACTIVE'
  );

  const tabs: { key: Tab; label: string }[] = [
    { key: 'scheduled', label: `Scheduled (${scheduledRoutines.length})` },
    { key: 'reactive', label: `Reactive (${reactiveRoutines.length})` },
    { key: 'history', label: `Run History (${runs.length})` },
  ];

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
          Routines
        </h1>
        <button
          onClick={() => setShowCreate(true)}
          className="text-sm font-sans font-medium py-2 px-4 rounded
            bg-apex-accent text-apex-bg hover:bg-apex-accent/90"
        >
          + New Routine
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-apex-surface border border-apex-border rounded-lg p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 text-sm font-sans py-2 px-4 rounded transition-colors ${
              activeTab === tab.key
                ? 'bg-apex-accent/10 text-apex-accent'
                : 'text-apex-muted hover:text-apex-text'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Scheduled */}
      {activeTab === 'scheduled' && (
        <div className="space-y-3">
          {loading ? (
            [1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-apex-surface border border-apex-border rounded-lg animate-pulse" />
            ))
          ) : scheduledRoutines.length === 0 ? (
            <div className="text-center py-12 text-apex-muted font-sans">
              No scheduled routines yet.
            </div>
          ) : (
            scheduledRoutines.map((routine) => (
              <div
                key={routine.id}
                className="bg-apex-surface border border-apex-border rounded-lg p-4 flex items-center justify-between"
              >
                <div>
                  <h3 className="text-sm font-sans text-apex-text">
                    {routine.name}
                  </h3>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] font-mono text-apex-muted">
                      CRON: {routine.cron_expr}
                    </span>
                    <span className="text-[10px] font-mono text-apex-muted">
                      AGENT: {routine.agent_role}
                    </span>
                    {routine.next_run_at && (
                      <span className="text-[10px] font-mono text-apex-accent">
                        NEXT: {timeAgo(routine.next_run_at)}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => toggleRoutine(routine.id, !routine.enabled)}
                  className={cn(
                    'w-10 h-5 rounded-full transition-colors relative',
                    routine.enabled ? 'bg-apex-accent' : 'bg-apex-border'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                      routine.enabled ? 'left-5' : 'left-0.5'
                    )}
                  />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Reactive */}
      {activeTab === 'reactive' && (
        <div className="space-y-3">
          {reactiveRoutines.length === 0 ? (
            <div className="text-center py-12 text-apex-muted font-sans">
              No reactive routines yet.
            </div>
          ) : (
            reactiveRoutines.map((routine) => (
              <div
                key={routine.id}
                className="bg-apex-surface border border-apex-border rounded-lg p-4 flex items-center justify-between"
              >
                <div>
                  <h3 className="text-sm font-sans text-apex-text">
                    {routine.name}
                  </h3>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] font-mono text-apex-muted">
                      PATTERN: {routine.event_pattern}
                    </span>
                    <span className="text-[10px] font-mono text-apex-muted">
                      AGENT: {routine.agent_role}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => toggleRoutine(routine.id, !routine.enabled)}
                  className={cn(
                    'w-10 h-5 rounded-full transition-colors relative',
                    routine.enabled ? 'bg-apex-accent' : 'bg-apex-border'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                      routine.enabled ? 'left-5' : 'left-0.5'
                    )}
                  />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* History */}
      {activeTab === 'history' && (
        <div className="bg-apex-surface border border-apex-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-apex-border">
                <th className="text-left text-[10px] text-apex-muted font-mono uppercase p-3">
                  Routine
                </th>
                <th className="text-left text-[10px] text-apex-muted font-mono uppercase p-3">
                  Status
                </th>
                <th className="text-right text-[10px] text-apex-muted font-mono uppercase p-3">
                  Tokens
                </th>
                <th className="text-right text-[10px] text-apex-muted font-mono uppercase p-3">
                  When
                </th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-apex-muted text-sm">
                    No runs yet.
                  </td>
                </tr>
              ) : (
                runs.map((run) => {
                  const routine = routines.find((r) => r.id === run.routine_id);
                  return (
                    <tr
                      key={run.id}
                      className="border-b border-apex-border last:border-0"
                    >
                      <td className="p-3 text-sm font-sans text-apex-text">
                        {routine?.name ?? run.routine_id.slice(0, 8)}
                      </td>
                      <td className="p-3">
                        <span
                          className={cn(
                            'text-[9px] font-mono uppercase px-1.5 py-0.5 rounded',
                            run.status === 'completed'
                              ? 'bg-apex-accent/20 text-apex-accent'
                              : run.status === 'failed'
                                ? 'bg-apex-danger/20 text-apex-danger'
                                : 'bg-apex-border text-apex-muted'
                          )}
                        >
                          {run.status}
                        </span>
                      </td>
                      <td className="p-3 text-xs font-mono text-apex-text text-right">
                        {run.tokens_used ?? 0}
                      </td>
                      <td className="p-3 text-xs font-mono text-apex-muted text-right">
                        {timeAgo(run.created_at)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-apex-surface border border-apex-border rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-sans font-semibold text-apex-text mb-4">
              New Routine
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-apex-muted font-mono uppercase tracking-wider mb-1">
                  Name
                </label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full"
                  placeholder="Daily standup report"
                />
              </div>
              <div>
                <label className="block text-xs text-apex-muted font-mono uppercase tracking-wider mb-1">
                  Type
                </label>
                <select
                  value={newType}
                  onChange={(e) =>
                    setNewType(e.target.value as 'SCHEDULED' | 'REACTIVE')
                  }
                  className="w-full"
                >
                  <option value="SCHEDULED">Scheduled (Cron)</option>
                  <option value="REACTIVE">Reactive (Event)</option>
                </select>
              </div>
              {newType === 'SCHEDULED' && (
                <div>
                  <label className="block text-xs text-apex-muted font-mono uppercase tracking-wider mb-1">
                    Cron Expression
                  </label>
                  <input
                    value={newCron}
                    onChange={(e) => setNewCron(e.target.value)}
                    className="w-full font-mono"
                    placeholder="0 9 * * 1-5"
                  />
                </div>
              )}
              {newType === 'REACTIVE' && (
                <div>
                  <label className="block text-xs text-apex-muted font-mono uppercase tracking-wider mb-1">
                    Event Pattern
                  </label>
                  <input
                    value={newPattern}
                    onChange={(e) => setNewPattern(e.target.value)}
                    className="w-full font-mono"
                    placeholder="call.missed"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs text-apex-muted font-mono uppercase tracking-wider mb-1">
                  Agent Role
                </label>
                <input
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full"
                  placeholder="e.g. lead-recovery"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="flex-1 text-sm font-sans font-medium py-2 px-4 rounded
                    bg-apex-accent text-apex-bg hover:bg-apex-accent/90 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
                <button
                  onClick={() => setShowCreate(false)}
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

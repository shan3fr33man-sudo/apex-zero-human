'use client';

import { useState, useEffect, useCallback } from 'react';
import { useActiveCompany } from '@/lib/hooks';
import { createClient } from '@/lib/supabase/client';
import { timeAgo } from '@/lib/utils';

interface AuditRow {
  id: string;
  company_id: string;
  agent_id: string | null;
  agent_name?: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  created_at: string;
}

export default function AuditPage() {
  const { companyId } = useActiveCompany();
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState('');
  const [filterAgent, setFilterAgent] = useState('');

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    const supabase = createClient();
    supabase
      .from('audit_logs')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setLogs((data as AuditRow[]) ?? []);
        setLoading(false);
      });
  }, [companyId]);

  const filteredLogs = logs.filter((log) => {
    if (filterAction && !log.action.toLowerCase().includes(filterAction.toLowerCase()))
      return false;
    if (filterAgent && !(log.agent_name ?? '').toLowerCase().includes(filterAgent.toLowerCase()))
      return false;
    return true;
  });

  const exportCsv = useCallback(() => {
    const headers = [
      'timestamp',
      'agent',
      'action',
      'entity_type',
      'entity_id',
    ];
    const rows = filteredLogs.map((log) =>
      [
        log.created_at,
        log.agent_name ?? '',
        log.action,
        log.entity_type,
        log.entity_id ?? '',
      ].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredLogs]);

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
          Audit Log
        </h1>
        <button
          onClick={exportCsv}
          className="text-sm font-sans font-medium py-2 px-4 rounded
            border border-apex-border text-apex-muted hover:text-apex-text hover:bg-apex-bg transition-colors"
        >
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <input
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="w-48"
          placeholder="Filter by action..."
        />
        <input
          value={filterAgent}
          onChange={(e) => setFilterAgent(e.target.value)}
          className="w-48"
          placeholder="Filter by agent..."
        />
        <span className="text-xs font-mono text-apex-muted self-center">
          {filteredLogs.length} records
        </span>
      </div>

      {/* Log Table */}
      <div className="bg-apex-surface border border-apex-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-apex-border">
              <th className="text-left text-[10px] text-apex-muted font-mono uppercase p-3 w-32">
                Time
              </th>
              <th className="text-left text-[10px] text-apex-muted font-mono uppercase p-3 w-32">
                Agent
              </th>
              <th className="text-left text-[10px] text-apex-muted font-mono uppercase p-3">
                Action
              </th>
              <th className="text-left text-[10px] text-apex-muted font-mono uppercase p-3 w-28">
                Entity
              </th>
              <th className="text-left text-[10px] text-apex-muted font-mono uppercase p-3 w-16">
                Diff
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-apex-muted text-sm">
                  Loading...
                </td>
              </tr>
            ) : filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-apex-muted text-sm">
                  No audit logs found.
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => (
                <>
                  <tr
                    key={log.id}
                    className="border-b border-apex-border last:border-0 hover:bg-apex-bg transition-colors"
                  >
                    <td className="p-3 text-xs font-mono text-apex-muted">
                      {timeAgo(log.created_at)}
                    </td>
                    <td className="p-3 text-xs font-sans text-apex-text">
                      {log.agent_name ?? '--'}
                    </td>
                    <td className="p-3 text-xs font-mono text-apex-text">
                      {log.action}
                    </td>
                    <td className="p-3 text-xs font-mono text-apex-muted">
                      {log.entity_type}
                    </td>
                    <td className="p-3">
                      {(log.before_state || log.after_state) && (
                        <button
                          onClick={() =>
                            setExpandedId(
                              expandedId === log.id ? null : log.id
                            )
                          }
                          className="text-[9px] font-mono text-apex-accent hover:underline"
                        >
                          {expandedId === log.id ? 'Hide' : 'View'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandedId === log.id && (
                    <tr key={`${log.id}-expanded`}>
                      <td colSpan={5} className="p-4 bg-apex-bg">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className="text-[10px] font-mono text-apex-muted mb-1">
                              BEFORE
                            </div>
                            <pre className="text-xs font-mono text-apex-text overflow-auto max-h-48">
                              {JSON.stringify(log.before_state, null, 2) ??
                                'null'}
                            </pre>
                          </div>
                          <div>
                            <div className="text-[10px] font-mono text-apex-muted mb-1">
                              AFTER
                            </div>
                            <pre className="text-xs font-mono text-apex-text overflow-auto max-h-48">
                              {JSON.stringify(log.after_state, null, 2) ??
                                'null'}
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

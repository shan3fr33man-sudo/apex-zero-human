'use client';

import { useState } from 'react';
import { useActiveCompany, useRealtimeTable } from '@/lib/hooks';
import { IssueCard } from '@/components/IssueCard';
import { createClient } from '@/lib/supabase/client';
import { timeAgo } from '@/lib/utils';

interface IssueRow {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  type: string;
  assigned_to: string | null;
  created_at: string;
  company_id: string;
  estimated_tokens: number | null;
  actual_tokens: number | null;
  metadata: Record<string, unknown> | null;
}

const COLUMNS = ['open', 'in_progress', 'review', 'done'] as const;

export default function IssuesPage() {
  const { companyId } = useActiveCompany();
  const { data: issues, loading } = useRealtimeTable<IssueRow>(
    'issues',
    companyId
  );
  const [selectedIssue, setSelectedIssue] = useState<IssueRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!companyId || !newTitle.trim()) return;
    setCreating(true);
    const supabase = createClient();
    await supabase.from('issues').insert({
      company_id: companyId,
      title: newTitle,
      description: newDesc,
      priority: newPriority,
      status: 'open',
    });
    setShowCreate(false);
    setNewTitle('');
    setNewDesc('');
    setCreating(false);
  }

  if (!companyId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-apex-muted font-sans">Select a company first.</p>
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-sans font-semibold text-apex-text">
          Issues
        </h1>
        <button
          onClick={() => setShowCreate(true)}
          className="text-sm font-sans font-medium py-2 px-4 rounded
            bg-apex-accent text-apex-bg hover:bg-apex-accent/90 transition-colors"
        >
          + New Issue
        </button>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 grid grid-cols-4 gap-4 min-h-0">
        {COLUMNS.map((col) => {
          const colIssues = issues.filter((i) => i.status === col);
          return (
            <div key={col} className="flex flex-col min-h-0">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] uppercase tracking-widest text-apex-muted font-mono">
                  {col.replace(/_/g, ' ')}
                </span>
                <span className="text-[10px] bg-apex-surface text-apex-muted px-1.5 py-0.5 rounded font-mono">
                  {colIssues.length}
                </span>
              </div>
              <div className="flex-1 overflow-auto space-y-2">
                {loading
                  ? [1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-20 bg-apex-surface border border-apex-border rounded animate-pulse"
                      />
                    ))
                  : colIssues.map((issue) => (
                      <IssueCard
                        key={issue.id}
                        issue={issue}
                        onClick={() => setSelectedIssue(issue)}
                      />
                    ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Issue Detail Side Panel */}
      {selectedIssue && (
        <div className="fixed inset-y-0 right-0 w-[480px] bg-apex-surface border-l border-apex-border z-50 overflow-auto">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-sans font-semibold text-apex-text">
                {selectedIssue.title}
              </h2>
              <button
                onClick={() => setSelectedIssue(null)}
                className="text-apex-muted hover:text-apex-text text-xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-apex-muted font-mono uppercase tracking-widest">
                  Status
                </label>
                <p className="text-sm text-apex-text font-sans capitalize">
                  {selectedIssue.status.replace(/_/g, ' ')}
                </p>
              </div>
              <div>
                <label className="text-[10px] text-apex-muted font-mono uppercase tracking-widest">
                  Priority
                </label>
                <p className="text-sm text-apex-text font-sans capitalize">
                  {selectedIssue.priority}
                </p>
              </div>
              <div>
                <label className="text-[10px] text-apex-muted font-mono uppercase tracking-widest">
                  Description
                </label>
                <p className="text-sm text-apex-text font-sans mt-1 whitespace-pre-wrap">
                  {selectedIssue.description || 'No description'}
                </p>
              </div>
              {selectedIssue.metadata?.success_condition && (
                <div>
                  <label className="text-[10px] text-apex-muted font-mono uppercase tracking-widest">
                    Success Condition
                  </label>
                  <p className="text-sm text-apex-text font-sans mt-1">
                    {String(selectedIssue.metadata.success_condition)}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-apex-muted font-mono uppercase tracking-widest">
                    Estimated Tokens
                  </label>
                  <p className="text-sm text-apex-text font-mono">
                    {selectedIssue.estimated_tokens?.toLocaleString() ?? '--'}
                  </p>
                </div>
                <div>
                  <label className="text-[10px] text-apex-muted font-mono uppercase tracking-widest">
                    Actual Tokens
                  </label>
                  <p className="text-sm text-apex-text font-mono">
                    {selectedIssue.actual_tokens?.toLocaleString() ?? '--'}
                  </p>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-apex-muted font-mono uppercase tracking-widest">
                  Created
                </label>
                <p className="text-sm text-apex-text font-mono">
                  {timeAgo(selectedIssue.created_at)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-apex-surface border border-apex-border rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-sans font-semibold text-apex-text mb-4">
              Create Issue
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-apex-muted font-mono uppercase tracking-wider mb-1">
                  Title
                </label>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full"
                  placeholder="Issue title"
                />
              </div>
              <div>
                <label className="block text-xs text-apex-muted font-mono uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  rows={3}
                  className="w-full resize-none"
                />
              </div>
              <div>
                <label className="block text-xs text-apex-muted font-mono uppercase tracking-wider mb-1">
                  Priority
                </label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value)}
                  className="w-full"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="flex-1 text-sm font-sans font-medium py-2 px-4 rounded
                    bg-apex-accent text-apex-bg hover:bg-apex-accent/90 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Issue'}
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

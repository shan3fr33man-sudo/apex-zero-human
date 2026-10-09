'use client';

import { useState } from 'react';
import { useCompanies, useActiveCompany } from '@/lib/hooks';

export default function CompaniesPage() {
  const { companies, loading } = useCompanies();
  const { setCompanyId } = useActiveCompany();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGoal, setNewGoal] = useState('');
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);

    try {
      const res = await fetch('/api/apex/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          description: newGoal || null,
        }),
      });

      if (!res.ok) {
        console.error('[companies] Create error: API returned', res.status);
        setCreating(false);
        return;
      }

      const result = await res.json();
      const company = result.company ?? result;
      if (company && company.id) {
        setCompanyId(company.id);
        setShowCreate(false);
        setNewName('');
        setNewGoal('');
        window.location.reload();
      }
    } catch (err) {
      console.error('[companies] Create error:', err);
    }
    setCreating(false);
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-sans font-semibold text-apex-text">
          Companies
        </h1>
        <button
          onClick={() => setShowCreate(true)}
          className="text-sm font-sans font-medium py-2 px-4 rounded
            bg-apex-accent text-apex-bg hover:bg-apex-accent/90 transition-colors"
        >
          + New Company
        </button>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-apex-surface border border-apex-border rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-sans font-semibold text-apex-text mb-4">
              Create New Company
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-apex-muted font-mono uppercase tracking-wider mb-1">
                  Company Name
                </label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full"
                  placeholder="Acme Corp"
                />
              </div>
              <div>
                <label className="block text-xs text-apex-muted font-mono uppercase tracking-wider mb-1">
                  Goal
                </label>
                <textarea
                  value={newGoal}
                  onChange={(e) => setNewGoal(e.target.value)}
                  rows={3}
                  className="w-full resize-none"
                  placeholder="What should your AI agents focus on?"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="flex-1 text-sm font-sans font-medium py-2 px-4 rounded
                    bg-apex-accent text-apex-bg hover:bg-apex-accent/90 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Launch Company'}
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

      {/* Company List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 bg-apex-surface border border-apex-border rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : companies.length === 0 ? (
        <div className="text-center py-16 text-apex-muted font-sans">
          No companies yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {companies.map((company) => (
            <div
              key={company.id}
              onClick={() => setCompanyId(company.id)}
              className="bg-apex-surface border border-apex-border rounded-lg p-4 cursor-pointer
                hover:border-apex-accent/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-sans font-medium text-apex-text">
                    {company.name}
                  </h3>
                  <p className="text-xs text-apex-muted font-mono mt-1 truncate max-w-xs">
                    {company.description || 'No description'}
                  </p>
                </div>
                <span className="text-[10px] font-mono text-apex-accent px-2 py-1 rounded bg-apex-accent/10">
                  ACTIVE
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

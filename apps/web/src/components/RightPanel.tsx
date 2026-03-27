'use client';

import { useActiveCompany, useRealtimeTable } from '@/lib/hooks';
import { timeAgo } from '@/lib/utils';

interface InboxRow {
  id: string;
  company_id: string;
  item_type: string;
  title: string;
  status: string;
  created_at: string;
}

export function RightPanel() {
  const { companyId } = useActiveCompany();
  const { data: inboxItems } = useRealtimeTable<InboxRow>('inbox_items', companyId);

  const pendingItems = inboxItems
    .filter((item) => item.status === 'pending')
    .slice(0, 3);

  return (
    <aside className="w-right-panel flex-shrink-0 bg-apex-surface border-l border-apex-border flex flex-col h-full">
      {/* APEX Advisor Briefing */}
      <div className="p-4 border-b border-apex-border">
        <h3 className="text-[10px] text-apex-muted font-mono uppercase tracking-widest mb-3">
          APEX Advisor
        </h3>
        <div className="bg-apex-bg rounded p-3 text-sm text-apex-text font-sans leading-relaxed">
          {companyId ? (
            <p>
              All systems nominal. Agents are operational and processing issues.
              Review your inbox for any pending approvals.
            </p>
          ) : (
            <p className="text-apex-muted">
              Select a company to see your daily briefing.
            </p>
          )}
        </div>
      </div>

      {/* Inbox Preview */}
      <div className="flex-1 overflow-auto p-4">
        <h3 className="text-[10px] text-apex-muted font-mono uppercase tracking-widest mb-3">
          Inbox
          {pendingItems.length > 0 && (
            <span className="ml-2 inline-flex items-center justify-center w-4 h-4 text-[9px] bg-apex-accent text-apex-bg rounded-full font-bold">
              {pendingItems.length}
            </span>
          )}
        </h3>

        {pendingItems.length === 0 ? (
          <div className="text-sm text-apex-accent font-sans py-4 text-center">
            No pending approvals
          </div>
        ) : (
          <div className="space-y-2">
            {pendingItems.map((item) => (
              <div
                key={item.id}
                className="bg-apex-bg rounded p-3 border border-apex-border"
              >
                <div className="flex items-center gap-2 mb-1">
                  <TypeBadge type={item.item_type} />
                  <span className="text-[10px] text-apex-muted font-mono">
                    {timeAgo(item.created_at)}
                  </span>
                </div>
                <p className="text-sm text-apex-text font-sans truncate">
                  {item.title}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    HIRE_APPROVAL: 'bg-apex-info/20 text-apex-info',
    BUDGET_ALERT: 'bg-apex-danger/20 text-apex-danger',
    STALL_ALERT: 'bg-apex-warning/20 text-apex-warning',
    PERSONA_PATCH: 'bg-apex-info/20 text-apex-info',
    IRREVERSIBLE_ACTION: 'bg-apex-danger/20 text-apex-danger',
  };

  return (
    <span
      className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded ${colors[type] ?? 'bg-apex-border text-apex-muted'}`}
    >
      {type.replace(/_/g, ' ')}
    </span>
  );
}

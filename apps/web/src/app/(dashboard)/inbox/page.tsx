'use client';

import { useActiveCompany, useRealtimeTable } from '@/lib/hooks';
import { InboxItem as InboxItemComponent } from '@/components/InboxItem';
import { createClient } from '@/lib/supabase/client';

interface InboxRow {
  id: string;
  company_id: string;
  item_type: string;
  title: string;
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
}

export default function InboxPage() {
  const { companyId } = useActiveCompany();
  const { data: items, loading, setData } = useRealtimeTable<InboxRow>(
    'inbox_items',
    companyId
  );

  async function handleResolve(id: string, resolution: 'approved' | 'rejected') {
    const supabase = createClient();
    const { error } = await supabase
      .from('inbox_items')
      .update({ status: resolution, resolved_at: new Date().toISOString() })
      .eq('id', id);

    if (!error) {
      setData((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, status: resolution } : item
        )
      );
    }
  }

  const pendingItems = items.filter((i) => i.status === 'pending');
  const resolvedItems = items.filter((i) => i.status !== 'pending');

  if (!companyId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-apex-muted font-sans">Select a company first.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-sans font-semibold text-apex-text">Inbox</h1>

      {/* Pending */}
      <div>
        <h2 className="text-[10px] text-apex-muted font-mono uppercase tracking-widest mb-3">
          Pending Approvals ({pendingItems.length})
        </h2>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-24 bg-apex-surface border border-apex-border rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : pendingItems.length === 0 ? (
          <div className="text-sm text-apex-accent font-sans p-8 text-center bg-apex-surface border border-apex-border rounded-lg">
            No pending approvals
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl">
            {pendingItems.map((item) => (
              <InboxItemComponent
                key={item.id}
                item={item}
                onApprove={(id) => handleResolve(id, 'approved')}
                onReject={(id) => handleResolve(id, 'rejected')}
              />
            ))}
          </div>
        )}
      </div>

      {/* Resolved */}
      {resolvedItems.length > 0 && (
        <div>
          <h2 className="text-[10px] text-apex-muted font-mono uppercase tracking-widest mb-3">
            Resolved ({resolvedItems.length})
          </h2>
          <div className="space-y-3 max-w-2xl">
            {resolvedItems.slice(0, 20).map((item) => (
              <InboxItemComponent
                key={item.id}
                item={item}
                onApprove={() => {}}
                onReject={() => {}}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

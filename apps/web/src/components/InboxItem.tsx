'use client';

import { cn, timeAgo } from '@/lib/utils';

interface InboxItemData {
  id: string;
  item_type: string;
  title: string;
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
}

const TYPE_CONFIG: Record<
  string,
  { color: string; bgColor: string; label: string }
> = {
  HIRE_APPROVAL: {
    color: 'text-apex-info',
    bgColor: 'bg-apex-info/10 border-apex-info/30',
    label: 'HIRE',
  },
  BUDGET_ALERT: {
    color: 'text-apex-danger',
    bgColor: 'bg-apex-danger/10 border-apex-danger/30',
    label: 'BUDGET',
  },
  STALL_ALERT: {
    color: 'text-apex-warning',
    bgColor: 'bg-apex-warning/10 border-apex-warning/30',
    label: 'STALL',
  },
  PERSONA_PATCH: {
    color: 'text-apex-info',
    bgColor: 'bg-apex-info/10 border-apex-info/30',
    label: 'PATCH',
  },
  IRREVERSIBLE_ACTION: {
    color: 'text-apex-danger',
    bgColor: 'bg-apex-danger/10 border-apex-danger/30',
    label: 'ACTION',
  },
};

export function InboxItem({
  item,
  onApprove,
  onReject,
}: {
  item: InboxItemData;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const config = TYPE_CONFIG[item.item_type] ?? {
    color: 'text-apex-muted',
    bgColor: 'bg-apex-bg border-apex-border',
    label: item.item_type,
  };

  const isPending = item.status === 'pending';

  return (
    <div className={cn('border rounded-lg p-4', config.bgColor)}>
      <div className="flex items-center justify-between mb-2">
        <span
          className={cn(
            'text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-apex-bg',
            config.color
          )}
        >
          {config.label}
        </span>
        <span className="text-[10px] text-apex-muted font-mono">
          {timeAgo(item.created_at)}
        </span>
      </div>

      <p className="text-sm text-apex-text font-sans mb-3">{item.title}</p>

      {isPending && (
        <div className="flex gap-2">
          <button
            onClick={() => onApprove(item.id)}
            className="flex-1 text-xs font-sans font-medium py-1.5 px-3 rounded
              bg-apex-accent/20 text-apex-accent border border-apex-accent/30
              hover:bg-apex-accent/30 transition-colors"
          >
            Approve
          </button>
          <button
            onClick={() => onReject(item.id)}
            className="flex-1 text-xs font-sans font-medium py-1.5 px-3 rounded
              bg-apex-danger/20 text-apex-danger border border-apex-danger/30
              hover:bg-apex-danger/30 transition-colors"
          >
            Reject
          </button>
        </div>
      )}

      {!isPending && (
        <div
          className={cn(
            'text-xs font-mono uppercase',
            item.status === 'approved' ? 'text-apex-accent' : 'text-apex-danger'
          )}
        >
          {item.status}
        </div>
      )}
    </div>
  );
}

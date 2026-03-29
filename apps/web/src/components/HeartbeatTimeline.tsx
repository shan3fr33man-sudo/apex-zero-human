'use client';

import { cn } from '@/lib/utils';

const HEARTBEAT_STATES = [
  'CLAIM',
  'PLAN',
  'EXECUTE',
  'VERIFY',
  'REFLECT',
  'REPORT',
] as const;

type HeartbeatState = (typeof HEARTBEAT_STATES)[number];

interface HeartbeatEntry {
  state: HeartbeatState;
  started_at: string;
  completed_at: string | null;
  tokens_used: number;
}

export function HeartbeatTimeline({
  entries,
  currentState,
}: {
  entries: HeartbeatEntry[];
  currentState?: HeartbeatState | null;
}) {
  return (
    <div className="flex items-center gap-1">
      {HEARTBEAT_STATES.map((state, i) => {
        const entry = entries.find((e) => e.state === state);
        const isCurrent = currentState === state;
        const isComplete = entry?.completed_at != null;

        return (
          <div key={state} className="flex items-center gap-1">
            <div
              className={cn(
                'flex items-center justify-center w-8 h-8 rounded text-[8px] font-mono uppercase border transition-colors',
                isCurrent &&
                  'bg-apex-accent/20 border-apex-accent text-apex-accent animate-pulse',
                isComplete &&
                  !isCurrent &&
                  'bg-apex-accent/10 border-apex-accent/50 text-apex-accent',
                !isComplete &&
                  !isCurrent &&
                  'bg-apex-bg border-apex-border text-apex-muted'
              )}
              title={`${state}${entry ? ` — ${entry.tokens_used} tokens` : ''}`}
            >
              {state.slice(0, 2)}
            </div>
            {i < HEARTBEAT_STATES.length - 1 && (
              <div
                className={cn(
                  'w-3 h-px',
                  isComplete ? 'bg-apex-accent/50' : 'bg-apex-border'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

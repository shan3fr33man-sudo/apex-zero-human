'use client';

import { CommandBar } from './CommandBar';
import { ActivityFeed } from './ActivityFeed';

export function RightPanel() {
  return (
    <aside className="w-right-panel flex-shrink-0 bg-apex-surface border-l border-apex-border flex flex-col h-full">
      <CommandBar />
      <div className="px-4 py-2 border-b border-apex-border">
        <h3 className="text-[10px] text-apex-muted font-mono uppercase tracking-widest">
          What your team is doing
        </h3>
      </div>
      <ActivityFeed />
    </aside>
  );
}

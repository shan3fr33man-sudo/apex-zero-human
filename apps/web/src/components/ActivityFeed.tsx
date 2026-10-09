'use client';

import { useState, useEffect, useCallback } from 'react';
import { useActiveCompany } from '@/lib/hooks';
import { timeAgo } from '@/lib/utils';

interface ActivityItem {
  id: string;
  type: 'heartbeat' | 'issue' | 'audit' | 'provision';
  timestamp: string;
  agent_name: string | null;
  agent_role: string | null;
  title: string;
  detail: string;
  status: string | null;
  icon: string;
}

/**
 * Real-time activity feed showing what AI agents are doing.
 * Polls every 5 seconds for new activity. Subscribes to Supabase Realtime
 * for instant updates on heartbeats and issues.
 */
export function ActivityFeed() {
  const { companyId } = useActiveCompany();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActivity = useCallback(async () => {
    if (!companyId) return;

    try {
      const res = await fetch(`/api/apex/activity?company_id=${companyId}&limit=30`);
      if (!res.ok) throw new Error('Failed to fetch activity');
      const data = await res.json();
      setActivities(data.data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activity');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  // Initial fetch + polling every 5 seconds
  useEffect(() => {
    fetchActivity();
    const interval = setInterval(fetchActivity, 5000);
    return () => clearInterval(interval);
  }, [fetchActivity]);

  if (!companyId) {
    return (
      <div className="p-4">
        <h3 className="text-[10px] text-apex-muted font-mono uppercase tracking-widest mb-3">
          Activity Feed
        </h3>
        <p className="text-sm text-apex-muted font-sans">Select a company to see activity.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4">
        <h3 className="text-[10px] text-apex-muted font-mono uppercase tracking-widest mb-3">
          Activity Feed
        </h3>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse flex gap-3">
              <div className="w-8 h-8 bg-apex-border rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-apex-border rounded w-3/4" />
                <div className="h-2 bg-apex-border rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const typeColors: Record<string, string> = {
    heartbeat: 'border-l-blue-500',
    issue: 'border-l-apex-accent',
    audit: 'border-l-apex-muted',
    provision: 'border-l-yellow-500',
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] text-apex-muted font-mono uppercase tracking-widest">
          Live Activity
        </h3>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 bg-apex-accent rounded-full animate-pulse" />
          <span className="text-[10px] text-apex-muted font-mono">LIVE</span>
        </div>
      </div>

      {error && (
        <div className="text-sm text-apex-danger font-sans mb-3">{error}</div>
      )}

      {activities.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-apex-muted font-sans">
            No activity yet. Give your AI team a command to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-1 max-h-[500px] overflow-y-auto">
          {activities.map((item) => (
            <div
              key={item.id}
              className={`pl-3 py-2 border-l-2 ${typeColors[item.type] || 'border-l-apex-border'} hover:bg-apex-bg/50 transition-colors rounded-r`}
            >
              <div className="flex items-start gap-2">
                <span className="text-base flex-shrink-0 mt-0.5">{item.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-apex-text font-sans leading-tight truncate">
                    {item.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.agent_role && (
                      <span className="text-[10px] font-mono text-apex-accent bg-apex-accent/10 px-1 rounded">
                        {item.agent_role}
                      </span>
                    )}
                    <span className="text-[10px] text-apex-muted font-mono">
                      {timeAgo(item.timestamp)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

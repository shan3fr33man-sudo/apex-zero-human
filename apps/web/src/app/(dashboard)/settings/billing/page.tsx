'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface BillingInfo {
  plan: string;
  plan_status: string;
  trial_ends_at: string | null;
  plan_changed_at: string | null;
  companies_count: number;
  agents_count: number;
  issues_this_month: number;
  tokens_used: number;
}

const PLAN_LIMITS: Record<string, { companies: number; agents: number; issues: number; tokens: number }> = {
  free: { companies: 1, agents: 3, issues: 50, tokens: 100000 },
  starter: { companies: 3, agents: 10, issues: 500, tokens: 1000000 },
  professional: { companies: 10, agents: 50, issues: 5000, tokens: 10000000 },
  enterprise: { companies: -1, agents: -1, issues: -1, tokens: -1 },
};

export default function BillingPage() {
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // This is a simplified view — in production, fetch from a dedicated billing API
      setInfo({
        plan: 'free',
        plan_status: 'active',
        trial_ends_at: null,
        plan_changed_at: null,
        companies_count: 0,
        agents_count: 0,
        issues_this_month: 0,
        tokens_used: 0,
      });
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <div className="h-8 w-48 bg-apex-surface rounded animate-pulse mb-4" />
        <div className="h-64 bg-apex-surface rounded animate-pulse" />
      </div>
    );
  }

  const plan = info?.plan ?? 'free';
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

  function formatLimit(current: number, max: number): string {
    if (max === -1) return `${current.toLocaleString()} / Unlimited`;
    return `${current.toLocaleString()} / ${max.toLocaleString()}`;
  }

  function usagePercent(current: number, max: number): number {
    if (max === -1) return 0;
    return Math.min(100, (current / max) * 100);
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-sans font-semibold text-apex-text mb-1">Billing</h1>
      <p className="text-sm text-apex-muted font-sans mb-6">Manage your subscription and view usage.</p>

      {/* Current Plan */}
      <div className="bg-apex-surface border border-apex-border rounded-lg p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-xs font-mono text-apex-muted uppercase tracking-wider">Current Plan</span>
            <h2 className="text-lg font-sans font-semibold text-apex-text capitalize mt-0.5">{plan}</h2>
          </div>
          <span className={`text-[10px] font-mono px-2 py-1 rounded ${
            info?.plan_status === 'active' ? 'bg-apex-accent/10 text-apex-accent' :
            info?.plan_status === 'trialing' ? 'bg-blue-500/10 text-blue-400' :
            'bg-apex-warning/10 text-apex-warning'
          }`}>
            {info?.plan_status?.toUpperCase() ?? 'ACTIVE'}
          </span>
        </div>

        {info?.trial_ends_at && (
          <p className="text-xs text-apex-muted font-mono mb-3">
            Trial ends: {new Date(info.trial_ends_at).toLocaleDateString()}
          </p>
        )}

        {plan === 'free' ? (
          <Link
            href="/pricing"
            className="inline-block text-sm font-sans font-medium py-2 px-4 rounded
              bg-apex-accent text-apex-bg hover:bg-apex-accent/90 transition-colors"
          >
            Upgrade Plan
          </Link>
        ) : (
          <button className="text-sm font-sans text-apex-muted py-2 px-4 rounded border border-apex-border hover:bg-apex-bg transition-colors">
            Manage Subscription
          </button>
        )}
      </div>

      {/* Usage */}
      <h3 className="text-sm font-sans font-medium text-apex-text mb-3">Usage This Month</h3>
      <div className="space-y-4">
        {[
          { label: 'Companies', current: info?.companies_count ?? 0, max: limits.companies },
          { label: 'Agents per Company', current: info?.agents_count ?? 0, max: limits.agents },
          { label: 'Issues', current: info?.issues_this_month ?? 0, max: limits.issues },
          { label: 'Tokens', current: info?.tokens_used ?? 0, max: limits.tokens },
        ].map((item) => (
          <div key={item.label} className="bg-apex-surface border border-apex-border rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-apex-muted uppercase tracking-wider">{item.label}</span>
              <span className="text-xs font-mono text-apex-text">{formatLimit(item.current, item.max)}</span>
            </div>
            <div className="h-1.5 bg-apex-bg rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  usagePercent(item.current, item.max) > 90 ? 'bg-apex-danger' :
                  usagePercent(item.current, item.max) > 70 ? 'bg-apex-warning' :
                  'bg-apex-accent'
                }`}
                style={{ width: `${usagePercent(item.current, item.max)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function OnboardingPage() {
  const [companyName, setCompanyName] = useState('');
  const [goal, setGoal] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleOnboard(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Call server-side onboarding API
      // Auth is handled server-side via JWT cookie — no authId in body
      const res = await fetch('/api/auth/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          goal,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create company');
        setLoading(false);
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="bg-apex-surface border border-apex-border rounded-lg p-6">
      <h2 className="text-lg font-sans font-semibold text-apex-text mb-2">
        Set up your company
      </h2>
      <p className="text-sm text-apex-muted font-sans mb-6">
        APEX will auto-hire a CEO agent to start running operations.
      </p>

      <form onSubmit={handleOnboard} className="space-y-4">
        <div>
          <label className="block text-xs text-apex-muted font-mono uppercase tracking-wider mb-1">
            Company Name
          </label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
            className="w-full"
            placeholder="Acme Corp"
          />
        </div>

        <div>
          <label className="block text-xs text-apex-muted font-mono uppercase tracking-wider mb-1">
            Company Goal
          </label>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            required
            rows={3}
            className="w-full resize-none"
            placeholder="What should your AI agents focus on?"
          />
        </div>

        {error && (
          <div className="text-apex-danger text-sm font-sans">{error}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-apex-accent text-apex-bg font-sans font-semibold py-2 px-4 rounded
            hover:bg-apex-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Launching APEX...' : 'Launch Company'}
        </button>
      </form>
    </div>
  );
}

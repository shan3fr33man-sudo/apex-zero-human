'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

export default function OnboardingPage() {
  const [companyName, setCompanyName] = useState('');
  const [goal, setGoal] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [authId, setAuthId] = useState<string | null>(null);
  const router = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setAuthId(data.user.id);
      else router.push('/login');
    });
  }, []);

  const handleOnboard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authId) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authId, companyName, goal }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Onboarding failed'); setLoading(false); return; }

      router.push('/dashboard');
    } catch (err) {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">APEX</h1>
          <p className="text-zinc-400 mt-2">Set up your company</p>
        </div>
        <form onSubmit={handleOnboard} className="space-y-4">
          {error && <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Company Name</label>
            <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500" placeholder="My Awesome Company" />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Goal (optional)</label>
            <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none" placeholder="What should your AI company focus on?" />
          </div>
          <button type="submit" disabled={loading || !authId} className="w-full py-2 px-4 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors">
            {loading ? 'Setting up...' : 'Launch Company'}
          </button>
        </form>
      </div>
    </div>
  );
}

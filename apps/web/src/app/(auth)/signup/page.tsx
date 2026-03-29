'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Call server-side signup API (auto-confirms email, creates tenant/org/user)
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Signup failed');
        setLoading(false);
        return;
      }

      // Now sign in to get a session (user is already auto-confirmed)
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }

      // Navigate to onboarding to set up company
      router.push('/onboarding');
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="bg-apex-surface border border-apex-border rounded-lg p-6">
      <h2 className="text-lg font-sans font-semibold text-apex-text mb-6">
        Create your APEX account
      </h2>

      <form onSubmit={handleSignup} className="space-y-4">
        <div>
          <label className="block text-xs text-apex-muted font-mono uppercase tracking-wider mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full"
            placeholder="operator@company.com"
          />
        </div>

        <div>
          <label className="block text-xs text-apex-muted font-mono uppercase tracking-wider mb-1">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full"
            placeholder="Min 8 characters"
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
          {loading ? 'Creating account...' : 'Create Account'}
        </button>
      </form>

      <p className="text-center text-sm text-apex-muted mt-4 font-sans">
        Already have an account?{' '}
        <Link href="/login" className="text-apex-accent hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface KeyStatus {
  has_claude_key: boolean;
  has_openrouter_key: boolean;
  verified: boolean;
  verified_at: string | null;
  last_error: string | null;
}

export default function ApiKeysPage() {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [claudeKey, setClaudeKey] = useState('');
  const [openrouterKey, setOpenrouterKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  async function getAuthId(): Promise<string | null> {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  }

  async function fetchStatus() {
    const authId = await getAuthId();
    if (!authId) return;
    const res = await fetch('/api/apex/settings/api-key', {
      headers: { 'x-auth-id': authId },
    });
    if (res.ok) {
      setStatus(await res.json());
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchStatus();
  }, []);

  async function handleSave() {
    if (!claudeKey.trim()) {
      setMessage({ type: 'error', text: 'Please enter your Claude API key' });
      return;
    }
    setSaving(true);
    setMessage(null);

    const authId = await getAuthId();
    if (!authId) { setSaving(false); return; }

    const res = await fetch('/api/apex/settings/api-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth-id': authId },
      body: JSON.stringify({
        claude_api_key: claudeKey,
        openrouter_api_key: openrouterKey || undefined,
      }),
    });

    const data = await res.json();
    setSaving(false);

    if (res.ok) {
      setMessage({ type: 'success', text: 'API key verified and saved successfully!' });
      setClaudeKey('');
      setOpenrouterKey('');
      fetchStatus();
    } else {
      setMessage({ type: 'error', text: data.error || 'Failed to save key' });
    }
  }

  async function handleRemove() {
    const authId = await getAuthId();
    if (!authId) return;

    const res = await fetch('/api/apex/settings/api-key', {
      method: 'DELETE',
      headers: { 'x-auth-id': authId },
    });

    if (res.ok) {
      setMessage({ type: 'success', text: 'API key removed. Agents are now paused.' });
      fetchStatus();
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="h-8 w-48 bg-apex-surface rounded animate-pulse mb-4" />
        <div className="h-40 bg-apex-surface rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-sans font-semibold text-apex-text mb-1">API Keys</h1>
      <p className="text-sm text-apex-muted font-sans mb-6">
        Your agents run on your Claude API key. APEX never stores or uses its own key for your workloads.
      </p>

      {/* Current Status */}
      <div className="bg-apex-surface border border-apex-border rounded-lg p-4 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-2.5 h-2.5 rounded-full ${status?.verified ? 'bg-apex-accent' : status?.has_claude_key ? 'bg-apex-warning' : 'bg-apex-danger'}`} />
          <span className="text-sm font-sans text-apex-text">
            {status?.verified ? 'Claude API Key — Verified' : status?.has_claude_key ? 'Claude API Key — Not Verified' : 'Claude API Key — Not Set'}
          </span>
        </div>
        {status?.verified_at && (
          <p className="text-xs text-apex-muted font-mono ml-5">
            Last verified: {new Date(status.verified_at).toLocaleString()}
          </p>
        )}
        {status?.last_error && (
          <p className="text-xs text-apex-danger font-mono ml-5 mt-1">{status.last_error}</p>
        )}
        {status?.has_openrouter_key && (
          <div className="flex items-center gap-3 mt-3">
            <div className="w-2.5 h-2.5 rounded-full bg-apex-accent" />
            <span className="text-sm font-sans text-apex-text">OpenRouter Key — Set</span>
          </div>
        )}
      </div>

      {/* Warning */}
      {!status?.verified && (
        <div className="bg-apex-warning/10 border border-apex-warning/30 rounded-lg p-4 mb-6">
          <p className="text-sm text-apex-warning font-sans font-medium">Your agents will not run without a valid API key.</p>
          <p className="text-xs text-apex-muted font-sans mt-1">
            Get your API key from{' '}
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-apex-accent hover:underline">
              console.anthropic.com
            </a>
          </p>
        </div>
      )}

      {/* Input Form */}
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-apex-muted font-mono uppercase tracking-wider mb-1">
            Claude API Key
          </label>
          <input
            type="password"
            value={claudeKey}
            onChange={(e) => setClaudeKey(e.target.value)}
            placeholder={status?.has_claude_key ? '••••••••••••••••••••' : 'sk-ant-...'}
            className="w-full px-3 py-2 bg-apex-bg border border-apex-border rounded-lg text-apex-text text-sm font-mono
              focus:outline-none focus:ring-2 focus:ring-apex-accent/50 placeholder:text-apex-muted/50"
          />
        </div>

        <div>
          <label className="block text-xs text-apex-muted font-mono uppercase tracking-wider mb-1">
            OpenRouter API Key <span className="text-apex-muted/50">(optional — for cheaper routine agents)</span>
          </label>
          <input
            type="password"
            value={openrouterKey}
            onChange={(e) => setOpenrouterKey(e.target.value)}
            placeholder={status?.has_openrouter_key ? '••••••••••••••••••••' : 'sk-or-...'}
            className="w-full px-3 py-2 bg-apex-bg border border-apex-border rounded-lg text-apex-text text-sm font-mono
              focus:outline-none focus:ring-2 focus:ring-apex-accent/50 placeholder:text-apex-muted/50"
          />
        </div>

        {message && (
          <div className={`text-sm font-sans p-3 rounded-lg ${message.type === 'success' ? 'bg-apex-accent/10 text-apex-accent border border-apex-accent/20' : 'bg-apex-danger/10 text-apex-danger border border-apex-danger/20'}`}>
            {message.text}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !claudeKey.trim()}
            className="text-sm font-sans font-medium py-2 px-4 rounded
              bg-apex-accent text-apex-bg hover:bg-apex-accent/90 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Verifying & Saving...' : 'Save & Verify Key'}
          </button>
          {status?.has_claude_key && (
            <button
              onClick={handleRemove}
              className="text-sm font-sans text-apex-danger py-2 px-4 rounded
                border border-apex-danger/30 hover:bg-apex-danger/10 transition-colors"
            >
              Remove Key
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

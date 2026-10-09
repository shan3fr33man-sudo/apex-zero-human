'use client';

import { useState, useEffect, useRef } from 'react';
import { useActiveCompany, useRealtimeTable } from '@/lib/hooks';
import { timeAgo } from '@/lib/utils';

interface IssueRow {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

type CommandStatus = 'idle' | 'loading' | 'success' | 'error';

const EXAMPLE_COMMANDS = [
  'Act as my marketing team',
  'Set up lead recovery for missed calls',
  'Audit my operations and find improvements',
  'Build a customer support system',
];

export function CommandBar() {
  const { companyId } = useActiveCompany();
  const { data: issues } = useRealtimeTable<IssueRow>('issues', companyId, true, 'issues');

  const [input, setInput] = useState('');
  const [status, setStatus] = useState<CommandStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Get recent commands (last 3) from issues with source = 'command_bar'
  const recentCommands = issues
    .filter(issue => {
      const meta = issue.metadata as Record<string, unknown> | undefined;
      return meta?.source === 'command_bar';
    })
    .slice(0, 3);

  // Auto-clear success/error messages after timeout
  useEffect(() => {
    if (status === 'success') {
      const timer = setTimeout(() => {
        setStatus('idle');
        setStatusMessage('');
        setInput('');
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  useEffect(() => {
    if (status === 'error') {
      const timer = setTimeout(() => {
        setStatus('idle');
        setStatusMessage('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  const handleExampleClick = (example: string) => {
    setInput(example);
    // Small delay to ensure the input is updated before focusing
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || !companyId) return;

    setStatus('loading');
    setStatusMessage('');

    try {
      const response = await fetch('/api/apex/command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command: input.trim(),
          company_id: companyId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to send command (${response.status})`);
      }

      const data = await response.json();
      setStatus('success');

      if (data.provisioned && data.result) {
        setStatusMessage(data.result.message);
      } else if (data.intent?.type === 'BUILD_TEAM') {
        setStatusMessage('CEO is building your custom team...');
      } else {
        setStatusMessage('Command sent — your AI team is on it');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'An error occurred';
      setStatus('error');
      setStatusMessage(errorMsg);
    }
  };

  if (!companyId) {
    return (
      <div className="p-4 border-b border-apex-border">
        <h3 className="text-[10px] text-apex-muted font-mono uppercase tracking-widest mb-3">
          Command Bar
        </h3>
        <div className="bg-apex-bg rounded p-3 text-sm text-apex-muted font-sans">
          Select a company to issue commands.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 border-b border-apex-border">
      <h3 className="text-[10px] text-apex-muted font-mono uppercase tracking-widest mb-3">
        Command Bar
      </h3>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="mb-4">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tell your AI team what to do..."
            disabled={status === 'loading'}
            className="flex-1 bg-apex-bg border border-apex-border rounded px-3 py-2 text-sm font-sans text-apex-text placeholder-apex-muted focus:outline-none focus:border-apex-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Command input"
          />
          <button
            type="submit"
            disabled={!input.trim() || status === 'loading'}
            className="bg-apex-accent text-apex-bg px-3 py-2 rounded font-mono text-sm font-bold hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1"
            aria-label="Send command"
          >
            {status === 'loading' ? (
              <>
                <span className="inline-block animate-pulse">●</span>
              </>
            ) : (
              <>
                <span>→</span>
              </>
            )}
          </button>
        </div>

        {/* Status Messages */}
        {status === 'success' && (
          <div className="mt-2 flex items-center gap-2 text-sm text-apex-accent font-sans">
            <span className="text-lg">✓</span>
            <span>{statusMessage}</span>
          </div>
        )}

        {status === 'error' && (
          <div className="mt-2 flex items-center gap-2 text-sm text-apex-danger font-sans">
            <span className="text-lg">✕</span>
            <span>{statusMessage}</span>
          </div>
        )}
      </form>

      {/* Example Commands */}
      {status !== 'loading' && status !== 'success' && (
        <div className="mb-4">
          <p className="text-[10px] text-apex-muted font-mono uppercase tracking-widest mb-2">
            Suggested
          </p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_COMMANDS.map((example) => (
              <button
                key={example}
                onClick={() => handleExampleClick(example)}
                className="text-[12px] bg-apex-bg border border-apex-border rounded px-2 py-1 font-sans text-apex-text hover:border-apex-accent hover:text-apex-accent transition-colors cursor-pointer"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recent Commands */}
      {recentCommands.length > 0 && status !== 'loading' && status !== 'success' && (
        <div>
          <p className="text-[10px] text-apex-muted font-mono uppercase tracking-widest mb-2">
            Recent
          </p>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {recentCommands.map((cmd) => (
              <div
                key={cmd.id}
                className="bg-apex-bg rounded p-2 border border-apex-border cursor-pointer hover:border-apex-accent transition-colors group"
                onClick={() => setInput(cmd.title)}
                title="Click to use this command"
              >
                <p className="text-[12px] text-apex-text font-sans group-hover:text-apex-accent truncate">
                  {cmd.title}
                </p>
                <p className="text-[10px] text-apex-muted font-mono mt-1">
                  {timeAgo(cmd.created_at)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';

/**
 * FriendlyError — wraps any error code or raw message in plain English with
 * an optional "Tell me more" expansion. Designed for users with no technical
 * background. Always tells the user what to do next.
 */

const ERROR_MAP: Record<string, { title: string; action: string }> = {
  no_ceo: {
    title: "Your company doesn't have a CEO yet.",
    action: 'Finish the welcome wizard, then come back here.',
  },
  unauthenticated: {
    title: "You're not signed in.",
    action: 'Sign in and try again.',
  },
  invalid_json: {
    title: "I couldn't read your request.",
    action: 'Refresh the page and try again.',
  },
  missing_fields: {
    title: 'Some required information is missing.',
    action: 'Fill in everything and try again.',
  },
  too_long: {
    title: 'Your message is too long.',
    action: 'Try a shorter version.',
  },
  db_error: {
    title: 'Something went wrong on our side.',
    action: 'Wait a moment and try again. If it keeps happening, get help.',
  },
  network: {
    title: "I couldn't reach the server.",
    action: 'Check your internet and try again.',
  },
  budget_exceeded: {
    title: 'Your team has used up its budget for now.',
    action: 'Top up your budget in Settings to keep going.',
  },
  permission: {
    title: "You don't have permission to do that.",
    action: 'Ask the person who set up your account for access.',
  },
};

export function FriendlyError({
  code,
  message,
  detail,
  onDismiss,
}: {
  code?: string;
  message?: string;
  detail?: string;
  onDismiss?: () => void;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const mapped = code ? ERROR_MAP[code] : undefined;
  const title = mapped?.title || message || 'Something went wrong.';
  const action = mapped?.action || 'Please try again.';

  return (
    <div
      role="alert"
      className="bg-apex-danger/10 border border-apex-danger/40 rounded p-3 space-y-2"
    >
      <div className="flex items-start gap-2">
        <span className="text-apex-danger flex-shrink-0" aria-hidden>
          ✕
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-apex-text font-sans font-semibold">{title}</p>
          <p className="text-sm text-apex-muted font-sans mt-0.5">{action}</p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss error"
            className="text-apex-muted hover:text-apex-text min-w-[32px] min-h-[32px] flex items-center justify-center"
          >
            ×
          </button>
        )}
      </div>
      {detail && (
        <button
          type="button"
          onClick={() => setShowDetail((v) => !v)}
          className="text-xs text-apex-muted font-sans underline hover:text-apex-text"
        >
          {showDetail ? 'Hide details' : 'Tell me more'}
        </button>
      )}
      {showDetail && detail && (
        <pre className="text-[11px] text-apex-muted font-mono whitespace-pre-wrap bg-apex-bg border border-apex-border rounded p-2 overflow-auto max-h-32">
          {detail}
        </pre>
      )}
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  isSpeechRecognitionSupported,
  startListening,
  speak,
  type ListenHandle,
} from '@/lib/speech';

/**
 * /welcome — first-run wizard. Four conversational steps, voice-enabled, big
 * buttons, no jargon. Designed so a child or senior with no tech background
 * can get a working AI company in under 60 seconds.
 */

type Step = 0 | 1 | 2 | 3 | 4;

const BUSINESS_KINDS = [
  { id: 'moving', label: 'Moving company', icon: '📦' },
  { id: 'restaurant', label: 'Restaurant', icon: '🍽' },
  { id: 'shop', label: 'Online store', icon: '🛍' },
  { id: 'coaching', label: 'Coaching', icon: '🎯' },
  { id: 'service', label: 'Local service', icon: '🔧' },
  { id: 'other', label: 'Something else', icon: '✨' },
];

const FIRST_TEAMS = [
  {
    id: 'marketing',
    label: 'Marketing',
    blurb: 'Get the word out — write posts, run ads, build the brand.',
    icon: '📣',
  },
  {
    id: 'sales',
    label: 'Sales',
    blurb: 'Find new customers and close deals.',
    icon: '💼',
  },
  {
    id: 'support',
    label: 'Support',
    blurb: 'Answer questions and keep customers happy.',
    icon: '💬',
  },
  {
    id: 'operations',
    label: 'Operations',
    blurb: 'Keep the business running smoothly day to day.',
    icon: '⚙',
  },
];

export default function WelcomePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [name, setName] = useState('');
  const [businessKind, setBusinessKind] = useState('');
  const [businessOther, setBusinessOther] = useState('');
  const [firstTeam, setFirstTeam] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supportsVoice = useRef(false);
  const listenRef = useRef<ListenHandle | null>(null);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    supportsVoice.current = isSpeechRecognitionSupported();
  }, []);

  // Speak the question on each step
  useEffect(() => {
    const muted = typeof window !== 'undefined' && localStorage.getItem('apex-voice-muted') === '1';
    const lines: Record<Step, string> = {
      0: "Welcome to Apex. Let's get your company ready in under a minute.",
      1: "First — what's your name?",
      2: 'Great. What kind of business do you want to run?',
      3: "Pick the team you want to start with. You can add more later.",
      4: 'All set. Your team is coming to life.',
    };
    speak(lines[step], { muted });
  }, [step]);

  function startVoiceForName() {
    if (!supportsVoice.current) return;
    setListening(true);
    listenRef.current = startListening(
      () => {},
      (final) => {
        setName(final);
        setListening(false);
        listenRef.current = null;
      },
      () => {
        setListening(false);
        listenRef.current = null;
      }
    );
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    const business =
      businessKind === 'other' ? businessOther : BUSINESS_KINDS.find((b) => b.id === businessKind)?.label || '';
    try {
      const res = await fetch('/api/apex/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_name: name,
          business_kind: business,
          first_team: firstTeam,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('apex-active-company', data.company_id);
        localStorage.setItem('apex-first-run-complete', '1');
      }
      const muted = typeof window !== 'undefined' && localStorage.getItem('apex-voice-muted') === '1';
      speak(data.message, { muted });
      setStep(4);
      setTimeout(() => router.push('/dashboard'), 2200);
    } catch {
      setError("I couldn't reach the server. Please try again.");
      setSubmitting(false);
    }
  }

  // Step 0: intro
  if (step === 0) {
    return (
      <div className="bg-apex-surface border border-apex-border rounded-lg p-6 text-center space-y-6">
        <div className="text-5xl">👋</div>
        <h2 className="text-xl font-sans font-semibold text-apex-text">
          Welcome to APEX
        </h2>
        <p className="text-apex-muted font-sans">
          Type or talk. I&apos;ll set up your AI company in about a minute.
          You can skip anything.
        </p>
        <button
          type="button"
          onClick={() => setStep(1)}
          className="w-full min-h-[56px] bg-apex-accent text-apex-bg font-sans font-semibold text-base rounded hover:opacity-90"
        >
          Let&apos;s go
        </button>
      </div>
    );
  }

  // Step 1: name
  if (step === 1) {
    return (
      <div className="bg-apex-surface border border-apex-border rounded-lg p-6 space-y-5">
        <StepHeader step={1} total={3} />
        <h2 className="text-xl font-sans font-semibold text-apex-text">
          What&apos;s your name?
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your first name"
            aria-label="Your name"
            className="flex-1 bg-apex-bg border border-apex-border rounded px-3 min-h-[48px] text-apex-text font-sans focus:outline-none focus:ring-2 focus:ring-apex-accent"
          />
          {supportsVoice.current && (
            <button
              type="button"
              onClick={startVoiceForName}
              aria-label="Speak your name"
              className={`min-w-[48px] min-h-[48px] rounded-full ${
                listening ? 'bg-apex-danger text-white animate-pulse' : 'bg-apex-accent text-apex-bg'
              }`}
            >
              🎤
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setStep(2)}
            className="flex-1 min-h-[48px] text-apex-muted font-sans hover:text-apex-text"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={() => setStep(2)}
            className="flex-1 min-h-[48px] bg-apex-accent text-apex-bg font-sans font-semibold rounded hover:opacity-90"
          >
            Next
          </button>
        </div>
      </div>
    );
  }

  // Step 2: business kind
  if (step === 2) {
    return (
      <div className="bg-apex-surface border border-apex-border rounded-lg p-6 space-y-5">
        <StepHeader step={2} total={3} />
        <h2 className="text-xl font-sans font-semibold text-apex-text">
          What kind of business?
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {BUSINESS_KINDS.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setBusinessKind(b.id)}
              aria-pressed={businessKind === b.id}
              className={`min-h-[64px] rounded border-2 p-3 text-left flex items-center gap-2 font-sans ${
                businessKind === b.id
                  ? 'border-apex-accent bg-apex-accent/10 text-apex-text'
                  : 'border-apex-border bg-apex-bg text-apex-muted hover:border-apex-accent/50'
              }`}
            >
              <span className="text-2xl" aria-hidden>
                {b.icon}
              </span>
              <span className="text-sm">{b.label}</span>
            </button>
          ))}
        </div>
        {businessKind === 'other' && (
          <input
            type="text"
            value={businessOther}
            onChange={(e) => setBusinessOther(e.target.value)}
            placeholder="Tell me what kind"
            aria-label="Describe your business"
            className="w-full bg-apex-bg border border-apex-border rounded px-3 min-h-[48px] text-apex-text font-sans focus:outline-none focus:ring-2 focus:ring-apex-accent"
          />
        )}
        <button
          type="button"
          onClick={() => setStep(3)}
          disabled={!businessKind || (businessKind === 'other' && !businessOther.trim())}
          className="w-full min-h-[48px] bg-apex-accent text-apex-bg font-sans font-semibold rounded hover:opacity-90 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    );
  }

  // Step 3: first team
  if (step === 3) {
    return (
      <div className="bg-apex-surface border border-apex-border rounded-lg p-6 space-y-5">
        <StepHeader step={3} total={3} />
        <h2 className="text-xl font-sans font-semibold text-apex-text">
          Pick your first team
        </h2>
        <p className="text-sm text-apex-muted font-sans">
          You can add more teams any time. This is just where you start.
        </p>
        <div className="space-y-2">
          {FIRST_TEAMS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFirstTeam(t.id)}
              aria-pressed={firstTeam === t.id}
              className={`w-full min-h-[64px] rounded border-2 p-3 text-left flex items-start gap-3 font-sans ${
                firstTeam === t.id
                  ? 'border-apex-accent bg-apex-accent/10 text-apex-text'
                  : 'border-apex-border bg-apex-bg text-apex-text hover:border-apex-accent/50'
              }`}
            >
              <span className="text-2xl flex-shrink-0" aria-hidden>
                {t.icon}
              </span>
              <span className="flex-1">
                <span className="block font-semibold text-sm">{t.label}</span>
                <span className="block text-xs text-apex-muted mt-0.5">{t.blurb}</span>
              </span>
            </button>
          ))}
        </div>
        {error && <p className="text-sm text-apex-danger font-sans">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setFirstTeam('');
              submit();
            }}
            disabled={submitting}
            className="flex-1 min-h-[48px] text-apex-muted font-sans hover:text-apex-text disabled:opacity-40"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !firstTeam}
            className="flex-1 min-h-[48px] bg-apex-accent text-apex-bg font-sans font-semibold rounded hover:opacity-90 disabled:opacity-40"
          >
            {submitting ? 'Setting up…' : 'Launch my team'}
          </button>
        </div>
      </div>
    );
  }

  // Step 4: success
  return (
    <div className="bg-apex-surface border border-apex-border rounded-lg p-6 text-center space-y-4">
      <div className="text-5xl animate-bounce">🚀</div>
      <h2 className="text-xl font-sans font-semibold text-apex-text">
        Your team is coming to life
      </h2>
      <p className="text-sm text-apex-muted font-sans">
        Taking you to your dashboard…
      </p>
    </div>
  );
}

function StepHeader({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${step} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 flex-1 rounded ${i < step ? 'bg-apex-accent' : 'bg-apex-border'}`}
        />
      ))}
    </div>
  );
}

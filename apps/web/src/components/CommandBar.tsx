'use client';

import { useEffect, useRef, useState } from 'react';
import { useActiveCompany } from '@/lib/hooks';
import {
  isSpeechRecognitionSupported,
  startListening,
  speak,
  type ListenHandle,
} from '@/lib/speech';

const EXAMPLES = [
  'Act as my marketing team',
  'Build me a sales team',
  'I need customer support',
  'Set up an operations team',
];

type Status =
  | { kind: 'idle' }
  | { kind: 'listening'; preview: string }
  | { kind: 'sending' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

export function CommandBar() {
  const { companyId } = useActiveCompany();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [voiceMuted, setVoiceMuted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listenRef = useRef<ListenHandle | null>(null);
  const supportsVoice = useRef<boolean>(false);

  useEffect(() => {
    supportsVoice.current = isSpeechRecognitionSupported();
    const stored = typeof window !== 'undefined' ? localStorage.getItem('apex-voice-muted') : null;
    if (stored === '1') setVoiceMuted(true);
  }, []);

  // Cmd/Ctrl+K to focus
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function toggleMute() {
    const next = !voiceMuted;
    setVoiceMuted(next);
    if (typeof window !== 'undefined') localStorage.setItem('apex-voice-muted', next ? '1' : '0');
  }

  async function send(rawText: string) {
    const trimmed = rawText.trim();
    if (!trimmed) return;
    if (!companyId) {
      setStatus({ kind: 'error', message: 'Pick a company first.' });
      return;
    }
    setStatus({ kind: 'sending' });
    try {
      const res = await fetch('/api/apex/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId, text: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ kind: 'error', message: data.message || 'Something went wrong.' });
        speak(data.message || 'Something went wrong.', { muted: voiceMuted });
        return;
      }
      setStatus({ kind: 'success', message: data.message });
      speak(data.message, { muted: voiceMuted });
      setText('');
    } catch {
      const m = "I couldn't reach the server. Check your connection and try again.";
      setStatus({ kind: 'error', message: m });
      speak(m, { muted: voiceMuted });
    }
  }

  function startVoice() {
    if (!supportsVoice.current) {
      setStatus({
        kind: 'error',
        message: 'Voice input is not supported in this browser. Try Chrome.',
      });
      return;
    }
    setStatus({ kind: 'listening', preview: '' });
    listenRef.current = startListening(
      (interim) => setStatus({ kind: 'listening', preview: interim }),
      (final) => {
        setText(final);
        listenRef.current = null;
        send(final);
      },
      (msg) => {
        setStatus({ kind: 'error', message: msg });
        listenRef.current = null;
      }
    );
  }

  function stopVoice() {
    listenRef.current?.stop();
    listenRef.current = null;
    if (status.kind === 'listening') setStatus({ kind: 'idle' });
  }

  const isListening = status.kind === 'listening';
  const isSending = status.kind === 'sending';

  return (
    <div className="p-4 border-b border-apex-border bg-apex-surface">
      <div className="flex items-center justify-between mb-3">
        <h3
          id="commandbar-label"
          className="text-[10px] text-apex-muted font-mono uppercase tracking-widest"
        >
          Talk to your team
        </h3>
        <button
          type="button"
          onClick={toggleMute}
          aria-label={voiceMuted ? 'Unmute voice replies' : 'Mute voice replies'}
          aria-pressed={voiceMuted}
          className="text-apex-muted hover:text-apex-text text-base p-1 min-w-[44px] min-h-[44px] flex items-center justify-center"
          title={voiceMuted ? 'Voice replies muted' : 'Voice replies on'}
        >
          {voiceMuted ? '🔇' : '🔊'}
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
        aria-labelledby="commandbar-label"
      >
        <div className="flex items-stretch gap-2">
          <input
            ref={inputRef}
            type="text"
            value={isListening && status.preview ? status.preview : text}
            onChange={(e) => setText(e.target.value)}
            disabled={isSending || isListening}
            placeholder={isListening ? 'Listening…' : 'Type or tap the mic'}
            aria-label="Command input"
            className="flex-1 bg-apex-bg border border-apex-border rounded px-3 py-2 text-apex-text font-sans text-sm placeholder:text-apex-muted focus:outline-none focus:ring-2 focus:ring-apex-accent disabled:opacity-50"
          />
          <button
            type="button"
            onClick={isListening ? stopVoice : startVoice}
            disabled={isSending}
            aria-label={isListening ? 'Stop listening' : 'Start voice input'}
            aria-pressed={isListening}
            className={`min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-lg font-bold transition ${
              isListening
                ? 'bg-apex-danger text-white animate-pulse'
                : 'bg-apex-accent text-apex-bg hover:opacity-90'
            } disabled:opacity-40`}
          >
            {isListening ? '■' : '🎤'}
          </button>
          <button
            type="submit"
            disabled={isSending || isListening || !text.trim()}
            aria-label="Send command"
            className="min-w-[44px] min-h-[44px] px-3 rounded bg-apex-bg border border-apex-border text-apex-text hover:border-apex-accent disabled:opacity-40 text-sm font-sans"
          >
            {isSending ? '…' : 'Send'}
          </button>
        </div>
      </form>

      {/* Status line */}
      <div className="mt-3 min-h-[20px] text-xs font-sans" aria-live="polite" role="status">
        {status.kind === 'success' && <span className="text-apex-accent">✓ {status.message}</span>}
        {status.kind === 'error' && <span className="text-apex-danger">✕ {status.message}</span>}
        {status.kind === 'sending' && <span className="text-apex-muted">Sending to your CEO…</span>}
        {status.kind === 'listening' && (
          <span className="text-apex-info">Listening… speak now</span>
        )}
      </div>

      {/* Examples */}
      {status.kind === 'idle' && (
        <div className="mt-3">
          <div className="text-[10px] text-apex-muted font-mono uppercase tracking-widest mb-2">
            Try saying
          </div>
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => send(ex)}
                className="text-xs font-sans px-2 py-1 rounded bg-apex-bg border border-apex-border text-apex-muted hover:text-apex-text hover:border-apex-accent"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

/**
 * Web Speech API helpers — voice input + read-back for non-technical users.
 * Gracefully no-ops on browsers without support.
 */

// Minimal type shim for SpeechRecognition (not in lib.dom.d.ts as standard)
type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getSRClass(): { new (): SR } | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSRClass() !== null;
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export type ListenHandle = {
  stop: () => void;
};

/**
 * Start listening. Calls onInterim with partial transcripts and onFinal once
 * the user stops talking. Returns a handle to stop listening manually.
 */
export function startListening(
  onInterim: (text: string) => void,
  onFinal: (text: string) => void,
  onError?: (msg: string) => void
): ListenHandle | null {
  const SR = getSRClass();
  if (!SR) {
    onError?.('Voice input is not supported in this browser. Try Chrome on desktop or Android.');
    return null;
  }
  const rec = new SR();
  rec.lang = 'en-US';
  rec.continuous = false;
  rec.interimResults = true;

  let finalText = '';

  rec.onresult = (e) => {
    let interim = '';
    for (let i = 0; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) {
        finalText += r[0].transcript;
      } else {
        interim += r[0].transcript;
      }
    }
    if (interim) onInterim(interim);
  };

  rec.onerror = (e) => {
    if (e.error === 'no-speech') {
      onError?.("I didn't hear anything. Try again?");
    } else if (e.error === 'not-allowed') {
      onError?.('Microphone access was blocked. Please allow it in your browser settings.');
    } else {
      onError?.(`Voice input error: ${e.error}`);
    }
  };

  rec.onend = () => {
    if (finalText.trim()) {
      onFinal(finalText.trim());
    }
  };

  try {
    rec.start();
  } catch {
    onError?.('Could not start the microphone. Try again.');
    return null;
  }

  return {
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Speak a short message out loud. Safe no-op if unsupported or muted.
 */
export function speak(text: string, opts?: { rate?: number; muted?: boolean }) {
  if (opts?.muted) return;
  if (!isSpeechSynthesisSupported()) return;
  try {
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = opts?.rate ?? 1;
    utter.lang = 'en-US';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  } catch {
    /* ignore */
  }
}

export function stopSpeaking() {
  if (!isSpeechSynthesisSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

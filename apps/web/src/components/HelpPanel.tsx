'use client';

import { useEffect, useState } from 'react';

/**
 * HelpPanel — floating help button + slide-over panel with searchable
 * how-tos and a glossary. No videos for v1; pure text content so it works
 * without external assets.
 */

type HowTo = { q: string; a: string };

const HOWTOS: HowTo[] = [
  {
    q: 'How do I deploy a team?',
    a: 'Type or speak something like "act as my marketing team" in the box on the right. Your CEO will hire the team for you.',
  },
  {
    q: 'How do I see what my team is doing?',
    a: 'Look at the activity feed on the right. Every action your team takes shows up there in plain English.',
  },
  {
    q: 'How do I pause an agent?',
    a: 'Click the agent on the Agents page, then click "Pause". You can resume them at any time.',
  },
  {
    q: 'How do I add money to my budget?',
    a: 'Open Settings, then Billing. Pick a plan or add credit. Your team will keep working as long as there\u2019s budget.',
  },
  {
    q: 'How do I get help from a real person?',
    a: 'Click the "?" button any time, then "Talk to support". A real human will get back to you.',
  },
  {
    q: 'How do I change my company name?',
    a: 'Open Settings and edit the company details. Your CEO will be told right away.',
  },
];

const GLOSSARY: Array<{ term: string; meaning: string }> = [
  { term: 'Agent', meaning: 'An AI worker that does a job for your company. Like an employee, but software.' },
  { term: 'CEO', meaning: 'The lead agent for your company. They make plans and assign work to other agents.' },
  { term: 'Team', meaning: 'A group of agents that work together on one area, like marketing or sales.' },
  { term: 'Issue', meaning: 'A task you or another agent want done. Issues get assigned to agents.' },
  { term: 'Activity feed', meaning: 'The live list of what your team is doing right now.' },
  { term: 'Token', meaning: 'How AI usage is measured. Like minutes on a phone plan. You have a budget of tokens.' },
  { term: 'Skill', meaning: 'A special ability an agent can use, like reading email or browsing the web.' },
  { term: 'Heartbeat', meaning: 'A check-in that shows an agent is alive and working. You don\u2019t need to worry about it.' },
];

export function HelpPanel() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
      if (e.key === '?' && !open) {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea') setOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const q = query.trim().toLowerCase();
  const filteredHowTos = q
    ? HOWTOS.filter((h) => h.q.toLowerCase().includes(q) || h.a.toLowerCase().includes(q))
    : HOWTOS;
  const filteredGlossary = q
    ? GLOSSARY.filter((g) => g.term.toLowerCase().includes(q) || g.meaning.toLowerCase().includes(q))
    : GLOSSARY;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open help"
        className="fixed bottom-4 right-4 z-40 min-w-[56px] min-h-[56px] rounded-full bg-apex-accent text-apex-bg font-sans font-bold text-xl shadow-lg hover:opacity-90 focus:outline-none focus:ring-4 focus:ring-apex-accent/40"
        title="Help (press ? anywhere)"
      >
        ?
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Help"
          className="fixed inset-0 z-50 flex"
        >
          <button
            type="button"
            aria-label="Close help"
            onClick={() => setOpen(false)}
            className="flex-1 bg-black/60"
          />
          <div className="w-full max-w-md bg-apex-surface border-l border-apex-border h-full flex flex-col">
            <div className="p-4 border-b border-apex-border flex items-center justify-between">
              <h2 className="text-base font-sans font-semibold text-apex-text">Help</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close help"
                className="min-w-[44px] min-h-[44px] text-apex-muted hover:text-apex-text text-xl"
              >
                ×
              </button>
            </div>
            <div className="p-4 border-b border-apex-border">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="How do I…"
                aria-label="Search help"
                className="w-full bg-apex-bg border border-apex-border rounded px-3 min-h-[48px] text-apex-text font-sans focus:outline-none focus:ring-2 focus:ring-apex-accent"
              />
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-6">
              <section>
                <h3 className="text-[10px] text-apex-muted font-mono uppercase tracking-widest mb-2">
                  How do I…
                </h3>
                {filteredHowTos.length === 0 ? (
                  <p className="text-sm text-apex-muted font-sans">No results.</p>
                ) : (
                  <ul className="space-y-3">
                    {filteredHowTos.map((h) => (
                      <li key={h.q}>
                        <p className="text-sm text-apex-text font-sans font-semibold">{h.q}</p>
                        <p className="text-sm text-apex-muted font-sans mt-0.5">{h.a}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section>
                <h3 className="text-[10px] text-apex-muted font-mono uppercase tracking-widest mb-2">
                  Glossary
                </h3>
                {filteredGlossary.length === 0 ? (
                  <p className="text-sm text-apex-muted font-sans">No results.</p>
                ) : (
                  <ul className="space-y-2">
                    {filteredGlossary.map((g) => (
                      <li key={g.term} className="text-sm font-sans">
                        <span className="text-apex-text font-semibold">{g.term}</span>
                        <span className="text-apex-muted"> — {g.meaning}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

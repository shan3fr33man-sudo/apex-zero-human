import { NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase/admin';

/**
 * POST /api/apex/command
 * Body: { company_id: string, text: string }
 *
 * Plain-English command intake. Classifies intent with a lightweight pattern
 * match (no LLM call needed for the common cases — keeps cost at zero and
 * latency under 200ms). Creates an issue assigned to the company CEO; the
 * orchestrator picks it up on the next 5s tick.
 *
 * Returns a friendly plain-English message suitable for read-back via TTS.
 */

type Intent =
  | { kind: 'BUILD_TEAM'; team: string; pretty: string }
  | { kind: 'EXECUTE_TASK' }
  | { kind: 'QUERY' }
  | { kind: 'UNKNOWN' };

const TEAM_SYNONYMS: Array<{ team: string; pretty: string; patterns: RegExp[] }> = [
  {
    team: 'marketing',
    pretty: 'Marketing Team',
    patterns: [/\bmarketing\b/, /\bbrand(?:ing)?\b/, /\bsocial media\b/, /\bcontent\b/, /\bseo\b/, /\bads?\b/],
  },
  {
    team: 'sales',
    pretty: 'Sales Team',
    patterns: [/\bsales\b/, /\bclose deals?\b/, /\bsell\b/, /\bsdr\b/, /\bprospect/],
  },
  {
    team: 'support',
    pretty: 'Support Team',
    patterns: [/\bsupport\b/, /\bcustomer service\b/, /\bhelp desk\b/, /\btickets?\b/],
  },
  {
    team: 'operations',
    pretty: 'Operations Team',
    patterns: [/\bops\b/, /\boperations\b/, /\bprocess(es)?\b/, /\bcompliance\b/],
  },
  {
    team: 'finance',
    pretty: 'Finance Team',
    patterns: [/\bfinance\b/, /\baccounting\b/, /\bbookkeep/, /\binvoice/, /\bcfo\b/],
  },
  {
    team: 'hr',
    pretty: 'HR Team',
    patterns: [/\bhr\b/, /\bhuman resources\b/, /\brecruit/, /\bhiring\b/, /\bonboarding\b/],
  },
  {
    team: 'dev',
    pretty: 'Dev Team',
    patterns: [/\bdev(?:elopment)?\b/, /\bengineer/, /\bsoftware\b/, /\bcoders?\b/],
  },
];

function classify(text: string): Intent {
  const t = text.toLowerCase();

  // BUILD_TEAM: "act as my X", "be my X", "build me a X", "I need a X"
  const buildIntent = /\b(act as|be my|build (me )?(a |the )?|i need (a |the )?|hire (me )?(a |the )?|set up (a |the )?)/;
  if (buildIntent.test(t)) {
    for (const def of TEAM_SYNONYMS) {
      if (def.patterns.some((p) => p.test(t))) {
        return { kind: 'BUILD_TEAM', team: def.team, pretty: def.pretty };
      }
    }
  }

  // Naked team names — also treat as BUILD_TEAM if the message is short
  if (t.split(/\s+/).length <= 6) {
    for (const def of TEAM_SYNONYMS) {
      if (def.patterns.some((p) => p.test(t))) {
        return { kind: 'BUILD_TEAM', team: def.team, pretty: def.pretty };
      }
    }
  }

  // QUERY: questions
  if (/^(what|how|who|when|why|where|tell me|show me|list)/.test(t)) {
    return { kind: 'QUERY' };
  }

  return { kind: 'EXECUTE_TASK' };
}

function friendlyMessage(intent: Intent, raw: string): string {
  switch (intent.kind) {
    case 'BUILD_TEAM':
      return `Got it. I'm putting together your ${intent.pretty}. They'll be ready in just a moment.`;
    case 'EXECUTE_TASK':
      return `Okay — I sent that to your CEO. Watch the activity feed to see what happens next.`;
    case 'QUERY':
      return `Good question. Your CEO will look into "${raw}" and get back to you.`;
    case 'UNKNOWN':
      return `I sent your message to your CEO.`;
  }
}

export async function POST(request: Request) {
  let body: { company_id?: string; text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid_json', message: "I couldn't read your request. Please try again." },
      { status: 400 }
    );
  }

  const company_id = body.company_id?.trim();
  const text = body.text?.trim();

  if (!company_id || !text) {
    return NextResponse.json(
      { error: 'missing_fields', message: 'Please type or speak a command first.' },
      { status: 400 }
    );
  }
  if (text.length > 2000) {
    return NextResponse.json(
      { error: 'too_long', message: 'That message is too long. Try a shorter one.' },
      { status: 400 }
    );
  }

  const intent = classify(text);

  // Find the CEO agent for this company (case-insensitive)
  const { data: ceo, error: ceoErr } = await adminSupabase
    .from('agents')
    .select('id, name')
    .eq('company_id', company_id)
    .ilike('role', 'ceo')
    .limit(1)
    .maybeSingle();

  if (ceoErr) {
    console.error('[api/apex/command] CEO lookup failed:', ceoErr.message);
    return NextResponse.json(
      { error: 'db_error', message: 'Something went wrong on our side. Please try again.' },
      { status: 500 }
    );
  }

  if (!ceo) {
    return NextResponse.json(
      {
        error: 'no_ceo',
        message: "Your company doesn't have a CEO yet. Finish setup and try again.",
      },
      { status: 404 }
    );
  }

  // Create an issue assigned to the CEO. The orchestrator's next tick (5s)
  // will pick it up and route it through the heartbeat state machine.
  const title =
    intent.kind === 'BUILD_TEAM'
      ? `Deploy ${intent.pretty}`
      : text.length > 80
      ? text.slice(0, 77) + '...'
      : text;

  const { data: issue, error: issueErr } = await adminSupabase
    .from('issues')
    .insert({
      company_id,
      title,
      description: text,
      priority: 'high',
      status: 'open',
      assigned_to: ceo.id,
      metadata: { source: 'command_bar', intent: intent.kind, ...(intent.kind === 'BUILD_TEAM' ? { team: intent.team } : {}) },
    })
    .select('id')
    .single();

  if (issueErr) {
    console.error('[api/apex/command] Issue insert failed:', issueErr.message);
    return NextResponse.json(
      { error: 'db_error', message: 'I could not save that command. Please try again.' },
      { status: 500 }
    );
  }

  // Append to audit_log (best-effort, non-blocking failure)
  await adminSupabase
    .from('audit_log')
    .insert({
      company_id,
      action: 'command_received',
      entity_type: 'issue',
      entity_id: issue.id,
      after_state: { intent: intent.kind, text },
    })
    .then(({ error }) => {
      if (error) console.error('[api/apex/command] audit insert failed:', error.message);
    });

  return NextResponse.json({
    ok: true,
    intent: intent.kind,
    issue_id: issue.id,
    message: friendlyMessage(intent, text),
  });
}

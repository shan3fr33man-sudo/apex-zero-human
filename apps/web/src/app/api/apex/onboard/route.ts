import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { adminSupabase } from '@/lib/supabase/admin';

/**
 * POST /api/apex/onboard
 * Body: { user_name?: string, business_kind: string, first_team?: string }
 *
 * First-run wizard handler. Finds (or creates) the user's organization and a
 * company under it, spawns a CEO agent, and optionally queues a "deploy team"
 * issue for the orchestrator to pick up. Returns the new company_id so the
 * client can store it as the active company.
 */

function slugify(s: string): string {
  return (s || 'company')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'company';
}

const TEAM_PRETTY: Record<string, string> = {
  marketing: 'Marketing Team',
  sales: 'Sales Team',
  support: 'Support Team',
  operations: 'Operations Team',
};

export async function POST(request: Request) {
  let body: { user_name?: string; business_kind?: string; first_team?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid_json', message: "I couldn't read your request." },
      { status: 400 }
    );
  }

  const userName = (body.user_name || '').trim().slice(0, 60);
  const businessKind = (body.business_kind || '').trim().slice(0, 120);
  const firstTeam = (body.first_team || '').trim().toLowerCase();

  if (!businessKind) {
    return NextResponse.json(
      { error: 'missing_business', message: 'Tell me what kind of business you want to run.' },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: 'unauthenticated', message: 'You need to sign in first.' },
      { status: 401 }
    );
  }

  // Find user's org via memberships
  const { data: membership } = await adminSupabase
    .from('memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  let orgId = membership?.org_id as string | undefined;

  if (!orgId) {
    // Create a fresh org for this user
    const email = user.email || 'user';
    const orgSlug = slugify(email.split('@')[0]) + '-' + Date.now().toString(36);
    const { data: org, error: orgErr } = await adminSupabase
      .from('organizations')
      .insert({ name: `${email.split('@')[0]}'s Organization`, slug: orgSlug, plan: 'free' })
      .select('id')
      .single();
    if (orgErr || !org) {
      console.error('[onboard] org create failed:', orgErr?.message);
      return NextResponse.json(
        { error: 'org_failed', message: 'Could not set up your account. Please try again.' },
        { status: 500 }
      );
    }
    orgId = org.id;
    const { error: memErr } = await adminSupabase
      .from('memberships')
      .insert({ user_id: user.id, org_id: orgId, role: 'owner' });
    if (memErr) console.error('[onboard] membership insert failed:', memErr.message);
  }

  // Create the company
  const companyName = userName ? `${userName}'s Company` : 'My Company';
  const companySlug = slugify(companyName) + '-' + Date.now().toString(36);
  const { data: company, error: companyErr } = await adminSupabase
    .from('companies')
    .insert({
      org_id: orgId,
      name: companyName,
      slug: companySlug,
      description: businessKind,
      status: 'active',
      settings: { onboarded_via: 'welcome_wizard', user_name: userName },
    })
    .select('id')
    .single();

  if (companyErr || !company) {
    console.error('[onboard] company create failed:', companyErr?.message);
    return NextResponse.json(
      { error: 'company_failed', message: 'Could not create your company. Please try again.' },
      { status: 500 }
    );
  }

  // Spawn CEO agent
  const { data: ceo, error: ceoErr } = await adminSupabase
    .from('agents')
    .insert({
      company_id: company.id,
      name: 'CEO',
      slug: 'ceo',
      role: 'ceo',
      status: 'idle',
      persona: `You are the CEO of ${companyName}. The owner's goal: ${businessKind}. Build and run the company autonomously.`,
      heartbeat_checklist: [],
      config: {},
    })
    .select('id')
    .single();

  if (ceoErr || !ceo) {
    console.error('[onboard] CEO create failed:', ceoErr?.message);
    return NextResponse.json(
      { error: 'ceo_failed', message: 'Could not create your CEO. Please try again.' },
      { status: 500 }
    );
  }

  // Optionally queue the "deploy first team" issue
  if (firstTeam && TEAM_PRETTY[firstTeam]) {
    await adminSupabase.from('issues').insert({
      company_id: company.id,
      title: `Deploy ${TEAM_PRETTY[firstTeam]}`,
      description: `The owner asked to start with a ${TEAM_PRETTY[firstTeam]} for: ${businessKind}`,
      priority: 'high',
      status: 'open',
      type: 'task',
      assigned_to: ceo.id,
      metadata: { source: 'welcome_wizard', team: firstTeam },
    });
  }

  return NextResponse.json({
    ok: true,
    company_id: company.id,
    message: firstTeam
      ? `All set. Your ${TEAM_PRETTY[firstTeam] ?? 'team'} is on the way.`
      : 'All set. Your CEO is ready.',
  });
}

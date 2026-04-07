import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { adminSupabase } from '@/lib/supabase/admin';

/**
 * POST /api/apex/companies
 * Body: { name: string, goal?: string }
 *
 * Creates a new company under the authenticated user's organization (creating
 * one if needed) and spawns a CEO agent. Uses the service-role client so the
 * frontend never has to know the schema.
 */

function slugify(s: string): string {
  return (s || 'company')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'company';
}

export async function POST(request: Request) {
  let body: { name?: string; goal?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid_json', message: "I couldn't read your request." },
      { status: 400 }
    );
  }

  const name = (body.name || '').trim().slice(0, 80);
  const goal = (body.goal || '').trim().slice(0, 500);

  if (!name) {
    return NextResponse.json(
      { error: 'missing_name', message: 'Please give your company a name.' },
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

  // Find or create org
  const { data: membership } = await adminSupabase
    .from('memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  let orgId = membership?.org_id as string | undefined;

  if (!orgId) {
    const email = user.email || 'user';
    const orgSlug = slugify(email.split('@')[0]) + '-' + Date.now().toString(36);
    const { data: org, error: orgErr } = await adminSupabase
      .from('organizations')
      .insert({ name: `${email.split('@')[0]}'s Organization`, slug: orgSlug, plan: 'free' })
      .select('id')
      .single();
    if (orgErr || !org) {
      console.error('[companies] org create failed:', orgErr?.message);
      return NextResponse.json(
        { error: 'org_failed', message: 'Could not set up your account. Please try again.' },
        { status: 500 }
      );
    }
    orgId = org.id;
    const { error: memErr } = await adminSupabase
      .from('memberships')
      .insert({ user_id: user.id, org_id: orgId, role: 'owner' });
    if (memErr) console.error('[companies] membership insert failed:', memErr.message);
  }

  const companySlug = slugify(name) + '-' + Date.now().toString(36);
  const { data: company, error: companyErr } = await adminSupabase
    .from('companies')
    .insert({
      org_id: orgId,
      name,
      slug: companySlug,
      description: goal,
      status: 'active',
      settings: { goal, vertical: 'custom', created_via: 'companies_page' },
    })
    .select('id, name, slug')
    .single();

  if (companyErr || !company) {
    console.error('[companies] company create failed:', companyErr?.message);
    return NextResponse.json(
      { error: 'company_failed', message: 'Could not create your company. Please try again.' },
      { status: 500 }
    );
  }

  const { error: ceoErr } = await adminSupabase
    .from('agents')
    .insert({
      company_id: company.id,
      name: 'CEO',
      slug: 'ceo',
      role: 'ceo',
      status: 'idle',
      persona: `You are the CEO of ${name}. Goal: ${goal || 'Build and run the company autonomously.'}`,
      heartbeat_checklist: [],
      config: {},
    });

  if (ceoErr) {
    console.error('[companies] CEO create failed:', ceoErr.message);
    // Company exists; surface a soft warning but still return success.
  }

  return NextResponse.json({ ok: true, company });
}

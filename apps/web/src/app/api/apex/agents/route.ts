import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { adminSupabase } from '@/lib/supabase/admin';

/**
 * POST /api/apex/agents
 * Body: { company_id, role, name, model?, reports_to?, persona? }
 *
 * Hires a new agent under a company the authenticated user has membership in.
 * Uses adminSupabase so the frontend never has to know the schema.
 */

const TIER_TO_MODEL: Record<string, string> = {
  STRATEGIC: 'claude-sonnet-4-20250514',
  TECHNICAL: 'claude-sonnet-4-20250514',
  ROUTINE: 'claude-haiku-4-20250514',
};

// Must match the agents_role_check constraint in Postgres.
const ALLOWED_ROLES = new Set([
  'ceo',
  'cto',
  'coo',
  'cfo',
  'pm',
  'founding_engineer',
  'qa_engineer',
  'eval_engineer',
  'designer',
  'marketer',
  'sales',
  'support',
  'dispatch',
  'fleet_manager',
  'custom',
]);

function normalizeRole(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  if (ALLOWED_ROLES.has(slug)) return slug;
  // Common aliases
  if (/^(marketing|cmo|growth)/.test(slug)) return 'marketer';
  if (/^(salesperson|account|biz_dev|bdr|sdr)/.test(slug)) return 'sales';
  if (/^(customer|support|help|cx)/.test(slug)) return 'support';
  if (/^(engineer|developer|dev|swe|founding)/.test(slug)) return 'founding_engineer';
  if (/^(qa|quality|tester)/.test(slug)) return 'qa_engineer';
  if (/^(product|pm|prd)/.test(slug)) return 'pm';
  if (/^(designer|design|ux|ui)/.test(slug)) return 'designer';
  if (/^(operations|ops|coo)/.test(slug)) return 'coo';
  if (/^(finance|cfo|accounting)/.test(slug)) return 'cfo';
  if (/^(tech|cto|architect)/.test(slug)) return 'cto';
  return 'custom';
}

function slugify(s: string): string {
  return (
    (s || 'agent')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'agent'
  );
}

export async function POST(request: Request) {
  let body: {
    company_id?: string;
    role?: string;
    name?: string;
    model?: string;
    model_tier?: string;
    reports_to?: string | null;
    persona?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid_json', message: "I couldn't read your request." },
      { status: 400 }
    );
  }

  const companyId = (body.company_id || '').trim();
  const rawRole = (body.role || '').trim().slice(0, 60);
  const role = normalizeRole(rawRole);
  const name = (body.name || '').trim().slice(0, 80);
  const reportsTo = body.reports_to || null;
  const persona = (body.persona || `You are the ${rawRole || role} agent.`).slice(0, 2000);
  const model =
    body.model ||
    (body.model_tier ? TIER_TO_MODEL[body.model_tier] : null) ||
    'claude-sonnet-4-20250514';

  if (!companyId || !rawRole || !name) {
    return NextResponse.json(
      { error: 'missing_fields', message: 'company_id, role, and name are required.' },
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

  // Verify user has membership in this company's org
  const { data: company, error: companyErr } = await adminSupabase
    .from('companies')
    .select('id, org_id')
    .eq('id', companyId)
    .single();
  if (companyErr || !company) {
    return NextResponse.json(
      { error: 'company_not_found', message: 'Company not found.' },
      { status: 404 }
    );
  }
  const { data: membership } = await adminSupabase
    .from('memberships')
    .select('id')
    .eq('user_id', user.id)
    .eq('org_id', company.org_id)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json(
      { error: 'forbidden', message: 'You are not a member of this organization.' },
      { status: 403 }
    );
  }

  const slug = slugify(name) + '-' + Date.now().toString(36);
  const { data: agent, error: agentErr } = await adminSupabase
    .from('agents')
    .insert({
      company_id: companyId,
      role,
      name,
      slug,
      model,
      status: 'idle',
      reports_to: reportsTo,
      persona,
      heartbeat_checklist: [],
      config: {},
    })
    .select('id, name, role, slug')
    .single();

  if (agentErr || !agent) {
    console.error('[agents] insert failed:', agentErr?.message);
    return NextResponse.json(
      { error: 'insert_failed', message: 'Could not hire that agent. Please try again.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, agent });
}

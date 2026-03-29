import { NextResponse } from 'next/server';
import { getSupabaseServiceRole } from '@/lib/supabase-server';

export async function POST(request: Request) {
  try {
    const { authId, companyName, goal } = await request.json();
    if (!authId || !companyName) return NextResponse.json({ error: 'Auth ID and company name are required' }, { status: 400 });

    const supabase = getSupabaseServiceRole();
    const { data: userRecord } = await supabase.from('users').select('id').eq('auth_id', authId).single();
    if (!userRecord) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { data: membership } = await supabase.from('memberships').select('org_id').eq('user_id', userRecord.id).single();
    if (!membership) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
    const { data: company, error: companyError } = await supabase.from('companies').insert({
      org_id: membership.org_id, name: companyName, slug: slug || `company-${Date.now()}`, goal: goal || null, status: 'active', token_budget: 1000000
    }).select().single();
    if (companyError) return NextResponse.json({ error: companyError.message }, { status: 400 });

    await supabase.from('users').update({ onboarded: true }).eq('id', userRecord.id);
    await supabase.from('agents').insert({ company_id: company.id, name: 'CEO', role: 'ceo', model_tier: 'STRATEGIC', status: 'idle', persona: `You are the CEO of ${companyName}. Your mission: ${goal || 'Run this company autonomously.'}`, heartbeat_config: {}, custom_rules: [], installed_skills: [] });

    return NextResponse.json({ company: { id: company.id, name: company.name, slug: company.slug } });
  } catch (err) {
    console.error('[onboard] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

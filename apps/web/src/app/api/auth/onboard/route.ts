import { NextResponse } from 'next/server';
import { getSupabaseServiceRole } from '@/lib/supabase-server';

/**
 * POST /api/auth/onboard
 * Creates a company and CEO agent for a newly signed-up user.
 * Uses service role to bypass RLS.
 */
export async function POST(request: Request) {
  try {
    const { authId, companyName, goal } = await request.json();

    if (!authId || !companyName) {
      return NextResponse.json(
        { error: 'Auth ID and company name are required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServiceRole();

    // 1. Find the user record by auth_id
    const { data: userRecord, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', authId)
      .single();

    if (userError || !userRecord) {
      console.error('[onboard] User lookup error:', userError?.message);
      return NextResponse.json(
        { error: 'User record not found. Please try signing up again.' },
        { status: 404 }
      );
    }

    // 2. Find the user's organization (created during signup)
    const { data: membership, error: memberError } = await supabase
      .from('memberships')
      .select('org_id')
      .eq('user_id', userRecord.id)
      .single();

    if (memberError || !membership) {
      console.error('[onboard] Membership lookup error:', memberError?.message);
      return NextResponse.json(
        { error: 'Organization not found. Please try signing up again.' },
        { status: 404 }
      );
    }

    // 3. Create the company
    const slug = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({
        org_id: membership.org_id,
        name: companyName,
        slug: slug || `company-${Date.now()}`,
        goal: goal || null,
        status: 'active',
        token_budget: 1000000,
      })
      .select()
      .single();

    if (companyError) {
      console.error('[onboard] Company creation error:', companyError.message);
      return NextResponse.json(
        { error: companyError.message },
        { status: 400 }
      );
    }

    // 4. Mark user as onboarded
    await supabase
      .from('users')
      .update({ onboarded: true, full_name: companyName + ' Owner' })
      .eq('id', userRecord.id);

    // 5. Auto-spawn CEO agent
    const { error: agentError } = await supabase.from('agents').insert({
      company_id: company.id,
      name: 'CEO',
      slug: 'ceo',
      role: 'ceo',
      model: 'claude-sonnet-4-6',
      status: 'idle',
      persona: `You are the CEO of ${companyName}. Your mission: ${goal || 'Run this company autonomously.'}`,
    });

    if (agentError) {
      console.error('[onboard] Agent creation error:', agentError.message);
      // Don't fail — company was created, agent can be added later
    }

    return NextResponse.json({
      company: { id: company.id, name: company.name, slug: company.slug },
    });
  } catch (err) {
    console.error('[onboard] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

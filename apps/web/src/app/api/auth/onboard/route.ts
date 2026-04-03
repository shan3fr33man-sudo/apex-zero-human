import { NextResponse } from 'next/server';
import { getSupabaseServiceRole, getAuthenticatedUser } from '@/lib/supabase-server';

/**
 * POST /api/auth/onboard
 * Creates a company and CEO agent for a newly signed-up user.
 * User identity is extracted from the JWT cookie — never from the request body.
 */
export async function POST(request: Request) {
  try {
    // Extract user from JWT — NOT from request body
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { companyName, goal } = await request.json();

    if (!companyName) {
      return NextResponse.json(
        { error: 'Company name is required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServiceRole();

    // 1. Find the user record — users.id IS the auth UUID
    const { data: userRecord, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('id', user.id)
      .single();

    if (userError || !userRecord) {
      console.error('[onboard] User lookup error:', userError?.message);
      return NextResponse.json(
        { error: 'User record not found. Please try signing up again.' },
        { status: 404 }
      );
    }

    // 2. Find the user's organization (created during signup/callback)
    //    If missing (e.g. race condition), create one now
    let orgId: string;
    const { data: membership, error: memberError } = await supabase
      .from('memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .single();

    if (memberError || !membership) {
      console.log('[onboard] No membership found, creating org');

      const email = user.email || 'user';
      const orgSlug = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-org';

      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({
          name: `${email.split('@')[0]}'s Organization`,
          slug: `${orgSlug}-${Date.now()}`,
        })
        .select('id')
        .single();

      if (orgError || !org) {
        console.error('[onboard] Org creation error:', orgError?.message);
        return NextResponse.json(
          { error: 'Failed to create organization' },
          { status: 500 }
        );
      }

      // Create membership
      await supabase.from('memberships').insert({
        user_id: user.id,
        org_id: org.id,
        role: 'owner',
      });

      orgId = org.id;
    } else {
      orgId = membership.org_id;
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
        org_id: orgId,
        name: companyName,
        slug: slug || `company-${Date.now()}`,
        description: goal || null,
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

    // 4. Auto-spawn CEO agent
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

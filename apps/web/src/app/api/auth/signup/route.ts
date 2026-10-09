import { NextResponse } from 'next/server';
import { getSupabaseServiceRole } from '@/lib/supabase-server';

/**
 * POST /api/auth/signup
 * Creates a new user with auto-confirmed email (no email verification required).
 * The handle_new_user trigger creates the public.users row automatically.
 * This route creates: organization + membership.
 */
export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServiceRole();

    // 1. Create the auth user with auto-confirmed email
    //    The handle_new_user trigger automatically inserts into public.users
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authError) {
      console.error('[signup] Auth error:', authError.message);
      return NextResponse.json(
        { error: authError.message },
        { status: 400 }
      );
    }

    const authUser = authData.user;

    // 2. Create default organization (no tenants table — orgs are top-level)
    const orgSlug = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-org';
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: `${email.split('@')[0]}'s Organization`,
        slug: orgSlug,
        plan: 'free',
      })
      .select()
      .single();

    if (orgError) {
      console.error('[signup] Org creation error:', orgError.message);
      return NextResponse.json(
        { error: 'Failed to create organization: ' + orgError.message },
        { status: 500 }
      );
    }

    // 3. Create membership (user_id = auth.uid, org_id = new org)
    //    memberships.user_id references the auth user UUID directly
    const { error: memberError } = await supabase
      .from('memberships')
      .insert({
        user_id: authUser.id,
        org_id: org.id,
        role: 'owner',
      });

    if (memberError) {
      console.error('[signup] Membership error:', memberError.message);
      // Non-fatal — user can still use the system but company creation will need fixing
    }

    return NextResponse.json({
      user: {
        id: authUser.id,
        email: authUser.email,
      },
      orgId: org.id,
    });
  } catch (err) {
    console.error('[signup] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

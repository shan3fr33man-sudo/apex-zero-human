import { NextResponse } from 'next/server';
import { getSupabaseServiceRole } from '@/lib/supabase-server';

/**
 * POST /api/auth/signup
 * Creates a new user with auto-confirmed email (no email verification required).
 * Also creates the tenant, organization, user record, and membership.
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

    // 2. Create default tenant
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .insert({
        name: 'Default',
        slug: `tenant-${authUser.id.slice(0, 8)}`,
      })
      .select()
      .single();

    if (tenantError) {
      console.error('[signup] Tenant creation error:', tenantError.message);
      // Don't fail signup — tenant/org can be created during onboarding
    }

    // 3. Create default organization
    let org = null;
    if (tenant) {
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .insert({
          tenant_id: tenant.id,
          name: 'My Organization',
          slug: `org-${authUser.id.slice(0, 8)}`,
        })
        .select()
        .single();

      if (orgError) {
        console.error('[signup] Org creation error:', orgError.message);
      } else {
        org = orgData;
      }
    }

    // 4. Create user record linked to auth user
    const { data: userRecord, error: userError } = await supabase
      .from('users')
      .insert({
        auth_id: authUser.id,
        email: authUser.email!,
        role: 'owner',
      })
      .select()
      .single();

    if (userError) {
      console.error('[signup] User record error:', userError.message);
    }

    // 5. Create membership (user → org)
    if (org && userRecord) {
      const { error: memberError } = await supabase
        .from('memberships')
        .insert({
          user_id: userRecord.id,
          org_id: org.id,
          role: 'owner',
        });

      if (memberError) {
        console.error('[signup] Membership error:', memberError.message);
      }
    }

    return NextResponse.json({
      user: {
        id: authUser.id,
        email: authUser.email,
      },
      orgId: org?.id ?? null,
    });
  } catch (err) {
    console.error('[signup] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

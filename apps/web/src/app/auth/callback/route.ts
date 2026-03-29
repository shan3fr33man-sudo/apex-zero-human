import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * GET /auth/callback
 * Handles the OAuth redirect from Supabase (Google, GitHub, etc.)
 * Exchanges the auth code for a session, then ensures org + membership exist.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  const cookieStore = await cookies();

  // Create a Supabase client that can set cookies (for the session)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options as never);
          });
        },
      },
    }
  );

  // Exchange the code for a session
  const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

  if (sessionError || !sessionData.user) {
    console.error('[auth/callback] Code exchange error:', sessionError?.message);
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const user = sessionData.user;

  // For OAuth users, ensure org + membership exist (signup route isn't used for OAuth)
  try {
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Check if user already has a membership
    const { data: existing } = await serviceClient
      .from('memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (!existing) {
      // First-time OAuth user — check for orphaned orgs (orgs with no members)
      // This handles the case where seed data created an org but no user existed yet
      const { data: orphanedOrgs } = await serviceClient.rpc('find_orphaned_orgs');

      let orgId: string | null = null;

      if (orphanedOrgs && orphanedOrgs.length > 0) {
        // Link user to the first orphaned org as owner
        orgId = orphanedOrgs[0].id;
        console.log(`[auth/callback] Linking OAuth user ${user.email} to existing org ${orgId}`);
      } else {
        // No orphaned orgs — create a new one
        const email = user.email || 'user';
        const orgSlug = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-org';

        const { data: org, error: orgError } = await serviceClient
          .from('organizations')
          .insert({
            name: `${email.split('@')[0]}'s Organization`,
            slug: orgSlug,
            plan: 'free',
          })
          .select()
          .single();

        if (orgError) {
          console.error('[auth/callback] Org creation error:', orgError.message);
        } else {
          orgId = org.id;
          console.log(`[auth/callback] Created new org for OAuth user ${user.email}`);
        }
      }

      if (orgId) {
        const { error: memberError } = await serviceClient
          .from('memberships')
          .insert({
            user_id: user.id,
            org_id: orgId,
            role: 'owner',
          });

        if (memberError) {
          console.error('[auth/callback] Membership error:', memberError.message);
        } else {
          console.log(`[auth/callback] Created membership for OAuth user ${user.email}`);
        }
      }

      // Check if the org already has companies — if so, go to dashboard
      if (orgId) {
        const { count } = await serviceClient
          .from('companies')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId);

        if (count && count > 0) {
          return NextResponse.redirect(`${origin}/dashboard`);
        }
      }

      // No companies yet — send to onboarding
      return NextResponse.redirect(`${origin}/onboarding`);
    }
  } catch (err) {
    console.error('[auth/callback] Post-auth setup error:', err);
    // Don't block login — they can still reach the dashboard
  }

  return NextResponse.redirect(`${origin}${next}`);
}

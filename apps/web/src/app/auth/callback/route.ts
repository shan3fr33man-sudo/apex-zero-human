import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * GET /auth/callback
 * Handles the OAuth redirect from Supabase (Google, GitHub, etc.)
 * Exchanges the auth code for a session, then ensures user + org + membership exist.
 *
 * Live DB schema (verified 2026-04-02):
 *   users:         id (= auth.users.id), email, full_name, avatar_url, github_username, created_at
 *   organizations: id, name, slug, plan (default 'free'), plan_status (default 'active'), stripe fields, token fields
 *   memberships:   id, org_id, user_id, role, created_at
 *   NOTE: users.id IS the Supabase Auth UUID directly — no separate auth_id column.
 *   NOTE: organizations has NO tenant_id — it's a flat table.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  console.log('[auth/callback] Starting callback, code present:', !!code);

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  try {
    // cookies() is async in Next.js 14+ — must be awaited
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
          setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, options);
              });
            } catch (e) {
              // Cookie set can fail in edge cases (response already sent).
              // Session will still be established via the initial set.
              console.error('[auth/callback] Cookie set error:', e);
            }
          },
        },
      }
    );

    console.log('[auth/callback] Exchanging code for session...');

    // Exchange the code for a session
    const { data: sessionData, error: sessionError } =
      await supabase.auth.exchangeCodeForSession(code);

    if (sessionError || !sessionData.user) {
      console.error('[auth/callback] Code exchange error:', sessionError?.message);
      return NextResponse.redirect(`${origin}/login?error=auth_failed`);
    }

    const authUser = sessionData.user;
    console.log('[auth/callback] Session established for:', authUser.email);

    // --- Post-auth: ensure user row, org, and membership exist ---
    try {
      const serviceClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      );

      // Step 1: Ensure a users row exists (users.id = auth UUID directly)
      const { data: existingUser } = await serviceClient
        .from('users')
        .select('id')
        .eq('id', authUser.id)
        .single();

      if (!existingUser) {
        const { error: userError } = await serviceClient
          .from('users')
          .insert({
            id: authUser.id,
            email: authUser.email ?? '',
            full_name: authUser.user_metadata?.full_name ?? authUser.user_metadata?.name ?? null,
            avatar_url: authUser.user_metadata?.avatar_url ?? null,
          });

        if (userError) {
          console.error('[auth/callback] Failed to create user row:', userError.message);
          // Session is still valid — redirect and let them try again
          return NextResponse.redirect(`${origin}/login?error=user_setup_failed`);
        }
        console.log('[auth/callback] Created user row:', authUser.id);
      } else {
        console.log('[auth/callback] Existing user row found:', authUser.id);
      }

      // Step 2: Check if user already has a membership
      const { data: existingMembership } = await serviceClient
        .from('memberships')
        .select('org_id')
        .eq('user_id', authUser.id)
        .limit(1)
        .single();

      if (existingMembership) {
        console.log('[auth/callback] Existing membership found, redirecting to dashboard');
        return NextResponse.redirect(`${origin}/dashboard`);
      }

      // Step 3: First-time user — check for orphaned orgs (orgs with zero members)
      console.log('[auth/callback] No membership found, checking for orphaned orgs...');

      const { data: orphanedOrgs } = await serviceClient.rpc('find_orphaned_orgs');

      let orgId: string | null = null;

      if (orphanedOrgs && orphanedOrgs.length > 0) {
        orgId = orphanedOrgs[0].id;
        console.log(`[auth/callback] Linking to orphaned org ${orgId}`);
      } else {
        // Create a new organization for this user
        // plan defaults to 'free', plan_status defaults to 'active' via DB defaults
        const email = authUser.email || 'user';
        const baseName = email.split('@')[0];
        const slug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

        const { data: org, error: orgError } = await serviceClient
          .from('organizations')
          .insert({
            name: `${baseName}'s Organization`,
            slug: `${slug}-org-${Date.now()}`, // unique slug via timestamp
          })
          .select('id')
          .single();

        if (orgError || !org) {
          console.error('[auth/callback] Failed to create organization:', orgError?.message);
          return NextResponse.redirect(`${origin}/login?error=org_setup_failed`);
        }

        orgId = org.id;
        console.log(`[auth/callback] Created org ${orgId}`);
      }

      // Step 4: Create membership linking user to org
      if (orgId) {
        const { error: membershipError } = await serviceClient
          .from('memberships')
          .insert({ user_id: authUser.id, org_id: orgId, role: 'owner' });

        if (membershipError) {
          console.error('[auth/callback] Failed to create membership:', membershipError.message);
        } else {
          console.log('[auth/callback] Membership created');
        }

        // Check if org already has companies — if so, go to dashboard
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
    } catch (err) {
      console.error('[auth/callback] Post-auth setup error:', err);
    }

    // Fallback — session is set, redirect to requested page
    return NextResponse.redirect(`${origin}${next}`);
  } catch (err) {
    console.error('[auth/callback] Fatal error:', err);
    return NextResponse.redirect(`${origin}/login?error=callback_error`);
  }
}

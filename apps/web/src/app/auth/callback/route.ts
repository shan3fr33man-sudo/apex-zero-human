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

  console.log('[auth/callback] Starting callback, code present:', !!code);

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  // Build the response up-front so cookies can be written to it directly.
  // In Next 14 App Router GET handlers the cookies() store is read-only —
  // attempting to .set() on it throws and silently breaks the session.
  // The correct pattern is to mutate response.cookies.
  let response = NextResponse.redirect(`${origin}${next}`);

  try {
    const cookieStore = cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
            cookiesToSet.forEach(({ name, value, options }) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              response.cookies.set(name, value, options as any);
            });
          },
        },
      }
    );

    console.log('[auth/callback] Exchanging code for session...');
    const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

    if (sessionError || !sessionData.user) {
      console.error('[auth/callback] Code exchange error:', sessionError?.message);
      return NextResponse.redirect(`${origin}/login?error=auth_failed`);
    }

    const user = sessionData.user;
    console.log('[auth/callback] Session established for:', user.email);

    // For OAuth users, ensure org + membership exist
    try {
      const serviceClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      );

      // Check if user already has a membership (maybeSingle = no error on 0 rows)
      const { data: existing } = await serviceClient
        .from('memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (existing) {
        console.log('[auth/callback] Existing membership found, redirecting to dashboard');
        // Re-target the redirect while preserving the session cookies set above
        const dashResp = NextResponse.redirect(`${origin}/dashboard`);
        response.cookies.getAll().forEach((c) => dashResp.cookies.set(c.name, c.value, c));
        return dashResp;
      }

      // First-time OAuth user — check for orphaned orgs
      console.log('[auth/callback] No membership found, checking for orphaned orgs...');
      const { data: orphanedOrgs } = await serviceClient.rpc('find_orphaned_orgs');

      let orgId: string | null = null;

      if (orphanedOrgs && orphanedOrgs.length > 0) {
        orgId = orphanedOrgs[0].id;
        console.log(`[auth/callback] Linking to orphaned org ${orgId}`);
      } else {
        const email = user.email || 'user';
        const orgSlug = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-org-' + Date.now().toString(36);
        const { data: org, error: orgError } = await serviceClient
          .from('organizations')
          .insert({ name: `${email.split('@')[0]}'s Organization`, slug: orgSlug, plan: 'free' })
          .select()
          .single();
        if (!orgError && org) {
          orgId = org.id;
          console.log(`[auth/callback] Created new org ${orgId}`);
        } else if (orgError) {
          console.error('[auth/callback] Org create failed:', orgError.message);
        }
      }

      if (orgId) {
        await serviceClient.from('memberships').insert({ user_id: user.id, org_id: orgId, role: 'owner' });
        console.log('[auth/callback] Membership created');

        const { count } = await serviceClient
          .from('companies')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId);

        const target = count && count > 0 ? '/dashboard' : '/welcome';
        const finalResp = NextResponse.redirect(`${origin}${target}`);
        response.cookies.getAll().forEach((c) => finalResp.cookies.set(c.name, c.value, c));
        return finalResp;
      }

      const fallbackResp = NextResponse.redirect(`${origin}/welcome`);
      response.cookies.getAll().forEach((c) => fallbackResp.cookies.set(c.name, c.value, c));
      return fallbackResp;
    } catch (err) {
      console.error('[auth/callback] Post-auth setup error:', err);
      // Session cookies are already on `response` — fall through and return it
    }

    return response;
  } catch (err) {
    console.error('[auth/callback] Fatal error:', err);
    return NextResponse.redirect(`${origin}/login?error=callback_error`);
  }
}

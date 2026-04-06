import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

/**
 * GET /auth/callback
 * Handles the OAuth redirect from Supabase (Google, GitHub, etc.)
 * Exchanges the auth code for a session, then ensures user + org + membership exist.
 *
 * IMPORTANT: This route runs behind nginx reverse proxy. We must:
 *   1. Use x-forwarded-host/proto to build the correct redirect URL (not request.url which gives localhost:3000)
 *   2. Collect cookies and set them on the redirect response (not via cookieStore which conflicts with NextResponse.redirect)
 *
 * Live DB schema (verified 2026-04-02):
 *   users:         id (= auth.users.id), email, full_name, avatar_url, github_username, created_at
 *   organizations: id, name, slug, plan (default 'free'), plan_status (default 'active'), stripe fields, token fields
 *   memberships:   id, org_id, user_id, role, created_at
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') ?? '/dashboard';

  // Build the correct origin from forwarded headers (behind nginx proxy)
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https';
  const origin = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : requestUrl.origin;

  console.log('[auth/callback] Starting callback, code present:', !!code, 'origin:', origin);

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  try {
    // Collect cookies that supabase sets — we'll apply them to the redirect response
    const cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[] = [];

    // Parse incoming cookies from request header
    const cookieHeader = request.headers.get('cookie') ?? '';
    const requestCookies: { name: string; value: string }[] = cookieHeader
      .split(';')
      .filter(Boolean)
      .map((c) => {
        const [name, ...rest] = c.trim().split('=');
        return { name, value: rest.join('=') };
      });

    // Create a Supabase client that collects cookies (NOT using next/headers cookies())
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return requestCookies;
          },
          setAll(cookies: { name: string; value: string; options?: Record<string, unknown> }[]) {
            // Collect — don't try to set on cookieStore
            cookiesToSet.push(...cookies);
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
    let redirectTo = next;

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
        } else {
          console.log('[auth/callback] Created user row:', authUser.id);
        }
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
        redirectTo = '/dashboard';
      } else {
        // Step 3: First-time user — check for orphaned orgs
        console.log('[auth/callback] No membership found, checking for orphaned orgs...');

        const { data: orphanedOrgs } = await serviceClient.rpc('find_orphaned_orgs');

        let orgId: string | null = null;

        if (orphanedOrgs && orphanedOrgs.length > 0) {
          orgId = orphanedOrgs[0].id;
          console.log(`[auth/callback] Linking to orphaned org ${orgId}`);
        } else {
          const email = authUser.email || 'user';
          const baseName = email.split('@')[0];
          const slug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

          const { data: org, error: orgError } = await serviceClient
            .from('organizations')
            .insert({
              name: `${baseName}'s Organization`,
              slug: `${slug}-org-${Date.now()}`,
            })
            .select('id')
            .single();

          if (orgError || !org) {
            console.error('[auth/callback] Failed to create organization:', orgError?.message);
          } else {
            orgId = org.id;
            console.log(`[auth/callback] Created org ${orgId}`);
          }
        }

        // Step 4: Create membership
        if (orgId) {
          const { error: membershipError } = await serviceClient
            .from('memberships')
            .insert({ user_id: authUser.id, org_id: orgId, role: 'owner' });

          if (membershipError) {
            console.error('[auth/callback] Failed to create membership:', membershipError.message);
          } else {
            console.log('[auth/callback] Membership created');
          }

          // Check if org already has companies
          const { count } = await serviceClient
            .from('companies')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', orgId);

          redirectTo = count && count > 0 ? '/dashboard' : '/onboarding';
        } else {
          redirectTo = '/onboarding';
        }
      }
    } catch (err) {
      console.error('[auth/callback] Post-auth setup error:', err);
      // Session is still valid — continue to redirect
    }

    // Build redirect response and attach all collected cookies
    const redirectUrl = `${origin}${redirectTo}`;
    console.log('[auth/callback] Redirecting to:', redirectUrl);
    const response = NextResponse.redirect(redirectUrl);

    // Apply supabase session cookies to the redirect response
    for (const { name, value, options } of cookiesToSet) {
      response.cookies.set(name, value, {
        ...options,
        // Ensure cookies work over HTTPS
        secure: forwardedProto === 'https',
        sameSite: 'lax' as const,
        path: '/',
      });
    }

    return response;
  } catch (err) {
    console.error('[auth/callback] Fatal error:', err);
    return NextResponse.redirect(`${origin}/login?error=callback_error`);
  }
}

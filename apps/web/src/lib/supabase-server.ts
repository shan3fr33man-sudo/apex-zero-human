/**
 * Server-side Supabase clients for API routes.
 *
 * getSupabaseServiceRole() — bypasses RLS for internal admin operations
 * getAuthenticatedUser()   — extracts + validates user from JWT in cookie/header
 * requireOwnership()       — verifies user belongs to the org that owns a company
 */
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function getSupabaseServiceRole() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

/**
 * Get the authenticated user from the request cookies.
 * Returns null if not authenticated (caller should return 401).
 */
export async function getAuthenticatedUser(): Promise<{ id: string; email: string } | null> {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // Read-only in API routes — no-op
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  return { id: user.id, email: user.email ?? '' };
}

/**
 * Verify that the authenticated user owns (or is a member of) the organization
 * that contains the given company_id. Returns true if authorized.
 */
export async function requireOwnership(userId: string, companyId: string): Promise<boolean> {
  const supabase = getSupabaseServiceRole();

  // Get the company's org_id
  const { data: company } = await supabase
    .from('companies')
    .select('org_id')
    .eq('id', companyId)
    .single();

  if (!company?.org_id) return false;

  // Check if user is a member of that organization
  const { data: membership } = await supabase
    .from('memberships')
    .select('id')
    .eq('user_id', userId)
    .eq('org_id', company.org_id)
    .limit(1)
    .single();

  return !!membership;
}

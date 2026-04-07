import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client — bypasses RLS.
 * NEVER import this in client components or expose to the browser.
 *
 * Lazy-initialized so Next.js build-time page-data collection doesn't crash
 * when env vars aren't present. Real requests always have them.
 */
let _client: SupabaseClient | null = null;

function getAdmin(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase admin client unavailable: missing env vars');
  }
  _client = createClient(url, key);
  return _client;
}

export const adminSupabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getAdmin() as unknown as Record<string | symbol, unknown>;
    const value = client[prop];
    return typeof value === 'function' ? (value as Function).bind(client) : value;
  },
});

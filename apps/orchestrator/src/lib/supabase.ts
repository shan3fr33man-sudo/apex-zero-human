/**
 * Orchestrator Supabase Client
 * Uses SERVICE ROLE key — full database access.
 * This client is server-only. Never expose to client-side code.
 *
 * Note: We use an untyped client here because the Database type lives
 * in packages/db (outside rootDir). The full generic typing is applied
 * at the call site when needed, or via the generated types at build time.
 * In production, the turborepo build resolves @apex/db properly.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error(
        '[Supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
        'These are required for the orchestrator to function.'
      );
    }

    _client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return _client;
}

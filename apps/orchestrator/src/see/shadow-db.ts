/**
 * Shadow DB Client — Isolated Supabase connection for SEE.
 *
 * Uses SEE_SHADOW_SUPABASE_URL and SEE_SHADOW_SUPABASE_KEY environment
 * variables pointing to a completely separate Supabase project.
 * All reads/writes go to the `see_internal` schema only.
 *
 * NEVER connects to the production public schema.
 * NEVER exposes connection details to operator code.
 */
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('ShadowDB');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _shadowClient: SupabaseClient<any, any, any> | null = null;

/**
 * Get the shadow Supabase client for SEE-internal operations.
 * Returns null if SEE shadow credentials are not configured
 * (graceful degradation — SEE simply doesn't run).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getShadowClient(): SupabaseClient<any, any, any> | null {
  if (_shadowClient) return _shadowClient;

  const url = process.env.SEE_SHADOW_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SEE_SHADOW_SUPABASE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    log.warn('Shadow DB not configured — SEE will operate in dry-run mode');
    return null;
  }

  _shadowClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'see_internal' },
  });

  log.info('Shadow DB client initialized');
  return _shadowClient;
}

/**
 * Schema-prefixed table accessor for see_internal.
 * All SEE operations MUST go through this helper so they
 * stay in the correct schema even if the Supabase client
 * defaults change.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function seeTable(client: SupabaseClient<any, any, any>, table: string) {
  return client.from(table);
}

/**
 * Health check — verifies shadow DB connectivity.
 * Returns true if the connection works, false otherwise.
 * Never throws.
 */
export async function checkShadowHealth(): Promise<boolean> {
  try {
    const client = getShadowClient();
    if (!client) return false;

    // Try a lightweight query on any see_internal table
    const { error } = await seeTable(client, 'weekly_reports')
      .select('id')
      .limit(1);

    if (error) {
      log.warn('Shadow DB health check failed', { error: error.message });
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

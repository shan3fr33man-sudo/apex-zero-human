#!/usr/bin/env node
/**
 * reset-for-test.mjs
 *
 * Resets the stuck issue and agent states so the orchestrator
 * can pick up the issue on its next tick for a clean test run.
 *
 * Run from apps/orchestrator/ with: node -r dotenv/config ../../scripts/reset-for-test.mjs
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// 1. Reset all in_progress issues back to open
const { data: issues, error: issueErr } = await supabase
  .from('issues')
  .update({ status: 'open', locked_by: null, locked_at: null })
  .eq('status', 'in_progress')
  .select('id, title');

if (issueErr) console.error('Issue reset error:', issueErr.message);
else console.log('Reset issues:', issues?.length ?? 0, issues?.map(i => i.title));

// 2. Reset all working agents back to idle
const { data: agents, error: agentErr } = await supabase
  .from('agents')
  .update({ status: 'idle' })
  .eq('status', 'working')
  .select('id, name');

if (agentErr) console.error('Agent reset error:', agentErr.message);
else console.log('Reset agents:', agents?.length ?? 0, agents?.map(a => a.name));

// 3. Clear old heartbeat entries for clean run
const { count, error: hbErr } = await supabase
  .from('agent_heartbeats')
  .delete()
  .neq('state', 'HANDOFF_COMPLETE')
  .select('*', { count: 'exact', head: true });

if (hbErr) console.error('Heartbeat cleanup error:', hbErr.message);
else console.log('Cleared incomplete heartbeat entries:', count ?? 0);

console.log('\nDone! Orchestrator will pick up open issues on next tick.');

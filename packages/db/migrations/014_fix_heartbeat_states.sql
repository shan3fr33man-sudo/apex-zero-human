-- Migration 014: Add RESEARCH_COMPLETE to heartbeat state constraint
--
-- The heartbeat state machine in code (constants.ts, heartbeat.ts) includes
-- RESEARCH_COMPLETE as the 4th state, but the DB constraint from migration 011
-- was missing it. This caused CHECK constraint violations.

-- Drop the old constraint and add the corrected one
ALTER TABLE agent_heartbeats
  DROP CONSTRAINT IF EXISTS agent_heartbeats_state_check;

ALTER TABLE agent_heartbeats
  ADD CONSTRAINT agent_heartbeats_state_check
  CHECK (state IN (
    'IDENTITY_CONFIRMED',
    'MEMORY_LOADED',
    'PLAN_READ',
    'RESEARCH_COMPLETE',
    'ASSIGNMENT_CLAIMED',
    'EXECUTING',
    'HANDOFF_COMPLETE',
    'FAILED'
  ));

-- Add compound index for common heartbeat lookups
-- (agent checking current state, stall detector checking recent progress)
CREATE INDEX IF NOT EXISTS idx_agent_heartbeats_lookup
  ON agent_heartbeats(agent_id, issue_id, started_at DESC);

-- Add compound index for issue queue performance
CREATE INDEX IF NOT EXISTS idx_issues_queue
  ON issues(company_id, status, priority DESC);

-- Add compound index for memory cleanup
CREATE INDEX IF NOT EXISTS idx_agent_memories_cleanup
  ON agent_memories(agent_id, expires_at)
  WHERE expires_at IS NOT NULL;

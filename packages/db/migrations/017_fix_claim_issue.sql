-- Migration 017: Fix claim_issue for QA review flow
-- Applied 2026-04-02
--
-- Changes:
-- 1. Allow claiming 'in_review' issues (QA agents need this)
-- 2. Move conditions into UPDATE WHERE (defense-in-depth)
-- 3. Use GET DIAGNOSTICS for reliable row count check
-- 4. Use COALESCE on started_at to preserve original start time

CREATE OR REPLACE FUNCTION claim_issue(
  p_issue_id uuid,
  p_agent_id uuid
) RETURNS boolean AS $$
DECLARE
  v_lock_key bigint;
  v_locked boolean;
  v_rows_affected int;
BEGIN
  v_lock_key := ('x' || substr(p_issue_id::text, 1, 8))::bit(32)::bigint;
  v_locked := pg_try_advisory_xact_lock(v_lock_key);

  IF NOT v_locked THEN
    RETURN false;
  END IF;

  UPDATE issues SET
    status = 'in_progress',
    locked_by = p_agent_id,
    locked_at = now(),
    assigned_to = p_agent_id,
    started_at = COALESCE(started_at, now())
  WHERE id = p_issue_id
    AND status IN ('open', 'in_review')
    AND locked_by IS NULL;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  RETURN v_rows_affected > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

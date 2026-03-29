-- Migration 004: Issues, dependencies, comments
-- Issues are the atomic units of work assigned to agents.

CREATE TABLE issues (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title                   text NOT NULL,
  description             text,
  success_condition       text,
  status                  text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'in_review', 'completed', 'blocked', 'human_review_required')),
  priority                integer NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
  assigned_to             uuid REFERENCES agents(id) ON DELETE SET NULL,
  locked_by               uuid REFERENCES agents(id) ON DELETE SET NULL,
  locked_at               timestamptz,
  stall_threshold_minutes integer DEFAULT 60,
  quality_score           numeric(5,2),
  tokens_used             bigint DEFAULT 0,
  parent_issue_id         uuid REFERENCES issues(id) ON DELETE SET NULL,
  metadata                jsonb DEFAULT '{}',
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "issues_tenant_isolation" ON issues FOR ALL
  USING (company_id IN (
    SELECT c.id FROM companies c
    JOIN organizations o ON o.id = c.org_id
    JOIN memberships m ON m.org_id = o.id
    WHERE m.user_id = auth.uid()
  ));

-- Issue dependencies: issue cannot start until blocked_by_id is completed
CREATE TABLE issue_dependencies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id        uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  blocked_by_id   uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(issue_id, blocked_by_id),
  CHECK (issue_id != blocked_by_id)
);

ALTER TABLE issue_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "issue_dependencies_tenant_isolation" ON issue_dependencies FOR ALL
  USING (issue_id IN (
    SELECT i.id FROM issues i
    JOIN companies c ON c.id = i.company_id
    JOIN organizations o ON o.id = c.org_id
    JOIN memberships m ON m.org_id = o.id
    WHERE m.user_id = auth.uid()
  ));

-- Issue comments: agent work log, handoffs, artifacts
CREATE TABLE issue_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id    uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  agent_id    uuid REFERENCES agents(id) ON DELETE SET NULL,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  content     text NOT NULL,
  comment_type text NOT NULL DEFAULT 'progress'
    CHECK (comment_type IN ('progress', 'handoff', 'artifact', 'review', 'system')),
  metadata    jsonb DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE issue_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "issue_comments_tenant_isolation" ON issue_comments FOR ALL
  USING (issue_id IN (
    SELECT i.id FROM issues i
    JOIN companies c ON c.id = i.company_id
    JOIN organizations o ON o.id = c.org_id
    JOIN memberships m ON m.org_id = o.id
    WHERE m.user_id = auth.uid()
  ));

-- Advisory lock function for claiming issues (prevent double-agent conflict)
CREATE OR REPLACE FUNCTION claim_issue(
  p_issue_id uuid,
  p_agent_id uuid
) RETURNS boolean AS $$
DECLARE
  v_lock_key bigint;
  v_locked boolean;
BEGIN
  -- Convert UUID to bigint for advisory lock key
  v_lock_key := ('x' || substr(p_issue_id::text, 1, 8))::bit(32)::bigint;

  -- Try to acquire advisory lock (non-blocking)
  v_locked := pg_try_advisory_xact_lock(v_lock_key);

  IF NOT v_locked THEN
    RETURN false;
  END IF;

  -- Verify issue is still unclaimed
  IF EXISTS (
    SELECT 1 FROM issues
    WHERE id = p_issue_id
    AND status = 'open'
    AND locked_by IS NULL
  ) THEN
    UPDATE issues SET
      status = 'in_progress',
      locked_by = p_agent_id,
      locked_at = now(),
      assigned_to = p_agent_id
    WHERE id = p_issue_id;
    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Indexes
CREATE INDEX idx_issues_company_id ON issues(company_id);
CREATE INDEX idx_issues_status ON issues(status);
CREATE INDEX idx_issues_assigned_to ON issues(assigned_to);
CREATE INDEX idx_issues_priority ON issues(priority DESC);
CREATE INDEX idx_issues_locked_by ON issues(locked_by) WHERE locked_by IS NOT NULL;
CREATE INDEX idx_issue_comments_issue_id ON issue_comments(issue_id);

CREATE TRIGGER set_updated_at_issues BEFORE UPDATE ON issues FOR EACH ROW EXECUTE FUNCTION update_updated_at();

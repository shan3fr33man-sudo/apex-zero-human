-- Migration 003: Agents table + hierarchy
-- Agents are AI employees within a company. They reference companies.

CREATE TABLE agents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                text NOT NULL,
  role                text NOT NULL,
  persona             text, -- Full system prompt text
  model_tier          text NOT NULL DEFAULT 'ROUTINE' CHECK (model_tier IN ('STRATEGIC', 'TECHNICAL', 'ROUTINE')),
  reports_to          uuid REFERENCES agents(id) ON DELETE SET NULL,
  status              text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'working', 'paused', 'stalled', 'terminated')),
  heartbeat_config    jsonb DEFAULT '{}',
  custom_rules        text[] DEFAULT '{}',
  installed_skills    text[] DEFAULT '{}',
  avg_quality_score   numeric(5,2),
  total_tokens_used   bigint DEFAULT 0,
  total_tasks_done    integer DEFAULT 0,
  current_issue_id    uuid, -- Set when agent is actively working
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- Tenant isolation for agents
CREATE POLICY "agents_tenant_isolation" ON agents FOR ALL
  USING (company_id IN (
    SELECT c.id FROM companies c
    JOIN organizations o ON o.id = c.org_id
    JOIN memberships m ON m.org_id = o.id
    WHERE m.user_id = auth.uid()
  ));

-- Auto-update trigger
CREATE TRIGGER set_updated_at_agents BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Index for fast company-based lookups
CREATE INDEX idx_agents_company_id ON agents(company_id);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_role ON agents(role);

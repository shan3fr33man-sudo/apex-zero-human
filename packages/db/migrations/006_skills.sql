-- Migration 006: Skills registry + agent_skills join table
-- Tracks installed skills per company and which agents can use them.

CREATE TABLE skills (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  source_url      text,
  commit_sha      text,
  version         text NOT NULL DEFAULT '1.0.0',
  permissions     text[] NOT NULL DEFAULT '{}',
  safety_score    integer DEFAULT 0 CHECK (safety_score BETWEEN 0 AND 100),
  verified        boolean DEFAULT false,
  is_builtin      boolean DEFAULT false,
  config          jsonb DEFAULT '{}', -- Encrypted credentials injected at runtime, not stored here
  enabled         boolean DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, name)
);

ALTER TABLE skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "skills_tenant_isolation" ON skills FOR ALL
  USING (company_id IN (
    SELECT c.id FROM companies c
    JOIN organizations o ON o.id = c.org_id
    JOIN memberships m ON m.org_id = o.id
    WHERE m.user_id = auth.uid()
  ));

-- Agent-skill assignments
CREATE TABLE agent_skills (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  skill_id    uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agent_id, skill_id)
);

ALTER TABLE agent_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_skills_tenant_isolation" ON agent_skills FOR ALL
  USING (agent_id IN (
    SELECT a.id FROM agents a
    JOIN companies c ON c.id = a.company_id
    JOIN organizations o ON o.id = c.org_id
    JOIN memberships m ON m.org_id = o.id
    WHERE m.user_id = auth.uid()
  ));

-- Indexes
CREATE INDEX idx_skills_company_id ON skills(company_id);
CREATE INDEX idx_agent_skills_agent_id ON agent_skills(agent_id);
CREATE INDEX idx_agent_skills_skill_id ON agent_skills(skill_id);

CREATE TRIGGER set_updated_at_skills BEFORE UPDATE ON skills FOR EACH ROW EXECUTE FUNCTION update_updated_at();

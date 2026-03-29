-- Migration 010: Audit log (append-only, no delete ever)
-- Every agent action that mutates external state gets logged here.
-- This table has NO UPDATE or DELETE policies — append only forever.

CREATE TABLE audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid REFERENCES companies(id),
  agent_id        uuid REFERENCES agents(id),
  user_id         uuid REFERENCES users(id),
  action          text NOT NULL,
  entity_type     text NOT NULL,
  entity_id       uuid,
  before_state    jsonb,
  after_state     jsonb,
  reversible      boolean DEFAULT false,
  reversed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- ONLY SELECT allowed for operators. Never INSERT from client. Never UPDATE. Never DELETE.
CREATE POLICY "operators_read_own_audit" ON audit_log FOR SELECT
  USING (company_id IN (
    SELECT c.id FROM companies c
    JOIN organizations o ON o.id = c.org_id
    JOIN memberships m ON m.org_id = o.id
    WHERE m.user_id = auth.uid()
  ));

-- INSERT done ONLY via service role in orchestrator. Never from client.
-- No INSERT, UPDATE, or DELETE policies for authenticated users.

-- Indexes
CREATE INDEX idx_audit_log_company_id ON audit_log(company_id);
CREATE INDEX idx_audit_log_agent_id ON audit_log(agent_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);

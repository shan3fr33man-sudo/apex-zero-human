-- Migration 011: Vertical template support tables
-- inbox_items, agent_performance, agent_heartbeats

-- Inbox items: human-in-the-loop approval queue
CREATE TABLE inbox_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_type   text NOT NULL CHECK (item_type IN (
    'HIRE_APPROVAL', 'BUDGET_ALERT', 'STALL_ALERT', 'PERSONA_PATCH',
    'IRREVERSIBLE_ACTION', 'HUMAN_REVIEW_REQUIRED', 'SYSTEM_ALERT'
  )),
  title       text NOT NULL,
  description text,
  payload     jsonb DEFAULT '{}',
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'dismissed')),
  resolved_by uuid REFERENCES users(id),
  resolved_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inbox_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inbox_items_tenant_isolation" ON inbox_items FOR ALL
  USING (company_id IN (
    SELECT c.id FROM companies c
    JOIN organizations o ON o.id = c.org_id
    JOIN memberships m ON m.org_id = o.id
    WHERE m.user_id = auth.uid()
  ));

-- Agent performance tracking (populated by Eval Engineer)
CREATE TABLE agent_performance (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id        uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  issue_id        uuid REFERENCES issues(id) ON DELETE SET NULL,
  quality_score   numeric(5,2) NOT NULL CHECK (quality_score BETWEEN 0 AND 100),
  evaluation_notes text,
  evaluator_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  period_start    timestamptz,
  period_end      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE agent_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_performance_tenant_isolation" ON agent_performance FOR ALL
  USING (company_id IN (
    SELECT c.id FROM companies c
    JOIN organizations o ON o.id = c.org_id
    JOIN memberships m ON m.org_id = o.id
    WHERE m.user_id = auth.uid()
  ));

-- Agent heartbeats: tracks progression through heartbeat state machine
CREATE TABLE agent_heartbeats (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  issue_id        uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  state           text NOT NULL CHECK (state IN (
    'IDENTITY_CONFIRMED', 'MEMORY_LOADED', 'PLAN_READ',
    'ASSIGNMENT_CLAIMED', 'EXECUTING', 'HANDOFF_COMPLETE', 'FAILED'
  )),
  error_message   text,
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

ALTER TABLE agent_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_heartbeats_tenant_isolation" ON agent_heartbeats FOR ALL
  USING (agent_id IN (
    SELECT a.id FROM agents a
    JOIN companies c ON c.id = a.company_id
    JOIN organizations o ON o.id = c.org_id
    JOIN memberships m ON m.org_id = o.id
    WHERE m.user_id = auth.uid()
  ));

-- Indexes
CREATE INDEX idx_inbox_items_company_id ON inbox_items(company_id);
CREATE INDEX idx_inbox_items_status ON inbox_items(status) WHERE status = 'pending';
CREATE INDEX idx_inbox_items_type ON inbox_items(item_type);

CREATE INDEX idx_agent_performance_agent_id ON agent_performance(agent_id);
CREATE INDEX idx_agent_performance_company_id ON agent_performance(company_id);

CREATE INDEX idx_agent_heartbeats_agent_id ON agent_heartbeats(agent_id);
CREATE INDEX idx_agent_heartbeats_issue_id ON agent_heartbeats(issue_id);
CREATE INDEX idx_agent_heartbeats_state ON agent_heartbeats(state);

-- Notify on new inbox items (for real-time dashboard updates)
CREATE OR REPLACE FUNCTION notify_inbox_item()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('apex_inbox', json_build_object(
    'id', NEW.id,
    'company_id', NEW.company_id,
    'item_type', NEW.item_type,
    'title', NEW.title
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_inbox_item_insert
  AFTER INSERT ON inbox_items
  FOR EACH ROW
  EXECUTE FUNCTION notify_inbox_item();

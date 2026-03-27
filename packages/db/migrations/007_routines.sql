-- Migration 007: Routines + triggers
-- Routines are either scheduled (cron) or reactive (event-triggered).

CREATE TABLE routines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            text NOT NULL,
  routine_type    text NOT NULL CHECK (routine_type IN ('SCHEDULED', 'REACTIVE')),
  -- Scheduled fields
  cron_expr       text, -- Cron expression for scheduled routines
  next_run_at     timestamptz,
  last_run_at     timestamptz,
  -- Reactive fields
  event_pattern   text, -- Wildcard pattern for event matching (e.g. 'missed_*')
  -- Shared fields
  assigned_to_role text NOT NULL,
  issue_template  jsonb NOT NULL DEFAULT '{}', -- Template for auto-created issues
  enabled         boolean DEFAULT true,
  run_count       integer DEFAULT 0,
  last_status     text CHECK (last_status IN ('success', 'failed', 'running', NULL)),
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE routines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "routines_tenant_isolation" ON routines FOR ALL
  USING (company_id IN (
    SELECT c.id FROM companies c
    JOIN organizations o ON o.id = c.org_id
    JOIN memberships m ON m.org_id = o.id
    WHERE m.user_id = auth.uid()
  ));

-- Routine execution history
CREATE TABLE routine_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id  uuid NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  issue_id    uuid REFERENCES issues(id) ON DELETE SET NULL,
  status      text NOT NULL CHECK (status IN ('success', 'failed', 'running')),
  tokens_used bigint DEFAULT 0,
  error       text,
  started_at  timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE routine_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "routine_runs_tenant_isolation" ON routine_runs FOR ALL
  USING (company_id IN (
    SELECT c.id FROM companies c
    JOIN organizations o ON o.id = c.org_id
    JOIN memberships m ON m.org_id = o.id
    WHERE m.user_id = auth.uid()
  ));

-- Indexes
CREATE INDEX idx_routines_company_id ON routines(company_id);
CREATE INDEX idx_routines_type ON routines(routine_type);
CREATE INDEX idx_routines_next_run ON routines(next_run_at) WHERE enabled = true AND routine_type = 'SCHEDULED';
CREATE INDEX idx_routines_event_pattern ON routines(event_pattern) WHERE enabled = true AND routine_type = 'REACTIVE';
CREATE INDEX idx_routine_runs_routine_id ON routine_runs(routine_id);

CREATE TRIGGER set_updated_at_routines BEFORE UPDATE ON routines FOR EACH ROW EXECUTE FUNCTION update_updated_at();

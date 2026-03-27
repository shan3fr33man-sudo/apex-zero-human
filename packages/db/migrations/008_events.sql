-- Migration 008: Event bus table
-- Events are fired by skills/webhooks and consumed by reactive routines.
-- Uses Postgres LISTEN/NOTIFY for real-time processing.

CREATE TABLE events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_type  text NOT NULL,
  source      text NOT NULL, -- e.g. 'ringcentral', 'smartmoving', 'webhook', 'agent'
  payload     jsonb NOT NULL DEFAULT '{}',
  processed   boolean DEFAULT false,
  processed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_tenant_isolation" ON events FOR ALL
  USING (company_id IN (
    SELECT c.id FROM companies c
    JOIN organizations o ON o.id = c.org_id
    JOIN memberships m ON m.org_id = o.id
    WHERE m.user_id = auth.uid()
  ));

-- Trigger to notify the orchestrator when a new event is inserted
CREATE OR REPLACE FUNCTION notify_apex_event()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('apex_events', json_build_object(
    'id', NEW.id,
    'company_id', NEW.company_id,
    'event_type', NEW.event_type,
    'payload', NEW.payload
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_event_insert
  AFTER INSERT ON events
  FOR EACH ROW
  EXECUTE FUNCTION notify_apex_event();

-- Indexes
CREATE INDEX idx_events_company_id ON events(company_id);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_unprocessed ON events(company_id, event_type) WHERE processed = false;
CREATE INDEX idx_events_created_at ON events(created_at DESC);

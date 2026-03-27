-- Migration 009: Token spend log + budget enforcement
-- Tracks every LLM API call's token usage and cost.

CREATE TABLE token_spend_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id        uuid REFERENCES agents(id) ON DELETE SET NULL,
  issue_id        uuid REFERENCES issues(id) ON DELETE SET NULL,
  model           text NOT NULL,
  input_tokens    integer NOT NULL DEFAULT 0,
  output_tokens   integer NOT NULL DEFAULT 0,
  total_tokens    integer GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
  cost_usd        numeric(10,6),
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE token_spend_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "token_spend_log_tenant_isolation" ON token_spend_log FOR SELECT
  USING (company_id IN (
    SELECT c.id FROM companies c
    JOIN organizations o ON o.id = c.org_id
    JOIN memberships m ON m.org_id = o.id
    WHERE m.user_id = auth.uid()
  ));

-- Only service role inserts token logs — never client
-- No INSERT/UPDATE/DELETE policies for anon/authenticated users

-- Indexes
CREATE INDEX idx_token_spend_company_id ON token_spend_log(company_id);
CREATE INDEX idx_token_spend_agent_id ON token_spend_log(agent_id);
CREATE INDEX idx_token_spend_created_at ON token_spend_log(created_at DESC);
CREATE INDEX idx_token_spend_model ON token_spend_log(model);

-- Daily aggregation view for the spend dashboard
CREATE OR REPLACE VIEW daily_token_spend AS
SELECT
  company_id,
  date_trunc('day', created_at) AS day,
  model,
  SUM(input_tokens) AS total_input_tokens,
  SUM(output_tokens) AS total_output_tokens,
  SUM(input_tokens + output_tokens) AS total_tokens,
  SUM(cost_usd) AS total_cost_usd,
  COUNT(*) AS api_calls
FROM token_spend_log
GROUP BY company_id, date_trunc('day', created_at), model;

-- Per-agent aggregation view
CREATE OR REPLACE VIEW agent_token_spend AS
SELECT
  company_id,
  agent_id,
  model,
  SUM(input_tokens) AS total_input_tokens,
  SUM(output_tokens) AS total_output_tokens,
  SUM(input_tokens + output_tokens) AS total_tokens,
  SUM(cost_usd) AS total_cost_usd,
  COUNT(*) AS api_calls
FROM token_spend_log
GROUP BY company_id, agent_id, model;

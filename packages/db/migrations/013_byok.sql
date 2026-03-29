-- Migration 013: Bring Your Own Key (BYOK)
-- Every tenant must provide their own Claude API key.
-- APEX never uses its own key for tenant agent runs.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS claude_api_key_encrypted    text,
  ADD COLUMN IF NOT EXISTS openrouter_api_key_encrypted text,
  ADD COLUMN IF NOT EXISTS byok_verified               boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS byok_verified_at             timestamptz,
  ADD COLUMN IF NOT EXISTS byok_last_error              text;

-- Also add plan columns for Feature 2 (freemium gating)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS plan                text NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'starter', 'professional', 'enterprise')),
  ADD COLUMN IF NOT EXISTS plan_status         text DEFAULT 'active'
    CHECK (plan_status IN ('active', 'trialing', 'past_due', 'canceled')),
  ADD COLUMN IF NOT EXISTS stripe_customer_id  text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS trial_ends_at       timestamptz,
  ADD COLUMN IF NOT EXISTS plan_changed_at     timestamptz;

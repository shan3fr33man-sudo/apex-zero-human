-- Migration 001: Foundation tables
-- tenants, organizations, users, companies, memberships
-- Run first. All other tables reference these.

-- Tenants: white-label resellers who use APEX for their clients
CREATE TABLE tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  domain      text,
  logo_url    text,
  settings    jsonb DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- Organizations: client companies within a tenant
CREATE TABLE organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  slug        text NOT NULL,
  settings    jsonb DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, slug)
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Users: human operators who log in to the dashboard
CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id         uuid UNIQUE, -- Supabase Auth user ID
  email           text NOT NULL UNIQUE,
  full_name       text,
  avatar_url      text,
  role            text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  onboarded       boolean DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Memberships: join table between users and organizations
CREATE TABLE memberships (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, org_id)
);

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

-- Companies: zero-human AI companies within an organization
CREATE TABLE companies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  slug            text NOT NULL,
  goal            text,
  brand_guide_url text,
  template_id     text,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'suspended')),
  token_budget    bigint NOT NULL DEFAULT 1000000,
  tokens_used     bigint NOT NULL DEFAULT 0,
  settings        jsonb DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, slug)
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- Token budget check + deduction (atomic RPC)
CREATE OR REPLACE FUNCTION check_and_deduct_tokens(
  p_company_id uuid,
  p_tokens_needed bigint
) RETURNS boolean AS $$
DECLARE
  v_budget bigint;
  v_used bigint;
BEGIN
  SELECT token_budget, tokens_used INTO v_budget, v_used
  FROM companies WHERE id = p_company_id FOR UPDATE;

  IF (v_used + p_tokens_needed) > v_budget THEN
    RETURN false;
  END IF;

  UPDATE companies SET tokens_used = tokens_used + p_tokens_needed
  WHERE id = p_company_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_tenants BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at_organizations BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at_users BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at_companies BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at();

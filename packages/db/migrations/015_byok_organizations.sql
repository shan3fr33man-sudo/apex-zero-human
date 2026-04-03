-- Migration 015: Add BYOK columns to organizations table
--
-- Migration 013 added BYOK to tenants, but key-vault.ts resolves keys via
-- company → organization (not tenant). This adds the columns to organizations
-- so the actual code path works.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS api_key_encrypted          text,
  ADD COLUMN IF NOT EXISTS openrouter_api_key_encrypted text,
  ADD COLUMN IF NOT EXISTS byok_verified              boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS byok_verified_at           timestamptz,
  ADD COLUMN IF NOT EXISTS byok_last_error            text;

-- Make audit_log.company_id NOT NULL for tenant isolation
-- (new records only — existing NULLs are grandfathered)
-- We can't ALTER to NOT NULL if existing rows have NULL, so add a check constraint instead
ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_company_required
  CHECK (company_id IS NOT NULL)
  NOT VALID; -- NOT VALID = don't check existing rows, only new inserts

-- Validate the constraint in the background (non-blocking)
-- ALTER TABLE audit_log VALIDATE CONSTRAINT audit_log_company_required;

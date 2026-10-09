-- Migration 016: Auth callback fixes
-- Applied 2026-04-02 as two Supabase migrations:
--   add_memberships_org_id_index
--
-- NOTE: find_orphaned_orgs RPC already existed in the DB.
-- NOTE: users.auth_id column does not exist on live — users.id IS the auth UUID.
-- NOTE: organizations has no tenant_id on live — it's a flat table with plan/plan_status.
-- The auth callback route.ts has been rewritten to match the live schema.

-- Index: speed up orphan check and membership lookups by org
CREATE INDEX IF NOT EXISTS idx_memberships_org_id ON memberships(org_id);

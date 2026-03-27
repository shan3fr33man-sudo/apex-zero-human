-- Migration 002: RLS policies for all foundation tables
-- Tenant isolation: users can only see data belonging to orgs they are members of.

-- Tenants: users see tenants their orgs belong to
CREATE POLICY "tenants_read_via_membership" ON tenants FOR SELECT
  USING (id IN (
    SELECT o.tenant_id FROM organizations o
    JOIN memberships m ON m.org_id = o.id
    WHERE m.user_id = auth.uid()
  ));

-- Organizations: users see their own orgs
CREATE POLICY "organizations_read_own" ON organizations FOR SELECT
  USING (id IN (
    SELECT m.org_id FROM memberships m
    WHERE m.user_id = auth.uid()
  ));

CREATE POLICY "organizations_insert_owner" ON organizations FOR INSERT
  WITH CHECK (tenant_id IN (
    SELECT o.tenant_id FROM organizations o
    JOIN memberships m ON m.org_id = o.id
    WHERE m.user_id = auth.uid() AND m.role IN ('owner', 'admin')
  ));

CREATE POLICY "organizations_update_admin" ON organizations FOR UPDATE
  USING (id IN (
    SELECT m.org_id FROM memberships m
    WHERE m.user_id = auth.uid() AND m.role IN ('owner', 'admin')
  ));

-- Users: users see themselves and members of their orgs
CREATE POLICY "users_read_self" ON users FOR SELECT
  USING (auth_id = auth.uid());

CREATE POLICY "users_read_org_members" ON users FOR SELECT
  USING (id IN (
    SELECT m2.user_id FROM memberships m1
    JOIN memberships m2 ON m2.org_id = m1.org_id
    WHERE m1.user_id = auth.uid()
  ));

CREATE POLICY "users_update_self" ON users FOR UPDATE
  USING (auth_id = auth.uid());

-- Memberships: users see memberships in their orgs
CREATE POLICY "memberships_read_own_org" ON memberships FOR SELECT
  USING (org_id IN (
    SELECT m.org_id FROM memberships m
    WHERE m.user_id = auth.uid()
  ));

CREATE POLICY "memberships_insert_admin" ON memberships FOR INSERT
  WITH CHECK (org_id IN (
    SELECT m.org_id FROM memberships m
    WHERE m.user_id = auth.uid() AND m.role IN ('owner', 'admin')
  ));

CREATE POLICY "memberships_delete_admin" ON memberships FOR DELETE
  USING (org_id IN (
    SELECT m.org_id FROM memberships m
    WHERE m.user_id = auth.uid() AND m.role IN ('owner', 'admin')
  ));

-- Companies: tenant isolation via org membership
CREATE POLICY "companies_tenant_isolation" ON companies FOR ALL
  USING (org_id IN (
    SELECT m.org_id FROM memberships m
    WHERE m.user_id = auth.uid()
  ));

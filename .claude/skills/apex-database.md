---
name: apex-database
description: >
  Use this skill for ALL Supabase work in APEX — schema design, migrations, RLS policies,
  pgvector setup, TypeScript type generation, and query patterns. Triggers: any mention of
  "database", "migration", "table", "RLS", "Supabase", "schema", "SQL", "query", "pgvector",
  "vector embeddings", or any data modeling task. ALWAYS read this skill before touching
  any database-related code. Never create a table without enabling RLS immediately after.
---

# APEX Database Skill

## Non-Negotiable Rules

- Every `CREATE TABLE` is IMMEDIATELY followed by `ENABLE ROW LEVEL SECURITY`
- Every table with `company_id` gets a tenant isolation policy
- The `see_internal` schema is NEVER exposed to the public schema
- The `audit_log` table has NO DELETE or UPDATE policies — append only forever
- Run `npx supabase gen types typescript` after EVERY migration

---

## Migration Execution Order

Run in this exact order. Never skip. Never reorder.

```
001_foundation.sql      — tenants, organizations, users, companies
002_rls.sql             — RLS on all foundation tables
003_agents.sql          — agents table + hierarchy
004_issues.sql          — issues, dependencies, comments
005_memory.sql          — agent_memories + pgvector extension
006_skills.sql          — skills registry + agent_skills join
007_routines.sql        — routines + triggers
008_events.sql          — event bus table
009_token_tracking.sql  — token_spend_log + budget enforcement
010_audit.sql           — audit_log (append-only)
011_vertical_templates.sql — inbox_items, agent_performance, heartbeats
012_see_internal.sql    — see_internal schema (hidden, separate schema)
```

---

## Schema Tier Hierarchy

```
tenants (white-label resellers)
  └── organizations (their client companies)
        └── companies (zero-human AI companies)
              └── agents (AI agents within a company)
                    └── issues (atomic units of work)
                          └── issue_comments (handoffs, artifacts)
```

---

## Critical Table Definitions

### Token Budget Enforcement
```sql
-- companies table MUST have these columns
token_budget    bigint NOT NULL DEFAULT 1000000,
tokens_used     bigint NOT NULL DEFAULT 0,

-- RPC function for atomic budget check + deduction
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
```

### Issue Advisory Locks (prevent double-agent conflict)
```sql
-- Use Postgres advisory locks for issue claiming
-- In the orchestrator, ALWAYS use this pattern:
CREATE OR REPLACE FUNCTION claim_issue(
  p_issue_id uuid,
  p_agent_id uuid
) RETURNS boolean AS $$
DECLARE
  v_lock_key bigint;
  v_locked boolean;
BEGIN
  -- Convert UUID to bigint for advisory lock key
  v_lock_key := ('x' || substr(p_issue_id::text, 1, 8))::bit(32)::bigint;
  
  -- Try to acquire advisory lock (non-blocking)
  v_locked := pg_try_advisory_xact_lock(v_lock_key);
  
  IF NOT v_locked THEN
    RETURN false;
  END IF;
  
  -- Verify issue is still unclaimed
  IF EXISTS (
    SELECT 1 FROM issues 
    WHERE id = p_issue_id 
    AND status = 'open' 
    AND locked_by IS NULL
  ) THEN
    UPDATE issues SET
      status = 'in_progress',
      locked_by = p_agent_id,
      locked_at = now(),
      assigned_to = p_agent_id
    WHERE id = p_issue_id;
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### pgvector Setup
```sql
-- Enable pgvector extension (run ONCE in migration 005)
CREATE EXTENSION IF NOT EXISTS vector;

-- agent_memories with vector column
CREATE TABLE agent_memories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  memory_type     text NOT NULL CHECK (memory_type IN ('identity','plan','learning','rule','context')),
  content         text NOT NULL,
  embedding       vector(1536),   -- OpenAI/Claude embedding dimension
  relevance_score numeric(5,4) DEFAULT 1.0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz
);

-- Vector similarity search index
CREATE INDEX ON agent_memories USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Semantic memory retrieval function
CREATE OR REPLACE FUNCTION search_agent_memories(
  p_agent_id uuid,
  p_query_embedding vector(1536),
  p_limit int DEFAULT 10
) RETURNS TABLE(id uuid, content text, memory_type text, similarity float) AS $$
  SELECT id, content, memory_type,
    1 - (embedding <=> p_query_embedding) AS similarity
  FROM agent_memories
  WHERE agent_id = p_agent_id
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY embedding <=> p_query_embedding
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;
```

### Audit Log (Append-Only)
```sql
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
```

---

## RLS Template (Apply to Every Table with company_id)

```sql
ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;

CREATE POLICY "{table_name}_tenant_isolation" ON {table_name} FOR ALL
  USING (company_id IN (
    SELECT c.id FROM companies c
    JOIN organizations o ON o.id = c.org_id
    JOIN memberships m ON m.org_id = o.id
    WHERE m.user_id = auth.uid()
  ));
```

---

## TypeScript Type Generation

```bash
# Run after EVERY migration — never skip this
npx supabase gen types typescript \
  --project-id $SUPABASE_PROJECT_ID \
  > packages/db/types.ts

# Verify no TypeScript errors after generation
npx tsc --noEmit
```

---

## Environment Variables Required

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # Server only. Never in NEXT_PUBLIC_
SUPABASE_PROJECT_ID=            # For type generation
DATABASE_URL=                   # Direct Postgres URL for migrations
```

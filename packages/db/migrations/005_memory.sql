-- Migration 005: Agent memories + pgvector extension
-- Enables semantic memory retrieval for agents.

-- Enable pgvector extension (run ONCE)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE agent_memories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  memory_type     text NOT NULL CHECK (memory_type IN ('identity', 'plan', 'learning', 'rule', 'context')),
  content         text NOT NULL,
  embedding       vector(1536),   -- Embedding dimension for Claude/OpenAI
  relevance_score numeric(5,4) DEFAULT 1.0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz
);

ALTER TABLE agent_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_memories_tenant_isolation" ON agent_memories FOR ALL
  USING (company_id IN (
    SELECT c.id FROM companies c
    JOIN organizations o ON o.id = c.org_id
    JOIN memberships m ON m.org_id = o.id
    WHERE m.user_id = auth.uid()
  ));

-- Vector similarity search index
-- Note: ivfflat requires at least some rows before it works well
-- For production, rebuild index periodically as data grows
CREATE INDEX idx_agent_memories_embedding ON agent_memories
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Standard indexes
CREATE INDEX idx_agent_memories_agent_id ON agent_memories(agent_id);
CREATE INDEX idx_agent_memories_company_id ON agent_memories(company_id);
CREATE INDEX idx_agent_memories_type ON agent_memories(memory_type);

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

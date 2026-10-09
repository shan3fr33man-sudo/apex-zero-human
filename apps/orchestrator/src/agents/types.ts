/**
 * Shared types for APEX agent system.
 * Aligned with actual Supabase schema (twsgkmzsayyryqxzfryd).
 */

export interface AgentConfig {
  id: string;
  company_id: string;
  company_name: string;
  company_description: string;
  name: string;
  slug: string;
  role: string;
  persona: string | null;
  system_prompt: string | null;
  model: string;
  reports_to: string | null;
  reports_to_name: string | null;
  reports_to_role: string | null;
  heartbeat_checklist: Record<string, unknown>;
  config: Record<string, unknown>;
  brand_guide: string | null;
}

export interface Issue {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  type: 'task' | 'bug' | 'feature' | 'research' | 'routine' | 'heartbeat';
  assigned_to: string | null;
  created_by: string | null;
  parent_id: string | null;
  locked_by: string | null;
  locked_at: string | null;
  estimated_tokens: number | null;
  actual_tokens: number | null;
  metadata: Record<string, unknown>;
  due_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface HandoffResult {
  targetAgentId: string | null;
  summary: string;
  artifacts: string[];
  qualityScoreSelf: number;
  memoryToSave: string | null;
}

export interface AgentExecutionResult {
  success: boolean;
  content: string;
  handoff: HandoffResult;
  tokensUsed: number;
  model: string;
  error?: string;
}

/**
 * Result from a Firecrawl web research operation.
 * Used by the base agent's research phase (RESEARCH_COMPLETE heartbeat state).
 */
export interface WebResearchResult {
  url: string;
  title: string;
  content: string;
  source: 'firecrawl.search' | 'firecrawl.scrape' | 'firecrawl.crawl';
}

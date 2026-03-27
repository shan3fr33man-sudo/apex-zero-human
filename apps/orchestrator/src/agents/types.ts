/**
 * Shared types for APEX agent system.
 */

export interface AgentConfig {
  id: string;
  company_id: string;
  company_name: string;
  company_goal: string;
  name: string;
  role: string;
  persona: string | null;
  model_tier: 'STRATEGIC' | 'TECHNICAL' | 'ROUTINE';
  reports_to: string | null;
  reports_to_name: string | null;
  reports_to_role: string | null;
  custom_rules: string[];
  installed_skills: string[];
  brand_guide: string | null;
}

export interface Issue {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  success_condition: string | null;
  status: string;
  priority: number;
  assigned_to: string | null;
  parent_issue_id: string | null;
  metadata: Record<string, unknown>;
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

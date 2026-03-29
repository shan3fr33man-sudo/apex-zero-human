/**
 * Base Agent — Abstract class all APEX agents extend.
 *
 * Core principle: Agents are STATELESS. They wake up with zero memory.
 * The heartbeat protocol is the ONLY thing that gives them identity,
 * context, and purpose. Without it they are lost.
 *
 * Every agent execution follows the exact same 7-step heartbeat:
 *   1. IDENTITY_CONFIRMED — confirm who you are
 *   2. MEMORY_LOADED — load past learnings
 *   3. PLAN_READ — understand the roadmap
 *   4. RESEARCH_COMPLETE — gather external data via Firecrawl (if needed)
 *   5. ASSIGNMENT_CLAIMED — lock the issue
 *   6. EXECUTING — do the work
 *   7. HANDOFF_COMPLETE — pass results forward
 */
import { getSupabaseAdmin } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import { TokenGateway } from '../core/token-gateway.js';
import { HeartbeatStateMachine } from '../core/heartbeat.js';
import { TaskRouter } from '../core/task-router.js';
import { ModelRouter, type LlmRequest, type LlmResponse, type ModelTier } from '../models/router.js';
import { ApexMemorySystem } from '../memory/ams.js';
import { buildSystemPrompt } from './prompt-template.js';
import type { AgentConfig, Issue, HandoffResult, AgentExecutionResult, WebResearchResult } from './types.js';

/**
 * Goal Ancestry Chain formatter — every agent task traces back to the company mission.
 * mission → objective → role → task
 */
function formatGoalAncestryForPrompt(a: { mission: string; objective: string; role: string; task: string }): string {
  return `<goal_ancestry>
You are ${a.role}.
Your task: ${a.task}
This serves objective: ${a.objective}
Which achieves mission: ${a.mission}
</goal_ancestry>`;
}

const log = createLogger('BaseAgent');

/**
 * Firecrawl API configuration — injected from company skill config.
 * If FIRECRAWL_API_KEY is not set, research methods return empty results gracefully.
 */
interface FirecrawlConfig {
  apiKey: string;
  baseUrl: string;
}

export abstract class BaseAgent {
  protected supabase = getSupabaseAdmin();
  protected tokenGateway: TokenGateway;
  protected heartbeat: HeartbeatStateMachine;
  protected taskRouter: TaskRouter;
  protected modelRouter: ModelRouter;
  protected memory: ApexMemorySystem;

  /** Agent's role identifier (e.g., 'ceo', 'engineer', 'qa') */
  abstract readonly role: string;

  /** Display name for the role */
  abstract readonly roleLabel: string;

  /** Model tier determines which Claude model is used */
  abstract readonly modelTier: ModelTier;

  /** Role-specific mission statement injected into system prompt */
  abstract readonly roleMission: string;

  /** How success is measured for this role */
  abstract readonly successMetrics: string;

  constructor(
    tokenGateway: TokenGateway,
    heartbeat: HeartbeatStateMachine,
    taskRouter: TaskRouter,
    modelRouter: ModelRouter,
    memory: ApexMemorySystem
  ) {
    this.tokenGateway = tokenGateway;
    this.heartbeat = heartbeat;
    this.taskRouter = taskRouter;
    this.modelRouter = modelRouter;
    this.memory = memory;
  }

  /**
   * Execute the full heartbeat protocol for a given issue.
   * This is the main entry point called by the engine.
   */
  async execute(config: AgentConfig, issue: Issue): Promise<AgentExecutionResult> {
    const agentId = config.id;
    const issueId = issue.id;

    log.info('Agent execution starting', {
      agentId,
      role: this.role,
      issueId,
      issueTitle: issue.title,
    });

    try {
      // === STEP 1: IDENTITY_CONFIRMED ===
      await this.heartbeat.advance(agentId, issueId, 'IDENTITY_CONFIRMED');
      await this.writeAuditLog(config, issue, 'IDENTITY_CONFIRMED');

      // === STEP 2: MEMORY_LOADED ===
      const memoryContext = await this.memory.loadContext(
        agentId,
        `${issue.title} ${issue.description ?? ''}`
      );
      const memoryPrompt = this.memory.formatForPrompt(memoryContext);
      await this.heartbeat.advance(agentId, issueId, 'MEMORY_LOADED');
      await this.writeAuditLog(config, issue, 'MEMORY_LOADED');

      // === STEP 3: PLAN_READ ===
      await this.heartbeat.advance(agentId, issueId, 'PLAN_READ');
      await this.writeAuditLog(config, issue, 'PLAN_READ');

      // === Goal Ancestry ===
      const companyMission = await this.getCompanyMission(config.company_id);
      const parentObjective = await this.getParentObjective(issue);
      const goalAncestryStr = formatGoalAncestryForPrompt({
        mission: companyMission,
        objective: parentObjective,
        role: this.roleLabel,
        task: `${issue.title}${issue.description ? ': ' + issue.description : ''}`,
      });

      // === STEP 4: RESEARCH_COMPLETE ===
      // If the issue requires external data, gather it via Firecrawl.
      // Subclasses override needsResearch() and gatherResearch() for role-specific behavior.
      let researchContext = '';
      if (this.needsResearch(issue)) {
        const firecrawlConfig = this.getFirecrawlConfig(config);
        if (firecrawlConfig) {
          const research = await this.gatherResearch(issue, firecrawlConfig);
          researchContext = this.formatResearchForPrompt(research);
          log.info('Research gathered', {
            agentId,
            issueId,
            resultCount: research.length,
            totalChars: researchContext.length,
          });
        } else {
          log.debug('Firecrawl not configured — skipping research phase', { agentId, issueId });
        }
      }
      await this.heartbeat.advance(agentId, issueId, 'RESEARCH_COMPLETE');
      await this.writeAuditLog(config, issue, 'RESEARCH_COMPLETE');

      // === STEP 5: ASSIGNMENT_CLAIMED ===
      await this.heartbeat.advance(agentId, issueId, 'ASSIGNMENT_CLAIMED');
      await this.writeAuditLog(config, issue, 'ASSIGNMENT_CLAIMED');

      // === Build full system prompt ===
      const systemPrompt = buildSystemPrompt({
        agentName: config.name,
        agentRole: this.roleLabel,
        agentId: config.id,
        companyId: config.company_id,
        companyName: config.company_name,
        companyGoal: config.company_description,
        reportsToName: config.reports_to_name ?? 'Operator (Human)',
        reportsToRole: config.reports_to_role ?? 'Board Member',
        roleMission: this.roleMission,
        successMetrics: this.successMetrics,
        customRules: (config.config as Record<string, unknown>)?.custom_rules as string[] ?? [],
        installedSkills: (config.config as Record<string, unknown>)?.installed_skills as string[] ?? [],
        brandGuide: config.brand_guide ?? 'No brand guide set. Use professional, clear language.',
        memoryContext: memoryPrompt,
        researchContext,
        goalAncestry: goalAncestryStr,
      });

      // === Build the messages for this specific issue ===
      const messages = this.buildMessages(config, issue);

      // === STEP 6: EXECUTING ===
      await this.heartbeat.advance(agentId, issueId, 'EXECUTING');
      await this.writeAuditLog(config, issue, 'EXECUTING');

      // Make the LLM call via model router (budget check is inside)
      const llmRequest: LlmRequest = {
        companyId: config.company_id,
        agentId: config.id,
        issueId: issue.id,
        tier: this.modelTier,
        systemPrompt,
        messages,
        maxTokens: this.getMaxTokens(),
        temperature: this.getTemperature(),
      };

      const response = await this.modelRouter.call(llmRequest);

      // Add the response as a progress comment on the issue
      await this.addIssueComment(issue.id, agentId, response.content, 'progress');

      // Parse the handoff result from the response
      const handoff = this.parseHandoff(response.content);

      // === STEP 7: HANDOFF_COMPLETE ===
      await this.heartbeat.advance(agentId, issueId, 'HANDOFF_COMPLETE');
      await this.writeAuditLog(config, issue, 'HANDOFF_COMPLETE');

      // Save learning memory if the agent produced one
      if (handoff.memoryToSave) {
        await this.memory.storeLearning(agentId, config.company_id, handoff.memoryToSave);
      }

      // Complete the issue or pass to next agent
      if (handoff.targetAgentId) {
        // Hand off — set issue back to open for the target agent
        await this.addIssueComment(issue.id, agentId, handoff.summary, 'handoff');
        await this.taskRouter.releaseIssue(issue.id, 'open');
      } else {
        // Done — mark as in_review (QA will pick it up) or completed
        const nextStatus = this.role === 'qa' ? 'completed' : 'in_review';
        await this.taskRouter.releaseIssue(issue.id, nextStatus);
        if (nextStatus === 'completed') {
          await this.taskRouter.completeIssue(issue.id, handoff.qualityScoreSelf);
        }
      }

      log.info('Agent execution completed', {
        agentId,
        role: this.role,
        issueId,
        model: response.model,
        tokensUsed: response.inputTokens + response.outputTokens,
        qualityScore: handoff.qualityScoreSelf,
      });

      return {
        success: true,
        content: response.content,
        handoff,
        tokensUsed: response.inputTokens + response.outputTokens,
        model: response.model,
      };

    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error('Agent execution failed', { agentId, role: this.role, issueId, error: errorMsg });

      await this.heartbeat.fail(agentId, issueId, errorMsg);
      await this.writeAuditLog(config, issue, 'FAILED', { error: errorMsg });

      return {
        success: false,
        content: '',
        handoff: { targetAgentId: null, summary: '', artifacts: [], qualityScoreSelf: 0, memoryToSave: null },
        tokensUsed: 0,
        model: '',
        error: errorMsg,
      };
    }
  }

  // ─── Firecrawl Integration ──────────────────────────────────────────

  /**
   * Determine if the issue requires external web research before execution.
   * Subclasses override this for role-specific intelligence needs.
   * Default: true if the issue description/metadata contains research-triggering keywords.
   */
  protected needsResearch(issue: Issue): boolean {
    const text = `${issue.title} ${issue.description ?? ''} ${JSON.stringify(issue.metadata ?? {})}`.toLowerCase();
    const researchKeywords = [
      'competitor', 'market', 'research', 'industry', 'trend', 'pricing',
      'benchmark', 'best practice', 'compare', 'analyze', 'investigate',
      'verify', 'external', 'scrape', 'url', 'website', 'http',
    ];
    return researchKeywords.some(kw => text.includes(kw));
  }

  /**
   * Gather external research via Firecrawl before executing the issue.
   * Default implementation uses firecrawl.search() with a query derived from the issue.
   * Subclasses override for role-specific research strategies.
   */
  protected async gatherResearch(
    issue: Issue,
    firecrawl: FirecrawlConfig
  ): Promise<WebResearchResult[]> {
    const query = `${issue.title} ${issue.description ?? ''}`.substring(0, 200);
    return this.firecrawlSearch(query, firecrawl, 5);
  }

  /**
   * Search the web via Firecrawl and return scraped results.
   * Cheapest Firecrawl operation — use for general research.
   */
  protected async firecrawlSearch(
    query: string,
    firecrawl: FirecrawlConfig,
    limit: number = 5
  ): Promise<WebResearchResult[]> {
    try {
      const response = await fetch(`${firecrawl.baseUrl}/search`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${firecrawl.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          limit,
          scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
        }),
      });

      if (!response.ok) {
        log.warn('Firecrawl search failed', { status: response.status, query });
        return [];
      }

      const data = await response.json() as {
        data?: Array<{ url?: string; markdown?: string; metadata?: { title?: string } }>;
      };

      return (data.data ?? []).map(result => ({
        url: result.url ?? '',
        title: result.metadata?.title ?? '',
        content: (result.markdown ?? '').substring(0, 3000), // Cap per result
        source: 'firecrawl.search' as const,
      }));
    } catch (err) {
      log.error('Firecrawl search error', { error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }

  /**
   * Scrape a single URL via Firecrawl. Returns clean markdown content.
   * Medium cost — use for targeted URL scraping.
   */
  protected async firecrawlScrape(
    url: string,
    firecrawl: FirecrawlConfig
  ): Promise<WebResearchResult | null> {
    try {
      const response = await fetch(`${firecrawl.baseUrl}/scrape`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${firecrawl.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          formats: ['markdown'],
          onlyMainContent: true,
          timeout: 30000,
        }),
      });

      if (!response.ok) {
        log.warn('Firecrawl scrape failed', { status: response.status, url });
        return null;
      }

      const data = await response.json() as {
        data?: { url?: string; markdown?: string; metadata?: { title?: string } };
      };

      if (!data.data) return null;

      return {
        url: data.data.url ?? url,
        title: data.data.metadata?.title ?? '',
        content: (data.data.markdown ?? '').substring(0, 5000),
        source: 'firecrawl.scrape' as const,
      };
    } catch (err) {
      log.error('Firecrawl scrape error', { url, error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  /**
   * Crawl an entire site via Firecrawl. Returns crawl_id for async polling.
   * Most expensive Firecrawl operation — use sparingly for deep site analysis.
   */
  protected async firecrawlCrawl(
    url: string,
    firecrawl: FirecrawlConfig,
    limit: number = 50
  ): Promise<string | null> {
    try {
      const response = await fetch(`${firecrawl.baseUrl}/crawl`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${firecrawl.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          limit,
          scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
        }),
      });

      if (!response.ok) {
        log.warn('Firecrawl crawl failed', { status: response.status, url });
        return null;
      }

      const data = await response.json() as { id?: string };
      return data.id ?? null;
    } catch (err) {
      log.error('Firecrawl crawl error', { url, error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  /**
   * Extract Firecrawl config from company's installed skill configuration.
   * Returns null if Firecrawl is not configured (agent proceeds without research).
   */
  private getFirecrawlConfig(config: AgentConfig): FirecrawlConfig | null {
    // Firecrawl API key comes from company config via skill config
    const apiKey = process.env.FIRECRAWL_API_KEY ?? '';
    if (!apiKey) return null;

    return {
      apiKey,
      baseUrl: process.env.FIRECRAWL_BASE_URL ?? 'https://api.firecrawl.dev/v1',
    };
  }

  /**
   * Format research results into a prompt-ready XML block.
   */
  private formatResearchForPrompt(results: WebResearchResult[]): string {
    if (results.length === 0) return '';

    const entries = results.map((r, i) =>
      `<research_result index="${i + 1}" source="${r.source}">
<url>${r.url}</url>
<title>${r.title}</title>
<content>
${r.content}
</content>
</research_result>`
    ).join('\n\n');

    return `<web_research>
${entries}
</web_research>`;
  }

  // ─── Message Building ───────────────────────────────────────────────

  /**
   * Build the user messages for the LLM call.
   * Subclasses can override to add role-specific context.
   */
  protected buildMessages(
    config: AgentConfig,
    issue: Issue
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    const issueBlock = [
      `## Issue: ${issue.title}`,
      issue.description ? `\n### Description\n${issue.description}` : '',
      issue.metadata?.success_condition ? `\n### Success Condition\n${issue.metadata.success_condition}` : '',
      `\n### Priority: ${issue.priority}`,
      issue.metadata ? `\n### Metadata\n${JSON.stringify(issue.metadata, null, 2)}` : '',
    ].filter(Boolean).join('\n');

    return [
      {
        role: 'user' as const,
        content: `You have been assigned the following issue. Execute the heartbeat protocol step by step.\n\n${issueBlock}`,
      },
    ];
  }

  /**
   * Parse the handoff JSON from the agent's response.
   * Looks for a JSON block in the response content.
   */
  protected parseHandoff(content: string): HandoffResult {
    const defaults: HandoffResult = {
      targetAgentId: null,
      summary: content.substring(0, 500),
      artifacts: [],
      qualityScoreSelf: 50,
      memoryToSave: null,
    };

    try {
      // Look for JSON block in the response
      const jsonMatch = content.match(/\{[\s\S]*?"target_agent_id"[\s\S]*?\}/);
      if (!jsonMatch) return defaults;

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        targetAgentId: parsed.target_agent_id ?? null,
        summary: parsed.summary ?? defaults.summary,
        artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts : [],
        qualityScoreSelf: typeof parsed.quality_score_self === 'number'
          ? Math.min(100, Math.max(0, parsed.quality_score_self))
          : 50,
        memoryToSave: parsed.memory_to_save ?? null,
      };
    } catch {
      return defaults;
    }
  }

  /** Max tokens for LLM response. Override in subclasses for different needs. */
  protected getMaxTokens(): number {
    return 4096;
  }

  /** Temperature for LLM. Override in subclasses. */
  protected getTemperature(): number {
    return 0.7;
  }

  /**
   * Write an audit log entry for a state transition.
   */
  private async writeAuditLog(
    config: AgentConfig,
    issue: Issue,
    action: string,
    extra?: Record<string, unknown>
  ): Promise<void> {
    await this.supabase.from('audit_log').insert({
      company_id: config.company_id,
      agent_id: config.id,
      action: `HEARTBEAT_${action}`,
      entity_type: 'issues',
      entity_id: issue.id,
      after_state: { state: action, issue_title: issue.title, ...extra },
    });
  }

  /**
   * Add a comment to an issue.
   */
  private async addIssueComment(
    issueId: string,
    agentId: string,
    content: string,
    commentType: 'progress' | 'handoff' | 'artifact' | 'review' | 'system'
  ): Promise<void> {
    await this.supabase.from('issue_comments').insert({
      issue_id: issueId,
      agent_id: agentId,
      content,
      comment_type: commentType,
    });
  }

  /**
   * Get the company's mission from the companies table.
   */
  private async getCompanyMission(companyId: string): Promise<string> {
    const { data } = await this.supabase
      .from('companies')
      .select('mission, goal')
      .eq('id', companyId)
      .single();

    return (data as any)?.mission ?? (data as any)?.goal ?? 'Build a successful company';
  }

  /**
   * Get the parent objective for an issue from its parent issue (if any).
   */
  private async getParentObjective(issue: Issue): Promise<string> {
    if (!issue.parent_id) return 'General company operations';

    const { data } = await this.supabase
      .from('issues')
      .select('title, description')
      .eq('id', issue.parent_id)
      .single();

    return (data as any)?.title ?? 'General company operations';
  }
}

/**
 * CEO Daily Planner
 *
 * Per-company background loop that keeps every hired agent fed with work
 * pointed at the company's ultimate goal.
 *
 * Every CEO_PLANNER_TICK_MS (default 5 min):
 *   1. For each active company:
 *      a. Read company.settings.goal + company.name
 *      b. Read full agent roster (id, role, name)
 *      c. Count open issues per role (status in pending/open/in_progress)
 *      d. If any non-CEO agent has < MIN_BACKLOG open issues, ask Claude to
 *         decompose the goal into ONE concrete next step for each starving
 *         agent, returned as JSON array of { role, title, description }
 *      e. Insert each as a row in `issues` (assigned_to = best-matching agent),
 *         and write a one-line plain-English summary into `audit_log` so the
 *         activity feed shows the CEO actively managing the team.
 *
 * Designed to be CHEAP and SAFE:
 *   - Skips entirely if ANTHROPIC_API_KEY is missing
 *   - Skips a company if it already has enough work in flight
 *   - One Anthropic call per company per tick at most
 *   - Uses Haiku tier (cheap) — strategic decomposition is small + structured
 *   - All inserts wrapped in try/catch; failures logged, never crash the engine
 */

import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('CeoPlanner');

const TICK_MS = Number(process.env.CEO_PLANNER_TICK_MS) || 5 * 60_000;
const MIN_BACKLOG_PER_AGENT = 1;
const MAX_NEW_ISSUES_PER_TICK = 6;
const PLANNER_MODEL = 'claude-haiku-4-5-20251001';

interface AgentRow {
  id: string;
  role: string;
  name: string;
  status: string;
}

interface CompanyRow {
  id: string;
  name: string;
  settings: Record<string, unknown> | null;
}

interface PlannedIssue {
  role: string;
  title: string;
  description: string;
}

export class CeoPlanner {
  private supabase = getSupabaseAdmin();
  private anthropic: Anthropic | null = null;
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private running = false;

  start(): void {
    if (this.running) {
      log.warn('CEO planner already running');
      return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      log.warn('ANTHROPIC_API_KEY missing — CEO planner disabled');
      return;
    }
    this.anthropic = new Anthropic({ apiKey });

    this.running = true;
    log.info('CEO planner started', { tickMs: TICK_MS });

    void this.tick();
    this.tickHandle = setInterval(() => {
      this.tick().catch((err) => {
        log.error('CEO planner tick error', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, TICK_MS);
  }

  stop(): void {
    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
    this.running = false;
    log.info('CEO planner stopped');
  }

  private async tick(): Promise<void> {
    const { data: companies, error } = await this.supabase
      .from('companies')
      .select('id, name, settings')
      .eq('status', 'active');

    if (error) {
      log.error('Failed to fetch companies', { error: error.message });
      return;
    }
    if (!companies || companies.length === 0) return;

    for (const company of companies as CompanyRow[]) {
      try {
        await this.planForCompany(company);
      } catch (err) {
        log.error('Plan failed for company', {
          companyId: company.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private async planForCompany(company: CompanyRow): Promise<void> {
    const goal =
      ((company.settings ?? {}) as Record<string, unknown>).goal as string | undefined;
    if (!goal || !goal.trim()) {
      // No goal set — nothing to plan against
      return;
    }

    // Roster
    const { data: agents } = await this.supabase
      .from('agents')
      .select('id, role, name, status')
      .eq('company_id', company.id);

    if (!agents || agents.length === 0) return;
    const roster = agents as AgentRow[];

    // Non-CEO agents that need work
    const nonCeo = roster.filter((a) => a.role !== 'ceo');
    if (nonCeo.length === 0) return;

    // Count open issues per role
    const { data: openIssues } = await this.supabase
      .from('issues')
      .select('id, assigned_to')
      .eq('company_id', company.id)
      .in('status', ['pending', 'open', 'in_progress']);

    const openByAgent = new Map<string, number>();
    (openIssues ?? []).forEach((i) => {
      const aid = (i as { assigned_to: string | null }).assigned_to;
      if (aid) openByAgent.set(aid, (openByAgent.get(aid) ?? 0) + 1);
    });

    const starving = nonCeo.filter(
      (a) => (openByAgent.get(a.id) ?? 0) < MIN_BACKLOG_PER_AGENT
    );
    if (starving.length === 0) {
      log.debug('All agents have backlog, skipping', { companyId: company.id });
      return;
    }

    log.info('Planning work for starving agents', {
      companyId: company.id,
      companyName: company.name,
      starvingCount: starving.length,
      starvingRoles: starving.map((a) => a.role),
    });

    // Ask Claude to decompose the goal
    const planned = await this.askClaudeForPlan(company, goal, roster, starving);
    if (planned.length === 0) {
      log.warn('LLM returned no planned issues', { companyId: company.id });
      return;
    }

    // Insert each planned issue, assigning to best-matching agent
    let inserted = 0;
    for (const p of planned.slice(0, MAX_NEW_ISSUES_PER_TICK)) {
      const target = this.matchAgent(p.role, starving, roster);
      if (!target) continue;

      const { data: issue, error: insertErr } = await this.supabase
        .from('issues')
        .insert({
          company_id: company.id,
          title: p.title.slice(0, 200),
          description: p.description.slice(0, 4000),
          status: 'pending',
          priority: 'medium',
          type: 'task',
          assigned_to: target.id,
          metadata: {
            spawned_by: 'ceo_planner',
            for_goal: goal.slice(0, 500),
            target_role: p.role,
          },
        })
        .select('id')
        .single();

      if (insertErr) {
        log.error('Failed to insert planned issue', {
          companyId: company.id,
          error: insertErr.message,
        });
        continue;
      }
      inserted++;

      // Activity feed entry — plain English so users see the CEO working
      await this.supabase
        .from('audit_log')
        .insert({
          company_id: company.id,
          actor_type: 'agent',
          action: 'ceo_assigned_work',
          target_type: 'issue',
          target_id: issue.id,
          metadata: {
            summary: `CEO assigned ${target.name} (${target.role}): ${p.title}`,
            for_goal: goal.slice(0, 200),
          },
        })
        .then(
          () => undefined,
          (err: unknown) =>
            log.warn('audit_log insert failed (non-fatal)', {
              error: err instanceof Error ? err.message : String(err),
            })
        );
    }

    log.info('CEO planner inserted issues', {
      companyId: company.id,
      inserted,
      planned: planned.length,
    });
  }

  /**
   * Pick the best agent for a planned issue:
   * 1. Exact role match among starving agents
   * 2. Exact role match in full roster
   * 3. First starving agent (fallback)
   */
  private matchAgent(
    role: string,
    starving: AgentRow[],
    roster: AgentRow[]
  ): AgentRow | null {
    const norm = role.toLowerCase().trim();
    return (
      starving.find((a) => a.role === norm) ??
      roster.find((a) => a.role === norm && a.role !== 'ceo') ??
      starving[0] ??
      null
    );
  }

  private async askClaudeForPlan(
    company: CompanyRow,
    goal: string,
    roster: AgentRow[],
    starving: AgentRow[]
  ): Promise<PlannedIssue[]> {
    if (!this.anthropic) return [];

    const rosterSummary = roster
      .map((a) => `- ${a.name} (role: ${a.role}, status: ${a.status})`)
      .join('\n');
    const starvingRoles = starving.map((a) => a.role).join(', ');

    const systemPrompt = `You are the CEO of "${company.name}", an autonomous AI company.
Your job is to break down the company's ultimate goal into the next concrete piece of
work for each agent that has nothing to do, so the team is constantly building toward
the goal. Be specific, action-oriented, and small enough that one agent can finish in
one work session. Never assign work to yourself (the CEO).`;

    const userPrompt = `ULTIMATE GOAL:
${goal}

TEAM ROSTER:
${rosterSummary}

AGENTS WITH NO WORK RIGHT NOW (assign one task to each):
${starvingRoles}

Return ONLY a JSON array (no prose, no markdown fences) of objects, one per starving agent role:
[
  { "role": "<exact role from the starving list>", "title": "<short imperative title, max 80 chars>", "description": "<2-4 sentences: what to do, what success looks like>" }
]`;

    let raw = '';
    try {
      const resp = await this.anthropic.messages.create({
        model: PLANNER_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });
      const block = resp.content.find((c) => c.type === 'text');
      raw = block && block.type === 'text' ? block.text : '';
    } catch (err) {
      log.error('Anthropic call failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }

    // Extract JSON array from raw output (tolerate stray prose / fences)
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) {
      log.warn('No JSON array found in planner response', { raw: raw.slice(0, 200) });
      return [];
    }
    try {
      const parsed = JSON.parse(match[0]) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (p): p is PlannedIssue =>
            !!p &&
            typeof p === 'object' &&
            typeof (p as PlannedIssue).role === 'string' &&
            typeof (p as PlannedIssue).title === 'string' &&
            typeof (p as PlannedIssue).description === 'string'
        )
        .map((p) => ({
          role: p.role.toLowerCase().trim(),
          title: p.title.trim(),
          description: p.description.trim(),
        }));
    } catch (err) {
      log.warn('Failed to parse planner JSON', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }
}

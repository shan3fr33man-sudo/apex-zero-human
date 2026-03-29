import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRole } from '@/lib/supabase-server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/apex/companies/[id]/plan
 * Returns the current company roadmap: open issues grouped by priority,
 * active agents, and routine schedules.
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id: companyId } = await ctx.params;
  const supabase = getSupabaseServiceRole();

  // Parallel fetches
  const [issuesRes, agentsRes, routinesRes] = await Promise.all([
    supabase
      .from('issues')
      .select('id, title, status, priority, assigned_to, created_at')
      .eq('company_id', companyId)
      .neq('status', 'completed')
      .order('priority', { ascending: true })
      .limit(50),
    supabase
      .from('agents')
      .select('id, name, role, status, current_issue_id')
      .eq('company_id', companyId)
      .neq('status', 'terminated'),
    supabase
      .from('routines')
      .select('id, name, routine_type, enabled, cron_expr, event_pattern, next_run_at')
      .eq('company_id', companyId)
      .eq('enabled', true),
  ]);

  // Group issues by priority
  const issuesByPriority: Record<string, unknown[]> = {
    critical: [],
    high: [],
    medium: [],
    low: [],
  };
  for (const issue of issuesRes.data ?? []) {
    const priority = (issue as { priority: string }).priority;
    if (issuesByPriority[priority]) {
      issuesByPriority[priority].push(issue);
    }
  }

  return NextResponse.json({
    roadmap: issuesByPriority,
    agents: agentsRes.data ?? [],
    active_routines: routinesRes.data ?? [],
    summary: {
      total_open_issues: (issuesRes.data ?? []).length,
      active_agents: (agentsRes.data ?? []).filter(
        (a) => (a as { status: string }).status === 'working'
      ).length,
      total_agents: (agentsRes.data ?? []).length,
      active_routines: (routinesRes.data ?? []).length,
    },
  });
}

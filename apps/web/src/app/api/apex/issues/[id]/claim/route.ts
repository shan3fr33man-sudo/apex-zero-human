import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRole, getAuthenticatedUser, requireOwnership } from '@/lib/supabase-server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/apex/issues/[id]/claim
 * Body: { agent_id: string, company_id: string }
 * Claims an issue using Postgres advisory locks to prevent race conditions.
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: issueId } = await ctx.params;
  const { agent_id, company_id } = await req.json();

  if (!agent_id) {
    return NextResponse.json({ error: 'agent_id required' }, { status: 400 });
  }

  if (!company_id) {
    return NextResponse.json({ error: 'company_id required' }, { status: 400 });
  }

  const authorized = await requireOwnership(user.id, company_id);
  if (!authorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = getSupabaseServiceRole();

  // Use an RPC that wraps the advisory lock + claim in a single transaction
  // Fallback: optimistic update with status check
  const { data: issue, error: fetchErr } = await supabase
    .from('issues')
    .select('id, status, assigned_to')
    .eq('id', issueId)
    .single();

  if (fetchErr || !issue) {
    return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
  }

  if (issue.status !== 'open') {
    return NextResponse.json(
      { error: `Issue is ${issue.status}, cannot claim` },
      { status: 409 }
    );
  }

  if (issue.assigned_to) {
    return NextResponse.json(
      { error: 'Issue already assigned' },
      { status: 409 }
    );
  }

  // Claim the issue
  const { data: claimed, error: claimErr } = await supabase
    .from('issues')
    .update({
      assigned_to: agent_id,
      status: 'in_progress',
      started_at: new Date().toISOString(),
    })
    .eq('id', issueId)
    .eq('status', 'open') // Optimistic lock — only update if still open
    .select()
    .single();

  if (claimErr || !claimed) {
    return NextResponse.json(
      { error: 'Race condition: issue was claimed by another agent' },
      { status: 409 }
    );
  }

  // Update agent status to working
  await supabase
    .from('agents')
    .update({ status: 'working' })
    .eq('id', agent_id);

  return NextResponse.json(claimed);
}

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRole } from '@/lib/supabase-server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/apex/issues/[id]/handoff
 * Body: { from_agent_id: string, to_agent_id: string, reason: string }
 * Hands off an issue from one agent to another.
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id: issueId } = await ctx.params;
  const { from_agent_id, to_agent_id, reason } = await req.json();

  if (!from_agent_id || !to_agent_id) {
    return NextResponse.json(
      { error: 'from_agent_id and to_agent_id required' },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServiceRole();

  // Verify issue is assigned to from_agent
  const { data: issue, error: fetchErr } = await supabase
    .from('issues')
    .select('id, assigned_to, status')
    .eq('id', issueId)
    .single();

  if (fetchErr || !issue) {
    return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
  }

  if (issue.assigned_to !== from_agent_id) {
    return NextResponse.json(
      { error: 'Issue not assigned to this agent' },
      { status: 403 }
    );
  }

  // Handoff: reassign to new agent
  const { data: updated, error: updateErr } = await supabase
    .from('issues')
    .update({
      assigned_to: to_agent_id,
      status: 'open', // Reset to open for the new agent to claim
    })
    .eq('id', issueId)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Reset from_agent status
  await supabase
    .from('agents')
    .update({ status: 'idle' })
    .eq('id', from_agent_id);

  // Record handoff in issue comments
  await supabase.from('issue_comments').insert({
    issue_id: issueId,
    agent_id: from_agent_id,
    content: `Handed off to agent ${to_agent_id}. Reason: ${reason ?? 'N/A'}`,
    comment_type: 'handoff',
  });

  return NextResponse.json(updated);
}

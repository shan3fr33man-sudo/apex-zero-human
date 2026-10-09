/**
 * Activity Feed API Route
 *
 * GET /api/apex/activity?company_id=xxx&limit=50
 *
 * Returns a unified, chronological feed of:
 * - Agent heartbeat state transitions
 * - Issue status changes
 * - Audit log entries (team provisioned, commands, etc.)
 *
 * This powers the real-time activity feed that shows operators
 * what their AI team is doing right now.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRole, getAuthenticatedUser, requireOwnership } from '@/lib/supabase-server';

interface ActivityItem {
  id: string;
  type: 'heartbeat' | 'issue' | 'audit' | 'provision';
  timestamp: string;
  agent_name: string | null;
  agent_role: string | null;
  title: string;
  detail: string;
  status: string | null;
  icon: string;  // emoji for the UI
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('company_id');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

  if (!companyId) {
    return NextResponse.json({ error: 'company_id required' }, { status: 400 });
  }

  const authorized = await requireOwnership(user.id, companyId);
  if (!authorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = getSupabaseServiceRole();
  const activities: ActivityItem[] = [];

  // 1. Recent heartbeats (agent state transitions)
  const { data: heartbeats } = await supabase
    .from('agent_heartbeats')
    .select('id, agent_id, state, started_at, completed_at')
    .order('started_at', { ascending: false })
    .limit(limit);

  // Get agent names for heartbeats
  const agentIds = new Set<string>();
  for (const hb of (heartbeats ?? []) as Array<{ agent_id: string }>) {
    agentIds.add(hb.agent_id);
  }

  const agentMap = new Map<string, { name: string; role: string }>();
  if (agentIds.size > 0) {
    const { data: agents } = await supabase
      .from('agents')
      .select('id, name, role')
      .eq('company_id', companyId);

    for (const a of (agents ?? []) as Array<{ id: string; name: string; role: string }>) {
      agentMap.set(a.id, { name: a.name, role: a.role });
    }
  }

  const stateLabels: Record<string, { label: string; icon: string }> = {
    'IDENTITY_CONFIRMED': { label: 'confirmed identity', icon: '🔑' },
    'MEMORY_LOADED': { label: 'loaded memory', icon: '🧠' },
    'PLAN_READ': { label: 'reviewed the plan', icon: '📋' },
    'RESEARCH_COMPLETE': { label: 'finished research', icon: '🔍' },
    'ASSIGNMENT_CLAIMED': { label: 'claimed assignment', icon: '✋' },
    'EXECUTING': { label: 'is working', icon: '⚡' },
    'HANDOFF_COMPLETE': { label: 'completed task', icon: '✅' },
  };

  for (const hb of (heartbeats ?? []) as Array<{
    id: string; agent_id: string; state: string; started_at: string;
  }>) {
    const agent = agentMap.get(hb.agent_id);
    const stateInfo = stateLabels[hb.state] || { label: hb.state.toLowerCase(), icon: '🔄' };

    activities.push({
      id: `hb-${hb.id}`,
      type: 'heartbeat',
      timestamp: hb.started_at,
      agent_name: agent?.name || 'Unknown Agent',
      agent_role: agent?.role || null,
      title: `${agent?.name || 'Agent'} ${stateInfo.label}`,
      detail: `State: ${hb.state}`,
      status: hb.state,
      icon: stateInfo.icon,
    });
  }

  // 2. Recent issue changes
  const { data: recentIssues } = await supabase
    .from('issues')
    .select('id, title, status, priority, assigned_to, created_at, updated_at, metadata')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })
    .limit(limit);

  const issueIcons: Record<string, string> = {
    'open': '📬', 'in_progress': '🔨', 'in_review': '👀',
    'completed': '✅', 'blocked': '🚫', 'human_review_required': '🙋',
  };

  for (const issue of (recentIssues ?? []) as Array<{
    id: string; title: string; status: string; priority: string;
    assigned_to: string | null; created_at: string; updated_at: string;
    metadata: Record<string, unknown> | null;
  }>) {
    const agent = issue.assigned_to ? agentMap.get(issue.assigned_to) : null;
    const source = (issue.metadata?.source as string) || '';

    activities.push({
      id: `issue-${issue.id}`,
      type: source === 'auto_provisioner' ? 'provision' : 'issue',
      timestamp: issue.updated_at || issue.created_at,
      agent_name: agent?.name || null,
      agent_role: agent?.role || null,
      title: issue.title,
      detail: `Status: ${issue.status} | Priority: ${issue.priority}`,
      status: issue.status,
      icon: issueIcons[issue.status] || '📝',
    });
  }

  // 3. Recent audit log entries
  const { data: auditEntries } = await supabase
    .from('audit_log')
    .select('id, action, details, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(30);

  const auditIcons: Record<string, string> = {
    'team_provisioned': '🚀',
    'agent_created': '🤖',
    'issue_created': '📝',
    'issue_completed': '✅',
    'command_received': '💬',
  };

  for (const entry of (auditEntries ?? []) as Array<{
    id: string; action: string; details: Record<string, unknown> | null; created_at: string;
  }>) {
    const action = entry.action || 'unknown';
    let title = action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    let detail = '';

    if (entry.details) {
      if (action === 'team_provisioned') {
        const teamType = (entry.details.team_type as string) || '';
        const count = entry.details.agents_created || 0;
        title = `Team Deployed: ${teamType.replace(/-/g, ' ')}`;
        detail = `${count} agents created`;
      }
    }

    activities.push({
      id: `audit-${entry.id}`,
      type: 'audit',
      timestamp: entry.created_at,
      agent_name: null,
      agent_role: null,
      title,
      detail,
      status: null,
      icon: auditIcons[action] || '📋',
    });
  }

  // Sort all activities by timestamp (newest first)
  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Trim to limit
  const trimmed = activities.slice(0, limit);

  return NextResponse.json({
    data: trimmed,
    pagination: {
      total: trimmed.length,
      limit,
    },
  });
}

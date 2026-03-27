import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRole } from '@/lib/supabase-server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/apex/agents/[id]/identity
 * Returns the agent's identity payload for heartbeat protocol:
 * persona, role, config, heartbeat_checklist, company config.
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const supabase = getSupabaseServiceRole();

  // Fetch agent
  const { data: agent, error: agentErr } = await supabase
    .from('agents')
    .select('id, role, name, persona, config, heartbeat_checklist, model_tier, company_id')
    .eq('id', id)
    .single();

  if (agentErr || !agent)
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  // Fetch company config
  const { data: company } = await supabase
    .from('companies')
    .select('name, config')
    .eq('id', agent.company_id)
    .single();

  return NextResponse.json({
    agent: {
      id: agent.id,
      role: agent.role,
      name: agent.name,
      persona: agent.persona,
      config: agent.config,
      heartbeat_checklist: agent.heartbeat_checklist,
      model_tier: agent.model_tier,
    },
    company: {
      id: agent.company_id,
      name: company?.name ?? 'Unknown',
      config: company?.config ?? {},
    },
  });
}

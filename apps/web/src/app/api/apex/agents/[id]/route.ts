import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRole, getAuthenticatedUser, requireOwnership } from '@/lib/supabase-server';
import { z } from 'zod';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Whitelist of fields allowed in PATCH — prevents arbitrary mutation */
const PatchAgentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  persona: z.string().max(5000).optional(),
  system_prompt: z.string().max(20000).optional(),
  status: z.enum(['idle', 'working', 'paused', 'terminated']).optional(),
  model: z.string().max(100).optional(),
  config: z.record(z.unknown()).optional(),
}).strict(); // Reject extra fields

/** Helper: get agent and verify ownership */
async function getAgentWithAuth(agentId: string) {
  const user = await getAuthenticatedUser();
  if (!user) return { user: null, agent: null, error: 'Unauthorized', status: 401 };

  const supabase = getSupabaseServiceRole();
  const { data: agent, error } = await supabase
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .single();

  if (error || !agent) return { user, agent: null, error: 'Agent not found', status: 404 };

  const authorized = await requireOwnership(user.id, agent.company_id);
  if (!authorized) return { user, agent: null, error: 'Forbidden', status: 403 };

  return { user, agent, error: null, status: 200 };
}

/** GET /api/apex/agents/[id] — fetch a single agent */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const { agent, error, status } = await getAgentWithAuth(id);

  if (error) return NextResponse.json({ error }, { status });
  return NextResponse.json(agent);
}

/** PATCH /api/apex/agents/[id] — update agent fields (validated) */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const { agent, error: authError, status: authStatus } = await getAgentWithAuth(id);

  if (authError) return NextResponse.json({ error: authError }, { status: authStatus });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = PatchAgentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServiceRole();
  const { data, error } = await supabase
    .from('agents')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

/** DELETE /api/apex/agents/[id] — terminate (soft delete) an agent */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const { agent, error: authError, status: authStatus } = await getAgentWithAuth(id);

  if (authError) return NextResponse.json({ error: authError }, { status: authStatus });

  const supabase = getSupabaseServiceRole();
  const { data, error } = await supabase
    .from('agents')
    .update({ status: 'terminated' })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

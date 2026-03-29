import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRole } from '@/lib/supabase-server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/apex/agents/[id]/memories?q=search_text&limit=10
 * Semantic search over agent memories using pgvector.
 * Falls back to text search if no embedding is provided.
 */
export async function GET(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q') ?? '';
  const limit = parseInt(searchParams.get('limit') ?? '10', 10);

  const supabase = getSupabaseServiceRole();

  // Fetch agent to get company_id
  const { data: agent } = await supabase
    .from('agents')
    .select('company_id')
    .eq('id', id)
    .single();

  if (!agent)
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  // Text-based search (full semantic search requires embedding generation)
  const { data: memories, error } = await supabase
    .from('memories')
    .select('id, content, memory_type, importance, created_at')
    .eq('company_id', agent.company_id)
    .or(`agent_id.eq.${id},agent_id.is.null`)
    .ilike('content', `%${query}%`)
    .order('importance', { ascending: false })
    .limit(limit);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ memories: memories ?? [] });
}

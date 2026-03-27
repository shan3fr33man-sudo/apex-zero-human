import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRole } from '@/lib/supabase-server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** GET /api/apex/agents/[id] — fetch a single agent */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const supabase = getSupabaseServiceRole();

  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

/** PATCH /api/apex/agents/[id] — update agent fields */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const body = await req.json();
  const supabase = getSupabaseServiceRole();

  const { data, error } = await supabase
    .from('agents')
    .update(body)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

/** DELETE /api/apex/agents/[id] — terminate (soft delete) an agent */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
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

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRole } from '@/lib/supabase-server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/apex/inbox/[id]/resolve
 * Body: { resolution: 'approved' | 'rejected', reason?: string }
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const { resolution, reason } = await req.json();

  if (!resolution || !['approved', 'rejected'].includes(resolution)) {
    return NextResponse.json(
      { error: 'resolution must be "approved" or "rejected"' },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServiceRole();

  // Verify item exists and is pending
  const { data: item, error: fetchErr } = await supabase
    .from('inbox_items')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchErr || !item) {
    return NextResponse.json({ error: 'Inbox item not found' }, { status: 404 });
  }

  if ((item as { status: string }).status !== 'pending') {
    return NextResponse.json(
      { error: 'Item already resolved' },
      { status: 409 }
    );
  }

  // Resolve the item
  const { data: resolved, error: updateErr } = await supabase
    .from('inbox_items')
    .update({
      status: resolution,
      resolved_at: new Date().toISOString(),
      resolution_reason: reason ?? null,
    })
    .eq('id', id)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // If it's a HIRE_APPROVAL and approved, create the agent
  const itemType = (item as { item_type: string }).item_type;
  const payload = (item as { payload: Record<string, unknown> }).payload;
  const companyId = (item as { company_id: string }).company_id;

  if (itemType === 'HIRE_APPROVAL' && resolution === 'approved' && payload) {
    await supabase.from('agents').insert({
      company_id: companyId,
      role: (payload.role as string) ?? 'worker',
      name: (payload.name as string) ?? 'New Agent',
      model_tier: (payload.model_tier as string) ?? 'ROUTINE',
      status: 'idle',
      reports_to: (payload.reports_to as string) ?? null,
      persona: (payload.persona as string) ?? '',
      config: {},
      heartbeat_checklist: {},
    });
  }

  return NextResponse.json(resolved);
}

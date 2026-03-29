/**
 * Manual Routine Trigger API
 *
 * POST /api/apex/routines/[id]/trigger — Manually trigger a routine execution.
 *
 * Spawns an issue from the routine's template immediately,
 * regardless of schedule or event pattern.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRole } from '@/lib/supabase-server';
import { z } from 'zod';

const TriggerSchema = z.object({
  company_id: z.string().uuid(),
  /** Optional event payload to interpolate into the template */
  event_payload: z.record(z.unknown()).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const routineId = params.id;
  const supabase = getSupabaseServiceRole();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const parsed = TriggerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { company_id, event_payload } = parsed.data;

  // Fetch the routine
  const { data: routine, error: routineError } = await supabase
    .from('routines')
    .select('*')
    .eq('id', routineId)
    .eq('company_id', company_id)
    .single();

  if (routineError || !routine) {
    return NextResponse.json(
      { error: 'Routine not found' },
      { status: 404 }
    );
  }

  const template = routine.issue_template as {
    title: string;
    description: string;
    success_condition?: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    metadata?: Record<string, unknown>;
  } | null;

  if (!template) {
    return NextResponse.json(
      { error: 'Routine has no issue template' },
      { status: 400 }
    );
  }

  // Spawn issue from template
  const { data: issue, error: issueError } = await supabase
    .from('issues')
    .insert({
      company_id,
      title: template.title,
      description: template.description,
      priority: template.priority ?? 'medium',
      metadata: {
        ...(template.metadata ?? {}),
        spawned_by_routine: routineId,
        routine_name: routine.name,
        manual_trigger: true,
        triggered_at: new Date().toISOString(),
        ...(template.success_condition ? { success_condition: template.success_condition } : {}),
        ...(event_payload ? { event_payload } : {}),
      },
    })
    .select('id')
    .single();

  if (issueError) {
    return NextResponse.json(
      { error: `Failed to create issue: ${issueError.message}` },
      { status: 500 }
    );
  }

  // Update routine tracking
  await supabase
    .from('routines')
    .update({
      last_run_at: new Date().toISOString(),
      last_status: 'success',
      run_count: ((routine.run_count as number) ?? 0) + 1,
    })
    .eq('id', routineId);

  // Record the run
  const now = new Date().toISOString();
  await supabase.from('routine_runs').insert({
    routine_id: routineId,
    company_id,
    issue_id: issue.id,
    status: 'success',
    started_at: now,
    completed_at: now,
    metadata: { manual_trigger: true },
  });

  return NextResponse.json(
    { success: true, issue_id: issue.id, routine_id: routineId },
    { status: 200 }
  );
}

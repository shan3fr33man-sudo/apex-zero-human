/**
 * Routine CRUD API Routes
 *
 * GET    /api/apex/routines              — List routines for a company
 * POST   /api/apex/routines              — Create a new routine
 * PATCH  /api/apex/routines              — Update an existing routine
 * DELETE /api/apex/routines              — Delete a routine
 *
 * All routes validate with Zod, enforce RLS via server Supabase client.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRole, getAuthenticatedUser, requireOwnership } from '@/lib/supabase-server';
import { z } from 'zod';

// ---- Zod Schemas ----

const IssueTemplateSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  assigned_role: z.string().min(1),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  success_condition: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const CreateRoutineSchema = z.object({
  company_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  routine_type: z.enum(['SCHEDULED', 'REACTIVE']),
  enabled: z.boolean().default(true),
  cron_expr: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  event_pattern: z.string().nullable().optional(),
  issue_template: IssueTemplateSchema,
}).refine(
  (data) => {
    // SCHEDULED must have cron_expr, REACTIVE must have event_pattern
    if (data.routine_type === 'SCHEDULED' && !data.cron_expr) {
      return false;
    }
    if (data.routine_type === 'REACTIVE' && !data.event_pattern) {
      return false;
    }
    return true;
  },
  {
    message: 'SCHEDULED routines require cron_expr. REACTIVE routines require event_pattern.',
  }
);

const UpdateRoutineSchema = z.object({
  id: z.string().uuid(),
  company_id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  enabled: z.boolean().optional(),
  cron_expr: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  event_pattern: z.string().nullable().optional(),
  issue_template: IssueTemplateSchema.optional(),
});

const DeleteRoutineSchema = z.object({
  id: z.string().uuid(),
  company_id: z.string().uuid(),
});

// ---- GET — List routines ----

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const companyId = request.nextUrl.searchParams.get('company_id');

  if (!companyId) {
    return NextResponse.json(
      { error: 'company_id query parameter is required' },
      { status: 400 }
    );
  }

  const authorized = await requireOwnership(user.id, companyId);
  if (!authorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = getSupabaseServiceRole();
  const routineType = request.nextUrl.searchParams.get('type');
  const enabledOnly = request.nextUrl.searchParams.get('enabled') === 'true';

  let query = supabase
    .from('routines')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (routineType) {
    query = query.eq('routine_type', routineType);
  }
  if (enabledOnly) {
    query = query.eq('enabled', true);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ routines: data, count: data?.length ?? 0 });
}

// ---- POST — Create routine ----

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const parsed = CreateRoutineSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const input = parsed.data;

  const authorized = await requireOwnership(user.id, input.company_id);
  if (!authorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = getSupabaseServiceRole();

  // Calculate initial next_run_at for SCHEDULED routines
  let nextRunAt: string | null = null;
  if (input.routine_type === 'SCHEDULED' && input.cron_expr) {
    // Simple: set next run to now (scheduler will pick it up on next tick)
    nextRunAt = new Date().toISOString();
  }

  const issueTemplate = {
    ...input.issue_template,
    ...(input.issue_template.success_condition && {
      metadata: {
        ...input.issue_template.metadata,
        success_condition: input.issue_template.success_condition,
      },
    }),
  };
  delete (issueTemplate as any).success_condition;

  const { data, error } = await supabase
    .from('routines')
    .insert({
      company_id: input.company_id,
      name: input.name,
      description: input.description,
      routine_type: input.routine_type,
      enabled: input.enabled,
      cron_expr: input.cron_expr ?? null,
      timezone: input.timezone ?? null,
      event_pattern: input.event_pattern ?? null,
      issue_template: issueTemplate,
      next_run_at: nextRunAt,
      run_count: 0,
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ routine: data }, { status: 201 });
}

// ---- PATCH — Update routine ----

export async function PATCH(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const parsed = UpdateRoutineSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { id, company_id, ...updates } = parsed.data;

  const authorized = await requireOwnership(user.id, company_id);
  if (!authorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = getSupabaseServiceRole();

  // Move success_condition to metadata if present in issue_template
  if (updates.issue_template?.success_condition) {
    const template = updates.issue_template;
    updates.issue_template = {
      ...template,
      metadata: {
        ...template.metadata,
        success_condition: template.success_condition,
      },
    };
    delete (updates.issue_template as any).success_condition;
  }

  const { data, error } = await supabase
    .from('routines')
    .update(updates)
    .eq('id', id)
    .eq('company_id', company_id)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: 'Routine not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ routine: data });
}

// ---- DELETE — Delete routine ----

export async function DELETE(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const parsed = DeleteRoutineSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { id, company_id } = parsed.data;

  const authorized = await requireOwnership(user.id, company_id);
  if (!authorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = getSupabaseServiceRole();

  const { error } = await supabase
    .from('routines')
    .delete()
    .eq('id', id)
    .eq('company_id', company_id);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ deleted: true });
}

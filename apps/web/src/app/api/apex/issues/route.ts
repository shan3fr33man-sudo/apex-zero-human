/**
 * Issues API Routes
 *
 * GET  /api/apex/issues              — List issues by company_id query param
 * POST /api/apex/issues              — Create a new issue
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRole, getAuthenticatedUser, requireOwnership } from '@/lib/supabase-server';
import { parsePagination, paginatedResponse } from '@/lib/pagination';
import { z } from 'zod';

const CreateIssueSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  company_id: z.string().uuid(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  assigned_to: z.string().uuid().optional(),
});

/**
 * GET /api/apex/issues
 * Returns all issues for a company
 * Query params: company_id (required)
 */
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

  const { page, limit, offset } = parsePagination(request.nextUrl.searchParams);
  const supabase = getSupabaseServiceRole();
  const { data, error, count } = await supabase
    .from('issues')
    .select('*', { count: 'exact' })
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return paginatedResponse(data, count, page, limit);
}

/**
 * POST /api/apex/issues
 * Create a new issue
 * Request body: { title, description?, company_id, priority?, assigned_to? }
 */
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

  const parsed = CreateIssueSchema.safeParse(body);
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
  const { data, error } = await supabase
    .from('issues')
    .insert({
      title: input.title,
      description: input.description ?? null,
      company_id: input.company_id,
      priority: input.priority ?? 'medium',
      assigned_to: input.assigned_to ?? null,
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ issue: data }, { status: 201 });
}

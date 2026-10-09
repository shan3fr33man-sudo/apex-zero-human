/**
 * Agents API Routes
 *
 * GET  /api/apex/agents              — List agents by company_id query param
 * POST /api/apex/agents              — Create a new agent
 *
 * All routes require authentication and ownership verification.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRole, getAuthenticatedUser, requireOwnership } from '@/lib/supabase-server';
import { parsePagination, paginatedResponse } from '@/lib/pagination';
import { z } from 'zod';

const CreateAgentSchema = z.object({
  name: z.string().min(1).max(255),
  role: z.string().min(1).max(255),
  company_id: z.string().uuid(),
  model_tier: z.enum(['basic', 'pro', 'enterprise']).optional(),
  reports_to: z.string().uuid().optional(),
});

/**
 * GET /api/apex/agents
 * Returns all agents for a company ordered by created_at
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
    .from('agents')
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
 * POST /api/apex/agents
 * Create a new agent
 * Request body: { name, role, company_id, model_tier?, reports_to? }
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

  const parsed = CreateAgentSchema.safeParse(body);
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
    .from('agents')
    .insert({
      name: input.name,
      role: input.role,
      company_id: input.company_id,
      model_tier: input.model_tier ?? null,
      reports_to: input.reports_to ?? null,
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ agent: data }, { status: 201 });
}

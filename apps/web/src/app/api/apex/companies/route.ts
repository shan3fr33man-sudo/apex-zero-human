/**
 * Companies API Routes
 *
 * GET  /api/apex/companies              — List all companies ordered by created_at desc
 * POST /api/apex/companies              — Create a new company
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRole, getAuthenticatedUser, requireOwnership } from '@/lib/supabase-server';
import { parsePagination, paginatedResponse } from '@/lib/pagination';
import { z } from 'zod';

const CreateCompanySchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  org_id: z.string().uuid().optional(),
});

/**
 * GET /api/apex/companies
 * Returns all companies user has access to, ordered by created_at desc
 */
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseServiceRole();

  // Get user's org memberships
  const { data: memberships, error: membershipError } = await supabase
    .from('memberships')
    .select('org_id')
    .eq('user_id', user.id);

  if (membershipError || !memberships || memberships.length === 0) {
    return NextResponse.json({ companies: [], count: 0 });
  }

  const orgIds = memberships.map((m) => (m as { org_id: string }).org_id);

  // Fetch companies for those orgs with pagination
  const { page, limit, offset } = parsePagination(request.nextUrl.searchParams);
  const { data, error, count } = await supabase
    .from('companies')
    .select('*', { count: 'exact' })
    .in('org_id', orgIds)
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
 * POST /api/apex/companies
 * Create a new company
 * Request body: { name, slug?, description?, org_id? }
 * If no org_id, uses the user's first org membership
 * Auto-generates slug from name if not provided
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

  const parsed = CreateCompanySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const input = parsed.data;
  let org_id = input.org_id;

  const supabase = getSupabaseServiceRole();

  // If no org_id provided, fetch the user's first org membership
  if (!org_id) {
    const { data: memberships, error: membershipError } = await supabase
      .from('memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1);

    if (membershipError) {
      return NextResponse.json(
        { error: 'Failed to fetch organizations: ' + membershipError.message },
        { status: 500 }
      );
    }

    if (!memberships || memberships.length === 0) {
      return NextResponse.json(
        { error: 'No organizations found. Please provide org_id.' },
        { status: 400 }
      );
    }

    org_id = (memberships[0] as { org_id: string }).org_id;
  } else {
    // Verify user has access to the specified org
    const { data: membership } = await supabase
      .from('memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('org_id', org_id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: 'Forbidden: no access to this organization' },
        { status: 403 }
      );
    }
  }

  // Auto-generate slug from name if not provided
  const slug = input.slug || input.name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');

  const { data, error } = await supabase
    .from('companies')
    .insert({
      name: input.name,
      slug,
      description: input.description ?? null,
      org_id,
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ company: data }, { status: 201 });
}

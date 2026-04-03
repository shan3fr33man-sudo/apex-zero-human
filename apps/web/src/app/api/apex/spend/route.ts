/**
 * Spend API Routes
 *
 * GET /api/apex/spend              — Token spend summary by company_id query param
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRole, getAuthenticatedUser, requireOwnership } from '@/lib/supabase-server';
import { parsePagination, paginatedResponse } from '@/lib/pagination';

/**
 * GET /api/apex/spend
 * Returns token_spend_log entries for a company
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
    .from('token_spend_log')
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

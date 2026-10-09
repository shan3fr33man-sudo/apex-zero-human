/**
 * Audit API Routes
 *
 * GET /api/apex/audit              — Audit logs by company_id query param
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRole, getAuthenticatedUser, requireOwnership } from '@/lib/supabase-server';

/**
 * GET /api/apex/audit
 * Returns audit_log entries for a company
 * Query params: company_id (required), limit (optional, default: 100)
 */
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const companyId = request.nextUrl.searchParams.get('company_id');
  const limitParam = request.nextUrl.searchParams.get('limit');

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

  const limit = limitParam ? parseInt(limitParam, 10) : 100;

  if (isNaN(limit) || limit < 1) {
    return NextResponse.json(
      { error: 'limit must be a positive integer' },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServiceRole();
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .eq('company_id', companyId)
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ audit_log: data, count: data?.length ?? 0 });
}

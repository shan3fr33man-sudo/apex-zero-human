import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRole, getAuthenticatedUser, requireOwnership } from '@/lib/supabase-server';

/**
 * GET /api/apex/fleet/status?company_id=xxx
 * Returns resource status for a company — assets, teams, availability.
 * Pulls from company config (resource data is stored in config.fleet).
 */
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get('company_id');

  if (!companyId) {
    return NextResponse.json({ error: 'company_id required' }, { status: 400 });
  }

  const authorized = await requireOwnership(user.id, companyId);
  if (!authorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = getSupabaseServiceRole();

  const { data: company, error } = await supabase
    .from('companies')
    .select('config')
    .eq('id', companyId)
    .single();

  if (error || !company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  const config = company.config as Record<string, unknown>;
  const fleet = (config?.fleet as Array<Record<string, unknown>>) ?? [];

  return NextResponse.json({
    company_id: companyId,
    resources: fleet,
    summary: {
      total_resources: fleet.length,
      available: fleet.filter(
        (v) => v.status === 'available'
      ).length,
      in_use: fleet.filter(
        (v) => v.status === 'in_use'
      ).length,
      maintenance: fleet.filter(
        (v) => v.status === 'maintenance'
      ).length,
    },
  });
}

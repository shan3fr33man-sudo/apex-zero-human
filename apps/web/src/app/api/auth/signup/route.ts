import { NextResponse } from 'next/server';
import { getSupabaseServiceRole } from '@/lib/supabase-server';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });

    const supabase = getSupabaseServiceRole();
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
    if (authError) return NextResponse.json({ error: authError.message }, { status: 400 });

    const authUser = authData.user;
    const { data: tenant } = await supabase.from('tenants').insert({ name: 'Default', slug: `tenant-${authUser.id.slice(0, 8)}` }).select().single();
    let org = null;
    if (tenant) {
      const { data: orgData } = await supabase.from('organizations').insert({ tenant_id: tenant.id, name: 'My Organization', slug: `org-${authUser.id.slice(0, 8)}` }).select().single();
      org = orgData;
    }
    const { data: userRecord } = await supabase.from('users').insert({ auth_id: authUser.id, email: authUser.email, role: 'owner' }).select().single();
    if (org && userRecord) {
      await supabase.from('memberships').insert({ user_id: userRecord.id, org_id: org.id, role: 'owner' });
    }
    return NextResponse.json({ user: { id: authUser.id, email: authUser.email }, orgId: org?.id ?? null });
  } catch (err) {
    console.error('[signup] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

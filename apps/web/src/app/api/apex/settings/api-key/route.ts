/**
 * POST /api/apex/settings/api-key — Save and verify Claude API key
 * DELETE /api/apex/settings/api-key — Remove Claude API key
 */
import { NextResponse } from 'next/server';
import { getSupabaseServiceRole } from '@/lib/supabase-server';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// ---- Inline encryption (same algo as orchestrator key-vault) ----
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function getEncryptionSecret(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('ENCRYPTION_SECRET must be set (min 32 chars)');
  }
  return Buffer.from(secret.slice(0, 32), 'utf8');
}

function encryptKey(plaintext: string): string {
  const key = getEncryptionSecret();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

// ---- Verify key by making minimal Anthropic API call ----
async function verifyClaudeKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say ok' }],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---- Resolve tenant from auth user ----
async function getTenantId(supabase: ReturnType<typeof getSupabaseServiceRole>, authId: string): Promise<string | null> {
  const { data: user } = await supabase.from('users').select('id').eq('auth_id', authId).single();
  if (!user) return null;
  const { data: membership } = await supabase.from('memberships').select('org_id').eq('user_id', user.id).single();
  if (!membership) return null;
  const { data: org } = await supabase.from('organizations').select('tenant_id').eq('id', membership.org_id).single();
  return org?.tenant_id ?? null;
}

// ---- POST: Save + verify key ----
export async function POST(request: Request) {
  try {
    const { claude_api_key, openrouter_api_key } = await request.json();
    if (!claude_api_key) {
      return NextResponse.json({ error: 'Claude API key is required' }, { status: 400 });
    }

    // Get auth user from cookie/header
    const supabase = getSupabaseServiceRole();
    const authHeader = request.headers.get('x-auth-id');
    if (!authHeader) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const tenantId = await getTenantId(supabase, authHeader);
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Verify the key works
    const valid = await verifyClaudeKey(claude_api_key);
    if (!valid) {
      await supabase.from('tenants').update({
        byok_verified: false,
        byok_last_error: 'API key verification failed — key is invalid or expired',
      }).eq('id', tenantId);
      return NextResponse.json({ error: 'Invalid API key — verification failed' }, { status: 400 });
    }

    // Encrypt and store
    const encrypted = encryptKey(claude_api_key);
    const updateData: Record<string, unknown> = {
      claude_api_key_encrypted: encrypted,
      byok_verified: true,
      byok_verified_at: new Date().toISOString(),
      byok_last_error: null,
    };

    if (openrouter_api_key) {
      updateData.openrouter_api_key_encrypted = encryptKey(openrouter_api_key);
    }

    await supabase.from('tenants').update(updateData).eq('id', tenantId);

    return NextResponse.json({ success: true, verified_at: new Date().toISOString() });
  } catch (err) {
    console.error('[api-key] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---- DELETE: Remove key ----
export async function DELETE(request: Request) {
  try {
    const supabase = getSupabaseServiceRole();
    const authHeader = request.headers.get('x-auth-id');
    if (!authHeader) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const tenantId = await getTenantId(supabase, authHeader);
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    await supabase.from('tenants').update({
      claude_api_key_encrypted: null,
      openrouter_api_key_encrypted: null,
      byok_verified: false,
      byok_verified_at: null,
      byok_last_error: null,
    }).eq('id', tenantId);

    // Pause all agents for companies in this tenant
    const { data: orgs } = await supabase.from('organizations').select('id').eq('tenant_id', tenantId);
    if (orgs) {
      for (const org of orgs) {
        const { data: companies } = await supabase.from('companies').select('id').eq('org_id', org.id);
        if (companies) {
          for (const company of companies) {
            await supabase.from('agents').update({ status: 'paused' }).eq('company_id', company.id).in('status', ['idle', 'working']);
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[api-key] Delete error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---- GET: Key status ----
export async function GET(request: Request) {
  try {
    const supabase = getSupabaseServiceRole();
    const authHeader = request.headers.get('x-auth-id');
    if (!authHeader) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const tenantId = await getTenantId(supabase, authHeader);
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const { data: tenant } = await supabase
      .from('tenants')
      .select('byok_verified, byok_verified_at, byok_last_error, claude_api_key_encrypted, openrouter_api_key_encrypted')
      .eq('id', tenantId)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    return NextResponse.json({
      has_claude_key: !!tenant.claude_api_key_encrypted,
      has_openrouter_key: !!tenant.openrouter_api_key_encrypted,
      verified: tenant.byok_verified ?? false,
      verified_at: tenant.byok_verified_at,
      last_error: tenant.byok_last_error,
    });
  } catch (err) {
    console.error('[api-key] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

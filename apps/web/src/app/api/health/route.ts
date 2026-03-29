import { NextResponse } from 'next/server';
import { getSupabaseServiceRole } from '@/lib/supabase-server';

/**
 * GET /api/health
 * No auth required. Used by deploy script, Nginx, and external monitoring.
 * Returns 200 if healthy, 500 if database unreachable.
 */
export async function GET() {
  const start = Date.now();

  try {
    const supabase = getSupabaseServiceRole();

    // Quick connectivity check — one-row select
    const { error } = await supabase
      .from('companies')
      .select('id')
      .limit(1);

    const latencyMs = Date.now() - start;

    if (error) {
      return NextResponse.json(
        {
          status: 'degraded',
          database: 'error',
          error: error.message,
          timestamp: new Date().toISOString(),
          latency_ms: latencyMs,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: 'ok',
      database: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '1.0.0',
      latency_ms: latencyMs,
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: 'error',
        database: 'unreachable',
        timestamp: new Date().toISOString(),
        latency_ms: Date.now() - start,
      },
      { status: 500 }
    );
  }
}

/**
 * Generic Webhook Ingestion API
 *
 * Receives webhooks from any provider, validates signature, normalizes
 * payload into standard APEX event format, writes to events table,
 * which triggers Postgres NOTIFY on apex_events channel.
 *
 * Route: POST /api/webhooks/[provider]
 *
 * Supported providers are configured per company — never hardcoded.
 * Provider-specific signature validation and payload normalization
 * are handled via a pluggable normalizer registry.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRole } from '@/lib/supabase-server';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Normalized APEX event structure.
 */
interface NormalizedEvent {
  event_type: string;
  payload: Record<string, unknown>;
  source: string;
  raw_provider: string;
}

/**
 * Provider signature validation config — loaded from company webhook settings.
 */
interface WebhookProviderConfig {
  signing_secret: string;
  header_name: string;
  algorithm: string;
  company_id: string;
}

// ---- Route Handler ----

export async function POST(
  request: NextRequest,
  { params }: { params: { provider: string } }
) {
  const provider = params.provider;
  const supabase = getSupabaseServiceRole();

  try {
    // 1. Read the raw body for signature validation
    const rawBody = await request.text();
    let payload: Record<string, unknown>;

    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    // 2. Look up webhook config for this provider
    // Multiple companies can use the same provider — we identify the company
    // via a company_id query param or a provider-specific identifier in the payload
    const companyId = request.nextUrl.searchParams.get('company_id')
      ?? (payload.company_id as string | undefined)
      ?? null;

    if (!companyId) {
      return NextResponse.json(
        { error: 'Missing company_id — pass as query param or in payload' },
        { status: 400 }
      );
    }

    // 3. Validate the company exists and has this webhook provider configured
    const { data: company } = await supabase
      .from('companies')
      .select('id, settings')
      .eq('id', companyId)
      .single();

    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      );
    }

    // 4. Validate webhook signature if provider config exists
    const settings = company.settings as Record<string, unknown> | null;
    const webhookConfigs = (settings?.webhook_providers ?? {}) as Record<string, WebhookProviderConfig>;
    const providerConfig = webhookConfigs[provider];

    if (providerConfig?.signing_secret) {
      const isValid = validateSignature(
        request,
        rawBody,
        providerConfig.signing_secret,
        providerConfig.header_name ?? `x-${provider}-signature`,
        providerConfig.algorithm ?? 'sha256'
      );

      if (!isValid) {
        return NextResponse.json(
          { error: 'Invalid webhook signature' },
          { status: 401 }
        );
      }
    }

    // 5. Normalize the payload into standard APEX event format
    const normalizedEvent = normalizePayload(provider, payload);

    // 6. Write to events table (triggers Postgres NOTIFY automatically)
    const { data: event, error: insertError } = await supabase
      .from('events')
      .insert({
        company_id: companyId,
        event_type: normalizedEvent.event_type,
        source: normalizedEvent.source,
        payload: normalizedEvent.payload,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Failed to insert event:', insertError.message);
      return NextResponse.json(
        { error: 'Failed to process webhook' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, event_id: event.id },
      { status: 200 }
    );
  } catch (err) {
    console.error('Webhook processing error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ---- Signature Validation ----

function validateSignature(
  request: NextRequest,
  rawBody: string,
  secret: string,
  headerName: string,
  algorithm: string
): boolean {
  const signature = request.headers.get(headerName);
  if (!signature) return false;

  try {
    const computed = createHmac(algorithm, secret)
      .update(rawBody)
      .digest('hex');

    // Handle signatures with algorithm prefix (e.g., "sha256=abc123")
    const signatureValue = signature.includes('=')
      ? signature.split('=').slice(1).join('=')
      : signature;

    return timingSafeEqual(
      Buffer.from(computed, 'hex'),
      Buffer.from(signatureValue, 'hex')
    );
  } catch {
    return false;
  }
}

// ---- Payload Normalization ----

/**
 * Normalize a provider-specific webhook payload into a standard APEX event.
 * This is intentionally generic — provider-specific normalization logic
 * can be extended by adding cases here or via company config.
 */
function normalizePayload(
  provider: string,
  payload: Record<string, unknown>
): NormalizedEvent {
  // Common normalizer: look for event_type or type or action in payload
  const eventType =
    (payload.event_type as string) ??
    (payload.type as string) ??
    (payload.event as string) ??
    (payload.action as string) ??
    `${provider}_webhook`;

  // Common normalizer: pass through payload, tag with provider
  return {
    event_type: `${provider}.${eventType}`,
    payload: {
      ...payload,
      _provider: provider,
      _received_at: new Date().toISOString(),
    },
    source: provider,
    raw_provider: provider,
  };
}

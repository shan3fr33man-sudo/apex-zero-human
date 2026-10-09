/**
 * POST /api/stripe/checkout
 * Creates a Stripe Checkout session for a given plan.
 * Body: { plan: 'starter' | 'professional' | 'enterprise', annual: boolean }
 * Requires authenticated user with an organization.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion,
});

// Maps plan slug + billing period to Stripe Price IDs
// Set these in your .env after creating products in Stripe Dashboard
const PRICE_MAP: Record<string, string | undefined> = {
  'starter_monthly': process.env.STRIPE_STARTER_MONTHLY_PRICE_ID,
  'starter_annual': process.env.STRIPE_STARTER_ANNUAL_PRICE_ID,
  'professional_monthly': process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
  'professional_annual': process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
  'enterprise_monthly': process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID,
  'enterprise_annual': process.env.STRIPE_ENTERPRISE_ANNUAL_PRICE_ID,
};

export async function POST(req: NextRequest) {
  try {
    const { plan, annual } = await req.json();

    if (!plan || !['starter', 'professional', 'enterprise'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: 'Stripe is not configured. See STRIPE_SETUP_REQUIRED.md' },
        { status: 503 }
      );
    }

    // Get authenticated user from Supabase cookie
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '') || req.cookies.get('sb-access-token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify user and get their org
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Get user's organization
    const { data: membership } = await supabase
      .from('memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 });
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, stripe_customer_id')
      .eq('id', membership.org_id)
      .single();

    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Resolve Stripe price ID
    const priceKey = `${plan}_${annual ? 'annual' : 'monthly'}`;
    const priceId = PRICE_MAP[priceKey];

    if (!priceId) {
      return NextResponse.json(
        { error: `Price ID not configured for ${priceKey}. Check environment variables.` },
        { status: 503 }
      );
    }

    // Create or reuse Stripe customer
    let customerId = org.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: org.name,
        metadata: { org_id: org.id, user_id: user.id },
      });
      customerId = customer.id;

      // Save customer ID to org
      await supabase
        .from('organizations')
        .update({ stripe_customer_id: customerId })
        .eq('id', org.id);
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://apex-code.tech'}/dashboard?checkout=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://apex-code.tech'}/pricing?checkout=canceled`,
      metadata: { org_id: org.id },
      subscription_data: {
        metadata: { org_id: org.id },
        trial_period_days: plan !== 'enterprise' ? 14 : undefined,
      },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('[stripe-checkout] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}

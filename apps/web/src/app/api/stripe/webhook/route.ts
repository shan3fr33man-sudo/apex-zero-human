/**
 * POST /api/stripe/webhook
 * Stripe webhook handler — processes subscription lifecycle events.
 * Updates organizations table with plan, stripe_customer_id, stripe_subscription_id.
 */
import { NextResponse } from 'next/server';
import { getSupabaseServiceRole } from '@/lib/supabase-server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion,
});

const PRICE_TO_PLAN: Record<string, string> = {
  // Populate from env — these are set when creating products in Stripe Dashboard
  ...(process.env.STRIPE_STARTER_MONTHLY_PRICE_ID && { [process.env.STRIPE_STARTER_MONTHLY_PRICE_ID]: 'starter' }),
  ...(process.env.STRIPE_STARTER_ANNUAL_PRICE_ID && { [process.env.STRIPE_STARTER_ANNUAL_PRICE_ID]: 'starter' }),
  ...(process.env.STRIPE_PRO_MONTHLY_PRICE_ID && { [process.env.STRIPE_PRO_MONTHLY_PRICE_ID]: 'professional' }),
  ...(process.env.STRIPE_PRO_ANNUAL_PRICE_ID && { [process.env.STRIPE_PRO_ANNUAL_PRICE_ID]: 'professional' }),
  ...(process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID && { [process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID]: 'enterprise' }),
  ...(process.env.STRIPE_ENTERPRISE_ANNUAL_PRICE_ID && { [process.env.STRIPE_ENTERPRISE_ANNUAL_PRICE_ID]: 'enterprise' }),
};

export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing signature or webhook secret' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = getSupabaseServiceRole();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = session.customer as string;
      const subscriptionId = session.subscription as string;
      const orgId = session.metadata?.org_id;

      if (!orgId) {
        console.error('[stripe-webhook] No org_id in session metadata');
        break;
      }

      // Get subscription to determine plan
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = subscription.items.data[0]?.price.id;
      const plan = PRICE_TO_PLAN[priceId] || 'starter';

      await supabase.from('organizations').update({
        plan,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
      }).eq('id', orgId);

      console.log(`[stripe-webhook] Org ${orgId} upgraded to ${plan}`);
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      const priceId = subscription.items.data[0]?.price.id;
      const plan = PRICE_TO_PLAN[priceId] || 'starter';
      const orgId = subscription.metadata?.org_id;

      if (orgId) {
        await supabase.from('organizations').update({
          plan,
        }).eq('id', orgId);
      } else {
        // Fallback: find org by subscription ID
        await supabase.from('organizations').update({
          plan,
        }).eq('stripe_subscription_id', subscription.id);
      }

      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;

      // Find org by subscription ID and downgrade to free
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('stripe_subscription_id', subscription.id)
        .single();

      if (org) {
        await supabase.from('organizations').update({
          plan: 'free',
          stripe_subscription_id: null,
        }).eq('id', org.id);

        // Create inbox alert for all companies in this org
        const { data: companies } = await supabase
          .from('companies')
          .select('id')
          .eq('org_id', org.id);

        if (companies) {
          for (const company of companies) {
            await supabase.from('inbox_items').insert({
              company_id: company.id,
              item_type: 'SYSTEM_ALERT',
              title: 'Subscription canceled — downgraded to Free plan',
              description: 'Your subscription has been canceled. Agents exceeding the free plan limits have been paused.',
              payload: { type: 'PLAN_DOWNGRADED' },
            });

            // Pause agents beyond free limit (keep first 3)
            const { data: agents } = await supabase
              .from('agents')
              .select('id')
              .eq('company_id', company.id)
              .order('created_at', { ascending: true });

            if (agents && agents.length > 3) {
              const toPause = agents.slice(3).map(a => a.id);
              await supabase.from('agents').update({ status: 'paused' }).in('id', toPause);
            }
          }
        }

        console.log(`[stripe-webhook] Org ${org.id} downgraded to free`);
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoice.subscription as string;

      // Find org and alert them
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('stripe_subscription_id', subscriptionId)
        .single();

      if (org) {
        const { data: companies } = await supabase
          .from('companies')
          .select('id')
          .eq('org_id', org.id);

        if (companies) {
          for (const company of companies) {
            await supabase.from('inbox_items').insert({
              company_id: company.id,
              item_type: 'SYSTEM_ALERT',
              title: 'Payment failed — please update your billing info',
              description: 'Your subscription payment failed. Please update your payment method to avoid service interruption.',
              payload: { type: 'PAYMENT_FAILED', invoice_id: invoice.id },
            });
          }
        }
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}

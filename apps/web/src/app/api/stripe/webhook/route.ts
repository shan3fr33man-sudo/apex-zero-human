/**
 * Stripe webhook handler
 * Processes subscription events and updates tenant plan.
 */
import { NextResponse } from 'next/server';
import { getSupabaseServiceRole } from '@/lib/supabase-server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion,
});

const PRICE_TO_PLAN: Record<string, string> = {
  // These will be set from Stripe dashboard
  // price_starter_monthly: 'starter',
  // price_starter_yearly: 'starter',
  // price_pro_monthly: 'professional',
  // price_pro_yearly: 'professional',
  // price_enterprise_monthly: 'enterprise',
  // price_enterprise_yearly: 'enterprise',
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
      const tenantId = session.metadata?.tenant_id;

      if (!tenantId) {
        console.error('[stripe-webhook] No tenant_id in session metadata');
        break;
      }

      // Get subscription to determine plan
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = subscription.items.data[0]?.price.id;
      const plan = PRICE_TO_PLAN[priceId] || 'starter';

      await supabase.from('tenants').update({
        plan,
        plan_status: subscription.status === 'trialing' ? 'trialing' : 'active',
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        trial_ends_at: subscription.trial_end
          ? new Date(subscription.trial_end * 1000).toISOString()
          : null,
        plan_changed_at: new Date().toISOString(),
      }).eq('id', tenantId);

      console.log(`[stripe-webhook] Tenant ${tenantId} upgraded to ${plan}`);
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      const priceId = subscription.items.data[0]?.price.id;
      const plan = PRICE_TO_PLAN[priceId] || 'starter';

      await supabase.from('tenants').update({
        plan,
        plan_status: subscription.status === 'past_due' ? 'past_due' : 'active',
        plan_changed_at: new Date().toISOString(),
      }).eq('stripe_subscription_id', subscription.id);

      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;

      // Downgrade to free
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('stripe_subscription_id', subscription.id)
        .single();

      if (tenant) {
        await supabase.from('tenants').update({
          plan: 'free',
          plan_status: 'canceled',
          stripe_subscription_id: null,
          plan_changed_at: new Date().toISOString(),
        }).eq('id', tenant.id);

        // Create inbox alert for all companies in this tenant
        const { data: orgs } = await supabase.from('organizations').select('id').eq('tenant_id', tenant.id);
        if (orgs) {
          for (const org of orgs) {
            const { data: companies } = await supabase.from('companies').select('id').eq('org_id', org.id);
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
          }
        }
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}

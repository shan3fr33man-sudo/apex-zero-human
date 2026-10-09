# Stripe Integration — Setup Required

APEX pricing page is live at https://apex-code.tech/pricing but Stripe checkout is **not yet connected**. This document describes exactly what needs to be done.

## Current State

- Pricing page renders 4 tiers: Free, Starter ($49/mo), Professional ($149/mo), Enterprise ($499/mo)
- "Get Started" buttons exist but do NOT create Stripe Checkout sessions yet
- No Stripe environment variables are configured on the VPS
- The billing settings page (`/settings/billing`) exists but has no active subscription management

## What You Need

1. A **Stripe account** at https://dashboard.stripe.com
2. Your **Stripe Secret Key** (`sk_live_...` or `sk_test_...`)
3. Your **Stripe Publishable Key** (`pk_live_...` or `pk_test_...`)
4. A **Stripe Webhook Signing Secret** (`whsec_...`)

## Setup Steps

### 1. Create Products in Stripe Dashboard

Create 3 products with these exact price IDs (or update the code to match yours):

| Plan | Monthly Price | Annual Price |
|------|--------------|--------------|
| Starter | $49/mo | $490/yr |
| Professional | $149/mo | $1,490/yr |
| Enterprise | $499/mo | $4,990/yr |

### 2. Add Environment Variables to VPS

SSH into the VPS and edit the web app's `.env` file:

```bash
ssh root@76.13.103.14
nano ~/apex-zero-human/apps/web/.env
```

Add these variables:

```env
STRIPE_SECRET_KEY=sk_live_YOUR_KEY_HERE
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_YOUR_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET_HERE
STRIPE_STARTER_MONTHLY_PRICE_ID=price_XXXXX
STRIPE_STARTER_ANNUAL_PRICE_ID=price_XXXXX
STRIPE_PRO_MONTHLY_PRICE_ID=price_XXXXX
STRIPE_PRO_ANNUAL_PRICE_ID=price_XXXXX
STRIPE_ENTERPRISE_MONTHLY_PRICE_ID=price_XXXXX
STRIPE_ENTERPRISE_ANNUAL_PRICE_ID=price_XXXXX
```

### 3. Create Stripe Webhook

In Stripe Dashboard → Developers → Webhooks:

- Endpoint URL: `https://apex-code.tech/api/webhooks/stripe`
- Events to listen for:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`

### 4. Implement Checkout API Route

Create `apps/web/src/app/api/stripe/checkout/route.ts`:

```typescript
// Creates a Stripe Checkout session for a given price ID
// On success, redirects to /dashboard
// On cancel, redirects to /pricing
```

### 5. Implement Webhook Handler

Update `apps/web/src/app/api/webhooks/stripe/route.ts` to:

- Verify the webhook signature
- Handle subscription lifecycle events
- Update the `organizations` table with `stripe_customer_id`, `stripe_subscription_id`, `plan_tier`

### 6. Rebuild and Reload

```bash
cd ~/apex-zero-human
npm run build --workspace=apps/web
pm2 reload apex-web --update-env
```

## Database Columns Already Present

The `organizations` table already has these Stripe-ready columns:

- `stripe_customer_id` (text, nullable)
- `stripe_subscription_id` (text, nullable)
- `plan` (text, default 'free')

No migration needed.

## Testing

1. Use Stripe test mode keys first (`sk_test_...`)
2. Use Stripe test card: `4242 4242 4242 4242`
3. Verify webhook delivery in Stripe Dashboard → Developers → Webhooks → Recent events
4. Switch to live keys when ready for production

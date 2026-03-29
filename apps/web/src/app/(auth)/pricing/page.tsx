'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const plans = [
  {
    name: 'Free',
    slug: 'free',
    price: { monthly: 0, yearly: 0 },
    features: [
      '1 company',
      '3 agents per company',
      '50 issues/month',
      '100K tokens/month',
      'Community support',
    ],
    cta: 'Get Started Free',
    highlight: false,
  },
  {
    name: 'Starter',
    slug: 'starter',
    price: { monthly: 29, yearly: 290 },
    features: [
      '3 companies',
      '10 agents per company',
      '500 issues/month',
      '1M tokens/month',
      'Custom skills',
      'Export templates',
      'Marketplace access',
      'Email support',
    ],
    cta: 'Start Free Trial',
    highlight: false,
  },
  {
    name: 'Professional',
    slug: 'professional',
    price: { monthly: 99, yearly: 990 },
    features: [
      '10 companies',
      '50 agents per company',
      '5,000 issues/month',
      '10M tokens/month',
      'Everything in Starter',
      'BYOA protocol',
      'Plugin system',
      'Self-Evolution Engine',
      'Priority support',
    ],
    cta: 'Start Free Trial',
    highlight: true,
  },
  {
    name: 'Enterprise',
    slug: 'enterprise',
    price: { monthly: 299, yearly: 2990 },
    features: [
      'Unlimited companies',
      'Unlimited agents',
      'Unlimited issues',
      'Unlimited tokens',
      'Everything in Professional',
      'Dedicated support',
      'Custom onboarding',
      'SLA guarantee',
    ],
    cta: 'Contact Sales',
    highlight: false,
  },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubscribe(slug: string) {
    if (slug === 'free') {
      router.push('/signup');
      return;
    }
    if (slug === 'enterprise') {
      window.location.href = 'mailto:shane@apex-code.tech?subject=APEX Enterprise Inquiry';
      return;
    }

    setLoading(slug);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: slug, annual }),
      });
      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else if (res.status === 503) {
        // Stripe not configured yet — redirect to signup
        router.push('/signup');
      } else {
        console.error('Checkout error:', data.error);
        router.push('/signup');
      }
    } catch {
      router.push('/signup');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] py-16 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <Link href="/" className="text-2xl font-bold text-[#00FF88] tracking-tight mb-4 inline-block">
            APEX
          </Link>
          <h1 className="text-3xl font-sans font-bold text-[#F5F5F5] mt-4">
            Build autonomous companies at any scale
          </h1>
          <p className="text-[#6B6B6B] font-sans mt-3 max-w-lg mx-auto">
            Start free. Upgrade when your AI workforce outgrows the free tier.
          </p>

          {/* Annual toggle */}
          <div className="flex items-center justify-center gap-3 mt-8">
            <span className={`text-sm font-sans ${!annual ? 'text-[#F5F5F5]' : 'text-[#6B6B6B]'}`}>Monthly</span>
            <button
              onClick={() => setAnnual(!annual)}
              className={`relative w-12 h-6 rounded-full transition-colors ${annual ? 'bg-[#00FF88]' : 'bg-[#1F1F1F]'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-[#0A0A0A] transition-transform ${annual ? 'left-6' : 'left-0.5'}`} />
            </button>
            <span className={`text-sm font-sans ${annual ? 'text-[#F5F5F5]' : 'text-[#6B6B6B]'}`}>
              Annual <span className="text-[#00FF88] text-xs font-mono">SAVE 17%</span>
            </span>
          </div>
        </div>

        {/* Plan Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((plan) => (
            <div
              key={plan.slug}
              className={`rounded-lg p-6 flex flex-col ${
                plan.highlight
                  ? 'bg-[#111111] border-2 border-[#00FF88] relative'
                  : 'bg-[#111111] border border-[#1F1F1F]'
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#00FF88] text-[#0A0A0A] text-[10px] font-mono font-bold px-3 py-0.5 rounded-full uppercase">
                  Most Popular
                </div>
              )}

              <h3 className="text-lg font-sans font-semibold text-[#F5F5F5]">{plan.name}</h3>

              <div className="mt-3 mb-5">
                <span className="text-3xl font-mono font-bold text-[#F5F5F5]">
                  ${annual ? Math.round(plan.price.yearly / 12) : plan.price.monthly}
                </span>
                {plan.price.monthly > 0 && (
                  <span className="text-sm text-[#6B6B6B] font-sans">/mo</span>
                )}
                {annual && plan.price.yearly > 0 && (
                  <p className="text-xs text-[#6B6B6B] font-mono mt-1">
                    ${plan.price.yearly}/yr billed annually
                  </p>
                )}
              </div>

              <ul className="space-y-2 flex-1 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-[#F5F5F5] font-sans">
                    <span className="text-[#00FF88] mt-0.5 text-xs">&#10003;</span>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSubscribe(plan.slug)}
                disabled={loading === plan.slug}
                className={`w-full py-2.5 px-4 rounded text-sm font-sans font-medium transition-colors disabled:opacity-50 ${
                  plan.highlight
                    ? 'bg-[#00FF88] text-[#0A0A0A] hover:bg-[#00FF88]/90'
                    : plan.slug === 'free'
                    ? 'bg-[#1F1F1F] text-[#F5F5F5] hover:bg-[#2A2A2A]'
                    : 'border border-[#00FF88]/50 text-[#00FF88] hover:bg-[#00FF88]/10'
                }`}
              >
                {loading === plan.slug ? 'Loading...' : plan.cta}
              </button>
            </div>
          ))}
        </div>

        {/* Back to login */}
        <p className="text-center text-[#6B6B6B] text-sm mt-8 font-sans">
          Already have an account?{' '}
          <Link href="/login" className="text-[#00FF88] hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

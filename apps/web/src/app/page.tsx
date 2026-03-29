'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

// Terminal animation component
function TerminalAnimation() {
  const [displayedText, setDisplayedText] = useState('');
  const fullText = `$ apex deploy my-company
Initializing AI workforce...
▶ Spawning CEO agent
▶ Deploying support team (3 agents)
▶ Configuring token budget
✓ Company ready at 00:02.341s
▶ Agents working on 12 issues
▶ System quality: 94.2%
▶ Monthly budget: $299/mo`;

  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      if (index < fullText.length) {
        setDisplayedText(fullText.slice(0, index + 1));
        index++;
      } else {
        clearInterval(interval);
      }
    }, 15);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-lg p-6 font-['JetBrains_Mono'] text-sm leading-relaxed overflow-hidden">
      <div className="text-[#00FF88] whitespace-pre-wrap break-words">{displayedText}</div>
      <div className="inline-block w-2 h-5 ml-1 bg-[#00FF88] animate-pulse"></div>
    </div>
  );
}

// Icon components using SVG
function IconAgents() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="8" cy="8" r="3" strokeWidth="2" />
      <circle cx="16" cy="8" r="3" strokeWidth="2" />
      <circle cx="12" cy="16" r="3" strokeWidth="2" />
      <path d="M8 11v2M16 11v2M12 19v2" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconRouting() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path d="M7 4h10M7 4v8M17 4v8M7 12h10M7 12v8M17 12v8" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconDashboard() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="7" strokeWidth="2" />
      <rect x="14" y="3" width="7" height="7" strokeWidth="2" />
      <rect x="3" y="14" width="7" height="7" strokeWidth="2" />
      <rect x="14" y="14" width="7" height="7" strokeWidth="2" />
    </svg>
  );
}

function IconMarketplace() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path d="M4 6h16M6 10v8M18 10v8M7 18h10M5 6l1 12h12l1-12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconBudget() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" strokeWidth="2" />
      <path d="M12 7v5M12 12h4" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconEvolution() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path d="M7 16V4m0 12v4m5-16v8m0 8v4m5-20v12m0 8v4M3 20h18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconArrow() {
  return (
    <svg className="w-5 h-5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path d="M13 7l5 5m0 0l-5 5m5-5H6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5] font-['DM_Sans'] overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-[#0A0A0A] border-b border-[#1F1F1F] backdrop-blur-sm z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#00FF88] rounded flex items-center justify-center font-['Space_Mono'] font-bold text-[#0A0A0A] text-sm">
              A
            </div>
            <span className="font-['Space_Mono'] font-bold text-lg">APEX</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#how" className="text-[#6B6B6B] hover:text-[#F5F5F5] transition-colors text-sm">
              How it works
            </a>
            <a href="#features" className="text-[#6B6B6B] hover:text-[#F5F5F5] transition-colors text-sm">
              Features
            </a>
            <a href="#pricing" className="text-[#6B6B6B] hover:text-[#F5F5F5] transition-colors text-sm">
              Pricing
            </a>
            <a href="https://github.com/shan3fr33man-sudo/apex-zero-human" className="text-[#6B6B6B] hover:text-[#F5F5F5] transition-colors text-sm">
              GitHub
            </a>
          </div>
          <Link
            href="/login"
            className="px-4 py-2 bg-[#00FF88] text-[#0A0A0A] rounded text-sm font-medium hover:bg-[#00dd77] transition-all hover:shadow-[0_0_16px_rgba(0,255,136,0.3)]"
          >
            Sign in
          </Link>
        </div>
      </nav>

      {/* HERO SECTION */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 mt-12">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <h1 className="text-5xl md:text-6xl font-['Space_Mono'] font-bold leading-tight">
                Your AI Workforce,<br />
                <span className="text-[#00FF88]">Ready Now</span>
              </h1>
              <p className="text-lg text-[#6B6B6B] leading-relaxed max-w-xl">
                Deploy a complete AI-driven company. Agents handle operations, you approve what matters. No hiring, no payroll, no human limits.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#00FF88] text-[#0A0A0A] rounded font-['DM_Sans'] font-semibold hover:shadow-[0_0_24px_rgba(0,255,136,0.4)] hover:bg-[#00dd77] transition-all"
                >
                  Start Building <IconArrow />
                </Link>
                <a
                  href="#how"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-[#1F1F1F] text-[#F5F5F5] rounded hover:bg-[#111111] transition-all"
                >
                  Learn More
                </a>
              </div>
            </div>
            <div className="space-y-4">
              <TerminalAnimation />
              <p className="text-xs text-[#6B6B6B] text-center">Fully autonomous. Real-time control. Production-ready.</p>
            </div>
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF BAR */}
      <section className="border-y border-[#1F1F1F] py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-center text-[#6B6B6B] text-sm mb-8">Trusted by forward-thinking operators</p>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16">
            {['TechCorp', 'StudioLabs', 'CloudScale', 'DataFlow', 'AutoSync'].map((name) => (
              <div
                key={name}
                className="px-4 py-2 border border-[#1F1F1F] rounded bg-[#111111] text-[#6B6B6B] font-['Space_Mono'] text-sm"
              >
                {name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-['Space_Mono'] font-bold mb-4 text-center">How It Works</h2>
          <p className="text-center text-[#6B6B6B] mb-16 max-w-2xl mx-auto">
            Three simple steps to launch your autonomous workforce
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                num: '01',
                title: 'Deploy Your AI Company',
                desc: 'Define your organization structure. APEX spawns a CEO and specialized agents instantly.',
              },
              {
                num: '02',
                title: 'Agents Handle Operations',
                desc: 'Your team works 24/7. Handle support, build features, manage workflows. You set token budgets.',
              },
              {
                num: '03',
                title: 'Approve What Matters',
                desc: 'Review hiring decisions, major actions, and quality metrics. Humans stay in the loop.',
              },
            ].map((step, idx) => (
              <div key={idx} className="relative">
                <div className="bg-[#111111] border border-[#1F1F1F] rounded-lg p-8 h-full">
                  <div className="text-[#00FF88] font-['Space_Mono'] text-4xl font-bold mb-4">{step.num}</div>
                  <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
                  <p className="text-[#6B6B6B] leading-relaxed">{step.desc}</p>
                </div>
                {idx < 2 && (
                  <div className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2">
                    <svg className="w-8 h-8 text-[#1F1F1F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M9 5l7 7-7 7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES GRID */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-[#111111] border-t border-[#1F1F1F]">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-['Space_Mono'] font-bold mb-4 text-center">Core Features</h2>
          <p className="text-center text-[#6B6B6B] mb-16 max-w-2xl mx-auto">
            Enterprise-grade tools for running your autonomous workforce
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: <IconAgents />,
                title: 'Autonomous Agents',
                desc: 'Self-directed AI workers with roles, skills, and specializations. Organized like a real company.',
              },
              {
                icon: <IconRouting />,
                title: 'Smart Task Routing',
                desc: 'Automatic assignment to best-fit agents based on capability, workload, and quality scores.',
              },
              {
                icon: <IconDashboard />,
                title: 'Real-Time Dashboard',
                desc: 'Live agent status, token spending, quality metrics, and issue tracking in one command center.',
              },
              {
                icon: <IconMarketplace />,
                title: 'Skills Marketplace',
                desc: 'Install pre-built skills or create custom ones. Version control and safety scanning included.',
              },
              {
                icon: <IconBudget />,
                title: 'Token Budget Control',
                desc: 'Set monthly limits, per-agent caps, and auto-pause rules. Full visibility into AI spend.',
              },
              {
                icon: <IconEvolution />,
                title: 'Self-Evolution Engine',
                desc: 'Agents propose prompt improvements via evaluation framework. Continuous quality gains.',
              },
            ].map((feature, idx) => (
              <div
                key={idx}
                className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-lg p-6 hover:border-[#00FF88] hover:shadow-[0_0_16px_rgba(0,255,136,0.1)] transition-all"
              >
                <div className="text-[#00FF88] mb-4">{feature.icon}</div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-[#6B6B6B] text-sm leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* INDUSTRY EXAMPLES */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-['Space_Mono'] font-bold mb-4 text-center">Universal Platform</h2>
          <p className="text-center text-[#6B6B6B] mb-16 max-w-2xl mx-auto">
            APEX works across any industry. One platform, infinite possibilities.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { name: 'Moving Companies', desc: 'Quote generation, scheduling, billing automation' },
              { name: 'Law Firms', desc: 'Document review, legal research, case management' },
              { name: 'E-Commerce', desc: 'Customer support, inventory, order fulfillment' },
              { name: 'Healthcare', desc: 'Appointment scheduling, record management, compliance' },
              { name: 'Real Estate', desc: 'Property listings, lead scoring, transaction docs' },
              { name: 'Marketing Agencies', desc: 'Campaign management, analytics, content creation' },
            ].map((industry, idx) => (
              <div
                key={idx}
                className="bg-[#111111] border border-[#1F1F1F] rounded-lg p-6 hover:border-[#00FF88] transition-all"
              >
                <h3 className="font-semibold mb-2">{industry.name}</h3>
                <p className="text-[#6B6B6B] text-sm">{industry.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 p-8 bg-[#111111] border border-[#00FF88] rounded-lg text-center">
            <p className="text-[#6B6B6B] mb-4">Not seeing your industry? APEX is industry-agnostic.</p>
            <p className="font-semibold">Build custom agents for any business model.</p>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8 bg-[#111111] border-t border-[#1F1F1F]">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-['Space_Mono'] font-bold mb-4 text-center">Simple Pricing</h2>
          <p className="text-center text-[#6B6B6B] mb-16 max-w-2xl mx-auto">
            Start small, scale up. Only pay for tokens you use.
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                name: 'Starter',
                price: '$99',
                period: '/month',
                desc: 'Perfect for trying APEX',
                features: [
                  '3 AI agents',
                  '100K monthly tokens',
                  'Real-time dashboard',
                  'Basic skills',
                  'Community support',
                ],
                cta: 'Get Started',
                highlight: false,
              },
              {
                name: 'Growth',
                price: '$299',
                period: '/month',
                desc: 'For scaling operations',
                features: [
                  '10 AI agents',
                  '500K monthly tokens',
                  'Full feature set',
                  'Skills marketplace',
                  'Priority support',
                  'Custom skills',
                ],
                cta: 'Start Growing',
                highlight: true,
              },
              {
                name: 'Enterprise',
                price: 'Custom',
                period: '',
                desc: 'Unlimited scale',
                features: [
                  'Unlimited agents',
                  'Unlimited tokens',
                  'Dedicated account',
                  'SLA & support',
                  'API access',
                  'On-premise option',
                ],
                cta: 'Contact Sales',
                highlight: false,
              },
            ].map((plan, idx) => (
              <div
                key={idx}
                className={`rounded-lg p-8 flex flex-col ${
                  plan.highlight
                    ? 'bg-[#0A0A0A] border-2 border-[#00FF88] shadow-[0_0_24px_rgba(0,255,136,0.2)] relative'
                    : 'bg-[#0A0A0A] border border-[#1F1F1F]'
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-[#00FF88] text-[#0A0A0A] px-4 py-1 rounded font-['Space_Mono'] text-xs font-bold">
                    RECOMMENDED
                  </div>
                )}
                <h3 className="text-2xl font-['Space_Mono'] font-bold mb-1">{plan.name}</h3>
                <p className="text-[#6B6B6B] text-sm mb-6">{plan.desc}</p>
                <div className="mb-6">
                  <span className="text-4xl font-['Space_Mono'] font-bold">{plan.price}</span>
                  {plan.period && <span className="text-[#6B6B6B] text-sm ml-2">{plan.period}</span>}
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((feature, fidx) => (
                    <li key={fidx} className="flex items-start gap-3">
                      <div className="text-[#00FF88] mt-0.5 flex-shrink-0">
                        <IconCheck />
                      </div>
                      <span className="text-[#6B6B6B] text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/login"
                  className={`py-2 px-4 rounded text-center font-medium transition-all ${
                    plan.highlight
                      ? 'bg-[#00FF88] text-[#0A0A0A] hover:shadow-[0_0_16px_rgba(0,255,136,0.3)]'
                      : 'border border-[#1F1F1F] text-[#F5F5F5] hover:bg-[#111111]'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* OPEN SOURCE SECTION */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-[#111111] border border-[#1F1F1F] rounded-lg p-12 text-center">
            <h2 className="text-4xl font-['Space_Mono'] font-bold mb-4">Built in the Open</h2>
            <p className="text-[#6B6B6B] mb-6 text-lg">
              MIT Licensed. Community-driven. Self-hostable.
            </p>
            <p className="text-[#6B6B6B] mb-8 leading-relaxed">
              APEX is open source and MIT licensed. Join hundreds of contributors building the future of autonomous companies. Run it on your infrastructure or use our cloud platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="https://github.com/shan3fr33man-sudo/apex-zero-human"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#00FF88] text-[#0A0A0A] rounded font-medium hover:shadow-[0_0_24px_rgba(0,255,136,0.4)] transition-all"
              >
                ★ Star on GitHub
              </a>
              <a
                href="https://github.com/shan3fr33man-sudo/apex-zero-human"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-[#1F1F1F] text-[#F5F5F5] rounded hover:bg-[#111111] transition-all"
              >
                View Source Code
              </a>
            </div>
            <div className="mt-8 pt-8 border-t border-[#1F1F1F]">
              <p className="text-[#6B6B6B] text-sm">
                Get involved: Issues • Discussions • Pull Requests
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA SECTION */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[#111111] border-y border-[#1F1F1F]">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-['Space_Mono'] font-bold mb-6">Ready to Build?</h2>
          <p className="text-[#6B6B6B] text-lg mb-8">
            Deploy your first autonomous company in minutes. No credit card required.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-[#00FF88] text-[#0A0A0A] rounded font-semibold text-lg hover:shadow-[0_0_32px_rgba(0,255,136,0.4)] transition-all"
          >
            Start Building <IconArrow />
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-[#1F1F1F] py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 bg-[#00FF88] rounded flex items-center justify-center font-['Space_Mono'] font-bold text-[#0A0A0A] text-xs">
                  A
                </div>
                <span className="font-['Space_Mono'] font-bold">APEX</span>
              </div>
              <p className="text-[#6B6B6B] text-sm">Autonomous company builder.</p>
            </div>
            <div>
              <h3 className="font-semibold mb-4 text-sm uppercase tracking-widest text-[#6B6B6B]">Product</h3>
              <ul className="space-y-2 text-sm text-[#6B6B6B] hover:text-[#F5F5F5]">
                <li>
                  <a href="#features" className="hover:text-[#F5F5F5] transition-colors">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="hover:text-[#F5F5F5] transition-colors">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="#how" className="hover:text-[#F5F5F5] transition-colors">
                    How It Works
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4 text-sm uppercase tracking-widest text-[#6B6B6B]">Community</h3>
              <ul className="space-y-2 text-sm text-[#6B6B6B]">
                <li>
                  <a href="https://github.com/shan3fr33man-sudo/apex-zero-human" className="hover:text-[#F5F5F5] transition-colors">
                    GitHub
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-[#F5F5F5] transition-colors">
                    Docs
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-[#F5F5F5] transition-colors">
                    Discord
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4 text-sm uppercase tracking-widest text-[#6B6B6B]">Legal</h3>
              <ul className="space-y-2 text-sm text-[#6B6B6B]">
                <li>
                  <a href="#" className="hover:text-[#F5F5F5] transition-colors">
                    Privacy
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-[#F5F5F5] transition-colors">
                    Terms
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-[#1F1F1F] pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-[#6B6B6B] text-sm">© 2024-2026 APEX. MIT License.</p>
            <p className="text-[#6B6B6B] text-sm">Autonomous companies for everyone.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

# APEX — Autonomous Company Builder

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black.svg)](https://nextjs.org/)

APEX is an open-source, white-label, multi-tenant SaaS platform that lets business owners run their entire company with AI agents instead of human employees. A CEO agent decomposes goals into issues, delegates to specialized agents (marketing, dispatch, QA, finance), and every action passes through a human-in-the-loop inbox before anything irreversible happens. The first vertical template is a moving company — but the engine is generic and works for any business.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Hostinger VPS (Ubuntu 22)                   │
│                                                                 │
│  ┌──────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │  Nginx   │  │   PM2 Cluster    │  │    PM2 Fork (×2)     │  │
│  │  :80/443 ├─►│   apex-web ×2    │  │  apex-orchestrator   │  │
│  │          │  │   (Next.js)      │  │  apex-see            │  │
│  └──────────┘  │   :3000          │  │  :3001               │  │
│                └────────┬─────────┘  └──────────┬───────────┘  │
│                         │                       │               │
└─────────────────────────┼───────────────────────┼───────────────┘
                          │                       │
                          ▼                       ▼
              ┌───────────────────────────────────────────┐
              │         Supabase (Cloud Hosted)           │
              │  Postgres + pgvector + RLS + Auth         │
              │  Realtime + Storage + Edge Functions      │
              └───────────────────────────────────────────┘
```

```
Monorepo Structure:
apex-zero-human/
├── apps/
│   ├── web/              # Next.js 14 dashboard (App Router)
│   └── orchestrator/     # Node.js autonomous engine
├── packages/
│   ├── db/               # Supabase schema, migrations, types
│   └── shared/           # Shared TypeScript types + interfaces
├── skills/               # 9 built-in skills (web browser, CRM, etc.)
├── supabase/migrations/  # 12 database migrations with RLS
├── ecosystem.config.js   # PM2 process manager config
├── nginx.conf            # Reverse proxy + SSL + rate limiting
└── scripts/              # deploy.sh, setup-server.sh
```

## Quick Start

```bash
# 1. Clone
git clone https://github.com/yourusername/apex-zero-human.git
cd apex-zero-human

# 2. Install dependencies
npm install

# 3. Set up environment
cp apps/web/.env.example apps/web/.env.local
cp apps/orchestrator/.env.example apps/orchestrator/.env
# Fill in Supabase, Anthropic, and other API keys

# 4. Run database migrations
npx supabase db push --project-id YOUR_PROJECT_ID

# 5. Start with PM2
mkdir -p logs
pm2 start ecosystem.config.js

# 6. Open dashboard
open http://localhost:3000
```

## Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | web | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | web, orchestrator | Service role key (server-only) |
| `DATABASE_URL` | orchestrator | Direct Postgres connection string |
| `ANTHROPIC_API_KEY` | web, orchestrator | Claude API key |
| `FIRECRAWL_API_KEY` | orchestrator | Firecrawl web scraping API key |
| `RINGCENTRAL_CLIENT_ID` | orchestrator | RingCentral integration (optional) |
| `RINGCENTRAL_CLIENT_SECRET` | orchestrator | RingCentral secret (optional) |
| `SMARTMOVING_API_KEY` | orchestrator | SmartMoving CRM (optional) |
| `RESEND_API_KEY` | web, orchestrator | Email delivery via Resend |
| `STRIPE_SECRET_KEY` | web | Stripe payments (optional) |
| `STRIPE_WEBHOOK_SECRET` | web | Stripe webhook validation |

## Built-in Skills

APEX ships with 9 built-in skills that agents can use:

| Skill | Description |
|-------|-------------|
| Web Browser | Firecrawl-powered web scraping, crawling, and search |
| Firecrawl | Direct Firecrawl API access with structured extraction |
| Email Reader | Gmail/Resend/SMTP inbox monitoring and sending |
| Phone Listener | Twilio/RingCentral/Vonage call and SMS tracking |
| CRM Connector | SmartMoving/HubSpot/Salesforce contact and job management |
| Calendar Manager | Google Calendar/Outlook/CalDAV scheduling |
| Ads Manager | Google Ads/Meta Ads/Bing Ads campaign management |
| Review Requester | Automated post-service review collection |
| Document Generator | Quotes, invoices, compliance reports, contracts |

External skills can be installed by URL and are sandboxed with domain whitelisting and security scanning before activation.

## Dashboard Pages

The APEX dashboard is a dark industrial command center (Bloomberg Terminal meets Mission Control):

1. **Command Center** — Live agent grid + issue board + token gauge
2. **Companies** — Multi-tenant company management
3. **Agents** — Org chart + agent roster + persona editor
4. **Issues** — Real-time Kanban board (Supabase Realtime)
5. **Inbox** — Human-in-the-loop approval queue
6. **Spend** — Token analytics and cost tracking
7. **Skills** — Skill marketplace and management
8. **Routines** — Scheduled and reactive automation
9. **Audit** — Immutable log viewer with CSV export

## Deployment to Hostinger VPS

APEX deploys to a **Hostinger VPS** via PM2 + Nginx. No Vercel, AWS, or Docker.

### Step 1 — SSH into VPS

```bash
ssh root@YOUR-VPS-IP
```

### Step 2 — Clone the repo

```bash
git clone https://github.com/shan3fr33man-sudo/apex-zero-human.git
cd apex-zero-human
```

### Step 3 — Run first-time setup

```bash
chmod +x scripts/first-time-setup.sh
./scripts/first-time-setup.sh
```

### Step 4 — Fill in environment variables

```bash
cp .env.production.example apps/web/.env.local
cp .env.production.example apps/orchestrator/.env
nano apps/web/.env.local
nano apps/orchestrator/.env
```

### Step 5 — Deploy

```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

### Subsequent deploys

```bash
cd ~/apex-zero-human
git pull origin main
./scripts/deploy.sh
```

The deploy script builds Next.js and the orchestrator, reloads PM2 with zero downtime, and verifies the health endpoint. Fails fast on any error.

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run `npx tsc --noEmit` across all packages
5. Commit (`git commit -m 'Add amazing feature'`)
6. Push (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

MIT — see [LICENSE](LICENSE) for details.

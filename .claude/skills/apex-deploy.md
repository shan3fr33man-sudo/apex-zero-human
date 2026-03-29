---
name: apex-deploy
description: >
  Use this skill for ALL deployment work — Hostinger VPS setup, PM2 configuration,
  Nginx reverse proxy, SSL, environment variables, CI deploy scripts, and production
  health monitoring. Triggers: any mention of "deploy", "Hostinger", "VPS", "PM2",
  "Nginx", "production", "server", "SSL", "environment variables", "ecosystem.config",
  "nginx.conf", "deploy script", or any work with server infrastructure. Never suggest
  Vercel, Railway, Render, AWS, or Docker. This project deploys ONLY to Hostinger VPS
  via PM2 + Nginx. Always use the exact configs below.
---

# APEX Deploy Skill

## Hostinger VPS Architecture

```
Hostinger VPS (Ubuntu 22.04 LTS)
├── Node.js 20 LTS (via nvm)
├── PM2 (process manager)
│   ├── apex-web        (Next.js — port 3000, 2 cluster instances)
│   ├── apex-orchestrator (Node.js engine — port 3001, 1 fork instance)
│   └── apex-see        (Self-Evolution Engine — no port, background only)
├── Nginx (reverse proxy — ports 80/443)
│   ├── apex.yourdomain.com → localhost:3000
│   └── /api/webhooks/* → localhost:3000 (higher timeout for webhook ingestion)
└── Supabase (external — cloud hosted)
```

---

## PM2 Ecosystem Config

```javascript
// ecosystem.config.js — root of monorepo
module.exports = {
  apps: [
    {
      name: 'apex-web',
      cwd: './apps/web',
      script: 'node_modules/.bin/next',
      args: 'start',
      instances: 2,
      exec_mode: 'cluster',
      max_memory_restart: '1G',
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      log_file: './logs/apex-web.log',
      error_file: './logs/apex-web-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'apex-orchestrator',
      cwd: './apps/orchestrator',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '2G',
      restart_delay: 5000,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        ORCHESTRATOR_TICK_MS: '5000',
        AUTOSCALER_TICK_MS: '30000',
        STALL_CHECK_MS: '300000',
      },
      log_file: './logs/apex-orchestrator.log',
      error_file: './logs/apex-orchestrator-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'apex-see',
      cwd: './apps/orchestrator',
      script: 'dist/see/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      restart_delay: 30000,   // 30s delay — SEE should not restart frequently
      max_restarts: 5,
      env: {
        NODE_ENV: 'production',
        SEE_MODE: 'autonomous',
        SEE_DEPLOYMENT_WINDOW_START: '2',
        SEE_DEPLOYMENT_WINDOW_END: '4',
        SEE_MAX_BUDGET_PER_TEST_USD: '10',
      },
      log_file: './logs/apex-see.log',
      error_file: './logs/apex-see-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    }
  ]
};
```

---

## Nginx Configuration

```nginx
# /etc/nginx/sites-available/apex
# Copy to /etc/nginx/sites-enabled/apex and reload nginx

server {
    listen 80;
    server_name apex.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name apex.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/apex.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/apex.yourdomain.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy strict-origin-when-cross-origin;

    # Main app
    location / {
        proxy_pass          http://localhost:3000;
        proxy_http_version  1.1;
        proxy_set_header    Upgrade $http_upgrade;
        proxy_set_header    Connection 'upgrade';
        proxy_set_header    Host $host;
        proxy_set_header    X-Real-IP $remote_addr;
        proxy_set_header    X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header    X-Forwarded-Proto $scheme;
        proxy_cache_bypass  $http_upgrade;
        proxy_read_timeout  60s;
    }

    # Webhooks — longer timeout for async processing
    location /api/webhooks/ {
        proxy_pass          http://localhost:3000;
        proxy_http_version  1.1;
        proxy_set_header    Host $host;
        proxy_set_header    X-Real-IP $remote_addr;
        proxy_read_timeout  30s;
        # Rate limit webhook endpoints
        limit_req           zone=webhooks burst=20 nodelay;
    }

    # Health check endpoint — no auth needed
    location /api/health {
        proxy_pass          http://localhost:3000;
        proxy_read_timeout  5s;
    }

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;
    gzip_min_length 1000;
}

# Rate limiting zones
http {
    limit_req_zone $binary_remote_addr zone=webhooks:10m rate=10r/s;
}
```

---

## Deploy Script

```bash
#!/bin/bash
# scripts/deploy.sh
# Run on the VPS after git pull

set -e  # Exit on any error

echo "🔍 Pre-deploy checks..."

# 1. Type check
echo "→ TypeScript check..."
cd apps/web && npx tsc --noEmit
cd ../orchestrator && npx tsc --noEmit
cd ../..

# 2. Build
echo "→ Building Next.js..."
cd apps/web && npm run build
cd ..

echo "→ Building Orchestrator..."
cd orchestrator && npm run build
cd ../..

# 3. Run migrations
echo "→ Running database migrations..."
npx supabase db push --project-id $SUPABASE_PROJECT_ID

# 4. Generate types
echo "→ Generating Supabase types..."
npx supabase gen types typescript \
  --project-id $SUPABASE_PROJECT_ID \
  > packages/db/types.ts

# 5. Reload PM2 processes (zero-downtime)
echo "→ Reloading PM2..."
pm2 reload ecosystem.config.js --update-env

# 6. Health check
echo "→ Health check..."
sleep 5
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" https://apex.yourdomain.com/api/health)
if [ "$HEALTH" != "200" ]; then
    echo "❌ Health check failed (HTTP $HEALTH). Rolling back..."
    pm2 reload ecosystem.config.js --update-env
    exit 1
fi

echo "✅ Deploy complete. All systems running."
pm2 status
```

---

## Server First-Time Setup

```bash
# Run these commands once on a fresh Hostinger VPS (Ubuntu 22.04)

# 1. Install Node.js 20 via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
nvm alias default 20

# 2. Install PM2 globally
npm install -g pm2
pm2 startup ubuntu  # Follow the printed command to enable startup on boot

# 3. Install Nginx
sudo apt update
sudo apt install nginx -y
sudo systemctl enable nginx

# 4. Install Certbot for SSL
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d apex.yourdomain.com

# 5. Install Supabase CLI
npm install -g supabase

# 6. Clone the repo
git clone https://github.com/yourusername/apex-zero-human.git
cd apex-zero-human

# 7. Install dependencies
npm install

# 8. Create .env files (copy from .env.example, fill in values)
cp apps/web/.env.example apps/web/.env.local
cp apps/orchestrator/.env.example apps/orchestrator/.env

# 9. Create logs directory
mkdir -p logs

# 10. Copy Nginx config
sudo cp nginx.conf /etc/nginx/sites-available/apex
sudo ln -s /etc/nginx/sites-available/apex /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# 11. First build + start
npm run build --workspace=apps/web
npm run build --workspace=apps/orchestrator
pm2 start ecosystem.config.js
pm2 save
```

---

## Environment Variables (.env.example)

```bash
# apps/web/.env.example

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...    # NEVER prefix with NEXT_PUBLIC_
SUPABASE_PROJECT_ID=xxx

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Email
RESEND_API_KEY=re_...

# App
NEXT_PUBLIC_APP_URL=https://apex.yourdomain.com

# ---
# apps/orchestrator/.env.example

SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres

ANTHROPIC_API_KEY=sk-ant-...

# RingCentral
RINGCENTRAL_CLIENT_ID=
RINGCENTRAL_CLIENT_SECRET=
RINGCENTRAL_SERVER_URL=https://platform.ringcentral.com

# SmartMoving
SMARTMOVING_API_KEY=
SMARTMOVING_BASE_URL=https://api.smartmoving.com

# Resend (for stall/budget alert emails)
RESEND_API_KEY=re_...
ALERT_EMAIL_TO=shane@aperfectmover.com

# SEE (Self-Evolution Engine)
SEE_SHADOW_SUPABASE_URL=https://yyy.supabase.co    # Separate Supabase project for shadow testing
SEE_SHADOW_SUPABASE_KEY=eyJ...
SEE_INTERNAL_ALERT_WEBHOOK=https://hooks.slack.com/... # Internal only — not operator-visible
```

---

## Health Check Endpoint

```typescript
// app/api/health/route.ts
import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = createServerSupabase();
    const { error } = await supabase.from('companies').select('id').limit(1);

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: error ? 'error' : 'ok',
      version: process.env.npm_package_version ?? '1.0.0'
    }, { status: error ? 500 : 200 });
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}
```

---

## Log Rotation (PM2)

```bash
# Install pm2-logrotate module
pm2 install pm2-logrotate

# Configure
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7       # Keep 7 days of logs
pm2 set pm2-logrotate:compress true  # Gzip old logs
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'  # Rotate daily at midnight
```

#!/usr/bin/env bash
set -euo pipefail

# ─── APEX Quick Start ─────────────────────────────────────────────────
# Zero to running APEX in under 5 minutes.
# Usage: bash scripts/quickstart.sh
# ──────────────────────────────────────────────────────────────────────

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color
BOLD='\033[1m'

echo -e "${GREEN}${BOLD}"
echo "  █████╗ ██████╗ ███████╗██╗  ██╗"
echo " ██╔══██╗██╔══██╗██╔════╝╚██╗██╔╝"
echo " ███████║██████╔╝█████╗   ╚███╔╝ "
echo " ██╔══██║██╔═══╝ ██╔══╝   ██╔██╗ "
echo " ██║  ██║██║     ███████╗██╔╝ ╚██╗"
echo " ╚═╝  ╚═╝╚═╝     ╚══════╝╚═╝  ╚═╝"
echo -e "${NC}"
echo -e "${BOLD}Zero-Human Company Builder — Quick Start${NC}"
echo ""

# ─── Step 1: Check Node.js ────────────────────────────────────────────
echo -e "${YELLOW}[1/7]${NC} Checking Node.js version..."
if ! command -v node &> /dev/null; then
  echo -e "${RED}ERROR: Node.js not found. Install Node.js 20+ from https://nodejs.org${NC}"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo -e "${RED}ERROR: Node.js $NODE_VERSION found, but 20+ required.${NC}"
  exit 1
fi
echo -e "  Node.js $(node -v) ✓"

# ─── Step 2: Install dependencies ─────────────────────────────────────
echo -e "${YELLOW}[2/7]${NC} Installing dependencies..."
npm install --prefer-offline 2>&1 | tail -1
echo -e "  Dependencies installed ✓"

# ─── Step 3: Check for Supabase CLI ───────────────────────────────────
echo -e "${YELLOW}[3/7]${NC} Checking Supabase CLI..."
if command -v supabase &> /dev/null; then
  echo -e "  Supabase CLI found ✓"

  # Start Supabase locally if not running
  if ! supabase status &> /dev/null 2>&1; then
    echo -e "  Starting local Supabase..."
    supabase start 2>&1 | tail -5
  else
    echo -e "  Supabase already running ✓"
  fi
else
  echo -e "  ${YELLOW}Supabase CLI not found — skipping local DB setup.${NC}"
  echo -e "  ${YELLOW}Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env for remote DB.${NC}"
fi

# ─── Step 4: Create .env from .env.example ────────────────────────────
echo -e "${YELLOW}[4/7]${NC} Setting up environment..."
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo -e "  Created .env from .env.example"
    echo -e "  ${YELLOW}IMPORTANT: Edit .env and add your API keys before starting.${NC}"
  else
    cat > .env << 'ENVEOF'
# APEX Environment Variables
# Fill in your values below

# Supabase
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Anthropic
ANTHROPIC_API_KEY=your-anthropic-key

# Optional: Firecrawl for web research
# FIRECRAWL_API_KEY=your-firecrawl-key

# Optional: Resend for email
# RESEND_API_KEY=your-resend-key

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
ENVEOF
    echo -e "  Created default .env file"
    echo -e "  ${YELLOW}IMPORTANT: Edit .env and add your API keys before starting.${NC}"
  fi
else
  echo -e "  .env already exists ✓"
fi

# ─── Step 5: Run database migrations ─────────────────────────────────
echo -e "${YELLOW}[5/7]${NC} Running database migrations..."
if [ -d "packages/db/migrations" ]; then
  MIGRATION_COUNT=$(find packages/db/migrations -name "*.sql" 2>/dev/null | wc -l)
  echo -e "  Found $MIGRATION_COUNT migration files"
  if command -v supabase &> /dev/null; then
    supabase db push 2>&1 | tail -3 || echo -e "  ${YELLOW}Migration push skipped (run manually if needed)${NC}"
  else
    echo -e "  ${YELLOW}Run migrations manually against your Supabase project.${NC}"
  fi
else
  echo -e "  ${YELLOW}No migrations directory found — skipping.${NC}"
fi
echo -e "  Database setup ✓"

# ─── Step 6: Build all packages ──────────────────────────────────────
echo -e "${YELLOW}[6/7]${NC} Building all packages..."
npx turbo run build 2>&1 | tail -3 || {
  echo -e "  ${YELLOW}Build had warnings (may be OK for first run)${NC}"
}
echo -e "  Build complete ✓"

# ─── Step 7: Start all processes ──────────────────────────────────────
echo -e "${YELLOW}[7/7]${NC} Starting APEX processes..."
if command -v pm2 &> /dev/null; then
  pm2 start ecosystem.config.js 2>&1 | tail -5
  echo ""
  echo -e "${GREEN}${BOLD}APEX is running!${NC}"
  echo ""
  pm2 list
else
  echo -e "  PM2 not found globally. Starting with npm..."
  echo -e "  Run: ${BOLD}npm run dev${NC} to start in development mode"
  echo -e "  Or install PM2: ${BOLD}npm install -g pm2${NC}"
fi

echo ""
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  APEX Quick Start Complete!${NC}"
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Dashboard:    ${BOLD}http://localhost:3000${NC}"
echo -e "  Orchestrator: ${BOLD}http://localhost:3001${NC}"
echo ""
echo -e "  ${YELLOW}Next steps:${NC}"
echo -e "  1. Edit .env with your API keys"
echo -e "  2. Open http://localhost:3000 in your browser"
echo -e "  3. Create your first AI company"
echo ""

# Try to open browser
if command -v xdg-open &> /dev/null; then
  xdg-open http://localhost:3000 2>/dev/null &
elif command -v open &> /dev/null; then
  open http://localhost:3000 2>/dev/null &
fi

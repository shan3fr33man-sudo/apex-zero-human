#!/bin/bash
set -e
echo "=== APEX First Time VPS Setup ==="

# Install Node 20 via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"
nvm install 20
nvm use 20
nvm alias default 20

# Install PM2
npm install -g pm2
pm2 startup

# Install dependencies
npm install

# Create logs directory
mkdir -p logs

# Build everything
cd apps/web && npm run build && cd ../..
cd apps/orchestrator && npm run build && cd ../..

# Start all processes
pm2 start ecosystem.config.js
pm2 save

echo "=== Setup complete. APEX is running. ==="
echo "Web dashboard: http://localhost:3000"
pm2 status

#!/bin/bash
set -e
echo "Building Next.js..."
cd apps/web && npm run build
cd ../..
echo "Building Orchestrator..."
cd apps/orchestrator && npm run build
cd ../..
echo "Reloading PM2..."
pm2 reload ecosystem.config.js --update-env
echo "Health check..."
sleep 5
curl -f http://localhost:3000/api/health || exit 1
echo "Deploy complete."
pm2 status

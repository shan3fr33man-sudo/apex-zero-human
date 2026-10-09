#!/bin/bash
# APEX Feature Deployment Script
# Run from ~/apex-zero-human on the VPS
set -e

echo "=== APEX Feature Deploy ==="

# 1. Extract feature files
echo "[1/5] Extracting feature files..."
tar xzf apex-deploy-features.tar.gz
echo "  ✓ 39 files extracted"

# 2. Install stripe in web app
echo "[2/5] Installing stripe package..."
cd apps/web && npm install stripe && cd ../..
echo "  ✓ stripe installed"

# 3. Build both apps
echo "[3/5] Building orchestrator..."
cd apps/orchestrator && npx tsc && cd ../..
echo "  ✓ orchestrator built"

echo "[4/5] Building web app..."
cd apps/web && npx next build && cd ../..
echo "  ✓ web built"

# 5. Reload PM2
echo "[5/5] Reloading PM2..."
pm2 reload all
echo "  ✓ PM2 reloaded"

echo ""
echo "=== Deploy complete! ==="
echo "Run: pm2 status"
echo "Run: curl -s http://localhost:3000 | head -5"

# Cleanup
rm -f apex-deploy-features.tar.gz deploy-vps.sh

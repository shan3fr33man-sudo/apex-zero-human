#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# APEX — First-Time Server Setup Script
# Run ONCE on a fresh Hostinger VPS (Ubuntu 22.04 LTS)
# Usage: curl -sSL <raw-url> | bash   OR   bash scripts/setup-server.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

echo "========================================"
echo " APEX Server Setup — $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"

# ─── 1. System updates ────────────────────────────────────────────────
echo ""
echo "[1/8] Updating system packages..."
sudo apt update && sudo apt upgrade -y

# ─── 2. Install Node.js 20 via nvm ────────────────────────────────────
echo ""
echo "[2/8] Installing Node.js 20 LTS..."
if ! command -v nvm &> /dev/null; then
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
fi
nvm install 20
nvm use 20
nvm alias default 20
echo "  ✓ Node.js $(node -v)"

# ─── 3. Install PM2 globally ──────────────────────────────────────────
echo ""
echo "[3/8] Installing PM2..."
npm install -g pm2
pm2 startup ubuntu -u "$USER" --hp "$HOME"
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
echo "  ✓ PM2 installed with log rotation"

# ─── 4. Install Nginx ─────────────────────────────────────────────────
echo ""
echo "[4/8] Installing Nginx..."
sudo apt install nginx -y
sudo systemctl enable nginx
sudo systemctl start nginx
echo "  ✓ Nginx installed and running"

# ─── 5. Install Certbot for SSL ───────────────────────────────────────
echo ""
echo "[5/8] Installing Certbot..."
sudo apt install certbot python3-certbot-nginx -y
echo "  ✓ Certbot installed"
echo "  → Run: sudo certbot --nginx -d apex.yourdomain.com"

# ─── 6. Clone repository ──────────────────────────────────────────────
echo ""
echo "[6/8] Repository setup..."
if [ ! -d "$HOME/apex-zero-human" ]; then
  echo "  → Clone the repo:"
  echo "    git clone https://github.com/yourusername/apex-zero-human.git"
  echo "    cd apex-zero-human"
else
  echo "  ✓ Repository already exists at $HOME/apex-zero-human"
fi

# ─── 7. Directory structure ───────────────────────────────────────────
echo ""
echo "[7/8] Setting up directories..."
REPO_DIR="${HOME}/apex-zero-human"
if [ -d "$REPO_DIR" ]; then
  mkdir -p "$REPO_DIR/logs"
  echo "  ✓ logs/ directory created"
fi

# ─── 8. Post-setup instructions ───────────────────────────────────────
echo ""
echo "[8/8] Manual steps remaining:"
echo ""
echo "  1. cd ~/apex-zero-human && npm install"
echo ""
echo "  2. Create environment files:"
echo "     cp apps/web/.env.example apps/web/.env.local"
echo "     cp apps/orchestrator/.env.example apps/orchestrator/.env"
echo "     # Fill in all values in both .env files"
echo ""
echo "  3. Copy Nginx config:"
echo "     sudo cp nginx.conf /etc/nginx/sites-available/apex"
echo "     sudo ln -sf /etc/nginx/sites-available/apex /etc/nginx/sites-enabled/"
echo "     # Edit server_name in the config to your actual domain"
echo "     sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "  4. Get SSL certificate:"
echo "     sudo certbot --nginx -d apex.yourdomain.com"
echo ""
echo "  5. Add rate limiting to Nginx (in /etc/nginx/nginx.conf http {} block):"
echo "     limit_req_zone \$binary_remote_addr zone=webhooks:10m rate=10r/s;"
echo "     sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "  6. First build and start:"
echo "     npm run build --workspace=apps/web"
echo "     npm run build --workspace=apps/orchestrator"
echo "     pm2 start ecosystem.config.js"
echo "     pm2 save"
echo ""
echo "========================================"
echo " Server setup complete!"
echo "========================================"

#!/bin/bash
# Run once on the DigitalOcean droplet to install all dependencies.
set -euo pipefail
echo "=== Digital Twin Server Setup ==="

# --- System packages ---
apt-get update -qq
apt-get install -y -qq \
    nginx curl git build-essential \
    python3-pip python3-venv python3-dev \
    libpq-dev libssl-dev libffi-dev \
    software-properties-common ca-certificates

# --- Node.js 20 LTS ---
if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
echo "Node: $(node -v)   npm: $(npm -v)"

# --- Project directory ---
APP_DIR="/opt/digital-twin"
mkdir -p "$APP_DIR"/{backend,frontend,data/{chroma,notes,scripts},logs,config}

# --- Python venv ---
if [ ! -d "$APP_DIR/backend/venv" ]; then
    python3 -m venv "$APP_DIR/backend/venv"
fi
"$APP_DIR/backend/venv/bin/pip" install --upgrade pip -q

# --- Nginx ---
# Only overwrite nginx config if SSL is not yet configured (preserve certbot changes)
if ! grep -q "listen 443" /etc/nginx/sites-available/digital-twin 2>/dev/null; then
    cp /opt/digital-twin/nginx/default.conf /etc/nginx/sites-available/digital-twin
    ln -sf /etc/nginx/sites-available/digital-twin /etc/nginx/sites-enabled/digital-twin
    rm -f /etc/nginx/sites-enabled/default
fi
nginx -t && systemctl enable nginx && systemctl reload nginx

# --- Systemd service for FastAPI backend ---
cat > /etc/systemd/system/digital-twin.service << 'EOF'
[Unit]
Description=Digital Twin Teaching Backend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/digital-twin/backend
EnvironmentFile=/opt/digital-twin/.env
ExecStart=/opt/digital-twin/backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
Restart=on-failure
RestartSec=5
StandardOutput=append:/opt/digital-twin/logs/backend.log
StandardError=append:/opt/digital-twin/logs/backend.log

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable digital-twin

echo ""
echo "=== Setup complete! Next steps: ==="
echo "1. Copy your project files to /opt/digital-twin/"
echo "2. Run:  cd /opt/digital-twin && cp .env.example .env && nano .env"
echo "3. Install Python deps: /opt/digital-twin/backend/venv/bin/pip install -r /opt/digital-twin/backend/requirements.txt"
echo "4. Build frontend:  cd /opt/digital-twin/frontend && npm install && npm run build"
echo "5. Start backend:   systemctl start digital-twin"
echo "6. Check logs:      tail -f /opt/digital-twin/logs/backend.log"

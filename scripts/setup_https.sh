#!/bin/bash
# Run this on the server AFTER DNS has propagated.
# Usage: bash /opt/digital-twin/scripts/setup_https.sh
set -e

DOMAIN="askchris.guru"
EMAIL="admin@askchris.guru"

echo "=== Installing Certbot ==="
apt-get install -y certbot python3-certbot-nginx

echo "=== Obtaining SSL certificate for $DOMAIN ==="
certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" \
  --non-interactive --agree-tos --email "$EMAIL" \
  --redirect

echo "=== Reloading nginx ==="
systemctl reload nginx

echo "=== Done! Site is now live at https://$DOMAIN ==="

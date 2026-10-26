#!/usr/bin/env bash
# Deploy a SEPARATE demo identity server. Never rename or stop the existing Software Factory identity.
# The public HTTPS reverse proxy and DNS are managed separately; this script binds only to loopback.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ADS_IMAGES_ENV:-/etc/ads-demo/images.env}"
IDENTITY_ENV="/etc/ads-demo/identity.env"
SECRETS_DIR="/var/lib/ads-demo/operator-secrets"
test -r "$ENV_FILE" && test -r "$IDENTITY_ENV" || { echo "Create protected demo configuration files first."; exit 1; }
if grep -Eq '(REPLACE_WITH|REPLACE-WITH|change-me)' "$ENV_FILE" "$IDENTITY_ENV"; then
  echo "Placeholder settings remain; refusing deployment."; exit 1
fi
grep -Eq '^ADS_ENV=demo$' "$IDENTITY_ENV" || { echo "Not a dedicated demo environment"; exit 1; }
grep -Eq '^DEMO_MODE=1$' "$IDENTITY_ENV" || { echo "Explicit demo mode required"; exit 1; }
grep -Eq '^IDENTITY_PUBLIC_URL=https://[^[:space:]]+' "$IDENTITY_ENV" || { echo "Public HTTPS issuer required"; exit 1; }
set -a; source "$ENV_FILE"; set +a
[[ "${ADS_DEMO_DB_PASSWORD:-}" =~ ^[0-9a-f]{64}$ ]] || { echo "DB password must be 32 cryptographically random bytes encoded as hex"; exit 1; }
[[ "${ADS_DEMO_IDENTITY_IMAGE:-}" =~ ^ghcr\.io/ksondo/ads-platform-kit-identity:sha-[0-9a-f]{40}$ ]] || {
  echo "Approved immutable identity image tag required"; exit 1;
}
if ! docker ps -a --format '{{.Names}}' | grep -qx ads-demo-identity; then
  if ss -ltnH | awk '{print $4}' | grep -Eq ":(${ADS_DEMO_IDENTITY_PORT:-18090})$"; then
    echo "Port allocated by another service; refusing deployment."; exit 1
  fi
fi
echo "Legacy identity (read-only status; NOT MODIFIED):"
docker ps --filter name='^/africorestack-identity$' --format '{{.Names}} {{.Status}}'
mkdir -p "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"
docker pull "$ADS_DEMO_IDENTITY_IMAGE"
docker compose --env-file "$ENV_FILE" -f "$HERE/compose.identity.yml" config -q
docker compose --env-file "$ENV_FILE" -f "$HERE/compose.identity.yml" up -d db
docker compose --env-file "$ENV_FILE" -f "$HERE/compose.identity.yml" up -d identity
healthy=0
for i in $(seq 1 60); do
  if curl -fsS --max-time 3 "http://127.0.0.1:${ADS_DEMO_IDENTITY_PORT:-18090}/health" | grep -q '"status":"ok"'; then healthy=1; break; fi
  sleep 2
done
if [[ "$healthy" != 1 ]]; then
  echo "Demo identity not healthy. Do not alter the legacy identity."
  docker ps --filter name=ads-demo-identity --format '{{.Names}} {{.Status}}'
  exit 1
fi
echo "ADS_DEMO_IDENTITY_LOCAL_HEALTH=PASS"
echo "Demo user/org bootstrap is a separate explicit operator step: bootstrap-demo-accounts.sh"
echo "HTTPS issuer / OIDC endpoint and DNS are not certified by this local health result."

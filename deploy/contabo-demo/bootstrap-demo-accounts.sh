#!/usr/bin/env bash
# Run only after isolated demo identity is healthy and the distinct demo DB is confirmed.
# Creates demo accounts, client registrations and organisations in the DEMO database only.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ADS_IMAGES_ENV:-/etc/ads-demo/images.env}"
IDENTITY_ENV="/etc/ads-demo/identity.env"
test -r "$ENV_FILE" && test -r "$IDENTITY_ENV"
grep -qx 'ADS_ENV=demo' "$IDENTITY_ENV"
grep -qx 'DEMO_MODE=1' "$IDENTITY_ENV"
test "$(docker inspect ads-demo-identity --format '{{.State.Health.Status}}' 2>/dev/null)" = healthy || {
  echo "Demo identity must be healthy first"; exit 1;
}
# Check internal environment without printing secret values.
docker exec ads-demo-identity node -e 'if(process.env.ADS_ENV!=="demo"||process.env.DEMO_MODE!=="1")process.exit(2)'
output_dir="/var/lib/ads-demo/operator-secrets"
install -d -m 700 "$output_dir"
secret_name="client-secrets.json"
tenant_name="demo-tenants.json"
if [[ -e "$output_dir/$secret_name" ]]; then
  echo "Existing client secrets present. Refusing to overwrite; inspect before retrying."
  exit 1
fi
echo "Registering reviewed demo identity clients in the isolated database..."
docker exec ads-demo-identity node scripts/apply-clients.mjs --secrets-out "/tmp/$secret_name"
# Copy generated product secrets outside the container before its filesystem can be replaced.
if docker exec ads-demo-identity test -f "/tmp/$secret_name"; then
  docker cp "ads-demo-identity:/tmp/$secret_name" "$output_dir/$secret_name"
  chmod 600 "$output_dir/$secret_name"
  docker exec -u 0 ads-demo-identity rm -f "/tmp/$secret_name"
fi
echo "Creating the 3 demo identity accounts and demo-only organisations..."
docker exec ads-demo-identity node src/cli.mjs demo-bootstrap
docker exec ads-demo-identity node src/cli.mjs demo-orgs --out "/tmp/$tenant_name"
docker cp "ads-demo-identity:/tmp/$tenant_name" "$output_dir/$tenant_name"
chmod 600 "$output_dir/$tenant_name"
docker exec -u 0 ads-demo-identity rm -f "/tmp/$tenant_name"
source "$ENV_FILE"
curl -fsS "http://127.0.0.1:${ADS_DEMO_IDENTITY_PORT:-18090}/login?lang=en" | grep -q 'Use demo account' || {
  echo "Expected English demo login panel is not enabled"; exit 1;
}
curl -fsS "http://127.0.0.1:${ADS_DEMO_IDENTITY_PORT:-18090}/login?lang=fr" | grep -q 'Utiliser le compte' || {
  echo "Expected French demo login panel is not enabled"; exit 1;
}
curl -fsS "http://127.0.0.1:${ADS_DEMO_IDENTITY_PORT:-18090}/.well-known/openid-configuration" | grep -q 'authorization_endpoint' || {
  echo "OIDC discovery failed"; exit 1;
}
echo "ADS_DEMO_ACCOUNTS_AND_OIDC_LOCAL_SMOKE=PASS"
echo "Public TLS, product callbacks, roles and end-to-end sessions require separate verification."

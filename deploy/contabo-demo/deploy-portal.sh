#!/usr/bin/env bash
# Pull and promote a single approved portal Docker version. Never modifies the shared identity service.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ADS_IMAGES_ENV:-/etc/ads-demo/images.env}"
test -r "$ENV_FILE" || { echo "Missing $ENV_FILE"; exit 1; }
set -a; source "$ENV_FILE"; set +a
case "${ADS_PORTAL_IMAGE:-}" in
  ghcr.io/ksondo/ads-demo-portal:sha-*) ;;
  *) echo "Refusing unversioned or non-ADS portal image"; exit 1 ;;
esac
[[ "$ADS_PORTAL_IMAGE" =~ ^ghcr\.io/ksondo/ads-demo-portal:sha-[0-9a-f]{40}$ ]] || { echo "Full 40-character approved SHA tag required"; exit 1; }
for cmd in docker curl; do command -v "$cmd" >/dev/null || { echo "Missing $cmd"; exit 1; }; done
if [[ -n "${ADS_PORTAL_PORT:-}" ]] && ! [[ "$ADS_PORTAL_PORT" =~ ^[0-9]{4,5}$ ]]; then echo "Invalid port"; exit 1; fi
if ! docker ps -a --format '{{.Names}}' | grep -qx ads-demo-portal; then
  if ss -ltnH | awk '{print $4}' | grep -Eq ":(${ADS_PORTAL_PORT:-18089})$"; then
    echo "Desired port already allocated; refusing to affect unknown service."; exit 1
  fi
fi
echo "Pulling approved portal image: $ADS_PORTAL_IMAGE"
docker pull "$ADS_PORTAL_IMAGE"
# Verify the candidate before replacing an existing portal.
canary="ads-demo-portal-candidate-$$"
docker run -d --name "$canary" --network bridge --security-opt no-new-privileges:true "$ADS_PORTAL_IMAGE" >/dev/null
trap 'docker rm -f "$canary" >/dev/null 2>&1 || true' EXIT
ok=0
for i in $(seq 1 25); do
  if docker exec "$canary" wget -qO- http://127.0.0.1/ 2>/dev/null | grep -q 'ADS Digital Ecosystem'; then ok=1; break; fi
  sleep 1
done
test "$ok" = 1 || { echo "Candidate failed smoke test; existing portal untouched"; exit 1; }
previous="$(docker inspect ads-demo-portal --format '{{.Config.Image}}' 2>/dev/null || true)"
docker compose --project-name ads-demo-portal --env-file "$ENV_FILE" -f "$SCRIPT_DIR/compose.portal.yml" up -d --no-deps --force-recreate portal
ok=0
for i in $(seq 1 30); do
  if curl -fsS --max-time 2 "http://127.0.0.1:${ADS_PORTAL_PORT:-18089}/" | grep -q 'ADS Digital Ecosystem'; then ok=1; break; fi
  sleep 1
done
if [[ "$ok" != 1 ]]; then
  echo "New portal failed local smoke. Attempting rollback..."
  if [[ "$previous" == ghcr.io/ksondo/ads-demo-portal:sha-* ]]; then
    ADS_PORTAL_IMAGE="$previous" docker compose --project-name ads-demo-portal --env-file "$ENV_FILE" -f "$SCRIPT_DIR/compose.portal.yml" up -d --no-deps --force-recreate portal
  else
    echo "No previous approved image found; inspect only ads-demo-portal."
  fi
  exit 1
fi
echo "ADS_PORTAL_LOCAL_HTTP=PASS on 127.0.0.1:${ADS_PORTAL_PORT:-18089}"
echo "Live public HTTPS/DNS and visual acceptance remain independent gates."

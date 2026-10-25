#!/usr/bin/env bash
# One-time GitHub -> Contabo promotion of an approved read-only Business Opportunities API.
# The operator stages the pinned Git commit via git fetch + git archive on this VPS.
# No Windows copy, Nginx edit, DB migration, shared account changes or volume deletion.
set -euo pipefail
umask 077

fail(){ echo "ADS_DIRECTORY_RELEASE_REFUSED: $*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || fail "authorized VPS root only"
[ "$(hostname -s)" = "vmi3191089" ] || fail "unexpected VPS"
for cmd in docker curl python3 flock ss; do
 command -v "$cmd" >/dev/null || fail "missing command $cmd"
done
docker compose version >/dev/null || fail "docker compose unavailable"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
[ "$(stat -c '%u' "$ROOT")" = 0 ] || fail "staged source must be root-owned"
[ -f "$ROOT/services/business-opportunities/compose.yml" ] || fail "missing approved compose"
[ -f "$ROOT/services/business-opportunities/server.mjs" ] || fail "missing approved API"
OWNER=/etc/ads-demo/opportunities.env
READER=/etc/ads-demo/opportunities-api.env
for f in "$OWNER" "$READER"; do
 [ -f "$f" ] || fail "missing existing credentials"
 [ "$(stat -c '%a:%u' "$f")" = "600:0" ] || fail "unsafe credential permissions"
done
exec 9>/var/lock/ads-opportunities-bootstrap.lock
flock -n 9 || fail "opportunities bootstrap/release is already running"
[ "$(docker inspect -f '{{.State.Health.Status}}' ads-business-opportunities-db)" = healthy ] || fail "isolated database unhealthy"
[ "$(docker inspect -f '{{.State.Health.Status}}' ads-business-opportunities-api)" = healthy ] || fail "current API unhealthy"
for svc in ads-demo-portal ads-demo-identity ads-commerce-demo-db-1; do
 docker inspect "$svc" >/dev/null 2>&1 || fail "existing ADS service missing: $svc"
done
ss -ltn | grep -qE ':18190[[:space:]]' || fail "current API port 18190 missing"
# Canary has no host-published port; other occupants of port 18191 are untouched.

PROJECT="$ROOT/services/business-opportunities"
COMPOSE="$PROJECT/compose.yml"
compose(){ docker compose --project-directory "$PROJECT" --env-file "$OWNER" -f "$COMPOSE" "$@"; }
compose config --quiet || fail "compose configuration invalid"
TAG=ads-business-opportunities-public-read-api:latest
OLD_ID="$(docker inspect -f '{{.Image}}' ads-business-opportunities-api)"
NAME="ads-opportunities-api-canary-$$"
cutover=0

http_total(){
 local endpoint="$1" expected="$2" origin="$3"
 curl --noproxy '*' -fsS --max-time 12 "$origin/api/opportunities/v1/$endpoint" |
  python3 -c 'import json,sys; j=json.load(sys.stdin); assert isinstance(j,dict) and j.get("total")==int(sys.argv[1]),j.get("total")' "$expected"
}
https_total(){
 local endpoint="$1" expected="$2"
 curl --noproxy '*' --resolve demo.africadigitalsynergy.com:443:127.0.0.1 \
  -fsS --max-time 12 "https://demo.africadigitalsynergy.com/api/opportunities/v1/$endpoint" |
  python3 -c 'import json,sys; j=json.load(sys.stdin); assert isinstance(j,dict) and j.get("total")==int(sys.argv[1]),j.get("total")' "$expected"
}
all_totals(){
 local origin="$1"
 http_total sectors 50 "$origin"
 http_total 'opportunities?limit=1' 333 "$origin"
 http_total 'discovery/categories?family=business' 13 "$origin"
 http_total 'discovery/categories?family=institutional' 8 "$origin"
 http_total 'discovery/solutions?family=business&limit=1' 102 "$origin"
 http_total 'discovery/solutions?family=institutional&limit=1' 20 "$origin"
 http_total 'businesses?limit=100' 52 "$origin"
}
# Probe the candidate *inside* its Docker network namespace. The canary
# never publishes 18191 or any other host port and cannot disrupt listeners.
canary_total(){
 local path="$1" expected="$2"
 docker exec "$NAME" node -e '
 const path=process.argv[1],expected=Number(process.argv[2]);
 const t=setTimeout(()=>{console.error("canary timeout");process.exit(1)},10000);
 fetch("http://127.0.0.1:31090/api/opportunities/v1/"+path)
  .then(async r=>{if(!r.ok)throw Error("HTTP "+r.status);return r.json()})
  .then(d=>{if(d.total!==expected)throw Error("expected total "+expected+" got "+d.total);clearTimeout(t)})
  .catch(e=>{console.error("canary API check failed: "+e.message);process.exit(1)})
 ' "$path" "$expected" >/dev/null
}
all_canary_totals(){
 canary_total sectors 50
 canary_total 'opportunities?limit=1' 333
 canary_total 'discovery/categories?family=business' 13
 canary_total 'discovery/categories?family=institutional' 8
 canary_total 'discovery/solutions?family=business&limit=1' 102
 canary_total 'discovery/solutions?family=institutional&limit=1' 20
 canary_total 'businesses?limit=100' 52
}

cleanup(){
 local status="$?"
 trap - EXIT
 docker rm -f "$NAME" >/dev/null 2>&1 || :
 if [ "$status" -ne 0 ]; then
  # Also restore the image tag when a candidate fails BEFORE live cutover.
  # The running container is still untouched in that case.
  if ! docker image tag "$OLD_ID" "$TAG"; then
   echo "ADS_DIRECTORY_RELEASE_IMAGE_TAG_ROLLBACK=MANUAL_REVIEW_REQUIRED" >&2
  fi
  if [ "$cutover" -eq 1 ]; then
   echo "ADS_DIRECTORY_RELEASE=RESTORING_PREVIOUS_API_CONTAINER" >&2
   if compose up -d --no-build --no-deps --force-recreate public-read-api; then
    echo "ADS_DIRECTORY_RELEASE_ROLLBACK=ATTEMPTED" >&2
   else
    echo "ADS_DIRECTORY_RELEASE_ROLLBACK=MANUAL_REVIEW_REQUIRED" >&2
   fi
  fi
 fi
 exit "$status"
}
trap cleanup EXIT

echo "=== VERIFY EXISTING API AND HTTPS BEFORE REPLACEMENT ==="
http_total sectors 50 http://127.0.0.1:18190
https_total sectors 50

echo "=== BUILD NEW APPROVED API FROM PINNED GIT ARCHIVE ==="
compose build public-read-api
docker image inspect "$TAG" >/dev/null || fail "built image tag missing"

echo "=== CANARY: PRIVATE DOCKER NETWORK ONLY, NO HOST PORT ==="
docker run --rm -d \
 --name "$NAME" --network ads-business-opportunities-private \
 --env-file "$READER" --security-opt no-new-privileges:true \
 --read-only --tmpfs /tmp --memory 256m \
 "$TAG" >/dev/null
ok=0
for n in $(seq 1 35); do
 if docker exec "$NAME" node -e   "fetch('http://127.0.0.1:31090/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then ok=1; break; fi
 sleep 1
done
[ "$ok" = 1 ] || fail "canary never became healthy"
all_canary_totals
echo "ADS_DIRECTORY_API_CANARY=PASS 52/50/333/13/8/102/20"
docker rm -f "$NAME" >/dev/null

echo "=== RECREATE ONLY BUSINESS OPPORTUNITIES READ API ==="
cutover=1
compose up -d --no-build --no-deps --force-recreate public-read-api
ok=0
for n in $(seq 1 35); do
 if curl --noproxy '*' -fsS --max-time 3 http://127.0.0.1:18190/health >/dev/null 2>&1; then ok=1; break; fi
 sleep 1
done
[ "$ok" = 1 ] || fail "new API failed health gate"
all_totals http://127.0.0.1:18190
https_total sectors 50
https_total 'opportunities?limit=1' 333
https_total 'discovery/categories?family=business' 13
https_total 'discovery/categories?family=institutional' 8
https_total 'discovery/solutions?family=business&limit=1' 102
https_total 'discovery/solutions?family=institutional&limit=1' 20
https_total 'businesses?limit=100' 52
echo "ADS_BUSINESS_DIRECTORY_API_PUBLIC=PASS 52/50/333/13/8/102/20"
echo "ADS_COMMERCE_IDENTITY_PORTAL_DATABASE_AND_NGINX=UNCHANGED"

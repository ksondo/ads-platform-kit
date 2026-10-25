#!/usr/bin/env bash
# Additive bootstrap for isolated ADS Business Opportunities on vmi3191089.
# Does not edit Nginx, Commerce, Identity, landing page or shared databases.
set -euo pipefail
umask 077
fail() { echo "ADS_OPPORTUNITIES_REFUSED: $*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || fail "Root operator required"
[ "$(hostname -s)" = "vmi3191089" ] || fail "Wrong server"
for cmd in docker curl python3 openssl flock ss; do command -v "$cmd" >/dev/null || fail "Missing: $cmd"; done
docker compose version >/dev/null
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
[ "$(stat -c %u "$ROOT")" = 0 ] || fail "Source must be root-owned"
for file in services/business-opportunities/seed/opportunities.v1.json services/business-opportunities/seed/discovery.v1.json; do
 [ -s "$ROOT/$file" ] || fail "Missing source: $file"
done
CONF=/etc/ads-demo
OWN="$CONF/opportunities.env"
API="$CONF/opportunities-api.env"
COMPOSE="$ROOT/services/business-opportunities/compose.yml"
exec 9>/var/lock/ads-opportunities-bootstrap.lock
flock -n 9 || fail "Another bootstrap is running"
if ss -ltn | grep -qE ':18190[[:space:]]'; then
  docker inspect ads-business-opportunities-api >/dev/null 2>&1 || fail "Port 18190 is occupied"
fi
[ "$(df -PB1 /var/lib/docker | awk 'NR==2 {print $4}')" -gt 1500000000 ] || fail "Insufficient Docker space"
for name in ads-demo-portal ads-demo-identity ads-commerce-demo-db-1; do
 docker inspect "$name" >/dev/null 2>&1 || fail "Existing ADS service is missing: $name"
done
if [ ! -d "$CONF" ]; then install -d -o root -g root -m 0700 "$CONF"; fi
[ "$(stat -c %u "$CONF")" = 0 ] || fail "Existing ADS demo config directory must be root-owned"
if [ ! -e "$OWN" ] && [ ! -e "$API" ]; then
  owner_pw="$(openssl rand -hex 32)"
  reader_pw="$(openssl rand -hex 32)"
  t1="$(mktemp "$CONF/.opportunities-owner.XXXXXXXX")"
  t2="$(mktemp "$CONF/.opportunities-api.XXXXXXXX")"
  chmod 0600 "$t1" "$t2"
  printf 'OPPORTUNITIES_DB_OWNER_PASSWORD=%s\n' "$owner_pw" > "$t1"
  printf 'OPPORTUNITIES_DATABASE_URL=postgres://ads_opportunities_reader:%s@db:5432/ads_opportunities\n' "$reader_pw" > "$t2"
  mv -n "$t1" "$OWN"
  mv -n "$t2" "$API"
  echo 'ADS_OPPORTUNITIES_CREDENTIALS=GENERATED_NOT_DISPLAYED'
elif [ ! -f "$OWN" ] || [ ! -f "$API" ]; then
  fail "Incomplete existing credential files; operator review required"
fi
[ "$(stat -c '%a:%u' "$OWN")" = "600:0" ] || fail "Owner file must be root-only"
[ "$(stat -c '%a:%u' "$API")" = "600:0" ] || fail "API file must be root-only"
owner_line="$(cat "$OWN")"
api_line="$(cat "$API")"
[[ "$owner_line" =~ ^OPPORTUNITIES_DB_OWNER_PASSWORD=([0-9a-f]{64})$ ]] || fail "Invalid owner configuration"
owner_pw="${BASH_REMATCH[1]}"
[[ "$api_line" =~ ^OPPORTUNITIES_DATABASE_URL=postgres://ads_opportunities_reader:([0-9a-f]{64})@db:5432/ads_opportunities$ ]] || fail "Invalid reader configuration"
reader_pw="${BASH_REMATCH[1]}"
unset owner_line api_line
compose() { docker compose --project-directory "$ROOT/services/business-opportunities" --env-file "$OWN" -f "$COMPOSE" "$@"; }
compose config --quiet || fail "Compose configuration invalid"
echo '=== BUILD ISOLATED DATABASE SEED AND READ API ==='
compose --profile operator-seed build seed public-read-api
echo '=== START ONLY PRIVATE POSTGRESQL ==='
compose up -d db
ready=0
for i in $(seq 1 50); do
 if [ "$(docker inspect -f '{{.State.Health.Status}}' ads-business-opportunities-db 2>/dev/null || true)" = healthy ]; then ready=1; break; fi
 sleep 2
done
[ "$ready" = 1 ] || fail "Dedicated PostgreSQL not healthy"
for file in 001_catalogue.sql 002_discovery.sql; do
 compose exec -T db psql -X -U opportunities_owner -d ads_opportunities -v ON_ERROR_STOP=1 < "$ROOT/services/business-opportunities/db/$file" >/dev/null
 echo "ADS_OPPORTUNITIES_MIGRATION=PASS $file"
done
# Generate SQL in the protected stdin stream, never as printed CLI arguments.
{
 printf "%s\n" "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ads_opportunities_reader') THEN CREATE ROLE ads_opportunities_reader LOGIN; END IF; END \$\$;"
 printf "ALTER ROLE ads_opportunities_reader LOGIN PASSWORD '%s';\n" "$reader_pw"
 printf '%s\n' \
  'GRANT CONNECT ON DATABASE ads_opportunities TO ads_opportunities_reader;' \
  'GRANT USAGE ON SCHEMA opportunities TO ads_opportunities_reader;' \
  'GRANT SELECT ON ALL TABLES IN SCHEMA opportunities TO ads_opportunities_reader;' \
  'ALTER DEFAULT PRIVILEGES FOR ROLE opportunities_owner IN SCHEMA opportunities GRANT SELECT ON TABLES TO ads_opportunities_reader;'
} | compose exec -T db psql -X -U opportunities_owner -d ads_opportunities -v ON_ERROR_STOP=1 >/dev/null
echo 'ADS_OPPORTUNITIES_READ_ONLY_ROLE=PASS'
compose --profile operator-seed run --rm seed node validate-seed.mjs
compose --profile operator-seed run --rm seed node seed-discovery.mjs --validate-only
compose --profile operator-seed run --rm seed node seed.mjs
compose --profile operator-seed run --rm seed node seed-discovery.mjs
sql="SELECT (SELECT count(*) FROM opportunities.sectors)::text || '/' || (SELECT count(*) FROM opportunities.sector_opportunities)::text || '/' || (SELECT count(*) FROM opportunities.business_types)::text || '/' || (SELECT count(*) FROM opportunities.discovery_categories)::text || '/' || (SELECT count(*) FROM opportunities.discovery_solutions)::text"
counts="$(compose exec -T db psql -X -U opportunities_owner -d ads_opportunities -Atqc "$sql" | tr -d '\r')"
[ "$counts" = 49/328/52/21/121 ] || fail "Unexpected catalogue totals: $counts"
echo "ADS_OPPORTUNITIES_DATABASE=PASS $counts"
compose up -d --no-deps public-read-api
ready=0
for i in $(seq 1 40); do
 if curl --noproxy '*' -fsS --max-time 3 http://127.0.0.1:18190/health >/dev/null 2>&1; then ready=1; break; fi
 sleep 2
done
[ "$ready" = 1 ] || fail "Read API did not start on port 18190"
check_api() {
 curl --noproxy '*' -fsS --max-time 12 "http://127.0.0.1:18190/api/opportunities/v1/$1" |
   python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["total"]==int(sys.argv[1])' "$2"
}
check_api sectors 49
check_api 'opportunities?limit=1' 328
check_api 'discovery/categories?family=business' 13
check_api 'discovery/categories?family=institutional' 8
check_api 'discovery/solutions?family=business&limit=1' 102
check_api 'discovery/solutions?family=institutional&limit=1' 20
echo 'ADS_OPPORTUNITIES_LOCAL_API=PASS'
echo 'ADS_NGINX_AND_CURRENT_PORTAL=UNCHANGED'
echo 'ADS_OPPORTUNITIES_BOOTSTRAP=PASS'

#!/usr/bin/env bash
# Read-only ADS direct-app deployment preflight on existing Contabo VPS.
# Changes no Docker, database, Nginx, certificates, or Git working tree.
set -Eeuo pipefail
if [[ "$(hostname -s)" != "vmi3191089" ]]; then
  echo "REFUSED: expected Contabo host vmi3191089" >&2
  exit 2
fi
echo "ADS_DIRECT_PREFLIGHT=START utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "=== Disk and memory ==="
df -h /
free -h
echo "=== Docker services (read-only) ==="
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
docker system df
echo "=== Listening ports (no secrets/process environment) ==="
ss -ltn | head -100
echo "=== Existing Nginx validation ==="
nginx -t
echo "=== Planned HTTPS hostnames: DNS and certificate verification ==="
for host in \
  demo.africadigitalsynergy.com \
  commerce.demo.africadigitalsynergy.com \
  education.demo.africadigitalsynergy.com \
  fleetguard.demo.africadigitalsynergy.com \
  home-services.demo.africadigitalsynergy.com \
  mamacare.demo.africadigitalsynergy.com \
  morphoo.demo.africadigitalsynergy.com \
  tontine.demo.africadigitalsynergy.com \
  ventureworks.demo.africadigitalsynergy.com \
  login.demo.africadigitalsynergy.com
do
  ip="$(dig +time=2 +tries=1 +short "$host" A | grep -E '^[0-9.]+$' | paste -sd, - || true)"
  [[ -n "$ip" ]] || ip=UNRESOLVED
  set +e
  status="$(curl --noproxy '*' --connect-timeout 4 --max-time 9 -sS -o /dev/null \
    -w '%{http_code} tls_verify=%{ssl_verify_result}' "https://$host/" 2>/dev/null)"
  result=$?
  set -e
  if [[ "$result" -ne 0 ]]; then status="CURL_ERROR_$result"; fi
  printf '%-53s A=%-20s HTTPS=%s\n' "$host" "$ip" "$status"
done
echo "=== Public portal catalogue (no passwords or tokens) ==="
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
if curl --noproxy '*' -fsS --max-time 15 \
  https://demo.africadigitalsynergy.com/catalogue.json -o "$tmp"; then
  python3 - "$tmp" <<'PY'
import json,sys
with open(sys.argv[1],encoding="utf8") as f:
    c=json.load(f)
ids={"commerce","education","ventureworks","fleet-guard","mama-care","digital-tontine","home-services","morphoo"}
found=set()
for p in c.get("platforms",[]):
    name=p.get("id")
    if name in ids:
        found.add(name)
        print("PORTAL",name,"STATUS",p.get("availability"),"URL",p.get("demoUrl") or "NOT_PUBLISHED")
for name in sorted(ids-found):
    print("PORTAL_MISSING",name)
PY
else
  echo "PORTAL_CATALOGUE_UNREACHABLE"
fi
echo "=== Existing protected paths (presence only) ==="
for p in /opt/ads/demo-platform-kit /etc/ads-demo \
  /etc/ads-demo/images.env /etc/ads-demo/commerce.env /etc/ads-demo/identity.env; do
  if [[ -e "$p" ]]; then echo "EXISTS $p"; else echo "MISSING $p"; fi
done
echo "=== SSH access to each application repository (read-only) ==="
for repo in Education-and-intelligent-services Fleet-guard-and-intelligent-services \
  Home-Services Mama-care-and-intelligent-services go-ahead-guesser \
  Digital-tontine-and-intelligent-services Africa-Digital-Synergy-VentureWorks
do
  if GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=7" \
     timeout 20 git ls-remote --exit-code "git@github.com:ksondo/$repo.git" HEAD >/dev/null 2>&1; then
    echo "GITHUB_ACCESS_OK $repo"
  else
    echo "GITHUB_ACCESS_FAILED $repo"
  fi
done
echo "ADS_DIRECT_PREFLIGHT=COMPLETE_NO_CHANGES"

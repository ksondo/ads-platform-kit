#!/usr/bin/env bash
# Read-only follow-up for direct Contabo ADS deployments. No secrets are read or printed.
set -Eeuo pipefail
[[ "$(hostname -s)" == vmi3191089 ]] || { echo 'WRONG_HOST' >&2; exit 2; }
echo 'ADS_DIRECT_RUNTIME_AUDIT_START'
echo '=== Existing demo web services via loopback (status only) ==='
check() {
  local name="$1" url="$2" result rc
  set +e
  result="$(curl --noproxy '*' --connect-timeout 3 --max-time 8 -sS \
    -o /dev/null -w '%{http_code} ip=%{remote_ip}' "$url" 2>/dev/null)"
  rc=$?
  set -e
  if ((rc!=0)); then result="UNREACHABLE curl_exit=$rc"; fi
  echo "$name: $result"
}
check landing http://127.0.0.1:18089/
check landing-platforms http://127.0.0.1:18089/platforms
check commerce http://127.0.0.1:18086/commerce
check commerce-pos http://127.0.0.1:18086/commerce/merchant/pos
check ventureworks-staging http://127.0.0.1:18480/
check morphoo-existing http://127.0.0.1:18100/
echo '=== Existing app containers and health (no environment data) ==='
for n in ads-demo-portal ads-commerce-demo-commerce-web-1 ads-commerce-demo-commerce-api-1 \
  ads-demo-identity ads-ventureworks-staging-web-1 ads-ventureworks-staging-api-1 \
  ads-ventureworks-db morphoo-web-1 morphoo-api-1 morphoo-db-1 morphoo-rag-gateway-1 morphoo-rag-worker-1; do
  if docker inspect "$n" >/dev/null 2>&1; then
    docker inspect --format '{{.Name}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}not_configured{{end}}' "$n"
  else
    echo "MISSING_CONTAINER $n"
  fi
done
echo '=== Existing Git checkouts in /opt/ads (path and commit only; no remote URLs) ==='
if [[ -d /opt/ads ]]; then
  while IFS= read -r path; do
    dir="$(dirname "$path")"
    if git -C "$dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      sha="$(git -C "$dir" rev-parse --short=12 HEAD 2>/dev/null || echo unknown)"
      printf 'CHECKOUT path=%s commit=%s\n' "$dir" "$sha"
    fi
  done < <(find /opt/ads -maxdepth 6 -name .git -print 2>/dev/null | head -80)
fi
echo '=== SSH authentication identity (do not print private keys or tokens) ==='
if command -v ssh >/dev/null 2>&1; then
  set +e
  result="$(timeout 12 ssh -T -o BatchMode=yes -o ConnectTimeout=6 git@github.com 2>&1)"
  rc=$?
  set -e
  if [[ "$result" == *"successfully authenticated"* ]]; then
    echo 'GITHUB_SSH_AUTH=ACCEPTED'
  else
    echo "GITHUB_SSH_AUTH=UNCONFIRMED exit=$rc"
  fi
fi
echo '=== Hostname Nginx site file existence only ==='
for host in demo commerce.demo education.demo fleetguard.demo home-services.demo \
  mamacare.demo morphoo.demo tontine.demo ventureworks.demo login.demo; do
  path="/etc/nginx/sites-enabled/$host.africadigitalsynergy.com"
  if [[ -e "$path" ]]; then echo "NGINX_SITE_PRESENT $host"; else echo "NGINX_SITE_NOT_AT_NAMED_PATH $host"; fi
done
echo 'ADS_DIRECT_RUNTIME_AUDIT_COMPLETE_NO_CHANGES'

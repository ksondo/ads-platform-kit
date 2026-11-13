#!/usr/bin/env bash
# ADS demo release acceptance: READ-ONLY checks run on the Contabo demo host before a product is opened
# on the portal (deploy/contabo-demo/ADS_ONE_TIME_RELEASE_20261111.md, RUNBOOK.md §G).
#
#   bash deploy/contabo-demo/release-acceptance.sh [--product ID] [--manifest FILE] [--all-clients] [--plan]
#
# Products (portal/manifest ids): commerce education agriculture fleet-guard digital-tontine ventureworks tourism.
# A product with no entry in the manifest is skipped with an INFO line, unless it was named with --product
# (then it FAILs as not pinned). Tourism is pinned in ads-release-20261113-tourism.manifest.json (TOU-0):
#   bash deploy/contabo-demo/release-acceptance.sh --product tourism --manifest deploy/contabo-demo/ads-release-20261113-tourism.manifest.json
# Per product: (a) running image carries the manifest SHA; (b) Identity client registration has not drifted
# from /app/config/clients.demo.json and /authorize accepts the demo callback; (c) demo access switch and
# grant-check secrets present (yes/no only); (d) seed worker healthy where demo access is on; (e) the kit
# ads-identity.js is served as JavaScript and every static file is world-readable; (f) health and issuer.
# When the manifest has "sector_link": {"enabled": true, "service_clients": [...]}, each listed service client
# must be in the reviewed service_clients, registered as an active kind=service client with the reviewed
# scopes and audiences, and have a secret set (yes/no only; the secret hash is never selected).
#
# Never changes containers, files, Nginx or databases, and never prints a secret value: secrets are tested
# for presence inside the container and reported as yes/no. The /authorize probe records one short-lived,
# unused Identity authorization request per client (it expires on its own; no account or grant is touched).
# Output: one PASS/FAIL/INFO line per check; exit status 1 if any check FAILs, 2 on usage error.
set -euo pipefail

# ---------------------------------------------------------------------------------------------------------
# Configuration. Defaults follow each product's reviewed deploy/demo/compose.yml (Compose project + service,
# container "<project>-<service>-1"). Confirm with `docker ps --format '{{.Names}}'` and override with
# environment variables, never by editing this file on the host:
#   ADS_ACC_ISSUER, ADS_ACC_IDENTITY_CONTAINER, ADS_ACC_IDENTITY_DB_CONTAINER, ADS_ACC_IDENTITY_DB_USER,
#   ADS_ACC_IDENTITY_DB_NAME, ADS_ACC_CURL_TIMEOUT
#   ADS_ACC_<ID>_<FIELD> with ID upper-cased and '-' as '_' (e.g. ADS_ACC_DIGITAL_TONTINE_APP) and FIELD one of
#   HOST APP WEB ROOT ACCESS_VAR WORKER HEALTH CLIENT KEY ('-' = not applicable).
# ACCESS_VAR '-': the product has no product-side Demo Access check (Tourism, TOU-0: public registry only,
# no private provisioning); the demo access switch and both grant-check secrets are then reported as INFO.
# ---------------------------------------------------------------------------------------------------------
ISSUER="${ADS_ACC_ISSUER:-https://login.demo.africadigitalsynergy.com}"
IDENTITY_CONTAINER="${ADS_ACC_IDENTITY_CONTAINER:-ads-demo-identity}"
IDENTITY_DB_CONTAINER="${ADS_ACC_IDENTITY_DB_CONTAINER:-ads-demo-identity-db-1}"
IDENTITY_DB_USER="${ADS_ACC_IDENTITY_DB_USER:-ads_demo_identity}"
IDENTITY_DB_NAME="${ADS_ACC_IDENTITY_DB_NAME:-ads_demo_identity}"
CURL_TIMEOUT="${ADS_ACC_CURL_TIMEOUT:-10}"
CLIENTS_IN_CONTAINER=/app/config/clients.demo.json
# id | Demo Access registry key (check-secret suffix) | Identity client | public host | app container (env) |
# web container (static files) | static root | demo access switch | seed worker | health path
PRODUCTS_TABLE='
commerce|commerce|commerce-web|commerce.demo.africadigitalsynergy.com|ads-commerce-demo-commerce-api-1|ads-commerce-demo-commerce-web-1|/usr/share/nginx/html|COMMERCE_DEMO_ACCESS|-|/api/ready
education|education|education-web|education.demo.africadigitalsynergy.com|ads-education-demo-education-1|ads-education-demo-education-1|/app/dist|EDUCATION_DEMO_ACCESS|-|/ready
agriculture|agriculture|agriculture-web|agriculture.demo.africadigitalsynergy.com|ads-agriculture-demo-agriculture-1|ads-agriculture-demo-agriculture-1|/app/src/public|AGRICULTURE_DEMO_ACCESS|ads-agriculture-demo-agriculture-demo-seed-worker-1|/health
fleet-guard|fleet-guard|fleet-guard-web|fleetguard.demo.africadigitalsynergy.com|ads-fleetguard-demo-fleetguard-1|ads-fleetguard-demo-fleetguard-1|/app/dist|FLEETGUARD_DEMO_ACCESS|ads-fleetguard-demo-demo-seed-worker-1|/health
digital-tontine|tontine|tontine-web|tontine.demo.africadigitalsynergy.com|ads-tontine-demo-tontine-1|ads-tontine-demo-tontine-1|/app/dist|TONTINE_DEMO_ACCESS|ads-tontine-demo-demo-seed-worker-1|/health
ventureworks|ventureworks|ventureworks-web|ventureworks.demo.africadigitalsynergy.com|ads-ventureworks-demo-ventureworks-1|ads-ventureworks-demo-ventureworks-1|/srv/dist|VENTUREWORKS_DEMO_ACCESS|-|/health
tourism|tourism|tourism-web|tourism.demo.africadigitalsynergy.com|ads-tourism-demo-tourism-1|ads-tourism-demo-tourism-1|/app/dist|-|-|/health
'
# ---------------------------------------------------------------------------------------------------------

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
MANIFEST="$here/ads-release-20261111b.manifest.json"
ONLY=""
ALL_CLIENTS=0
PLAN=0
usage() { echo 'Usage: release-acceptance.sh [--product ID] [--manifest FILE] [--all-clients] [--plan]' >&2; exit 2; }
while [[ $# -gt 0 ]]; do
  case "$1" in
    --product) [[ $# -ge 2 ]] || usage; ONLY="$2"; shift 2 ;;
    --manifest) [[ $# -ge 2 ]] || usage; MANIFEST="$2"; shift 2 ;;
    --all-clients) ALL_CLIENTS=1; shift ;;
    --plan) PLAN=1; shift ;;
    *) usage ;;
  esac
done

FAILS=0
pass() { printf 'PASS %-16s %-22s %s\n' "$1" "$2" "${3:-}"; }
fail() { printf 'FAIL %-16s %-22s %s\n' "$1" "$2" "${3:-}"; FAILS=$((FAILS + 1)); }
info() { printf 'INFO %-16s %-22s %s\n' "$1" "$2" "${3:-}"; }
safe_name() { [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$ ]]; }
safe_path() { [[ "$1" =~ ^/[A-Za-z0-9_./-]{0,255}$ && "$1" != *..* ]]; }

declare -A P_KEY P_CLIENT P_HOST P_APP P_WEB P_ROOT P_ACCESS P_WORKER P_HEALTH
IDS=()
while IFS='|' read -r id key client host app web root access worker health; do
  [[ -n "$id" ]] || continue
  upper="$(printf '%s' "$id" | tr 'a-z-' 'A-Z_')"
  ov() { local v="ADS_ACC_${upper}_$1"; printf '%s' "${!v:-$2}"; }
  P_KEY[$id]="$(ov KEY "$key")"; P_CLIENT[$id]="$(ov CLIENT "$client")"; P_HOST[$id]="$(ov HOST "$host")"
  P_APP[$id]="$(ov APP "$app")"; P_WEB[$id]="$(ov WEB "$web")"; P_ROOT[$id]="$(ov ROOT "$root")"
  P_ACCESS[$id]="$(ov ACCESS_VAR "$access")"; P_WORKER[$id]="$(ov WORKER "$worker")"; P_HEALTH[$id]="$(ov HEALTH "$health")"
  for f in "${P_APP[$id]}" "${P_WEB[$id]}" "${P_WORKER[$id]}" "${P_CLIENT[$id]}" "${P_HOST[$id]}"; do
    [[ "$f" == - ]] || safe_name "$f" || { echo "Invalid configuration value for $id" >&2; exit 2; }
  done
  if ! safe_path "${P_ROOT[$id]}" || ! safe_path "${P_HEALTH[$id]}"; then echo "Invalid path for $id" >&2; exit 2; fi
  [[ ( "${P_ACCESS[$id]}" == - || "${P_ACCESS[$id]}" =~ ^[A-Z][A-Z0-9_]{1,63}$ ) && "${P_KEY[$id]}" =~ ^[a-z][a-z0-9-]{1,39}$ ]] || { echo "Invalid variable for $id" >&2; exit 2; }
  IDS+=("$id")
done <<<"$PRODUCTS_TABLE"
for f in "$IDENTITY_CONTAINER" "$IDENTITY_DB_CONTAINER" "$IDENTITY_DB_USER" "$IDENTITY_DB_NAME"; do
  safe_name "$f" || { echo 'Invalid Identity configuration' >&2; exit 2; }
done
[[ "$ISSUER" =~ ^https://[a-z0-9.-]+$ ]] || { echo 'ADS_ACC_ISSUER must be https://<host> without a path' >&2; exit 2; }
[[ "$CURL_TIMEOUT" =~ ^[0-9]{1,3}$ ]] || { echo 'Invalid ADS_ACC_CURL_TIMEOUT' >&2; exit 2; }
if [[ -n "$ONLY" ]]; then
  [[ -n "${P_HOST[$ONLY]+x}" ]] || { echo "Unknown product '$ONLY' (use: ${IDS[*]})" >&2; exit 2; }
  IDS=("$ONLY")
fi
[[ -f "$MANIFEST" && -r "$MANIFEST" ]] || { echo "Manifest not readable: $MANIFEST" >&2; exit 2; }

# Manifest SHA per id ("" when absent). Placeholders and short SHAs are reported as not pinned.
manifest_sha() {
  python3 - "$MANIFEST" "$1" <<'PY'
import json, sys
m = json.load(open(sys.argv[1], encoding="utf-8"))
for s in m.get("immutable_sources", []):
    if s.get("id") == sys.argv[2]:
        print(s.get("sha", "")); break
PY
}

# Whether the manifest has an entry for this id at all (a present entry with a placeholder SHA still FAILs).
manifest_has() {
  python3 - "$MANIFEST" "$1" <<'PY'
import json, sys
m = json.load(open(sys.argv[1], encoding="utf-8"))
sys.exit(0 if any(s.get("id") == sys.argv[2] for s in m.get("immutable_sources", [])) else 1)
PY
}

# Service clients the sector link needs, one per line; nothing when the manifest has no enabled sector_link.
sector_clients() {
  python3 - "$MANIFEST" <<'PY'
import json, re, sys
link = json.load(open(sys.argv[1], encoding="utf-8")).get("sector_link") or {}
if link.get("enabled") is True:
    for cid in link.get("service_clients", []):
        if not isinstance(cid, str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,62}", cid):
            sys.exit("invalid sector_link service client")
        print(cid)
PY
}
SECTOR_CLIENTS="$(sector_clients)" || { echo "Invalid sector_link in $MANIFEST" >&2; exit 2; }

if [[ "$PLAN" == 1 ]]; then
  echo "ADS_RELEASE_ACCEPTANCE_PLAN manifest=$(basename "$MANIFEST") issuer=$ISSUER identity=$IDENTITY_CONTAINER identity_db=$IDENTITY_DB_CONTAINER"
  for id in "${IDS[@]}"; do
    echo "PLAN $id key=${P_KEY[$id]} client=${P_CLIENT[$id]} host=${P_HOST[$id]} app=${P_APP[$id]} web=${P_WEB[$id]} root=${P_ROOT[$id]} access=${P_ACCESS[$id]} worker=${P_WORKER[$id]} health=${P_HEALTH[$id]} sha=$(manifest_sha "$id")"
  done
  echo "SECTOR_LINK_PLAN service_clients=$(printf '%s' "$SECTOR_CLIENTS" | paste -sd, -)"
  echo 'STATUS=PLAN_ONLY (no docker or network call made)'
  exit 0
fi

for cmd in docker curl python3; do command -v "$cmd" >/dev/null || { echo "Missing $cmd" >&2; exit 2; }; done
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
CURL=(curl --silent --show-error --max-time "$CURL_TIMEOUT" --proto '=https')

running() { [[ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null || true)" == true ]]; }
upper_key() { printf '%s' "$1" | tr 'a-z-' 'A-Z_'; }

# ---------- shared Identity: health, issuer, private mode ----------
code="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$ISSUER/health" 2>/dev/null || true)"
if [[ "$code" == 200 ]]; then pass identity health "$ISSUER/health 200"; else fail identity health "$ISSUER/health -> ${code:-no answer}"; fi
issuer="$("${CURL[@]}" "$ISSUER/.well-known/openid-configuration" 2>/dev/null | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("issuer",""))
except Exception: print("")' || true)"
if [[ "$issuer" == "$ISSUER" ]]; then pass identity issuer "$issuer"; else fail identity issuer "expected $ISSUER, got ${issuer:-nothing}"; fi
if running "$IDENTITY_CONTAINER"; then
  if docker exec "$IDENTITY_CONTAINER" sh -c '[ "${DEMO_ACCESS_PRIVATE_ENABLED:-}" = 1 ]' >/dev/null 2>&1; then
    pass identity private-mode 'DEMO_ACCESS_PRIVATE_ENABLED=1'
  else
    fail identity private-mode 'DEMO_ACCESS_PRIVATE_ENABLED is not 1'
  fi
  id_sha="$(manifest_sha ads-identity)"
  id_image="$(docker inspect -f '{{.Config.Image}}' "$IDENTITY_CONTAINER" 2>/dev/null || true)"
  if [[ "$id_sha" =~ ^[0-9a-f]{40}$ && "$id_image" == *"$id_sha"* ]]; then pass identity image "$id_image"
  else fail identity image "running ${id_image:-?} does not carry manifest ads-identity ${id_sha:-?}"; fi
else
  fail identity container "$IDENTITY_CONTAINER not running"
fi

# ---------- Identity client drift (registered vs reviewed list) ----------
drift_ok=0
if docker exec "$IDENTITY_CONTAINER" cat "$CLIENTS_IN_CONTAINER" >"$work/clients.json" 2>/dev/null &&
   docker exec "$IDENTITY_DB_CONTAINER" psql -X -q -At -F $'\t' -v ON_ERROR_STOP=1 -U "$IDENTITY_DB_USER" -d "$IDENTITY_DB_NAME" \
     -c 'SELECT client_id, array_to_json(redirect_uris), array_to_json(post_logout_redirect_uris) FROM platform.oauth_clients ORDER BY client_id' \
     >"$work/registered.tsv" 2>/dev/null; then
  drift_ok=1
else
  fail identity client-drift "could not read $CLIENTS_IN_CONTAINER or platform.oauth_clients (read-only psql in $IDENTITY_DB_CONTAINER)"
fi
client_drift() {
  python3 - "$work/clients.json" "$work/registered.tsv" "$1" <<'PY'
import json, sys
reviewed = {c["client_id"]: c for c in json.load(open(sys.argv[1], encoding="utf-8"))["products"]}
db = {}
for line in open(sys.argv[2], encoding="utf-8"):
    parts = line.rstrip("\n").split("\t")
    if len(parts) == 3:
        db[parts[0]] = (json.loads(parts[1] or "[]") or [], json.loads(parts[2] or "[]") or [])
cid = sys.argv[3]
if cid not in reviewed:
    print("FAIL not in reviewed clients.demo.json"); sys.exit()
if cid not in db:
    print("FAIL not registered in platform.oauth_clients"); sys.exit()
want = (reviewed[cid].get("redirect_uris", []), reviewed[cid].get("post_logout_redirect_uris", []))
out = []
for name, w, h in (("redirect_uris", want[0], db[cid][0]), ("post_logout", want[1], db[cid][1])):
    missing, extra = sorted(set(w) - set(h)), sorted(set(h) - set(w))
    if missing: out.append(name + " missing " + ",".join(missing))
    if extra: out.append(name + " extra " + ",".join(extra))
print(("FAIL " + "; ".join(out)) if out else "PASS redirect and post-logout URIs match")
PY
}
demo_callback() {
  python3 - "$work/clients.json" "$1" "$2" <<'PY'
import json, sys
for c in json.load(open(sys.argv[1], encoding="utf-8"))["products"]:
    if c["client_id"] == sys.argv[2]:
        want = "https://" + sys.argv[3] + "/"
        print(want if want in c.get("redirect_uris", []) else ""); break
PY
}
check_client() {  # label client host
  local label="$1" cid="$2" host="$3" r verdict detail cb code
  [[ "$drift_ok" == 1 ]] || return 0
  r="$(client_drift "$cid")"; verdict="${r%% *}"; detail="${r#* }"
  if [[ "$verdict" == PASS ]]; then pass "$label" client-drift "$cid: $detail"; else fail "$label" client-drift "$cid: $detail"; fi
  [[ -n "$host" ]] || return 0
  cb="$(demo_callback "$cid" "$host")"
  if [[ -z "$cb" ]]; then fail "$label" authorize "$cid lists no https://$host/ callback"; return 0; fi
  # A syntactically valid S256 challenge (43 characters); the code is never exchanged.
  code="$("${CURL[@]}" -o /dev/null -w '%{http_code}' -G "$ISSUER/authorize" \
    --data-urlencode "client_id=$cid" --data-urlencode "redirect_uri=$cb" --data-urlencode response_type=code \
    --data-urlencode "code_challenge=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" --data-urlencode code_challenge_method=S256 \
    --data-urlencode state=ads-release-acceptance 2>/dev/null || true)"
  if [[ "$code" == 302 || "$code" == 200 ]]; then pass "$label" authorize "$cid -> $code"; else fail "$label" authorize "$cid -> ${code:-no answer} (expected 302/200)"; fi
}

# ---------- sector link: service clients registered (only when the manifest enables the link) ----------
service_client_check() {  # client id -> "PASS ..." or "FAIL ..."
  python3 - "$work/clients.json" "$work/service.tsv" "$1" <<'PY'
import json, sys
reviewed = {c["client_id"]: c for c in json.load(open(sys.argv[1], encoding="utf-8")).get("service_clients", [])}
db = {}
for line in open(sys.argv[2], encoding="utf-8"):
    p = line.rstrip("\n").split("\t")
    if len(p) == 6:
        db[p[0]] = {"kind": p[1], "status": p[2], "scopes": json.loads(p[3] or "[]") or [],
                    "aud": json.loads(p[4] or "[]") or [], "secret": p[5]}
cid = sys.argv[3]
if cid not in reviewed:
    print("FAIL not in reviewed clients.demo.json service_clients"); sys.exit()
if cid not in db:
    print("FAIL not registered as a service client in platform.oauth_clients"); sys.exit()
r, d, out = reviewed[cid], db[cid], []
if d["status"] != "active": out.append("status " + d["status"])
if sorted(d["scopes"]) != sorted(r.get("allowedServiceScopes", [])): out.append("scopes differ from reviewed")
if sorted(d["aud"]) != sorted(r.get("allowedAudiences", [])): out.append("audiences differ from reviewed")
if d["secret"] != "yes": out.append("secret set: no")
print(("FAIL " + "; ".join(out)) if out else "PASS registered, active, reviewed scopes and audiences, secret set: yes")
PY
}
if [[ -z "$SECTOR_CLIENTS" ]]; then
  info sector-link service-client 'sector link not enabled in the manifest; not checked'
elif [[ "$drift_ok" == 1 ]]; then
  # Selects whether a secret is set (yes/no), never the secret hash itself.
  if docker exec "$IDENTITY_DB_CONTAINER" psql -X -q -At -F $'\t' -v ON_ERROR_STOP=1 -U "$IDENTITY_DB_USER" -d "$IDENTITY_DB_NAME" \
       -c "SELECT client_id, kind, status, array_to_json(service_scopes), array_to_json(service_audiences), CASE WHEN client_secret_hash IS NULL THEN 'no' ELSE 'yes' END FROM platform.oauth_clients WHERE kind = 'service' ORDER BY client_id" \
       >"$work/service.tsv" 2>/dev/null; then
    while read -r cid; do
      r="$(service_client_check "$cid")"
      if [[ "${r%% *}" == PASS ]]; then pass sector-link service-client "$cid: ${r#* }"; else fail sector-link service-client "$cid: ${r#* }"; fi
    done <<<"$SECTOR_CLIENTS"
  else
    fail sector-link service-client "could not read service clients from platform.oauth_clients (read-only psql in $IDENTITY_DB_CONTAINER)"
  fi
fi

# ---------- per product ----------
for id in "${IDS[@]}"; do
  app="${P_APP[$id]}"; web="${P_WEB[$id]}"; worker="${P_WORKER[$id]}"; host="${P_HOST[$id]}"
  if [[ -z "$ONLY" ]] && ! manifest_has "$id"; then
    info "$id" release "not in $(basename "$MANIFEST"); skipped (check it with --product $id and its manifest)"
    continue
  fi
  sha="$(manifest_sha "$id")"
  # (a) image carries the manifest SHA (tag, or the OCI revision label)
  if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
    fail "$id" image "manifest SHA not pinned (${sha:-absent})"
  else
    for c in $(printf '%s\n' "$app" "$web" | sort -u); do
      if ! running "$c"; then fail "$id" image "$c not running"; continue; fi
      image="$(docker inspect -f '{{.Config.Image}}' "$c" 2>/dev/null || true)"
      rev="$(docker inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$c" 2>/dev/null || true)"
      if [[ "$image" == *"$sha"* || "$rev" == "$sha" ]]; then pass "$id" image "$c ${image}"
      else fail "$id" image "$c runs ${image:-?}, manifest ${sha}"; fi
    done
  fi
  # (b) Identity client drift and /authorize
  check_client "$id" "${P_CLIENT[$id]}" "$host"
  # (c) demo access switch and secrets (yes/no only; values stay inside the containers)
  access=no
  if [[ "${P_ACCESS[$id]}" == - ]]; then
    info "$id" demo-access 'no product-side Demo Access check (registry only, private provisioning off); switch and secrets not checked'
  else
    if running "$app" && docker exec "$app" sh -c "[ \"\${${P_ACCESS[$id]}:-}\" = 1 ]" >/dev/null 2>&1; then access=yes; fi
    if [[ "$access" == yes ]]; then pass "$id" demo-access "${P_ACCESS[$id]}=1"; else fail "$id" demo-access "${P_ACCESS[$id]} is not 1 in $app"; fi
    secret=no
    if running "$app" && docker exec "$app" sh -c '[ -n "${DEMO_ACCESS_CHECK_SECRET:-}" ] || [ -s "${DEMO_ACCESS_CHECK_SECRET_FILE:-/nonexistent}" ]' >/dev/null 2>&1; then secret=yes; fi
    if [[ "$secret" == yes ]]; then pass "$id" product-secret "DEMO_ACCESS_CHECK_SECRET present: yes"; else fail "$id" product-secret "DEMO_ACCESS_CHECK_SECRET present: no"; fi
    var="DEMO_ACCESS_CHECK_SECRET_$(upper_key "${P_KEY[$id]}")"
    isecret=no
    if docker exec "$IDENTITY_CONTAINER" sh -c "[ -n \"\${$var:-}\" ] || [ -s \"\${${var}_FILE:-/nonexistent}\" ]" >/dev/null 2>&1; then isecret=yes; fi
    if [[ "$isecret" == yes ]]; then pass "$id" identity-secret "$var present: yes"; else fail "$id" identity-secret "$var present: no"; fi
  fi
  # (d) seed worker healthy where demo access is on
  if [[ "$worker" == - ]]; then
    info "$id" seed-worker 'none for this product (run-once demo-seed job only)'
  elif [[ "$access" != yes ]]; then
    info "$id" seed-worker "not required while ${P_ACCESS[$id]} is off"
  else
    health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$worker" 2>/dev/null || true)"
    if [[ "$health" == healthy ]]; then pass "$id" seed-worker "$worker healthy"; else fail "$id" seed-worker "$worker ${health:-missing}"; fi
  fi
  # (e) kit sign-in script served as JavaScript; static files world-readable
  headers="$("${CURL[@]}" -o /dev/null -D - "https://$host/ads-identity.js" 2>/dev/null | tr -d '\r' || true)"
  status="$(printf '%s\n' "$headers" | awk 'toupper($1) ~ /^HTTP\// {s=$2} END {print s}')"
  ctype="$(printf '%s\n' "$headers" | awk -F': *' 'tolower($1)=="content-type" {c=tolower($2)} END {print c}')"
  if [[ "$status" == 200 && "$ctype" == *javascript* ]]; then pass "$id" ads-identity.js "200 $ctype"
  else fail "$id" ads-identity.js "status ${status:-none}, content-type ${ctype:-none}"; fi
  if running "$web"; then
    if unreadable="$(docker exec "$web" find "${P_ROOT[$id]}" ! -perm -o=r 2>/dev/null)"; then
      n="$(printf '%s' "$unreadable" | grep -c . || true)"
      if [[ "$n" == 0 ]]; then pass "$id" static-perms "${P_ROOT[$id]} all world-readable"; else fail "$id" static-perms "$n paths under ${P_ROOT[$id]} not world-readable"; fi
    else
      fail "$id" static-perms "cannot list ${P_ROOT[$id]} in $web"
    fi
  else
    fail "$id" static-perms "$web not running"
  fi
  # (f) product health over public HTTPS
  code="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "https://$host${P_HEALTH[$id]}" 2>/dev/null || true)"
  if [[ "$code" == 200 ]]; then pass "$id" health "https://$host${P_HEALTH[$id]} 200"; else fail "$id" health "https://$host${P_HEALTH[$id]} -> ${code:-no answer}"; fi
done

# Every other reviewed client, on request (no /authorize probe: those hosts may not be live yet).
if [[ "$ALL_CLIENTS" == 1 && "$drift_ok" == 1 ]]; then
  covered=" "; for id in "${IDS[@]}"; do covered+="${P_CLIENT[$id]} "; done
  while read -r cid; do
    [[ "$covered" == *" $cid "* ]] || check_client clients "$cid" ""
  done < <(python3 -c 'import json,sys; [print(c["client_id"]) for c in json.load(open(sys.argv[1]))["products"]]' "$work/clients.json")
fi

if [[ "$FAILS" -gt 0 ]]; then
  echo "ADS_RELEASE_ACCEPTANCE=FAIL ($FAILS failing checks; do not open these products on the portal)"
  exit 1
fi
echo 'ADS_RELEASE_ACCEPTANCE=PASS (read-only; portal activation remains a separate operator step)'

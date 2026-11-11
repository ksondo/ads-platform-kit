#!/usr/bin/env bash
# Re-register ONE demo Identity client from the reviewed list baked into the running Identity image
# (/app/config/clients.demo.json), with ALL its fields, using the existing operator CLI `register-client`.
# A sign-in client comes from `products` (including its `tokenExchange` allow list); a service client
# (client_credentials) from `service_clients`. A malformed entry is refused before anything is written.
# Fixes a drift reported by release-acceptance.sh without re-running apply-clients.mjs or any bootstrap.
#
#   bash deploy/contabo-demo/register-identity-client.sh <client_id> --backup-confirmed <path> [--apply]
#
# Without --apply: prints the dry-run difference (registered row vs reviewed entry) and changes nothing.
# With --apply: runs `node src/cli.mjs register-client` for that one client inside the Identity container,
# then re-reads the row and fails unless it now matches. Only the oauth_clients row of that client changes;
# accounts, memberships, roles, signing keys and the client secret are untouched (the CLI never writes it).
# --backup-confirmed <path>: required in both modes; an existing, non-empty file recording the protected
# Identity database backup taken before this change (RUNBOOK.md §E3). Never prints secrets: the client list
# holds no secret values and the client_secret_hash column is never read.
set -euo pipefail

IDENTITY_CONTAINER="${ADS_ACC_IDENTITY_CONTAINER:-ads-demo-identity}"
IDENTITY_DB_CONTAINER="${ADS_ACC_IDENTITY_DB_CONTAINER:-ads-demo-identity-db-1}"
IDENTITY_DB_USER="${ADS_ACC_IDENTITY_DB_USER:-ads_demo_identity}"
IDENTITY_DB_NAME="${ADS_ACC_IDENTITY_DB_NAME:-ads_demo_identity}"
CLIENTS_IN_CONTAINER=/app/config/clients.demo.json

usage() { echo 'Usage: register-identity-client.sh <client_id> --backup-confirmed <path> [--apply]' >&2; exit 2; }
[[ $# -ge 1 ]] || usage
CLIENT_ID="$1"; shift
BACKUP=""
APPLY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --backup-confirmed) [[ $# -ge 2 ]] || usage; BACKUP="$2"; shift 2 ;;
    --apply) APPLY=1; shift ;;
    *) usage ;;
  esac
done
[[ "$CLIENT_ID" =~ ^[a-z0-9][a-z0-9-]{1,62}$ ]] || { echo 'REFUSED: invalid client_id' >&2; exit 2; }
if [[ -z "$BACKUP" ]]; then
  echo 'REFUSED: --backup-confirmed <path> is required (protected Identity DB backup taken first, RUNBOOK.md §E3)' >&2; exit 2
fi
if [[ ! -f "$BACKUP" || ! -s "$BACKUP" ]]; then
  echo "REFUSED: backup marker $BACKUP is not an existing non-empty file" >&2; exit 2
fi
for f in "$IDENTITY_CONTAINER" "$IDENTITY_DB_CONTAINER" "$IDENTITY_DB_USER" "$IDENTITY_DB_NAME"; do
  [[ "$f" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$ ]] || { echo 'Invalid Identity configuration' >&2; exit 2; }
done
for cmd in docker python3; do command -v "$cmd" >/dev/null || { echo "Missing $cmd" >&2; exit 2; }; done

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Demo Identity only (same guard as RUNBOOK §E3).
docker exec "$IDENTITY_CONTAINER" node -e 'if(process.env.ADS_ENV!=="demo"||process.env.DEMO_MODE!=="1")process.exit(2)' \
  || { echo "REFUSED: $IDENTITY_CONTAINER is not the demo Identity (ADS_ENV=demo, DEMO_MODE=1)" >&2; exit 2; }
docker exec "$IDENTITY_CONTAINER" cat "$CLIENTS_IN_CONTAINER" >"$work/clients.json" \
  || { echo "Cannot read $CLIENTS_IN_CONTAINER in $IDENTITY_CONTAINER" >&2; exit 2; }

read_row() {
  # Non-secret columns only; client_id is validated above, so it is safe as a SQL literal.
  docker exec "$IDENTITY_DB_CONTAINER" psql -X -q -At -v ON_ERROR_STOP=1 -U "$IDENTITY_DB_USER" -d "$IDENTITY_DB_NAME" -c \
    "SELECT row_to_json(t) FROM (SELECT client_id, display_name, accent_color, redirect_uris, post_logout_redirect_uris, self_service_roles, allow_personal_workspace, admin_scopes, admin_roles, assignable_roles, kind, service_scopes, service_audiences, token_exchange FROM platform.oauth_clients WHERE client_id='$CLIENT_ID') t" \
    >"$work/row.json"
}

# Prints the difference and writes the CLI arguments (NUL-separated) for this one client.
diff_and_args() {
  python3 - "$work/clients.json" "$work/row.json" "$CLIENT_ID" "$work/args" <<'PY'
import json, re, sys
clients, row_file, cid, args_file = sys.argv[1:]
doc = json.load(open(clients, encoding="utf-8"))
services = doc.get("service_clients", [])
def refuse(msg):
    print("REFUSED: " + cid + ": " + msg, file=sys.stderr); sys.exit(2)
if not isinstance(services, list):
    refuse("service_clients must be a list")
entries = [c for c in doc["products"] + services if c.get("client_id") == cid]
if len(entries) != 1:
    print("REFUSED: " + cid + " is not exactly once in the reviewed clients.demo.json", file=sys.stderr); sys.exit(2)
p = entries[0]
service = p in services
# Same rules as validateClientList (services/identity/src/service-clients.mjs) for this one entry.
SCOPE = re.compile(r"^[a-z][a-z0-9_]{0,39}(\.[a-z][a-z0-9_]{0,39}){1,4}$")
AUD = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}$")
ids = {c.get("client_id") for c in doc["products"] + services}
def names(v, pattern, what):
    if not isinstance(v, list) or not v or len(v) > 20 or len(set(map(str, v))) != len(v) or not all(isinstance(x, str) and pattern.match(x) for x in v):
        refuse(what + " must be a non-empty list of distinct valid names")
    return v
def no_client_audience(auds):
    for a in auds:
        if a in ids: refuse("audience " + a + " is a client id")
if service:
    if p.get("kind") != "service": refuse('kind must be "service" in service_clients')
    for k in ("redirect_uris", "post_logout_redirect_uris", "self_service_roles", "admin_scopes", "admin_roles", "assignable_roles", "ads_only_roles", "demo_orgs", "tenant_settings", "tokenExchange"):
        if p.get(k): refuse(k + " is not allowed on a service client")
    if p.get("allow_personal_workspace") is True or p.get("demo_access_denied_redirect") is True: refuse("sign-in settings are not allowed on a service client")
    if p.get("needs_client_secret", True) is not True: refuse("needs_client_secret must be true")
    if not isinstance(p.get("display_name"), str) or not p["display_name"].strip(): refuse("display_name required")
    no_client_audience(names(p.get("allowedAudiences"), AUD, "allowedAudiences"))
    names(p.get("allowedServiceScopes"), SCOPE, "allowedServiceScopes")
    exchange = []
else:
    if p.get("kind", "web") != "web": refuse('kind "service" belongs in service_clients')
    if "allowedServiceScopes" in p or "allowedAudiences" in p: refuse("allowedServiceScopes/allowedAudiences are only for service clients")
    if not p.get("redirect_uris"):
        print("REFUSED: " + cid + " has no redirect_uris", file=sys.stderr); sys.exit(2)
    exchange = p.get("tokenExchange", [])
    if not isinstance(exchange, list) or len(exchange) > 10: refuse("tokenExchange must be a list")
    if exchange and p.get("needs_client_secret") is not True: refuse("tokenExchange needs needs_client_secret: true")
    seen = set()
    for e in exchange:
        if not isinstance(e, dict) or set(e) != {"audience", "scopes"}: refuse("tokenExchange entries are {audience, scopes}")
        names([e["audience"]], AUD, "tokenExchange audience"); no_client_audience([e["audience"]])
        if e["audience"] in seen: refuse("tokenExchange audience listed twice")
        seen.add(e["audience"]); names(e["scopes"], SCOPE, "tokenExchange scopes")
want = {
    "display_name": p.get("display_name") or p.get("product"),
    "accent_color": None if service else (p.get("accent") or None),
    "redirect_uris": [] if service else p.get("redirect_uris", []),
    "post_logout_redirect_uris": [] if service else p.get("post_logout_redirect_uris", []),
    "self_service_roles": [] if service else p.get("self_service_roles", []),
    "allow_personal_workspace": False if service else bool(p.get("allow_personal_workspace")),
    "admin_scopes": [] if service else p.get("admin_scopes", []),
    "admin_roles": [] if service else p.get("admin_roles", []),
    "assignable_roles": [] if service else p.get("assignable_roles", []),
    "kind": "service" if service else "web",
    "service_scopes": p.get("allowedServiceScopes", []) if service else [],
    "service_audiences": p.get("allowedAudiences", []) if service else [],
    "token_exchange": [{"audience": e["audience"], "scopes": e["scopes"]} for e in exchange],
}
raw = open(row_file, encoding="utf-8").read().strip()
have = json.loads(raw) if raw else None
print("CLIENT " + cid + (" (registered)" if have else " (NOT registered: will be created)"))
changes = 0
for k, v in want.items():
    h = None if have is None else have.get(k)
    if k == "token_exchange":
        canon = lambda x: sorted(json.dumps({"audience": e.get("audience"), "scopes": sorted(e.get("scopes", []))}, sort_keys=True) for e in (x or []))
        same = canon(h) == canon(v)
    else:
        same = (sorted(h or []) == sorted(v)) if isinstance(v, list) else (h == v)
    if not same:
        changes += 1
        print("  ~ " + k + ": " + json.dumps(h, ensure_ascii=False) + " -> " + json.dumps(v, ensure_ascii=False))
print("DIFF " + ("none" if changes == 0 else str(changes) + " field(s)"))
if service:
    a = ["register-client", "--kind", "service", "--id", cid, "--name", want["display_name"],
         "--service-scopes", ",".join(want["service_scopes"]), "--service-audiences", ",".join(want["service_audiences"])]
else:
    a = ["register-client", "--id", cid, "--name", want["display_name"],
         "--redirect", ",".join(want["redirect_uris"]), "--logout", ",".join(want["post_logout_redirect_uris"]),
         "--self-roles", ",".join(want["self_service_roles"]), "--personal", "true" if want["allow_personal_workspace"] else "false",
         "--admin-scopes", ",".join(want["admin_scopes"]), "--admin-roles", ",".join(want["admin_roles"]),
         "--assignable-roles", ",".join(want["assignable_roles"]), "--token-exchange", json.dumps(want["token_exchange"], separators=(",", ":"))]
if want["accent_color"]:
    a += ["--accent", want["accent_color"]]
open(args_file, "wb").write(b"\0".join(x.encode() for x in a) + b"\0")
sys.exit(0 if changes == 0 else 10)
PY
}

read_row || { echo "Cannot read platform.oauth_clients in $IDENTITY_DB_CONTAINER" >&2; exit 2; }
set +e; diff_and_args; rc=$?; set -e
[[ "$rc" == 0 || "$rc" == 10 ]] || exit "$rc"
if [[ "$APPLY" != 1 ]]; then
  echo 'STATUS=DRY_RUN (nothing written; add --apply to register this one client)'
  exit 0
fi
if [[ "$rc" == 0 ]]; then
  echo "STATUS=NO_CHANGE ($CLIENT_ID already matches the reviewed list)"
  exit 0
fi
mapfile -d '' -t cli_args <"$work/args"
echo "APPLY register-client $CLIENT_ID (backup marker: $BACKUP)"
docker exec "$IDENTITY_CONTAINER" node src/cli.mjs "${cli_args[@]}"
read_row
set +e; diff_and_args >/dev/null; rc=$?; set -e
if [[ "$rc" != 0 ]]; then echo "FAIL $CLIENT_ID still differs after register-client" >&2; exit 1; fi
echo "STATUS=APPLIED ($CLIENT_ID now matches the reviewed list; rerun release-acceptance.sh)"

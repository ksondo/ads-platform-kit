#!/usr/bin/env bash
# ADS nine-site release coordinator scaffold: PLAN and PREFLIGHT ONLY.
# Apply is deliberately disabled until every app-specific release is certified.
set -Eeuo pipefail
umask 077
here="$(cd "$(dirname "$0")" && pwd -P)"
manifest="$here/release-nine-manifest.json"
[[ -f "$manifest" ]] || { echo 'Missing release-nine-manifest.json' >&2; exit 2; }
[[ $# -ge 1 && $# -le 2 ]] || { echo 'Usage: bash release-nine-demo-apps.sh --plan|--preflight|--databases-plan|--prepare-databases|--databases-verify|--schemas-plan|--migrate-app APP|--schema-verify APP|--images-plan|--build-candidates|--apply' >&2; exit 2; }
mode="$1"
case "$mode" in
  --plan)
    python3 - "$manifest" <<'PY'
import json,re,sys
with open(sys.argv[1],encoding="utf8") as h: p=json.load(h)
assert p["schemaVersion"]==1 and p["mode"]=="demo-only"
assert p["target"]["hostname"]=="vmi3191089"
q=p["sequence"]
assert len(q)==9 and len({x["key"] for x in q})==9
assert len({x["domain"] for x in q})==9
assert q[0]["key"]=="commerce" and q[-1]["key"]=="landing"
assert {x["key"] for x in q}=={"commerce","education","fleetguard","home-services","mamacare","tontine","ventureworks","morphoo","landing"}
assert {x["portalId"] for x in q if x["portalId"]}=={"commerce","education","fleet-guard","home-services","mama-care","digital-tontine","ventureworks","morphoo"}
assert all(x["repository"].startswith("ksondo/") for x in q)
assert all(x["domain"].endswith(".africadigitalsynergy.com") for x in q)
assert all(x["mode"] in ("new","update-existing","reuse-or-update","publish-last") for x in q)
missing=[]
print("ADS_NINE_RELEASE_PLAN",p["releaseId"],"server",p["target"]["hostname"])
for i,x in enumerate(q,1):
 sha=x["releaseSha"]
 script=x["releaseScript"]
 if sha is not None: assert re.fullmatch(r"[0-9a-f]{40}",sha)
 if script is not None: assert isinstance(script,str) and script.startswith("deploy/") and ".." not in script
 if sha is None or script is None: missing.append(x["key"])
 print(f"{i}. {x['key']:<15} {x['mode']:<16} https://{x['domain']}{x['landingPath']} "
       f"source_sha={(sha or 'UNAPPROVED')[:12]} app_script={script or 'NOT_READY'}")
print("GATES:",", ".join(p["requiredGates"]))
print("BLOCKED_RELEASES:",",".join(missing) if missing else "none")
print("STATUS=PLAN_ONLY; no source fetched, files changed, database touched or services restarted")
review=sys.argv[1].rsplit("/",1)[0]+"/release-nine-source-review-20261026.json"
try:
 with open(review,encoding="utf8") as fh: baseline=json.load(fh)
 print("=== GITHUB SOURCE REVIEW SNAPSHOT (NOT RELEASE APPROVAL) ===")
 for r in baseline.get("applications",[]):
  c=r.get("demoCandidatePR")
  print("REVIEW",r["key"],"main",r["mainShaObserved"][:12],
        "demo_pr",str(c["pr"]) if c else "none",
        "demo_head",c["head"] if c else "none",
        "approved",r.get("releaseApproved",False))
 print("NOTE: These are Oct 26 observed main/PR versions and can change; recheck before freezing.")
except FileNotFoundError:
 print("SOURCE_REVIEW_SNAPSHOT=NOT_PRESENT")
PY
    ;;
  --preflight)
    [[ "$(hostname -s)" == "vmi3191089" ]] || { echo 'REFUSED: wrong VPS' >&2; exit 2; }
    bash "$here/direct-apps-preflight.sh"
    bash "$0" --plan
    ;;
  --databases-plan)
    bash "$here/prepare-five-demo-databases.sh" --plan
    ;;
  --prepare-databases)
    bash "$here/prepare-five-demo-databases.sh" --init
    ;;
  --databases-verify)
    bash "$here/prepare-five-demo-databases.sh" --verify
    ;;
  --schemas-plan)
    [[ $# -eq 1 ]] || exit 2
    for app in education fleetguard home-services mamacare tontine; do
      bash "$here/migrate-five-demo-schemas.sh" --plan "$app"
    done
    ;;
  --migrate-app)
    [[ $# -eq 2 ]] || { echo 'Usage: --migrate-app APP' >&2; exit 2; }
    bash "$here/migrate-five-demo-schemas.sh" --migrate "$2"
    ;;
  --schema-verify)
    [[ $# -eq 2 ]] || { echo 'Usage: --schema-verify APP' >&2; exit 2; }
    bash "$here/migrate-five-demo-schemas.sh" --verify "$2"
    ;;
  --images-plan)
    bash "$here/build-staged-demo-images.sh" --plan
    ;;
  --build-candidates)
    bash "$here/build-staged-demo-images.sh" --build
    ;;
  --apply)
    echo 'ADS_NINE_DEPLOYMENT_REFUSED: master --apply is not yet implemented or certified.' >&2
    echo 'Finish per-application pinned SHA release scripts, database, HTTPS and portal acceptance gates before enabling.' >&2
    exit 3
    ;;
  *)
    echo 'Usage: bash release-nine-demo-apps.sh --plan|--preflight|--databases-plan|--prepare-databases|--databases-verify|--schemas-plan|--migrate-app APP|--schema-verify APP|--images-plan|--build-candidates|--apply' >&2
    exit 2
    ;;
esac

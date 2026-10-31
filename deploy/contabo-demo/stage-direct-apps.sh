#!/usr/bin/env bash
# Stage a *single*, approved application SHA directly from GitHub on Contabo.
# Mirrors the known Business Opportunities deployment: fetch, verify, archive.
# Does not deploy or migrate anything; app-specific release scripts run separately.
set -Eeuo pipefail
umask 077

usage() {
 echo 'Usage: bash stage-direct-apps.sh --check|--stage <app> <existing-git-checkout> <approved-40-char-sha>' >&2
 echo 'Apps: education fleetguard home-services mamacare morphoo tontine ventureworks' >&2
 exit 2
}
[[ $# -eq 4 ]] || usage
mode="$1"
app="$2"
repo="$3"
sha="$4"

[[ "$mode" == '--check' || "$mode" == '--stage' ]] || usage
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'REFUSED: expected full approved SHA' >&2; exit 2; }
[[ $(hostname -s) == 'vmi3191089' ]] || { echo 'REFUSED: wrong Contabo host' >&2; exit 2; }
[[ $(id -u) -eq 0 ]] || { echo 'REFUSED: root operator required' >&2; exit 2; }
[[ "$repo" == /* && -d "$repo/.git" && ! -L "$repo" ]] || {
 echo 'REFUSED: existing checked-out Git repository required; no bulk cloning' >&2; exit 2;
}

case "$app" in
  education) expected=Education-and-intelligent-services ;;
  fleetguard) expected=Fleet-guard-and-intelligent-services ;;
  home-services) expected=Home-Services ;;
  mamacare) expected=Mama-care-and-intelligent-services ;;
  morphoo) expected=go-ahead-guesser ;;
  tontine) expected=Digital-tontine-and-intelligent-services ;;
  ventureworks) expected=Africa-Digital-Synergy-VentureWorks ;;
  *) usage ;;
esac

remote="$(git -c safe.directory="$repo" -C "$repo" remote get-url origin)"
case "$remote" in
  "git@github.com:ksondo/$expected.git" | "git@github.com:ksondo/$expected" | \
  "https://github.com/ksondo/$expected.git" | "https://github.com/ksondo/$expected") ;;
  *) echo "REFUSED: checkout origin is not ksondo/$expected" >&2; exit 2 ;;
esac
echo "=== FETCH GITHUB $app; VERIFY APPROVED RELEASE $sha ==="
GIT_TERMINAL_PROMPT=0 git -c safe.directory="$repo" -C "$repo" fetch --no-tags origin main
git -c safe.directory="$repo" -C "$repo" cat-file -e "$sha^{commit}"
git -c safe.directory="$repo" -C "$repo" merge-base --is-ancestor "$sha" origin/main || {
  echo 'REFUSED: SHA is not an ancestor of origin/main' >&2; exit 2;
}

stage="/var/lib/ads-demo/app-releases/$app/$sha"
[[ ! -L "$stage" ]] || { echo 'REFUSED: symlink release path' >&2; exit 2; }
if [[ "$mode" == '--check' ]]; then
  echo "ADS_DIRECT_APP_SHA_VERIFIED=PASS app=$app sha=$sha"
  if [[ -e "$stage" ]]; then echo "STAGE_EXISTS $stage"; else echo "STAGE_AVAILABLE $stage"; fi
  exit 0
fi
[[ ! -e "$stage" ]] || { echo "REFUSED: release already staged at $stage" >&2; exit 2; }
[[ ! -L /var/lib/ads-demo && -d /var/lib/ads-demo ]] || {
  echo 'REFUSED: protected /var/lib/ads-demo directory missing or symlinked' >&2; exit 2;
}
install -d -m 0700 "/var/lib/ads-demo/app-releases" "/var/lib/ads-demo/app-releases/$app"
install -d -m 0700 "$stage"
if ! git -c safe.directory="$repo" -C "$repo" archive --format=tar "$sha" | tar -xf - -C "$stage"; then
  echo "ERROR: staging failed; inspect incomplete directory $stage" >&2
  exit 1
fi
echo "ADS_DIRECT_APP_SOURCE_STAGED=PASS app=$app sha=$sha path=$stage"
echo 'Release script, canary, database, HTTPS and portal publication are SEPARATE app-specific gates.'

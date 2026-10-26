#!/usr/bin/env bash
# Build candidate images directly from pinned source archives. Never runs services,
# migrations, demo seed, Nginx, HTTPS or portal changes.
set -Eeuo pipefail
umask 077
[[ $# -eq 1 && ( "$1" == '--plan' || "$1" == '--build' ) ]] || {
 echo 'Usage: bash build-staged-demo-images.sh --plan|--build' >&2; exit 2;
}
mode="$1"
[[ "$(hostname -s)" == vmi3191089 && "$(id -u)" -eq 0 ]] || {
 echo 'REFUSED: Contabo VPS root only' >&2; exit 2;
}
base=/var/lib/ads-demo/app-releases
echo "ADS_CANDIDATE_IMAGE_OPERATION_START mode=$mode"
while IFS=' ' read -r app sha dockerfile tag; do
  [[ -n "$app" ]] || continue
  dir="$base/$app/$sha"
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "INVALID_SHA $app" >&2; exit 2; }
  [[ -d "$dir" && ! -L "$dir" ]] || { echo "MISSING_SOURCE $dir" >&2; exit 2; }
  [[ "$(stat -c '%u' "$dir")" == 0 ]] || { echo "REFUSED_UNOWNED_SOURCE $app" >&2; exit 2; }
  [[ -f "$dir/$dockerfile" && ! -L "$dir/$dockerfile" ]] || {
    echo "DOCKERFILE_NOT_READY $app" >&2; exit 2;
  }
  [[ -f "$dir/package-lock.json" ]] || { echo "MISSING_LOCKFILE $app" >&2; exit 2; }
  echo "IMAGE_CANDIDATE app=$app source_sha=$sha image=$tag"
  if [[ "$mode" == '--build' ]]; then
    df_kib="$(df -Pk / | awk 'NR==2 {print $4}')"
    mem_kib="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
    [[ "$df_kib" =~ ^[0-9]+$ && "$mem_kib" =~ ^[0-9]+$ ]] || exit 2
    if (( df_kib < 26214400 || mem_kib < 1572864 )); then
      echo "REFUSED_LOW_CAPACITY app=$app disk_kib=$df_kib memory_kib=$mem_kib" >&2
      exit 2
    fi
    if docker image inspect "$tag" >/dev/null 2>&1; then
      echo "IMAGE_ALREADY_PRESENT app=$app image=$tag (not rebuilt)"
    else
      docker build --file "$dir/$dockerfile" --tag "$tag" "$dir"
      docker image inspect "$tag" --format 'IMAGE_BUILT {{.Id}}'
    fi
  fi
done <<'IMAGES'
education b3202c70d926599793fc0c4957d49c4eb255d847 deploy/api/Dockerfile ads-demo-education-api:candidate-b3202c70d926599793fc0c4957d49c4eb255d847
fleetguard ce3a4883862104e05a4fafd3da023089c5f46052 Dockerfile.api ads-demo-fleetguard:candidate-ce3a4883862104e05a4fafd3da023089c5f46052
mamacare c8cb4d2aa0e11d62f6c2a24c485df6c06fbdb573 Dockerfile ads-demo-mamacare:candidate-c8cb4d2aa0e11d62f6c2a24c485df6c06fbdb573
tontine 125e2b6a2c6507efd566912445254102d2d63834 Dockerfile.api ads-demo-tontine:candidate-125e2b6a2c6507efd566912445254102d2d63834
IMAGES
echo 'HOME_SERVICES=WAITING_FOR_DOCKERFILE_PR_11_MERGE_AND_NEW_SHA'
echo 'EDUCATION_WEB=WAITING_FOR_APPROVED_OIDC_BUILD_ARGUMENTS'
echo 'TONTINE_JOURNEYS=NOT_CERTIFIED'
echo "ADS_CANDIDATE_IMAGE_OPERATION_COMPLETE mode=$mode"
echo 'STATUS=IMAGES_ONLY; running services, DB, Nginx, TLS and portal are unchanged'

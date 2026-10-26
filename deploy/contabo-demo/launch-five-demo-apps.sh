#!/usr/bin/env bash
# Five new ADS apps; localhost-only Docker startup. Demo data/HTTPS are separate.
set -Eeuo pipefail
umask 077
mode="${1:-}"
case "$mode" in
 --plan|--launch|--verify)
  [[ $# == 1 ]] || exit 2
  targets=(education fleetguard home-services mamacare tontine)
  ;;
 --plan-one|--launch-one|--verify-one)
  [[ $# == 2 ]] || exit 2
  case "$2" in education|fleetguard|home-services|mamacare|tontine) targets=("$2");; *) exit 2;; esac
  ;;
 *)
  echo 'Usage: launch-five-demo-apps.sh --plan|--launch|--verify|--plan-one APP|--launch-one APP|--verify-one APP' >&2
  exit 2
  ;;
esac
[[ "$(id -u)" == 0 && "$(hostname -s)" == vmi3191089 ]] || exit 2
here="$(cd "$(dirname "$0")" && pwd -P)"
issuer=https://login.demo.africadigitalsynergy.com
set_app() {
 app="$1"
 case "$app" in
  education) sha=b3202c70d926599793fc0c4957d49c4eb255d847; port=18501; inner=3000; client=education-web; image="ads-demo-education-api:candidate-$sha" ;;
  fleetguard) sha=ce3a4883862104e05a4fafd3da023089c5f46052; port=18502; inner=8793; client=fleet-guard-web; image="ads-demo-fleetguard:candidate-$sha" ;;
  home-services) sha=5f31b1cbf8244cfc02306fc9ec2458e852509317; port=18503; inner=8787; client=home-services; image="ads-demo-home-services:candidate-$sha" ;;
  mamacare) sha=d37e104ac3e20051c04fc21234945b58d5fd4eb0; port=18504; inner=8080; client=mamacare-web; image="ads-demo-mamacare:candidate-$sha" ;;
  tontine) sha=125e2b6a2c6507efd566912445254102d2d63834; port=18505; inner=8794; client=tontine-web; image="ads-demo-tontine:candidate-$sha" ;;
  *) exit 2 ;;
 esac
 container="ads-demo-$app-app"
 network="ads-demo-$app-private"
 secret="/etc/ads-demo/apps/$app-connections.env"
 source="/var/lib/ads-demo/app-releases/$app/$sha"
 domain="$app.demo.africadigitalsynergy.com"
}
verify_app() {
 set_app "$1"
 [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || return 1
 [[ "$(docker inspect -f '{{.Config.Image}}' "$container" 2>/dev/null)" == "$image" ]] || {
  echo "APP_IMAGE_NOT_PINNED app=$app" >&2; return 1;
 }
 [[ "$(docker inspect -f '{{index .Config.Labels "com.ads.demo.app"}}' "$container" 2>/dev/null)" == "$app" ]] || return 1
 [[ "$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null)" == true ]] || return 1
 if [[ "$app" == education ]]; then
  [[ "$(docker inspect -f '{{.Config.Image}}' ads-demo-education-web 2>/dev/null)" == "ads-demo-education-web:candidate-$sha" ]] || return 1
  [[ "$(docker inspect -f '{{index .Config.Labels "com.ads.demo.app"}}' ads-demo-education-web 2>/dev/null)" == education ]] || return 1
  [[ "$(docker inspect -f '{{.State.Running}}' ads-demo-education-web 2>/dev/null)" == true ]] || return 1
 fi
 path=/health
 [[ "$app" == education ]] && path=/ready
 ok=0
 for attempt in $(seq 1 30); do
  if curl --noproxy '*' -fsS --max-time 4 "http://127.0.0.1:$port$path" >/dev/null 2>&1 &&
     curl --noproxy '*' -fsS --max-time 4 "http://127.0.0.1:$port/" >/dev/null 2>&1; then ok=1; break; fi
  sleep 2
 done
 [[ "$ok" == 1 ]] || { echo "APP_PRIVATE_HEALTH_FAILED $app" >&2; return 1; }
 echo "APP_PRIVATE_HEALTH=PASS app=$app loopback=127.0.0.1:$port"
}
if [[ "$mode" == --plan || "$mode" == --plan-one ]]; then
 for item in "${targets[@]}"; do
  set_app "$item"; echo "PRIVATE_LAUNCH_PLAN app=$app sha=$sha loopback=127.0.0.1:$port"
 done
 exit 0
fi
if [[ "$mode" == --verify || "$mode" == --verify-one ]]; then
 for item in "${targets[@]}"; do verify_app "$item"; done
 if [[ "$mode" == --verify-one ]]; then echo "ADS_ONE_PRIVATE_APP=PASS app=${targets[0]}";
 else echo 'ADS_FIVE_PRIVATE_APPS=PASS'; fi
 exit 0
fi
disk_free_kib="$(df -Pk / | awk 'NR==2 {print $4}')"
memory_free_kib="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
[[ "$disk_free_kib" =~ ^[0-9]+$ && "$memory_free_kib" =~ ^[0-9]+$ ]] || exit 2
if (( disk_free_kib < 15728640 || memory_free_kib < 1572864 )); then
 echo "REFUSED_LOW_VPS_CAPACITY disk_free_kib=$disk_free_kib memory_free_kib=$memory_free_kib" >&2
 exit 2
fi
exec 9>/var/lock/ads-five-new-apps.lock
flock -n 9 || { echo 'APP_LAUNCH_ALREADY_RUNNING' >&2; exit 2; }
bash "$here/release-nine-demo-apps.sh" --runtime-verify
curl -fsS --max-time 10 "$issuer/.well-known/openid-configuration" |
 python3 -c 'import json,sys;assert json.load(sys.stdin)["issuer"]=="https://login.demo.africadigitalsynergy.com"'
for item in "${targets[@]}"; do
 set_app "$item"
 [[ "$sha" =~ ^[a-f0-9]{40}$ ]] || { echo "NOT_APPROVED_SHA $app" >&2; exit 2; }
 [[ -f "$secret" && ! -L "$secret" && "$(stat -c '%u:%a' "$secret")" == 0:600 ]] || exit 2
 [[ "$(docker inspect -f '{{.State.Health.Status}}' "ads-demo-$app-db")" == healthy ]] || exit 2
done
for item in "${targets[@]}"; do
 set_app "$item"
 echo "=== PRIVATE APP DEPLOYMENT $app ==="
 if [[ ! -d "$source" ]]; then
  bash "$here/stage-direct-apps.sh" --check "$app" "/var/lib/ads-demo/app-git-sources/$app" "$sha"
  bash "$here/stage-direct-apps.sh" --stage "$app" "/var/lib/ads-demo/app-git-sources/$app" "$sha"
 fi
 [[ -d "$source" && ! -L "$source" ]] || exit 2
 if [[ "$app" == home-services || "$app" == mamacare ]]; then
  docker image inspect "$image" >/dev/null 2>&1 ||
    docker build -t "$image" -f "$source/Dockerfile" "$source"
 fi
 if [[ "$app" == education ]]; then
  webimage="ads-demo-education-web:candidate-$sha"
  docker image inspect "$webimage" >/dev/null 2>&1 ||
   docker build -f "$source/Dockerfile" -t "$webimage" \
    --build-arg "VITE_EDU_OIDC_ISSUER=$issuer" \
    --build-arg "VITE_EDU_OIDC_AUTHORIZATION_URL=$issuer/authorize" \
    --build-arg "VITE_EDU_OIDC_TOKEN_URL=$issuer/token" \
    --build-arg VITE_EDU_OIDC_CLIENT_ID=education-web \
    --build-arg VITE_EDU_OIDC_REDIRECT_URI=https://education.demo.africadigitalsynergy.com/ "$source"
 fi
 docker image inspect "$image" >/dev/null || exit 2
 transient="$(mktemp /etc/ads-demo/apps/.runtime-$app.XXXXXXXX)"
 trap 'rm -f -- "$transient"' EXIT
 cat "$secret" > "$transient"
 printf 'NODE_ENV=demo\nADS_ENV=demo\nDEMO_MODE=1\nHOST=0.0.0.0\nPORT=%s\n' "$inner" >> "$transient"
 printf 'OIDC_ISSUER=%s\nOIDC_JWKS_URL=%s/.well-known/jwks.json\nOIDC_AUDIENCE=%s\n' "$issuer" "$issuer" "$client" >> "$transient"
 printf 'ADS_IDENTITY_URL=%s\nADS_IDENTITY_CLIENT_ID=%s\nPUBLIC_URL=https://%s\n' "$issuer" "$client" "$domain" >> "$transient"
 printf 'DATABASE_SSL_MODE=disable\nADAPTERS_MODE=off\nCONTENT_MODE=test\nASSISTANT_ENABLED=false\nREMINDER_SWEEP_MINUTES=0\n' >> "$transient"
 if [[ "$app" == mamacare ]]; then echo 'EXTERNAL_MODE=test' >> "$transient"
 else echo 'EXTERNAL_MODE=live' >> "$transient"; fi
 chmod 0600 "$transient"
 if ! docker inspect "$container" >/dev/null 2>&1; then
  if [[ "$app" != education ]]; then
   if ss -ltn | awk 'NR>1 {print $4}' | grep -Eq ":$port$"; then exit 2; fi
  fi
  if [[ "$app" == education ]]; then
   docker run -d --name "$container" --network "$network" --network-alias education-api \
    --restart unless-stopped --label "com.ads.demo.app=$app" \
    --security-opt no-new-privileges:true --cap-drop ALL \
    --memory 768m --pids-limit 256 --env-file "$transient" "$image" >/dev/null
  else
   docker run -d --name "$container" --network "$network" -p "127.0.0.1:$port:$inner" \
    --restart unless-stopped --label "com.ads.demo.app=$app" \
    --security-opt no-new-privileges:true --cap-drop ALL \
    --memory 768m --pids-limit 256 --env-file "$transient" "$image" >/dev/null
  fi
 else
  [[ "$(docker inspect -f '{{.Config.Image}}' "$container")" == "$image" ]] || exit 2
  [[ "$(docker inspect -f '{{index .Config.Labels "com.ads.demo.app"}}' "$container")" == "$app" ]] || exit 2
 fi
 rm -f "$transient"
 trap - EXIT
 if [[ "$app" == education ]] && ! docker container inspect ads-demo-education-web >/dev/null 2>&1; then
  if ss -ltn | awk 'NR>1 {print $4}' | grep -Eq ":$port$"; then exit 2; fi
  docker run -d --name ads-demo-education-web --network "$network" \
    -p "127.0.0.1:$port:80" --restart unless-stopped \
    --label com.ads.demo.app=education --env "ADS_IDENTITY_ORIGIN=$issuer" \
    --security-opt no-new-privileges:true "$webimage" >/dev/null
 fi
 verify_app "$app"
done
if [[ "$mode" == --launch-one ]]; then echo "ADS_ONE_PRIVATE_APP=PASS app=${targets[0]}";
else echo 'ADS_FIVE_PRIVATE_APPS=PASS'; fi
echo 'PUBLIC_HTTPS=NOT_CONFIGURED; LANDING_UNCHANGED'

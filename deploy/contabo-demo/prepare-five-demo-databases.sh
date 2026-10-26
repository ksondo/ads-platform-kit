#!/usr/bin/env bash
# CREATE-ONLY demo PostgreSQL foundations for five NEW ADS apps.
# No published DB ports; no migrations; no runtime app accounts; no edits to existing app data.
set -Eeuo pipefail
umask 077
[[ $# -eq 1 ]] || { echo 'Usage: bash prepare-five-demo-databases.sh --plan|--init|--verify' >&2; exit 2; }
mode="$1"
case "$mode" in --plan|--init|--verify) ;; *) exit 2 ;; esac
[[ "$(hostname -s)" == vmi3191089 && "$(id -u)" -eq 0 ]] || {
 echo 'REFUSED: root on vmi3191089 required' >&2; exit 2;
}
for cmd in docker openssl stat awk df; do
 command -v "$cmd" >/dev/null || { echo "REFUSED: missing $cmd" >&2; exit 2; }
done
secrets=/etc/ads-demo/apps
[[ -d /etc/ads-demo && ! -L /etc/ads-demo && ! -L "$secrets" ]] || {
 echo 'REFUSED: missing or unsafe /etc/ads-demo' >&2; exit 2;
}
if [[ "$mode" == --init ]]; then
  available="$(df -Pk / | awk 'NR==2 {print $4}')"
  memory="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
  if (( available < 26214400 || memory < 1572864 )); then
    echo "REFUSED: inadequate disk or memory available_kib=$available memory_kib=$memory" >&2
    exit 2
  fi
  install -d -o root -g root -m 0700 "$secrets"
fi
echo "ADS_FIVE_DB_FOUNDATIONS mode=$mode"
for app in education fleetguard home-services mamacare tontine; do
  id="$(printf '%s' "$app" | tr '-' '_')"
  name="ads-demo-$app-db"
  network="ads-demo-$app-private"
  volume="ads-demo-$app-postgres"
  envfile="$secrets/$app-db.env"
  dbname="ads_demo_$id"
  owner="ads_demo_""$id""_owner"

  if [[ "$mode" == --plan ]]; then
    echo "WOULD_CREATE app=$app DB=$dbname container=$name network=$network volume=$volume"
    echo "NO_PUBLIC_DB_PORT app=$app; owner account is for initial schema migrations only"
    continue
  fi
  if docker container inspect "$name" >/dev/null 2>&1; then
    label="$(docker inspect --format '{{index .Config.Labels "com.ads.demo.app"}}' "$name")"
    image="$(docker inspect --format '{{.Config.Image}}' "$name")"
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no_healthcheck{{end}}' "$name")"
    published="$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$name")"
    if [[ "$label" != "$app" || "$image" != postgres:16-alpine || \
       ( "$published" != '{}' && "$published" != null ) ]]; then
      echo "REFUSED: unexpected container or published DB ports $name" >&2; exit 2
    fi
    [[ "$status" == healthy ]] || { echo "REFUSED: existing $name not healthy" >&2; exit 2; }
    echo "DB_ALREADY_HEALTHY app=$app container=$name"
    continue
  fi
  if [[ "$mode" == --verify ]]; then echo "DB_NOT_CREATED app=$app"; exit 1; fi
  if [[ -e "$envfile" || -L "$envfile" ]]; then
    echo "REFUSED: unexpected existing secret file $envfile" >&2; exit 2
  fi
  if docker network inspect "$network" >/dev/null 2>&1 ||
     docker volume inspect "$volume" >/dev/null 2>&1; then
    echo "REFUSED: existing partial network or volume for $app" >&2; exit 2
  fi
  pass="$(openssl rand -hex 32)"
  {
    printf 'POSTGRES_DB=%s\n' "$dbname"
    printf 'POSTGRES_USER=%s\n' "$owner"
    printf 'POSTGRES_PASSWORD=%s\n' "$pass"
  } > "$envfile"
  chmod 0600 "$envfile"
  unset pass
  docker network create --driver bridge \
    --label 'com.ads.demo.release=ads-demo-nine-20261026' \
    --label "com.ads.demo.app=$app" "$network" >/dev/null
  docker volume create \
    --label 'com.ads.demo.release=ads-demo-nine-20261026' \
    --label "com.ads.demo.app=$app" "$volume" >/dev/null

  docker run -d --name "$name" --restart unless-stopped \
    --network "$network" \
    --label 'com.ads.demo.release=ads-demo-nine-20261026' \
    --label "com.ads.demo.app=$app" \
    --security-opt no-new-privileges:true \
    --env-file "$envfile" \
    --mount "type=volume,source=$volume,target=/var/lib/postgresql/data" \
    --health-cmd='pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
    --health-interval=10s --health-timeout=5s --health-retries=15 \
    postgres:16-alpine >/dev/null
  ready=0
  for attempt in $(seq 1 35); do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}starting{{end}}' "$name")"
    if [[ "$status" == healthy ]]; then ready=1; break; fi
    if [[ "$status" == unhealthy ]]; then break; fi
    sleep 2
  done
  if [[ "$ready" != 1 ]]; then
    echo "DB_INIT_UNHEALTHY app=$app; inspect container, do not delete volume" >&2
    exit 1
  fi
  published="$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$name")"
  [[ "$published" == '{}' || "$published" == null ]] || {
    echo "REFUSED: unexpected published DB port $name" >&2; exit 2;
  }
  echo "DB_CREATED_HEALTHY app=$app network=$network published_ports=NONE"
done
echo 'ADS_FIVE_DATABASE_FOUNDATIONS=PASS'
echo 'MIGRATIONS=NOT_RUN; RUNTIME_LOGINS=NOT_CREATED; APPS=NOT_STARTED; HTTPS=NOT_PUBLISHED'

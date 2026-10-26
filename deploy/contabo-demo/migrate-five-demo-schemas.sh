#!/usr/bin/env bash
# Migrate ONE newly created ADS demo database using its pinned staged source.
# No migrations to Commerce/Portal/Identity/Morphoo/VentureWorks. No app starts.
# On any failed migration: STOP; do not delete volumes or auto-rollback schema.
set -Eeuo pipefail
umask 077
if [[ $# -ne 2 ]]; then
 echo 'Usage: bash migrate-five-demo-schemas.sh --plan|--migrate|--verify APP' >&2; exit 2
fi
mode="$1"
app="$2"
case "$mode" in --plan|--migrate|--verify) ;; *) exit 2 ;; esac
case "$app" in
 education)
  sha=b3202c70d926599793fc0c4957d49c4eb255d847
  command='node scripts/migrate.mjs'
  ledger=edu_schema_migration
  ;;
 fleetguard)
  sha=ce3a4883862104e05a4fafd3da023089c5f46052
  command='node db/migrate.mjs'
  ledger=fleet_schema_migrations
  ;;
 home-services)
  sha=8eee741b0181b5ab7d21cd51d58918c97d0c1619
  command='node src/migrate.mjs'
  ledger=home_schema_migrations
  ;;
 mamacare)
  sha=c8cb4d2aa0e11d62f6c2a24c485df6c06fbdb573
  command='node scripts/migrate.mjs'
  ledger=mamacare_schema_migrations
  ;;
 tontine)
  sha=125e2b6a2c6507efd566912445254102d2d63834
  command='node src/server/migrate.mjs'
  ledger=tontine_schema_migrations
  ;;
 *) echo "Unsupported demo app: $app" >&2; exit 2 ;;
esac
[[ "$(hostname -s)" == vmi3191089 && "$(id -u)" -eq 0 ]] || {
 echo 'REFUSED: Contabo vmi3191089 root only' >&2; exit 2;
}
source_path="/var/lib/ads-demo/app-releases/$app/$sha"
dbcontainer="ads-demo-$app-db"
network="ads-demo-$app-private"
db_env="/etc/ads-demo/apps/$app-db.env"
[[ -d "$source_path" && ! -L "$source_path" && -f "$source_path/package-lock.json" ]] || {
 echo "REFUSED: missing immutable staged source $app" >&2; exit 2;
}
[[ -f "$db_env" && ! -L "$db_env" && "$(stat -c '%u:%a' "$db_env")" == 0:600 ]] || {
 echo "REFUSED: unsafe/missing database owner credentials for $app" >&2; exit 2;
}
[[ "$(docker inspect --format '{{index .Config.Labels "com.ads.demo.app"}}' "$dbcontainer")" == "$app" ]] || {
 echo "REFUSED: unrecognized database container $dbcontainer" >&2; exit 2;
}
[[ "$(docker inspect --format '{{.State.Health.Status}}' "$dbcontainer")" == healthy ]] || {
 echo "REFUSED: unhealthy database $dbcontainer" >&2; exit 2;
}
published="$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$dbcontainer")"
[[ "$published" == '{}' || "$published" == null ]] || {
 echo "REFUSED: unexpected host DB port" >&2; exit 2;
}
expected_files="$(find "$source_path/db/migrations" -maxdepth 1 -type f -name '[0-9][0-9][0-9]_*.sql' | wc -l | tr -d ' ')"
[[ "$expected_files" =~ ^[0-9]+$ && "$expected_files" -gt 0 ]] || exit 2
echo "ADS_DEMO_SCHEMA app=$app mode=$mode source_sha=$sha expected_migrations=$expected_files"
if [[ "$mode" == --plan ]]; then
 echo "MIGRATION_COMMAND=$command"
 echo 'Database owner login used ONLY in disposable migrator. No app containers or secrets printed.'
 exit 0
fi
# The env file is root-protected; its password was generated as random hex.
source "$db_env"
expected_db="$(printf '%s' "$app" | tr '-' '_')"
[[ "$POSTGRES_DB" == "ads_demo_$expected_db" ]] || {
 echo 'REFUSED: wrong target database' >&2; exit 2;
}
[[ "$POSTGRES_USER" == "ads_demo_$expected_db""_owner" && "$POSTGRES_PASSWORD" =~ ^[a-f0-9]{64}$ ]] || {
 echo 'REFUSED: unexpected owner credentials format' >&2; exit 2;
}
owner="$POSTGRES_USER"
db="$POSTGRES_DB"
if [[ "$mode" == --verify ]]; then
 count="$(docker exec "$dbcontainer" psql --username="$owner" --dbname="$db" --no-psqlrc --tuples-only --no-align --set ON_ERROR_STOP=1 \
   --command="SELECT count(*) FROM public.$ledger" 2>/dev/null)" || {
     echo "SCHEMA_NOT_MIGRATED app=$app" >&2; exit 1;
   }
 rls="$(docker exec "$dbcontainer" psql --username="$owner" --dbname="$db" --no-psqlrc --tuples-only --no-align --set ON_ERROR_STOP=1 \
   --command="SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN ('public','home') AND c.relrowsecurity AND c.relforcerowsecurity")"
 echo "MIGRATION_LEDGER_COUNT=$count EXPECTED=$expected_files FORCED_RLS_TABLES=$rls"
 [[ "$count" == "$expected_files" && "$rls" =~ ^[0-9]+$ && "$rls" -gt 0 ]] || {
   echo "SCHEMA_VERIFICATION_FAILED app=$app" >&2; exit 1;
 }
 echo "ADS_DEMO_SCHEMA_VERIFIED=PASS app=$app"
 exit 0
fi

# Never send DB credentials to stdout, GitHub or source control.
[[ -d /etc/ads-demo/apps && ! -L /etc/ads-demo/apps ]] || exit 2
tmp="$(mktemp /etc/ads-demo/apps/.migration-env.XXXXXXXX)"
trap 'rm -f -- "$tmp"' EXIT
printf 'DATABASE_URL=postgresql://%s:%s@%s:5432/%s\n' \
 "$owner" "$POSTGRES_PASSWORD" "$dbcontainer" "$db" > "$tmp"
printf 'MIGRATION_DATABASE_URL=postgresql://%s:%s@%s:5432/%s\n' \
 "$owner" "$POSTGRES_PASSWORD" "$dbcontainer" "$db" >> "$tmp"
if [[ "$app" == home-services ]]; then
 runtime="/etc/ads-demo/apps/home-services-runtime-bootstrap.env"
 if [[ -e "$runtime" ]]; then
   [[ -f "$runtime" && ! -L "$runtime" && "$(stat -c '%u:%a' "$runtime")" == 0:600 ]] || exit 2
 else
   runtime_password="$(openssl rand -hex 32)"
   printf 'HOME_RUNTIME_ROLE=home_runtime\nHOME_RUNTIME_PASSWORD=%s\n' "$runtime_password" > "$runtime"
   chmod 0600 "$runtime"
 fi
 cat "$runtime" >> "$tmp"
fi
chmod 0600 "$tmp"
echo "=== BACKUP NEW ISOLATED DATABASE BEFORE SCHEMA MIGRATION: $app ==="
exec 9>/var/lock/ads-new-demo-schema-migrate.lock
flock -n 9 || { echo "REFUSED: another schema migration is running" >&2; exit 2; }
backup_dir="/var/lib/ads-demo/db-backups/$app"
[[ ! -L /var/lib/ads-demo && ! -L /var/lib/ads-demo/db-backups && ! -L "$backup_dir" ]] || exit 2
install -d -o root -g root -m 0700 /var/lib/ads-demo/db-backups "$backup_dir"
backup="$(mktemp "$backup_dir/pre-migrate-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXXXX.dump")"
if ! docker exec "$dbcontainer" pg_dump -U "$owner" -d "$db" -Fc > "$backup"; then
  echo "BACKUP_FAILED: inspect $backup; schema migration not attempted" >&2
  exit 1
fi
[[ -s "$backup" ]] || { echo "BACKUP_EMPTY: migration refused" >&2; exit 1; }
echo "ADS_ISOLATED_DB_BACKUP=PASS app=$app file=$backup"
echo "=== MIGRATE ISOLATED NEW DATABASE: $app ==="
# Copy only the approved archived code to private ephemeral memory, install the locked
# production dependencies, and run the app's OWN forward-only migration tool.
docker run --rm \
 --name "ads-demo-$app-migrator" \
 --network "$network" \
 --security-opt no-new-privileges:true --cap-drop ALL \
 --pids-limit 160 --memory 512m \
 --read-only --tmpfs /tmp:rw,size=64m --tmpfs /work:rw,exec,size=384m \
 --mount "type=bind,source=$source_path,target=/source,readonly" \
 --env-file "$tmp" \
 --workdir /work --entrypoint sh \
 node:22-alpine -ec "cp -R /source/. /work/; npm ci --omit=dev --ignore-scripts --no-audit --no-fund --cache /work/.npm; $command"
echo "ADS_SCHEMA_MIGRATION_COMMAND=SUCCESS app=$app; verify via --verify"

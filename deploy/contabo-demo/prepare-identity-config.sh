#!/usr/bin/env bash
# Prepare separate ADS demo login configuration; no running services changed.
# Never prints credentials. Refuses overwrite.
set -euo pipefail
umask 077
if (( $# != 2 )); then
  echo "Usage: bash $0 https://approved-demo-login-host ghcr.io/ksondo/ads-platform-kit-identity:sha-FULL40CHARCOMMIT" >&2
  exit 2
fi
public_url="$1"
identity_image="$2"
[[ "$public_url" =~ ^https://([a-z0-9-]+\.)+[a-z]{2,}$ ]] || {
  echo "Issuer must be an approved HTTPS hostname (no path, port, or query)." >&2; exit 2;
}
[[ "$public_url" != "https://login.africadigitalsynergy.com" ]] || {
  echo "Refusing the existing production login issuer." >&2; exit 2;
}
[[ "$identity_image" =~ ^ghcr\.io/ksondo/ads-platform-kit-identity:sha-[0-9a-f]{40}$ ]] || {
  echo "Approved 40-hex SHA identity image required." >&2; exit 2;
}
for cmd in docker openssl python3 ss; do
  command -v "$cmd" >/dev/null || { echo "Missing: $cmd" >&2; exit 2; }
done
docker image inspect "$identity_image" >/dev/null || {
  echo "Image missing locally; use docker pull first." >&2; exit 2;
}
if ss -ltnH | awk '{print $4}' | grep -Eq ':18090$'; then
  echo "Port 18090 is occupied; aborting." >&2; exit 1;
fi
directory=/etc/ads-demo
images_file=$directory/images.env
identity_file=$directory/identity.env
key_file=$directory/demo-signing-key.pem
for item in "$images_file" "$identity_file" "$key_file"; do
  [[ ! -e "$item" ]] || { echo "Refusing to overwrite $item" >&2; exit 1; }
done
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -r "$here/identity.env.example" && -r "$here/images.env.example" ]] || {
  echo "Missing repository templates." >&2; exit 1;
}
portal_image="$(docker inspect ads-demo-portal --format '{{.Config.Image}}' 2>/dev/null || true)"
[[ "$portal_image" =~ ^ghcr\.io/ksondo/ads-demo-portal:sha-[0-9a-f]{40}$ ]] || {
  echo "Expected versioned ADS portal container missing." >&2; exit 1;
}
install -d -m 700 "$directory"
complete=0
cleanup_on_failure() {
  if [[ "$complete" != 1 ]]; then rm -f -- "$images_file" "$identity_file" "$key_file"; fi
}
trap cleanup_on_failure EXIT
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$key_file" >/dev/null 2>&1
chmod 600 "$key_file"
export ADS_SETUP_ISSUER="$public_url"
export ADS_SETUP_IDENTITY_IMAGE="$identity_image"
export ADS_SETUP_PORTAL_IMAGE="$portal_image"
export ADS_SETUP_DB_PASS="$(openssl rand -hex 32)"
export ADS_SETUP_COOKIE="$(openssl rand -hex 32)"
export ADS_SETUP_USER_PASS="$(openssl rand -hex 24)"
export ADS_SETUP_CHECKER_PASS="$(openssl rand -hex 24)"
export ADS_SETUP_ADMIN_PASS="$(openssl rand -hex 24)"
export ADS_SETUP_DIR="$directory"
export ADS_SETUP_TEMPLATE_DIR="$here"
python3 - <<'PY'
import os
from pathlib import Path
directory=Path(os.environ["ADS_SETUP_DIR"])
templates=Path(os.environ["ADS_SETUP_TEMPLATE_DIR"])
pem=(directory/"demo-signing-key.pem").read_text().replace("\n","\\n")
assert pem.startswith("-----BEGIN PRIVATE KEY-----")
assert "\\n-----END PRIVATE KEY-----" in pem
inputs=[
  ("images.env.example","images.env",{
    "ADS_PORTAL_IMAGE":os.environ["ADS_SETUP_PORTAL_IMAGE"],
    "ADS_DEMO_IDENTITY_IMAGE":os.environ["ADS_SETUP_IDENTITY_IMAGE"],
    "ADS_DEMO_DB_PASSWORD":os.environ["ADS_SETUP_DB_PASS"],
    "ADS_PORTAL_PORT":"18089",
    "ADS_DEMO_IDENTITY_PORT":"18090",
  }),
  ("identity.env.example","identity.env",{
    "ADS_ENV":"demo","DEMO_MODE":"1","DEMO_SHOW_CREDENTIALS":"1",
    "IDENTITY_PUBLIC_URL":os.environ["ADS_SETUP_ISSUER"],
    "IDENTITY_COOKIE_SECRET":os.environ["ADS_SETUP_COOKIE"],
    "IDENTITY_SIGNING_KEY_PEM":pem,
    "DEMO_USER_PASSWORD":os.environ["ADS_SETUP_USER_PASS"],
    "DEMO_USER2_PASSWORD":os.environ["ADS_SETUP_CHECKER_PASS"],
    "DEMO_ADMIN_PASSWORD":os.environ["ADS_SETUP_ADMIN_PASS"],
  }),
]
for template,filename,variables in inputs:
  lines=(templates/template).read_text().splitlines()
  seen=set()
  for i,line in enumerate(lines):
    if "=" not in line or line.startswith("#"):continue
    key=line.split("=",1)[0]
    if key in variables:
      if key in seen: raise ValueError("Duplicate "+key)
      lines[i]=f"{key}={variables[key]}"
      seen.add(key)
  if seen!=set(variables):
    raise ValueError("Missing "+",".join(sorted(set(variables)-seen)))
  value="\n".join(lines)+"\n"
  if "REPLACE_WITH" in value or "REPLACE-WITH" in value:
    raise ValueError("Placeholder remains in template")
  fd=os.open(directory/filename,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
  with os.fdopen(fd,"w") as out:out.write(value)
PY
chmod 600 "$images_file" "$identity_file" "$key_file"
complete=1
echo "ADS_DEMO_IDENTITY_CONFIG_PREPARED=PASS"
echo "Protected configuration created in /etc/ads-demo (no credentials displayed)."
echo "Issuer: $public_url"
echo "NEXT: docker compose config; then isolated deployment and local health checks."
echo "Public HTTPS/OIDC callbacks are NOT certified by this step."

#!/usr/bin/env bash
# Publish five NEW demo loopback services using isolated Nginx vhosts + Certbot webroot.
# Never changes existing ADS Portal, Commerce, Identity, VentureWorks, Morphoo sites.
set -Eeuo pipefail
umask 077
[[ $# -ge 1 && $# -le 2 ]] || { echo 'Usage: publish-five-demo-https.sh --plan|--publish|--verify|--plan-one APP|--publish-one APP|--verify-one APP' >&2; exit 2; }
mode="$1"
case "$mode" in
 --plan|--publish|--verify)
   [[ $# -eq 1 ]] || exit 2
   targets=(education fleetguard home-services mamacare tontine)
   ;;
 --plan-one|--publish-one|--verify-one)
   [[ $# -eq 2 ]] || exit 2
   case "$2" in education|fleetguard|home-services|mamacare|tontine) targets=("$2") ;; *) exit 2 ;; esac
   ;;
 *) exit 2 ;;
esac
[[ "$(id -u)" -eq 0 && "$(hostname -s)" == vmi3191089 ]] || exit 2
here="$(cd "$(dirname "$0")" && pwd -P)"
webroot=/var/www/ads-demo-five-acme
for cmd in nginx curl certbot openssl ss dig; do
 command -v "$cmd" >/dev/null || { echo "MISSING_HOST_TOOL $cmd" >&2; exit 2; }
done
nginx -t >/dev/null
get_app() {
 app="$1"
 case "$app" in
  education) port=18501 ;;
  fleetguard) port=18502 ;;
  home-services) port=18503 ;;
  mamacare) port=18504 ;;
  tontine) port=18505 ;;
  *) exit 2 ;;
 esac
 domain="$app.demo.africadigitalsynergy.com"
 site="/etc/nginx/sites-available/ads-demo-five-$app.conf"
 enabled="/etc/nginx/sites-enabled/ads-demo-five-$app.conf"
 certificate="/etc/letsencrypt/live/$domain/fullchain.pem"
 privatekey="/etc/letsencrypt/live/$domain/privkey.pem"
}
verify_site() {
 get_app "$1"
 curl --noproxy '*' --fail --silent --show-error --max-time 12 \
  --resolve "$domain:443:127.0.0.1" "https://$domain/" >/dev/null || {
    echo "HTTPS_FAILED app=$app url=https://$domain/" >&2; return 1;
  }
 echo "HTTPS_VALID app=$app url=https://$domain/"
}
if [[ "$mode" == --plan || "$mode" == --plan-one ]]; then
 for app in "${targets[@]}"; do
  get_app "$app"
  echo "HTTPS_PLAN domain=$domain upstream=127.0.0.1:$port site=$site"
 done
 echo 'PLAN_ONLY; NO_NGINX_OR_CERTBOT_CHANGES'
 exit 0
fi
if [[ "$mode" == --verify || "$mode" == --verify-one ]]; then
 for app in "${targets[@]}"; do verify_site "$app"; done
 echo 'ADS_SCOPED_HTTPS=PASS'
 exit 0
fi
exec 9>/var/lock/ads-five-demo-https.lock
flock -n 9 || exit 2
if [[ "$mode" == --publish-one ]]; then
  app="${targets[0]}"
  get_app "$app"
  # In one-site repair mode, do not depend on unrelated platforms being healthy.
  [[ "$(docker inspect -f '{{index .Config.Labels "com.ads.demo.app"}}' "ads-demo-$app-app" 2>/dev/null)" == "$app" ]] || {
    echo "REFUSED_APP_LABEL_MISMATCH app=$app" >&2; exit 2;
  }
  [[ "$(docker inspect -f '{{.State.Running}}' "ads-demo-$app-app" 2>/dev/null)" == true ]] || {
    echo "REFUSED_APP_NOT_RUNNING app=$app" >&2; exit 2;
  }
  if [[ "$app" == education ]]; then
    [[ "$(docker inspect -f '{{index .Config.Labels "com.ads.demo.app"}}' ads-demo-education-web 2>/dev/null)" == education ]] || exit 2
    [[ "$(docker inspect -f '{{.State.Running}}' ads-demo-education-web 2>/dev/null)" == true ]] || exit 2
  fi
  curl --noproxy '*' -fsS --max-time 8 "http://127.0.0.1:$port/" >/dev/null || exit 2
  if [[ "$app" == education ]]; then
    curl --noproxy '*' -fsS --max-time 8 "http://127.0.0.1:$port/ready" >/dev/null || exit 2
  else
    curl --noproxy '*' -fsS --max-time 8 "http://127.0.0.1:$port/health" >/dev/null || exit 2
  fi
  echo "SINGLE_APP_LOCAL_HEALTH=PASS app=$app"
else
  bash "$here/launch-five-demo-apps.sh" --verify
fi
[[ -d /etc/nginx/sites-available && -d /etc/nginx/sites-enabled ]] || exit 2
[[ ! -L "$webroot" ]] || exit 2
install -d -m 0755 "$webroot/.well-known/acme-challenge"
chmod 0755 "$webroot" "$webroot/.well-known" "$webroot/.well-known/acme-challenge"
for app in "${targets[@]}"; do
 get_app "$app"
 echo "=== HTTPS $domain ==="
 [[ "$(dig +short A "$domain" | grep -cx '161.97.128.153' || true)" == 1 ]] || {
   echo "DNS_NOT_APPROVED $domain" >&2; exit 2;
 }
 [[ -z "$(dig +short AAAA "$domain")" ]] || {
   echo "UNEXPECTED_IPV6_DNS $domain" >&2; exit 2;
 }
 [[ ! -L "$site" ]] || exit 2
 if [[ -e "$site" ]]; then
   grep -q "ADS-CONTABO-FIVE:$app" "$site" || { echo "UNRECOGNISED_NGINX_SITE $site" >&2; exit 2; }
 else
   if nginx -T 2>/dev/null | grep -F "server_name $domain;" >/dev/null; then
     echo "NGINX_HOSTNAME_ALREADY_REGISTERED $domain" >&2; exit 2;
   fi
   tmp="$(mktemp /etc/nginx/sites-available/.ads-five-XXXXXX)"
   cat > "$tmp" <<EOF
# ADS-CONTABO-FIVE:$app
server {
 listen 80;
 server_name $domain;
 location ^~ /.well-known/acme-challenge/ {
  root $webroot;
  default_type text/plain;
 }
 location / { return 301 https://\$host\$request_uri; }
}
EOF
   chmod 0644 "$tmp"
   mv "$tmp" "$site"
   ln -s "$site" "$enabled"
   nginx -t >/dev/null || { rm -f "$enabled" "$site"; exit 2; }
   systemctl reload nginx
 fi
 probe="ads-five-$app-$(openssl rand -hex 8)"
 echo verified > "$webroot/.well-known/acme-challenge/$probe"
chmod 0644 "$webroot/.well-known/acme-challenge/$probe"
 if ! curl --noproxy '*' -fsS --max-time 10 \
   --resolve "$domain:80:127.0.0.1" \
   "http://$domain/.well-known/acme-challenge/$probe" | grep -qx verified; then
  rm -f "$webroot/.well-known/acme-challenge/$probe"
  echo "ACME_HTTP_CHALLENGE_UNREACHABLE domain=$domain" >&2; exit 2
 fi
 rm -f "$webroot/.well-known/acme-challenge/$probe"
 if [[ ! -f "$certificate" || ! -f "$privatekey" ]] ||
    ! openssl x509 -in "$certificate" -noout -checkend 172800 >/dev/null 2>&1 ||
    ! openssl x509 -in "$certificate" -noout -checkhost "$domain" >/dev/null 2>&1; then
   certbot certonly --webroot --webroot-path "$webroot" \
    --cert-name "$domain" -d "$domain" --non-interactive --agree-tos \
    --email admin@africadigitalsynergy.com --keep-until-expiring
 fi
 openssl x509 -in "$certificate" -noout -checkhost "$domain" >/dev/null || exit 2
 openssl x509 -in "$certificate" -noout -checkend 172800 >/dev/null || exit 2
 if ! grep -q 'ADS-FIVE-HTTPS-ACTIVE' "$site"; then
  tmp="$(mktemp /etc/nginx/sites-available/.ads-five-XXXXXX)"
  cat > "$tmp" <<EOF
# ADS-CONTABO-FIVE:$app
# ADS-FIVE-HTTPS-ACTIVE
server {
 listen 80;
 server_name $domain;
 location ^~ /.well-known/acme-challenge/ { root $webroot; }
 location / { return 301 https://\$host\$request_uri; }
}
server {
 listen 443 ssl;
 server_name $domain;
 ssl_certificate $certificate;
 ssl_certificate_key $privatekey;
 ssl_protocols TLSv1.2 TLSv1.3;
 add_header X-Content-Type-Options nosniff always;
 add_header Referrer-Policy no-referrer always;
 location / {
  proxy_pass http://127.0.0.1:$port;
  proxy_http_version 1.1;
  proxy_set_header Host \$host;
  proxy_set_header X-Real-IP \$remote_addr;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto https;
  proxy_read_timeout 35s;
 }
}
EOF
  chmod 0644 "$tmp"
  cp -p "$site" "$site.before-ssl"
  mv "$tmp" "$site"
  if ! nginx -t >/dev/null 2>&1; then
   mv "$site.before-ssl" "$site"
   echo "NGINX_TLS_CONFIG_REJECTED domain=$domain" >&2; exit 2
  fi
  systemctl reload nginx
 fi
 verify_site "$app"
done
echo 'ADS_SCOPED_HTTPS=PASS'
echo 'BROWSER_OIDC_JOURNEYS=NOT_YET_CERTIFIED; PORTAL_LINKS=UNCHANGED'

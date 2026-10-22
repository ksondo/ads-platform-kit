#!/usr/bin/env python3
"""Stage-only HTTPS publication of the isolated ADS demo Identity service.

Stages:
  --check            inspect prerequisites; no changes
  --prepare-acme     add dedicated port-80 HTTP-01 challenge site only
  --activate-https   add TLS reverse proxy after certbot certonly --webroot
  --promote-issuer   change only the demo IDENTITY_PUBLIC_URL; recreate only demo identity

Never touches production identity, other Nginx hosts, or the demo PostgreSQL volume.
"""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import uuid

HOST = "login.demo.africadigitalsynergy.com"
ORIGIN = "https://" + HOST
OLD_ORIGIN = "https://login.test.africadigitalsynergy.com"
SERVER_IP = "161.97.128.153"
PORT = "18090"
AVAILABLE = Path("/etc/nginx/sites-available") / HOST
ENABLED = Path("/etc/nginx/sites-enabled") / HOST
ACME = Path("/var/www/ads-demo-login-acme")
CERT = Path("/etc/letsencrypt/live") / HOST / "fullchain.pem"
KEY = Path("/etc/letsencrypt/live") / HOST / "privkey.pem"
CONFIG = Path("/etc/ads-demo/identity.env")
IMAGES = Path("/etc/ads-demo/images.env")
HERE = Path(__file__).resolve().parent
COMPOSE = HERE / "compose.identity.yml"
BACKUP_ROOT = Path("/var/backups/ads-demo-login")
HTTP_MARKER = "# ADS_DEMO_LOGIN_STAGE_HTTP"
HTTPS_MARKER = "# ADS_DEMO_LOGIN_STAGE_HTTPS"


class Refusal(Exception):
    pass


def command(*args, capture=True):
    return subprocess.run(
        args, check=True, text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
    )


def require_root():
    if os.geteuid() != 0:
        raise Refusal("Run as root on the Contabo VPS")


def check_dns():
    # Only trust this explicit authoritative zone and the exact approved VPS.
    for ns in ("ns75.domaincontrol.com", "ns76.domaincontrol.com"):
        ips = command("dig", "+time=3", "+tries=2", "+short", "@" + ns, HOST, "A").stdout.splitlines()
        if ips != [SERVER_IP]:
            raise Refusal(f"{ns} returned A={ips!r}, expected only {SERVER_IP}; DNS is not ready")
    # A stray IPv6 destination would route some browsers away from this host.
    ipv6 = command("dig", "+time=3", "+tries=2", "+short", "@" + "ns75.domaincontrol.com", HOST, "AAAA").stdout.splitlines()
    if ipv6:
        raise Refusal(f"Unexpected IPv6 AAAA records: {ipv6!r}")
    print("ADS_DEMO_LOGIN_DNS=PASS")


def check_demo():
    if not CONFIG.is_file() or not IMAGES.is_file():
        raise Refusal("Protected demo config missing; will not create or overwrite identity settings")
    data = CONFIG.read_text().splitlines()
    if "ADS_ENV=demo" not in data or "DEMO_MODE=1" not in data:
        raise Refusal("Only the isolated ADS demo identity may be published")
    matches = [line.partition("=")[2] for line in data if line.startswith("IDENTITY_PUBLIC_URL=")]
    if len(matches) != 1 or matches[0] not in (OLD_ORIGIN, ORIGIN):
        raise Refusal("Unexpected or duplicate demo identity public origin")
    if any(line.startswith("IDENTITY_ISSUER=") and line.partition("=")[2].strip() for line in data):
        raise Refusal("Separate IDENTITY_ISSUER override detected; requires manual review")
    if not COMPOSE.is_file():
        raise Refusal("Expected isolated demo Compose file missing")
    if not command("docker", "inspect", "-f", "{{.Name}}", "ads-demo-identity").stdout.strip() == "/ads-demo-identity":
        raise Refusal("Expected ads-demo-identity container not found")
    health = command("curl", "--noproxy", "*", "-fsS", "--max-time", "8", f"http://127.0.0.1:{PORT}/health").stdout
    if '"status":"ok"' not in health:
        raise Refusal("Existing demo identity API is not healthy")
    return matches[0]


def check_site(expected=None):
    if ENABLED.is_symlink() and ENABLED.resolve() != AVAILABLE:
        raise Refusal("Demo login enabled-site symlink points somewhere unexpected")
    if ENABLED.exists() and not ENABLED.is_symlink():
        raise Refusal("Demo login enabled-site already exists as a non-symlink")
    if AVAILABLE.exists():
        text = AVAILABLE.read_text()
        if not (text.startswith(HTTP_MARKER) or text.startswith(HTTPS_MARKER)):
            raise Refusal("An unrelated Nginx site already occupies the requested login hostname")
        if not ENABLED.is_symlink() or ENABLED.resolve() != AVAILABLE:
            raise Refusal("Existing ADS demo login file is not safely enabled")
    elif ENABLED.is_symlink():
        raise Refusal("Broken demo login Nginx symlink exists")
    else:
        text = None
    if expected is not None and (text is None or not text.startswith(expected)):
        raise Refusal("Nginx demo login stage is not the expected one")
    return text


def check_system():
    command("nginx", "-t")
    issuer = check_demo()
    current = check_site()
    print("ADS_DEMO_LOGIN_PREFLIGHT=PASS")
    print("Current demo issuer:", issuer)
    print("Current Nginx site:", "not created" if current is None else "HTTPS" if current.startswith(HTTPS_MARKER) else "HTTP challenge only")


def http_conf():
    # Public login routes stay blocked until certificate issuance and HTTPS activation.
    return f"""{HTTP_MARKER}
server {{
    listen 80;
    server_name {HOST};
    location ^~ /.well-known/acme-challenge/ {{
        root {ACME};
        default_type text/plain;
        try_files $uri =404;
    }}
    location / {{ return 404; }}
}}
"""


def https_conf():
    return f"""{HTTPS_MARKER}
server {{
    listen 80;
    server_name {HOST};
    location ^~ /.well-known/acme-challenge/ {{
        root {ACME};
        default_type text/plain;
        try_files $uri =404;
    }}
    location / {{ return 301 https://$host$request_uri; }}
}}
server {{
    listen 443 ssl;
    server_name {HOST};
    ssl_certificate {CERT};
    ssl_certificate_key {KEY};
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 1m;
    location / {{
        proxy_pass http://127.0.0.1:{PORT};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
    }}
}}
"""


def replace_atomic(path, content, mode=None):
    original_stat = path.stat() if path.exists() else None
    fd, temporary = tempfile.mkstemp(prefix=".ads-login-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(temporary, stat.S_IMODE(original_stat.st_mode) if original_stat else mode or 0o644)
        if original_stat:
            os.chown(temporary, original_stat.st_uid, original_stat.st_gid)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def backup(path):
    dest = BACKUP_ROOT / (dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8])
    dest.mkdir(mode=0o700, parents=True)
    result = dest / path.name
    shutil.copy2(path, result)
    result.chmod(0o600)
    print("Backup:", result, flush=True)
    return result


def nginx_reload():
    command("nginx", "-t", capture=False)
    command("systemctl", "reload", "nginx", capture=False)


def prepare_public_webroot():
    """The dedicated challenge path must be readable/traversable by Nginx workers.

    Root's interactive umask can be 077, which makes files/dirs inaccessible to
    Nginx's unprivileged worker. Only modify our new, dedicated ACME directories.
    """
    for directory in (ACME, ACME / ".well-known", ACME / ".well-known" / "acme-challenge"):
        if directory.is_symlink() or (directory.exists() and not directory.is_dir()):
            raise Refusal(f"Unsafe existing ACME path: {directory}")
        directory.mkdir(parents=True, mode=0o755, exist_ok=True)
        directory.chmod(0o755)


def challenge_probe():
    """Retry hostname-specific challenge after async Nginx reload; never skip HTTP-01."""
    token = "ads-" + uuid.uuid4().hex
    challenge = ACME / ".well-known" / "acme-challenge" / token
    # Use exclusive creation and an explicit world-readable mode even with umask 077.
    with challenge.open("x") as output:
        output.write(token)
    challenge.chmod(0o644)
    try:
        last_result = "no HTTP response"
        for attempt in range(20):
            try:
                result = command(
                    "curl", "--noproxy", "*", "-sS", "--max-time", "5",
                    "--write-out", "\\nADS_HTTP_STATUS:%{http_code}",
                    "--resolve", HOST + ":80:127.0.0.1",
                    "http://" + HOST + "/.well-known/acme-challenge/" + token,
                ).stdout
                body, separator, status = result.rpartition("\nADS_HTTP_STATUS:")
                if separator and status.strip() == "200" and body == token:
                    return
                last_result = "HTTP " + status.strip() if separator else "unexpected response"
            except subprocess.CalledProcessError as err:
                last_result = "curl exit " + str(err.returncode)
            if attempt < 19:
                time.sleep(1)
        raise Refusal(
            "ACME HTTP-01 local validation failed after 20 attempts: "
            + last_result + "; the staged site will be safely rolled back. "
            "Inspect Nginx routing and worker access before retrying Certbot."
        )
    finally:
        challenge.unlink(missing_ok=True)


def prepare_acme():
    check_dns()
    check_demo()
    check_site()
    command("nginx", "-t")
    prepare_public_webroot()
    if AVAILABLE.exists():
        if AVAILABLE.read_text() != http_conf():
            raise Refusal("Existing HTTP challenge stage differs from expected contents")
        challenge_probe()
        print("ADS_DEMO_LOGIN_ACME_READY=PASS")
        return
    try:
        # Exclusive create prevents overwriting other websites.
        with AVAILABLE.open("x") as site:
            site.write(http_conf())
        AVAILABLE.chmod(0o644)
        ENABLED.symlink_to(AVAILABLE)
        nginx_reload()
        challenge_probe()
    except Exception:
        if ENABLED.is_symlink() and ENABLED.resolve() == AVAILABLE:
            ENABLED.unlink()
        if AVAILABLE.exists() and AVAILABLE.read_text() == http_conf():
            AVAILABLE.unlink()
        try:
            nginx_reload()
        except Exception as error:
            print("NGINX RESTORE REQUIRES ATTENTION:", error, file=sys.stderr)
        raise
    print("ADS_DEMO_LOGIN_ACME_READY=PASS")
    print("Next: certbot certonly --webroot -w", ACME, "-d", HOST, "--cert-name", HOST)


def certificate_ok():
    if not CERT.is_file() or not KEY.is_file():
        raise Refusal("Certbot must issue the demo login certificate first")
    command("openssl", "x509", "-in", str(CERT), "-noout", "-checkend", "604800")
    output = command("openssl", "x509", "-in", str(CERT), "-noout", "-checkhost", HOST).stdout
    if "does match certificate" not in output:
        raise Refusal("Certificate does not match the demo hostname")
    command("openssl", "pkey", "-in", str(KEY), "-noout")


def https_check():
    output = command(
        "curl", "--noproxy", "*", "-fsS", "--max-time", "8",
        "--resolve", HOST + ":443:127.0.0.1",
        ORIGIN + "/.well-known/openid-configuration",
    ).stdout
    doc = json.loads(output)
    if doc.get("issuer") not in (OLD_ORIGIN, ORIGIN):
        raise Refusal("Public HTTPS endpoint advertised an unexpected issuer")
    return doc["issuer"]


def activate_https():
    check_dns()
    check_demo()
    current = check_site()
    certificate_ok()
    if current is None or not current.startswith(HTTP_MARKER):
        if current == https_conf():
            print("ADS_DEMO_LOGIN_HTTPS=PASS (already configured)")
            return
        raise Refusal("HTTP-only ACME stage has not been installed")
    if current != http_conf():
        raise Refusal("HTTP challenge config differs from reviewed template")
    previous = backup(AVAILABLE)
    try:
        replace_atomic(AVAILABLE, https_conf())
        nginx_reload()
        # Nginx reload is asynchronous.
        for attempt in range(10):
            try:
                print("Public HTTPS OIDC issuer before cutover:", https_check())
                print("ADS_DEMO_LOGIN_HTTPS=PASS")
                return
            except (subprocess.CalledProcessError, ValueError, Refusal):
                if attempt < 9:
                    time.sleep(1)
        raise Refusal("New HTTPS endpoint did not serve Identity discovery")
    except Exception:
        replace_atomic(AVAILABLE, previous.read_text())
        nginx_reload()
        raise


def identity_recreate():
    command(
        "docker", "compose", "--env-file", str(IMAGES), "-f", str(COMPOSE),
        "up", "-d", "--no-deps", "--force-recreate", "identity", capture=False,
    )


def issuer_check():
    for attempt in range(45):
        try:
            health = command(
                "curl", "--noproxy", "*", "-fsS", "--max-time", "3",
                f"http://127.0.0.1:{PORT}/health",
            ).stdout
            if '"status":"ok"' in health and https_check() == ORIGIN:
                return
        except (subprocess.CalledProcessError, ValueError, Refusal):
            pass
        time.sleep(2)
    raise Refusal("Demo identity issuer did not become healthy at the approved HTTPS origin")


def promote_issuer():
    check_dns()
    old = check_demo()
    certificate_ok()
    if check_site(expected=HTTPS_MARKER) != https_conf():
        raise Refusal("Reviewed HTTPS site configuration missing or unexpectedly modified")
    if https_check() not in (OLD_ORIGIN, ORIGIN):
        raise Refusal("HTTPS OIDC discovery is not connected to isolated demo Identity")
    if old == ORIGIN:
        issuer_check()
        print("ADS_DEMO_LOGIN_ISSUER=PASS (already active)")
        return
    previous = backup(CONFIG)
    content = CONFIG.read_text()
    old_line = "IDENTITY_PUBLIC_URL=" + OLD_ORIGIN
    if content.count(old_line + "\n") != 1:
        raise Refusal("Unexpected demo issuer value; no changes made")
    new_content = content.replace(old_line + "\n", "IDENTITY_PUBLIC_URL=" + ORIGIN + "\n")
    # No key/password/DB/role files are modified.
    try:
        replace_atomic(CONFIG, new_content, mode=0o600)
        identity_recreate()
        issuer_check()
        print("ADS_DEMO_LOGIN_ISSUER=PASS")
        print("Public login:", ORIGIN)
        print("Existing demo DB and accounts preserved; bootstrap was not rerun.")
    except Exception:
        print("Issuer validation failed, restoring previous protected environment.", file=sys.stderr)
        replace_atomic(CONFIG, previous.read_text(), mode=0o600)
        try:
            identity_recreate()
        except Exception as error:
            print("IDENTITY RESTORE REQUIRES ATTENTION:", error, file=sys.stderr)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--prepare-acme", action="store_true")
    mode.add_argument("--activate-https", action="store_true")
    mode.add_argument("--promote-issuer", action="store_true")
    opts = parser.parse_args()
    try:
        require_root()
        if opts.check:
            check_dns()
            check_system()
        elif opts.prepare_acme:
            prepare_acme()
        elif opts.activate_https:
            activate_https()
        else:
            promote_issuer()
        return 0
    except (Refusal, OSError, subprocess.CalledProcessError, ValueError, json.JSONDecodeError) as err:
        print("ADS_DEMO_LOGIN_ERROR:", err, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())

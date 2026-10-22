#!/usr/bin/env python3
"""Safely publish the already-running isolated ADS Commerce demo over HTTPS.

--check          read-only prerequisite checks (DNS, local Commerce, Nginx)
--prepare-acme   HTTP-only, fail-closed Let's Encrypt HTTP-01 route
--activate-https HTTPS-only reverse proxy after a matching certbot webroot certificate

No databases, Docker containers, login settings, product roles, or other sites are
modified. Refuse any existing unrelated Nginx hostname ownership and roll back
this dedicated site if Nginx or the smoke test fails.
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

HOST = "commerce.demo.africadigitalsynergy.com"
ORIGIN = "https://" + HOST
SERVER_IP = "161.97.128.153"
PORT = "18086"
AVAILABLE = Path("/etc/nginx/sites-available") / HOST
ENABLED = Path("/etc/nginx/sites-enabled") / HOST
ACME = Path("/var/www/ads-demo-commerce-acme")
CERT = Path("/etc/letsencrypt/live") / HOST / "fullchain.pem"
KEY = Path("/etc/letsencrypt/live") / HOST / "privkey.pem"
BACKUP_ROOT = Path("/var/backups/ads-demo-commerce")
ENV = Path("/etc/ads-demo/commerce.env")
HTTP_MARKER = "# ADS_DEMO_COMMERCE_STAGE_HTTP"
HTTPS_MARKER = "# ADS_DEMO_COMMERCE_STAGE_HTTPS"


class Refusal(Exception):
    pass


def cmd(*args, capture=True):
    return subprocess.run(args, check=True, text=True,
                          stdout=subprocess.PIPE if capture else None,
                          stderr=subprocess.PIPE if capture else None)


def root_only():
    if os.geteuid() != 0:
        raise Refusal("Run as root on the Contabo VPS")


def check_dns():
    for ns in ("ns75.domaincontrol.com", "ns76.domaincontrol.com"):
        records = cmd("dig", "+time=3", "+tries=2", "+short", "@" + ns, HOST, "A").stdout.splitlines()
        if records != [SERVER_IP]:
            raise Refusal(f"{ns} returned unexpected DNS A records: {records!r}")
        v6 = cmd("dig", "+time=3", "+tries=2", "+short", "@" + ns, HOST, "AAAA").stdout.splitlines()
        if v6:
            raise Refusal(f"{ns} returned unexpected IPv6 AAAA records: {v6!r}")
    print("ADS_COMMERCE_DNS=PASS")


def check_local():
    if not ENV.is_file():
        raise Refusal("Protected isolated Commerce environment missing")
    web = cmd("docker", "inspect", "--format", "{{.State.Running}}", "ads-commerce-demo-commerce-web-1").stdout.strip()
    if web != "true":
        raise Refusal("The separate Commerce demo web container is not running")
    port = cmd("docker", "port", "ads-commerce-demo-commerce-web-1", "80").stdout.splitlines()
    if port != ["127.0.0.1:" + PORT]:
        raise Refusal(f"Unexpected Commerce web port mapping: {port!r} (expected loopback only)")
    api = json.loads(cmd("curl", "--noproxy", "*", "-fsS", "--max-time", "8",
                         f"http://127.0.0.1:{PORT}/api/ready").stdout)
    if api.get("status") != "ready_for_internal_checks" or api.get("certification") != "EXTERNAL_SIGNOFF_REQUIRED":
        raise Refusal("Commerce API has not passed its isolated internal readiness gate")
    cmd("curl", "--noproxy", "*", "-fsS", "--max-time", "8", "-o", "/dev/null",
        f"http://127.0.0.1:{PORT}/commerce")
    print("ADS_COMMERCE_LOCAL=PASS")


def http_conf():
    return f"""# ADS_DEMO_COMMERCE_STAGE_HTTP
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
    return f"""# ADS_DEMO_COMMERCE_STAGE_HTTPS
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

    client_max_body_size 4m;
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


def site_status():
    if ENABLED.is_symlink() and ENABLED.resolve() != AVAILABLE:
        raise Refusal("Existing Commerce enabled site points to another file")
    if ENABLED.exists() and not ENABLED.is_symlink():
        raise Refusal("Existing Commerce enabled site is not a symlink")
    if AVAILABLE.exists():
        value = AVAILABLE.read_text()
        if value not in (http_conf(), https_conf()):
            raise Refusal("An unexpected file already occupies the Commerce Nginx site path")
        if not ENABLED.is_symlink() or ENABLED.resolve() != AVAILABLE:
            raise Refusal("Commerce Nginx site file exists but is not enabled as expected")
        return value
    if ENABLED.is_symlink():
        raise Refusal("Broken Commerce Nginx site symlink")
    return None


def check_hostname_collision(current):
    # Nginx can silently ignore a duplicate hostname with a warning while -t
    # still exits 0. Inspect the effective config before editing our exact site.
    output = cmd("nginx", "-T").stdout
    count = len(re.findall(r"\bserver_name\s+" + re.escape(HOST) + r"\s*;", output))
    expected = 1 if current else 0
    if count != expected:
        raise Refusal(f"Conflicting Nginx Commerce server_name entries: {count}, expected {expected}")


def nginx_reload():
    cmd("nginx", "-t", capture=False)
    cmd("systemctl", "reload", "nginx", capture=False)


def public_webroot():
    for directory in (ACME, ACME / ".well-known", ACME / ".well-known" / "acme-challenge"):
        if directory.is_symlink() or (directory.exists() and not directory.is_dir()):
            raise Refusal(f"Unsafe ACME directory: {directory}")
        directory.mkdir(parents=True, exist_ok=True, mode=0o755)
        directory.chmod(0o755)


def probe():
    """The challenge MUST be readable with umask 077 and actually served on HTTP."""
    token = "ads-commerce-" + uuid.uuid4().hex
    path = ACME / ".well-known" / "acme-challenge" / token
    with path.open("x") as stream:
        stream.write(token)
    path.chmod(0o644)
    try:
        last = "no response"
        for attempt in range(20):
            try:
                output = cmd("curl", "--noproxy", "*", "-sS", "--max-time", "5",
                             "--write-out", "\nADS_HTTP_STATUS:%{http_code}",
                             "--resolve", HOST + ":80:127.0.0.1",
                             "http://" + HOST + "/.well-known/acme-challenge/" + token).stdout
                body, divider, code = output.rpartition("\nADS_HTTP_STATUS:")
                if divider and code.strip() == "200" and body == token:
                    return
                last = "HTTP " + code.strip() if divider else "unexpected body"
            except subprocess.CalledProcessError as error:
                last = "curl exit " + str(error.returncode)
            if attempt < 19:
                time.sleep(1)
        raise Refusal(f"Commerce HTTP-01 route did not pass after retries ({last}); rolled back")
    finally:
        path.unlink(missing_ok=True)


def replace_atomic(path, content):
    fd, temp = tempfile.mkstemp(prefix=".ads-commerce-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as writer:
            writer.write(content)
            writer.flush()
            os.fsync(writer.fileno())
        os.chmod(temp, 0o644)
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def backup(path):
    directory = BACKUP_ROOT / (dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ") +
                               "-" + uuid.uuid4().hex[:8])
    directory.mkdir(parents=True, mode=0o700)
    copied = directory / path.name
    shutil.copy2(path, copied)
    copied.chmod(0o600)
    print("Backup:", copied, flush=True)
    return copied


def cert_ok():
    if not CERT.is_file() or not KEY.is_file():
        raise Refusal("Commerce-specific LetsEncrypt certificate not present; run certbot webroot only after ACME PASS")
    cmd("openssl", "x509", "-in", str(CERT), "-noout", "-checkend", "604800")
    match = cmd("openssl", "x509", "-in", str(CERT), "-noout", "-checkhost", HOST).stdout
    if "does match certificate" not in match:
        raise Refusal("Commerce certificate does not cover the required HTTPS hostname")
    cmd("openssl", "pkey", "-in", str(KEY), "-noout")


def public_smoke():
    result = cmd("curl", "--noproxy", "*", "-fsS", "--max-time", "8",
                 "--resolve", HOST + ":443:127.0.0.1",
                 ORIGIN + "/api/ready").stdout
    data = json.loads(result)
    if data.get("status") != "ready_for_internal_checks":
        raise Refusal("Commerce HTTPS returned unexpected readiness")
    cmd("curl", "--noproxy", "*", "-fsS", "--max-time", "8", "-o", "/dev/null",
        "--resolve", HOST + ":443:127.0.0.1", ORIGIN + "/commerce")


def prepare():
    check_dns()
    check_local()
    current = site_status()
    cmd("nginx", "-t")
    check_hostname_collision(current)
    public_webroot()
    if current is not None:
        if current != http_conf():
            raise Refusal("Commerce site is already HTTPS or unexpectedly modified")
        probe()
        print("ADS_COMMERCE_ACME_READY=PASS")
        return
    try:
        with AVAILABLE.open("x") as site:
            site.write(http_conf())
        AVAILABLE.chmod(0o644)
        ENABLED.symlink_to(AVAILABLE)
        nginx_reload()
        probe()
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
    print("ADS_COMMERCE_ACME_READY=PASS")
    print("Next: certbot certonly --webroot -w", ACME, "-d", HOST, "--cert-name", HOST)


def activate():
    check_dns()
    check_local()
    current = site_status()
    cmd("nginx", "-t")
    check_hostname_collision(current)
    cert_ok()
    if current == https_conf():
        public_smoke()
        print("ADS_COMMERCE_HTTPS=PASS (already active)")
        return
    if current != http_conf():
        raise Refusal("Required isolated Commerce HTTP challenge stage missing")
    saved = backup(AVAILABLE)
    try:
        replace_atomic(AVAILABLE, https_conf())
        nginx_reload()
        for attempt in range(15):
            try:
                public_smoke()
                print("ADS_COMMERCE_HTTPS=PASS")
                return
            except (subprocess.CalledProcessError, ValueError, json.JSONDecodeError, Refusal):
                if attempt < 14:
                    time.sleep(1)
        raise Refusal("Commerce HTTPS smoke test failed after retries")
    except Exception:
        replace_atomic(AVAILABLE, saved.read_text())
        nginx_reload()
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_mutually_exclusive_group(required=True)
    actions.add_argument("--check", action="store_true")
    actions.add_argument("--prepare-acme", action="store_true")
    actions.add_argument("--activate-https", action="store_true")
    a = parser.parse_args()
    try:
        root_only()
        if a.check:
            check_dns()
            check_local()
            current = site_status()
            cmd("nginx", "-t")
            check_hostname_collision(current)
            print("ADS_COMMERCE_PREFLIGHT=PASS")
            print("Nginx Commerce stage:", "not created" if current is None else
                  "HTTPS" if current == https_conf() else "HTTP challenge")
        elif a.prepare_acme:
            prepare()
        else:
            activate()
    except (Refusal, OSError, subprocess.CalledProcessError, ValueError, json.JSONDecodeError) as error:
        print("ADS_COMMERCE_ERROR:", error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

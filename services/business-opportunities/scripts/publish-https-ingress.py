#!/usr/bin/env python3
"""Add ONLY the Business Opportunities read-only API route to existing ADS demo HTTPS Nginx.

Fail closed for unknown site layout. Backup, nginx -t, HTTPS smoke and automatic
rollback. Never touch other virtual hosts, Commerce, Identity, root / or login.
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

HOST = "demo.africadigitalsynergy.com"
SITE = Path("/etc/nginx/sites-enabled/demo.africadigitalsynergy.com")
BACKUPS = Path("/var/backups/ads-business-opportunities-nginx")
LOCAL = "http://127.0.0.1:18190"
PORTAL = "http://127.0.0.1:18089"
PREFIX = "/api/opportunities/v1/"
SIGNATURE = "# ADS_OPPORTUNITIES_READ_API_V1"
CHECKS = (
    ("/sectors", 50),
    ("/opportunities?limit=1", 333),
    ("/discovery/categories?family=business", 13),
    ("/discovery/categories?family=institutional", 8),
    ("/discovery/solutions?family=business&limit=1", 102),
    ("/discovery/solutions?family=institutional&limit=1", 20),
)
LOCATION = """
    # ADS_OPPORTUNITIES_READ_API_V1: isolated public catalogue API, no auth/DB writes.
    location ^~ /api/opportunities/v1/ {
        proxy_pass http://127.0.0.1:18190;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 20s;
        proxy_send_timeout 20s;
    }
"""

class Refused(Exception):
    pass

def require(ok, why):
    if not ok:
        raise Refused(why)

def run(*args):
    return subprocess.run(args, check=True, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, text=True).stdout

def fetch(path, *, public=False):
    """Return a public read API JSON document, with bounded, secret-free errors."""
    url = ("https://" + HOST if public else LOCAL) + PREFIX.rstrip("/") + path
    args = ["curl", "--noproxy", "*", "-sS", "--max-time", "12",
            "--write-out", "\\n__ADS_HTTP__%{http_code}|%{content_type}"]
    if public:
        args += ["--resolve", HOST + ":443:127.0.0.1"]
    result = subprocess.run([*args, url], capture_output=True, text=True)
    if result.returncode != 0:
        raise Refused("API " + ("HTTPS" if public else "LOCAL") +
                      " request failed (curl exit " + str(result.returncode) + ")")
    body, marker, meta = result.stdout.rpartition("\n__ADS_HTTP__")
    require(bool(marker) and "|" in meta,
            "API response missing status/content-type metadata")
    status, content_type = meta.split("|", 1)
    kind = ("html" if body.lstrip().lower().startswith(("<!doctype html", "<html"))
            else "json-like" if body.lstrip().startswith(("{", "[")) else "other")
    require(status == "200" and "application/json" in content_type.lower(),
            "API " + ("HTTPS" if public else "LOCAL") + " " + path +
            ": status=" + status + " type=" + content_type[:70] + " body_kind=" + kind)
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        raise Refused("API " + ("HTTPS" if public else "LOCAL") + " " + path +
                      ": HTTP 200 application/json but response is not JSON") from None

def verify_api(public=False):
    for path, expected in CHECKS:
        data = fetch(path, public=public)
        require(isinstance(data, dict) and data.get("total") == expected,
                ("HTTPS" if public else "LOCAL") + " catalogue mismatch " + path)
    print("ADS_OPPORTUNITIES_" + ("HTTPS" if public else "LOCAL") +
          "_COUNTS=PASS 50/333/13/8/102/20", flush=True)

def verify_https_after_reload(attempts=12):
    """Nginx workers may serve an earlier config briefly after reload.

    Never claim deployment or retain a new site file without full live JSON
    evidence. A failed verification is fatal and caller restores the backup.
    """
    last = "unknown"
    for attempt in range(attempts):
        try:
            verify_api(public=True)
            return
        except Refused as error:
            last = str(error)
            if attempt < attempts - 1:
                time.sleep(1)
    raise Refused("HTTPS route remained unverified after " + str(attempts) +
                  " checks: " + last)

def find_approved_server(original):
    # No changes to the HTTP redirect or other server blocks. Refuse nonstandard layouts.
    matches = list(re.finditer(r"(?m)^\s*server\s*\{", original))
    https = []
    for m in matches:
        depth = 1
        index = m.end()
        while index < len(original) and depth:
            if original[index] == "{":
                depth += 1
            elif original[index] == "}":
                depth -= 1
            index += 1
        require(depth == 0, "Unbalanced Nginx server block")
        block = original[m.start():index]
        if (re.search(r"(?m)^\s*server_name\s+" +
                      re.escape(HOST) + r"\s*;", block)
                and re.search(r"(?m)^\s*listen\s+[^;]*\b443\b[^;]*;", block)):
            https.append((m, block, index))
    require(len(https) == 1, "Expected exactly one ADS demo HTTPS server block")
    m, block, end = https[0]
    require("proxy_pass " + PORTAL + ";" in block,
            "Current ADS demo landing-page proxy is not the expected port 18089")
    if SIGNATURE in block:
        require(block.count(SIGNATURE) == 1 and
                "proxy_pass " + LOCAL + ";" in block,
                "Existing API route marker is invalid")
        return original, "existing"
    require(not re.search(r"(?m)location\s+[^\{]*" +
                          re.escape(PREFIX), block),
            "API location exists with unexpected config")
    require("proxy_pass " + LOCAL + ";" not in original,
            "Catalogue API proxy already present elsewhere")
    return original[:m.end()] + LOCATION + original[m.end():], "new"

def replace_file(path, content):
    st = path.stat()
    fd, name = tempfile.mkstemp(prefix=".ads-opportunities-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(name, stat.S_IMODE(st.st_mode))
        os.chown(name, st.st_uid, st.st_gid)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true")
    group.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    require(os.geteuid() == 0, "Authorized root operator required")
    require(run("hostname", "-s").strip() == "vmi3191089", "Unexpected host")
    require(SITE.exists(), "Expected enabled ADS demo site missing")
    actual = SITE.resolve(strict=True)
    require(str(actual).startswith("/etc/nginx/") and actual.is_file(),
            "Unexpected Nginx target")
    require(not actual.is_symlink(), "Resolved Nginx file is a symlink")
    # Never modify nginx if an unrelated config error exists already.
    run("nginx", "-t")
    require("ADS Digital Ecosystem" in run("curl", "--noproxy", "*", "-fsS",
                                          "--max-time", "12", PORTAL + "/"),
            "Existing ADS landing page not healthy")
    verify_api()
    original = actual.read_text()
    updated, mode = find_approved_server(original)
    if args.check:
        print("ADS_OPPORTUNITIES_NGINX_PREFLIGHT=PASS mode=" + mode)
        return

    if mode == "existing":
        verify_https_after_reload()
        print("ADS_OPPORTUNITIES_NGINX=ALREADY_ACTIVE")
        return
    BACKUPS.mkdir(parents=True, exist_ok=True, mode=0o700)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = BACKUPS / (stamp + "-" + str(os.getpid()) + ".conf")
    shutil.copy2(actual, backup)
    backup.chmod(0o600)
    print("ADS_OPPORTUNITIES_NGINX_BACKUP=" + str(backup), flush=True)
    try:
        replace_file(actual, updated)
        run("nginx", "-t")
        run("systemctl", "reload", "nginx")
        verify_https_after_reload()
    except Exception:
        print("ADS_OPPORTUNITIES_NGINX=ROLLING_BACK", file=sys.stderr)
        replace_file(actual, original)
        try:
            run("nginx", "-t")
            run("systemctl", "reload", "nginx")
        except Exception:
            print("ADS_OPPORTUNITIES_NGINX=MANUAL_RECOVERY_REQUIRED",
                  file=sys.stderr)
        raise
    print("ADS_OPPORTUNITIES_NGINX=PASS existing homepage unmodified")

if __name__ == "__main__":
    try:
        main()
    except (Refused, OSError, subprocess.CalledProcessError,
            ValueError, KeyError, json.JSONDecodeError) as e:
        print("ADS_OPPORTUNITIES_NGINX_REFUSED=" + type(e).__name__ +
              ": " + str(e)[:250], file=sys.stderr)
        sys.exit(1)

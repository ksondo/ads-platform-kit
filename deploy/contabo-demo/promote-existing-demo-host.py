#!/usr/bin/env python3
"""Safely repoint the existing demo.africadigitalsynergy.com Nginx site to ADS Portal.

Only replaces the legacy /root/retail-sync-io/dist static-site directive block.
Keeps the existing domain, Certbot-managed TLS, HTTP redirects and all other sites.
Preserves the old static files and records an exact Nginx-site backup.
"""
import argparse
import datetime as dt
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile

HOST = "demo.africadigitalsynergy.com"
SITE = Path("/etc/nginx/sites-enabled/demo.africadigitalsynergy.com")
CERT = Path("/etc/letsencrypt/live/demo.africadigitalsynergy.com/fullchain.pem")
BACKUP_ROOT = Path("/var/backups/ads-demo-nginx")
PORTAL = "http://127.0.0.1:18089"
LANDING_MARKER = "ADS Digital Ecosystem"

LEGACY = re.compile(
    r"(?m)^(?P<indent>[ \t]*)root[ \t]+/root/retail-sync-io/dist;[ \t]*\r?\n"
    r"[ \t]*index[ \t]+index\.html;[ \t]*\r?\n"
    r"(?:[ \t]*\r?\n)*"
    r"[ \t]*location[ \t]+/[ \t]*\{[ \t]*\r?\n"
    r"[ \t]*try_files[ \t]+\$uri[ \t]+\$uri/[ \t]+/index\.html;[ \t]*\r?\n"
    r"[ \t]*\}"
)


class SafetyError(Exception):
    pass


def replace_legacy(text: str) -> tuple[str, str]:
    if text.count("server_name " + HOST + ";") != 2:
        raise SafetyError("Expected exactly two legacy HTTPS/HTTP server_name declarations; refusing unknown configuration")
    if text.count("ssl_certificate " + str(CERT) + ";") != 1:
        raise SafetyError("Expected original Certbot TLS certificate reference; refusing unknown configuration")
    found = list(LEGACY.finditer(text))
    if len(found) == 0 and "proxy_pass " + PORTAL + ";" in text and "/root/retail-sync-io/dist" not in text:
        return text, "already"
    if len(found) != 1 or text.count("/root/retail-sync-io/dist") != 1:
        raise SafetyError("Legacy retail static-site block differs from verified configuration; refusing to change it")
    indent = found[0].group("indent")
    replacement = (
        indent + "location / {\n"
        + indent + "    proxy_pass " + PORTAL + ";\n"
        + indent + "    proxy_http_version 1.1;\n"
        + indent + "    proxy_set_header Host $host;\n"
        + indent + "    proxy_set_header X-Real-IP $remote_addr;\n"
        + indent + "    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n"
        + indent + "    proxy_set_header X-Forwarded-Proto $scheme;\n"
        + indent + "    proxy_connect_timeout 5s;\n"
        + indent + "    proxy_read_timeout 30s;\n"
        + indent + "}"
    )
    return text[:found[0].start()] + replacement + text[found[0].end():], "legacy"


def run(*argv: str, capture: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(argv, check=True, text=True, capture_output=capture)


def verify_portal() -> None:
    output = run(
        "curl", "--noproxy", "*", "-fsS", "--max-time", "8", PORTAL + "/",
        capture=True,
    ).stdout
    if LANDING_MARKER not in output:
        raise SafetyError("Local ADS portal does not contain expected landing-page marker")


def verify_https() -> None:
    result = run(
        "curl", "--noproxy", "*", "-fsS", "--max-time", "12",
        "--resolve", HOST + ":443:127.0.0.1", "https://" + HOST + "/",
        capture=True,
    )
    if LANDING_MARKER not in result.stdout:
        raise SafetyError("HTTPS route did not serve the ADS portal content")


def checks() -> tuple[Path, str, str]:
    if os.geteuid() != 0:
        raise SafetyError("Run as root on the Contabo VPS")
    if not SITE.exists():
        raise SafetyError("Existing demo Nginx site is missing; do not create a replacement blindly")
    actual = SITE.resolve(strict=True)
    if not actual.is_file() or not str(actual).startswith("/etc/nginx/"):
        raise SafetyError("Unexpected Nginx configuration target")
    if not CERT.is_file():
        raise SafetyError("Existing Certbot certificate missing")
    # Certificate must be valid now, at least another day, and match the domain.
    run("openssl", "x509", "-in", str(CERT), "-noout", "-checkend", "86400", capture=True)
    run("openssl", "x509", "-in", str(CERT), "-noout", "-checkhost", HOST, capture=True)
    run("nginx", "-t", capture=True)
    verify_portal()
    original = actual.read_text()
    updated, state = replace_legacy(original)
    return actual, updated, state


def atomic_replace(path: Path, content: str) -> None:
    original_stat = path.stat()
    fd, temporary = tempfile.mkstemp(prefix=".ads-demo-candidate-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as out:
            out.write(content)
            out.flush()
            os.fsync(out.fileno())
        os.chmod(temporary, stat.S_IMODE(original_stat.st_mode))
        os.chown(temporary, original_stat.st_uid, original_stat.st_gid)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def promote() -> None:
    actual, updated, state = checks()
    if state == "already":
        verify_https()
        print("ADS_DEMO_HTTPS=PASS (existing portal proxy configuration is already active)")
        return
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    # Preserve an exact copy of the old Nginx site; the retail source files are untouched.
    backup_dir = BACKUP_ROOT / (now + "-" + str(os.getpid()))
    backup_dir.mkdir(parents=True, mode=0o700, exist_ok=False)
    backup = backup_dir / "demo.africadigitalsynergy.com"
    shutil.copy2(actual, backup)
    backup.chmod(0o600)
    print("Original Nginx site backed up at:", backup, flush=True)
    try:
        atomic_replace(actual, updated)
        run("nginx", "-t")
        run("systemctl", "reload", "nginx")
        verify_https()
    except Exception:
        print("Cutover validation failed; restoring original Nginx configuration.", file=sys.stderr)
        atomic_replace(actual, backup.read_text())
        try:
            run("nginx", "-t")
            run("systemctl", "reload", "nginx")
        except Exception as error:
            print("RESTORE REQUIRES ATTENTION:", str(error), file=sys.stderr)
        raise
    print("ADS_DEMO_HTTPS=PASS")
    print("Public hostname (DNS separately required): https://" + HOST)
    print("Existing retail static files preserved at /root/retail-sync-io/dist")
    print("Original Nginx configuration backup:", backup)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true", help="Read-only checks for existing site, certificate, portal and proposed change")
    group.add_argument("--apply", action="store_true", help="Back up old site, apply portal proxy, validate and automatically roll back on failure")
    args = parser.parse_args()
    try:
        if args.check:
            _, _, state = checks()
            print("ADS_DEMO_NGINX_PREFLIGHT=PASS")
            print("Existing site state:", state)
            print("Ready for controlled cutover to", PORTAL)
        else:
            promote()
        return 0
    except (SafetyError, OSError, subprocess.CalledProcessError) as error:
        print("ADS_DEMO_NGINX_ERROR:", str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

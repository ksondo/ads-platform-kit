#!/usr/bin/env python3
"""One GitHub-dispatched, fail-closed Contabo DEMO app-only release.

GitHub passes this reviewed script over SSH/stdin. Contabo itself clones each
product's PRIVATE repository at an exact merged SHA. No credentials, SQL,
migrations, grant changes, volume mutations, or portal activation are sent.
"""
import argparse
import base64
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import tempfile
import stat
import subprocess
import sys
import time

CONFIG = Path("/etc/ads-demo/batch-release-host.json")
APPROVAL = Path("/etc/ads-demo/batch-release-approval.json")
STAGING = Path("/var/lib/ads-demo/batch-release-sources")
ENV_BACKUPS = Path("/var/lib/ads-demo/batch-release-env-backups")
LOCK = Path("/var/lock/ads-five-demo-release.lock")
SECURE_DIRS = ("/etc/ads-demo/", "/var/lib/ads-demo/operator-secrets/")
SHA = re.compile(r"^[0-9a-f]{40}$")
ID = re.compile(r"^[a-z][a-z0-9-]{2,32}$")
PROJECT = re.compile(r"^[a-z0-9][a-z0-9_-]{2,70}$")
RELEASE = re.compile(r"^ads-[a-z0-9-]{8,80}$")
REPOS = {
    "education": "ksondo/Education-and-intelligent-services",
    "agriculture": "ksondo/Agriculture",
    "fleet-guard": "ksondo/Fleet-guard-and-intelligent-services",
    "tontine": "ksondo/Digital-tontine-and-intelligent-services",
    "portal": "ksondo/ads-platform-kit",
}
GATES = (
    "operator_go", "independent_security_review", "ux_accessibility_acceptance",
    "source_ci_and_pin_review", "protected_backups_and_isolated_restore",
    "deployed_identity_and_tls_review", "rollback_plan_verified",
    "portal_owner_controller_coordinated",
)

class Stop(Exception):
    pass

def require(ok, why):
    if not ok:
        raise Stop(why)

def note(message):
    print("ADS_BATCH: " + message, flush=True)

def command(args, *, env=None, timeout=360):
    try:
        r = subprocess.run(args, env=env, text=True, stdout=subprocess.PIPE,
                           stderr=subprocess.PIPE, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired) as e:
        raise Stop("Command unavailable or timed out: " + str(args[0])) from None
    # Never print command arguments/env/stdout/stderr. Compose output can contain secrets.
    require(r.returncode == 0, "Command failed: " + str(args[0]) +
            " (exit " + str(r.returncode) + ")")
    return r.stdout.strip()

def protected_json(path):
    require(path.is_absolute() and not path.is_symlink() and path.is_file(),
            "Missing protected operator file: " + str(path))
    st = path.stat()
    require(st.st_uid == 0 and stat.S_IMODE(st.st_mode) & 0o077 == 0,
            "Operator file must be root-owned and mode 0600: " + str(path))
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, UnicodeError):
        raise Stop("Invalid protected JSON: " + str(path)) from None

def manifest_from_arg(encoded):
    try:
        raw = base64.b64decode(encoded, validate=True)
        m = json.loads(raw)
    except (ValueError, TypeError):
        raise Stop("Invalid GitHub pinned manifest") from None
    require(m.get("version") == 1 and m.get("environment") == "demo" and
            m.get("host") == "vmi3191089" and RELEASE.fullmatch(m.get("release_id", "")),
            "Unknown release, host or environment")
    products = m.get("services", [])
    require(isinstance(products, list) and len(products) == 5 and
            [p.get("id") for p in products] ==
            ["education", "agriculture", "fleet-guard", "tontine", "portal"],
            "Release must cover exactly the four applications followed by portal")
    for p in products:
        key = p["id"]
        require(p.get("repo") == REPOS[key] and SHA.fullmatch(p.get("sha", "")),
                "Untrusted repository or missing immutable SHA: " + key)
        require(ID.fullmatch(key) and p.get("service") and p.get("image_env"),
                "Invalid service contract")
        require(p.get("host") == ("demo.africadigitalsynergy.com" if key == "portal"
                 else ("fleetguard" if key == "fleet-guard" else
                       ("tontine" if key == "tontine" else key)) +
                       ".demo.africadigitalsynergy.com"),
                "Unexpected HTTPS host: " + key)
        for path_key in ("dockerfile", "compose", "tools_dockerfile"):
            if path_key in p:
                path = p[path_key]
                require(isinstance(path, str) and re.fullmatch(r"[a-zA-Z0-9._/-]+", path)
                        and ".." not in Path(path).parts and not path.startswith("/"),
                        "Unsafe repository file path")
    return m, hashlib.sha256(raw).hexdigest()

def approval_check(m, digest):
    a = protected_json(APPROVAL)
    require(a.get("release_id") == m["release_id"] and
            a.get("manifest_sha256") == digest,
            "Approval not bound to the exact five-SHA manifest; use preflight digest")
    require(a.get("source_shas") ==
            {s["id"]: s["sha"] for s in m["services"]},
            "Approval does not match all five source SHAs")
    for key in GATES:
        require(a.get("gates", {}).get(key) is True,
                "Missing explicit operator/reviewer approval gate: " + key)
    evidence = a.get("evidence", {})
    require(isinstance(evidence, dict) and
            all(isinstance(evidence.get(k), str) and len(evidence[k]) >= 8
                for k in ("backup_restore_record", "security_review",
                          "ux_review", "identity_tls_review", "owner_release_go")),
            "Approval must cite recorded operator/reviewer evidence (no secrets)")
    note("OPERATOR_APPROVAL=PASS exact-manifest review attestations present")

def config_for(m):
    cfg = protected_json(CONFIG)
    require(cfg.get("host") == "vmi3191089" and cfg.get("environment") == "demo",
            "Operator config points to wrong server/environment")
    services = cfg.get("services")
    require(isinstance(services, dict) and set(services) == set(REPOS),
            "Host config requires exactly the four products and portal")
    out = {}
    for p in m["services"]:
        key, item = p["id"], services[p["id"]]
        project, port = item.get("project"), item.get("port")
        require(isinstance(project, str) and PROJECT.fullmatch(project),
                "Invalid or missing live Docker Compose project: " + key)
        require(isinstance(port, int) and 1024 <= port <= 65535,
                "Invalid live loopback port: " + key)
        fixed = p.get("documented_port")
        require(fixed is None or fixed == port,
                "Documented live port mismatch for " + key +
                "; inspect server before modifying upstream")
        env_file = Path(item.get("env_file", ""))
        require(env_file.is_absolute() and
                any(str(env_file).startswith(prefix) for prefix in SECURE_DIRS),
                "Operator env file must be outside repository: " + key)
        protected_json_env(env_file)
        require(type(item.get("private_visitor_enabled", False)) is bool,
                "private_visitor_enabled must be boolean")
        out[key] = dict(item)
    for p in m["services"]:
        envpath = Path(out[p["id"]]["env_file"])
        source = envpath.read_text(encoding="utf-8")
        for key in image_values(p):
            require(len(re.findall(r"(?m)^" + re.escape(key) + r"=.*$", source)) == 1,
                    "Protected operator env needs exactly one image tag field: " + p["id"] + "/" + key)
        # A running private-visitor grant must never silently lose its paired seed worker.
        access_var = {"agriculture": "AGRI_DEMO_ACCESS", "fleet-guard": "FLEET_DEMO_ACCESS",
                      "tontine": "TONTINE_DEMO_ACCESS"}.get(p["id"])
        if access_var:
            enabled = re.search(r"(?m)^" + access_var + r"=1$", source) is not None
            require(enabled == out[p["id"]]["private_visitor_enabled"],
                    "Private visitor flag/worker mismatch for " + p["id"])
    require(len({s["project"] for s in out.values()}) == 5,
            "Compose projects must remain isolated")
    require(len({s["port"] for s in out.values()}) == 5,
            "Product host loopback ports must be distinct")
    return out

def protected_json_env(path):
    require(path.is_file() and not path.is_symlink(), "Missing protected env file: " + str(path))
    st = path.stat()
    require(st.st_uid == 0 and (stat.S_IMODE(st.st_mode) & 0o077) == 0,
            "Operator env must be root-owned and 0600: " + str(path))

def stage_source(p, release_id):
    # Host uses its own read-only GitHub deploy keys. No private token is copied
    # from the Actions runner to the VPS.
    folder = STAGING / release_id / p["id"]
    repo_url = "git@github.com:" + p["repo"] + ".git"
    folder.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fresh = not folder.exists()
    if fresh:
        command(["git", "clone", "--quiet", "--no-checkout", repo_url, str(folder)], timeout=240)
    require((folder / ".git").is_dir(), "Untrusted staged Git directory: " + p["id"])
    require(command(["git", "-C", str(folder), "remote", "get-url", "origin"]) == repo_url,
            "Git origin changed: " + p["id"])
    command(["git", "-C", str(folder), "fetch", "--quiet", "--no-tags", "origin", "main"], timeout=240)
    command(["git", "-C", str(folder), "merge-base", "--is-ancestor", p["sha"], "origin/main"])
    current = command(["git", "-C", str(folder), "rev-parse", "HEAD"])
    if fresh or current != p["sha"]:
        if not fresh:
            require(not command(["git", "-C", str(folder), "status", "--porcelain"]),
                    "Staged repository contains local changes: " + p["id"])
        command(["git", "-C", str(folder), "checkout", "--quiet", "--detach", p["sha"]])
    else:
        require(not command(["git", "-C", str(folder), "status", "--porcelain"]),
                "Staged repository must remain immutable: " + p["id"])
    require(command(["git", "-C", str(folder), "rev-parse", "HEAD"]) == p["sha"],
            "Source commit not pinned: " + p["id"])
    require((folder / p["dockerfile"]).is_file() and
            (folder / (p.get("compose") or "deploy/demo/compose.yml")).is_file(),
            "Approved product build/Compose source missing: " + p["id"])
    if p.get("tools_dockerfile"):
        require((folder / p["tools_dockerfile"]).is_file(),
                "Approved Tontine tools Dockerfile missing")
    note("GIT_PIN=PASS " + p["id"] + " " + p["sha"][:12])
    return folder

def running_service(project, service):
    ids = command(["docker", "ps", "-q",
                   "--filter", "label=com.docker.compose.project=" + project,
                   "--filter", "label=com.docker.compose.service=" + service]).splitlines()
    require(len(ids) <= 1, "Multiple active containers for one service: " + service)
    return ids[0] if ids else None

def compose_args(p, cfg, folder):
    path = folder / (p.get("compose") or "deploy/demo/compose.yml")
    return ["docker", "compose", "--project-name", cfg["project"], "--env-file",
            cfg["env_file"], "-f", str(path)]

def candidate_image(p):
    return "local/ads-batch-" + p["id"] + ":sha-" + p["sha"]

def image_values(p):
    result = {p["image_env"]: candidate_image(p)}
    if p.get("tools_image_env"):
        result[p["tools_image_env"]] = candidate_image(p) + "-tools"
    return result

def image_env(p):
    env = os.environ.copy()
    env.update(image_values(p))
    return env

def compose_preflight(p, cfg, folder):
    out = command(compose_args(p, cfg, folder) + ["config", "--format", "json"],
                  env=image_env(p))
    try:
        services = json.loads(out)["services"]
    except (ValueError, KeyError):
        raise Stop("Unable to parse Compose service config: " + p["id"]) from None
    require(p["service"] in services, "Main service missing in Compose: " + p["id"])
    require("db" in services or p["id"] == "portal",
            "Expected isolated database service not declared: " + p["id"])
    ports = services[p["service"]].get("ports", [])
    require(any(str(x.get("published")) == str(cfg["port"]) and
                x.get("host_ip") == "127.0.0.1" for x in ports),
            "Public app must bind ONLY its documented 127.0.0.1 port: " + p["id"])
    require(all(x.get("host_ip") == "127.0.0.1" for x in ports),
            "Unexpected exposed product port: " + p["id"])
    if p.get("worker"):
        worker = services.get(p["worker"])
        require(worker is not None and not worker.get("ports"),
                "Privileged worker must never expose any host ports: " + p["id"])
        require("private" in worker.get("networks", {}),
                "Privileged worker missing private network: " + p["id"])
    # A batch update never initializes the database, migrations or DNS.
    if p["id"] != "portal":
        require(running_service(cfg["project"], "db"),
                "Existing DB container not found; use the app's first-install runbook: " + p["id"])
    require(running_service(cfg["project"], p["service"]),
            "Existing application container not found; initial install requires separate review: " + p["id"])
    note("COMPOSE_ISOLATION=PASS " + p["id"] + " port=" + str(cfg["port"]))

def build_image(p, folder):
    image = candidate_image(p)
    command(["docker", "build", "--quiet", "--file", str(folder / p["dockerfile"]),
             "--tag", image, str(folder)], timeout=1800)
    if p.get("tools_dockerfile"):
        command(["docker", "build", "--quiet", "--file", str(folder / p["tools_dockerfile"]),
                 "--build-arg", "API_IMAGE=" + image, "--tag", image + "-tools", str(folder)],
                timeout=1800)
    note("IMAGE_BUILD=PASS " + p["id"] + " " + p["sha"][:12])

def smoke(p, cfg):
    url = "http://127.0.0.1:" + str(cfg["port"]) + ("/" if p["id"] == "portal" else "/health")
    for i in range(20):
        try:
            command(["curl", "--noproxy", "*", "--fail", "--silent",
                     "--max-time", "5", "--output", "/dev/null", url], timeout=10)
            note("LOCAL_HEALTH=PASS " + p["id"])
            break
        except Stop:
            time.sleep(3)
    else:
        raise Stop("New container failed local health check: " + p["id"])
    # Verify actual public HTTPS and certificate, never -k/--insecure. This is
    # HTTP reachability only: signed visitor/SSO acceptance is still manual.
    hosted = "https://" + p["host"] + ("/platforms" if p["id"] == "portal" else "/health")
    for i in range(8):
        try:
            command(["curl", "--noproxy", "*", "--fail", "--silent",
                     "--max-time", "10", "--output", "/dev/null", hosted], timeout=15)
            note("PUBLIC_HTTPS=PASS " + p["id"])
            break
        except Stop:
            time.sleep(4)
    else:
        raise Stop("New service cannot be verified over public HTTPS: " + p["id"])

def deploy_one(p, cfg, folder, changes):
    args = compose_args(p, cfg, folder)
    env = image_env(p)
    service_list = []
    if p.get("worker") and cfg["private_visitor_enabled"]:
        service_list.append(p["worker"])
    service_list.append(p["service"])
    for service in service_list:
        cid = running_service(cfg["project"], service)
        require(cid, "Missing existing container for update: " + p["id"] + "/" + service)
        old_image = command(["docker", "inspect", "--format", "{{.Image}}", cid])
        require(old_image.startswith("sha256:"), "Old image digest unavailable")
        changes.append((p, cfg, folder, service, old_image))
        command(args + (["--profile", "private-visitor"] if service != p["service"] else []) +
                ["up", "--detach", "--no-deps", "--force-recreate", service],
                env=env, timeout=180)
    smoke(p, cfg)

def persist_env_tags(p, cfg, release_id, changed):
    """After all app health checks, persist only exact image tag fields.

    Operator env is backed up first, never printed, never committed, and remains
    owned by root with 0600. Unexpected or duplicated keys stop the release.
    """
    path = Path(cfg["env_file"])
    old = path.read_text(encoding="utf-8")
    updated = old
    for key, value in image_values(p).items():
        pattern = r"(?m)^" + re.escape(key) + r"=.*$"
        require(len(re.findall(pattern, updated)) == 1,
                "Cannot safely persist image key " + p["id"] + "/" + key)
        updated = re.sub(pattern, lambda _: key + "=" + value, updated)
    if old == updated:
        note("PERSISTED_IMAGE=ALREADY_CURRENT " + p["id"])
        return
    folder = ENV_BACKUPS / release_id
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    backup = folder / (p["id"] + ".env.before")
    require(not backup.exists(), "Refusing to overwrite protected old env backup: " + p["id"])
    shutil.copy2(path, backup)
    backup.chmod(0o600)
    changed.append((path, backup))
    fd, temporary = tempfile.mkstemp(prefix=".ads-batch-image-", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(updated)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    note("PERSISTED_IMAGE=PASS " + p["id"])

def rollback_env(changed):
    for path, backup in reversed(changed):
        try:
            shutil.copy2(backup, path)
            path.chmod(0o600)
            note("ROLLBACK_ENV=PASS " + path.name)
        except OSError:
            note("ROLLBACK_ENV=NEEDS_OPERATOR " + path.name)

def rollback(changes):
    note("STOP: application-only rollback attempted; databases and Identity untouched")
    for p, cfg, folder, service, old in reversed(changes):
        env = image_env(p)
        env[p["image_env"]] = old if service == p["service"] else candidate_image(p)
        if service != p["service"] and p.get("tools_image_env"):
            env[p["tools_image_env"]] = old
        elif service != p["service"]:
            env[p["image_env"]] = old
        try:
            command(compose_args(p, cfg, folder) +
                    (["--profile", "private-visitor"] if service != p["service"] else []) +
                    ["up", "--detach", "--no-deps", "--force-recreate", service], env=env, timeout=180)
            note("ROLLBACK_IMAGE=PASS " + p["id"] + "/" + service)
        except Stop:
            note("ROLLBACK_IMAGE=NEEDS_OPERATOR " + p["id"] + "/" + service)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["preflight", "deploy", "self-check"], required=True)
    parser.add_argument("--manifest-b64", required=True)
    args = parser.parse_args()
    m, digest = manifest_from_arg(args.manifest_b64)
    note("MANIFEST_SHA256=" + digest)
    for p in m["services"]:
        note("SOURCE_PIN " + p["id"] + "=" + p["sha"])
    if args.mode == "self-check":
        note("MANIFEST=VALID; no host access or deployment")
        return
    require(os.geteuid() == 0, "Host runner requires root/sudo")
    require(socket.gethostname().split(".")[0] == m["host"], "Wrong Contabo host")
    STAGING.mkdir(parents=True, exist_ok=True, mode=0o700)
    with LOCK.open("w") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Stop("Another ADS five-service release is already running") from None
        command(["docker", "info", "--format", "{{.ServerVersion}}"])
        command(["docker", "compose", "version"])
        command(["nginx", "-t"])
        host = config_for(m)
        require(os.statvfs("/var/lib/docker").f_bavail *
                os.statvfs("/var/lib/docker").f_frsize > 4_000_000_000,
                "Less than 4 GB free in Docker storage")
        folder = {p["id"]: stage_source(p, m["release_id"]) for p in m["services"]}
        for p in m["services"]:
            compose_preflight(p, host[p["id"]], folder[p["id"]])
        note("STAGING_PREFLIGHT=PASS; no existing application or data changed")
        if args.mode == "preflight":
            note("NEXT: complete independent reviews, protected backups and restore, then "
                 "write operator approval tied to MANIFEST_SHA256 before deploy")
            return
        approval_check(m, digest)
        # Build all five pinned candidate images before touching any running service.
        for p in m["services"]:
            build_image(p, folder[p["id"]])
        changes, changed_env = [], []
        try:
            for p in m["services"]:
                deploy_one(p, host[p["id"]], folder[p["id"]], changes)
            for p in m["services"]:
                persist_env_tags(p, host[p["id"]], m["release_id"], changed_env)
        except (Stop, OSError):
            rollback_env(changed_env)
            rollback(changes)
            raise
        note("APP_IMAGES_UPDATED=PASS 5 services; verify hosted Identity, EN/FR and "
             "two-visitor isolation before activating any portal link")
        note("NO_DB_MIGRATIONS_NO_RESET_NO_IDENTITY_CHANGES_NO_PUBLIC_DEMO_ACTIVATION")

if __name__ == "__main__":
    try:
        main()
    except (Stop, OSError, KeyError, TypeError) as err:
        print("ADS_BATCH_STOP: " + str(err), file=sys.stderr, flush=True)
        sys.exit(1)

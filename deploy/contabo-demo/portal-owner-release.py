#!/usr/bin/env python3
"""ADS platform-kit owner-repo manual candidate portal promotion on Contabo.

Executed only by an authorized operator on vmi3191089 with explicit apply flag;
retains the existing Commerce+Opportunities read-only release gate for parity.
No OAuth credentials, Nginx, identity, Commerce databases or other services are
changed. The existing hosted kit Git checkout is read-only except for fetch.
A green image-publication workflow creates ads-demo-portal-approved/<SHA>.
Only that exact SHA is eligible; subsequent hourly runs are idempotent.
"""
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time

HOST = "vmi3191089"
REPO = Path("/opt/ads/demo-platform-kit")
IMAGES_ENV = Path("/etc/ads-demo/images.env")
STAGES = Path("/var/lib/ads-demo/portal-release-candidates")
BACKUPS = Path("/var/backups/ads-demo-portal")
MARKER = Path("/var/lib/ads-demo/ads-demo-portal-deployed-sha")
PORTAL = "https://demo.africadigitalsynergy.com"
COMMERCE = "https://commerce.demo.africadigitalsynergy.com"
OIDC = "https://login.demo.africadigitalsynergy.com"
PORT = "18089"
COMPOSE = "deploy/contabo-demo/compose.portal.yml"

EXPECTED = {
    "commerce": COMMERCE + "/commerce",
    "ecommerce": COMMERCE + "/commerce",
    "pos": COMMERCE + "/commerce/merchant/pos",
}


class Gate(Exception):
    pass


def require(cond, message):
    if not cond:
        raise Gate(message)


def run(*args, env=None, capture=True, input=None):
    try:
        result = subprocess.run(args, env=env, input=input, check=True,
                                stdout=subprocess.PIPE if capture else None,
                                stderr=subprocess.PIPE)
    except subprocess.CalledProcessError as err:
        # Never disclose passwords/environment fields from subprocess errors.
        raise Gate("Portal command failed: " + str(args[0]) +
                   ", exit=" + str(err.returncode)) from None
    return result.stdout.decode("utf-8", "replace") if capture else ""


def log(message):
    print("ADS_PORTAL_AUTO: " + message, flush=True)


def port_and_service():
    require(run("docker", "inspect", "-f", "{{.State.Running}}",
                "ads-demo-portal").strip() == "true", "Portal container is not running")
    require(run("docker", "port", "ads-demo-portal", "80/tcp").strip() ==
            "127.0.0.1:" + PORT, "Existing portal is not bound only to localhost:18089")


def commerce_ready():
    data = json.loads(run("curl", "--noproxy", "*", "-fsS", "--max-time", "10",
                          COMMERCE + "/api/ready"))
    require(data.get("status") == "ready_for_internal_checks",
            "Commerce demo API is not ready")
    records = json.loads(run("curl", "--noproxy", "*", "-fsS", "--max-time", "10",
                             COMMERCE + "/api/v1/public/commerce/catalogue?limit=40")).get("products")
    require(isinstance(records, list), "Commerce demo catalogue missing")
    # Do not activate a supposedly working demo until the seeded shops are
    # available. This is independent of the user's live sign-in acceptance.
    require(sum("Mokolo" in p.get("shopName", "") for p in records) >= 5 and
            sum("Bastos" in p.get("shopName", "") for p in records) >= 3,
            "Commerce seed not public yet")
    issuer = json.loads(run("curl", "--noproxy", "*", "-fsS", "--max-time", "10",
                            OIDC + "/.well-known/openid-configuration"))
    require(issuer.get("issuer") == OIDC, "ADS demo sign-in issuer changed")


def public_portal_links():
    records = json.loads(run("curl", "--noproxy", "*", "-fsS", "--max-time", "10",
                             PORTAL + "/catalogue.json"))
    urls = {x["id"]: x.get("demoUrl") for x in records.get("platforms", []) +
            records.get("tools", []) if isinstance(x, dict) and "id" in x}
    require(all(urls.get(key) == value for key, value in EXPECTED.items()),
            "Portal public catalogue still has disabled or incorrect Commerce demo URLs")
    require(all(urls.get(key) is None for key in ("bnpl", "inventory", "storefront")),
            "An unverified Commerce tool was exposed")
    app = run("curl", "--noproxy", "*", "-fsS", "--max-time", "10", PORTAL + "/main.js")
    require('function launch(' in app and
            'target="_blank"' in app[app.index("function launch("):app.index("function header(")] and
            'rel="noopener noreferrer"' in app[app.index("function launch("):app.index("function header(")],
            "Portal launch must open a separate, opener-isolated platform tab")
    run("curl", "--noproxy", "*", "-fsS", "--max-time", "10",
        "-o", "/dev/null", PORTAL + "/platforms/commerce")
    if 'import * as ADSOpportunities from "./opportunities-v2.js"' in app:
        opportunities_api_ready()


def opportunities_api_ready():
    """Public read-side gate for the DB-backed Business Opportunities release.

    The site continues serving its old portal until this independently hosted
    HTTPS API is available and has all expected v1 seed rows. No DB mutation.
    """
    def fetch(path):
        return json.loads(run("curl", "--noproxy", "*", "-fsS", "--max-time", "12",
                              PORTAL + "/api/opportunities/v1" + path))

    sectors = fetch("/sectors")
    require(sectors.get("total") == 50, "Opportunities: expected 50 sector categories")
    mappings = fetch("/opportunities?limit=1")
    require(mappings.get("total") == 333,
            "Opportunities: expected 333 sector-to-tool mappings")
    categories_business = fetch("/discovery/categories?family=business")
    categories_institutional = fetch("/discovery/categories?family=institutional")
    require(categories_business.get("total") == 13 and
            categories_institutional.get("total") == 8,
            "Opportunities: expected 13+8 discovery categories")
    business = fetch("/discovery/solutions?family=business&limit=1")
    institutional = fetch("/discovery/solutions?family=institutional&limit=1")
    require(business.get("total") == 102 and institutional.get("total") == 20,
            "Opportunities: expected 102+20 solution summaries")
    log("OPPORTUNITIES_API=PASS 50 sectors / 333 tools / 21 categories / 122 solutions")


def approved_source():
    remote = run("git", "-C", str(REPO), "remote", "get-url", "origin").strip()
    require(remote in ("git@github.com:ksondo/ads-platform-kit.git",
                       "git@github.com:ksondo/ads-platform-kit",
                       "https://github.com/ksondo/ads-platform-kit.git"),
            "Unrecognized ADS kit checkout remote")
    run("git", "-C", str(REPO), "fetch", "--no-tags", "origin", "main")
    tags = run("git", "-C", str(REPO), "ls-remote", "--tags", "origin",
               "refs/tags/ads-demo-portal-approved/*").splitlines()
    approved = set()
    for line in tags:
        sha, ref = line.split()
        suffix = ref.rsplit("/", 1)[-1]
        if re.fullmatch("[a-f0-9]{40}", suffix) and sha == suffix:
            approved.add(suffix)
    if not approved:
        return None
    # A future docs-only commit does not invalidate a prior green portal SHA.
    ancestry = run("git", "-C", str(REPO), "rev-list",
                   "--first-parent", "origin/main").splitlines()
    return next((sha for sha in ancestry if sha in approved), None)


def stage_at(sha):
    STAGES.mkdir(parents=True, exist_ok=True)
    stage = STAGES / sha
    if not stage.exists():
        stage.mkdir(mode=0o700)
        tar = subprocess.Popen(["git", "-C", str(REPO), "archive", sha],
                               stdout=subprocess.PIPE)
        try:
            result = subprocess.run(["tar", "-xf", "-", "-C", str(stage)],
                                    stdin=tar.stdout, check=False)
            tar.stdout.close()
            require(result.returncode == 0 and tar.wait() == 0,
                    "Failed to stage exact approved kit commit")
        finally:
            if tar.poll() is None:
                tar.kill()
                tar.wait()
    require((stage / "apps/demo-portal/catalogue.json").is_file() and
            (stage / "apps/demo-portal/main.js").is_file() and
            (stage / COMPOSE).is_file(), "Approved portal sources incomplete")
    d = json.loads((stage / "apps/demo-portal/catalogue.json").read_text())
    urls = {x["id"]: x.get("demoUrl") for x in d["platforms"] + d["tools"]}
    require(all(urls.get(k) == v for k, v in EXPECTED.items()),
            "Approved portal code lacks integrated Commerce links")
    run("node", "--test", *map(str, sorted(
        (stage / "apps/demo-portal/tests").glob("*.test.mjs"))))
    log("PORTAL_SOURCE_AND_TESTS=PASS sha=" + sha)
    return stage


def get_image(sha, stage, token):
    image = "ghcr.io/ksondo/ads-demo-portal:sha-" + sha
    authdir = tempfile.mkdtemp(prefix="ads-portal-ghcr-")
    try:
        if token:
            try:
                run("docker", "--config", authdir, "login", "ghcr.io",
                    "-u", "ksondo", "--password-stdin", input=token.encode())
                run("docker", "--config", authdir, "pull", image)
                log("APPROVED_PORTAL_IMAGE=GHCR")
                return image
            except Gate:
                log("PORTAL_GHCR_UNAVAILABLE; BUILDING_APPROVED_SHA_LOCALLY")
    finally:
        shutil.rmtree(authdir, ignore_errors=True)
    # Exact git SHA; no latest/main tags, deployment source already unit-tested.
    run("docker", "build", "--file", str(stage / "apps/demo-portal/Dockerfile"),
        "--tag", image, str(stage))
    return image


def canary(image):
    name = "ads-demo-portal-candidate-" + str(os.getpid())
    run("docker", "run", "-d", "--name", name, "--security-opt",
        "no-new-privileges:true", image)
    try:
        for i in range(20):
            try:
                body = run("docker", "exec", name, "wget", "-qO-",
                           "http://127.0.0.1/")
                config = json.loads(run("docker", "exec", name, "cat",
                                        "/usr/share/nginx/html/catalogue.json"))
                urls = {x["id"]: x.get("demoUrl") for x in
                        config["platforms"] + config["tools"]}
                if "ADS Digital Ecosystem" in body and all(
                        urls.get(key) == value for key, value in EXPECTED.items()):
                    log("PORTAL_CANDIDATE=PASS")
                    return
            except (Gate, ValueError, KeyError):
                pass
            time.sleep(1)
        raise Gate("Portal canary failed; original portal remains intact")
    finally:
        run("docker", "rm", "-f", name)


def compose(stage, image):
    env = os.environ.copy()
    env["ADS_PORTAL_IMAGE"] = image
    return run("docker", "compose", "--project-name", "ads-demo-portal",
               "--env-file", str(IMAGES_ENV), "-f", str(stage / COMPOSE),
               "up", "-d", "--no-deps", "--force-recreate", "portal", env=env)


def update_images_env(image, sha):
    current = IMAGES_ENV.read_text()
    require(current.count("ADS_PORTAL_IMAGE=") == 1,
            "Portal image config missing or duplicate; refusing write")
    timestamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    BACKUPS.mkdir(mode=0o700, parents=True, exist_ok=True)
    archive = BACKUPS / ("images.env.before-" + timestamp + "-" + sha[:10])
    require(not archive.exists(), "Portal config backup already exists")
    shutil.copy2(IMAGES_ENV, archive)
    archive.chmod(0o600)
    out = re.sub(r"^ADS_PORTAL_IMAGE=.*$", "ADS_PORTAL_IMAGE=" + image,
                 current, count=1, flags=re.MULTILINE)
    fd, name = tempfile.mkstemp(dir=IMAGES_ENV.parent, prefix=".ads-images-env-")
    try:
        with os.fdopen(fd, "w") as stream:
            stream.write(out)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(name, 0o600)
        os.replace(name, IMAGES_ENV)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def main():
    require(os.geteuid() == 0, "Root-owned Software Factory release controller is required")
    require(socket.gethostname().split(".")[0] == HOST, "Wrong Contabo host")
    require(REPO.is_dir() and IMAGES_ENV.is_file(), "Installed ADS portal kit/config missing")
    with open("/var/lock/ads-demo-portal-release.lock", "w") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Gate("Another portal release is in progress")
        port_and_service()
        sha = approved_source()
        if sha is None:
            log("WAITING_FOR_APPROVED_PORTAL_TAG; no changes made")
            return
        if MARKER.is_file() and MARKER.read_text().strip() == sha:
            public_portal_links()
            log("ADS_PORTAL_LINKS=PASS ALREADY_DEPLOYED=" + sha)
            return
        # Do not link unseeded Commerce to the public portal. A missing demo
        # catalogue must not mutate the existing main landing page.
        try:
            commerce_ready()
        except (Gate, ValueError):
            log("WAITING_FOR_COMMERCE_DATA_AND_IDENTITY; portal unchanged")
            return
        require(shutil.disk_usage("/var/lib/docker").free >= 500_000_000,
                "Not enough Docker storage for the new portal image")
        stage = stage_at(sha)
        # New Business Opportunities UI requires a separate read-only database
        # API. Never promote a portal requiring that API before it is live.
        source = (stage / "apps/demo-portal/main.js").read_text()
        if 'import * as ADSOpportunities from "./opportunities-v2.js"' in source:
            try:
                opportunities_api_ready()
            except (Gate, ValueError, KeyError, json.JSONDecodeError):
                log("WAITING_FOR_OPPORTUNITIES_DATABASE_AND_API; portal unchanged")
                return
        token = sys.stdin.readline().rstrip("\n")
        image = get_image(sha, stage, token)
        canary(image)
        old = run("docker", "inspect", "-f", "{{.Config.Image}}",
                  "ads-demo-portal").strip()
        try:
            compose(stage, image)
            for i in range(15):
                try:
                    port_and_service()
                    public_portal_links()
                    break
                except (Gate, ValueError):
                    if i == 14:
                        raise
                    time.sleep(2)
        except Exception:
            log("PORTAL_SMOKE_FAILED; rolling back ONLY portal container")
            compose(stage, old)
            raise
        update_images_env(image, sha)
        MARKER.parent.mkdir(parents=True, exist_ok=True)
        MARKER.write_text(sha + "\n")
        MARKER.chmod(0o600)
        log("ADS_PORTAL_LINKS=PASS SHA=" + sha)


if __name__ == "__main__":
    if sys.argv[1:] != ["--apply-approved-demo-portal"]:
        print("Refusing to publish portal without --apply-approved-demo-portal", file=sys.stderr)
        sys.exit(2)
    try:
        main()
    except (Gate, OSError, ValueError, KeyError, json.JSONDecodeError) as e:
        print("::error title=ADS Portal automated publication::" + str(e),
              file=sys.stderr)
        sys.exit(1)

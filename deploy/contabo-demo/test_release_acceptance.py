"""Static and dry-run checks for release-acceptance.sh and register-identity-client.sh.

No Docker, network or host access: fake `docker` and `curl` executables are put first on PATH and answer
from a JSON fixture. Run: python3 -m unittest discover -s deploy/contabo-demo -p 'test_release_acceptance.py'
"""
import copy
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent.parent
ACCEPT = ROOT / "release-acceptance.sh"
REGISTER = ROOT / "register-identity-client.sh"
MANIFEST_FILE = "ads-release-20261111b.manifest.json"
MANIFEST = json.loads((ROOT / MANIFEST_FILE).read_text())
CLIENTS_TEXT = (REPO / "config/clients.demo.json").read_text()
CLIENTS = {c["client_id"]: c for c in json.loads(CLIENTS_TEXT)["products"]}
SERVICE_CLIENTS = {c["client_id"]: c for c in json.loads(CLIENTS_TEXT).get("service_clients", [])}
SECTOR_SERVICE_CLIENTS = ["agriculture-sector-service", "commerce-sector-service"]
ISSUER = "https://login.demo.africadigitalsynergy.com"
SECRET = "do-not-print-" + "s" * 40
TONTINE_TEST_SHA = "a" * 40
TOURISM_MANIFEST_FILE = "ads-release-20261113-tourism.manifest.json"
TOURISM_MANIFEST = json.loads((ROOT / TOURISM_MANIFEST_FILE).read_text())
TOURISM_SHA = "ca8d3901e242125d5b9f6de927854a1444a5927d"
SIX = ["commerce", "education", "agriculture", "fleet-guard", "digital-tontine", "ventureworks"]

FAKE_DOCKER = r'''#!/usr/bin/env python3
import json, os, subprocess, sys
state_file = os.environ["FAKE_STATE"]
st = json.load(open(state_file))
with open(os.environ["FAKE_LOG"], "a") as log:
    log.write(json.dumps(["docker"] + sys.argv[1:]) + "\n")
a = sys.argv[1:]
def save(): json.dump(st, open(state_file, "w"))
if a[0] == "inspect":
    tpl, name = a[2], a[3]
    c = st["containers"].get(name)
    if c is None: sys.exit(1)
    if "State.Running" in tpl: print("true" if c.get("running", True) else "false")
    elif "Config.Image" in tpl: print(c.get("image", ""))
    elif "revision" in tpl: print(c.get("revision", ""))
    elif "Health" in tpl: print(c.get("health", "running"))
    sys.exit(0)
if a[0] == "exec":
    a = a[1:]
    if a[0] == "-i": a = a[1:]
    name, cmd = a[0], a[1:]
    c = st["containers"].get(name)
    if c is None or not c.get("running", True): sys.exit(1)
    if cmd[0] == "cat":
        f = c.get("files", {}).get(cmd[1])
        if f is None: sys.exit(1)
        sys.stdout.write(f); sys.exit(0)
    if cmd[0] == "sh" and cmd[1] == "-c":
        env = {"PATH": "/usr/bin:/bin", **c.get("env", {})}
        sys.exit(subprocess.run(["sh", "-c", cmd[2]], env=env).returncode)
    if cmd[0] == "node" and cmd[1] == "-e":
        env = c.get("env", {})
        sys.exit(0 if env.get("ADS_ENV") == "demo" and env.get("DEMO_MODE") == "1" else 2)
    if cmd[0] == "find":
        sys.stdout.write(c.get("unreadable", "")); sys.exit(0)
    if cmd[0] == "psql":
        sql = cmd[-1]
        rows = st["db_clients"]
        if "CASE WHEN client_secret_hash IS NULL" in sql:  # release-acceptance sector-link query: yes/no only
            assert sql.startswith("SELECT client_id, kind, status,") and sql.count("client_secret_hash") == 1
            for cid in sorted(rows):
                r = rows[cid]
                if r.get("kind") != "service": continue
                print("\t".join([cid, "service", r.get("status", "active"), json.dumps(r.get("service_scopes", [])),
                                 json.dumps(r.get("service_audiences", [])), "yes" if r.get("secret_set") else "no"]))
            sys.exit(0)
        if "array_to_json" in sql:
            for cid in sorted(rows):
                r = rows[cid]
                print(cid + "\t" + json.dumps(r["redirect_uris"]) + "\t" + json.dumps(r["post_logout_redirect_uris"]))
            sys.exit(0)
        if "row_to_json" in sql:
            assert "client_secret" not in sql
            cid = sql.split("client_id='")[1].split("'")[0]
            if cid in rows: print(json.dumps(rows[cid]))
            sys.exit(0)
        sys.exit(3)
    if cmd[:3] == ["node", "src/cli.mjs", "register-client"]:
        it = iter(cmd[3:]); args = dict(zip(it, it))
        lst = lambda v: [x for x in (v or "").split(",") if x]
        service = args.get("--kind") == "service"
        st["db_clients"][args["--id"]] = {"client_id": args["--id"], "display_name": args["--name"], "accent_color": args.get("--accent"),
            "redirect_uris": lst(args.get("--redirect")), "post_logout_redirect_uris": lst(args.get("--logout")),
            "self_service_roles": lst(args.get("--self-roles")), "allow_personal_workspace": False if service else args.get("--personal") != "false",
            "admin_scopes": lst(args.get("--admin-scopes")), "admin_roles": lst(args.get("--admin-roles")),
            "assignable_roles": lst(args.get("--assignable-roles")), "kind": "service" if service else "web",
            "service_scopes": lst(args.get("--service-scopes")), "service_audiences": lst(args.get("--service-audiences")),
            "token_exchange": json.loads(args.get("--token-exchange") or "[]")}
        save(); print("client " + args["--id"] + " saved"); sys.exit(0)
    sys.exit(4)
sys.exit(5)
'''

FAKE_CURL = r'''#!/usr/bin/env python3
import json, os, sys
st = json.load(open(os.environ["FAKE_STATE"]))
a = sys.argv[1:]
with open(os.environ["FAKE_LOG"], "a") as log:
    log.write(json.dumps(["curl"] + a) + "\n")
url = [x for x in a if x.startswith("https://") or x.startswith("http://")][-1]
data = [a[i + 1] for i, x in enumerate(a) if x == "--data-urlencode"]
key = url
if url.endswith("/authorize"):
    q = dict(d.split("=", 1) for d in data)
    key = url + "?" + q["client_id"] + "|" + q["redirect_uri"]
    if len(q.get("code_challenge", "")) != 43: print("400", end=""); sys.exit(0)
r = st["http"].get(key)
if r is None: sys.exit(7)
if "-w" in a: print(r["code"], end="")
if "-D" in a: sys.stdout.write("HTTP/2 %s\r\n%s\r\n\r\n" % (r["code"], r.get("headers", "")))
if "-o" not in a: sys.stdout.write(r.get("body", ""))
'''


def product_rows():
    rows = []
    for line in subprocess.run(["bash", str(ACCEPT), "--plan"], capture_output=True, text=True, check=True).stdout.splitlines():
        if line.startswith("PLAN "):
            parts = line.split()
            rows.append({"id": parts[1], **dict(p.split("=", 1) for p in parts[2:])})
    return rows


def healthy_state(manifest_sha):
    containers = {
        "ads-demo-identity": {"image": "ghcr.io/ksondo/ads-identity:sha-" + manifest_sha("ads-identity"),
                               "env": {"ADS_ENV": "demo", "DEMO_MODE": "1", "DEMO_ACCESS_PRIVATE_ENABLED": "1"},
                               "files": {"/app/config/clients.demo.json": CLIENTS_TEXT}},
        "ads-demo-identity-db-1": {},
    }
    http = {ISSUER + "/health": {"code": "200"},
            ISSUER + "/.well-known/openid-configuration": {"code": "200", "body": json.dumps({"issuer": ISSUER})}}
    db = {}
    for row in product_rows():
        pid, key = row["id"], row["key"]
        containers["ads-demo-identity"]["env"]["DEMO_ACCESS_CHECK_SECRET_" + key.upper().replace("-", "_")] = SECRET
        for name in {row["app"], row["web"]}:
            containers[name] = {"image": "ghcr.io/ksondo/ads-demo-" + pid + ":sha-" + manifest_sha(pid),
                                "env": {row["access"]: "1", "DEMO_ACCESS_CHECK_SECRET": SECRET}, "unreadable": ""}
        if row["worker"] != "-":
            containers[row["worker"]] = {"health": "healthy"}
        c = CLIENTS[row["client"]]
        db[row["client"]] = {"redirect_uris": c["redirect_uris"], "post_logout_redirect_uris": c["post_logout_redirect_uris"]}
        http["https://%s/ads-identity.js" % row["host"]] = {"code": "200", "headers": "content-type: text/javascript; charset=utf-8"}
        http["https://%s%s" % (row["host"], row["health"])] = {"code": "200"}
        http[ISSUER + "/authorize?" + row["client"] + "|https://" + row["host"] + "/"] = {"code": "302"}
    for cid in SECTOR_SERVICE_CLIENTS:
        c = SERVICE_CLIENTS[cid]
        db[cid] = {"redirect_uris": [], "post_logout_redirect_uris": [], "kind": "service", "status": "active",
                   "service_scopes": c["allowedServiceScopes"], "service_audiences": c["allowedAudiences"], "secret_set": True}
    return {"containers": containers, "http": http, "db_clients": db}


class FakeHost:
    def __init__(self, state):
        self.dir = Path(tempfile.mkdtemp(prefix="ads-acc-test-"))
        self.bin = self.dir / "bin"
        self.bin.mkdir()
        for name, body in (("docker", FAKE_DOCKER), ("curl", FAKE_CURL)):
            p = self.bin / name
            p.write_text(body)
            p.chmod(p.stat().st_mode | stat.S_IXUSR)
        self.state_file = self.dir / "state.json"
        self.state_file.write_text(json.dumps(state))
        self.log = self.dir / "log.jsonl"
        self.log.write_text("")

    def run(self, script, *args, env=None):
        e = {"PATH": str(self.bin) + os.pathsep + os.environ["PATH"], "FAKE_STATE": str(self.state_file),
             "FAKE_LOG": str(self.log), "HOME": str(self.dir), **(env or {})}
        return subprocess.run(["bash", str(script), *args], capture_output=True, text=True, env=e, timeout=120)

    def state(self):
        return json.loads(self.state_file.read_text())

    def calls(self):
        return [json.loads(x) for x in self.log.read_text().splitlines()]

    def close(self):
        shutil.rmtree(self.dir, ignore_errors=True)


class StaticTest(unittest.TestCase):
    def test_bash_syntax_and_shellcheck(self):
        for script in (ACCEPT, REGISTER):
            subprocess.run(["bash", "-n", str(script)], check=True)
            src = script.read_text()
            self.assertTrue(src.startswith("#!/usr/bin/env bash"))
            self.assertIn("set -euo pipefail", src)
            if shutil.which("shellcheck"):
                r = subprocess.run(["shellcheck", "-x", str(script)], capture_output=True, text=True)
                self.assertEqual(r.returncode, 0, r.stdout)

    def test_acceptance_is_read_only(self):
        src = ACCEPT.read_text()
        for forbidden in ("docker run", "docker rm", "docker compose", "docker stop", "docker restart", "docker kill",
                          "docker cp", "INSERT ", "UPDATE ", "DELETE ", "nginx -s", "systemctl", "register-client",
                          "printenv", "docker exec -i", "Config.Env", " env |"):
            self.assertNotIn(forbidden, src, forbidden)

    def test_plan_lists_the_products_with_portal_ids_and_manifest_pins(self):
        rows = product_rows()
        self.assertEqual([r["id"] for r in rows], SIX + ["tourism"])
        portal = {p["id"] for p in json.loads((REPO / "apps/demo-portal/catalogue.json").read_text())["platforms"]}
        activation = json.loads((REPO / "apps/demo-portal/demo-activation.json").read_text())["products"]
        for r in rows:
            self.assertIn(r["id"], portal, "acceptance ids are the catalogue ids")
            # Tourism (TOU-0): the bundled portal file is not changed (no portal redeploy); the portal treats a product with a
            # reviewed demoDestination and no key as "preparing", and the operator's host file (RUNBOOK §G2) opens it.
            if r["id"] not in ("commerce", "tourism"):
                self.assertIn(r["id"], activation, "acceptance ids are the activation keys")
            self.assertIn(r["client"], CLIENTS)
            self.assertIn("https://%s/" % r["host"], CLIENTS[r["client"]]["redirect_uris"])
        tourism_card = [p for p in json.loads((REPO / "apps/demo-portal/catalogue.json").read_text())["platforms"] if p["id"] == "tourism"][0]
        self.assertEqual(tourism_card["demoDestination"], "https://tourism.demo.africadigitalsynergy.com/")
        self.assertIsNone(tourism_card["demoUrl"])
        self.assertEqual({r["id"]: r["key"] for r in rows}["digital-tontine"], "tontine")
        by_id = {s["id"]: s["sha"] for s in MANIFEST["immutable_sources"]}
        for r in rows:
            self.assertEqual(r["sha"], by_id.get(r["id"], ""))
        self.assertNotIn("tourism", by_id, "ads-release-20261111b is unchanged; Tourism has its own manifest")

    def test_tourism_row_matches_its_compose_and_has_no_product_side_demo_access(self):
        r = subprocess.run(["bash", str(ACCEPT), "--plan", "--product", "tourism", "--manifest", str(ROOT / TOURISM_MANIFEST_FILE)],
                           capture_output=True, text=True, check=True).stdout
        self.assertIn("PLAN tourism key=tourism client=tourism-web host=tourism.demo.africadigitalsynergy.com "
                      "app=ads-tourism-demo-tourism-1 web=ads-tourism-demo-tourism-1 root=/app/dist access=- worker=- health=/health sha=" + TOURISM_SHA, r)

    def test_container_names_are_configurable(self):
        r = subprocess.run(["bash", str(ACCEPT), "--plan", "--product", "ventureworks"], capture_output=True, text=True,
                           env={**os.environ, "ADS_ACC_VENTUREWORKS_APP": "vw-custom", "ADS_ACC_IDENTITY_CONTAINER": "id-custom"})
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("app=vw-custom", r.stdout)
        self.assertIn("identity=id-custom", r.stdout)
        bad = subprocess.run(["bash", str(ACCEPT), "--plan"], capture_output=True, text=True,
                             env={**os.environ, "ADS_ACC_COMMERCE_APP": "x; rm -rf /"})
        self.assertEqual(bad.returncode, 2)
        self.assertEqual(subprocess.run(["bash", str(ACCEPT), "--product", "tontine", "--plan"], capture_output=True).returncode, 2,
                         "the Tontine id is digital-tontine")


class AcceptanceDryRunTest(unittest.TestCase):
    def setUp(self):
        shas = {s["id"]: s["sha"] for s in MANIFEST["immutable_sources"]}
        shas["digital-tontine"] = shas["digital-tontine"] if len(shas["digital-tontine"]) == 40 else TONTINE_TEST_SHA
        shas["tourism"] = TOURISM_SHA
        self.manifest = copy.deepcopy(MANIFEST)
        for s in self.manifest["immutable_sources"]:
            s["sha"] = shas[s["id"]]
        self.host = FakeHost(healthy_state(lambda i: shas[i]))
        self.mfile = self.host.dir / "manifest.json"
        self.mfile.write_text(json.dumps(self.manifest))

    def tearDown(self):
        self.host.close()

    def run_acc(self, *args):
        return self.host.run(ACCEPT, "--manifest", str(self.mfile), *args)

    def mutate(self, fn):
        st = self.host.state(); fn(st); self.host.state_file.write_text(json.dumps(st))

    def test_healthy_host_passes_every_check_and_never_prints_secrets(self):
        r = self.run_acc()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertNotIn("FAIL", r.stdout)
        self.assertIn("ADS_RELEASE_ACCEPTANCE=PASS", r.stdout)
        self.assertRegex(r.stdout, r"(?m)^INFO tourism +release +not in manifest.json; skipped")
        self.assertNotRegex(r.stdout, r"(?m)^(PASS|FAIL) tourism ")
        for pid in SIX:
            for check in ("image", "client-drift", "authorize", "demo-access", "product-secret", "identity-secret",
                          "ads-identity.js", "static-perms", "health"):
                self.assertRegex(r.stdout, r"(?m)^PASS %s +%s " % (pid, check))
        self.assertRegex(r.stdout, r"(?m)^PASS agriculture +seed-worker ")
        self.assertRegex(r.stdout, r"(?m)^INFO ventureworks +seed-worker ")
        for cid in SECTOR_SERVICE_CLIENTS:
            self.assertRegex(r.stdout, r"(?m)^PASS sector-link +service-client +%s: registered, active" % cid)
        self.assertIn("DEMO_ACCESS_CHECK_SECRET_TONTINE present: yes", r.stdout)
        self.assertIn("DEMO_ACCESS_CHECK_SECRET_VENTUREWORKS present: yes", r.stdout)
        self.assertNotIn(SECRET, r.stdout + r.stderr + self.host.log.read_text())
        # Read-only: only inspect/exec of cat, sh -c tests, find and a SELECT.
        for call in self.host.calls():
            if call[0] == "docker":
                self.assertIn(call[1], ("inspect", "exec"))
                if call[1] == "exec":
                    self.assertIn(call[3], ("cat", "sh", "find", "psql"))
                    if call[3] == "psql":
                        self.assertTrue(call[-1].startswith("SELECT "))

    def test_every_failure_is_reported_and_exits_non_zero(self):
        vw = [r for r in product_rows() if r["id"] == "ventureworks"][0]
        def broken(st):
            st["containers"][vw["app"]]["image"] = "ghcr.io/ksondo/ads-demo-ventureworks:sha-" + "0" * 40
            st["containers"][vw["app"]]["env"].pop("VENTUREWORKS_DEMO_ACCESS")
            st["containers"]["ads-demo-identity"]["env"].pop("DEMO_ACCESS_CHECK_SECRET_VENTUREWORKS")
            st["db_clients"]["ventureworks-web"]["redirect_uris"] = ["https://ventureworks.test.africadigitalsynergy.com/"]
            st["http"][ISSUER + "/authorize?ventureworks-web|https://ventureworks.demo.africadigitalsynergy.com/"] = {"code": "400"}
            st["http"]["https://ventureworks.demo.africadigitalsynergy.com/ads-identity.js"] = {"code": "200", "headers": "content-type: text/html"}
            st["containers"][vw["web"]]["unreadable"] = "/srv/dist/assets/a.js\n"
            st["containers"]["ads-tontine-demo-demo-seed-worker-1"]["health"] = "unhealthy"
            st["http"][ISSUER + "/.well-known/openid-configuration"]["body"] = json.dumps({"issuer": "http://127.0.0.1:8084"})
        self.mutate(broken)
        r = self.run_acc()
        self.assertEqual(r.returncode, 1)
        for pattern in (r"FAIL ventureworks +image ", r"FAIL ventureworks +client-drift +ventureworks-web: redirect_uris missing https://ventureworks.demo",
                        r"FAIL ventureworks +authorize +ventureworks-web -> 400", r"FAIL ventureworks +demo-access ",
                        r"FAIL ventureworks +identity-secret +DEMO_ACCESS_CHECK_SECRET_VENTUREWORKS present: no",
                        r"FAIL ventureworks +ads-identity.js ", r"FAIL ventureworks +static-perms +1 paths",
                        r"FAIL digital-tontine +seed-worker ", r"FAIL identity +issuer "):
            self.assertRegex(r.stdout, pattern)
        self.assertRegex(r.stdout, r"(?m)^PASS commerce +image ")
        self.assertIn("ADS_RELEASE_ACCEPTANCE=FAIL", r.stdout)
        self.assertNotIn(SECRET, r.stdout + r.stderr)

    def test_sector_link_service_clients_missing_or_wrong_fail_without_printing_secrets(self):
        def broken(st):
            del st["db_clients"]["commerce-sector-service"]
            st["db_clients"]["agriculture-sector-service"]["secret_set"] = False
            st["db_clients"]["agriculture-sector-service"]["service_scopes"] = ["commerce.sector_offers"]
        self.mutate(broken)
        r = self.run_acc("--product", "agriculture")
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertRegex(r.stdout, r"FAIL sector-link +service-client +commerce-sector-service: not registered as a service client")
        self.assertRegex(r.stdout, r"FAIL sector-link +service-client +agriculture-sector-service: scopes differ from reviewed; secret set: no")
        self.assertNotIn(SECRET, r.stdout + r.stderr)

    def test_sector_link_disabled_skips_the_service_client_check(self):
        self.manifest["sector_link"]["enabled"] = False
        self.mfile.write_text(json.dumps(self.manifest))
        self.mutate(lambda st: st["db_clients"].pop("commerce-sector-service"))
        r = self.run_acc("--product", "agriculture")
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertRegex(r.stdout, r"(?m)^INFO sector-link +service-client +sector link not enabled")
        self.assertFalse(any(c[0] == "docker" and "client_secret_hash" in c[-1] for c in self.host.calls()))

    def test_invalid_sector_link_client_is_a_usage_error(self):
        self.manifest["sector_link"]["service_clients"] = ["x; rm -rf /"]
        self.mfile.write_text(json.dumps(self.manifest))
        r = self.run_acc("--plan")
        self.assertEqual(r.returncode, 2)

    def test_unpinned_manifest_sha_fails(self):
        for s in self.manifest["immutable_sources"]:
            if s["id"] == "digital-tontine":
                s["sha"] = "PENDING_TONTINE_PR43_MERGE_SHA"
        self.mfile.write_text(json.dumps(self.manifest))
        r = self.run_acc("--product", "digital-tontine")
        self.assertEqual(r.returncode, 1)
        self.assertRegex(r.stdout, r"FAIL digital-tontine +image +manifest SHA not pinned")

    def tourism_manifest(self, identity_sha):
        m = copy.deepcopy(TOURISM_MANIFEST)
        for s in m["immutable_sources"]:
            if s["id"] == "ads-identity":
                s["sha"] = identity_sha
        f = self.host.dir / "tourism-manifest.json"
        f.write_text(json.dumps(m))
        return f

    def test_tourism_passes_with_its_manifest_and_reports_demo_access_as_info(self):
        f = self.tourism_manifest(next(s["sha"] for s in self.manifest["immutable_sources"] if s["id"] == "ads-identity"))
        r = self.host.run(ACCEPT, "--manifest", str(f), "--product", "tourism")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertNotIn("FAIL", r.stdout)
        for check in ("image", "client-drift", "authorize", "ads-identity.js", "static-perms", "health"):
            self.assertRegex(r.stdout, r"(?m)^PASS tourism +%s " % check)
        self.assertRegex(r.stdout, r"(?m)^PASS tourism +authorize +tourism-web -> 302")
        self.assertRegex(r.stdout, r"(?m)^INFO tourism +demo-access +no product-side Demo Access check")
        self.assertRegex(r.stdout, r"(?m)^INFO tourism +seed-worker ")
        for check in ("product-secret", "identity-secret"):
            self.assertNotRegex(r.stdout, r"(?m)^\w+ tourism +%s " % check)
        self.assertNotIn(SECRET, r.stdout + r.stderr + self.host.log.read_text())

    def test_tourism_fails_until_the_identity_pin_is_set_and_without_the_demo_callback(self):
        r = self.host.run(ACCEPT, "--manifest", str(ROOT / TOURISM_MANIFEST_FILE), "--product", "tourism")
        self.assertEqual(r.returncode, 1)
        self.assertRegex(r.stdout, r"(?m)^FAIL identity +image +.*does not carry manifest ads-identity")
        def old_registration(st):
            st["db_clients"]["tourism-web"]["redirect_uris"] = ["https://tourism.test.africadigitalsynergy.com/"]
            st["db_clients"]["tourism-web"]["post_logout_redirect_uris"] = ["https://tourism.test.africadigitalsynergy.com/"]
        self.mutate(old_registration)
        f = self.tourism_manifest(next(s["sha"] for s in self.manifest["immutable_sources"] if s["id"] == "ads-identity"))
        r = self.host.run(ACCEPT, "--manifest", str(f), "--product", "tourism")
        self.assertEqual(r.returncode, 1)
        self.assertRegex(r.stdout, r"(?m)^FAIL tourism +client-drift +tourism-web: redirect_uris missing https://tourism.demo.africadigitalsynergy.com/")

    def test_tourism_named_with_a_manifest_that_lacks_it_fails_as_not_pinned(self):
        r = self.run_acc("--product", "tourism")
        self.assertEqual(r.returncode, 1)
        self.assertRegex(r.stdout, r"(?m)^FAIL tourism +image +manifest SHA not pinned \(absent\)")

    def test_single_product_mode(self):
        r = self.run_acc("--product", "ventureworks")
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertNotRegex(r.stdout, r"(?m)^PASS commerce ")


class RegisterClientDryRunTest(unittest.TestCase):
    def setUp(self):
        st = healthy_state(lambda i: "b" * 40)
        c = CLIENTS["ventureworks-web"]
        st["db_clients"] = {"ventureworks-web": {"client_id": "ventureworks-web", "display_name": c["display_name"], "accent_color": c.get("accent"),
            "redirect_uris": ["https://ventureworks.test.africadigitalsynergy.com/"], "post_logout_redirect_uris": c["post_logout_redirect_uris"],
            "self_service_roles": [], "allow_personal_workspace": False, "admin_scopes": c["admin_scopes"], "admin_roles": c["admin_roles"],
            "assignable_roles": c["assignable_roles"], "kind": "web", "service_scopes": [], "service_audiences": [], "token_exchange": []}}
        self.host = FakeHost(st)
        self.backup = self.host.dir / "identity-backup.marker"
        self.backup.write_text("pg_dump ads_demo_identity 2026-11-11T03:00Z sha256=...\n")

    def tearDown(self):
        self.host.close()

    def test_refuses_without_backup_marker_or_with_bad_input(self):
        for args in (["ventureworks-web"], ["ventureworks-web", "--apply"],
                     ["ventureworks-web", "--backup-confirmed", str(self.host.dir / "missing")],
                     ["Bad;id", "--backup-confirmed", str(self.backup)], []):
            r = self.host.run(REGISTER, *args)
            self.assertEqual(r.returncode, 2, args)
        self.assertEqual(self.host.calls(), [], "nothing is read before the input checks pass")

    def test_dry_run_prints_the_difference_and_writes_nothing(self):
        before = self.host.state()
        r = self.host.run(REGISTER, "ventureworks-web", "--backup-confirmed", str(self.backup))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("~ redirect_uris:", r.stdout)
        self.assertIn("https://ventureworks.demo.africadigitalsynergy.com/", r.stdout)
        self.assertIn("STATUS=DRY_RUN", r.stdout)
        self.assertEqual(self.host.state(), before)
        self.assertFalse(any("register-client" in c for c in self.host.calls()))

    def test_apply_registers_exactly_one_client_with_all_fields(self):
        r = self.host.run(REGISTER, "ventureworks-web", "--backup-confirmed", str(self.backup), "--apply")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("STATUS=APPLIED", r.stdout)
        regs = [c for c in self.host.calls() if "register-client" in c]
        self.assertEqual(len(regs), 1)
        args = regs[0][regs[0].index("register-client") + 1:]
        opts = dict(zip(args[::2], args[1::2]))
        c = CLIENTS["ventureworks-web"]
        self.assertEqual(opts["--id"], "ventureworks-web")
        self.assertEqual(opts["--redirect"].split(","), c["redirect_uris"])
        self.assertEqual(opts["--logout"].split(","), c["post_logout_redirect_uris"])
        self.assertEqual(opts["--personal"], "false")
        self.assertEqual(opts["--admin-scopes"].split(","), c["admin_scopes"])
        self.assertEqual(opts["--admin-roles"].split(","), c["admin_roles"])
        self.assertEqual(opts["--assignable-roles"].split(","), c["assignable_roles"])
        self.assertEqual(opts["--self-roles"], "")
        self.assertEqual(opts["--accent"], c["accent"])
        self.assertEqual(self.host.state()["db_clients"]["ventureworks-web"]["redirect_uris"], c["redirect_uris"])
        # Second run: nothing to change.
        r2 = self.host.run(REGISTER, "ventureworks-web", "--backup-confirmed", str(self.backup), "--apply")
        self.assertIn("STATUS=NO_CHANGE", r2.stdout)

    def test_refuses_a_non_demo_identity_and_unknown_clients(self):
        st = self.host.state(); st["containers"]["ads-demo-identity"]["env"]["ADS_ENV"] = "production"
        self.host.state_file.write_text(json.dumps(st))
        r = self.host.run(REGISTER, "ventureworks-web", "--backup-confirmed", str(self.backup), "--apply")
        self.assertEqual(r.returncode, 2)
        self.assertFalse(any("register-client" in c for c in self.host.calls()))
        st["containers"]["ads-demo-identity"]["env"]["ADS_ENV"] = "demo"
        self.host.state_file.write_text(json.dumps(st))
        r = self.host.run(REGISTER, "not-a-client", "--backup-confirmed", str(self.backup), "--apply")
        self.assertEqual(r.returncode, 2)

    def with_clients(self, mutate):
        doc = json.loads(CLIENTS_TEXT)
        mutate(doc)
        st = self.host.state()
        st["containers"]["ads-demo-identity"]["files"]["/app/config/clients.demo.json"] = json.dumps(doc)
        self.host.state_file.write_text(json.dumps(st))

    SERVICE = {"client_id": "test-sector-service", "kind": "service", "display_name": "Test sector service",
               "allowedServiceScopes": ["commerce.sector_outcomes.read"], "allowedAudiences": ["ads-commerce-api"]}

    def test_apply_registers_a_service_client_without_sign_in_fields(self):
        self.with_clients(lambda d: d.setdefault("service_clients", []).append(dict(self.SERVICE)))
        r = self.host.run(REGISTER, "test-sector-service", "--backup-confirmed", str(self.backup), "--apply")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("NOT registered", r.stdout)
        regs = [c for c in self.host.calls() if "register-client" in c]
        args = regs[0][regs[0].index("register-client") + 1:]
        opts = dict(zip(args[::2], args[1::2]))
        self.assertEqual(opts["--kind"], "service")
        self.assertEqual(opts["--service-scopes"], "commerce.sector_outcomes.read")
        self.assertEqual(opts["--service-audiences"], "ads-commerce-api")
        for k in ("--redirect", "--self-roles", "--admin-scopes", "--token-exchange"):
            self.assertNotIn(k, opts)
        row = self.host.state()["db_clients"]["test-sector-service"]
        self.assertEqual((row["kind"], row["redirect_uris"]), ("service", []))
        r2 = self.host.run(REGISTER, "test-sector-service", "--backup-confirmed", str(self.backup), "--apply")
        self.assertIn("STATUS=NO_CHANGE", r2.stdout)

    def test_apply_carries_the_token_exchange_allow_list(self):
        rule = [{"audience": "ads-commerce-api", "scopes": ["commerce.sector_offers"]}]
        def add(d):
            for c in d["products"]:
                if c["client_id"] == "ventureworks-web":
                    c["tokenExchange"] = rule; c["needs_client_secret"] = True
        self.with_clients(add)
        r = self.host.run(REGISTER, "ventureworks-web", "--backup-confirmed", str(self.backup))
        self.assertIn("~ token_exchange:", r.stdout)
        r = self.host.run(REGISTER, "ventureworks-web", "--backup-confirmed", str(self.backup), "--apply")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(self.host.state()["db_clients"]["ventureworks-web"]["token_exchange"], rule)

    def test_refuses_malformed_service_and_exchange_entries_before_writing(self):
        bad_entries = [
            lambda d: d.setdefault("service_clients", []).append({**self.SERVICE, "redirect_uris": ["https://x.example/"]}),
            lambda d: d.setdefault("service_clients", []).append({**self.SERVICE, "allowedServiceScopes": ["members:read"]}),
            lambda d: d.setdefault("service_clients", []).append({**self.SERVICE, "allowedAudiences": ["commerce-web"]}),
            lambda d: d.setdefault("service_clients", []).append({**self.SERVICE, "kind": "web"}),
        ]
        for i, mutate in enumerate(bad_entries):
            self.with_clients(mutate)
            r = self.host.run(REGISTER, "test-sector-service", "--backup-confirmed", str(self.backup), "--apply")
            self.assertEqual(r.returncode, 2, (i, r.stdout, r.stderr))
            self.assertIn("REFUSED", r.stderr)
        def bad_exchange(d):
            for c in d["products"]:
                if c["client_id"] == "ventureworks-web":
                    c["tokenExchange"] = [{"audience": "commerce-web", "scopes": ["commerce.sector_offers"]}]; c["needs_client_secret"] = True
        self.with_clients(bad_exchange)
        r = self.host.run(REGISTER, "ventureworks-web", "--backup-confirmed", str(self.backup), "--apply")
        self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
        self.assertFalse(any("register-client" in c for c in self.host.calls()))

    def test_source_never_reads_or_prints_secrets(self):
        src = REGISTER.read_text()
        for forbidden in ("client_secret_hash", "set-client-secret", "printenv", "Config.Env", "apply-clients", "bootstrap"):
            self.assertNotIn(forbidden, src.split("set -euo pipefail", 1)[1], forbidden)


class ReleaseManifestTest(unittest.TestCase):
    # Commerce and Agriculture are re-pinned once more after the B1-B3 fix PRs merge (ADS_RELEASE_20261111B.md);
    # they must move off the 20261111 pins and be documented, but are not hard-coded here so the bump is one edit.
    NEW_PINS = {"ads-identity": "b768b47b942dd6d4b97027b753b2c610d3037bc1"}
    REPINNABLE = ("commerce", "agriculture")

    def test_20261111b_pins_identity_commerce_agriculture_and_keeps_the_rest(self):
        prev = json.loads((ROOT / "ads-release-20261111.manifest.json").read_text())
        self.assertEqual(MANIFEST["release_id"], "ads-release-20261111b")
        self.assertEqual(prev["superseded_by"], "deploy/contabo-demo/" + MANIFEST_FILE)
        self.assertIn(MANIFEST_FILE, (ROOT / "release-acceptance.sh").read_text(), "default manifest of the acceptance check")
        srcs = MANIFEST["immutable_sources"]
        self.assertEqual([s["id"] for s in srcs], [s["id"] for s in prev["immutable_sources"]])
        self.assertEqual([s["deployment_order"] for s in srcs], list(range(1, 9)))
        for s in srcs:
            self.assertRegex(s["sha"], r"^[0-9a-f]{40}$", s["id"] + " must be a full merged SHA (no placeholder)")
        by_id = {s["id"]: s for s in srcs}
        for s in prev["immutable_sources"]:
            if s["id"] in self.REPINNABLE:
                self.assertNotEqual(by_id[s["id"]]["sha"], s["sha"], "new pin " + s["id"])
            else:
                self.assertEqual(by_id[s["id"]]["sha"], self.NEW_PINS.get(s["id"], s["sha"]), "pin " + s["id"])
            self.assertEqual(by_id[s["id"]]["repo"], s["repo"])
        self.assertEqual(MANIFEST["excluded_until_certified"], [])
        self.assertEqual(set(by_id["ads-portal"]["depends_on"]), set(by_id) - {"ads-portal"})
        link = MANIFEST["sector_link"]
        self.assertIs(link["enabled"], True)
        self.assertEqual(link["service_clients"], SECTOR_SERVICE_CLIENTS)
        for cid in link["service_clients"]:
            self.assertEqual(SERVICE_CLIENTS[cid]["kind"], "service")
        doc = (ROOT / "ADS_RELEASE_20261111B.md").read_text()
        self.assertEqual(MANIFEST["operator_runbook"], "deploy/contabo-demo/ADS_RELEASE_20261111B.md")
        for s in srcs:
            self.assertIn(s["sha"], doc, s["id"] + " pin documented")
        self.assertIn("Bumping the Commerce and Agriculture pins", doc)
        self.assertNotIn("PENDING", doc)


class TourismManifestTest(unittest.TestCase):
    def test_tourism_manifest_pins_tourism_main_and_waits_for_the_identity_repin(self):
        m = TOURISM_MANIFEST
        self.assertEqual(m["release_id"], "ads-release-20261113-tourism")
        self.assertIn("NOT_APPROVED_FOR_DEPLOY", m["status"])
        by_id = {s["id"]: s for s in m["immutable_sources"]}
        self.assertEqual(list(by_id), ["ads-identity", "tourism"])
        t = by_id["tourism"]
        self.assertEqual(t["repo"], "ksondo/tourism-platform")
        self.assertEqual(t["sha"], TOURISM_SHA)
        self.assertEqual(t["host"], "tourism.demo.africadigitalsynergy.com")
        self.assertEqual(t["identity_client"], "tourism-web")
        self.assertEqual(t["loopback_port"], 18130)
        self.assertIn("https://%s/" % t["host"], CLIENTS["tourism-web"]["redirect_uris"])
        ident = by_id["ads-identity"]
        self.assertEqual(ident["repo"], "ksondo/ads-platform-kit")
        # Either the follow-up repin has happened (full SHA) or the pending note says what to set.
        self.assertTrue(len(ident["sha"]) == 40 or ("pending_repin" in ident and ident["sha"] == ""))
        self.assertIn(TOURISM_MANIFEST_FILE, m["acceptance_check"])

    def test_tourism_port_is_free_among_the_documented_demo_ports(self):
        rollout = json.loads((ROOT / "nine-platform-rollout.json").read_text())
        tourism = [c for c in rollout["candidates"] if c["catalogueId"] == "tourism"]
        self.assertEqual(len(tourism), 1)
        self.assertEqual(tourism[0]["loopbackPort"], 18130)
        self.assertEqual(tourism[0]["sourceSha"], TOURISM_SHA)
        documented = {18086, 18089, 18090, 18140, 18481, 18501, 18505}  # Commerce, portal, Identity, Agriculture, VentureWorks, older Education/Tontine
        self.assertNotIn(18130, documented)
        for f in list(ROOT.glob("*.yml")) + list(ROOT.glob("*.json")) + list(ROOT.glob("*.sh")):
            if f.name in (TOURISM_MANIFEST_FILE, "nine-platform-rollout.json"):
                continue
            self.assertNotIn("18130", f.read_text(), f.name + " must not use the Tourism port")


class RunbookTest(unittest.TestCase):
    def test_runbook_documents_both_scripts_and_the_activation_mount(self):
        rb = (ROOT / "RUNBOOK.md").read_text()
        e3 = rb[rb.index("### E3."):rb.index("## F.")]
        self.assertIn("register-identity-client.sh", e3)
        self.assertIn("--backup-confirmed", e3)
        self.assertIn("release-acceptance.sh", rb)
        self.assertIn("/etc/ads-demo/portal/demo-activation.json", rb)

    def test_runbook_documents_the_tourism_steps_in_order(self):
        rb = (ROOT / "RUNBOOK.md").read_text()
        e32 = rb[rb.index("#### E3.2 ADS Tourism demo"):rb.index("## F.")]
        order = ["identity-backup-<date>.marker", "register-identity-client.sh tourism-web --backup-confirmed",
                 "tourism-web --backup-confirmed /var/lib/ads-demo/operator-secrets/identity-backup-<date>.marker --apply",
                 "src/cli.mjs demo-bootstrap", "src/cli.mjs demo-orgs", "--profile demo-seed run --rm demo-seed",
                 "release-acceptance.sh --product tourism --manifest deploy/contabo-demo/" + TOURISM_MANIFEST_FILE]
        at = [e32.index(x) for x in order]
        self.assertEqual(at, sorted(at), "backup, client dry run, apply, demo-bootstrap, demo-orgs, seed, acceptance")
        self.assertIn("18130", e32)
        self.assertIn("Deferred to the next phase", e32)


if __name__ == "__main__":
    unittest.main()

"""Fast source-only checks for the five-service Contabo release controller."""
import base64
import copy
import importlib.util
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("batch_release", ROOT / "batch-release.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
RAW = (ROOT / "batch-release.manifest.json").read_bytes()
SUPERSEDED_MANIFEST = json.loads(RAW)
# 11 Nov 2026: the committed manifest is superseded (stale SHAs) and refused. The pin-validation tests
# below still exercise the validator on the same content with only the superseded marker removed.
MANIFEST = {k: v for k, v in SUPERSEDED_MANIFEST.items() if k != "superseded"}


class FiveDemoReleaseTest(unittest.TestCase):
    def encoded(self, obj):
        return base64.b64encode(json.dumps(obj).encode()).decode()

    def test_committed_manifest_is_superseded_and_refused_with_a_clear_message(self):
        self.assertEqual(SUPERSEDED_MANIFEST["superseded"]["by"],
                         "deploy/contabo-demo/ads-release-20261111.manifest.json")
        with self.assertRaises(runner.Stop) as stop:
            runner.manifest_from_arg(base64.b64encode(RAW).decode())
        self.assertIn("SUPERSEDED", str(stop.exception))
        self.assertIn("ads-release-20261111.manifest.json", str(stop.exception))

    def test_superseded_build_script_refuses_every_mode(self):
        import subprocess
        for mode in ("--plan", "--build", ""):
            r = subprocess.run(["bash", str(ROOT / "build-staged-demo-images.sh")] + ([mode] if mode else []),
                               capture_output=True, text=True, timeout=20)
            self.assertEqual(r.returncode, 3, mode)
            self.assertIn("SUPERSEDED", r.stderr)
            self.assertNotIn("IMAGE_CANDIDATE", r.stdout)

    def test_manifest_is_valid_and_pins_exactly_five_sources(self):
        m, digest = runner.manifest_from_arg(self.encoded(MANIFEST))
        self.assertEqual(len(digest), 64)
        self.assertEqual([x["id"] for x in m["services"]],
                         ["education", "agriculture", "fleet-guard", "tontine", "portal"])
        self.assertEqual(len({x["sha"] for x in m["services"]}), 5)
        self.assertTrue(all(re.fullmatch(r"[a-f0-9]{40}", x["sha"]) for x in m["services"]))

    def test_edited_repos_and_unsafe_paths_refused(self):
        for key, change in (
            ("repo", "someone-else/education"),
            ("sha", "main"),
            ("dockerfile", "../private/secret"),
            ("host", "example.invalid"),
        ):
            bad = copy.deepcopy(MANIFEST)
            bad["services"][0][key] = change
            with self.subTest(key=key), self.assertRaises(runner.Stop):
                runner.manifest_from_arg(self.encoded(bad))

    def test_missing_or_extra_target_refused(self):
        for replacement in (MANIFEST["services"][:4],
                            MANIFEST["services"] + [MANIFEST["services"][0]]):
            bad = copy.deepcopy(MANIFEST)
            bad["services"] = replacement
            with self.assertRaises(runner.Stop):
                runner.manifest_from_arg(self.encoded(bad))

    def test_operator_approval_is_explicitly_default_off(self):
        doc = json.loads((ROOT / "batch-release-approval.example.json").read_text())
        self.assertTrue(runner.GATES)
        self.assertTrue(all(doc["gates"][key] is False for key in runner.GATES))
        self.assertEqual(doc["source_shas"],
                         {x["id"]: x["sha"] for x in MANIFEST["services"]})

    def test_no_automated_database_or_identity_mutation(self):
        src = (ROOT / "batch-release.py").read_text()
        for forbidden in ("down -v", "docker volume rm", "docker system prune",
                          "demo-seed --reset", "run --rm migrate", "register-client --apply"):
            self.assertNotIn(forbidden, src)
        self.assertIn('"--no-deps", "--force-recreate"', src)
        self.assertIn('"--is-ancestor"', src)
        self.assertIn("approval_check(m, digest)", src)
        self.assertIn("rollback(changes)", src)

    def test_manual_workflow_requires_protected_ssh_and_never_autodeploys(self):
        wf = (ROOT.parent.parent / ".github/workflows/contabo-five-demo-release.yml").read_text()
        self.assertIn("workflow_dispatch:", wf)
        self.assertIn("environment: contabo-demo-release", wf)
        self.assertIn("StrictHostKeyChecking=yes", wf)
        self.assertIn("DEPLOY-ADS-FIVE", wf)
        self.assertNotIn("schedule:", wf)
        self.assertNotIn("pull_request:", wf)
        self.assertNotIn("push:", wf)


if __name__ == "__main__":
    unittest.main()

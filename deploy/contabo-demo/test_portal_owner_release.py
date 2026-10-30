"""Safety tests for auto-publication of ADS demo portal after Commerce seed."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).with_name("portal-owner-release.py")
spec = importlib.util.spec_from_file_location("ads_portal_publisher", SCRIPT)
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class PortalPublisherTest(unittest.TestCase):
    def test_manual_owner_release_guard(self):
        source = SCRIPT.read_text()
        self.assertIn("--apply-approved-demo-portal", source)
        self.assertNotIn("/opt/actions-runner-software-factory", source)
        self.assertEqual(str(publisher.REPO), "/opt/ads/demo-platform-kit")

    def test_expected_ads_navigation(self):
        self.assertEqual(publisher.EXPECTED, {
            "commerce": "https://commerce.demo.africadigitalsynergy.com/commerce",
            "ecommerce": "https://commerce.demo.africadigitalsynergy.com/commerce",
            "pos": "https://commerce.demo.africadigitalsynergy.com/commerce/merchant/pos",
        })
        self.assertEqual(publisher.PORT, "18089")

    def test_approved_source_selects_latest_green_first_parent_commit(self):
        first = "a" * 40
        second = "b" * 40
        calls = []
        def fake(*args, **kwargs):
            calls.append(args)
            if args[-3:] == ("remote", "get-url", "origin"):
                return "git@github.com:ksondo/ads-platform-kit.git\n"
            if "ls-remote" in args:
                return (
                    first + "\trefs/tags/ads-demo-portal-approved/" + first + "\n" +
                    second + "\trefs/tags/ads-demo-portal-approved/" + second + "\n")
            if "rev-list" in args:
                return "c" * 40 + "\n" + second + "\n" + first
            return ""
        with patch.object(publisher, "run", side_effect=fake):
            self.assertEqual(publisher.approved_source(), second)
        self.assertTrue(any("ls-remote" in call for call in calls))

    def test_no_approval_tag_does_not_promote_unchecked_portal(self):
        def fake(*args, **kwargs):
            if args[-3:] == ("remote", "get-url", "origin"):
                return "git@github.com:ksondo/ads-platform-kit.git\n"
            return ""
        with patch.object(publisher, "run", side_effect=fake):
            self.assertIsNone(publisher.approved_source())

    def test_public_link_gate_requires_three_correct_destinations(self):
        source = json.dumps({
            "platforms": [
                {"id": "commerce", "demoUrl": publisher.EXPECTED["commerce"]}],
            "tools": [
                {"id": "ecommerce", "demoUrl": publisher.EXPECTED["ecommerce"]},
                {"id": "pos", "demoUrl": publisher.EXPECTED["pos"]},
                {"id": "bnpl", "demoUrl": None},
                {"id": "inventory", "demoUrl": None},
                {"id": "storefront", "demoUrl": None}],
        })
        def fake(*args, **kwargs):
            if any("catalogue.json" in part for part in args):
                return source
            if any("main.js" in part for part in args):
                return 'function launch(x) { return \'target="_blank" rel="noopener noreferrer"\' } function header() {}'
            return ""
        with patch.object(publisher, "run", side_effect=fake):
            publisher.public_portal_links()

    def test_dynamic_opportunities_api_gate_requires_database_counts(self):
        calls = []
        def fake(*args, **kwargs):
            target = args[-1]
            calls.append(target)
            if "/sectors" in target:
                return json.dumps({"total": 50})
            if "/opportunities?limit=1" in target:
                return json.dumps({"total": 333})
            if "categories?family=business" in target:
                return json.dumps({"total": 13})
            if "categories?family=institutional" in target:
                return json.dumps({"total": 8})
            if "solutions?family=business" in target:
                return json.dumps({"total": 102})
            if "solutions?family=institutional" in target:
                return json.dumps({"total": 20})
            raise AssertionError(target)
        with patch.object(publisher, "run", side_effect=fake):
            publisher.opportunities_api_ready()
        self.assertEqual(len(calls), 6)
        def incomplete(*args, **kwargs):
            if args[-1].endswith("/sectors"):
                return json.dumps({"total": 49})
            return fake(*args, **kwargs)
        with patch.object(publisher, "run", side_effect=incomplete):
            with self.assertRaises(publisher.Gate):
                publisher.opportunities_api_ready()

    def test_live_portal_smoke_requires_api_when_dynamic_page_is_present(self):
        source = json.dumps({
            "platforms": [{"id": "commerce", "demoUrl": publisher.EXPECTED["commerce"]}],
            "tools": [
                {"id": "ecommerce", "demoUrl": publisher.EXPECTED["ecommerce"]},
                {"id": "pos", "demoUrl": publisher.EXPECTED["pos"]},
                {"id": "bnpl", "demoUrl": None},
                {"id": "inventory", "demoUrl": None},
                {"id": "storefront", "demoUrl": None}],
        })
        calls = []
        def fake(*args, **kwargs):
            calls.append(args)
            if any("catalogue.json" in str(x) for x in args):
                return source
            if any("main.js" in str(x) for x in args):
                return ('import * as ADSOpportunities from "./opportunities-v2.js";\n'
                        'function launch(){ return \'target="_blank" rel="noopener noreferrer"\'; }'
                        ' function header(){}')
            return ""
        with patch.object(publisher, "run", side_effect=fake), \
             patch.object(publisher, "opportunities_api_ready") as api_ready:
            publisher.public_portal_links()
            api_ready.assert_called_once()

    def test_unapproved_financing_link_is_refused(self):
        source = json.dumps({
            "platforms": [{"id": "commerce", "demoUrl": publisher.EXPECTED["commerce"]}],
            "tools": [
                {"id": "ecommerce", "demoUrl": publisher.EXPECTED["ecommerce"]},
                {"id": "pos", "demoUrl": publisher.EXPECTED["pos"]},
                {"id": "bnpl", "demoUrl": "https://fake.example/demo"}]
        })
        def fake(*args, **kwargs):
            return source if any("catalogue.json" in part for part in args) else ""
        with patch.object(publisher, "run", side_effect=fake):
            with self.assertRaises(publisher.Gate):
                publisher.public_portal_links()


if __name__ == "__main__":
    unittest.main()

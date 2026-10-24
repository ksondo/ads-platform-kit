"""Source-only safety tests for surgical HTTPS API ingress."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
from types import SimpleNamespace

SOURCE = Path(__file__).resolve().parents[1] / "scripts" / "publish-https-ingress.py"
spec = importlib.util.spec_from_file_location("ads_opportunities_ingress", SOURCE)
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)

NORMAL = """
server {
    listen 80;
    server_name demo.africadigitalsynergy.com;
    return 301 https://demo.africadigitalsynergy.com$request_uri;
}
server {
    listen 443 ssl;
    server_name demo.africadigitalsynergy.com;
    ssl_certificate /etc/letsencrypt/live/demo.africadigitalsynergy.com/fullchain.pem;
    location / {
        proxy_pass http://127.0.0.1:18089;
    }
}
server {
    listen 443 ssl;
    server_name login.demo.africadigitalsynergy.com;
    location / {
        proxy_pass http://127.0.0.1:18090;
    }
}
"""

class IngressSourceTest(unittest.TestCase):
    def test_only_expected_https_block_is_modified(self):
        updated, mode = api.find_approved_server(NORMAL)
        self.assertEqual(mode, "new")
        self.assertEqual(updated.count(api.SIGNATURE), 1)
        self.assertEqual(updated.count("proxy_pass http://127.0.0.1:18190;"), 1)
        self.assertIn("proxy_pass http://127.0.0.1:18089;", updated)
        self.assertIn("proxy_pass http://127.0.0.1:18090;", updated)
        self.assertIn("listen 80;", updated)
        self.assertIn("location ^~ /api/opportunities/v1/", updated)
        self.assertIn("proxy_pass http://127.0.0.1:18190;", api.LOCATION)
        self.assertNotIn("proxy_pass http://127.0.0.1:18190/;", api.LOCATION)
        self.assertEqual(api.find_approved_server(updated), (updated, "existing"))

    def test_refuses_unknown_home_proxy(self):
        with self.assertRaises(api.Refused):
            api.find_approved_server(NORMAL.replace("127.0.0.1:18089", "127.0.0.1:11111"))

    def test_refuses_duplicate_https_server(self):
        https = NORMAL.split("server {")[2]
        with self.assertRaises(api.Refused):
            api.find_approved_server(NORMAL + "server {" + https)

    def test_refuses_unrelated_api_mapping(self):
        bad = NORMAL.replace("location / {", "location ^~ /api/opportunities/v1/ {\n proxy_pass http://127.0.0.1:9999;\n}\nlocation / {", 1)
        # Refuse an unexpected existing route in the ADS HTTPS block.
        with self.assertRaises(api.Refused):
            api.find_approved_server(bad)

    def test_https_json_valid_and_html_rejected_with_safe_metadata(self):
        ok = SimpleNamespace(returncode=0,
                             stdout='{"total":50}\n__ADS_HTTP__200|application/json')
        html = SimpleNamespace(returncode=0,
                               stdout='<!doctype html><title>ADS</title>\n__ADS_HTTP__200|text/html')
        moved = SimpleNamespace(returncode=0,
                                stdout='<html>redirect</html>\n__ADS_HTTP__302|text/html')
        with patch.object(api.subprocess, "run", return_value=ok) as request:
            self.assertEqual(api.fetch("/sectors", public=True)["total"], 50)
            self.assertIn("--resolve", request.call_args.args[0])
        with patch.object(api.subprocess, "run", return_value=html):
            with self.assertRaisesRegex(api.Refused, "status=200 type=text/html body_kind=html"):
                api.fetch("/sectors", public=True)
        with patch.object(api.subprocess, "run", return_value=moved):
            with self.assertRaisesRegex(api.Refused, "status=302"):
                api.fetch("/sectors", public=True)

    def test_nginx_reload_bounded_retry_and_still_fails_closed(self):
        with patch.object(api, "verify_api", side_effect=[
                api.Refused("status=200 type=text/html"), None]) as verify:
            with patch.object(api.time, "sleep") as sleep:
                api.verify_https_after_reload(attempts=3)
                self.assertEqual(verify.call_count, 2)
                sleep.assert_called_once_with(1)

        with patch.object(api, "verify_api",
                          side_effect=api.Refused("status=404 type=text/html")):
            with patch.object(api.time, "sleep") as sleep:
                with self.assertRaisesRegex(api.Refused, "after 3 checks: status=404"):
                    api.verify_https_after_reload(attempts=3)
                self.assertEqual(sleep.call_count, 2)

    def test_counts_contract(self):
        self.assertEqual([n for _,n in api.CHECKS], [50,333,13,8,102,20])

if __name__ == "__main__":
    unittest.main()

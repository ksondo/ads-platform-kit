"""Source-only safety tests for surgical HTTPS API ingress."""
import importlib.util
from pathlib import Path
import unittest

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
        # The location was injected into HTTP-only block; since the installer
        # only changes HTTPS, it does not silently adopt this unauthorized path.
        x, mode = api.find_approved_server(bad)
        self.assertEqual(mode, "new")
        self.assertIn("127.0.0.1:9999", x)

    def test_counts_contract(self):
        self.assertEqual([n for _,n in api.CHECKS], [50,333,13,8,102,20])

if __name__ == "__main__":
    unittest.main()

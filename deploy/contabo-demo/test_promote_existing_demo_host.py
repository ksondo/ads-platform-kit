#!/usr/bin/env python3
"""Tests for the conservative existing-demo-host Nginx cutover renderer."""
import importlib.util
from pathlib import Path
import unittest

SCRIPT = Path(__file__).with_name("promote-existing-demo-host.py")
spec = importlib.util.spec_from_file_location("promote_demo", SCRIPT)
portal = importlib.util.module_from_spec(spec)
spec.loader.exec_module(portal)

LEGACY = """server {
    server_name demo.africadigitalsynergy.com;

    root /root/retail-sync-io/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/demo.africadigitalsynergy.com/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/demo.africadigitalsynergy.com/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}
server {
    if ($host = demo.africadigitalsynergy.com) {
        return 301 https://$host$request_uri;
    } # managed by Certbot
    listen 80;
    server_name demo.africadigitalsynergy.com;
    return 404; # managed by Certbot
}
"""


class ChangeOnlyVerifiedRetailBlock(unittest.TestCase):
    def test_replaces_only_old_retail_static_site(self):
        modified, mode = portal.replace_legacy(LEGACY)
        self.assertEqual(mode, "legacy")
        self.assertIn("proxy_pass http://127.0.0.1:18089;", modified)
        self.assertNotIn("root /root/retail-sync-io/dist;", modified)
        self.assertNotIn("try_files", modified)
        self.assertEqual(modified.count("ssl_certificate_key /etc/letsencrypt/live/demo.africadigitalsynergy.com/privkey.pem;"), 1)
        self.assertIn("return 301 https://$host$request_uri;", modified)
        self.assertEqual(modified.count("server_name demo.africadigitalsynergy.com;"), 2)
        again, new_mode = portal.replace_legacy(modified)
        self.assertEqual(new_mode, "already")
        self.assertEqual(again, modified)

    def test_refuses_unknown_site(self):
        with self.assertRaises(portal.SafetyError):
            portal.replace_legacy(LEGACY.replace("root /root/retail-sync-io/dist;", "root /srv/another-site/dist;"))

    def test_refuses_duplicate_legacy_blocks(self):
        sample = LEGACY.replace(
            "    index index.html;",
            "    index index.html;\n    root /root/retail-sync-io/dist;",
        )
        with self.assertRaises(portal.SafetyError):
            portal.replace_legacy(sample)

    def test_refuses_unexpected_hostname(self):
        with self.assertRaises(portal.SafetyError):
            portal.replace_legacy(LEGACY.replace("demo.africadigitalsynergy.com", "another.africadigitalsynergy.com"))

    def test_refuses_unexpected_certificate(self):
        with self.assertRaises(portal.SafetyError):
            portal.replace_legacy(LEGACY.replace(
                "ssl_certificate /etc/letsencrypt/live/demo.africadigitalsynergy.com/fullchain.pem;",
                "ssl_certificate /etc/letsencrypt/live/other/fullchain.pem;",
            ))


if __name__ == "__main__":
    unittest.main()

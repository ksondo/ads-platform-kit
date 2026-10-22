#!/usr/bin/env python3
"""Pure template/safety tests for publishing isolated demo login."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).with_name("publish-demo-login.py")
spec = importlib.util.spec_from_file_location("publish_demo_login", SCRIPT)
login = importlib.util.module_from_spec(spec)
spec.loader.exec_module(login)


class GuardedDemoLogin(unittest.TestCase):
    def test_http_stage_never_exposes_login(self):
        conf = login.http_conf()
        self.assertTrue(conf.startswith(login.HTTP_MARKER))
        self.assertIn("server_name login.demo.africadigitalsynergy.com;", conf)
        self.assertIn("location / { return 404; }", conf)
        self.assertIn("location ^~ /.well-known/acme-challenge/", conf)
        self.assertNotIn("listen 443", conf)
        self.assertNotIn("proxy_pass", conf)
        self.assertNotIn("login.test.africadigitalsynergy.com", conf)

    def test_https_dedicated_proxy_preserves_acme(self):
        conf = login.https_conf()
        self.assertTrue(conf.startswith(login.HTTPS_MARKER))
        self.assertIn("listen 443 ssl;", conf)
        self.assertIn("proxy_pass http://127.0.0.1:18090;", conf)
        self.assertIn("ssl_certificate /etc/letsencrypt/live/login.demo.africadigitalsynergy.com/fullchain.pem;", conf)
        self.assertIn("location ^~ /.well-known/acme-challenge/", conf)
        self.assertIn("location / { return 301 https://$host$request_uri; }", conf)
        self.assertNotIn("africorestack-identity", conf)
        self.assertNotIn("proxy_pass http://127.0.0.1:18089;", conf)

    def test_existing_identity_config_has_unchanged_secrets_and_modes(self):
        secret = (
            "ADS_ENV=demo\nDEMO_MODE=1\n"
            "IDENTITY_COOKIE_SECRET=the-original-cookie\n"
            "IDENTITY_SIGNING_KEY_PEM=unmodified\\nsecret\n"
            "IDENTITY_PUBLIC_URL=" + login.OLD_ORIGIN + "\n"
            "DEMO_USER_PASSWORD=unmodified-password\n"
        )
        changed = secret.replace("IDENTITY_PUBLIC_URL=" + login.OLD_ORIGIN + "\n",
                                 "IDENTITY_PUBLIC_URL=" + login.ORIGIN + "\n")
        self.assertEqual(changed.count("IDENTITY_PUBLIC_URL="), 1)
        self.assertIn("IDENTITY_COOKIE_SECRET=the-original-cookie", changed)
        self.assertIn("DEMO_USER_PASSWORD=unmodified-password", changed)
        self.assertIn("IDENTITY_SIGNING_KEY_PEM=unmodified\\nsecret", changed)

    def test_check_site_refuses_existing_unrecognized_site(self):
        with tempfile.TemporaryDirectory() as tmp:
            existing = Path(tmp) / "site"
            existing.write_text("server { server_name unrelated.example; }\n")
            enabled = Path(tmp) / "enabled"
            enabled.symlink_to(existing)
            with patch.object(login, "AVAILABLE", existing), patch.object(login, "ENABLED", enabled):
                with self.assertRaises(login.Refusal):
                    login.check_site()

    def test_existing_stage_recognized(self):
        with tempfile.TemporaryDirectory() as tmp:
            existing = Path(tmp) / "site"
            existing.write_text(login.http_conf())
            enabled = Path(tmp) / "enabled"
            enabled.symlink_to(existing)
            with patch.object(login, "AVAILABLE", existing), patch.object(login, "ENABLED", enabled):
                self.assertEqual(login.check_site(), login.http_conf())
                self.assertEqual(login.check_site(login.HTTP_MARKER), login.http_conf())
                with self.assertRaises(login.Refusal):
                    login.check_site(login.HTTPS_MARKER)

    def test_check_site_refuses_bad_symlink(self):
        with tempfile.TemporaryDirectory() as tmp:
            existing = Path(tmp) / "site"
            existing.write_text(login.http_conf())
            enabled = Path(tmp) / "enabled"
            enabled.symlink_to(Path(tmp) / "other")
            with patch.object(login, "AVAILABLE", existing), patch.object(login, "ENABLED", enabled):
                with self.assertRaises(login.Refusal):
                    login.check_site()


if __name__ == "__main__":
    unittest.main()

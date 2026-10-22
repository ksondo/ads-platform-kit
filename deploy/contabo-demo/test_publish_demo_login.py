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

    def test_acme_webroot_world_traversable_even_with_umask_077(self):
        import os
        import stat
        with tempfile.TemporaryDirectory() as tmp:
            acme = Path(tmp) / "ads-demo-login-acme"
            old_umask = os.umask(0o077)
            try:
                with patch.object(login, "ACME", acme):
                    login.prepare_public_webroot()
                    for part in (acme, acme / ".well-known", acme / ".well-known" / "acme-challenge"):
                        self.assertEqual(stat.S_IMODE(part.stat().st_mode), 0o755)
            finally:
                os.umask(old_umask)

    def test_challenge_probe_retries_404_then_serves_token_and_removes_file(self):
        import os
        import stat
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as tmp:
            acme = Path(tmp) / "ads-demo-login-acme"
            seen = []
            def mock_curl(*args, **kwargs):
                challenge = next((acme / ".well-known" / "acme-challenge").iterdir())
                self.assertEqual(stat.S_IMODE(challenge.stat().st_mode), 0o644)
                token = challenge.read_text()
                seen.append(token)
                if len(seen) == 1:
                    return SimpleNamespace(stdout="Not Found\\nADS_HTTP_STATUS:404")
                return SimpleNamespace(stdout=token + "\\nADS_HTTP_STATUS:200")
            old_umask = os.umask(0o077)
            try:
                with patch.object(login, "ACME", acme), patch.object(login, "command", side_effect=mock_curl), patch.object(login.time, "sleep", return_value=None):
                    login.prepare_public_webroot()
                    login.challenge_probe()
                self.assertEqual(len(seen), 2)
                self.assertEqual(list((acme / ".well-known" / "acme-challenge").iterdir()), [])
            finally:
                os.umask(old_umask)

    def test_acme_webroot_rejects_symlink(self):
        with tempfile.TemporaryDirectory() as tmp:
            real = Path(tmp) / "target"
            real.mkdir()
            acme = Path(tmp) / "ads-demo-login-acme"
            acme.symlink_to(real)
            with patch.object(login, "ACME", acme):
                with self.assertRaises(login.Refusal):
                    login.prepare_public_webroot()

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

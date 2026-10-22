#!/usr/bin/env python3
"""Static and isolated unit tests for the guarded Commerce demo HTTPS publisher."""
import importlib.util
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

SCRIPT = Path(__file__).with_name("publish-demo-commerce.py")
spec = importlib.util.spec_from_file_location("publish_demo_commerce", SCRIPT)
commerce = importlib.util.module_from_spec(spec)
spec.loader.exec_module(commerce)


class CommercePublication(unittest.TestCase):
    def test_host_and_upstream_are_isolated_from_existing_ads_services(self):
        self.assertEqual(commerce.HOST, "commerce.demo.africadigitalsynergy.com")
        self.assertEqual(commerce.PORT, "18086")
        self.assertNotEqual(commerce.AVAILABLE, Path("/etc/nginx/sites-available/login.demo.africadigitalsynergy.com"))
        self.assertNotEqual(commerce.ACME, Path("/var/www/ads-demo-login-acme"))

    def test_http_challenge_only_never_exposes_application(self):
        config = commerce.http_conf()
        self.assertTrue(config.startswith(commerce.HTTP_MARKER))
        self.assertIn("server_name commerce.demo.africadigitalsynergy.com;", config)
        self.assertIn("location / { return 404; }", config)
        self.assertIn("location ^~ /.well-known/acme-challenge/", config)
        self.assertNotIn("listen 443", config)
        self.assertNotIn("proxy_pass", config)

    def test_https_site_only_proxies_to_commerce_loopback(self):
        config = commerce.https_conf()
        self.assertTrue(config.startswith(commerce.HTTPS_MARKER))
        self.assertEqual(config.count("server_name commerce.demo.africadigitalsynergy.com;"), 2)
        self.assertIn("listen 443 ssl;", config)
        self.assertIn("proxy_pass http://127.0.0.1:18086;", config)
        self.assertIn("location ^~ /.well-known/acme-challenge/", config)
        self.assertIn("location / { return 301 https://$host$request_uri; }", config)
        self.assertNotIn("africorestack-identity", config)
        self.assertNotIn("127.0.0.1:18090", config)
        self.assertNotIn("127.0.0.1:18089", config)

    def test_challenge_webroot_has_safe_access_even_with_umask_077(self):
        with tempfile.TemporaryDirectory() as tmp:
            acme = Path(tmp) / "acme"
            old_umask = os.umask(0o077)
            try:
                with patch.object(commerce, "ACME", acme):
                    commerce.public_webroot()
                for path in (acme, acme / ".well-known", acme / ".well-known" / "acme-challenge"):
                    self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o755)
            finally:
                os.umask(old_umask)

    def test_challenge_retries_404_then_passes_and_removes_probe(self):
        with tempfile.TemporaryDirectory() as tmp:
            acme = Path(tmp) / "acme"
            count = []
            def curl(*args, **kwargs):
                file = next((acme / ".well-known" / "acme-challenge").iterdir())
                self.assertEqual(stat.S_IMODE(file.stat().st_mode), 0o644)
                count.append(1)
                code = "404" if len(count) == 1 else "200"
                body = "not found" if len(count) == 1 else file.read_text()
                return SimpleNamespace(stdout=body + "\nADS_HTTP_STATUS:" + code)
            old_umask = os.umask(0o077)
            try:
                with patch.object(commerce, "ACME", acme), patch.object(commerce, "cmd", side_effect=curl), patch.object(commerce.time, "sleep", return_value=None):
                    commerce.public_webroot()
                    commerce.probe()
                    self.assertEqual(len(count), 2)
                    self.assertEqual(list((acme / ".well-known" / "acme-challenge").iterdir()), [])
            finally:
                os.umask(old_umask)

    def test_symlink_acme_root_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            real = Path(tmp) / "real"
            real.mkdir()
            fake = Path(tmp) / "fake"
            fake.symlink_to(real)
            with patch.object(commerce, "ACME", fake):
                with self.assertRaises(commerce.Refusal):
                    commerce.public_webroot()

    def test_unexpected_site_is_refused_without_touching_it(self):
        with tempfile.TemporaryDirectory() as tmp:
            site = Path(tmp) / "commerce"
            enabled = Path(tmp) / "commerce-enabled"
            site.write_text("server { server_name unrelated.example; }\n")
            enabled.symlink_to(site)
            with patch.object(commerce, "AVAILABLE", site), patch.object(commerce, "ENABLED", enabled):
                with self.assertRaises(commerce.Refusal):
                    commerce.site_status()

    def test_detects_port_80_hostname_collision_even_if_nginx_t_passes(self):
        with patch.object(commerce, "cmd", return_value=SimpleNamespace(stdout=
                "server { server_name commerce.demo.africadigitalsynergy.com; }\n" * 2)):
            with self.assertRaises(commerce.Refusal):
                commerce.check_hostname_collision(None)

    def test_http_and_https_expected_hostname_counts(self):
        with patch.object(commerce, "cmd", return_value=SimpleNamespace(stdout=
                "server_name commerce.demo.africadigitalsynergy.com;\n")):
            commerce.check_hostname_collision(commerce.http_conf())
        with patch.object(commerce, "cmd", return_value=SimpleNamespace(stdout=
                "server_name commerce.demo.africadigitalsynergy.com;\n" * 2)):
            commerce.check_hostname_collision(commerce.https_conf())

    def test_local_gate_requires_loopback_binding_and_ready_schema(self):
        calls = []
        def cmd(*args, **kwargs):
            calls.append(args)
            if args[:2] == ("docker", "inspect"):
                return SimpleNamespace(stdout="true\n")
            if args[:2] == ("docker", "port"):
                return SimpleNamespace(stdout="127.0.0.1:18086\n")
            if args[0] == "curl" and "/api/ready" in args:
                return SimpleNamespace(stdout='{"status":"ready_for_internal_checks","certification":"EXTERNAL_SIGNOFF_REQUIRED"}')
            return SimpleNamespace(stdout="")
        with tempfile.TemporaryDirectory() as tmp:
            env = Path(tmp) / "commerce.env"
            env.touch()
            with patch.object(commerce, "ENV", env), patch.object(commerce, "cmd", side_effect=cmd):
                commerce.check_local()
        self.assertTrue(any(args[0] == "curl" for args in calls))


if __name__ == "__main__":
    unittest.main()

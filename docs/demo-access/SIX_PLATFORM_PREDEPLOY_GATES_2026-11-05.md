# ADS six-platform demo hosting source readiness (2026-11-05)

This PR prepares **only** the OAuth redirect/post-logout allowlists for the independently hosted Tourism, Transport and Health demos. Education, Agriculture and Morphoo were already allowlisted. All allowed URI values are precise HTTPS hostnames, not wildcards. A source allowlist does **not** mean Identity was re-registered on a running server.

## Safety boundary

Do not add Tourism, Transport, Health or Morphoo to `config/demo-access-platforms.json` yet. Those applications do not have the Commerce-contract gated request, private per-visitor data, expiry/revocation and persona checks evidenced as an integrated release. Merely adding a platform to the list could issue invitations that its application cannot enforce. Registry activation requires product-side implementation and green acceptance tests.

## Remaining source release acceptance

- Verify the exact approved application main SHA, pinned Kit SHA, test suite evidence and route security for all six products.
- For Tourism, Transport, Health and Morphoo: implement and verify the `docs/demo-access/INTEGRATION_CONTRACT.md` boundaries in *their own repositories*; only afterward add their approved visitor roles to the central registry. Never expose ADS staff-only roles to public visitors.
- For Health: obtain clinical safety wording sign-off before publishing any public demo; verify companion PR #6 against main.
- For Transport: repair/validate the latest E2E startup failure, build independent Docker/Compose packaging and review runtime restricted database roles.
- For Morphoo: old `contabo-morphoo-deploy.yml` workflow is explicitly retired in product release notes; **never execute** it. Use only the current pinned main-release runbook.
- Port, DNS, TLS, server secrets, provider configuration, live Identity client registration, backups, rollout and hosted browser certification belong to Codex deployment Steps 9–12.

## Verification

Inspect the JSON and run the Platform Kit's repository tests. Review and merge through normal owner process; no automatic production or Contabo actions are authorized by this PR.

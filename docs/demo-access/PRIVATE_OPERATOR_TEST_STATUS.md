# Private operator visitor evidence

Recorded 5 November 2026 against the local `fix/private-demo-visitor-20261104` source changes based on `fde8209`. This is local evidence, not a deployed or owner-accepted release.

| Check | Actual result |
| --- | --- |
| Initial private/public Demo Access, dashboard and registry tests | 43/43 passed on real PostgreSQL 16 |
| Strengthened private initial-login/SSO and existing identity/security/public flow tests | 45/45 passed on real PostgreSQL 16 |
| Full Identity `npm test` checkpoint after mail suppression, before final token-issuance expiry hardening | 164 passed, 2 failed, 166 total; 247.8 seconds |
| Final affected private/public Identity and refresh-rotation suites after expiry hardening | 46/46 passed, 33.5 seconds; includes valid refresh and correct-PKCE pre-issued code refusal after expiry before housekeeping |
| New private visitor Chromium profiles | 6/6 passed, EN/FR at 360/768/1280px |
| All existing and new kit Chromium browser tests, using the CI-compatible environment variable | 12/12 passed, approximately 1.2 minutes |
| Syntax and `git diff --check` | Passed |

The two full-suite failures are the pre-existing Windows `clients.test.mjs` apply-clients subprocess tests. Its reduced child environment fails Git-worktree detection, allowing a generated test client-secret file in the checkout; its subsequent expected external credential file is absent. No tests/security assertions were weakened. The generated file was removed without reading or logging its contents and must never be staged. A supported Ubuntu CI run remains required for a completely green full regression.

Windows deliberately refuses the operator credential-file CLI because POSIX `0600` is not evidence of Windows ACL security. Local tests cover service-level canonical provisioning and explicit CLI refusal. The test contains an Ubuntu/POSIX branch executing the actual CLI with generated credentials, exclusive owner-only storage, no password stdout and ordinary login; its successful POSIX execution is still a CI gate, not a local claim.

The six new browser cases use the real hosted Identity service, real PostgreSQL, authorization codes with PKCE, remote JWKS signature verification and normal password login. They check failed-password handling, hidden unavailable links, responsive login layout, initial personal-workspace handoff without the generic chooser, all seven permitted persona workspace handoffs through existing SSO, unverified-mailbox claims, no staff roles, secret-required grant checks and revoked authorization refusal. The minimal callback page is an Identity handoff test; it does not replace Commerce's actual persona/till/bank/data browser suite.

The all-browser run also proves the retained legacy persona browser flows still function for internal testing. That is temporary regression preservation, not approval to keep shared credentials as a permanent visitor model. Private mode hides those credentials and prohibits their public exposure.

No real visitor was created on Contabo, no server configuration changed, no secret/password was printed, no legacy account was deleted, and no source was pushed/merged/deployed by these tests. Deployment requires the owner's approval of the tested release/configuration/runbook and the independent shared-sign-in reviews required by the repository handbook.

# Private Commerce visitor: operator provisioning

Story `PLAT-DEMO-PRIVATE-01` (technical enabler, owner assignment 4 November 2026). Completes the existing Demo Access service; no new authentication engine or HTTP provisioning endpoint.

## Modes and boundaries

| Configuration | Behavior |
| --- | --- |
| Both access flags off | Existing disabled Demo Access behavior; grant check and dashboard return 404 |
| `DEMO_ACCESS_ENABLED=1` | Existing public request, approval, invitation and outbox behavior; administrator and notification addresses required |
| `DEMO_ACCESS_PRIVATE_ENABLED=1`, public flag 0 | Private operator provisioning, secret-authenticated grant checks and expiry; public request/dashboard return 404; no outbox processing |

Private mode requires `ADS_ENV=demo`, `DEMO_MODE=1`, `DEMO_SHOW_CREDENTIALS=0`, and a `DEMO_ACCESS_CHECK_SECRET_COMMERCE` of at least 32 characters (or its `_FILE` variant). The two access modes are mutually exclusive. The Commerce API must use the matching secret and its existing grant enforcement/visitor-seeding configuration. Keep internal grant checks off the public proxy. This mode does not need administrator DNS, SMTP or administrator allowlists.

Private mode blocks GET/POST `/register`, `/forgot-password` and the legacy `/v1/identity/register`, hides their login links and refuses unknown Google account creation. Existing password/Google sign-in, OIDC, SSO and valid existing sessions continue normally. Pending-account login does not resend mail. The mail adapter fails closed even when `MAIL_TRANSPORT=log`, so legacy privileged mail operations cannot print invitation/reset tokens. Operator-assisted recovery is required until SMTP and public approvals are explicitly configured; this change adds no password-reset bypass.

These restrictions apply to the isolated demo Identity service as a whole, including its other demo clients, when private mode is explicitly configured. They do not change the production Identity environment or globally revoke sessions.

## Account, grant and persona semantics

The command creates a new regular ADS account (`is_demo=false`, status active) with a random password hashed by the existing scrypt implementation. `email_verified_at` stays NULL: the operator confirmed the private test contact, not possession of the mailbox. Audit metadata records that distinction; signed tokens report `email_verified=false` until a genuine mailbox proof occurs.

Existing account/grant collisions are refused. No password is overwritten or silently reset. A new request/grant and `visit-*` shop/bank organizations use the existing registry and canonical grant-activation helper, shared with future invitation acceptance. Access lasts exactly 30 days from activation. The seven Commerce persona keys are shopper, shop-owner, shop-manager, cashier, accountant, bank-agent and bank-officer. No reviewer, support, ADS staff tenant or identity-administrator authority is granted. Product role narrowing remains the Commerce server's responsibility.

An active approved Commerce visitor initially receives their personal workspace, then returns to Commerce's persona page. Explicit authorized `tenant_hint`/workspace selection still switches shop/bank via SSO; only grant-listed, currently authorized workspaces are eligible. Expired/revoked visitors cannot obtain a fresh Commerce code through a personal-workspace fallback. Ordinary users and legacy internal accounts keep their existing chooser behavior.

The same canonical grant policy is rechecked during code exchange and token refresh, so clock expiry blocks a correctly proved previously issued code or refresh token before hourly housekeeping. The token-path check reads in the current transaction without updating activity, avoiding grant/token lock-order inversion. Other clients and ordinary/internal accounts retain their existing issuance rules.

## Operator commands: reviewed runbook template, not deployment authorization

Before any live command: obtain the security/deployment approval required by the owner assignment, record reviewed image commits, back up the isolated demo databases and configuration, verify migration 007 and the existing Commerce client registration, and confirm the chosen email has no account. This patch adds no migration. Do not bootstrap or reset legacy demo accounts.

The Identity image runs as `node`. A root operator can prepare a temporary root-only directory and run this one-off command as root inside the demo Identity container. Copy its credential file immediately into durable root-only host storage before replacing the container. The secret must never pass through stdout, shell variables, Git, a PR body or application logs.

```bash
# Template only. Run after the approved deployment/configuration and backup steps.
install -d -m 700 /var/lib/ads-demo/operator-secrets
test ! -e /var/lib/ads-demo/operator-secrets/commerce-visitor.json
docker exec -u 0 ads-demo-identity sh -c 'umask 077; mkdir -p /run/ads-private-visitor; chmod 700 /run/ads-private-visitor'
docker exec -u 0 ads-demo-identity node src/cli.mjs demo-visitor-provision \
  --email '<confirmed private visitor email>' \
  --operator-ref '<operator/change-record>' \
  --credentials-out /run/ads-private-visitor/commerce-visitor.json \
  --apply yes
docker cp ads-demo-identity:/run/ads-private-visitor/commerce-visitor.json /var/lib/ads-demo/operator-secrets/commerce-visitor.json
chown root:root /var/lib/ads-demo/operator-secrets/commerce-visitor.json
chmod 600 /var/lib/ads-demo/operator-secrets/commerce-visitor.json
```

The JSON contains email, random password, user/grant/reference IDs, expiry and persona keys. CLI stdout contains sanitized IDs and the credential-file path only. Credential creation uses exclusive `wx`, refuses existing files and paths inside any Git repository, requires an owner-only parent directory and verifies owner-only file permissions. A symlink target is not followed. Windows is explicitly refused because POSIX mode bits do not prove a protected Windows ACL.

The credential is flushed before the provisioning transaction commits. Failure before writing removes the empty file reservation and rolls back database changes. If COMMIT has an unknown outcome after writing, retain the credential file and inspect account/grant state before any retry; never discard the only password for a possibly committed account. Rerunning the same command cannot overwrite an account or credential. The template's durable host destination must be absent before copying; operators must check that separately rather than overwrite another visitor's file.

For the owner to retrieve the private password in their own trusted terminal (do not run this in CI or include its output in reports):

```bash
sudo python3 -c 'import json; print(json.load(open("/var/lib/ads-demo/operator-secrets/commerce-visitor.json"))["password"])'
```

Private grant revocation reuses the existing role/membership/refresh-token shutdown logic and preserves the account, audit and demonstration data:

```bash
docker exec -u 0 ads-demo-identity node src/cli.mjs demo-visitor-revoke \
  --grant '<private grant UUID>' --operator-ref '<operator/change-record>' --apply yes
```

The revocation command verifies private-provisioning audit provenance, cannot revoke an unrelated public invitation grant, and is idempotent for a previously revoked private grant. Existing expiry housekeeping still runs hourly; the grant endpoint rejects clock-expired grants immediately. Commerce's existing cache bounds revocation delay to at most 60 seconds. Neither command deletes accounts or tenant data. A retention/expired-demo-data cleanup process remains a separate reviewed follow-up.

## Verification and remaining gates

`services/identity/test/private-demo-visitor.test.mjs` covers mode isolation, no emails/token logs, regular unverified account creation, exact persona/duration configuration, real login/OIDC/PKCE/SSO, no generic chooser, no admin authority, disjoint visitors, collisions, rollback, expiry/revocation and explicit apply. Its POSIX branch executes the actual CLI, validates a protected exclusive JSON file, no password stdout and normal login with that generated credential. On Windows it verifies refusal; it does not claim POSIX file-security success there.

`packages/e2e-kit/test-browser/private-visitor.spec.mjs` tests the real hosted Identity service, PostgreSQL and verified RS256 code exchanges at EN/FR × 360/768/1280 px. Its minimal callback is an Identity test handoff, not a Commerce UI simulation. Full seven-persona Commerce pages, sample-data seeding, till/bank operations and tenant isolation must be proved in Commerce's own browser suite.

Local results are recorded in `PRIVATE_OPERATOR_TEST_STATUS.md`. No live account, server secret, deployment, password rotation, legacy-account removal or public activation is performed by these source tests. This shared sign-in/authorization change requires the handbook's independent human reviews and owner approval for the concrete security-sensitive deployment.

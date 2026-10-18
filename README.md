# ADS Platform Kit

Shared building blocks for every Africa Digital Synergy (ADS) product, built once and reused by all of them. Each product keeps its own features and data; the kit provides what every product needs.

| Piece | Status | What it gives products |
| --- | --- | --- |
| **Sign-in** (`services/identity`, `packages/identity-client`) | **MVP ready** | One ADS account across all products: register with an activation email, sign in with email/password or Google, forgotten-password email, single sign-on, signed tokens |
| Roles and admin panel | Next | Admins create roles, grant services per organisation, invite and deactivate users |
| Audit trail | Partly (sign-in events) | Who did what and when, viewable by admins |
| Notifications | Planned | Email, SMS, push, USSD through one service |
| Payments | Planned | MTN MoMo and Orange Money |
| Monitoring | Planned | Logs, error alerts, health checks |
| App templates | Planned | PWA, Android and iOS starters |

## How products use it

Two ways, both shown in [docs/INTEGRATING_A_PRODUCT.md](docs/INTEGRATING_A_PRODUCT.md):

1. **Shared services, run once** on the ADS server (the login service today). Products call them over HTTPS.
2. **A small library inside each product**: today, `ads-identity.js`, which provides the `window.adsIdentity` helper that the product screens already expect.

The tokens carry exactly the claims ADS product servers already check: `sub` (user), `tenant_id` (organisation workspace) and `roles`, signed with RS256 and published at `/.well-known/jwks.json`. Because this is standard OAuth 2.0 / OpenID Connect, a later move to Keycloak or another provider changes configuration, not product code.

## Sign-in service at a glance

- Hosted, bilingual (English/French) pages showing each product's own name and logo, "Secured by Africa Digital Synergy" underneath.
- Registration needs email confirmation: the person opens the link (valid 24 h) and types the password they chose, which signs them in. Opening a link alone activates nothing, so mail scanners cannot, and a stranger who pre-registers someone's email cannot take the account. Forgotten-password links are valid 1 h, work once and sign the user out everywhere.
- Google sign-in (optional). An unconfirmed account pre-registered with someone's email loses its unproven password when the real owner signs in with Google.
- Authorization code + PKCE, 15-minute access tokens, rotating refresh tokens with theft detection, single sign-on across products, sign-out everywhere.
- Rate limits on sign-in, registration and email sending; CSRF protection; sign-in requests bound to the browser that started them; `__Host-` cookies; strict security headers; append-only audit of sign-in events with IP.
- Reviewed by an independent security review (18 Oct 2026); every finding is fixed and has a regression test in `services/identity/test/security.test.mjs`.
- The JSON API Software Factory already uses (`/v1/identity/*`, `/internal/*`) is kept unchanged, so Software Factory can switch to this service by changing one address. See [docs/SOFTWARE_FACTORY_SWITCH_OVER.md](docs/SOFTWARE_FACTORY_SWITCH_OVER.md).

Moved from `ksondo/RAG-Intelligence-AI-Platform` `services/identity-service` (main, 18 Oct 2026), which can be archived once Software Factory has switched over.

## Run it

```bash
cp deploy/.env.example deploy/.env      # fill in values
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
docker compose -f deploy/docker-compose.yml exec identity node src/cli.mjs help
```

Guides: [email setup (SPF/DKIM)](docs/EMAIL_SETUP.md) · [Google sign-in setup](docs/GOOGLE_SIGN_IN_SETUP.md) · [connect a product](docs/INTEGRATING_A_PRODUCT.md) · [Software Factory switch-over](docs/SOFTWARE_FACTORY_SWITCH_OVER.md)

## Develop

```bash
cd services/identity
npm ci
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/test npm test   # needs PostgreSQL 16
```

Tests run the real service against a real PostgreSQL database, including a simulated browser using the `ads-identity.js` library.

## Known limits of the MVP

- Rate limits are kept in memory, so run one identity instance (or move limits to Redis before scaling out).
- Until the admin panel exists, operators grant roles with `node src/cli.mjs grant-role ...`.
- Block `/internal/*` at the public reverse proxy; only Software Factory's server needs it, over the private network.
- Phone-number sign-up with SMS codes is not included yet; it can be added to the same service.

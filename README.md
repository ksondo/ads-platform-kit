# ADS Platform Kit

Shared building blocks for every Africa Digital Synergy (ADS) product, built once and reused by all of them. Each product keeps its own features and data; the kit provides what every product needs.

| Piece | Status | What it gives products |
| --- | --- | --- |
| **Sign-in** (`services/identity`, `packages/identity-client`) | **MVP ready** | One ADS account across all products: register with an activation email, sign in with email/password or Google, forgotten-password email, single sign-on, signed tokens |
| **End-to-end test setup** (`packages/e2e-kit`, `.github/workflows/e2e-template.yml`) | **Ready** | Real ADS sign-in on PostgreSQL for tests, Playwright sign-in helpers, test users/tenants/roles, a reusable CI workflow. See [docs/E2E_TESTING.md](docs/E2E_TESTING.md) |
| **Mock providers** (`services/mocks`) | **Ready (first set)** | Test-mode MTN MoMo / Orange Money (collections and refunds), bank cash collection, SMS and email capture, KYC, insurer, registry lookups, dispatch, Progress Agentic RAG: the taught Progress-shaped API under `/progress/api/v1` and the ADS AI Gateway facade under `/ai/v1` (PLAT-EXT-001). See [services/mocks/README.md](services/mocks/README.md) |
| **AI gateway client** (`packages/ai-gateway-client`) | **Ready for mock testing** | Server-side client for the ADS AI Gateway contract v1, EN/FR user messages, an in-process test double and the shared contract schemas. Live Progress: EXTERNAL INTEGRATION PENDING. See [packages/ai-gateway-client/README.md](packages/ai-gateway-client/README.md) |
| **Roles, admin page and invitations** (`services/identity` `/admin`, `/admin/v1`, `/invite`) | **MVP ready** (PLAT-ROLE-001) | Organisation admins list members, grant/revoke product roles, deactivate members and invite people (email, SMS hook) on a bilingual hosted page, or from the product's own screens through the admin API (product server token exchange, no service-role bypass). See [docs/INTEGRATING_A_PRODUCT.md](docs/INTEGRATING_A_PRODUCT.md#organisations-roles-and-invitations-plat-role-001). Per-role menus of services (AC-1) remain the product's job for now |
| Audit trail | Partly (sign-in and admin events; no viewer yet) | Who did what and when, viewable by admins |
| Notifications | Planned | Email, SMS, push, USSD through one service |
| Payments | Planned | MTN MoMo and Orange Money |
| Monitoring | Planned | Logs, error alerts, health checks |
| App templates | Planned | PWA, Android and iOS starters |

## Standards and requirements

The ADS Handbook is the standard for building every ADS app. It is hosted in both places: the source is in [Software Factory `docs/handbook/`](https://github.com/ksondo/Software-Factory/tree/main/docs/handbook), and a copy sits here in [`docs/handbook/`](docs/handbook/) next to the services that implement it ([how the copy is kept in step](docs/handbook/MIRROR.md)).

- [ADS Software Delivery Handbook](docs/handbook/ADS_SOFTWARE_DELIVERY_HANDBOOK_v1.md): how every ADS product is specified, built, tested and released.
- [ADS Platform Requirements](docs/handbook/PLATFORM_REQUIREMENTS.md): what every product must meet. This kit delivers them: PLAT-ID-001/002 (sign-in), PLAT-ROLE-001 (organisation admin, roles and invitations) and the shared mock providers for PLAT-EXT-001 (mock bank, MoMo/Orange Money, regulator, insurer, KYC and more) today; PLAT-AUD, PLAT-NOT, PLAT-PAY, PLAT-I18N/UX/A11Y and PLAT-CH next.
- [UI/UX register](docs/handbook/UIUX_REGISTER.md): the master design system the kit's shared screens use.

## How products use it

Two ways, both shown in [docs/INTEGRATING_A_PRODUCT.md](docs/INTEGRATING_A_PRODUCT.md):

1. **Shared services, run once** on the ADS server (the login service today). Products call them over HTTPS.
2. **A small library inside each product**: today, `ads-identity.js`, which provides the `window.adsIdentity` helper that the product screens already expect.

The tokens carry exactly the claims ADS product servers already check: `sub` (user), `tenant_id` (organisation workspace) and `roles`, signed with RS256 and published at `/.well-known/jwks.json`. Because this is standard OAuth 2.0 / OpenID Connect, a later move to Keycloak or another provider changes configuration, not product code.

### Building a standalone app

A standalone app (one that is not part of a larger ADS product) uses the kit the same way: it keeps its own screens, server and database, and **calls the kit's services** over HTTPS for what every app needs — sign-in today, then roles, audit, notifications and payments. It never copies the kit's code or stores passwords. Running the kit once means every app shares one account, one admin panel and one audit trail.

## Sign-in service at a glance

- Hosted, bilingual (English/French) pages showing each product's own name and logo, "Secured by Africa Digital Synergy" underneath.
- Registration needs email confirmation: the person opens the link (valid 24 h) and types the password they chose, which signs them in. Opening a link alone activates nothing, so mail scanners cannot, and a stranger who pre-registers someone's email cannot take the account. Forgotten-password links are valid 1 h, work once and sign the user out everywhere.
- Google sign-in (optional). An unconfirmed account pre-registered with someone's email loses its unproven password when the real owner signs in with Google.
- Authorization code + PKCE, 15-minute access tokens, rotating refresh tokens with theft detection (a 30-second grace window returns the same successor, so quick reloads and duplicated tabs never sign users out), single sign-on across products, sign-out everywhere.
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

### Environments, and the demo environment

| Setting | Meaning |
| --- | --- |
| `ADS_ENV` | `production` (default unless `IDENTITY_DEV_MODE`), `demo`, `staging`, `test`, `development` |
| `IDENTITY_LEGACY_ONBOARD_ENABLED` | Old self-service `POST /v1/identity/onboard` (ACC-03). Off by default (404). The service refuses to start with it on in production or demo |
| `IDENTITY_STRICT_ROLE_GRANTS` | Only a product's `assignable_roles` can be granted or invited; a product with none allows no grants. Always on in production, on by default in demo |
| `DEMO_MODE=1` | Demo accounts work only when `ADS_ENV=demo` **and** `DEMO_MODE=1`. Anywhere else they are refused at sign-in and cannot be created; in production `DEMO_MODE=1` stops the start |
| `DEMO_EMAIL_DOMAIN`, `DEMO_USER_EMAIL`, `DEMO_USER2_EMAIL`, `DEMO_ADMIN_EMAIL` | Demo addresses (default `demo.user@`, `demo.checker@`, `demo.admin@demo.africadigitalsynergy.com`). The domain is reserved: nobody can register under it |
| `DEMO_USER_PASSWORD`, `DEMO_USER2_PASSWORD`, `DEMO_ADMIN_PASSWORD` (or `*_FILE`) | Demo passwords, from server secrets. Never printed |
| `DEMO_PERSONA_PASSWORD` (or `_FILE`) | One shared password for every demo persona (below). Must differ from the checker's and the admin's. Without it, personas are skipped |
| `DEMO_SHOW_CREDENTIALS=1` | Demo mode only: the sign-in page shows the demo **user** (never the admin) with a "Use demo account" button, and the personas of the product the tester came from |

Demo set-up, inside the identity container (`ADS_ENV=demo DEMO_MODE=1`):

```bash
node scripts/apply-clients.mjs --secrets-out /run/secrets-out/client-secrets.json   # config/clients.demo.json; secrets only in that file (0600)
node src/cli.mjs demo-bootstrap                          # demo user, second demo user (maker-checker), demo admin, demo personas
node src/cli.mjs demo-orgs --out /tmp/demo-tenants.json   # demo + ADS staff organisations; product -> tenant ids and settings
node src/cli.mjs demo-reset --out /tmp/demo-tenants.json  # nightly (cron): restore accounts, sign-ins, memberships and roles
```

`register-client` (and `apply-clients`) accepts `https://` redirect URIs, `http://localhost:<port>/`, and, when `ADS_ENV` is not `production`, `http://127.0.0.1:<port>/`. Production refuses `127.0.0.1`.

Tokens carry `demo: true` for demo accounts and organisations and `ads_staff: true` for organisations an operator marked as ADS staff (`cli.mjs mark-staff-org --tenant <id>`, ACC-04).

#### Demo personas

`config/demo-personas.json` lists, per product of `config/clients.demo.json`, single-job demo accounts ("Cashier", "Bank agent", "Driver", "Teacher", ...): `{key, label:{en,fr}, hint:{en,fr}, org, roles}`. `org` is one of the product's `demo_orgs` keys or `personal` (the account's own workspace, which holds exactly the product's self-service roles). Products extend their list there; `demo-bootstrap`, `demo-orgs` and `demo-reset` validate it against the client list.

- Accounts `demo.<product>.<key>@<DEMO_EMAIL_DOMAIN>`, all `is_demo`, password `DEMO_PERSONA_PASSWORD` (never printed). Each persona is a plain member of **exactly one** workspace with **exactly** its roles; `demo-reset` restores that, its password and its language, ends its sign-ins, and disables personas removed from the file. The demo user, checker and admin are unchanged.
- The demo sign-in page (`DEMO_SHOW_CREDENTIALS=1`) shows the personas of the product the tester came from (`client_id`), labelled in the page language, each with **Use this account** (fills the form; then Continue). The demo admin is never shown.
- Seeds read the subs from the tenants file (`--out`):

```json
{
  "generated_at": "…",
  "demo_accounts": { "user": "<sub>", "user2": "<sub>", "admin": "<sub>" },
  "products": {
    "commerce": {
      "client_id": "commerce-web",
      "tenants": { "main": "<tenant>", "bank": "<tenant>", "staff": "<tenant>" },
      "staff_tenants": ["<tenant>"], "settings": {}, "operator_setup": [],
      "personas": {
        "cashier": { "sub": "<sub>", "email": "demo.commerce.cashier@…", "org": "main", "tenant_id": "<tenant>", "roles": ["commerce_cashier"], "label": { "en": "Cashier", "fr": "Caissier" } },
        "shopper": { "sub": "<sub>", "email": "demo.commerce.shopper@…", "org": "personal", "tenant_id": "<personal tenant>", "roles": ["commerce_buyer"], "label": { "en": "Shopper", "fr": "Client" } }
      }
    }
  },
  "personas": { "commerce.cashier": "<sub>", "commerce.shopper": "<sub>" }
}
```

Persona subs and tenant ids stay the same across `demo-reset`. A `personal` persona's workspace is created by `demo-orgs`, so seeds know its tenant id before anyone signs in.

- Playwright: `signInAsPersona(page, 'cashier', { startUrl, lang })` from `@ads/e2e-kit/playwright` opens the real sign-in page from the product, presses **Use this account** and Continue (no password in the test). Without `button` it forces the sign-in page (`prompt=login`), so two personas can take turns in one browser.
- Reuse for other demo sets (e.g. a per-tester sandbox): `personaAccounts(settings, personasDoc, clientsDoc, { set })`, `ensurePersonaAccounts(pool, settings, personas, password, { set })`, `ensureDemoOrgs(pool, settings, clientsDoc, { personas, set, ownerId })` and `placePersonas(c, personas, map, { set })` in `services/identity/src/demo.mjs`. A named set gets its own organisations (`<set>/<product>:<org>`, owned by `ownerId`) and personas (`demo.<set>.<product>.<key>@…`); the global `demo-reset` and the global sign-in page leave it alone.

#### Sign-in language

The sign-in page uses, in order: the language chosen on the page, the product's `ui_locales` (`adsIdentity.signIn({ lang })`; lists and region tags such as `fr-CM en` are understood), then the browser. The language of the sign-in is returned in the token claim `locale` (`en`/`fr`) and is **never saved on the account**. Products must not let a language saved for a demo account (`demo: true`) override the visible choice: use their own switch, or the `locale` claim.

## Develop

```bash
cd services/identity
npm ci
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/test npm test   # needs PostgreSQL 16
```

Tests run the real service against a real PostgreSQL database, including a simulated browser using the `ads-identity.js` library.

End-to-end setup for products (real sign-in, mocks, Playwright, CI template) and its self-test: [docs/E2E_TESTING.md](docs/E2E_TESTING.md).

## Known limits of the MVP

- Rate limits are kept in memory, so run one identity instance (or move limits to Redis before scaling out).
- Operators create organisations and their first owner with `node src/cli.mjs create-organization`; everything after that is done by the organisation's admins (`/admin` or the admin API).
- Invitation SMS go to `IDENTITY_SMS_URL` (the mocks in tests); real SMS waits for the notification service.
- Block `/internal/*` at the public reverse proxy; only Software Factory's server needs it, over the private network.
- Phone-number sign-up with SMS codes is not included yet; it can be added to the same service.

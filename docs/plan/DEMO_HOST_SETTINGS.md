# Demo host settings checklist (25 products)

**Date:** 20 Oct 2026. **For:** whoever sets up the demo host (`ADS_ENV=demo DEMO_MODE=1`).
**Sources:**
- The demo sign-in checks `demo-check/G1.md`–`G4.md`.
- `config/clients.demo.json` in the kit, as corrected on `fix/demo-clients-20261020`.
- Each product's `main` branch.
- The owner's VentureWorks decision of 20 Oct 2026.

No secret values appear in this file. Every secret named here comes from the host's secret store, from `apply-clients --secrets-out`, or is generated on the host. None is ever printed.

## 1. Run order

1. **Kit `apply-clients`** (identity container): `node scripts/apply-clients.mjs --secrets-out /run/secrets-out/client-secrets.json`. This registers the 25 sign-in clients. Client secrets go only into that file (mode 0600).
2. **Kit `demo-bootstrap`**: `node src/cli.mjs demo-bootstrap`. This creates the demo user, the second demo user (maker-checker) and the demo admin.
3. **Kit `demo-orgs`**: `node src/cli.mjs demo-orgs --clients <same list as step 1> --out /tmp/demo-tenants.json`. This creates the demo and ADS staff organisations. Below, `<main>`, `<staff>`, `<bank>`, `<shipper>` and `<union>` are tenant ids taken from that file.
4. **Per-product migrate**, as each product's owner login (command in section 3). Then create the runtime logins the product expects.
5. **Staff sync scripts and operator setup**: the "Operator setup" lines in section 3. Examples: Career Path `db/staff-tenants.mjs`, Agriculture `add-staff-tenant`, Software Factory `register-staff-org`, Commerce `register-bank`/`capability`, AfriCover `platform_operators`, PMP organisation link.
6. **Seeds**, per product (section 4). Some need the demo accounts to have signed in once first (PMP, HopeBridge). Then the VentureWorks demo seed (section 5), once it is built.

Nightly: `node src/cli.mjs demo-reset --out /tmp/demo-tenants.json`. Tenant ids stay the same. Re-run step 6 only if the product data was wiped.

## 2. Settings common to every product

| Setting | Value |
| --- | --- |
| `OIDC_ISSUER`, `OIDC_JWKS_URL` (`<identity>/.well-known/jwks.json`), `OIDC_AUDIENCE=<client id>` | kit identity |
| `ADS_IDENTITY_URL`, `ADS_IDENTITY_CLIENT_ID=<client id>` | kit identity (web build-time for some products) |
| `ADS_MOCKS_URL` | kit mocks: test-mode payments, SMS, e-mail, KYC, banks, AI |
| `ADS_MOCKS_WEBHOOK_SECRET` | **must equal the kit mocks' `MOCKS_WEBHOOK_SECRET`**. Required by every product marked **W** below. |
| `PUBLIC_URL` (and `CALLBACK_BASE_URL` where listed) | the product's `https://<slug>.test.africadigitalsynergy.com` origin. It must match the registered redirect URI exactly. |
| `DATABASE_URL` | a **runtime** login (no owner, no superuser, no BYPASSRLS), plus a separate owner login for migrations |

Plain-http loopback switches (`OIDC_ALLOW_LOOPBACK_HTTP`, `OIDC_ALLOW_HTTP_LOCALHOST`, `OIDC_ALLOW_INSECURE_LOOPBACK`, `OIDC_ALLOW_HTTP_LOOPBACK`, `IIP_ALLOW_INSECURE_LOCALHOST`) are for **local runs only**. Never set them on the https host. For local runs, the kit now also accepts `http://127.0.0.1:<port>/` redirect URIs outside production (`fix/demo-clients-20261020`).

## 3. Settings per product

"Client secret" names the product setting that receives that client's secret from `client-secrets.json`. `—` means none: the client has no secret, or the product does not read it.

| # | Product (repo, client id) | Staff / tenant settings | Client secret | Test-mode partner services (besides `ADS_MOCKS_URL`) | Migrate · operator setup · special cases |
| --- | --- | --- | --- | --- | --- |
| 1 | Commerce (`ads-commerce-platform`, `commerce-web`) | — | — | **W**; mock bank and SMS through kit mocks; `COMMERCE_HANDOVER_SECRET` (32+), `COMMERCE_PUBLIC_API_URL` (bank callback) | `npm run migrate`. `node scripts/commerce-admin.mjs register-bank --tenant <bank> --name "ADS Demo Bank (mock)"`, then `capability --tenant <main> --capability BANK_COLLECTION --enabled true`. **Must not run with `NODE_ENV=production`**: that turns the mocks off and makes the journeys read-only. Web build: `COMMERCE_PUBLIC_URL`, `COMMERCE_API_URL`. |
| 2 | VentureWorks (`africa-digital-synergy-ventureworks`, `ventureworks-web`) | — | — | **W**; `VW_TEST_MODE=true`, `VW_PAYMENTS_MODE=mock`, `VW_RAG_MODE=mock`, `VW_EMAIL_MODE=mock`; Investment: `VW_IIP_BASE_URL`, `WPB_REFERRAL_TOKEN`, `WPB_INVESTMENT_PROVIDER`, `WPB_INVESTMENT_WEBHOOK_SECRET` | `MIGRATION_DATABASE_URL`, `npm run db:migrate`. Runtime login is a member of `ventureworks_api`. Also `VW_PUBLIC_URL`, `VW_ASSESSMENT_PRICE_XAF` (test value), `VW_ASSESSMENT_TERMS_VERSION`, `VW_SUPPORT_EMAIL`. Needs the no-venture fix (PR #91, `fix/demo-no-venture-20261020`). |
| 3 | Education (`education-and-intelligent-services`, `education-web`) | `EDU_PLATFORM_TENANT_ID=<staff>` | `ADS_IDENTITY_CLIENT_SECRET` (not `EDU_…`) | **W**; `EDU_PAYMENTS_PROVIDER=mock`, `EDU_NOTIFY_PROVIDER=mock`; `EDU_AI_GATEWAY_URL=<mocks>/ai/v1` + `EDU_AI_GATEWAY_CLIENT_SECRET` (same value on the mock facade) | `scripts/migrate.mjs` with `MIGRATION_DATABASE_URL`, creating `EDU_RUNTIME_ROLE`, `EDU_WORKER_ROLE` and `EDU_WEBHOOK_ROLE` → `DATABASE_URL`, `EDU_WORKER_DATABASE_URL`, `EDU_WEBHOOK_DATABASE_URL`. Also `EDU_TRANSCRIPT_SIGNING_KEY_PEM` (ed25519), `WEB_ROOT=dist`. |
| 4 | Fleet Guard (`fleet-guard-and-intelligent-services`, `fleet-guard-web`) | — | — | — | `node db/migrate.mjs` (owner). `DATABASE_URL`: an INHERIT login granted `fleetguard_app`. |
| 5 | Digital Tontine (`digital-tontine-and-intelligent-services`, `tontine-web`) | — | — | **W**; `EXTERNAL_MODE=mock` | `MIGRATION_DATABASE_URL`. The API switches to `tontine_app` itself. Also `CALLBACK_BASE_URL`. |
| 6 | Hub (`africa-digital-synergy-hub`, `hub-web`) | `HUB_OPERATOR_TENANT_ID=<staff>` | — | — | `MIGRATION_DATABASE_URL`; runtime login granted `hub_runtime`. **Needs a sign-in database connection: `IDENTITY_ADMIN_DATABASE_URL`**, a narrow-rights login on the identity database. Hub writes access approvals there until ACC-13. |
| 7 | Career Path (`career-path-platform`, `career-path-web`) | `CAREER_STAFF_TENANT_IDS=<staff>` | — | — | `db/migrate.mjs` → `db/seed.mjs` (TEST MODE) → **`db/staff-tenants.mjs`** (syncs the staff ids) → `db/runtime-login.mjs` (`RUNTIME_DB_ROLE`, `RUNTIME_DB_PASSWORD`, `RUNTIME_DATABASE_URL`) |
| 8 | Nutrition (`nutrition-intelligence-platform`, `nutrition-web`) | — | — | `NODE_ENV=test` (as in its E2E) | Runtime login in `nutrition_app_rt`; `NUTRITION_WORKER_DATABASE_URL` in `nutrition_worker`. Food dataset release (section 4). |
| 9 | Personal Finance (`personal-life-financial-intelligence`, `plfi-web`) | `PLFI_SUPPORT_TENANT_ID=<staff>` | — | — | `MIGRATION_DATABASE_URL` (`plfi_owner`); `DATABASE_URL` (`plfi_app` in `plfi_runtime`), see `db/bootstrap.example.sql` |
| 10 | Morphoo (`go-ahead-guesser`, `morphoo-web`) | — | — | — | `node scripts/database/migrate.mjs` (needs `psql`). API: `ALLOWED_ORIGINS`, `FILE_STORAGE_ROOT`, `PUBLIC_API_BASE_URL=/api`. Web build: `VITE_MORPHOO_API_URL=/api`, `VITE_ADS_IDENTITY_ISSUER`, `VITE_ADS_IDENTITY_CLIENT_ID`. `/api` reverse proxy. |
| 11 | Logistics (`logistics`, `logistics-web`) | — | `ADS_IDENTITY_CLIENT_SECRET` (staff invite screen) | **W**; `PAYMENTS_MODE=mock`, `SMS_MODE=mock`, `KYC_MODE=mock`; `PROVIDER_WEBHOOK_SECRET` | `MIGRATION_DATABASE_URL`; runtime login in `logi_app`. Also `CALLBACK_BASE_URL`. Staff invitations and zones (section 4). |
| 12 | MamaCare (`mama-care-and-intelligent-services`, `mamacare-web`) | — | — (removed; unused) | `EXTERNAL_MODE=test`, `CONTENT_MODE=test`, `NODE_ENV=test` | `DATABASE_URL` owner; the server switches to `DB_RUNTIME_ROLE=mamacare_app`. The demo admin now holds `facility_admin` (kit fix), so it no longer lands on "No access yet". |
| 13 | Leisure & Events (`ads-leisure-recreation-events`, `leisure-web`) | — | — | — | `src/server/migrate.mjs`; logins granted `leisure_runtime` and `leisure_worker` → `DATABASE_URL`, `WORKER_DATABASE_URL`. `npm run build` first. |
| 14 | SoulBridge (`soulbridge-mental-health-project`, `soulbridge-web`) | — | — | — | `node src/db/migrate.mjs`. Redirects `/` and `/signed-in`. |
| 15 | Health (`health`, `health-web`) | `HEALTH_REVIEW_TENANT_ID=<staff>` | `HEALTH_IDENTITY_CLIENT_SECRET` | `HEALTH_TEST_MODE=true` | `DATABASE_MIGRATION_URL=<owner> node scripts/migrate.mjs`; logins granted `health_app` and `health_job` → `DATABASE_URL`, `HEALTH_JOB_DATABASE_URL`. Uses `OIDC_CLIENT_ID=health-web`. |
| 16 | Home Services (`home-services`, `home-services`) | `HOME_PUBLIC_TENANT_ID=<main>`, `HOME_MARKETPLACE_TENANT_IDS=<main>` | — | **W** (required); `ADAPTERS_MODE=mock`; `HOME_WEBHOOK_SECRET` | `node src/migrate.mjs` with `HOME_RUNTIME_ROLE`/`HOME_RUNTIME_PASSWORD`. Also `CALLBACK_BASE_URL`. |
| 17 | Project Management (`project-management-platform`, `pmp-web`) | — | `ADS_IDENTITY_CLIENT_SECRET` | `PMP_TEST_MODE=true` | `migrate.js` with `DATABASE_URL` (owner), `DATABASE_APP_URL`, `PMP_APP_DB_USER`/`PMP_APP_DB_PASSWORD`, `MIGRATIONS_DIR=database/migrations`. `PUBLIC_URL` = the **web** origin; `/api` proxied to the API. Organisation link and tester profile (section 4). **Its `main` auto-deploys to a live server: apply demo rows to the demo database only.** |
| 18 | AfriCover (`africover-insurance-project`, `africover-web`) | — | — | **W**; `PROVIDERS_MODE=mock` | `node src/migrate.mjs`. As the database owner: `INSERT INTO cover.platform_operators(tenant_id,name) VALUES ('<staff>','ADS Staff – AfriCover operator')`. Weather-trigger journeys only: `COVER_AGRICULTURE_URL`, `COVER_SOURCE_AGRICULTURE_SECRET`. |
| 19 | Agriculture (`agriculture`, `agriculture-web`) | — | — (the server reads none; the generated secret is unused) | **W**; `EXTERNAL_MODE=mock`; `AGRI_PARTNER_AFRICOVER_SECRET` | `MIGRATION_DATABASE_URL` (a login that can create roles). `DATABASE_URL` must be a member of `agri_app`/`agri_worker`; the server refuses owner or superuser. `npm run admin -- add-staff-tenant <staff> "ADS Staff – Agriculture"` needs the fix on `fix/admin-staff-tenant-20261020` (PR #5). |
| 20 | Investment (`intelligent-cryptocurrency-platform`, `iip-web`) | — | `ADS_IDENTITY_CLIENT_SECRET` (staff-roles screen) | VentureWorks double `tests/support/ventureworks-mock.mjs`: `VW_CONSENT_VERIFY_BASE_URL`, `VW_SERVICE_TOKEN`, `VW_EVENTS_URL`, `VW_EVENTS_SIGNING_SECRET`, `VW_EVENTS_PROVIDER=ads-iip` | `IIP_STATIC_DIR=dist` (`vite build` first), `IIP_DISCOVERY_ENABLED=1`, `IIP_PREVIEW_JOURNEYS=1`, `IIP_PROGRESS_RAG_KB` |
| 21 | HopeBridge (`hopebridge`, `hopebridge-web`) | — | `ADS_ADMIN_CLIENT_SECRET` | **W**; `PARTNER_MODE=mock`, `HOPEBRIDGE_PARTNER_MOCKS_URL` + `PARTNER_MOCKS_WEBHOOK_SECRET` (run `server/mocks/test-mode-partners.ts`) | `STATIC_DIR=dist`, `ALLOWED_ORIGINS`, `PUBLIC_CALLBACK_BASE_URL`, `EVIDENCE_STORAGE_ROOT`. **Build the web bundle per host**: `VITE_ADS_IDENTITY_URL`, `VITE_ADS_CLIENT_ID` and `VITE_ADS_REDIRECT_URI` are compiled in. Membership link (section 4). |
| 22 | Tourism (`tourism-platform`, `tourism-web`) | **`TOUR_PLATFORM_TENANT_ID=<staff>`** (required for `tour_admin`) | — (removed; unused) | **W**; `PAYMENTS_MODE`, `REGISTRY_MODE`, `COMMERCE_POS_MODE`, `SETTLEMENT_MODE` = `mock`; `COMMERCE_POS_URL` → `mocks/commerce-pos-mock.mjs`, `SETTLEMENT_URL` → `mocks/settlement-mock.mjs` | `TICKET_SIGNING_KEYS` (`kid:base64`). Also `CALLBACK_BASE_URL`. |
| 23 | Banking (`banking-platforms`, `banking-web`) | **`BANKING_OPERATOR_TENANT_IDS=<main>`** | — | **W**; `PROVIDERS_MODE=mock`; `BANK_MOCKS_URL`, `BANK_MOCKS_WEBHOOK_SECRET`, `AI_GATEWAY_CLIENT_SECRET` from the product's `mocks/server.mjs` (`startBankMocks`) | Also `CALLBACK_BASE_URL`. Demo partner bank (section 4). |
| 24 | Transport (`transport-platform`, `transport-web`) | — | — | **W**; `PAYMENTS_MODE`, `FLEETGUARD_MODE`, `LOGISTICS_MODE` = `mock`; `PARTNER_MOCKS_URL` → `scripts/partner-mocks.mjs` | `TICKET_SIGNING_KEY`. Also `CALLBACK_BASE_URL`. |
| 25 | Software Factory (`software-factory`, `software-factory`) | — | — (removed; unused at run time. `scripts/deploy/sf-go-live-preflight.sh` still checks `ADS_IDENTITY_CLIENT_SECRET`; skip that check on the demo host.) | `SF_E2E=1` (test-mode LLM adapter); `PROGRESS_RAG_URL`, `ANTHROPIC_BASE_URL`/`ANTHROPIC_API_KEY`, `OPENAI_COMPAT_*`, `GITHUB_*` (including the webhook secret) and `MINICLOUD_*` all point at `tools/partner-mocks/server.mjs` | `npm run build:portal` first. `FILE_STORE_DIR`. `npm run sf-admin -- register-staff-org <staff>`. |

The RAG gateway (`rag-intelligence-ai-platform`) has no sign-in client. Add each product's audience to `ADS_LEGACY_PLATFORM_AUDIENCES`.

## 4. Per-product demo data (section C items)

Run these after migrate and operator setup.

| Product | Step | Detail (from the check reports) |
| --- | --- | --- |
| Project Management | Organisation link and tester profile | As the PMP owner: `INSERT INTO org.organizations (name, code, identity_tenant_id) VALUES ('ADS Demo – Project Management','ADSDEMO','<main>')`. Without it every user gets "No access yet". **After the demo user's first sign-in**, add `contribution.tester_profiles(organization_id,user_id,display_name)` and `iam.user_role_grants(…, role_code='tester', tester_profile_id=…)`. Without it, `/tester` returns 403 `tester_profile_required`. |
| Logistics | Staff invitations and zones | `logi.staff` rows for the demo users (staff invitations from the demo admin) and the operator's delivery zones and prices. Without zones and prices there are no parcel quotes. |
| Digital Tontine | Demo group | The demo admin (`group_admin`) creates "ADS Demo savings group" and adds the demo user and the second demo user as members. Both hold treasurer and payout_approver, for maker-checker. Without a group, the group screens cannot be reached. |
| Nutrition | Food dataset release | Maker-checker as `food_data_admin` in the Nutrition staff organisation: the demo user imports the TEST food CSV and the second demo user releases it. Also load the mock RAG corpus `nutrition` (`PUT /_control/rag/corpus`). Without this, plan generation has no foods. |
| HopeBridge | Membership link | **After the demo accounts' first sign-in:** `public.organisations('ADS Demo – NGO','licensed_ngo','active', ads_tenant_id='<main>')`. Add `public.memberships` for the demo user (every main-org role except `community_user`) and the demo admin (`ngo_admin`), plus `public.user_roles(platform_admin)` for staff. The full SQL is in G4.md. |
| Banking | Demo partner bank | As the demo admin on `/operations/partners`: add partner code `DEMO1`, licence `LIC-DEMO1` (mock registry), `partnerTenantId=<main>`, then one product. The operator organisation can also be the partner bank. |
| Education | Demo partner organisation | Register a partner organisation (`edu_partner`) above "ADS Demo – Test School". Without it, the Partner dashboard says "You do not have access to this page". |
| Commerce *(wanted)* | One published product | Owner draft, then review by the staff org's `commerce_reviewer`. Without it, the marketplace and catalogue are empty. |
| VentureWorks | Four sample ventures | See section 5 |
| Optional | Sample catalogue data | Fleet Guard (2–3 vehicles, one work order), Career Path profile, Morphoo church, Leisure activities, SoulBridge centre, Health facility, Home Services provider, PMP project, AfriCover insurer and product, Tourism, Transport, Investment, Agriculture |

## 5. VentureWorks demo seed (spec)

**Status:** owner decision, 20 Oct 2026. **This spec is the input for the sample-data build after the weekly reset. Do not build the seed before then.**

The demo data is four sample ventures, one for each pilot platform. The pilots come from `LAUNCH_PLAN_WAVE1.md`, `COMMERCE_EDUCATION_PLAN.md` and `FLEETGUARD_TONTINE_PLAN.md`.

| # | Venture | Parent platform | What it shows |
| --- | --- | --- | --- |
| 1 | **POS Deployment Network – Yaoundé** | Commerce | Master plan Pilot A (COM-001). A partner running merchant digitisation. |
| 2 | **School SaaS partner** | Education | Serves 2–3 private schools |
| 3 | **Fleet management reseller** | Fleet Guard | Serves 3–5 transport companies on an Essentials package |
| 4 | **Association management partner** | Digital Tontine | Serves 3–5 associations, record-only |

**Each venture has:**
- **Basics:** the parent platform, a short description and a stage. The demo users are founder and team: the demo user is founder; the second demo user and the demo admin are team members.
- **Plan:** a business plan, a budget, and three financial scenarios (conservative, base, optimistic).
- **KPIs and evidence:** 5–8 KPIs with mixed statuses: not started, in progress, submitted and approved. Some have evidence attached.
- **Readiness:** a readiness view that is filled in.
- **Test values only:** every amount is labelled **"Illustrative / test values"**. Never use the 9,500,000 FCFA example as a price.

**Acceptance:**
- After a reset and the seed, the demo user signs in, can switch between the four ventures, and each opens on its readiness view.
- A fresh organisation with no venture sees the "start a venture" message, not a blank page (PR #91).

## 6. Open points

- MamaCare: the "No access yet" page could also show organisation owners a link to `/admin` (G2 option b). This is not done; the `facility_admin` admin role fixes the demo.
- Tontine: alternatively, give the demo user `group_admin` in `clients.demo.json` so a visitor can create a group.
- PMP: put the two setup statements into the PMP `operator_setup`, or have `demo-orgs` print them with the tenant ids filled in.
- Several products read a staff-tenant setting that `clients.demo.json` does not fill in: `COMMERCE_STAFF_TENANT_IDS`, `FLEET_STAFF_TENANT_IDS`, `MAMACARE_STAFF_TENANT_IDS`, `NUTRITION_STAFF_TENANT_IDS`, `SOULBRIDGE_STAFF_TENANT_IDS`, `MORPHOO_STAFF_TENANT_IDS`. The checks passed without them. Set them to `<staff>` if staff screens are demoed.

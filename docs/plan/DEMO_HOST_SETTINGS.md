# Demo host settings checklist (25 products)

**Date:** 20 Oct 2026. **For:** whoever sets up the demo host (`ADS_ENV=demo`).
**Sources:** `config/clients.demo.json` (kit, with the 20 Oct corrections on `fix/demo-clients-20261020`), each product's `main` branch (settings read in its code), the owner's VentureWorks decision of 20 Oct 2026, and the demo-check notes.
**Gap:** the four demo-check reports (`docs/plan/demo-check/G1.md`–`G4.md`) were not on this branch when this file was written. Rows marked *(confirm)* should be checked against them once they are committed.

No secret values appear here. Every secret named below comes from the host's secret store and is never printed.

## 1. Run order

Do these in order. Steps 1–3 run inside the identity container with `ADS_ENV=demo DEMO_MODE=1`.

1. **Kit `apply-clients`**: `node scripts/apply-clients.mjs --secrets-out /run/secrets-out/client-secrets.json`. This registers the 25 sign-in clients. Client secrets are written only to that file (mode 0600). Copy each into the product's secret setting (column "Client secret" below).
2. **Kit `demo-bootstrap`**: `node src/cli.mjs demo-bootstrap`. This creates the demo user, the second demo user (maker-checker) and the demo admin.
3. **Kit `demo-orgs`**: `node src/cli.mjs demo-orgs --out /tmp/demo-tenants.json`. This creates the demo and ADS staff organisations and lists each product's tenant ids and settings. Fill the "Tenant settings" column below from this file.
4. **Per-product migrate**: run each product's database migration as its owner role, e.g. `npm run db:migrate`.
5. **Staff sync scripts / operator setup**: the "Operator setup" column (one-off commands with the product's owner credentials).
6. **Seeds**: per-product demo data (section 3), then the VentureWorks demo seed (section 4) once it is built.

Nightly: `node src/cli.mjs demo-reset --out /tmp/demo-tenants.json` (cron). After a reset, re-check section 3 links that refer to tenant ids.

## 2. Settings per product

**Common to every product:**
- `ADS_IDENTITY_URL` (the kit issuer)
- the client id from `clients.demo.json`
- `ADS_MOCKS_URL` pointing to the kit mocks service (test-mode partner services: payments, SMS, e-mail, banks)
- `ADS_MOCKS_WEBHOOK_SECRET` where the product reads it (marked **W** below). Use the same value as the kit mocks `MOCKS_WEBHOOK_SECRET`.

**Columns:**
- "Tenant settings": `staff` = the ADS Staff organisation id from `demo-orgs`; `main` = the demo organisation id.
- "Client secret": `—` = browser client with no secret.

| # | Product (repo) | Client id | Tenant settings | Client secret | Test-mode partner services / webhooks | Operator setup and special cases |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Software Factory (`software-factory`) | `software-factory` | — | — (removed 20 Oct; `sf-go-live-preflight.sh` still asks for `ADS_IDENTITY_CLIENT_SECRET`. Skip that check on the demo host, or set any placeholder.) | GitHub mock: `MOCK_GITHUB_WEBHOOK_SECRET` / `GITHUB_WEBHOOK_SECRET` | `npm run sf-admin -- register-staff-org <staff>` |
| 2 | Career Path (`career-path-platform`) | `career-path-web` | `CAREER_STAFF_TENANT_IDS=<staff>` | — | `ADS_MOCKS_URL` | — |
| 3 | Nutrition (`nutrition-intelligence-platform`) | `nutrition-web` | `NUTRITION_STAFF_TENANT_IDS=<staff>` *(read in code; not yet in `tenant_settings`)* | — | `ADS_MOCKS_URL` | Food dataset release (section 3) |
| 4 | Personal Finance (`personal-life-financial-intelligence`) | `plfi-web` | `PLFI_SUPPORT_TENANT_ID=<staff>` | — | `ADS_MOCKS_URL` | — |
| 5 | Education (`education-and-intelligent-services`) | `education-web` | `EDU_PLATFORM_TENANT_ID=<staff>` | `ADS_IDENTITY_CLIENT_SECRET` (not `EDU_…`) | `ADS_MOCKS_URL`, **W**, `EDU_PAYMENTS_WEBHOOK_SECRET` | Demo partner organisation (section 3) |
| 6 | Morphoo (`go-ahead-guesser`) | `morphoo-web` | `MORPHOO_STAFF_TENANT_IDS=<staff>` *(read in code; not yet in `tenant_settings`)* | — | `ADS_MOCKS_URL` | — |
| 7 | VentureWorks (`africa-digital-synergy-ventureworks`) | `ventureworks-web` | — | — | `ADS_MOCKS_URL`, **W**, `VW_TEST_MODE=1`, `WPB_PAYMENT_PROVIDER` / `WPB_INVESTMENT_PROVIDER` = mock, `WPB_PAYMENT_WEBHOOK_SECRET`, `WPB_INVESTMENT_WEBHOOK_SECRET` | Needs the no-venture fix (PR #91) before the demo. Demo seed in section 4. |
| 8 | Commerce (`ads-commerce-platform`) | `commerce-web` | `COMMERCE_STAFF_TENANT_IDS=<staff>` *(read in code; not yet in `tenant_settings`)* | — | `ADS_MOCKS_URL`, **W**, `ADS_COMMERCE_PAYMENT_WEBHOOK_SECRET`, `COMMERCE_BANK_WEBHOOK_SECRET` | **Must not run with `NODE_ENV=production`.** `commerce-admin.mjs register-bank --tenant <bank>`, then `capability --tenant <shop main> --capability BANK_COLLECTION --enabled true`. Demo admin holds `merchant_owner`. |
| 9 | Logistics (`logistics`) | `logistics-web` | — | `ADS_IDENTITY_CLIENT_SECRET` | `ADS_MOCKS_URL`, **W**, `PROVIDER_WEBHOOK_SECRET` | Staff invitations and zones (section 3) |
| 10 | MamaCare (`mama-care-and-intelligent-services`) | `mamacare-web` | `MAMACARE_STAFF_TENANT_IDS=<staff>` *(read in code; not yet in `tenant_settings`)* | — (removed 20 Oct) | `ADS_MOCKS_URL` | Demo admin holds `facility_admin` (no more "No access yet") |
| 11 | Fleet Guard (`fleet-guard-and-intelligent-services`) | `fleet-guard-web` | `FLEET_STAFF_TENANT_IDS=<staff>` *(read in code; not yet in `tenant_settings`)* | — | `ADS_MOCKS_URL` | — |
| 12 | Digital Tontine (`digital-tontine-and-intelligent-services`) | `tontine-web` | — | — | `ADS_MOCKS_URL`, **W** | Demo group (section 3) |
| 13 | Leisure & Events (`ads-leisure-recreation-events`) | `leisure-web` | — | — | `ADS_MOCKS_URL` | — |
| 14 | SoulBridge (`soulbridge-mental-health-project`) | `soulbridge-web` | `SOULBRIDGE_STAFF_TENANT_IDS=<staff>` *(read in code; not yet in `tenant_settings`)* | — | `ADS_MOCKS_URL` | — |
| 15 | Health (`health`) | `health-web` | `HEALTH_REVIEW_TENANT_ID=<staff>` | `HEALTH_IDENTITY_CLIENT_SECRET` | `ADS_MOCKS_URL`, `HEALTH_TEST_MODE=1` | — |
| 16 | Home Services (`home-services`) | `home-services` | `HOME_PUBLIC_TENANT_ID=<main>`, `HOME_MARKETPLACE_TENANT_IDS=<main>` | — | `ADS_MOCKS_URL`, **W**, `HOME_WEBHOOK_SECRET` | — |
| 17 | Project Management (`project-management-platform`) | `pmp-web` | — | `ADS_IDENTITY_CLIENT_SECRET` | `ADS_MOCKS_URL`, `PMP_TEST_MODE=1` | Organisation link and tester profile (section 3) |
| 18 | AfriCover (`africover-insurance-project`) | `africover-web` | — | — | `ADS_MOCKS_URL`, **W** | As the database owner: `INSERT INTO cover.platform_operators(tenant_id,name) VALUES ('<staff>','ADS Staff – AfriCover operator')` |
| 19 | Agriculture (`agriculture`) | `agriculture-web` | — | needed; setting name missing from the list *(confirm)* | `ADS_MOCKS_URL`, **W** | `npm run admin -- add-staff-tenant <staff> "ADS Staff – Agriculture"`. Needs the fix on `fix/admin-staff-tenant-20261020`. |
| 20 | Investment (`intelligent-cryptocurrency-platform`) | `iip-web` | — | `ADS_IDENTITY_CLIENT_SECRET` | `ADS_MOCKS_URL`, `IIP_TEST_MODE=1` | — |
| 21 | Hub (`africa-digital-synergy-hub`) | `hub-web` | `HUB_OPERATOR_TENANT_ID=<staff>` | — | `ADS_MOCKS_URL` | **Needs a sign-in database connection:** `IDENTITY_ADMIN_DATABASE_URL`, a narrow-rights login on the identity database. Access approvals are written there directly until ACC-13. |
| 22 | HopeBridge (`hopebridge`) | `hopebridge-web` | — | `ADS_ADMIN_CLIENT_SECRET` | `ADS_MOCKS_URL`, **W**, `HOPEBRIDGE_PARTNER_MOCKS_URL`, `PARTNER_MOCKS_WEBHOOK_SECRET`, `FUNDING_WEBHOOK_SECRET`, `PAYMENTS_WEBHOOK_SECRET` | Membership link (section 3) |
| 23 | Tourism (`tourism-platform`) | `tourism-web` | `TOUR_PLATFORM_TENANT_ID=<staff>` | — (removed 20 Oct) | `ADS_MOCKS_URL`, **W**, `PROVIDER_WEBHOOK_SECRET` | — |
| 24 | Banking (`banking-platforms`) | `banking-web` | `BANKING_OPERATOR_TENANT_IDS=<main>` | — | `ADS_MOCKS_URL`, **W**, `BANK_MOCKS_URL`, `BANK_MOCKS_WEBHOOK_SECRET` | Demo partner bank (section 3) |
| 25 | Transport (`transport-platform`) | `transport-web` | — | — | `ADS_MOCKS_URL`, **W**, `PARTNER_MOCKS_URL`, `PROVIDER_WEBHOOK_SECRET` | — |

The RAG gateway (`rag-intelligence-ai-platform`) has no sign-in client. Add each product's audience to `ADS_LEGACY_PLATFORM_AUDIENCES`.

**Follow-up for the kit list:** six products read a staff-tenant setting that `clients.demo.json` does not yet fill in: Nutrition, Morphoo, Commerce, MamaCare, Fleet Guard and SoulBridge. Until the list is updated, set these by hand from `demo-orgs`.

## 3. Per-product demo data (after migrate and operator setup)

| Product | Step |
| --- | --- |
| Project Management | Link the demo organisation to a PMP organisation and create the tester profile for the demo user |
| Logistics | Send staff invitations to the demo users in the shipper organisation and create the delivery zones |
| Digital Tontine | Create a demo group (record-only) with the demo user as organiser and the second demo user as member |
| Nutrition | Release the food dataset (staff `food_data_admin` publishes the reference dataset version) |
| HopeBridge | Link the demo organisation's membership (partner/member link for the demo admin) |
| Banking | Register the demo partner bank (test mode, against `BANK_MOCKS_URL`) for the operator organisation |
| Education | Create the demo partner organisation (school-SaaS partner) above "ADS Demo – Test School" |
| VentureWorks | Four sample ventures: see section 4 |

Exact command names are in each product's README / `scripts/` *(confirm against G1–G4)*.

## 4. VentureWorks demo seed (spec)

**Status:** owner decision, 20 Oct 2026. **This is the input for the sample-data build after the weekly reset. Do not build it before then.**

The demo shows four sample ventures, one for each pilot platform. The pilots come from `LAUNCH_PLAN_WAVE1.md`, `COMMERCE_EDUCATION_PLAN.md` and `FLEETGUARD_TONTINE_PLAN.md`.

| # | Venture | Parent platform | Pilot it shows |
| --- | --- | --- | --- |
| 1 | **POS Deployment Network – Yaoundé** | Commerce | Master plan Pilot A (COM-001). A partner running merchant digitisation. |
| 2 | **School SaaS partner** | Education | Serves 2–3 private schools |
| 3 | **Fleet management reseller** | Fleet Guard | Serves 3–5 transport companies on an Essentials package |
| 4 | **Association management partner** | Digital Tontine | Serves 3–5 associations, record-only |

**Each venture has:**
- **Basics:** parent platform, a short description, a stage, and the demo users. The demo user is founder; the second demo user and the demo admin are team members.
- **Plan:** a business plan, a budget, and three financial scenarios (conservative, base, optimistic).
- **KPIs and evidence:** 5–8 KPIs with mixed statuses: not started, in progress, submitted and approved. Some have evidence attached; at least one is accepted and one is pending review.
- **Readiness:** a readiness view (dashboard) that is filled in, with a mix of met and not-met dimensions.
- **Test values only:** every amount is labelled **"Illustrative / test values"**. Never use the 9,500,000 FCFA example as a price.

**Acceptance:** after a reset and seed, the demo user signs in and can switch between the four ventures. Each venture opens on its readiness view. A fresh organisation with no venture sees the "start a venture" message, not a blank page (PR #91).

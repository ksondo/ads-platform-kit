# Hosting all platforms for testers, and the ADS landing page — plan (20 Oct 2026)

Planning only. Nothing is deployed or changed until the owner approves.

## 1. Where we are (evidence: `ACCOUNT_ACCESS_AUDIT.md` §2.2)

- **The shared ADS sign-in is not hosted anywhere.** The kit has no deploy workflow, only `deploy/docker-compose.yml`. Every deploy that checks for it stopped at its preflight on 19 Oct (Software Factory, Project Management, RAG gateway), so the live sites still run their old versions.
- **No product on `main` has a live address that uses the shared sign-in.**
- **Deploy workflows exist for only 4 repos:** Software Factory, Project Management and RAG (each guarded by a preflight), plus Morphoo (deploy branch only, from before the switch to ADS sign-in). VentureWorks has a manual staging workflow. **The other ~21 repos have CI only.**
- **Only 8 repos have a root `Dockerfile`:** Commerce, VentureWorks, Tontine, Education, Morphoo, HopeBridge, Mama Care, RCK. The others build in CI but have no container recipe.
- **A self-registered user can give themselves staff roles** through the old `/v1/identity/onboard` route. This opens other customers' data in 6 products (audit §2.3). **It must be closed before anything is hosted.**

## 2. Target: one test environment for all products

| Piece | Plan |
| --- | --- |
| **Domain** | Proposed: `*.test.africadigitalsynergy.com`, e.g. `login.test…`, `commerce.test…`, `education.test…`. It is separate from the future customer sign-in (audit tester plan). |
| **Server** | The existing Contabo server, or a second one for the test environment (owner decision H-D1). It needs about 26 small app containers, one PostgreSQL 16 (one database and restricted runtime login per product) and one reverse proxy with TLS. Capacity check first (H-01). |
| **Sign-in** | Kit `services/identity` at `login.test…`. Activation emails from `admin@africadigitalsynergy.com`. All 26 products are registered from one reviewed client list (ACC-01, ACC-02). |
| **Partners** | Kit `services/mocks` hosted as one service (payments, SMS, bank, KYC, Progress). Every screen keeps its "Test mode" label (PLAT-EXT-001). No real money, no real partners. |
| **AI** | The RAG gateway runs against the kit's Progress mock until Progress access is confirmed ("External integration pending"). |
| **Deploys** | One workflow per repo, all built on one pattern: read-only preflight, then database backup, migrations and restart, then a smoke test. This is the pattern already used by Project Management and Software Factory. Auto-deploy on push to `main` is kept (owner decision 19 Oct). |
| **Data** | Synthetic seed data only, from Test-mode-only seed scripts that refuse to run in production (ACC-15). No real personal data. |
| **Monitoring** | Health checks per product on one status page. Daily database backups. |

## 3. The landing page ("ADS Showcase")

The goal is one screen with very little text, a button per sector, and one sign-in.

- **Where it lives:** the Hub (africa-digital-synergy-hub) is the ADS website. The showcase becomes its home page in the test environment. It is the same place the public opportunity catalogue will go later (owner decision 20 Oct).
- **Layout (mobile first, 360 px up):**
  - Top bar: ADS logo, EN/FR switch, **Sign in** (ADS account) and **Create account**.
  - One short line: "Africa Digital Synergy — digital platforms for every sector" (EN/FR).
  - A grid of **sector tiles**, grouped into three bands that follow the ADS divisions:
    - **Commerce & Finance:** Commerce, Banking, Tontine, Personal Finance, AfriCover, Investment, VentureWorks
    - **Services & Mobility:** Transport, Logistics, Fleet Guard, Tourism, Home Services, Leisure & Events, Agriculture
    - **People & Society:** Education, Career Path, Health, Mama Care, Nutrition, SoulBridge, HopeBridge, Morphoo
    - **For builders** (small row): Software Factory, Project Management
  - **Each tile:** icon, name, a 3–5-word tagline, a small status chip ("Pilot" for the five wave-1 platforms, "Preview" for the others), and the sector colour from the UI/UX register.
  - **Tapping a tile** opens that product. If the visitor is signed in, the ADS account carries over with no second login. If not, the product's own public page or sign-in appears.
  - Footer: test-mode notice ("Test environment — no real money or data"), help link, privacy.
- **Design system:** the master design system with ADS navy `#102B43`. Sector colours come from the register (Tourism and Transport rows still to be added). 44 px touch targets and WCAG 2.2 AA.
- **Tile data comes from one list** (name, URL, icon, colour, status), so adding a platform needs no code change. That list later becomes the product catalogue that the entitlements service reads.
- **What a tester sees after signing in:** the same grid. A tile marked "You have access" opens straight to the role home. Staff roles come by invitation (see §4).

A visual mock-up of the landing page can be produced for approval before any build (owner decision H-D4).

## 4. How testers get in (summary of the audit's tester access plan)

1. A tester creates an ADS account on `login.test…` with their own email, then activates and signs in.
2. That alone opens the customer side of 19 products.
3. Staff, operator and admin screens, and all of VentureWorks, Fleet Guard and Tontine, need an **invitation** into a product test organisation with named roles (ACC-06 bulk invitations from a CSV, with expiry).
4. Steps that need a second approver use two testers.
5. No shared passwords, no demo accounts, no bypass. ADS-only roles are granted only inside ADS staff organisations (ACC-04, ACC-05).
6. One runbook page per product lists the personas and how to invite them (ACC-07).

## 5. Build register: hosting (`H-`) and landing (`L-`)

These are hosting tasks plus small fixes. They are not feature builds. They run before the wave-1 finalization builds.

| ID | Title | What | Depends on | Size | Acceptance check |
| --- | --- | --- | --- | --- | --- |
| H-00 | **Close self-escalation (security, first)** | ACC-03 (switch off `/v1/identity/onboard`, refuse grants of non-assignable roles), ACC-14 (remove the Software Factory test password), ACC-05 for the 6 products (or block those staff roles from the test client list until fixed) | — | M | The audit §1.7 probe is refused; no password literal in any workflow |
| H-01 | Server and capacity | Choose the server, check CPU/RAM/disk for about 26 apps, DNS `*.test.africadigitalsynergy.com`, TLS, reverse proxy, firewall | Owner H-D1, H-D2 | M | Wildcard TLS works; the proxy returns a holding page |
| H-02 | Host the shared sign-in (ACC-01) | Kit identity and its database, signing key and cookie secret in server secrets, SMTP, backups, a kit deploy workflow with preflight | H-00, H-01 | M | `login.test…/.well-known/openid-configuration` reachable; an activation email arrives |
| H-03 | Client list for all products (ACC-02, ACC-09) | One reviewed file; secrets for the products that call the admin API | H-02 | M | Every product's sign-in returns to its own page |
| H-04 | Host the kit mocks and the AI gateway | `services/mocks` (Test mode) and the RAG gateway with its `ads-identity.env` | H-02 | S | The gateway health check reports token verification; products' "Test mode" labels show |
| H-05 | Container recipe for every product | Add a Dockerfile and compose service to the ~18 repos without one, following Commerce's `deploy/compose.yaml` | — | L (S each) | Each image builds in CI and starts against a test database |
| H-06 | One deploy workflow per product | The Project Management preflight pattern (preflight, backup, migrate, restart, smoke) for every repo | H-03, H-05 | L (S each) | A push to main deploys to `<product>.test…`; a failed preflight leaves the old version running |
| H-07 | Seed data and test organisations (ACC-06, ACC-08, ACC-15) | A Test-mode seed per product; test organisations and staff settings | H-06 | M | Each persona in the runbook reaches its screen |
| H-08 | Status page and backups | Health of all products on one page; daily database backups with one restore test | H-06 | S | A restore of one product database works |
| L-01 | Landing page design mock-up | Visual design of the showcase for owner approval | — | S | Owner approves |
| L-02 | Build the showcase on the Hub | Tile grid from one list, EN/FR, sign-in, status chips, accessibility check | L-01, H-02 | M | 360 px and desktop pass; every tile opens its product; one sign-in carries over |
| L-03 | Tester runbook (ACC-07) | One page per product with personas and invitation steps | H-07 | S | A new tester is onboarded in under 10 minutes |

## 6. Decisions needed from the owner

| # | Decision | Recommendation |
| --- | --- | --- |
| H-D1 | Which server hosts the test environment? | A **separate** test server (or a clearly separate stack on the current Contabo server, if capacity allows), so testing never disturbs existing live sites |
| H-D2 | Test domain | `*.test.africadigitalsynergy.com`; customer domains come later |
| H-D3 | Host all ~26 at once, or in batches? | Batches: first the sign-in, the landing page and the 5 pilot products, then the rest within the same week, each as soon as its container and deploy are ready |
| H-D4 | Landing page mock-up before building? | Yes. Approve the look first (L-01) |
| H-D5 | Products not yet usable without roles (VentureWorks, Fleet Guard, Tontine, Logistics, Mama Care, Project Management) | Show them as "Preview — by invitation" on the landing page |
| H-D6 | Morphoo's live site (old version on the deploy branch) | Leave it untouched; host the new main version in the test environment only, until you approve its live deploy |

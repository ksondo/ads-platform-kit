# ADS account and access audit (wave 1)

Owner: Kengjiseh Sondo (ADS). Written 20 October 2026 on the planning branch. **Planning only:** no product, kit code or deploy setting was changed.

**What was read:** `origin/main` of every repo. That is ads-platform-kit `c74c5ad` and 26 product repos (commit list in the appendix). The kit's sign-in service was also run on this machine with a throwaway database to test sign-up for real. The database was dropped afterwards.

---

## Short answers

| Question | Answer |
| --- | --- |
| Can someone create an account (email and password), log in and see what has been built, using their own session? | **Not on the internet today.** The shared ADS sign-in (`login.africadigitalsynergy.com`) is not hosted yet. On 19 Oct, every deploy that checks it stopped at its preflight with "not reachable" (Software Factory, Project Management, RAG). The software itself works: on this machine, sign-up, activation email, login and product sign-in all worked. Once it is hosted, one account works in every product (single sign-on). |
| What types of accounts can be created? | Only one type: an **ADS account** (email + password, or Google). Each product then gives that account **roles** inside an **organisation workspace**. Every new account gets a private "personal" workspace. 19 products hand out a customer role there automatically. 6 products give a new account nothing ("No access yet"). Staff, operator and admin roles always have to be granted. |
| How is an admin account created, and does one already exist? | **No platform super-admin exists, and none is created by default.** No seed, demo account or default password exists in the kit. "ADS operator" means a person who can run the kit's command-line tool (`services/identity/src/cli.mjs`) with database access. That person creates each organisation and its first owner (`create-organization --owner`). From then on the owner or admins manage people on the hosted `/admin` page or through the `/admin/v1` API. Each product also has its own operator step, such as a staff-organisation list (see Table B). |
| Can a user give themselves other account types without an operator? | **Yes. This is the main finding.** It was tested and confirmed. Any new user can create their own organisation through an old route the kit still has open (`POST /v1/identity/onboard`). That makes them its owner, and an owner can grant **any role of any product** to themselves on `/admin`. Roles stay inside that organisation, which is harmless for **20** products. In **6 products** a role name alone opens other customers' data or global content: Commerce, Fleet Guard, Mama Care, SoulBridge, Morphoo and Nutrition (section 2.3). It can be closed with configuration before hosting (build items ACC-03 and ACC-04). |
| Can a tester self-register once and browse everything? | **They can register once and see the customer side of 19 products.** They cannot see staff, operator or admin screens, or the 6 staff-only products, until someone invites them into a test organisation with named roles. |
| What has to be set up so testers can see each role? | (1) Host the kit sign-in, with email sending. (2) Register all 26 products as clients, with a safe list of grantable roles. (3) Create one test organisation per product, plus the ADS staff test organisations some products need. (4) Invite each tester's own account with the roles they test. (5) Set each product's staff-organisation setting to the test staff organisations. Details are in section 4. |

---

## 1. The shared ADS sign-in (ads-platform-kit `c74c5ad`)

Code: `services/identity/src/*` (server, accounts, oauth, admin, cli, legacy), `services/identity/migrations/001–004`, `packages/identity-client/ads-identity.js`, `docs/INTEGRATING_A_PRODUCT.md`.

### 1.1 Registration (tested on this machine, ports 31080/31081, database `acct_identity`, dropped afterwards)

| Step | Result | Where in code |
| --- | --- | --- |
| Open the hosted `/register` page and submit email + password | 200, "check your email" page. Self-service, no approval needed | `server.mjs` `/register`, `accounts.mjs register()` |
| Log in before activating | Refused ("confirm your email") | `accounts.mjs authenticate()` |
| Open the activation link and type the same password | Account active and signed in | `accounts.mjs activate()`. The password only takes effect when the mailbox owner types it, which stops someone else from registering a stranger's email first |
| Sign in to a product that has a self-service role (`commerce_buyer`) | Token with `roles: ["commerce_buyer"]` in a new personal workspace | `oauth.mjs resolveWorkspace()`, `ensurePersonalWorkspace()` |
| Sign in to a staff-only product (no self-service role) | 403 "No access yet" page | `oauth.mjs` returns `noAccess` |
| Google sign-in | Available only when `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set. It links to an existing account by verified email | `google.mjs`, `accounts.mjs googleUser()` |
| Phone/SMS sign-up | **Not built.** SMS is used only to send invitations, through an optional hook (`IDENTITY_SMS_URL`) | `admin.mjs createInvitation()` |

Settings that matter: `IDENTITY_REQUIRE_EMAIL_VERIFICATION` is on by default, so **without working email (SMTP) nobody can activate**. The sender defaults to `admin@africadigitalsynergy.com` (`config.mjs`). Rate limits apply to registration and login.

### 1.2 What a new account gets
- One ADS user (`platform.users`).
- A **personal workspace** (`organizations.kind='personal'`), created on its first sign-in to a product. This happens only if that product is registered with self-service roles and personal workspaces allowed.
- **Self-service roles count only in the personal workspace.** In an organisation workspace a user holds only the roles an admin granted (`oauth.mjs rolesFor()`).
- No other default role, and no admin rights anywhere.

### 1.3 How organisations are created
1. **By an ADS operator:** `node src/cli.mjs create-organization --name … --owner <email>`. The owner must have registered first. They become `owner`.
2. **By anyone, through the old JSON route:** `POST /v1/identity/onboard`, left over for Software Factory's old login (`legacy.mjs onboard()`). A signed-in user with no organisation creates one and becomes `owner`. It works once per user (a second try returns 409). **Software Factory's app no longer calls it.** Only some of its CI smoke workflows do (`software-factory/.github/workflows/contabo-*.yml`).
3. There is no "create organisation" button on `/admin`, and no admin-API call for it.

### 1.4 How roles are granted
| Way | Who can use it | Limits |
| --- | --- | --- |
| Hosted page `/admin` on the login domain | Organisation **owner/admin**: any product's roles in their organisation, plus deactivating members, making admins and inviting. **Product admin** (holds a product's `admin_roles`): that product only, and not its admin roles | `assignable_roles` (if set on the product) limits which roles can be granted. **If it is empty, any role name can be granted.** Granting roles to yourself is not blocked (`admin.mjs grantRoles()`) |
| Admin API `/admin/v1/*` | Product servers, acting as the signed-in admin (token exchange plus the product's client secret) | Same rules, checked live on every call and audited |
| Invitations (email; SMS when a hook is set) | Same admins | Single use, 7 days, accepted only by the invited email address |
| CLI `grant-role`, `make-org-admin`, `disable-user` | ADS operator with database access | **Does not check `assignable_roles`.** This is the right path for ADS-only staff roles |

### 1.5 The first platform admin
- No seed, no default admin, no environment variable that creates one, and no demo credential in the kit.
- "Platform operator" = whoever can run `cli.mjs` inside the identity container (`DATABASE_URL`). This role has no account of its own. CLI actions are audited with reason `cli`.
- Dev-only fallbacks exist (used only with `IDENTITY_DEV_MODE`): a temporary signing key, and a placeholder cookie secret in `services/identity/src/config.mjs` (`cookieSecret`). In production the service refuses to start without a real one.
- The test harness (`packages/e2e-kit`, `seedTenant`/`createUser`) makes throwaway users with generated passwords for automated tests only.

### 1.6 Client registration per product
Yes: `cli.mjs register-client` sets, per product, the return addresses, self-service roles, whether personal workspaces are created, admin roles, admin-API scopes and grantable roles. `set-client-secret` prints a secret once for the product server.

**No production registration exists for any product.** The values live only in each repo's test setup (`e2e/global-setup.*`), plus written go-live steps in three repos (Software Factory and Project Management `docs/delivery/GO_LIVE_RUNBOOK.md`, Morphoo `docs/delivery/ADS_SIGN_IN_MIGRATION.md`).

### 1.7 Self-service role escalation (confirmed by test)
Probe script: `acct-probe/probe.mjs` in the session scratchpad; results only below.

1. A new user registers and activates, as any customer would.
2. They log in through `/v1/identity/login`, then call `/v1/identity/onboard`. Result: 201, `owner` of "their" organisation.
3. On `/admin` they grant **themselves** `commerce_reviewer`, and `operator_admin, ads_support` on a staff-only product. Result: both granted.
4. Product sign-in returns a token with those roles.
5. When the product is registered with `assignable_roles` that leave out `commerce_reviewer`, the same self-grant is refused (`ROLE_NOT_ASSIGNABLE`).

This matters only where a product trusts a role name **without checking which organisation it came from** (section 2.3).

---

## 2. Product by product

**Legend.** "Self role" = the role a brand-new account gets automatically. It is taken from the product's test client registration, because no production registration exists. "Kit admin" = the product calls the kit's `/admin/v1` API itself. Otherwise roles are granted on the hosted `/admin` page or with the CLI. All 26 products use the shared ADS sign-in on main: they verify RS256 tokens (issuer, audience, signing keys) on the server and ship `ads-identity.js`.

### 2.1 Table A: sign-in, a new user's first view, account types

| Product (repo) | (a) Own login left? | (b) Brand-new self-registered user sees | (c) Roles; self-service vs granted, and how |
| --- | --- | --- | --- |
| Software Factory (`software-factory`) | No. Market app login retired (`apps/market-platform/sign-in-moved.tsx`). Only the CI workflows still use the kit's old JSON routes | Entrepreneur workspace | Self: `entrepreneur`. Staff: `ba_reviewer`, `code_reviewer`, `knowledge_curator`, `support_agent`, which count only in organisations listed by `npm run sf-admin -- register-staff-org`. Older department screens check `PLATFORM_ADMIN`/`ORGANIZATION_ADMIN` by name (`server/department-*.ts`) |
| Career Path (`career-path-platform`) | No | Learner profile, goal paths | Self: `learner`. `curator` counts only in `CAREER_STAFF_TENANT_IDS` workspaces (`db/staff-tenants.mjs`) |
| Nutrition (`nutrition-intelligence-platform`) | No | Household setup, meal plans | Self: `nutrition_user`. Household roles are given by the product's own invitations. `food_data_admin` is granted by an org admin or the CLI. Older screens check `admin`/`nutritionist` |
| Personal Finance (`personal-life-financial-intelligence`) | No | Own household budget | Self: `owner`. `editor`/`viewer` through the product's own household invitations. `support_agent` counts only in `PLFI_SUPPORT_TENANT_ID` |
| Education (`education-and-intelligent-services`) | No | "Apply/Register" side (applicant), help. School screens show "No access yet" | Self: `applicant`. School roles (`learner`, `parent_guardian`, `teacher_trainer`, `admissions_officer`, `academic_admin`, `institution_admin`, `bursar_finance`) are granted per school organisation. In-product role approvals stop at "pending activation" (not wired to `/admin/v1`). `platform_admin` counts only in `EDU_PLATFORM_TENANT_ID` |
| Morphoo (`go-ahead-guesser`) | No. Old `/v1/auth/*` answer 410. Old password hashes are kept unused for rollback | Profile-only account. Can create a church workspace that waits for verification | Self: `member`. Church roles come from church membership checked in Morphoo. `super_admin`, `pcc_admin`, `content_steward` etc. are taken from the token **regardless of organisation** (`database/migrations/018_ads_identity_link.sql sync_account_roles`) |
| VentureWorks (`africa-digital-synergy-ventureworks`) | No | "No access yet", plus an access-request form | No self role. `founder`, `tenant_admin`, `venture_manager`, `evidence_reviewer`, `regulatory_reviewer`, plus 5 ecosystem roles that see nothing yet. An approved access request stays "grant pending": the adapter expects `ADS_ROLE_ADMIN_URL`, not the kit's `/admin/v1` (`src/server/adapters/roleAdmin.mjs`) |
| Commerce (`ads-commerce-platform`) | No (cashier PIN at the POS is not a login) | Public marketplace, cart, own orders | Self: `commerce_buyer`. Shop: `merchant_owner`, `commerce_manager`, `commerce_cashier`, `commerce_accountant`. Bank: `bank_officer`, `bank_agent`; the bank organisation must be registered with `scripts/commerce-admin.mjs register-bank`. ADS staff: `commerce_reviewer`, `commerce_support`, **recognised by role name only** |
| Logistics (`logistics`) | No | "No access yet" | No self role. `shipper`, `merchant`, `dispatcher`, `courier`, `operator_admin`. Kit admin: an operator admin invites staff (`src/server/adsAdmin.mjs`) |
| Mama Care (`mama-care-and-intelligent-services`) | No | "No access yet" | No self role. `maternal_user`, `parent`, `guardian`, `professional`, `ads_support` (own organisation only), `content_author`/`content_steward` (**global content**). A facility admin invites clinicians through `/admin/v1` |
| Fleet Guard (`fleet-guard-and-intelligent-services`) | No | "No access yet" | No self role. `owner_admin`, `fleet_manager`, `workshop_manager`, `technician`, `driver`, `operator`, `finance`, `compliance_officer` + 5 recognised roles. `ads_support` **sees every fleet's support cases**. Team screen records invitations; the roles themselves are granted in the kit |
| Digital Tontine (`digital-tontine-and-intelligent-services`) | No | "No access yet" | No self role. `member`, `entrepreneur`, `group_admin`, `treasurer`, `payout_approver`, `auditor`, `compliance_officer`, `support_officer`. A person invited by SMS must already hold a Tontine role in that organisation (operator) |
| Leisure / Events (`ads-leisure-recreation-events`) | No | Browse and join events, account, help | Self: `event_participant`. `event_organizer`, `event_reviewer`, `incident_handler`, `support_agent` per city organisation, through `/admin` or the CLI |
| SoulBridge (`soulbridge-mental-health-project`) | No | Client side (help, intake) | Self: `client`. `counsellor`, `centre_admin`, `case_coordinator`, `safeguarding_officer`, `content_editor`, `content_reviewer`; counsellor linking by SoulBridge invite codes. `ads_support` **reads every complaint** (`db/migrations/010_help_and_complaints.sql`) |
| Health (`health`) | No | Patient profile, public facility listings | Self: `patient`. `facility_admin` (product admin), `reception`. Kit admin (`src/private/staff.mjs`). `ads_reviewer` counts only in `HEALTH_REVIEW_TENANT_ID` |
| Home Services (`home-services`) | No | Browse and book as a customer | Self: `service_customer`. Provider and staff roles (`verifier`, `reviewer`, `support_agent`, `tenant_admin`) count only in the marketplace organisation(s) `HOME_PUBLIC_TENANT_ID`/`HOME_MARKETPLACE_TENANT_IDS` |
| Project Management (`project-management-platform`) | No (old login answers 410). Older K1–K7 "tester loop" routes are parked | "No access yet" (no personal workspace) | No self role. PMP role catalogue; `admin` is the product admin. Kit admin (`apps/api/src/identity-admin.ts`); falls back to its own record if the secret is missing |
| AfriCover (`africover-insurance-project`) | No | Customer enquiry, quote and policy side | Self: `insurance_customer`. Insurer staff through kit invitations. ADS operator organisations are listed in `cover.platform_operators` (database owner only, no script) |
| Agriculture (`agriculture`) | No | Farmer and buyer sides | Self: `farmer`, `buyer`. `tenant_admin` (product admin), `reviewer`, `support`. Staff organisations via `npm run admin -- add-staff-tenant` |
| Investment Platform (`intelligent-cryptocurrency-platform`) | No | Investor side | Self: `investor`. `iip_admin` (product admin), `investment_reviewer`, `support_agent`, all limited to their own organisation. Kit admin (`src/server/staffAdmin.mjs`) |
| Hub (`africa-digital-synergy-hub`) | No | Public website; signed-in `member` has no portal | Self: `member`. `staff`, `staff_admin` in `HUB_OPERATOR_TENANT_ID`. Approving access **writes the identity database directly** (`IDENTITY_ADMIN_DATABASE_URL`) |
| HopeBridge (`hopebridge`) | No | Community self-service (requests, reports) | Self: `community_user`. Staff roles must be granted **both** in HopeBridge (`public.user_roles`) **and** in the token (`server/identity.ts`). The first `platform_admin` needs a manual database insert (no script found) |
| Tourism (`tourism-platform`) | No | Browse, book and pay (test mode) | Self: `visitor`. `operator_admin` (product admin), `gate_agent`. `tour_admin` only in `TOUR_PLATFORM_TENANT_ID` |
| Banking (`banking-platforms`) | No (pages imported from RCK under `imports/` are not the sign-in) | Intended: customer side. **Not proven**: the test client has no personal workspaces | Intended self role: `banking_customer` (DD-12). `bank_officer`, `banking_admin`; operator organisations listed in `BANKING_OPERATOR_TENANT_IDS` |
| Transport (`transport-platform`) | No | Search and book as a passenger | Self: `passenger`. `operator_admin`, `station_agent`, `union_officer`, all per organisation |
| RAG / AI gateway (`rag-intelligence-ai-platform`) | Its own identity service is retired (ADR 0001) | No user screens: a service for other products | Accepts tokens from the products listed in `ADS_LEGACY_PLATFORM_AUDIENCES` |
| retail-connect-kit (reference only) | **Yes**, its own login (`server/corestack-identity.mjs`) | n/a | Not part of the tester set |

Other folders with apps outside the focus set: `v2-live-preview` and `lovable-demo-plan` use Supabase sign-in, and `progress-education-training` is a training app. They are not part of the tester set.

### 2.2 Table B: admin setup, hosting, what a tester needs

Hosting, from the preflight annotations of the 19 Oct runs:
- Software Factory (4 Contabo workflows, 15:05) and Project Management (09:39) stopped with: "JWKS / openid-configuration at login.africadigitalsynergy.com not reachable from the server; PUBLIC_URL missing; ADS_IDENTITY_CLIENT_SECRET missing".
- RAG (7 workflows, 14:42) stopped because the server has no `ads-identity.env` (`ADS_OIDC_ISSUER`, `ADS_LEGACY_PLATFORM_AUDIENCES`).
- The kit itself has no deploy workflow, only `deploy/docker-compose.yml`.

| Product | (d) Admin/operator set-up | (e) Can it be hosted for testers today? | (f) What a tester needs to see the whole product |
| --- | --- | --- | --- |
| Software Factory | Kit org owner; `sf-admin register-staff-org`; client secret | Deploy workflows exist (push to main); **blocked at preflight 19 Oct** | Entrepreneur (self); staff test organisation with the 4 staff roles |
| Career Path | `CAREER_STAFF_TENANT_IDS` + `db/staff-tenants.mjs` | CI only, no deploy workflow | Learner (self); curator ×2 in a staff test organisation (second-curator approval); sample data `npm run seed:sample` (refuses production) |
| Nutrition | Org admin grants `food_data_admin` | CI only | Self user; second account to accept a household invite; food-data admin in a food-data test organisation |
| Personal Finance | `PLFI_SUPPORT_TENANT_ID` | CI only | Owner (self); second account for editor/viewer; support agent in a support test organisation |
| Education | `EDU_PLATFORM_TENANT_ID`; operator creates each school organisation | CI only. `staging-certification.yml` tests a staging address but does not deploy | Applicant (self); test school with learner, parent, teacher, admissions, academic admin, institution admin, bursar; ADS Education staff organisation with `platform_admin` |
| Morphoo | CLI `grant-role … super_admin` for carried-over staff (`legacy_role_carryover`) | Deploy workflow only from branch `deploy/contabo-morphoo-v1` (last 3 Sep, before the switch to ADS sign-in); main not deployed | Member (self); church admin (create a church); `super_admin` for verification (**ADS staff only**) |
| VentureWorks | Kit org owner; grants by CLI until the adapter is wired | Manual Contabo staging workflow; last success 16 Oct from a deploy branch | Founder, tenant admin, venture manager, evidence and regulatory reviewer; reviewed legal sources (the library is empty by design); price and terms settings (`VW_ASSESSMENT_PRICE_XAF`) |
| Commerce | `scripts/commerce-admin.mjs register-bank` and `capability --capability BANK_COLLECTION`, run with the schema-owner database login | CI only (`deploy/compose.yaml` exists, no workflow) | Buyer (self); test shop with owner, manager, cashier, accountant; test bank organisation with officer and agent; ADS review-team organisation with reviewer and support (**operator CLI only**) |
| Logistics | Operator admin through kit invitations; client secret | CI only | Shipper organisation; operator organisation with `operator_admin`, `dispatcher`, `courier` |
| Mama Care | Facility admin; client secret | CI only | Mother, parent/guardian, professional; two content stewards (maker-checker), **ADS staff only** |
| Fleet Guard | Kit org owner `owner_admin`; roles by CLI or `/admin` | CI only | Test fleet with owner, manager, workshop, technician, driver, operator, finance, compliance; `ads_support` (**ADS staff only**) |
| Digital Tontine | Operator grants roles in the group's organisation | CI only | Test group organisation with group admin, treasurer, payout approver (maker-checker = 2 people), auditor, members |
| Leisure / Events | Operator grants by CLI/`/admin` | CI only | Participant (self); city organisation with organizer, reviewer, incident handler, support |
| SoulBridge | Kit grants plus invite codes | CI only | Client (self); centre organisation with centre admin, counsellor, safeguarding, content editor and reviewer; `ads_support` (**ADS staff only**) |
| Health | `HEALTH_REVIEW_TENANT_ID`; client secret (`HEALTH_IDENTITY_CLIENT_SECRET`) | CI only | Patient (self); facility with facility admin and reception; ADS review organisation with `ads_reviewer` (CLI) |
| Home Services | Marketplace organisation id in `HOME_PUBLIC_TENANT_ID` | CI only | Customer (self); marketplace organisation with provider, verifier, reviewer, support, tenant admin |
| Project Management | Kit org owner gets `admin`; client secret | `pilot-self-hosted.yml` deploys on push; **blocked at preflight 19 Oct** | Test organisation with admin and the PMP catalogue roles |
| AfriCover | Database owner inserts into `cover.platform_operators` | CI only | Customer (self); insurer organisation; ADS operator organisation with `interest_reviewer` |
| Agriculture | `npm run admin -- add-staff-tenant` | CI only | Farmer and buyer (self); staff organisation with reviewer and support; tenant admin |
| Investment Platform | Org admin with `iip_admin`; client secret; VentureWorks service token | CI only | Investor (self); staff organisation with admin, reviewer, support |
| Hub | `HUB_OPERATOR_TENANT_ID`; identity-database login for grants | CI only | Visitor (no sign-in); staff and staff admin in the operator organisation |
| HopeBridge | Manual database grant of the first `platform_admin` in HopeBridge, plus the token role | CI only | Community user (self); NGO organisation with NGO admin, operations, case worker, approver; platform admin |
| Tourism | `TOUR_PLATFORM_TENANT_ID` + `tour_admin` | CI only | Visitor (self); operator organisation with operator admin and gate agent; ADS platform organisation with `tour_admin` |
| Banking | `BANKING_OPERATOR_TENANT_IDS` | CI only | Customer (once personal workspaces are on); bank organisation with officer and banking admin |
| Transport | Operator admin per organisation | CI only | Passenger (self); operator organisation with operator admin and station agent; union organisation with union officer |
| RAG / AI gateway | `ads-identity.env` on the server | Contabo workflows **blocked at preflight 19 Oct** | Nothing for testers directly; products use it |

No product has a confirmed live public address on main that uses the shared sign-in. Addresses in documents are examples or placeholders.

### 2.3 Where a self-made role opens other customers' data

These products trust a staff role by its **name**, without checking that it came from an ADS staff organisation. Combined with section 1.7, any self-registered user could gain these powers.

| Product | Role | What it opens | File |
| --- | --- | --- | --- |
| Commerce | `commerce_reviewer` (without shop roles) | Every shop's product drafts, and approving them | `src/server/catalogPublication.mjs reviewScope`, `db/migrations/029_ads_review_team_scope.sql` |
| Commerce | `commerce_support` | Every buyer's order messages and support cases | `src/server/customer.mjs`, `db/migrations/027_…support.sql` |
| Fleet Guard | `ads_support` | Every fleet's support cases | `src/server/app.mjs`, `db/migrations/006_row_level_security.sql` |
| Mama Care | `content_author`, `content_steward` | Content shown to every family | `db/migrations/011_content_approval.sql` |
| SoulBridge | `ads_support` | Every complaint (mental-health context) | `db/migrations/010_help_and_complaints.sql` |
| Morphoo | `super_admin`, `pcc_admin` | Platform administration, including private prayer requests (a risk already noted in its E2E status) | `database/migrations/018_ads_identity_link.sql` |
| Nutrition | `food_data_admin` | Every user's reports (read and update) | `database/006_level1_mvp.sql` (`nutrition_reports_admin*`) |

Safe pattern already used by Career, Personal Finance, Education, Health, Home Services, Hub, Tourism, Banking, Agriculture, AfriCover and Software Factory: the staff role counts only in workspaces on a list that the operator controls.

### 2.4 Shared passwords or demo bypass
- **None in product runtime code.** Certification SQL files use `@example.invalid` fixtures, and the e2e harness generates passwords.
- **One fixed test-account password is written into a workflow:** `software-factory/.github/workflows/repair-universal-test-identity.yml` (line 24, variable `PASSWORD`). It belongs to an older "permanent Marketplace test identity" on the retired identity service. It should be removed and that account disabled (ACC-14).
- Agriculture's test setup has a test-only default client secret (`agriculture/e2e/global-setup.mjs`, line 14), used only when the environment variable is missing in CI.

---

## 3. Can a tester self-register once and browse everything?

**Once the kit is hosted, the answer is partly yes.** One registration gives single sign-on to all products. Inside them the tester sees:
- **Customer side, 19 products:** Software Factory, Career, Nutrition, Personal Finance, Education (applicant), Morphoo (member), Commerce, Leisure, SoulBridge, Health, Home Services, AfriCover, Agriculture, Investment, Hub (public), HopeBridge, Tourism, Transport, Banking (not yet proven).
- **"No access yet", 6 products:** VentureWorks, Logistics, Mama Care, Fleet Guard, Digital Tontine, Project Management.
- **Never without a grant:** staff, operator, reviewer and admin screens in every product. That includes 3 of the 5 pilot products as a whole (VentureWorks, Fleet Guard, Tontine) and the school and shop sides of Education and Commerce.

What "see each role" needs is in the next section.

---

## 4. Tester access plan

**Principles:**
- Testers use their **own** ADS accounts.
- No shared passwords in code or documents.
- No demo bypass or "log in as" button.
- Every role is granted by invitation and recorded in the audit.
- Test data is synthetic, and products stay in Test mode (mock providers).

**Steps (operator):**
1. **One test sign-in.** Host the kit sign-in for the tester wave, with email sending working and the old self-onboard route switched off (ACC-01, ACC-03). Recommended: run it as the *test* environment (for example `login.test.africadigitalsynergy.com`, already referenced in Career's settings). Real customers then never share it with testers.
2. **Register the 26 products from one reviewed list** (ACC-02). Each entry sets the self role, personal workspace on or off, the product admin role, and `assignable_roles`. That list **must leave out ADS-only roles**: `commerce_reviewer`, `commerce_support`, Fleet/SoulBridge `ads_support`, Mama Care content roles, Morphoo `super_admin`/`pcc_admin`, Nutrition `food_data_admin`, Health `ads_reviewer`, Tourism `tour_admin`, Education `platform_admin`. Those are granted only with the CLI.
3. **Organisations.** For each product create `ADS Test – <Product>` (`create-organization`), owned by the ADS test coordinator. Also create the extra test organisations a product needs:
   - an ADS staff organisation (Software Factory, Career, Personal Finance, Education, Health, Tourism, Agriculture, AfriCover, Hub, Commerce review team);
   - a second-side organisation (Commerce bank, Logistics shipper, Transport union, Home marketplace).
4. **Product settings.** Put those organisation ids into each product's test settings: `*_STAFF_TENANT_IDS`, `EDU_PLATFORM_TENANT_ID`, `HEALTH_REVIEW_TENANT_ID`, `HUB_OPERATOR_TENANT_ID`, `TOUR_PLATFORM_TENANT_ID`, `BANKING_OPERATOR_TENANT_IDS`, `HOME_PUBLIC_TENANT_ID`, `PLFI_SUPPORT_TENANT_ID`, `sf-admin register-staff-org`, `add-staff-tenant`, `commerce-admin register-bank`. Set client secrets where a product calls the kit admin API (ACC-08, ACC-09).
5. **Named test roles.** One invitation per tester and persona: "Commerce – cashier", "Education – admissions officer", and so on. A tester who needs several personas can take several roles in the same organisation, or be invited to two organisations and switch with the kit's workspace chooser. Maker-checker journeys (Tontine payouts, Mama Care content, Career curation, Health listings) need **two different testers**.
6. **Seed data.** Testers create most data through the journeys. Where a journey needs starting data, load an approved synthetic set in Test mode only: Career `seed:sample`, VentureWorks legal sources, Commerce bank registration, Education catalogue.
7. **End of wave.** Disable the test organisations and test-only memberships. Keep the audit trail.

**Pilot personas (minimum):**

| Pilot product | Test organisations | Personas to invite |
| --- | --- | --- |
| Education | Test School; ADS Education staff | applicant (self), learner, parent_guardian, teacher_trainer, admissions_officer, academic_admin, institution_admin, bursar_finance; platform_admin (CLI, staff org) |
| Commerce | Test Shop; Test Bank (registered); ADS Review Team | buyer (self), merchant_owner, commerce_manager, commerce_cashier, commerce_accountant, bank_officer, bank_agent; commerce_reviewer and commerce_support (CLI, review team only) |
| VentureWorks | Test Venture Studio | founder, tenant_admin, venture_manager, evidence_reviewer, regulatory_reviewer |
| Fleet Guard | Test Fleet | owner_admin, fleet_manager, workshop_manager, technician, driver, operator, finance, compliance_officer; ads_support (CLI, ADS staff only) |
| Digital Tontine | Test Savings Group | group_admin, treasurer, payout_approver ×2, auditor, member ×3 |

**Does the kit need a "tester" or "demo tenant" feature?** Yes, but a small one, and **no demo bypass**. Recommended features (ACC-06):
- Mark an organisation as `test` (`create-organization --test`), with the flag carried in the token so products can show "Test organisation" and keep it out of reports.
- Bulk invitations from a CSV (email, product, roles).
- An expiry date on test memberships.
- One command that lists who holds which test role.

Separately, the kit should carry an **"ADS staff organisation"** flag in the token (ACC-04). Products could then stop keeping their own staff-list settings, and the section 2.3 problem goes away.

---

## 5. Classification

| Item | Class | Reason |
| --- | --- | --- |
| Host the kit sign-in with working email (ACC-01) | PILOT-MVP | Nothing can be tested by outside testers without it |
| Production/test client registration list with `assignable_roles` (ACC-02) | PILOT-MVP | Decides what every new account sees; closes self-escalation without product changes |
| Switch off `/v1/identity/onboard` and require `assignable_roles` (ACC-03) | PILOT-MVP | Confirmed self-escalation path; Software Factory's app no longer needs the route |
| Remove the hard-coded test password from the Software Factory workflow (ACC-14) | PILOT-MVP | Shared password in code |
| Staff-organisation check in Commerce and Fleet Guard (part of ACC-05) | PILOT-MVP | Pilot products; global staff roles |
| Staff-organisation check in Mama Care, SoulBridge, Morphoo, Nutrition (rest of ACC-05) | LATER | Not pilot products. ACC-02 covers them for tester hosting |
| VentureWorks access-request grant through `/admin/v1` (ACC-10) | PILOT-MVP | Its core journey (VW-US-003) stays "grant pending" without it |
| Education role approvals applied through `/admin/v1` (ACC-11) | PILOT-MVP | Approvals stop at "pending activation" today |
| Fleet Guard and Tontine invitations through kit invitations (ACC-12) | PILOT-MVP | Pilot teams must add people without an operator |
| Test-organisation feature in the kit (ACC-06) | PILOT-MVP | Safe tester grants at scale (20+ products × several personas) |
| "ADS staff organisation" claim in the kit (ACC-04) | OWNER-DECISION | Cleaner than per-product lists, but per-product lists already work |
| Hub grants through the kit API instead of direct database writes (ACC-13) | LATER | Works today; the database login needs narrow rights until then |
| Synthetic seed sets per product (ACC-15) | OWNER-DECISION | Faster testing vs. effort per product |
| Phone/SMS sign-up (PLAT-ID-003) | LATER | Not built; Tontine and HopeBridge want it after the pilot |
| MFA / step-up for money roles | OWNER-DECISION | Tontine decision 5; maker-checker is the pilot control |
| Partner → customer organisation levels (Gap 1) | LATER | Needs the foundation plan; not needed for testers |
| Banking self role in personal workspaces (DD-12) | OWNER-DECISION | Configuration, not yet proven |

---

## 6. Gaps 1–7 (as they apply to accounts and access)

| Gap | How it applies here |
| --- | --- |
| 1 Organisation levels | The kit has flat organisations: no parent, no partner, no "partner's customers". Only an ADS operator, or the old self-onboard route, can create organisations. A partner cannot yet create its customers' organisations. |
| 2 Entitlements and provisioning | Any organisation admin can grant any product's roles in their organisation for **every** registered product. Nothing records which products an organisation is allowed to use. Recommended owner: the kit (an entitlement table checked at grant and at sign-in). Software Factory supplies the package templates. |
| 3 Billing | Access is not tied to payment anywhere in the sign-in. Test organisations stay free. Billing v1 must later switch entitlements on and off. |
| 4 Public catalogue | The Hub site needs no sign-in, and a signed-in visitor holds `member` with no portal. The catalogue page can stay public. |
| 5 VentureWorks | Its access-request grant targets a role service that does not exist (`ADS_ROLE_ADMIN_URL`). Reconcile it with the kit's `/admin/v1` (ACC-10). |
| 6 Name check | Role names follow PLAT-ROLE-001 in the handbook copy (`docs/handbook/PLATFORM_REQUIREMENTS.md`); no naming conflict was found for accounts. |
| 7 Legal review | Testers need short tester terms: synthetic data only, and no real patient, mental-health, child or financial details. Education (minors), Health, SoulBridge and Mama Care need that wording reviewed. Entry fees and BNPL are not part of sign-in. |

---

## 7. Finalization build register

| ID | Title | What it is | Depends on | Size | Acceptance check |
| --- | --- | --- | --- | --- | --- |
| ACC-01 | Host the shared sign-in | Run `services/identity` at the test login address with TLS, signing key, cookie secret, SMTP from `admin@africadigitalsynergy.com`, backups; add a kit deploy workflow with preflight | Hosting plan | M | `/.well-known/openid-configuration` and `jwks.json` reachable from the Contabo server; the Software Factory and Project Management preflights pass their sign-in checks; an activation email arrives |
| ACC-02 | Client registration list | One reviewed file of the 26 products (return addresses, self roles, personal on/off, admin roles, `assignable_roles` without ADS-only roles), applied with `register-client`; client secrets created | ACC-01 | M | Every product's sign-in returns to its page; a self-grant of an ADS-only role is refused (`ROLE_NOT_ASSIGNABLE`) |
| ACC-03 | Close self-escalation in the kit | Setting that switches off `/v1/identity/onboard` (off by default); refuse grants for products with empty `assignable_roles` in production | — | S | The section 1.7 probe gets 404/403 at onboard; tests added |
| ACC-04 | ADS staff organisation claim | Operator command marks organisations as ADS staff; the token carries it; products may use it instead of their own lists | Owner decision 4 | M | Token shows the flag only for marked organisations; kit tests |
| ACC-05 | Staff-organisation check in 6 products | Commerce and Fleet Guard (pilot), then Mama Care, SoulBridge, Morphoo, Nutrition: the staff role counts only in a listed ADS staff organisation | ACC-04 or a per-product list | M (S per product) | A test with the role in a non-staff organisation is refused and audited |
| ACC-06 | Test organisations and bulk invitations | `create-organization --test`, `test` claim, CSV bulk invite, membership expiry, "who has which test role" report | ACC-01 | M | 20 invitations from one CSV are accepted; an expired test membership cannot sign in |
| ACC-07 | Tester runbook and persona list | One page per product: test organisations, personas, which roles need two people | ACC-02 | S | Coordinator can onboard a new tester in under 10 minutes using only the runbook |
| ACC-08 | Product staff settings for the test environment | Set the staff-organisation settings and admin scripts listed in section 4 step 4 | ACC-01, test organisations | S | Each staff persona reaches its screen; the same role in another organisation is refused |
| ACC-09 | Client secrets for products that call the kit admin API | `set-client-secret` for Health, Project Management, Investment, Logistics, Tourism, Mama Care, Agriculture, HopeBridge, Software Factory; store them in server secrets | ACC-02 | S | Each product's staff/invite screen works; no "service unavailable" |
| ACC-10 | VentureWorks grants through the kit | Replace `roleAdmin.mjs` target with token exchange plus `/admin/v1` grant | ACC-09 | M | VW-J44 approved request ends "granted"; the user's next token has the role |
| ACC-11 | Education grants through the kit | Apply approved role requests through `/admin/v1` instead of "pending activation" | ACC-09 | M | J28 shows the role active after approval |
| ACC-12 | Fleet Guard and Tontine invitations through the kit | Team invitations create kit invitations with roles; Tontine members can be invited from outside the organisation | ACC-09 | M | FG-J-20 and DT-J01 pass without any CLI step |
| ACC-13 | Hub grants through the kit | Replace the direct identity-database writes with `/admin/v1` | ACC-09 | S | HUB-J14 passes with no `IDENTITY_ADMIN_DATABASE_URL` |
| ACC-14 | Remove the shared test password | Delete the fixed password from `repair-universal-test-identity.yml`; disable that account | — | S | No password literal in any workflow (search check in CI) |
| ACC-15 | Synthetic seed sets | Per pilot product, a Test-mode-only seed (refuses production, as Career's does) | Owner decision 6 | M | Seed loads on a fresh test database; production start refuses it |

---

## 8. Decisions needed from the owner

| # | Decision | Recommendation |
| --- | --- | --- |
| 1 | Switch off the old self-service "create organisation" route now? | **Yes.** No product app needs it; it is the self-escalation path. |
| 2 | During the pilot, who may create organisations? | **ADS operators only.** Self-service shop or school creation comes later, with approval and entitlements (Gap 1–2). |
| 3 | Testers: own accounts plus invitations into one test organisation per product? | **Yes.** No shared or demo accounts. Two testers for every maker-checker journey. |
| 4 | Add a "test organisation" and an "ADS staff organisation" flag to the kit? | **Yes to both, kept small (ACC-04, ACC-06).** Test flag first. The staff flag replaces the product-specific lists over time. |
| 5 | Host all 20+ platforms for testers before the 6 products in section 2.3 are fixed? | **Yes, if ACC-02 and ACC-03 are done first.** That configuration stops anyone granting those roles to themselves. Fix Commerce and Fleet Guard in the pilot builds. |
| 6 | Load synthetic starting data for testers? | **Only for the 5 pilot products** (ACC-15); the others are tested by creating data through the journeys. |
| 7 | One sign-in instance for testers and later customers, or a separate test instance? | **Separate test instance** (`login.test…`), so test accounts and organisations never mix with the first real customers. |
| 8 | Turn on Google sign-in for testers? | **Yes** if an ADS Google client is available (`docs/GOOGLE_SIGN_IN_SETUP.md`); email activation stays the default. |
| 9 | Should the 6 staff-only products give new accounts a starting role (e.g. VentureWorks `founder`, Tontine `member`)? | **Not for the pilot.** Keep them invitation-only; revisit VentureWorks founders with Gap 5. |
| 10 | Banking: customer role automatically in the personal workspace (DD-12)? | **Yes**, and prove it in the Banking tests before hosting. |

---

## Appendix: commits read (origin/main, 20 Oct 2026)

ads-platform-kit `c74c5ad` · software-factory `17ef7cf` · career-path-platform `d0cc0dc` · nutrition-intelligence-platform `eeb691f` · personal-life-financial-intelligence `b6f1ad3` · education-and-intelligent-services `d45ea67` · go-ahead-guesser `ca4ed1e` · africa-digital-synergy-ventureworks `df5f6a3` · ads-commerce-platform `924d714` · logistics `a9455bd` · mama-care-and-intelligent-services `4986ee9` · fleet-guard-and-intelligent-services `9998bdb` · digital-tontine-and-intelligent-services `d05e91e` · ads-leisure-recreation-events `95c91b6` · soulbridge-mental-health-project `78d3808` · health `204e605` · home-services `7a4b514` · project-management-platform `19a9c83` · africover-insurance-project `6addf7c` · agriculture `19b6592` · intelligent-cryptocurrency-platform `2fe89cc` · africa-digital-synergy-hub `fe33665` · hopebridge `ddac94e` · tourism-platform `bc1a0f8` · banking-platforms `5b35b3f` · transport-platform `75bd890` · rag-intelligence-ai-platform `baf3ce3` · retail-connect-kit `47b3c07` (reference).

How the facts were gathered:
- Code and migrations were read on each commit above.
- The products' own `docs/delivery/E2E_STATUS.md` and test client registrations were read.
- GitHub Actions run results and preflight annotations from 19 Oct were read.
- The kit was run locally on throwaway database `acct_identity` (dropped).
- This sandbox cannot reach the public login address itself: its proxy blocks it, so "not reachable" comes from the server-side preflights.

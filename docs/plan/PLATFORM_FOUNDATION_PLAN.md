# ADS platform foundation plan: organisation levels, entitlements, billing v1, methodology name

Owner: Kengjiseh Sondo (ADS). Written 20 October 2026 on the planning branch. **Planning only: nothing in this file changes any code.**

Covers master-plan gaps **1** (organisation levels), **2** (who owns entitlements and provisioning), **3** (billing) and **6** (methodology name) for the five pilot platforms: Education, Commerce, VentureWorks, Fleet Guard and Digital Tontine.

## Summary for the owner

1. **Today ADS has one level of organisation.** The shared sign-in (ads-platform-kit) knows organisations, workspaces, members and product roles, but there is no "parent" organisation, no partner and no ADS super-admin screen. ADS operators create organisations from a command line. Products isolate data by the token's `tenant_id`, and that works well.
2. **Recommended: add the partner level inside the shared sign-in, and leave product databases unchanged.** Each organisation gets a parent (ADS or a partner). A partner admin can create customer organisations only within what ADS allowed. Products keep isolating data by `tenant_id` alone. So partner A can never reach partner B's customers through a product, and a customer can change partner without its data moving.
3. **Entitlements (which products and services an organisation may use) belong in the kit too.** Software Factory owns the package and white-label templates. Each product publishes a small capability manifest and enforces it on its server and in its menus. Commerce's one-switch `BANK_COLLECTION` table becomes the first thing moved over.
4. **There is no shared billing, ledger, settlement or funding engine anywhere on main.** The only shared-looking billing tables are in Software Factory, and they are parked and closed to the runtime. Recommended: a small **billing v1 service in ads-platform-kit**. It covers entry-fee invoices, package subscriptions, invoices, and MTN MoMo / Orange Money payment through the kit mocks, with honest states. Revenue share, payouts to partners, a ledger and funding come later.
5. **"ADS Full-Stack Methodology v2" is the name of the old standards chain (v2.0 to v2.3).** The Handbook v1 replaced it on 18 October 2026. The master plan should refer to the Handbook v1, the Platform Requirements and the Agentic/RAG Integration Standard instead.

Estimated foundation work: about 9 M-sized and 3 L-sized build items in the kit, plus 1 M item per pilot product. Sizes are explained in the build register.

---

## 0. Evidence base (what was read)

| Repo | Commit read (`origin/main`) | What was used |
| --- | --- | --- |
| ads-platform-kit | `c74c5ad` | `services/identity/migrations/001–004`, `src/admin.mjs`, `src/oauth.mjs`, `src/server.mjs`, `src/cli.mjs`, `src/legacy.mjs`, `src/config.mjs`, `services/mocks/README.md`, `examples/sample-product/src/payments-adapter.mjs`, `docs/INTEGRATING_A_PRODUCT.md`, `docs/handbook/PLATFORM_REQUIREMENTS.md`, `deploy/docker-compose.yml` |
| ads-commerce-platform | `924d714` | `db/migrations/024`, `026`, `029`; `scripts/commerce-admin.mjs`; `src/App.tsx`; `src/server/access.mjs`, `identity.mjs`, `cashBatches.mjs`; `docs/backlog/USER_STORIES_MVP.md` (COM-ADM-S01); `docs/journeys/CUSTOMER_JOURNEYS.md` (J-25) |
| education-and-intelligent-services | `d45ea67` | `docs/architecture/EDUCATION_ADMIN_ROLES_SERVICES_2026-10-16.md`, `docs/release/EDUCATION_THREE_PHASE_ROLLOUT_2026-10-16.json`, `README.md`, server RLS settings |
| africa-digital-synergy-ventureworks | `df5f6a3` | `db/migrations/010_wpb_payment_entitlement.sql`, `src/server/adapters/payments.mjs`, `docs/backlog/USER_STORIES_MVP.md` (VW-US-009) |
| fleet-guard-and-intelligent-services | `9998bdb` | `db/migrations/006_row_level_security.sql`, `src/server/db.mjs`, `docs/requirements/README.md` (D5) |
| digital-tontine-and-intelligent-services | `d05e91e` | `db/migrations/007_contributions_ledger_reconciliation.sql`, `src/server/adapters.mjs` |
| software-factory | `17ef7cf` | `infrastructure/database/migrations/20260828130000_workstream_u_shared_commerce.sql`, `…20260819190000…`, `…20260819193000…`, `…20261019130000_sf_packages.sql`; `docs/delivery/GO_LIVE_RUNBOOK.md`; `docs/standards/`; `docs/handbook/*` |
| software-factory branch `audit/agentic-rag-standard-20261019` | `24eb63c` | `docs/handbook/AGENTIC_RAG_INTEGRATION_STANDARD_v1.md` |
| rag-intelligence-ai-platform | main | `database/platform/002_api_entitlements.sql`, `003_commercial_entitlements.sql` |
| retail-connect-kit, banking-platforms, africover, go-ahead-guesser | main | searched for billing, ledger, settlement and entitlement tables |

---

## Part 1. Organisation levels: ADS → partner → partner's customers (gap 1)

### 1.1 What exists today (kit identity, `c74c5ad`)

| Concept | Where | What it does today | Gap for the partner model |
| --- | --- | --- | --- |
| Organisation | `platform.organizations` (migration 001, `kind` added in 002: `organization` or `personal`) | Name, slug, status | No parent, no type (ADS / partner / customer), no data-owner field |
| Workspace (tenant) | `platform.tenants` (001) | One per organisation in practice (`cli.mjs create-organization` makes one org + one tenant) | Fine as is |
| Membership | `platform.memberships` (001): role `owner`/`admin`/`member`, status | Who belongs to which workspace | No "delegated" kind, no expiry |
| Product roles | `platform.product_roles` (002) | Roles per user, workspace and product | Fine as is |
| Products | `platform.oauth_clients` (002, 004): `admin_roles`, `assignable_roles`, `admin_scopes`, client secret | Registered ADS products | No capability list, no manifest |
| Org admin API | `/admin/v1/me`, `/members`, `/members/{id}/roles/grant\|revoke`, `/deactivate`, `/reactivate`, `/org-admin`, `/invitations` (`server.mjs` 584–613) | Org/product admins manage **their own** workspace. The product server exchanges the admin's token for a 5-minute admin token (RFC 8693, `admin.mjs` `exchange`). Rights are re-checked in the database on every call (`authority`, `authorize`) | Cannot create organisations; nothing works across organisations |
| Invitations | `platform.invitations` (004) | Email (and SMS hook) invitation into one workspace for one product with roles; accepted only by the account with the invited email | Reusable for "partner invites customer's first owner" |
| Creating organisations | `cli.mjs create-organization` (ADS operator, shell) and `legacy.mjs onboard` (Software Factory self-service, one org per user) | Only ADS operators or self-service | No partner path; no ADS admin screen |
| ADS platform admin | none | — | No `platform_admin` concept in the kit. Education invented its own `platform_admin` role (`EDUCATION_ADMIN_ROLES_SERVICES_2026-10-16.md`) |
| Token claims | `oauth.mjs accessTokenFor` | `sub`, `tenant_id`, `roles`, `email`, `email_verified`, `name`, `client_id`, `sid`; `aud` = product; 15-minute lifetime (`config.mjs` `accessTokenTtl` 900) | No organisation, partner or delegation claim |
| Audit | `platform.identity_audit`, append-only trigger (002) | Sign-in and admin events with before/after | Reuse for every new event below |

How products isolate data today (all five pilots): the server sets `app.tenant_id` from the verified token and PostgreSQL row-level security (RLS) compares it with each row's `tenant_id`. Commerce (`src/server/access.mjs withOrgScope`), Education (`app.tenant_id`, `app.actor_roles`), VentureWorks, Fleet Guard (`src/server/db.mjs`) and Tontine all do this.

**Existing cross-organisation exceptions (important for partner safety).** Three product rules already let one organisation see another's rows. All three are *global* switches, not limited to a partner:

| Product | Rule | Effect |
| --- | --- | --- |
| Commerce | `app.commerce_review_team` (migration 029) | ADS review team sees every shop's drafts |
| Commerce | bank policies on `cash_batches` (026) | A bank sees the batches addressed to it |
| Fleet Guard | `app.support_agent` (006) | Support agents see every tenant's support cases |

**Rule for the partner model:** partner staff must never get these global switches. Partner access is always per customer workspace, through a delegation (1.4.4).

### 1.2 Design principles

1. **Products keep isolating by `tenant_id` only.** The hierarchy lives in the kit. No product table gets a `partner_id` column for access control. This keeps today's RLS correct, and a customer can move to another partner (or to ADS directly) without any data being rewritten.
2. **The kit decides who may manage what, from its own database, on every call.** This is the same rule `admin.mjs` already follows ("nothing a caller sends is taken as proof of admin rights").
3. **A partner never becomes a member of a customer's workspace by default.** A partner administers the *account* of a customer organisation (create it, invite its owner, set its package within limits). Seeing or changing the customer's *business data* needs a delegation that the customer consented to, with an expiry.
4. **Customer data belongs to the customer organisation** (master plan §14). ADS hosts it and the partner processes it only under a delegation. The contracts decide the rest (gap 7).
5. **Two levels below ADS, no deeper, for the pilot.** ADS → partner → customer. Sub-resellers are LATER.

### 1.3 Data model sketch (additions to the kit `platform` schema)

**`platform.organizations`: new columns**

| Column | Type | Meaning | Rule |
| --- | --- | --- | --- |
| `org_type` | text: `ads`, `partner`, `customer`, `direct`, `personal` | `direct` = an ADS customer with no partner; `personal` keeps today's meaning | Exactly one `ads` organisation |
| `parent_org_id` | uuid, nullable | ADS org for partners and direct customers; the partner for its customers | Set by the kit only; a customer's parent must be a `partner` or the `ads` org |
| `partner_org_id` | uuid, nullable | Copy of the owning partner for fast checks (null for ADS, direct and personal) | Kept equal to parent when parent is a partner; database check |
| `data_controller` | text, default `self` | Who controls the data (master plan §14) | Always `self` in the pilot; other values only by contract (OWNER-DECISION D-F4) |
| `created_via` | text: `cli`, `self_service`, `ads_admin`, `partner`, `provisioning` | Origin, for audit | — |

**`platform.partner_agreements`** (one row per agreement between ADS and a partner; the contract itself lives in VentureWorks)

| Column | Meaning |
| --- | --- |
| `id`, `partner_org_id` | The partner |
| `ventureworks_ref` | VentureWorks venture or agreement id (source of truth for the contract) |
| `status` | `draft`, `active`, `suspended`, `ended` |
| `valid_from`, `valid_until` | Term |
| `max_customers` | Ceiling on customer organisations (null = no ceiling) |
| `territory` | Free text for the pilot (for example "Yaoundé"); used for display only, not access |
| `created_by`, `created_at` | ADS admin who recorded it |

**`platform.partner_offer_rights`** (what the partner may sell; see Part 2 for packages)

| Column | Meaning |
| --- | --- |
| `agreement_id`, `package_key` | The partner may provision this package for its customers |
| `adjustable_capabilities` | Optional capabilities the partner may switch on or off for a customer |
| `max_limits` | Upper bounds the partner may set (for example `branches.max ≤ 5`) |

**`platform.memberships`: new columns, for delegated access**

| Column | Meaning |
| --- | --- |
| `kind` | `member` (today) or `delegated` (partner staff working inside a customer workspace) |
| `via_partner_org_id` | The partner the person works for (delegated only) |
| `delegation_id` | Link to the consent record |
| `expires_at` | Delegated memberships always expire (default 30 days, renewable) |

**`platform.delegations`** (the customer's consent)

| Column | Meaning |
| --- | --- |
| `id`, `customer_tenant_id`, `partner_org_id` | Who lets whom in |
| `grantee_user_id` | One named person (no "all partner staff" grants in the pilot) |
| `client_id`, `roles` | Product and roles allowed (must be in the product's `assignable_roles`, never admin roles unless the owner ticks it) |
| `purpose` | Required text, for example "set up store and train cashiers" |
| `status` | `requested`, `approved`, `revoked`, `expired` |
| `requested_by`, `approved_by` (customer owner/admin), `approved_at`, `expires_at`, `revoked_by`, `revoked_at` | Consent trail |

### 1.4 Behaviour

#### 1.4.1 Who can do what

| Actor | Can | Cannot |
| --- | --- | --- |
| **ADS platform admin** (owner/admin membership in the `ads` organisation and the new kit role `platform_admin` on the `ads-console` client) | Create partner organisations, record agreements and offer rights, create direct customers, change any organisation's entitlements, suspend organisations, view all audit | Read customer business data in products. ADS staff support needs a delegation like anyone else (same rule as Education's `platform_admin`, which "is not a superuser of student/financial/guardian data") |
| **Partner admin** (owner/admin membership in a `partner` organisation) | Create customer organisations under its own partner org within `max_customers` and offer rights; invite each customer's first owner; adjust a customer's optional capabilities and limits within offer rights; request delegations; see its customers' account list, packages and status | See or create customers of another partner; give itself product roles in a customer workspace; exceed offer rights; remove the customer's owner |
| **Customer owner/admin** | Everything today's org admin can (members, roles, invitations); approve or revoke partner delegations; see its own entitlements | Change its own package (asks the partner or ADS) |
| **Partner staff with an approved delegation** | Work in that one customer workspace with the delegated roles until expiry | Any other customer; anything after revocation (refresh tokens revoked at once, access token ends within 15 minutes, as `setActive` does today) |

#### 1.4.2 Partner creates a customer (pilot path)

1. The partner admin signs in to the kit admin page (or the partner area in VentureWorks), chooses **Add customer** and enters the name, owner's email, language and package.
2. The kit checks, in one transaction: the agreement is active, the customer count is under `max_customers`, and the package is in the partner's offer rights. It then creates the organisation (`org_type=customer`, `parent_org_id=partner`), its workspace and the package entitlements, and sends the invitation to the owner (existing `invitations` table, `org_admin=true`).
3. The provisioning step for each product in the package runs (Part 2.6).
4. The customer owner accepts the invitation and becomes `owner`. The partner admin is not a member.

#### 1.4.3 Token claims products need

Keep every existing claim unchanged, and add three:

| Claim | Example | Who uses it | Trust |
| --- | --- | --- | --- |
| `tenant_id` | (unchanged) | RLS in every product | Unchanged |
| `org_id` | uuid of the organisation | Display, reporting | Informational |
| `org_type` | `customer` | Products that show partner branding or hide "change plan" | Informational |
| `partner_id` | uuid of the partner, or absent | Partner branding (white label), support routing | **Never used for data access** |
| `act` (only for delegated access) | `{ "sub": "<partner user>", "partner_id": "…", "delegation_id": "…" }` | Products show a "Partner staff" banner and record it in their audit | Kit sets it only from an approved, unexpired delegation |
| `caps` | `["pos","cash","bank_collection"]` | Menu filtering and server gates (Part 2.7) | Kit sets it from entitlements for this product (`aud`) only |

Why not put the partner's list of customers in the token: it would grow without limit, and a product that trusted it would widen RLS. Partner-wide views come from the kit and from the reporting API (Part 2.9), never from product queries across tenants.

The claims are standard JWT custom claims, so the move to Keycloak mentioned in the kit README stays a configuration change.

#### 1.4.4 Partner staff inside a customer workspace (consent and audit)

1. The partner admin requests a delegation: person, product, roles, purpose and length (at most 90 days).
2. The customer owner sees the request on the kit admin page, or by email, and approves or refuses. The pilot shortcut: when the partner creates the customer, the owner's invitation can include a pre-filled setup delegation that the owner approves when accepting. It is still one explicit tick, never implied.
3. On approval the kit creates a `delegated` membership with `expires_at` and grants the roles. Every token for that person in that workspace carries `act`.
4. Revocation or expiry ends it the same way deactivation does today: the membership is disabled and refresh tokens are revoked.
5. Every step goes to `identity_audit`: requested, approved, refused, used (first sign-in), revoked or expired. Products also log `act.sub` next to `sub` in their own audit tables.

#### 1.4.5 Partner isolation rules (testable)

| # | Rule |
| --- | --- |
| ISO-1 | Every partner API call resolves the caller's partner organisation from the database and compares it with the target's `partner_org_id`. On mismatch it returns **404** (not 403, so it does not reveal that the target exists), with an `admin_denied` audit row |
| ISO-2 | A partner admin's own token for a product carries the partner's `tenant_id`, so product RLS shows only the partner's own workspace |
| ISO-3 | Partner staff reach customer data only through `delegated` memberships, one workspace at a time |
| ISO-4 | Product global cross-tenant switches (review team, bank, support agent) are granted only for roles held in the `ads` organisation or a bank organisation, never for roles held in a partner organisation. Each product adds a test for this |
| ISO-5 | Changing a customer's parent (partner exit) is an ADS-admin-only action. It revokes the old partner's delegations and does not touch product data |

### 1.5 API endpoints (kit identity)

| Endpoint | Caller | Purpose |
| --- | --- | --- |
| `POST /platform/v1/partners` | ADS admin | Create a partner org and owner invitation |
| `POST /platform/v1/partners/{org}/agreements`, `PATCH …/{id}` | ADS admin (VentureWorks server later) | Record or suspend an agreement and its offer rights |
| `POST /platform/v1/organizations` | ADS admin | Create a direct customer |
| `POST /platform/v1/organizations/{org}/suspend\|reactivate` | ADS admin | Suspend: tokens stop being issued for all its workspaces |
| `POST /platform/v1/organizations/{org}/move` | ADS admin | Change the parent (partner exit); LATER |
| `GET /partner/v1/me` | Partner admin | Agreement, offer rights, customer count |
| `GET /partner/v1/customers`, `GET …/{org}` | Partner admin | Own customers only (ISO-1) |
| `POST /partner/v1/customers` | Partner admin | Create a customer (1.4.2). Idempotency key required |
| `POST /partner/v1/customers/{org}/delegations` | Partner admin | Request delegated access |
| `GET /admin/v1/delegations`, `POST …/{id}/approve\|refuse\|revoke` | Customer owner/admin (existing admin-token path) | Consent |

The same calls are on the hosted `/admin` page (`admin-page.mjs`), so the pilot needs no new product screens for this.

### 1.6 Security rules

- **S1-1:** Partner and platform APIs use the existing admin-token pattern: the user's token is exchanged for a short-lived admin token, with new scopes `partner:customers:write`, `partner:delegations:write`, `platform:orgs:write` and `platform:entitlements:write`. No service-role shortcut.
- **S1-2:** `platform_admin` can only be granted from the CLI by an operator. It cannot be granted through `/admin/v1` (add it to a deny-list in `cleanRoles`).
- **S1-3:** Partner admins cannot grant product roles in customer workspaces except through delegations.
- **S1-4:** Customer creation counts and checks `max_customers` under a row lock on the agreement, so two parallel requests cannot exceed it.
- **S1-5:** All new events are written to `identity_audit` in the same transaction as the change.

### 1.7 Test strategy (part 1)

| Level | Tests |
| --- | --- |
| Kit unit/integration (real PostgreSQL, like `test/admin.test.mjs`) | Partner creates a customer within limits; over limit gets 409; package outside offer rights gets 403; partner A listing, reading, delegating or creating under partner B gets 404 plus an audit row; delegated membership expires and is revoked; `act` claim only while the delegation is approved; `platform_admin` not grantable by API; agreement suspended blocks new customers |
| Kit E2E (`examples/sample-product`, Playwright through `packages/e2e-kit`) | ADS admin creates a partner → partner creates a customer → owner accepts → partner staff requests a delegation → owner approves → staff sees the "Partner staff" banner → owner revokes → access ends |
| Each pilot product | Token with `partner_id` and `act` changes nothing in RLS; partner-org roles do not trigger product global switches (ISO-4); product audit records `act.sub` |

### 1.8 Classification (part 1)

| Feature | Class | Reason |
| --- | --- | --- |
| `org_type`, `parent_org_id`, `partner_org_id` | PILOT-MVP | Pilots A and C (master plan §11) need partner-created customers |
| Partner agreement and offer rights (minimal fields) | PILOT-MVP | Needed to enforce "within what ADS allowed" |
| Partner creates customer + owner invitation | PILOT-MVP | Core of gap 1 |
| `org_id`, `org_type`, `partner_id` claims | PILOT-MVP | Cheap; needed for white-label branding and support routing |
| Delegated access with consent, expiry, `act` claim | PILOT-MVP | Partners must set up merchant stores and schools; without it they would be given ordinary memberships with no expiry and no consent trail |
| ADS platform admin role and minimal hosted screens | PILOT-MVP | Today only a shell command can create organisations |
| ISO-1…ISO-5 tests in kit and products | PILOT-MVP | Partner isolation is the main new risk |
| Partner exit / move customer | LATER | No partner exits during the pilot; design keeps it possible |
| Sub-resellers (more than 2 levels) | LATER | Not in master plan pilots |
| Partner-wide staff groups ("all our technicians") | LATER | Named-person delegations are safer and enough for the pilot |
| `data_controller` other than `self` | OWNER-DECISION (D-F4) | Contractual; default `self` |

---

## Part 2. Entitlements and provisioning (gap 2)

### 2.1 Ownership (recommendation)

| Responsibility | Owner | Why |
| --- | --- | --- |
| Product capability manifests (what a product can offer) | **Each product repo**, file `ads/manifest.json`, published to the kit | Only the product knows its modules |
| Package and white-label **templates** (named bundles, default limits, branding slots) | **Software Factory** | Master plan §14 and §15.4: reusable commercialisation templates |
| Packages and plans **in force**, per-organisation entitlements, provisioning API, audit | **ads-platform-kit** (identity service, new `entitlements` module) | Entitlements must reach the token at sign-in, in the same database as organisations and roles |
| Enforcement (server gates and menus) | **Each product**, using a kit client package | Handbook PLAT-ROLE-001: "enforced on the server" |
| Contract that triggers provisioning | **VentureWorks** | Master plan §14 |

Software Factory templates reach the kit as versioned JSON files (`templates/packages/*.json` in Software Factory), imported by an ADS admin command. The kit never reads Software Factory's database.

Note: Software Factory's existing `sf.packages` table (`20261019130000_sf_packages.sql`) is a **requirements package** frozen at customer approval (SF-US-008). It is not a commercial package. The two must not be confused or merged.

### 2.2 Prior art found (reuse ideas, not tables)

| Where | What | Use |
| --- | --- | --- |
| rag-intelligence-ai-platform `database/platform/003_commercial_entitlements.sql` | `commercial_plans`, `plan_entitlements`, `platform_accounts` (tenant → plan), `account_entitlement_overrides`, `entitlement_defaults`, `resolve_effective_entitlement()` | Good shape (plan defaults + per-tenant override). Same `platform` schema lineage as the kit identity. Copy the idea |
| software-factory `20260828130000_workstream_u_shared_commerce.sql` | `commerce_platform.purchase_entitlements` (`pending/active/suspended/revoked/failed`), `provisioning_jobs` (`pending/running/succeeded/retrying/failed/manual_resolution/compensated`, idempotency key) | Reuse the state lists |
| Education `docs/release/EDUCATION_THREE_PHASE_ROLLOUT_2026-10-16.json` + `GET /v1/education/admin/capabilities` | 32 source-defined modules with phase, routes, API, roles | Nearly a manifest already; convert, do not rewrite |
| Commerce `commerce.org_capabilities` (026) | One capability, `BANK_COLLECTION` | First migration case (2.10) |

### 2.3 Product capability manifest (master plan §5)

One JSON file per product, versioned with the product code, checked by a JSON Schema shipped in the kit (`packages/entitlements-client/manifest.schema.json`).

| Field | Content | Example (Commerce) |
| --- | --- | --- |
| `manifest_version` | Schema version | `1` |
| `product` | Kit `client_id` | `commerce-web` |
| `name` | EN/FR | `{ "en": "ADS Commerce", "fr": "ADS Commerce" }` |
| `release` | Product release | `1.0.0` |
| `capabilities[]` | `key`, `title` (EN/FR), `kind` (`module`/`feature`), `default` (on/off), `depends_on[]`, `roles[]` that may use it (default role-to-service map), `menu[]` section ids, `api[]` route prefixes, `external[]` adapters (`momo`, `bank`, `ai-gateway`), `status` (`available`, `test_mode`, `planned`) | `{ "key": "bank_collection", "kind": "feature", "default": false, "depends_on": ["cash"], "roles": ["merchant_owner","commerce_accountant"], "menu": ["cash"], "api": ["/v1/cash-batches"], "external": ["bank"], "status": "test_mode" }` |
| `limits[]` | `key`, type, default, unit | `{ "key": "branches.max", "type": "integer", "default": 1 }` |
| `roles[]`, `admin_roles[]` | Same as today's client registration | `merchant_owner`, `commerce_cashier`, … |
| `provisioning` | Product webhook path and the events it handles | `{ "webhook": "/internal/ads/provisioning", "events": ["tenant.provisioned","entitlements.changed","tenant.suspended"] }` |
| `reporting.metrics[]` | Aggregate metrics the product can share: `key`, `title`, `type` (`count`/`sum_xaf`), `personal_data: false` (must be false) | `active_branches`, `pos_sales_count`, `published_products` |
| `deployment` | Runtime needs: database, env vars by name only, ports | `{ "database": "postgres16", "needs": ["ADS_IDENTITY_URL","ADS_MOCKS_URL"] }` |
| `licensing[]` | Allowed models from master plan §2 | `["saas","white_label","partner_operated"]` |
| `dependencies[]` | Kit services and other products | `["ads-identity","ads-billing","ads-ai-gateway"]` |

Publishing: product CI validates the file; an ADS admin publishes it with `cli.mjs publish-manifest --file …` (pilot), or CI pushes it with a client secret (LATER). The kit stores each version immutably with a content hash.

### 2.4 Packages and plans

- **Package** = what a customer gets: one or more products, the capabilities switched on, and limits.
- **Plan** = how it is paid for: a price and a period for a package (Part 3). A package can have several plans (monthly, yearly). A partner entry fee is a plan with period `one_off` and no package.

| Table | Key columns |
| --- | --- |
| `platform.product_manifests` | `client_id`, `release`, `manifest` (JSON), `content_hash`, `status` (`published`/`retired`), `published_by`, `published_at` |
| `platform.capabilities` | `client_id`, `capability_key`, `kind`, `default_on`, `depends_on[]`, `roles[]`, `status` (filled from the latest manifest) |
| `platform.packages` | `package_key`, `version`, `name` (EN/FR), `template_ref` (Software Factory template file and version), `audience` (`direct`, `partner`, `both`), `status` (`draft`/`active`/`retired`) |
| `platform.package_items` | `package_key`, `version`, `client_id`, `capability_key` or `limit_key`, `value` (true/false or a number), `partner_adjustable` (bool) |
| `platform.org_entitlements` | `tenant_id`, `client_id`, `key`, `value`, `source` (`package`/`ads_override`/`partner_adjustment`), `source_ref`, `valid_from`, `valid_until`, `status` (`active`/`suspended`/`revoked`), `set_by`, `updated_at` |
| `platform.org_packages` | `tenant_id`, `package_key`, `version`, `status` (`active`/`suspended`/`ended`), `assigned_by`, `assigned_at` |

**Effective entitlement** for (workspace, product, key) = the latest active `ads_override` if present; otherwise the `partner_adjustment` within offer rights; otherwise the package value; otherwise the manifest default. A capability is effectively off if any capability in its `depends_on` is off. When a package is upgraded to a new version, existing organisations stay on their version until moved.

### 2.5 Who sets entitlements

| Actor | May set | Limits |
| --- | --- | --- |
| ADS admin | Any package, any override, any organisation | Reason required; audited |
| Partner admin | For its own customers: the package (from offer rights), on/off for `partner_adjustable` capabilities, limits up to `max_limits` | ISO-1; cannot exceed what the package or the offer right allows |
| Customer owner | Nothing in the pilot (reads its entitlements) | Narrowing role-to-service maps is LATER (2.8) |
| Product servers | Nothing (read only) | — |

### 2.6 Provisioning API (master plan §5: "creates the tenant or workspace after a contract")

| Endpoint | Caller | Purpose |
| --- | --- | --- |
| `POST /provisioning/v1/requests` with `{ idempotency_key, contract_ref, parent_org_id, customer: { name, owner_email, locale, country }, package_key, plan_key? }` | VentureWorks server (partner orgs after an agreement), partner admin (customers), ADS admin | Creates organisation + workspace + entitlements + owner invitation, then one step per product |
| `GET /provisioning/v1/requests/{id}` | Same callers | Status per product step |
| Product webhook `POST {product}/internal/ads/provisioning` (signed, like the mocks' `ads-mock-signature` scheme) | Kit → product | Events `tenant.provisioned`, `entitlements.changed`, `tenant.suspended`, `tenant.reactivated`, `delegation.revoked` |
| `POST /provisioning/v1/steps/{id}/complete` (client secret) | Product → kit | Product confirms it created its own starter records (for example the Commerce shop profile) |

Request states: `pending → running → succeeded`, or `retrying`, `failed`, `manual_resolution`. These are the same states Software Factory's parked `provisioning_jobs` uses. A product that is down leaves its step `retrying`; it never blocks other products in the package. The same `idempotency_key` always returns the same request. Products must make their webhook handler idempotent on the event id, and start empty if they receive no webhook at all (lazy creation on first sign-in, as Commerce's `staff_members` already does).

### 2.7 How products read entitlements (recommendation: claim plus cached API)

| Option | Good | Bad | Use for |
| --- | --- | --- | --- |
| **Token claim `caps`** (enabled capability keys for this product only) | No extra call; works offline in the browser for menus; same 15-minute freshness as roles | Changes reach the user within 15 minutes, or at once with `getAccessToken({ forceRefresh: true })` | **Menus and per-request server gates** |
| **API `GET /entitlements/v1/tenants/{tenant}/products/{client}`** (client secret), cached in the product for 60 s, refreshed at once by the `entitlements.changed` webhook | Limits and numbers; immediate effect | Network dependency | **Limits** (for example `branches.max`) and money-moving modules |

Recommended: both, through one kit package `packages/entitlements-client` (same style as `packages/ai-gateway-client`). It offers:

- `requireCapability('pos')` server middleware: answers **403 `CAPABILITY_NOT_ENABLED`** and writes the product's access audit (Commerce already has `commerce.access_audit` with `DENIED_SCOPE`).
- `limit('branches.max')` read from the cached API.
- `visibleSections(sectionsByRole, roles, caps)` for menus.
- A test double for unit tests.

If the API cannot be reached, the client uses the last cached value for up to 10 minutes. After that only the affected capability is refused; the rest of the product carries on.

### 2.8 Server enforcement and menu filtering

1. **Server first.** Every route group declared in the manifest's `api[]` is wrapped in `requireCapability`. Hiding a menu never grants or removes access (Commerce's `access.mjs` already states this rule).
2. **Menu = role ∩ capability.** Menu items shown = sections allowed for the user's roles (from the manifest's default role-to-service map) ∩ capabilities in `caps`. This meets PLAT-ROLE-001 AC-1 (a cashier sees Point of sale and nothing else) and AC-2 (typing the address is refused and audited).
3. **Per-organisation narrowing of the role-to-service map** (the organisation admin "chooses which services each role can use", PLAT-ROLE-001 US 1) is LATER. The manifest default covers the pilot.

### 2.9 "A disabled feature never breaks the rest" (rules and tests)

| # | Rule |
| --- | --- |
| DIS-1 | A disabled capability returns 403 `CAPABILITY_NOT_ENABLED` on its own routes only. Shared routes (for example `/me`, catalogue reads) never call it |
| DIS-2 | Background jobs of a disabled capability skip that tenant; they do not fail the whole job |
| DIS-3 | A capability that others depend on can only be disabled together with its dependants (the kit refuses otherwise with 409 `CAPABILITY_HAS_DEPENDANTS`) |
| DIS-4 | Disabling never deletes data. Re-enabling shows the old records |
| DIS-5 | Every product E2E suite runs once with each optional capability switched off, and all other journeys must still pass. retail-connect-kit's `CLAUDE.md` already demands this ("Tests must prove capability enable/disable safety") |

### 2.10 Operational reporting API with consent (master plan §5)

- Each product exposes `GET /ads/reporting/v1/metrics?from=&to=` that returns **only** the aggregate metrics in its manifest (counts and FCFA sums, no names, no personal data).
- The caller (VentureWorks, or the partner console in the kit) gets a short-lived **reporting token** from the kit with `tenant_id`, `scope=reporting:read`, `recipient`, and `aud` = the product. The kit issues it only if the customer has an active consent.

| `platform.data_sharing_consents` | Meaning |
| --- | --- |
| `tenant_id`, `recipient_org_id` (partner or ADS/VentureWorks) | Who shares with whom |
| `metrics[]` | Which manifest metrics |
| `granted_by`, `granted_at`, `revoked_at` | Customer owner's consent; revocable |

- Products check the reporting token like any token (issuer, audience, `scope`) and run the counts under that tenant's RLS.
- Investors and banks (master plan §10) get nothing from this API in the pilot. They see VentureWorks' verified summaries.

### 2.11 Audit trail

All of these go to `platform.identity_audit` (append-only, already in place) with actor, organisation, before and after values, and reason: manifest published; package created or changed; package assigned; entitlement set, adjusted or overridden; provisioning request and each step; organisation suspended or reactivated; consent granted or revoked; reporting token issued. A minimal viewer is part of PLAT-AUD-001 (AC-3: admins filter and export audit for their organisation only). For partners, it shows only events about their own customers' accounts.

### 2.12 Commerce today and its migration

What Commerce has on `origin/main 924d714`:

| Item | Evidence | Note |
| --- | --- | --- |
| `commerce.org_capabilities` | `db/migrations/026_cash_batches_bank_collection.sql` lines 16–24 | Columns `tenant_id`, `capability` (CHECK: only `BANK_COLLECTION`), `enabled`, `updated_by`; runtime can only SELECT (line 220) |
| Operator switch | `scripts/commerce-admin.mjs setCapability` | Run as schema owner from a shell; "until the platform admin screen exists (COM-ADM-S01)" |
| Server gate | `src/server/cashBatches.mjs capabilityOn` | Reads the table per request |
| Menu by role | `src/App.tsx` lines 37–39 `SECTIONS_BY_ROLE` (`merchant_owner` 10 sections; manager and cashier `pos`; accountant `cash`), filtered at line 53 | Roles only; no capability filter |
| Planned story | `docs/backlog/USER_STORIES_MVP.md:333` COM-ADM-S01; journey J-25 "not started" | Exactly the kit feature |

Migration steps (one Commerce build item, size M):

1. Write `ads/manifest.json` with Commerce's sections as capabilities (`catalog`, `branches`, `reservations`, `orders`, `pos`, `cash`, `staff`, `knowledge`, `storefront`, `bank_collection`). Use `SECTIONS_BY_ROLE` as the default role-to-service map.
2. Kit packages `commerce-pos-starter` and `commerce-store-pro` (names to be confirmed by the owner, from Software Factory templates).
3. One-off script: every existing Commerce tenant gets the pilot package. Each `org_capabilities` row with `BANK_COLLECTION` set becomes an `ads_override` for `bank_collection`.
4. Replace `capabilityOn` with the `caps` claim through `entitlements-client`. Keep `org_capabilities` read-only for one release as a cross-check (log differences), then drop it in a later migration.
5. `App.tsx`: menu = `SECTIONS_BY_ROLE[role] ∩ caps` (via `/me`). Server: `requireCapability` on each route group in `mvpRoutes.mjs`.
6. Retire `commerce-admin.mjs capability` (print a pointer to the kit command). Keep `register-bank` until banks become kit organisations.
7. Tests: the existing `tests/e2e/fixtures.ts` line 80 seeds `org_capabilities` directly; change it to seed kit entitlements through `packages/e2e-kit`. Add DIS-5 runs.

Other pilots: Education converts its rollout JSON into the manifest (its `/admin/capabilities` board then reads kit entitlements). VentureWorks, Fleet Guard and Tontine write a small manifest and wrap their optional modules. Fleet Guard's D5 (billing in MVP or not) is answered by Part 3.

### 2.13 Handbook check: PLAT-ROLE-001 second story

`docs/handbook/PLATFORM_REQUIREMENTS.md` (Software Factory `17ef7cf`; the kit copy is identical) says: "**US** As an ADS platform administrator, I want to enable products and services per organisation so that customers only get what they subscribed to." It has **no acceptance criteria** and is not built. The status line marks PLAT-ROLE-001 "Available" for the first story only.

Recommendation (a handbook pull request, owner approval per handbook §0.4):

- Split the story out as a new requirement **PLAT-ENT-001 Entitlements and provisioning**, with acceptance criteria from 2.7–2.9:
  - AC-1: disabled service hidden and refused.
  - AC-2: change effective within 15 minutes, or at once after a forced refresh.
  - AC-3: disabling never breaks other services.
  - AC-4: every change audited.
  - AC-5: a partner can only set what its rights allow.
- Add **PLAT-ORG-001 Organisation levels** (Part 1), **PLAT-BILL-001 Billing v1** (Part 3) and **PLAT-REP-001 Operational reporting with consent** (2.10).
- Mark PLAT-ROLE-001 US 2 as moved to PLAT-ENT-001.

### 2.14 Test strategy (part 2)

| Level | Tests |
| --- | --- |
| Kit | Manifest schema validation (good/bad files); effective-entitlement resolution order; `depends_on` refusal; partner adjustment within/over rights; `caps` claim contents per product (`aud`) only; provisioning idempotency; one failing product step does not fail others; webhook signature; reporting token refused without consent and after revocation |
| `entitlements-client` | Middleware 403 path; cache expiry and fallback; menu intersection |
| Each pilot product | Each optional capability off → its routes 403 + audited, all other E2E journeys green (DIS-5); entitlement change reaches the menu after forced refresh; webhook replay is harmless |

### 2.15 Classification (part 2)

| Feature | Class | Reason |
| --- | --- | --- |
| Ownership split (kit / Software Factory / products / VentureWorks) | PILOT-MVP | Needed before any build starts |
| Manifest format v1 and schema; manifests for the five pilots | PILOT-MVP | Every later step uses it |
| Packages, package items, org packages, org entitlements | PILOT-MVP | "Customers only get what they subscribed to" |
| Partner adjustments within offer rights | PILOT-MVP | Gap 1 + 2 together |
| Provisioning API with idempotency and per-product steps | PILOT-MVP | Master plan §5; pilots A and C |
| `caps` claim + `entitlements-client` (middleware, menu helper) | PILOT-MVP | Server enforcement plus menus |
| Cached entitlements API for limits | PILOT-MVP | Commerce needs `branches.max`-style limits for packages |
| DIS-1…DIS-5 | PILOT-MVP | Owner's rule that a disabled feature never breaks the rest |
| Commerce migration off `org_capabilities` | PILOT-MVP | Commerce is the first integration pilot |
| Reporting API with consent: Commerce metrics | PILOT-MVP | VentureWorks KPI "activate merchant storefronts" needs verified counts (master plan §6) |
| Reporting API for the other four pilots | LATER | Only after Commerce proves the pattern |
| Org-level narrowing of role-to-service maps | LATER | Manifest defaults meet AC-1 for the pilot |
| Manifest publishing from CI | LATER | CLI is enough for five products |
| Public package catalogue for the Hub (gap 4) | LATER | Owner direction: Hub catalogue is a later build; it will read `audience=direct` packages |
| Usage-metered limits (counting API calls, storage) | LATER | No pilot needs it |

---

## Part 3. Billing v1 (gap 3)

### 3.1 What exists today (confirmed)

**No shared settlement, ledger or funding engine is in use on any `origin/main`.** What was found:

| Repo | Tables | What they are | Shared ADS billing? |
| --- | --- | --- | --- |
| software-factory | `payment.intents/attempts/provider_callbacks`, `ledger.accounts/journals/journal_lines` (balanced, immutable, `ledger.post_journal`), `settlement.batches/items/exceptions`, `financial_policy.policies` (platform fee 10 %, CM VAT 19.25 %), `commerce_platform.subscriptions/subscription_periods/invoices/invoice_lines/purchase_entitlements/provisioning_jobs/wallets/credit_*/refunds` (`20260828130000_workstream_u_shared_commerce.sql`); `marketplace_settlements`, `developer_plans/subscriptions` (`20260819190000`, `20260819193000`) | Supabase-era marketplace and "shared commerce" work | **No.** Parked under decision D-5. Migration `20261019200000_sf_runtime_least_privilege.sql` revokes all of it from the runtime role and the routes answer 503 `service-parked` (`docs/delivery/GO_LIVE_RUNBOOK.md` lines 25 and 150) |
| rag-intelligence-ai-platform | `commercial_plans`, `plan_entitlements`; `hosting_invoices` (Supabase `auth.uid()` RLS) | Older API-plan and developer-cloud work | No |
| banking-platforms | `corestack_invoices`, `bank_sector_subscriptions`, `dgi_invoice_cache` | Bank product's own records | No (product domain) |
| digital-tontine | `ledger_entry`, `ledger_transaction`, `payout_case`, `payout_attempt` (`007_contributions_ledger_reconciliation.sql`) | The savings group's own money ledger | No (product domain; group money, not ADS fees) |
| ventureworks | `venture_payment_entitlement` (`010_wpb_payment_entitlement.sql`: `settled`/`refunded`, after a signed webhook) | Pays for an assessment (VW-US-009) | No, but it is the closest to "entry fee paid → unlock" |
| retail-connect-kit | none on main; `docs/architecture-evaluation/ACCOUNTING_CENTRAL_LEDGER_ENGINE_DECISION_v0.1.md` and settlement UI panels | Decision draft and screens | No |
| ads-platform-kit | none | Mocks for MoMo/Orange collections and refunds (`services/mocks`), sample adapter (`examples/sample-product/src/payments-adapter.mjs`) | Mocks only. PLAT-PAY-001 is "Planned" |

**Two kinds of money must stay separate:**

- **Product money** is the customer's own business: school fees in Education, shop sales in Commerce, tontine contributions. It stays in each product.
- **ADS billing** is what ADS charges organisations and partners.

Billing v1 is only about ADS billing.

VentureWorks, Tontine and Education each have their own MoMo adapter against the kit mocks (`src/server/adapters/payments.mjs`, `src/server/adapters.mjs`, `src/server/mvp/adapters.ts`). A shared `packages/momo-client` would remove that duplication; it is LATER, and not needed for billing v1.

### 3.2 Smallest useful billing v1

| Charge (master plan §7) | In v1? | How |
| --- | --- | --- |
| Partner entry fee | **Yes** | One-off invoice raised by VentureWorks when an agreement reaches "fee due"; paid → VentureWorks proceeds to activation and provisioning |
| SaaS subscription per package | **Yes** | Monthly or yearly plan on an `org_packages` row; invoice at the start of each period |
| Technology activation fee | Yes (as an invoice line) | Optional line on the first invoice |
| Hosting/technical services, custom development, enterprise licence | Manual invoice lines | ADS finance types the line; no automation |
| Transaction or revenue share, equity | No | LATER |

**Who pays whom in v1 (recommendation, OWNER-DECISION D-F2):** ADS invoices partners (entry fee, plus a platform fee per active customer or per package) and direct customers. A partner invoices its own customers outside ADS for the pilot. This avoids ADS collecting money on a partner's behalf, which would bring in settlement, payouts and possibly payment-service regulation (gap 7).

### 3.3 Data model sketch (new `billing` schema)

| Table | Key columns |
| --- | --- |
| `billing.accounts` | `org_id` (kit organisation), `billing_email`, `billing_phone`, `legal_name`, `tax_ref`, `currency` (`XAF` only in v1), `status` |
| `billing.plans` | `plan_key`, `package_key` (null for an entry fee), `kind` (`subscription`/`one_off`), `period` (`month`/`year`/null), `price_xaf` (integer), `tax_code`, `status`, `audience` |
| `billing.subscriptions` | `id`, `org_id`, `plan_key`, `quantity`, `status` (`trial`, `active`, `past_due`, `suspended`, `cancelled`), `current_period_start`, `current_period_end`, `next_invoice_at`, `cancel_at` |
| `billing.invoices` | `id`, `number` (gapless per year, for example `ADS-2026-000123`), `org_id`, `source` (`entry_fee`/`subscription`/`manual`), `source_ref` (VentureWorks agreement or subscription id), `status` (`draft`, `issued`, `paid`, `void`), `issued_at`, `due_at`, `subtotal_xaf`, `tax_xaf`, `total_xaf`, `paid_xaf`, `issuer` (ADS legal name, RCCM, NUI from configuration), `test_mode` |
| `billing.invoice_lines` | `invoice_id`, `description` (EN/FR), `quantity`, `unit_xaf`, `tax_rate_bp`, `line_total_xaf` |
| `billing.payments` | `id`, `invoice_id`, `provider` (`mtn`/`orange`), `msisdn` (masked in views), `amount_xaf`, `reference` (idempotency key), `provider_ref`, `status` (`PENDING`, `PAID`, `FAILED`), `failure_reason`, `confirmed_at`, `test_mode` |
| `billing.provider_events` | `event_id` (unique), `payment_id`, `type`, `signature_ok`, `received_at`, `payload_hash` (raw payload kept only as needed) |
| `billing.audit` | Append-only, the same trigger pattern as `identity_audit` |

Money is stored as integer FCFA. VAT rate comes from configuration (Software Factory's parked policy holds 19.25 % for Cameroon; ADS finance must confirm it). Invoice numbering uses a per-year counter row locked in the same transaction.

### 3.4 Honest payment states (PLAT-PAY-001)

| Rule | Detail |
| --- | --- |
| PAY-1 | An invoice becomes `paid` only when confirmed payments cover `total_xaf`. "Confirmed" means the provider's signed webhook, or a status check returning `SUCCESSFUL` |
| PAY-2 | A timeout or unknown result stays `PENDING`. A reconciliation job polls `GET /momo/v1/requests/{id}` and settles it. A payment is never assumed paid |
| PAY-3 | Duplicate webhooks (same `event_id`) are ignored. Bad signatures are refused and audited. Timestamps older than 5 minutes are refused (same rules as `services/mocks/README.md`) |
| PAY-4 | A failed payment leaves the invoice `issued`; the payer can try again with a new reference |
| PAY-5 | Every screen and email shows "Test mode" while the mock is used. `PAYMENTS_MODE=live` stays refused until the go-live gate is recorded (same as the sample adapter) |
| PAY-6 | `void` needs ADS finance, a reason and audit. A paid invoice cannot be voided in v1 (refunds are LATER) |

### 3.5 API endpoints (billing service)

| Endpoint | Caller | Purpose |
| --- | --- | --- |
| `POST /billing/v1/invoices` | VentureWorks server (entry fee), ADS finance (manual), billing scheduler (subscriptions) | Create and issue; idempotent on `source_ref` |
| `GET /billing/v1/invoices?org=`, `GET …/{id}` | Org owner/admin (own org), partner admin (own org only), ADS finance | List and view |
| `POST /billing/v1/invoices/{id}/payments` `{ operator, msisdn }` | Org owner/admin or `billing_admin` | Start a MoMo / Orange Money collection |
| `GET /billing/v1/payments/{id}` | Same | Honest status |
| `POST /billing/v1/webhooks/momo` | Provider (mock in test) | Signed callback |
| `POST /billing/v1/subscriptions`, `POST …/{id}/cancel` | ADS admin, provisioning (when a package with a plan is assigned) | Start or end a subscription |
| `POST /billing/v1/invoices/{id}/void` | ADS finance | With reason |
| Outgoing webhooks `invoice.issued`, `invoice.paid`, `subscription.past_due` | Billing → VentureWorks, kit identity | VentureWorks marks the entry fee paid; the kit can flag `past_due` |

Hosted pages in the kit (like `/admin`): "Billing" with the invoice list, invoice view and **Pay with MTN MoMo / Orange Money**, in EN/FR. Each product links to it from its account menu. No product builds billing screens.

**Non-payment (OWNER-DECISION D-F3):** v1 marks a subscription `past_due` 7 days after the due date and notifies the payer and ADS finance. Suspension of entitlements is a manual ADS admin action. Automatic suspension is LATER.

### 3.6 Where it should live (recommendation)

| Option | For | Against |
| --- | --- | --- |
| **A. New `services/billing` in ads-platform-kit** (own process, own `billing` schema and database role, same deployment) | Reuses the kit's sign-in, admin-token pattern, mocks, E2E harness and CI. One deployment. Needs organisation and package data that already live in the kit | The kit grows; financial code sits next to identity code (separate process and role reduce this) |
| B. New repo `ads-shared-services` (or `ads-financial-services`) | Clear home for later ledger, settlement and funding (master plan §14: "designated ADS financial services") | New CI, deploy, E2E wiring and review overhead before the pilot; duplicates kit plumbing |

**Recommendation: A for v1.** Keep the billing service self-contained (its own schema, role, migrations and tests) so it can move to a separate financial-services repo when the ledger and settlement arrive (LATER). That move is also the moment to involve an accountant and the bank or payment partner.

### 3.7 Security rules

- **S3-1:** Callers authenticate with the kit token or admin-token pattern. Product and VentureWorks servers use client credentials limited to `billing:invoices:write`.
- **S3-2:** Organisation scope is resolved from the kit database, never from request fields. Partner admins see only their own organisation's invoices, not their customers' invoices (v1 does not bill customers through partners).
- **S3-3:** MSISDNs are masked in lists and logs. No card data is ever stored.
- **S3-4:** Webhooks are verified on the raw body (HMAC) with timestamps checked, and deduplicated.
- **S3-5:** The runtime role cannot UPDATE or DELETE audit rows or paid invoices. Invoice totals are recalculated in the database (check constraint: total = subtotal + tax).
- **S3-6:** Maker-checker for void (preparer ≠ approver) is LATER; v1 requires a reason and records the actor.

### 3.8 Test strategy (part 3)

| Level | Tests |
| --- | --- |
| Billing unit/integration (real PostgreSQL) | Gapless numbering under parallel issue; tax arithmetic; idempotent invoice creation; PAY-1…PAY-6 against the kit mocks (`paid`, `failed`, `timeout`, `duplicate`, bad signature, old timestamp) using MSISDN magic values `…0001/0002/0003` and scripts with `settle: manual`; organisation scope 404s |
| E2E (kit sample product + VentureWorks) | Agreement → entry-fee invoice → pay with mock MoMo → `invoice.paid` → VentureWorks shows fee paid → provisioning creates the partner org. Subscription invoice for a customer package → paid. Timeout stays Pending and settles when the reconciliation job runs |
| Product | Account menu links to billing; "Test mode" label visible |

### 3.9 Classification (part 3)

| Feature | Class | Reason |
| --- | --- | --- |
| Entry-fee invoice and payment through mock MoMo/Orange | PILOT-MVP | Master plan §11 pilot tests entry fees; §13 measures "collected entry fees" |
| Subscriptions per package (monthly/yearly), invoices, invoice lines | PILOT-MVP | Pilot C validates "subscription management" |
| Honest payment states, reconciliation job, webhook security | PILOT-MVP | PLAT-PAY-001 and handbook money-state rules |
| Hosted billing pages EN/FR | PILOT-MVP | No product should build its own |
| Manual invoice lines (custom work, hosting) | PILOT-MVP | Cheap; covers the other §7 categories by hand |
| Live MoMo/Orange connection | OWNER-DECISION / go-live gate | PLAT-EXT-001: needs a contract; not needed to build or test |
| Automatic suspension on non-payment | LATER (D-F3) | Manual is safer for a small pilot |
| Refunds and credit notes | LATER | Mocks support refunds already; not needed for the first invoices |
| Revenue share, commissions | LATER | Needs contract terms first (gap 7) |
| Settlement and payouts to partners | LATER | Needs a ledger, bank partner and legal review |
| Double-entry ledger | LATER | Reuse Software Factory's `ledger.post_journal` design when it is built |
| Funding, BNPL, investor flows | LATER | Master plan Pilot D is a feasibility study only |
| DGI e-invoicing, card payments, proration, multi-currency | LATER | Not needed for XAF pilot invoices |
| Partners billing their customers on ADS rails | LATER (D-F2) | Would make ADS a collector for third parties |

---

## Part 4. Name check: "ADS Full-Stack Methodology v2" (gap 6)

### 4.1 What was found

| Where | Text | Status |
| --- | --- | --- |
| Master plan §5 (`docs/plan/source/…MASTER_PLAN…v1.0…md` line 217) | "All sector platforms should follow the agreed ADS Full-Stack Methodology v2. The shared integration contract should cover frontend journeys, backend services, PostgreSQL models, security, Agentic RAG boundaries, automated tests and deployment certification." | Uses the old name |
| software-factory `docs/standards/ADS_UNIVERSAL_FULL_STACK_ADOPTION_AND_UPGRADE_STANDARD_v2.0.md`, `…HARDENING_STANDARD_v2.1.md` ("ADS Universal Full-Stack Methodology v2.1"), `…OPERATIONAL_STANDARD_v2.2.md` ("… v2.2"), `…PREVENTION_STANDARD_v2.3.md` ("… v2.3"), plus the JSON registers and `packages/engineering-standards/remediation-v23.ts` | The v2.0 to v2.3 chain | **Superseded** on 18 October 2026: `docs/handbook/SUPERSEDED.md` lists `ADS_UNIVERSAL_FULL_STACK_*_v2.0–v2.3` under §0, §5, §8, §9, §12, §13 and Appendix A. Kept only because tests and links still read them |
| education-and-intelligent-services `README.md` line 29 | "## ADS Full-Stack v2 adoption — 14 October 2026" | Out of date; Education's `AGENTS.md` already points to the handbook |
| Other pilots (Commerce, VentureWorks, Fleet Guard, Tontine) | `AGENTS.md` line 5: "Follow the ADS Software Delivery Handbook" | Already aligned |
| Copies `sf-fix`, `sf-rev2`, `sf-review` | Same files as software-factory | Local review copies, not separate repos |

The replacements are the **ADS Software Delivery Handbook v1.0** (Software Factory `docs/handbook/`, canonical since 18 October 2026, mirrored in the kit), the **Platform Requirements** next to it, and the **ADS Agentic and RAG Integration Standard v1.0**. The last one is still a *proposal* on branch `audit/agentic-rag-standard-20261019` (`24eb63c`) and becomes canonical when the owner approves its pull request.

### 4.2 Mapping master plan §5's list to the current standards

| Master plan §5 item | Current home |
| --- | --- |
| Frontend journeys | Handbook §2 (requirements → stories), §4 design artefacts, `templates/CUSTOMER_JOURNEYS.md`; PLAT-UX-001, PLAT-I18N-001, PLAT-A11Y-001 |
| Backend services | Handbook §4 (OpenAPI contract per story), §7 operations |
| PostgreSQL models | Handbook §4 (data model per story), §6 (tenant RLS, least-privilege runtime role) |
| Security | Handbook §6 (OWASP ASVS L2), PLAT-SEC-001, PLAT-ROLE-001 |
| Agentic RAG boundaries | Agentic and RAG Integration Standard v1 (PLAT-AI-001), once approved |
| Automated tests | Handbook §5; PLAT-EXT-001 mocks; kit `packages/e2e-kit` |
| Deployment certification | Handbook §12 releases and evidence levels, `templates/RELEASE_RECORD.md` |
| Integration layer (manifest, provisioning, reporting, identity) | **Missing today**: proposed PLAT-ORG-001, PLAT-ENT-001, PLAT-REP-001, PLAT-BILL-001 (2.13) |

### 4.3 Recommendation

1. **Do not create a "Methodology v2" or a "Handbook v2".** Edit the master plan (v1.1) so §5 reads: "All sector platforms follow the ADS Software Delivery Handbook v1 and its Platform Requirements, including the Agentic and RAG Integration Standard. The shared integration contract is defined by PLAT-ORG-001, PLAT-ENT-001, PLAT-REP-001 and PLAT-BILL-001."
2. Approve the Agentic and RAG standard pull request (or note it as "proposed") so the master plan's "Agentic RAG boundaries" has a canonical home.
3. Change Education's README heading to "ADS Full-Stack v2 adoption (14 Oct 2026, superseded by the ADS Software Delivery Handbook v1)".
4. Finish the move promised in `SUPERSEDED.md`: put the v2.x files in `docs/archive/` once the tests that read them are updated. This is a Software Factory clean-up item, not part of the pilot.

| Item | Class | Reason |
| --- | --- | --- |
| Master plan v1.1 wording | PILOT-MVP | Prevents teams building to a superseded standard |
| Approve AI standard | OWNER-DECISION (D-F6) | Owner approval needed under handbook §0.4 |
| Education README heading | PILOT-MVP (S) | Education is a pilot |
| Archive v2.x files | LATER | Tests still read them |

---

## Gaps 1–7 applied to the foundation

| Gap | How it applies here |
| --- | --- |
| 1 Organisation levels | Part 1: parent organisations, partner admin, delegations, claims, isolation |
| 2 Entitlements and provisioning | Part 2: kit owns them; Software Factory owns templates; products enforce |
| 3 Billing | Part 3: billing v1 in the kit; ledger, settlement and funding LATER |
| 4 Public catalogue | Packages with `audience=direct` and plans with prices are the data the Hub catalogue will read later (`GET /catalogue/v1/packages`, public, read-only). Not in this wave |
| 5 VentureWorks reconciliation | VentureWorks is the caller for partner agreements, the entry-fee invoice and provisioning requests, and the consumer of the reporting API. Its existing `venture_payment_entitlement` stays for assessment payments; entry fees use billing v1 (to be confirmed in `VENTUREWORKS_PLAN.md`) |
| 6 Name check | Part 4 |
| 7 Legal review | Needed for: entry-fee invoice wording (master plan §2: no guaranteed profits, approvals or exclusivity); partner as data processor under the customer's control (delegation consent text, `data_controller`); data-sharing consent text for reporting; ADS not collecting on behalf of partners in v1; VAT treatment of entry fees |

---

## Finalization build register (foundation)

Sizes are estimates from comparable kit work, measured in changed lines. The PLAT-ROLE-001 commit `c3d13ef` changed about 1,600 lines in 21 files (service, page, migration, tests, docs) and counts as **L**. **M** is roughly 300–1,000 lines. **S** is under about 300 lines. No calendar time is implied.

| ID | Title | What it is | Depends on | Size | Acceptance check |
| --- | --- | --- | --- | --- | --- |
| FND-01 | Handbook requirements | PR to Software Factory: PLAT-ORG-001, PLAT-ENT-001 (from PLAT-ROLE-001 US 2), PLAT-REP-001, PLAT-BILL-001 with acceptance criteria; master plan v1.1 §5 wording; Education README heading | Owner decisions D-F1–D-F6 | S | Owner approves the PR; kit mirror synced (`scripts/sync-handbook.sh`) |
| FND-02 | Organisation hierarchy | Migration 005: `org_type`, `parent_org_id`, `partner_org_id`, `data_controller`, `created_via`; `ads` organisation seed; `platform_admin` role on `ads-console`; CLI updates | — | M | Kit tests: hierarchy constraints; `platform_admin` not grantable via API |
| FND-03 | Partner agreements and customer creation | `partner_agreements`, `partner_offer_rights`; `/platform/v1/partners…`, `/partner/v1/customers…`; hosted page sections; owner invitation reuse | FND-02, FND-05 | L | ISO-1, ISO-2, S1-4 tests pass; E2E ADS admin → partner → customer → owner accepts |
| FND-04 | Delegated access with consent | `delegations`, delegated memberships with expiry, `act` claim, approve/refuse/revoke on `/admin` and `/admin/v1`, audit | FND-02 | M | E2E delegation lifecycle; access ends after revoke (refresh refused, access token ≤ 15 min) |
| FND-05 | Manifests, packages, entitlements | Manifest JSON Schema; `product_manifests`, `capabilities`, `packages`, `package_items`, `org_packages`, `org_entitlements`; resolution order; `publish-manifest`, `import-package` CLI; `caps`, `org_id`, `org_type`, `partner_id` claims | FND-02 | L | Resolution and `depends_on` tests; `caps` per `aud` only; audit rows for each change |
| FND-06 | `entitlements-client` package | `requireCapability`, `limit()`, `visibleSections()`, cached API client, test double, README | FND-05 | M | Package tests; sample product uses it; DIS-1/DIS-2 shown in sample E2E |
| FND-07 | Provisioning API | `/provisioning/v1/requests`, per-product steps, signed product webhooks, step completion, retry job | FND-05 | M | Idempotency test; one product down does not block others; webhook replay harmless |
| FND-08 | Reporting API with consent | `data_sharing_consents`, reporting token issue, consent screens; contract doc for the product side | FND-05 | M | Token refused without or after consent; Commerce metrics readable by VentureWorks in E2E |
| FND-09 | Audit viewer (minimal) | Filter/export of `identity_audit` and `billing.audit` for own organisation; partners see their customers' account events only | FND-03, FND-11 | M | PLAT-AUD-001 AC-3 test; partner A cannot see partner B events |
| FND-10 | Software Factory package templates | `templates/packages/*.json` in Software Factory for the five pilots (names and contents from D-F5) | FND-05 schema | S | Templates validate against the kit schema; imported in a kit E2E |
| FND-11 | Billing v1 service | `services/billing`: schema, invoices with gapless numbers, subscriptions, MoMo/Orange via mocks, reconciliation job, webhooks in and out, hosted EN/FR pages, Test-mode labels | FND-02, FND-05 | L | PAY-1…PAY-6 tests against mocks; E2E entry fee paid → `invoice.paid` → provisioning |
| FND-12 | Kit E2E end to end | One kit E2E: agreement → entry fee paid → partner provisioned → customer created with package → delegation → product menu shows only entitled sections | FND-03, FND-04, FND-06, FND-07, FND-11 | M | Green in kit CI (`e2e-selftest.yml`) |
| PRD-COM-01 | Commerce on kit entitlements | Steps in 2.12 (manifest, seed script, `caps` gate, menu intersection, retire `org_capabilities` switch, fixtures, DIS-5 runs, reporting endpoint, ISO-4 test, `act` in audit) | FND-06, FND-07, FND-08 | M | COM-ADM-S01 / J-25 pass through the kit; existing Commerce E2E green with each optional capability off |
| PRD-EDU-01 | Education on kit entitlements | Rollout JSON → manifest; admin capability board reads kit entitlements; `requireCapability` on module routes; ISO-4 for `platform_admin`; `act` in audit | FND-06, FND-07 | M | Education E2E green with each optional module off; Education `platform_admin` still sees no protected records |
| PRD-VW-01 | VentureWorks as contract source | Calls `/platform/v1/partners…/agreements`, `/billing/v1/invoices` (entry fee), `/provisioning/v1/requests`; consumes `invoice.paid` and reporting API; manifest | FND-03, FND-07, FND-08, FND-11 | M | E2E: approved application → entry fee paid → partner org exists with agreement and rights |
| PRD-FG-01 | Fleet Guard manifest and gates | Manifest, `requireCapability`, ISO-4 test for `app.support_agent` (partner roles never set it), `act` in audit | FND-06 | S | Fleet Guard E2E green with optional modules off; ISO-4 test passes |
| PRD-DT-01 | Tontine manifest and gates | Manifest, `requireCapability`, `act` in audit; group ledger untouched | FND-06 | S | Tontine E2E green with optional modules off |

Suggested order: FND-01 and FND-02 first, then FND-05 → FND-06 and FND-07 (Commerce and Education can start), then FND-03, FND-04, FND-11 (VentureWorks), then FND-08, FND-09, FND-12. Commerce, Education and VentureWorks go first, as the owner directed.

---

## Decisions needed from the owner

| ID | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| D-F1 | Where entitlements and provisioning live | (a) ads-platform-kit identity service; (b) Software Factory; (c) VentureWorks | **(a)**, with Software Factory owning templates, products enforcing and VentureWorks triggering (2.1) |
| D-F2 | Who invoices a partner's customers in the pilot | (a) partner invoices its customers outside ADS; ADS invoices the partner; (b) ADS invoices customers and pays partners a share | **(a)**: no settlement, payouts or third-party collection in v1; revisit with legal review (gap 7) |
| D-F3 | What happens on non-payment | (a) `past_due` + notification, manual suspension; (b) automatic suspension after N days | **(a)** for the pilot |
| D-F4 | Customer data ownership default | (a) the customer organisation controls its data; partner and ADS process it; (b) set per contract | **(a)** as the default (master plan §14), with (b) recorded only from a signed contract |
| D-F5 | Pilot package names, contents and prices | Owner/commercial team to fill; Software Factory turns them into templates | Start with one starter and one pro package per pilot product; prices are placeholders marked "illustrative" until approved |
| D-F6 | Methodology wording and the AI standard | (a) master plan v1.1 points to Handbook v1 + Platform Requirements + AI standard and the standard's PR is approved; (b) keep "Full-Stack Methodology v2" | **(a)** (Part 4) |
| D-F7 | Billing location | (a) `services/billing` in the kit; (b) new ADS shared/financial-services repo | **(a)** now; move to (b) when ledger and settlement start (3.6) |
| D-F8 | Delegated access in the pilot | (a) named-person delegations with customer consent and expiry; (b) partner staff are invited as ordinary members | **(a)**: (b) leaves no consent trail and no expiry |
| D-F9 | Reporting API scope in the pilot | (a) Commerce only; (b) all five pilots | **(a)**, then extend |

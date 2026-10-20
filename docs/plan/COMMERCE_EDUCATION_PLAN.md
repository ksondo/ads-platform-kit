# Commerce and Education — wave-1 finalization plan (draft)

Planning only, 20 October 2026. Nothing here changes a product. Owner: Kengjiseh Sondo (ADS).

**Evidence base.** `ksondo/ADS-Commerce-Platform` `origin/main` at `924d714` and `ksondo/education-and-intelligent-services` `origin/main` at `d45ea67` (both: "Merge MVP end-to-end build"), plus `ads-platform-kit` main (identity service) and `tourism-platform` main. Paths below are relative to each repo unless named. Counts come from each repo's `docs/traceability/TRACEABILITY.csv` (rows counted by script, not estimated).

**Labels.** `PILOT-MVP` = must work before the first partner pilot. `LATER` = after the pilot starts. `OWNER-DECISION` = needs your choice; a recommendation is given.

**In one paragraph.** Both products have a working first release. It was tested end to end with the real ADS sign-in and a real database: 15 journeys in Commerce and 19 in Education, each run in English on desktop and in French on a phone. Neither product can yet be **sold through a partner**. There is no "partner" level above a shop or school. What a customer may use is set in code, not by a package. Every new shop or school needs an ADS operator to run commands. The smallest pilot set is therefore mostly *plumbing*: organisation levels, entitlements, partner provisioning, a partner view, and two security fixes. Few new features are needed. Commerce Pilot A (POS deployment network) and an Education school-SaaS partner can run on what is built, plus that plumbing.

---

## Progress at a glance

Method: share of the product's requirement rows in `TRACEABILITY.csv` that point at built code (status `in_progress`). No row is `done` yet, because nothing has been accepted on staging (handbook §11). "MVP-tested" means the row is linked to an MVP story whose journey passes end to end.

| Product | Requirement rows with code | Rows MVP-tested end to end | First release finished? |
| --- | --- | --- | --- |
| Commerce | 45 of 98 `COM-*` rows. All 38 core, merchant and cash rows and 3 of 4 runner rows have code. Only 4 of the 54 category-pack rows do (clothing, online-only, 2 multi-branch), and they are partial. | 35 rows (stories COM-US-001..026) | Yes, merged: 15 MVP journeys pass end to end. Not on staging, not accepted. Not sellable through partners. |
| Education | 40 of 50 `EDU-FR-*` rows (33 core and 17 proposed). The 131 `FR-EDU-*` intelligence rows are all marked `in_progress`, but most of that code comes from earlier waves and sits under "later releases". | 20 rows (stories EDU-US-001..024) | Yes, merged: 19 MVP journeys pass end to end. Not on staging, not accepted. Not sellable through partners. |

---

# Part A — Commerce

## A1. Current state

### Built and tested end to end (`docs/delivery/E2E_STATUS.md`, `docs/journeys/CUSTOMER_JOURNEYS.md`)

| Journey | What a user can do |
| --- | --- |
| J-01 | Sign in with the ADS account, choose the organisation, land on the role's home page |
| J-02 | Shopper browses the marketplace, filters and sorts; unpublished products stay hidden |
| J-03, J-04 | Shopper sends a pickup or merchant-delivery request to **one** shop, tracks it and cancels it |
| J-05 | Owner declares the business (stays "Declared — not verified") and sets up the storefront, hours and contact |
| J-06 | Owner drafts a product; an independent ADS reviewer publishes it |
| J-07 | Goods receiving with supplier evidence; stock recount |
| J-08 | Owner accepts an order, prepares it and hands it over |
| J-09 | Cash POS with a non-fiscal receipt; offline sale queue; refund needs a manager PIN |
| J-10..J-12 | Profile, addresses and EN/FR; SMS and in-app notifications (mock SMS); help and contact the shop |
| J-15, J-19, J-28 | Cash on hand → cash batch → bank pickup by an agent or own deposit → counted handover → bank credit and reconciliation (mock bank) |

Also built but outside the MVP journeys: held POS baskets, reorder policies, stock-risk view, supplier directory, branch report (partial), runner assignment by reference, Progress RAG merchant advice (live corpus unverified), and a payment-evidence inbox (HMAC-signed, records only).

### Roles and how they are granted

| Role (`src/server/access.mjs:10-14`) | Who | How it is granted today |
| --- | --- | --- |
| `commerce_buyer` | Shopper | Self-service: given on sign-up (client `selfRoles`, see `tests/e2e/global-setup.ts:6`) |
| `merchant_owner`, `commerce_manager`, `commerce_cashier`, `commerce_accountant` | Shop staff | The ADS identity service grants them in the shop's organisation. An ADS operator uses the kit CLI (`services/identity/src/cli.mjs` `create-organization`, `grant-role`), or the organisation admin uses the kit's hosted `/admin` page. Commerce has **no** staff-invitation screen (J-23 "not started"). |
| `commerce_reviewer` | ADS review team | Same; one global ADS review organisation (D-07 default, `db/migrations/029_ads_review_team_scope.sql`) |
| `commerce_support` | ADS support | Same |
| `bank_officer`, `bank_agent` | Bank staff | Same, in the bank's organisation. An operator must also register the bank: `scripts/commerce-admin.mjs register-bank`. |

Roles always come from the sign-in token. Commerce's own `staff_members` table records who people are but never grants anything (`src/server/staff.mjs:4-6`).

### Capabilities switchable today

Only one: **bank collection**, per shop, in `commerce.org_capabilities` (`db/migrations/026_cash_batches_bank_collection.sql:17-23`, `CHECK (capability IN ('BANK_COLLECTION'))`). An operator switches it with `scripts/commerce-admin.mjs capability`, using the database owner's connection. Everything else is always on, or hidden by role.

### What is left, and why (backlog "Later epics", `docs/backlog/USER_STORIES_MVP.md:319-336`)

| Item | Why it is not built |
| --- | --- |
| Digital payments: MoMo, Orange Money, card (COM-CORE-S09, J-16) | Decision D-02 keeps them in MVP-B; the till refuses non-cash tenders (`TENDER_NOT_SUPPORTED`). The kit's mock MoMo is ready. |
| Meeting-point handover (COM-CORE-S10a) | MVP-B |
| Courier and runner handoff (COM-RUN-S01..S04, J-18) | Needs the Logistics repo |
| Staff invitation and roles (COM-MER-S16, J-23) | Waited for kit PLAT-ROLE-001. The kit now has it (admin API, invitations). |
| Platform admin: capabilities per organisation (COM-ADM-S01, J-25) | Not started; the operator script stands in |
| ERP extension: 37 stories (COM-POS-*, COM-STK-*: shifts, purchase orders, transfers, lots and serials, peripherals) | Not MVP; some parts already exist (goods receiving, reorder, held carts) |
| Category packs: 54 stories (SUP, PHA, RES, HAR, CLO, BAK, WHO, ONL, MBR, INV) | Configuration-gated, not MVP (README item C-04) |
| Portfolios for accountant, auditor, bank and regulator (J-20) | MVP-C |
| Full offline POS and PWA (J-26) | Only the offline cash-sale queue is MVP |
| Multi-branch reporting (COM-MER-S14), data export and deletion (J-24), disputes (J-27), saved items | Later epics |
| Real bank | Go-live gate only (PLAT-EXT-001) |
| Storefront themes (logo, colours) | Exist only in retail-connect-kit (`docs/requirements/CONSOLIDATION_2026-10-18.md:34`). Commerce storefronts have only a tagline, hours and contact (`db/migrations/012_*.sql`). |

## A2. Capability manifest (draft)

Proposed keys. Each is a sellable feature that a package switches on per customer organisation. "State" is what `main` has today.

| Key | Feature | State on main | Pilot class |
| --- | --- | --- | --- |
| `commerce.storefront` | Shop page: profile, hours, contact, policies, products | Built, tested (J-05, J-06) | PILOT-MVP |
| `commerce.marketplace_listing` | Shop and products appear in the ADS marketplace after independent review | Built, tested (J-02, J-06) | PILOT-MVP |
| `commerce.orders_pickup` | Shopper pickup or merchant-delivery request from one shop | Built, tested (J-03, J-04, J-08) | PILOT-MVP |
| `commerce.pos_cash` | Cash till, receipt, cashier and manager roles, refund approval | Built, tested (J-09) | PILOT-MVP |
| `commerce.pos_offline` | Offline cash-sale queue (today). Full offline POS and PWA later. | Queue built and tested; PWA not built | Queue PILOT-MVP; PWA LATER |
| `commerce.bank_collection` | Cash batch, agent pickup, handover, bank credit, reconciliation | Built, tested on the mock bank (J-15, J-19, J-28) | OWNER-DECISION (D-A5) |
| `commerce.digital_payments` | MoMo, Orange Money, card (MVP-B) | Not built | LATER |
| `commerce.inventory` | Goods receiving, recount, stock risk, reorder, suppliers | Built (J-07 tested; others API-tested) | PILOT-MVP (basic) |
| `commerce.erp` | Shifts, purchase orders, transfers, lots and serials, peripherals | Not built (37 stories) | LATER |
| `commerce.multi_branch` | Several branches per shop, cashier tied to a branch, group reporting | Branches and cashier-per-branch built; group reporting partial | Branches PILOT-MVP; reporting LATER |
| `commerce.pack.sup` … `.inv` | Ten category packs: supermarket, pharmacy, restaurant, hardware, clothing, bakery, wholesale, online-only, multi-branch group, investor-managed | Not built except fragments (clothing variant, online-only, multi-branch) | LATER (pharmacy: OWNER-DECISION, regulated) |
| `commerce.courier_delivery` | Logistics courier dispatch, tracking, proof of delivery | Not built (runner reference only) | LATER |
| `commerce.portfolio.accountant` / `.auditor` / `.bank` / `.regulator` | Scoped read-only dashboards | Not built, apart from the accountant's correction approval and the bank collection queue in the MVP | LATER |
| `commerce.branding` (new) | Logo, colours, own shop link for white-label stores | Not built | LATER (needed for Pilot C) |
| `commerce.merchant_advice` | Grounded merchant guidance through Progress RAG | Partial | LATER |

The manifest should live as one machine-readable file in the repo, for example `capabilities.json`, following the master plan §5 "product capability manifest". Software Factory owns the package templates (gap 2), and Commerce enforces them.

## A3. Packages (draft)

Feature membership. **P** = PILOT-MVP, **L** = LATER, blank = not in the package.

| Feature | Corner shop | Multi-branch retailer | Pharmacy | Wholesaler | White-label online store |
| --- | --- | --- | --- | --- | --- |
| storefront + marketplace listing | P | P | L | L | P (own link: L) |
| orders (pickup or merchant delivery) | P | P | L | L | P |
| cash POS + offline queue | P | P | L | L | |
| inventory (basic) | P | P | L | L | P |
| multi-branch (branches, cashier per branch) | | P | L | L | |
| bank cash collection | add-on (D-A5) | add-on (D-A5) | L | L | |
| digital payments | L | L | L | L | L (needed for a real online store) |
| ERP extension | | L | L | L | |
| category pack | | MBR: L | PHA: L | WHO: L | ONL: L |
| branding (white label) | | | | | L |
| courier delivery | L | L | L | L | L |
| portfolios (accountant, auditor, bank) | L | L | L | L | |

Only **Corner shop** and **Multi-branch retailer** can go to a pilot on what exists. Pharmacy and Wholesaler need their packs (6 and 7 stories) and are LATER. Pharmacy also needs a legal review, because prescriptions and restricted products are involved.

## A4. Pilots (master plan §11)

| Pilot | Features used | What must exist for a partner to provision its own merchants | Class |
| --- | --- | --- | --- |
| **A — Storefront and POS deployment network** | Corner shop and multi-branch packages; bank collection optional | (1) A partner organisation above its merchants in the ADS identity layer (gap 1). (2) The partner creates a merchant organisation and invites its owner, within the packages ADS allowed it to sell (CE-04). (3) Entitlements read by Commerce instead of the operator script (CE-02, CE-03). (4) Owners invite their own cashiers and managers (CE-06). (5) A partner view of its merchants with counts that VentureWorks can read: active stores, POS sales and orders (CE-05). (6) Partner-specific support contact (CE-07). | **PILOT-MVP** (recommended first pilot) |
| **B — Independent e-commerce operator** | Online store, marketplace, orders, delivery | Everything in A, plus a partner-scoped marketplace (a partner's own marketplace page listing only its merchants, CE-12). Partner-level sales reporting is in CE-05. Digital payments are needed for real online trade (CE-13). Two-shop baskets (D-06) matter here. | LATER (after A shows provisioning works) |
| **C — White-label store provider** | White-label package | Everything in A, plus storefront branding and an own shop link (CE-11), and a subscription per store through billing v1 (gap 3). Repeatable provisioning is CE-04. | LATER |
| **D — BNPL** | None | Feasibility and legal work only (gap 7). No code and no live consumer credit. | LATER, no build |

## A5. Hard-coding to replace for entitlements

| Where | What is fixed today | Change to |
| --- | --- | --- |
| `src/App.tsx:37-39` `SECTIONS_BY_ROLE` | The menu per role is a constant; for example a manager sees only `pos`, although the API lets a manager act on orders (E2E_STATUS J-08 note) | Menu = role ∩ entitled capabilities, from `/api/v1/me` |
| `src/App.tsx:40-43` `future` list | "Digital payments" and "Courier delivery" shown as fixed "coming soon" cards | Driven by the manifest (not entitled → hidden or "available in package X") |
| `db/migrations/026_…sql:19` and `src/server/cashBatches.mjs:67,215` | `org_capabilities` allows only `BANK_COLLECTION`, and only bank collection checks it | Capability keys from the manifest. The server checks every gated route. A disabled capability must not break other modules (RCK rule, `CLAUDE.md`). |
| `scripts/commerce-admin.mjs` | Operator-only, runs as the database owner. `setCapability` accepts only `BANK_COLLECTION`. Banks are registered by hand. | Entitlements come from the ADS identity layer (gap 2). Bank registration moves to an ADS admin screen (COM-ADM-S01). The script stays as a break-glass tool. |
| `src/server/access.mjs:27-35` `roleHome` | Fixed role → home page | Keep, but skip homes whose capability is off |
| `db/migrations/014_product_categories.sql:7` | Product categories are a fixed list in a database check | Becomes part of the category packs (LATER) |
| `src/HelpPage.tsx:7` | `SUPPORT_PHONE='+237 222 00 00 00'` placeholder | Partner's support contact, with ADS as fallback (D-A1) |
| `COMMERCE_CREDIT_WAIT_HOURS` (`src/server/cashBatches.mjs:14`) | One global 48 h setting | A setting per bank (D-A3) |
| `catalogPublication.mjs:88-91`, migration 029 | One global ADS review team | Keep for Pilot A (D-A2). Partner-scoped reviewers come later. |

## A6. Open owner items

See "Decisions needed": D-A1 support phone, D-A2 D-06 and D-07, D-A3 48-hour credit wait, D-A4 Tourism counter-sale endpoint, D-A5 bank collection in the pilot.

About the counter-sale endpoint: Tourism decision OD-T1 sends tourism counter sales through Commerce POS. Tourism already has an adapter and a mock. The contract is in `tourism-platform/docs/design/sequence/TOUR-J-08_counter_sale_commerce_pos.md`: `POST /api/v1/integrations/pos/counter-sales` with an idempotency key, `GET …/{key}`, and a service token through ADS token exchange. Commerce has no such endpoint (its routes are in `src/server/api.mjs`).

## A7. Security follow-ups

| # | Finding (file:line) | Same as the portfolio payment rule? | Action | Class |
| --- | --- | --- | --- | --- |
| S-C1 | The bank callback, the bank dispatcher and the payment-evidence inbox all run on the **same** runtime DB login as user requests. They gain wider row access by setting session flags: `app.bank_callback` (`cashBatches.mjs:422`), `app.bank_dispatcher` (`cashBatches.mjs:484`), `app.commerce_payment_ingress` (`paymentEvidence.mjs:41`). The row policies trust those flags (`026_…sql:193-217`). Any bug or SQL injection in a user route could set them. | **Yes.** It is the pattern fixed elsewhere with a separate worker/webhook DB role. | Separate NOLOGIN roles `commerce_webhook` and `commerce_worker`, each with its own login and connection pool. Policies key on the role, not on a flag. | PILOT-MVP (CE-08) |
| S-C2 | Bank credit **amount** is checked: the credit is compared with the batch total and the counted cash. A mismatch → *Discrepancy*, never *Reconciled* (`cashBatches.mjs:395-397`). The credit is re-read from the bank statement before it is applied (`:444`). **Currency** is not checked: the statement lookup returns no currency (`bankAdapter.mjs:37`), and XAF is assumed. | Partly | Add a currency check (reject when not XAF) in the real-bank adapter | LATER: go-live gate of the real bank |
| S-C3 | Payment-evidence inbox: checks the amount (`ORDER_AMOUNT_MISMATCH`, `paymentEvidence.mjs:50`), requires XAF (`:26`), and verifies the HMAC with a ±5-minute timestamp. It never marks an order paid. | Compliant on amount and currency; not on the DB role (S-C1) | When digital payments are built, apply the full rule in that story's acceptance criteria | LATER (with CE-13) |
| S-C4 | The legacy owner-attested cash-pickup manifest API (`/api/v1/merchant/cash-pickups`, migration 023) is still mounted, although its screen was removed (E2E_STATUS risks) | — | Retire it | PILOT-MVP (CE-09) |
| S-C5 | No CSP or HSTS in `deploy/`; no rate limiting (also in `/home/claude/audit/engineering/ads-commerce-platform.md`, row 6) | — | Set them at the hosting proxy (hosting plan) | PILOT-MVP (CE-10) |

---

# Part B — Education

## B1. Current state

### Built and tested end to end (`docs/delivery/E2E_STATUS.md`)

| Journey | What a user can do |
| --- | --- |
| J36, J44 | Sign in with the ADS account, choose the school, see my workspaces; expired session and sign-out |
| J45 | A school owner asks ADS to verify the school (registration number and document). A *different* ADS platform admin approves it. |
| J25 | School setup: campuses, departments, terms and calendar |
| J01, J02 | Public school and programme catalogue; school publishes it with maker-checker |
| J35, J42, J03 | Parent applies online, withdraws, or is accepted, enrolled and placed in a class |
| J37, J04 | Guardian link with consent and revocation; parent sees the child's attendance and approved results |
| J05, J10 | Timetable, attendance, grading under the school's policy |
| J26 | Term publication: report cards, promotion decision, signed transcripts with public verification |
| J14 | Staff qualifications; student transfer between ADS schools |
| J28 | Role requests with dual approval |
| J38..J40 | Profile and language; notifications by channel (mock SMS and email); help to the school or to ADS |

Also present but not MVP-tested (the "More tools (later releases)" area, `src/web/routes.ts:40`): course reader, lesson authoring, private study, exam practice, invoices and verified cash, finance reports, cohorts, credentials, and the grounded tutor (API-tested on the Progress RAG mock). There is also a consented referral to Career Path (stays `awaiting_partner`).

### Roles and how they are granted

| Role | Who | How it is granted today |
| --- | --- | --- |
| `applicant` | Anyone who signs up | Self-service, personal workspace (`e2e/global-setup.mjs:10`) |
| `institution_admin` | School owner | After J45 approval, Education records `pending_ads_operator` (`src/server/mvp/routes/access.ts:72-75`). An ADS operator then creates the organisation and grants the role with the kit CLI. |
| `learner`, `parent_guardian`, `teacher_trainer`, `academic_admin`, `admissions_officer`, `bursar_finance` | School people | The school admin sends an invitation; acceptance creates a *pending activation* (`access.ts:86-125`). The grant is supposed to go to a roles service at `ADS_ROLES_SERVICE_URL` + `/v1/roles/grants` (`src/server/mvp/adapters.ts:94-106`). That endpoint does not exist in the kit. The kit's real admin API is `/admin/v1/*` with token exchange (`ads-platform-kit services/identity/src/admin.mjs`). Today an operator runs `grant-role`. |
| `platform_admin` | ADS | Only in the one workspace named by `EDU_PLATFORM_TENANT_ID` (`access.ts:13-16`) |

The role list is a code constant (`src/server/httpApi.ts:27`).

### Capabilities switchable today

None per school. The 32-entry service catalogue (`src/domain/educationServiceCatalog.ts`) is static and says it is "not authorization". Menus are fixed per role in `src/web/routes.ts:21-40`. Institution types are a fixed list: primary, secondary, university, training, tvet (`access.ts:27`).

### What is left, and why (`docs/backlog/USER_STORIES_MVP.md:228-246`, README open decisions)

| Epic | Why not built or tested |
| --- | --- |
| EP-EDU-08 Learning delivery: reader, authoring, study notes, exam practice (J06-J09) | Code present from earlier waves; not in MVP scope (EDU-P2) |
| EP-EDU-09 School finance: invoices, verified cash (J15, J16) | EDU-P2; code present, not E2E-tested |
| EP-EDU-10 Fee payments by MoMo or Orange (J18, J41) | Needs PLAT-PAY-001; no provider webhook exists |
| EP-EDU-12 Grounded tutor and assistants (J19-J23) | Needs live Progress RAG; mock only |
| EP-EDU-13, 14 Cohorts, credentials, adaptive loop | EDU-P3 |
| EP-EDU-15 Content licensing and entitlements (J30) | Partial; "subscription and publisher revenue not built" |
| EP-EDU-19 Data export and deletion, including minors (J43) | Not built. Open decision 11 asks whether it is needed before a pilot with minors. |
| EP-EDU-20 Offline study packages and PWA | Not built (the BRS asks for low-bandwidth use) |
| EP-EDU-17, 18, 21-24 | Referrals, TVET placement, disputes, alumni, Passport and regulator, bilingual parity |
| ADS-side help desk | Requests to "ADS support" are stored; no ADS screen answers them (E2E_STATUS J40) |
| Live SMS and email | Wait for kit PLAT-NOT-001 (go-live gate) |

## B2. Capability manifest (draft)

Derived from the BRS FR list (`docs/ADS_Canonical_Education_Full_BRS_v1.0.md:30-78`), especially FR-032 ("home learning, private tutoring, exam preparation, vocational learning…"), and master plan §4.

| Key | Feature (BRS) | State on main | Pilot class |
| --- | --- | --- | --- |
| `edu.school_core` | Institution setup, calendar, staff qualifications (FR-001, 002, 008) | Built, tested | PILOT-MVP |
| `edu.public_catalogue` | Public school and programme listing (FR-001) | Built, tested | PILOT-MVP |
| `edu.admissions` | Online applications, decisions, enrolment, class placement (FR-005) | Built, tested | PILOT-MVP |
| `edu.attendance_grading` | Timetable, attendance, grading policy (FR-010..012) | Built, tested | PILOT-MVP |
| `edu.results_transcripts` | Report cards, promotion, signed transcripts (FR-013, 006) | Built, tested | PILOT-MVP |
| `edu.guardian_portal` | Guardian link with consent, child's records (FR-007, 016) | Built, tested | PILOT-MVP |
| `edu.notifications` | Family notifications (FR-017) | Built on mock SMS and email | PILOT-MVP (live provider is a platform gate) |
| `edu.school_finance` | Fee structures, invoices, verified cash, reports (FR-018, 020) | Code present, not E2E-tested | OWNER-DECISION (D-E3) |
| `edu.fee_payments` | Mobile-money fee payments (FR-019) | Not built | LATER |
| `edu.learning_delivery` | Course reader, lessons, study notes (FR-014, 015) | Code present ("later" area) | LATER |
| `edu.exam_prep` | Exam practice with evidence (FR-012, 032) | Code present ("later" area) | LATER |
| `edu.tutoring` | Tutor and learner scheduling, private study (FR-032) | Partial (private study only); no tutoring-centre type | LATER |
| `edu.online_academy` | Self-paced courses, enrolment without a class, content licences (FR-032, 033, J30) | Partial | LATER |
| `edu.training_centre` | Cohorts, sessions, cohort attendance, internal credentials (EDU-FR-042, 044; type `training` and `tvet` exist) | Code present, not MVP-tested | LATER |
| `edu.ai_tutor` | Grounded tutor and assistants (FR-022..031) | Mock only | LATER |
| `edu.career_referral` | Consented referral to Career Path (EDU-FR-049) | Built, awaiting partner | LATER |

## B3. Packages (draft)

| Feature | School | Tutoring centre | Online academy | Training centre |
| --- | --- | --- | --- | --- |
| school_core, public_catalogue | P | L | L | L |
| admissions | P | L | L | L |
| attendance_grading | P | L | | L |
| results_transcripts | P | | L (certificates) | L |
| guardian_portal | P | L | | |
| notifications | P | L | L | L |
| school_finance | D-E3 | L | L | L |
| fee_payments | L | L | L | L |
| learning_delivery, exam_prep | L | L | L | L |
| tutoring | | L | | |
| online_academy | | | L | |
| training_centre (cohorts, credentials) | | | | L |
| ai_tutor | L | L | L | L |

Only **School** is pilot-ready. The other three need new institution types (`access.ts:27` has no tutoring-centre or academy type), learning delivery finished and E2E-tested, and paid enrolment.

## B4. First Education pilot (proposal)

**Recommended:** a **school-SaaS partner**, which is an "institutional digitization partner" in master plan §10. It signs two or three private primary or secondary schools in one city and runs them on the **School** package. This uses only built and tested journeys (EDU-P1). A training-centre operator was considered and not chosen: cohorts and credentials (J12, J13) are not MVP-tested.

What must exist for the partner to provision its own schools:
1. A partner organisation above its schools in the ADS identity layer (gap 1), and a kit API that creates an organisation, which today is CLI only (`cli.mjs create-organization`).
2. J45 approval creates the school's organisation under the partner and grants `institution_admin`, with no operator step (ED-03). The partner may review onboarding requests for its own schools; ADS keeps the final say if you choose that (D-E4).
3. The roles adapter is fixed to call the kit admin API, so invitations and approved role requests activate by themselves (ED-02).
4. Entitlements: the package decides which modules and menus a school sees (ED-04).
5. A partner view: its schools, active learners and staff, report cards published (ED-07). VentureWorks can read these counts.
6. Help requests addressed to "ADS support" go to the partner's desk first (ED-08).
7. Promotion rule configurable per school (ED-05). Minimal data export and deletion for minors (ED-06, D-E2).

## B5. Hard-coding to replace for entitlements (Education's equivalents)

| Where | What is fixed | Change to |
| --- | --- | --- |
| `src/web/routes.ts:21-40` | Screen → roles table (Education's `SECTIONS_BY_ROLE`); "later tools" shown to every school role | Role ∩ entitled capabilities |
| `src/domain/educationServiceCatalog.ts` | Static 32-service list with states; "not authorization" | Generated from the manifest plus the school's entitlements |
| `src/server/httpApi.ts:27` | `allowedRoles` constant (8 roles) | Keep the role names; add capability checks on routes |
| `src/server/mvp/routes/access.ts:27` | Institution types fixed | Add tutoring centre, online academy, exam-prep centre when those packages come (LATER) |
| `src/server/mvp/adapters.ts:94-106` | Roles service at a URL and path the kit does not provide; grants stay pending | Kit `/admin/v1` with token exchange (ED-02) |
| `access.ts:72-75` | Approval → `pending_ads_operator` | Provisioning API (ED-03) |
| `EDU_PLATFORM_TENANT_ID` (`access.ts:14`) | One ADS platform workspace is the only reviewer | Add a partner-admin scope limited to the partner's schools |
| `src/server/mvp/routes/records.ts:60` | `avg>=50 ? 'promoted' : 'review'` | A school setting (D-E1) |
| `EDU_INVITATION_DAYS` env | Global | Fine for the pilot |

## B6. Open owner items

D-E1 the 50 % promotion rule, D-E2 minors' data export and deletion, D-E3 fees in the first pilot, D-E4 who approves a partner's schools. See "Decisions needed".

## B7. Security follow-ups

| # | Finding | Action | Class |
| --- | --- | --- | --- |
| S-E1 | The notification dispatcher uses the same runtime role (`education_api`). It widens access through a session scope, `edu_scope()='dispatcher'` (`db/migrations/032_mvp_notifications_help.sql:42-45`). This is the same flag pattern as S-C1. | Separate worker DB role | PILOT-MVP (ED-09, small) |
| S-E2 | No payment webhook yet. The bursar records provider claims by hand (`httpApi.ts:326`, `educationFinanceService.ts:130-138`). A provider "success" never settles an invoice by design. | When EP-EDU-10 is built: a separate webhook role, signature check, and amount and currency equal to the invoice (portfolio rule), in that story's acceptance criteria | LATER |
| S-E3 | Onboarding documents (up to 2 MB) are stored inside the database (`access.ts:44-48`). There is no virus scan. | Accept for the pilot (PDF, PNG and JPEG with type allowlist); file storage later | LATER |
| S-E4 | No CSP or HSTS in `deploy/web/nginx.conf`; no rate limiting | At the hosting proxy (hosting plan) | PILOT-MVP (ED-10) |
| S-E5 | Minors' data: no export or deletion (J43) | See D-E2 | OWNER-DECISION |

---

# Gaps 1–7 for these two platforms

| Gap | Commerce | Education |
| --- | --- | --- |
| 1 Organisation levels (ADS → partner → customer) | None. The kit has organisations, tenants, memberships and product roles, but no parent or partner link (`services/identity/migrations/001-004`). Shops are flat tenants. | Same. Schools are flat tenants; school creation is an operator step. |
| 2 Entitlements and provisioning owner | Only `BANK_COLLECTION`, set by an operator script. Needs the kit to issue entitlements (token claim or API) and Commerce to enforce them. | No per-school modules. Same model. |
| 3 Billing v1 | Nothing charges a partner or a shop. Commerce must report billable counts (active stores, branches, tills) to billing (inside CE-05). | Nothing charges a partner or a school. Report billable counts (schools, active learners) (inside ED-07). School fees to families are a separate, school-owned matter (D-E3). |
| 4 Public catalogue on the Hub | COM-001..006 opportunities from the master plan §3 come from the manifest (later build) | Same, from the Education manifest |
| 5 VentureWorks | Boundary written but not built: "optional merchant venture profile and approved KPIs" (`docs/api/COMMERCE_API_DEPENDENCY_CONTRACTS.md:23`). The CE-05 counts are the first operational reporting API. | No VentureWorks link; ED-07 counts serve the same purpose. The inbound referral (EDU-FR-045) is LATER. |
| 6 Methodology name | No "v2" claim in README or AGENTS | `README.md:29` says "ADS Full-Stack v2 adoption". Rename to match the outcome of the name check. |
| 7 Legal review | Entry-fee wording for POS partners; BNPL (Pilot D); pharmacy pack; non-fiscal receipt wording; the bank agreement for collection | Minors' data and consent (guardian links, J43); transcript validity wording ("no claim of external accreditation") |

---

# Finalization build register

Sizes are a planning judgement: S ≈ under 3 days, M ≈ 1–2 weeks, L ≈ over 2 weeks, for one developer with the current code. "FND" means the shared foundation items in `PLATFORM_FOUNDATION_PLAN.md`: organisation levels, entitlements, provisioning API, billing v1.

### Commerce

| ID | Title | What it is | Depends on | Size | Acceptance check | Class |
| --- | --- | --- | --- | --- | --- | --- |
| CE-01 | Capability manifest | `capabilities.json` with the A2 keys and the A3 packages; doc page | — | S | File validates against the Software Factory manifest schema; every key maps to routes and screens | PILOT-MVP |
| CE-02 | Server-side entitlements | Replace the `org_capabilities` check list with manifest keys read from the kit; every gated route refuses with `CAPABILITY_OFF` | FND entitlements, CE-01 | M | API test: shop without `pos_cash` gets 403 on POS routes, and catalogue and orders still work; disable and enable tests for each capability | PILOT-MVP |
| CE-03 | Menus from entitlements | Replace `SECTIONS_BY_ROLE` and the `future` list with role ∩ entitlement; manager sees orders | CE-02 | S | E2E: two shops with different packages see different menus; typed URL to a disabled section shows "not in your package" | PILOT-MVP |
| CE-04 | Partner provisions merchants | Partner admin creates a merchant organisation under itself, picks an allowed package, invites the owner; ADS bank registration moves to an admin screen | FND org levels + provisioning API, CE-02 | M | E2E: partner creates a shop; the owner accepts the invitation, sets up the storefront and makes a cash sale; the partner cannot pick a package ADS did not allow; the partner cannot see another partner's shops | PILOT-MVP |
| CE-05 | Partner view and reporting counts | Partner dashboard: its merchants, status, active stores, POS sales count and value, orders; the same counts as an API for VentureWorks and billing | CE-04 | M | Counts match database totals in a test; partner sees no shopper personal data; another partner gets 403 | PILOT-MVP |
| CE-06 | Staff invitation (J-23, COM-MER-S16) | Owner invites cashier, manager or accountant through the kit admin API (token exchange) | Kit PLAT-ROLE-001 (exists) | M | E2E: owner invites a cashier, who signs in and sells only at the assigned branch | PILOT-MVP |
| CE-07 | Support contact per partner | Help page shows the partner's phone and email; ADS fallback | CE-04, D-A1 | S | No placeholder number remains; FR and EN | PILOT-MVP |
| CE-08 | Separate worker and webhook DB roles | `commerce_webhook` (bank callback, payment inbox) and `commerce_worker` (dispatcher, SMS) with their own logins; policies by role, not by session flag | — | M | Test: the runtime login setting `app.bank_callback` gains nothing; the callback still reconciles in J-28 | PILOT-MVP |
| CE-09 | Retire legacy cash-pickup API | Remove the `/api/v1/merchant/cash-pickups` routes; keep the table for history | Owner yes (D-A6) | S | Route returns 404; J-15, J-19, J-28 still pass | PILOT-MVP |
| CE-10 | Web security headers | CSP, HSTS and a rate limit at the proxy | Hosting plan | S | Header check in the staging smoke test | PILOT-MVP |
| CE-11 | Storefront branding | Logo, colours, shop link | CE-02 | M | Two shops render with their own branding; contrast check passes | LATER (Pilot C) |
| CE-12 | Partner marketplace | Public marketplace page per partner listing only its merchants | CE-04 | M | Partner page shows only its shops | LATER (Pilot B) |
| CE-13 | Digital payments (COM-CORE-S09) | MoMo, Orange and card through the kit payment adapter, under the portfolio payment rule | PLAT-PAY-001, CE-08 | L | Wrong amount or currency → never paid; callback on the webhook role; refund path | LATER |
| CE-14 | Tourism counter-sale endpoint | `POST /api/v1/integrations/pos/counter-sales` + `GET` by key, service token | Kit token exchange, D-A4 | M | Tourism `j08-counter-sale` passes with `COMMERCE_POS_MODE=live` | LATER (D-A4) |
| CE-15 | Category packs | SUP, PHA, RES, HAR, CLO, BAK, WHO, ONL, MBR, INV (54 stories) | CE-02 | L each | Per-pack story acceptance | LATER |
| CE-16 | Portfolios and ERP | Accountant, auditor and bank portfolios; 37 ERP stories; full offline POS and PWA; courier | Various | L | Per story | LATER |
| CE-17 | Staging acceptance with a partner | Seeded staging partner, two shops, ADS test team runs Pilot A script | CE-02..CE-10 | S | Signed acceptance record (handbook §12.2) | PILOT-MVP |

### Education

| ID | Title | What it is | Depends on | Size | Acceptance check | Class |
| --- | --- | --- | --- | --- | --- | --- |
| ED-01 | Capability manifest | Manifest with the B2 keys and the B3 packages | — | S | Validates; each key maps to routes and screens | PILOT-MVP |
| ED-02 | Roles adapter to the kit admin API | Replace the `ADS_ROLES_SERVICE_URL` path with kit `/admin/v1` token exchange | Kit PLAT-ROLE-001 (exists) | M | E2E: an invited teacher accepts and has the role with no operator step; J28 approval activates | PILOT-MVP |
| ED-03 | School provisioning under a partner | J45 approval creates the organisation under the partner and grants `institution_admin` | FND org levels + provisioning API | M | E2E: partner's school approved → owner signs in as school admin; no `pending_ads_operator` | PILOT-MVP |
| ED-04 | Entitlements per school | Server capability checks; `routes.ts` and the service catalogue driven by entitlements; "later tools" hidden unless entitled | FND entitlements, ED-01 | M | School without `school_finance` cannot open bursar routes (403); other modules unaffected | PILOT-MVP |
| ED-05 | Configurable promotion rule | Pass mark per school (default 50 %), in the academic policy; manual override kept | D-E1 | S | Test with 50 % and 60 % schools; decision recorded with the policy version | PILOT-MVP |
| ED-06 | Minors' data export and deletion (minimal) | Guardian or school asks; operator-assisted export of a learner's record; deletion with legal holds for official records | D-E2 | M | Request → export file → audit row; transcripts kept under the documented hold | OWNER-DECISION (recommended PILOT-MVP) |
| ED-07 | Partner view and counts | Partner dashboard: schools, active learners and staff, report cards published; API for VentureWorks and billing | ED-03 | M | Counts match; no pupil personal data shown to the partner | PILOT-MVP |
| ED-08 | Help routing | Requests to "ADS" go to the partner's help desk, then ADS | ED-03 | S | Partner sees and answers its schools' requests only | PILOT-MVP |
| ED-09 | Worker DB role | Dispatcher on its own role instead of `edu_scope()='dispatcher'` | — | S | Runtime login setting the scope gains nothing; J39 passes | PILOT-MVP |
| ED-10 | Web security headers | CSP, HSTS, rate limit | Hosting plan | S | Header check | PILOT-MVP |
| ED-11 | School finance E2E (J15, J16) | Invoices and verified cash under a Playwright journey | D-E3 | M | Journey passes EN desktop and FR 360 px | OWNER-DECISION (recommended LATER) |
| ED-12 | Fee payments by mobile money | EP-EDU-10 with the payment rule | PLAT-PAY-001, ED-09 | L | Amount or currency mismatch never settles | LATER |
| ED-13 | Tutoring, academy and training packages | New institution types; learning delivery, exam prep and cohorts E2E-tested | ED-04 | L | Per package | LATER |
| ED-14 | Staging acceptance with a partner | Seeded partner, two schools, ADS test team runs the pilot script | ED-02..ED-10 | S | Signed acceptance record | PILOT-MVP |

Dependencies outside these repos that the pilots need: FND organisation levels, entitlements and provisioning API (gaps 1–2); billing v1 (gap 3); live SMS and email (kit PLAT-NOT-001) before real families or shoppers get messages; hosting (`HOSTING_AND_LANDING_PLAN.md`).

---

# Decisions needed from the owner

| # | Decision | Recommendation |
| --- | --- | --- |
| D-A1 | Commerce support phone (`src/HelpPage.tsx:7` placeholder) | Show the **partner's** support phone and email first and an ADS number second. Please give the real ADS support number, or an ADS-domain support mailbox if there is no phone line yet. |
| D-A2 | D-06 two-shop basket; D-07 reviewer scope | Confirm the defaults for the pilot: **block** two-shop baskets (one request per shop), and **one ADS review team** reviews every shop. Revisit D-06 for Pilot B and partner-scoped reviewers for Pilot C. |
| D-A3 | 48-hour wait before a missing bank credit is flagged (`COMMERCE_CREDIT_WAIT_HOURS`) | Keep 48 h as the default. Make it a per-bank setting taken from the bank agreement when a real bank signs. |
| D-A4 | Tourism counter-sale endpoint (CE-14) | **LATER.** Build it when Tourism enters a finalization wave. Tourism stays on its mock until then. It does not block Commerce Pilot A. |
| D-A5 | Bank cash collection in Pilot A | Include it **only if a real bank signs** for the pilot. Otherwise pilot shops use cash POS, cash on hand and "own deposit reported", which work with the capability off. Keep the mock bank for demos only. |
| D-A6 | Retire the legacy cash-pickup manifest API | Yes (CE-09) |
| D-A7 | Which Commerce pilot first | **Pilot A**, with one partner and 3–5 shops of at least two types in one city (as the MVP doc asks). Start B and C only after CE-04 provisioning is proven. Pilot D is feasibility and legal only. |
| D-A8 | Digital payments in Pilot A | **No** (cash first, per MVP doc and D-02). Plan CE-13 for Pilot B. |
| D-A9 | Pharmacy package | **LATER**, after legal review (prescriptions, restricted products) |
| D-E1 | Education 50 % promotion rule (`records.ts:60`) | Keep 50 % as the **default**, which matches the common 10/20 pass mark. Make it a per-school setting in the academic policy, and keep the academic office's per-pupil override. |
| D-E2 | Minors' data export and deletion before the pilot (open decision 11) | **Yes, minimal (ED-06).** The pilot holds children's records. An operator-assisted request flow is enough, with legal review of retention (gap 7). |
| D-E3 | School fees in the first Education pilot | **Not in the first pilot.** Schools keep their current fee process. Add invoices and verified cash (ED-11) in the second pilot phase, and mobile money (ED-12) after PLAT-PAY-001. |
| D-E4 | Who approves a partner's new school | The partner verifies its own schools. ADS keeps a veto and an audit view (the current "different reviewer" rule stays). |
| D-E5 | First Education pilot type | A **school-SaaS partner** with 2–3 private schools on the School package. Tutoring centres, online academies and training centres come later. |
| D-X1 | Pilot class of the security fixes CE-08 and ED-09 | Treat both as PILOT-MVP. They are small, and real merchant cash records and real pupil data should not run on the shared-login flag pattern. |

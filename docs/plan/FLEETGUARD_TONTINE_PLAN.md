# Fleet Guard and Digital Tontine: wave-1 plan

Planning only (owner direction, 20 Oct 2026). Nothing here changes code. Prepared 20 Oct 2026 for Kengjiseh Sondo.

**Evidence base** (all read from `origin/main` unless stated):

| Repo | Commit read |
| --- | --- |
| fleet-guard-and-intelligent-services | `9998bdb` |
| digital-tontine-and-intelligent-services | `d05e91e` |
| Transport-Platform | `75bd890` |
| ads-platform-kit | `c74c5ad`; Library BRS extracts on `origin/audit/ads-library-rck-portfolio-20261019` (`b76c464`) |
| Also checked | logistics, banking-platforms and africa-digital-synergy-ventureworks (for contracts) |

**Labels used:**
- `PILOT-MVP`: must be ready for the first partner pilot.
- `LATER`: not needed for the pilot.
- `OWNER-DECISION`: you need to choose.

---

## 1. Summary

| Product | BRS functions built (13 Oct audit → now) | First release finished? |
| --- | --- | --- |
| Fleet Guard | **Before (13 Oct):** 0 of 31 proven end to end (21 partial, mostly tables only). **Now:** 16 of 31 fully built, 2 partly built, 3 with an AI contract only, 10 not started (**about 52–58%**). | **No.** The 12 MVP journeys are built and pass 24/24 browser tests, 51 API/DB tests and 23 unit tests (local runs only). Still missing: CI evidence, staging, your acceptance, the partner layer and billing. |
| Digital Tontine | **Before (13 Oct):** 0 of 31 proven (17 partial, 4 external, 10 not verified). **Now:** 19 of 31 built against test-mode mocks, 2 partly built, 10 not started (**about 61–68%**). | **No.** The 15 MVP journeys pass 44/44 browser runs, 72 API/DB tests and 26 unit tests (local runs only). Still missing: no live licensed money partner (by design), invitations into an organisation through the shared sign-in, and the payment-check fixes below. |

How the percentages were counted:
- I counted the BRS function IDs (FR-001…), using each repo's `docs/traceability/TRACEABILITY.csv`, `docs/delivery/E2E_STATUS.md` and the code. Every function counts the same.
- Fleet Guard has 32 IDs. FR-023 (the marketplace) is withdrawn, which leaves 31.
- The low end of each range counts only fully built functions. The high end adds the partly built ones.
- These are not effort percentages. The work left (partners, live money, AI, telemetry) is heavier per function than the work done.

**Recommended pilots:**
- **Fleet Guard:** a fleet-management reseller. It runs 3–5 transporter customers on the Essentials package, with no telemetry and no in-app payments.
- **Tontine:** an association-management partner. It runs 3–5 associations in **record-only mode**: money stays with the group (cash or the group's own mobile-money account), and Tontine records, reconciles and reports. Neither ADS nor the partner ever holds member money.

**Smallest pilot set:**
- Both products need the shared organisation levels and invitations (gap 1), entitlement checks (gap 2) and a simple subscription bill (gap 3).
- Tontine also needs: record-only contributions, the payment-confirmation fixes, a separate database login, and wording that does not suggest anyone holds deposits.
- Fleet Guard also needs: a kit update, the partner role screens and metering by number of assets.

---

# Part A: Fleet Guard

## A1. Current state

### What is built
All 12 MVP journeys are built and tested locally on 18 Oct (`docs/delivery/E2E_STATUS.md`). The build is merged to main (merge `1bd1a14`); E2E_STATUS still says "not merged", which is a stale line.

| Journey | What the user can do |
| --- | --- |
| FG-J-13 | Sign in with the shared ADS account, choose the fleet, see only that fleet |
| FG-J-01 | Register or import assets (vehicles and machines; owned / leased / rented-in / client-managed), documents and expiry dates |
| FG-J-02, FG-J-21 | Drivers, assignment to asset and jobsite, fuel, meter (km or hours) and costs; field capture works **offline** |
| FG-J-03 | Inspection → defect → work order → technician evidence → approved return to service (maker-checker) |
| FG-J-04 | Breakdown → downtime → repair → history; parts fitted and removed |
| FG-J-10 | Preventive maintenance by km, hours or date |
| FG-J-08, FG-J-15 | Expiry and overdue alerts by severity; email/SMS channel choice (kit mocks) |
| FG-J-11 | Operations dashboard: availability, downtime, maintenance, compliance, fuel and cost |
| FG-J-14, FG-J-16 | EN/FR settings and units; help and support with an ADS support queue |
| FG-J-20 | Invite a person, record their role, deactivate them immediately |

Quality points:
- Every table uses forced row-level security under a restricted runtime role (`db/migrations/006_row_level_security.sql`).
- The server logs in as `fleetguard_api`, which is not the owner and cannot bypass row-level security.
- Every test runs at 360 px in French and includes an axe accessibility check.
- No money moves: fuel and costs are records only (`src/server/routes/costs.mjs`, line 1).

### Roles and how they are granted
- **14 roles** are listed in `src/server/roles.mjs`: owner_admin, fleet_manager, workshop_manager, technician, driver, operator, finance, compliance_officer, dispatcher, site_coordinator, partner, regulator_viewer, vehicle_owner and ads_support.
- **Nine have screens.** Dispatcher, site_coordinator, partner, regulator_viewer and vehicle_owner are recognised but "see nothing yet".
- **Roles come only from the ADS token.** Fleet Guard never grants a role itself.
- **Today a role is granted by an ADS operator in the kit** (`grant-role`; e2e uses `ads.createOrganization` and per-test grants in `e2e/fixtures.mjs`).
- **The Team screen does not grant access.** It records the invitation and sends its own email (`src/server/routes/account.mjs`, lines 56–86, `roleGrant: 'ads_sign_in'`).
- **Organisations (fleets) are created only by an ADS admin** through the kit CLI (`services/identity/src/cli.mjs` `create-organization`). There is no self-service sign-up into a fleet.

### What is left, and why
From the backlog's later epics, `docs/backlog/USER_STORIES_MVP.md` lines 170–179:

| Item | Why it is not built | Class |
| --- | --- | --- |
| EP-FG-08 telemetry and live map (FR-007) | Needs a GPS/OEM provider; the manual fallback already works | LATER |
| EP-FG-09 assistants (FR-027–032) | Only a contract exists (`src/arag/runtime.ts`); Progress is not connected | LATER |
| EP-FG-10 economics (FR-012, 013, 025, 026) | Decision D7: costs are recorded first | LATER |
| EP-FG-11 rental/lease (FR-021, 022) | BRS says only after the core is trusted | LATER |
| EP-FG-12 owner/investor settlement | Decision D4 is open; it needs shared Settlement | LATER |
| EP-FG-13 vehicle availability API for Transport/Logistics (FG-FR-034) | Contract written by Transport on 19 Oct; Fleet Guard has no endpoint | OWNER-DECISION (recommend: build soon after the pilot set, §A5) |
| EP-FG-14 driver reports; data export and deletion | Later epic (PLAT-DATA-001) | LATER (needed before paid contracts; see FG-B-11) |
| EP-FG-15 asset disposal | New requirement (FG-FR-035) | LATER |
| EP-FG-16 subscription billing | Decision D5 defaulted to "no billing" | OWNER-DECISION (gap 3) |

Gaps inside built journeys:
- **FR-009:** cycles, idle time and utilization % are not calculated.
- **FR-024:** the dashboard has no utilization figure (no "idle"/"utili" code in `src/server`).
- **Units:** miles/gallons conversion is not built.
- **Files:** stored in PostgreSQL until shared document storage exists.

### Kit switch-over follow-ups (checked)
1. **The kit pin is old.** Both workflows pin kit `1d3ee27`, in `.github/workflows/e2e.yml`, lines 7 and 10. That commit predates:
   - the fix for being signed out on fast reloads (`b9e8e6a`). E2E_STATUS lists that sign-out as a known risk; the tests work around it with waits.
   - the organisation admin service and invitations (`c3d13ef`, PLAT-ROLE-001).
2. **Team invitations still use Fleet Guard's own path:** a Fleet Guard record plus a Fleet Guard email, with the role granted separately in the kit. The kit now has `/admin/v1/invitations` and role grant/revoke through token exchange (kit `docs/INTEGRATING_A_PRODUCT.md`, lines 68–137). The owner_admin should invite through the kit, so the role arrives on acceptance. This is the same follow-up as for Tontine.
3. **Language is not in the shared profile.** It is stored in Fleet Guard's `user_settings`, because the kit has no profile API. → LATER.
4. **The AI path is not on the shared gateway.** The Agentic RAG contract is still the old shape. When EP-FG-09 starts, it should use the kit's `ai-gateway-client` (`8f23cf8`). → LATER.

## A2. Draft capability manifest (sellable features)

Sources:
- Repo BRS: `docs/ADS_FleetGuard_Full_BRS_v1.0.md`.
- Library BRS: `docs/audit/library-sources/fleetguard-brs.md` (L-FG) and `construction-fleet-brs.md` (L-CF).
- Master plan row: "Fleet SaaS, maintenance networks, asset monitoring".

| Cap. ID | Sellable feature | Source | Built? | Class |
| --- | --- | --- | --- | --- |
| FG-CAP-01 | Asset register (vehicles, machines, powered assets), import, documents and expiry | FR-001–003; L-FG §3–4 | yes | PILOT-MVP |
| FG-CAP-02 | Drivers/operators, assignments, jobsites | FR-004, 005, 008; L-FG §6–7 | yes | PILOT-MVP |
| FG-CAP-03 | Field capture app (offline): meter, fuel, inspection, breakdown | FR-009, 010, 015; L-CF §9 | yes (PWA; no native app) | PILOT-MVP |
| FG-CAP-04 | Operating cost records | FR-011 | yes | PILOT-MVP |
| FG-CAP-05 | Preventive maintenance by km / hours / date | FR-014; L-CF §11 | yes | PILOT-MVP |
| FG-CAP-06 | Work orders with technician evidence and approved return to service | FR-015, 016, 020 | yes | PILOT-MVP |
| FG-CAP-07 | Parts/component life tracking (anti-swap) | FR-017; L-FG §9 | yes | PILOT-MVP |
| FG-CAP-08 | Compliance and maintenance alerts (email/SMS) | FR-018, 019 | yes (mock SMS) | PILOT-MVP |
| FG-CAP-09 | Operations dashboard | FR-024 | yes (no utilization) | PILOT-MVP |
| FG-CAP-10 | Team, roles, deactivation; EN/FR; support | FR-006; PLAT | yes (kit invite switch pending) | PILOT-MVP |
| FG-CAP-11 | Partner/reseller console: see and support the customer fleets you manage | Master plan §5; L-FG §18 "fleet management business" | **no** (the `partner` role has no screens) | PILOT-MVP |
| FG-CAP-12 | External garage / maintenance-network work orders (a work order sent to an outside workshop, quote, approval, evidence) | L-FG §8; L-CF §12–14 | no | LATER (PILOT-MVP only if you pick the maintenance-network pilot) |
| FG-CAP-13 | Utilization, idle time, productive hours, redeployment | FR-009 rest; L-FG §13 | no | LATER |
| FG-CAP-14 | Policy-as-software: repair thresholds, fuel limits, approval levels | L-CF §7–8 | no | LATER |
| FG-CAP-15 | Fuel authorization, fleet cards, anomaly review | FR-013; L-CF §10 | no | LATER |
| FG-CAP-16 | Spare parts procurement and supplier prices | L-CF §13 | no | LATER |
| FG-CAP-17 | Asset economics: cost per km/hour, repair-vs-replace, buy-vs-rent | FR-012, 025, 026; L-FG §14 | no | LATER |
| FG-CAP-18 | Telemetry / GPS / OEM feeds, live map, geofences | FR-007; L-FG §5, 16 | no | LATER |
| FG-CAP-19 | Technical knowledge and 3 assistants (Operator, Technician, Manager) | FR-027–032; L-FG §11–12 | contract only | LATER |
| FG-CAP-20 | Predictive maintenance support | L-FG §15 | no | LATER |
| FG-CAP-21 | Rental/lease operations | FR-021, 022; L-FG §17 | no | LATER |
| FG-CAP-22 | Owner/investor settlement (versement split) | FG-FR-033 (proposed) | no | LATER (decision D4) |
| FG-CAP-23 | Vehicle availability API for Transport/Logistics | FG-FR-034 | no | OWNER-DECISION (§A5) |
| FG-CAP-24 | Data export and deletion | PLAT-DATA-001 | no | LATER |
| FG-CAP-25 | Asset-backed financing / insurance evidence to regulated partners | L-FG §20 | no | LATER (licensed partner, consent) |

**Construction/heavy-equipment scope, and who owns it.**
- The kit audit maps the construction BRS to both Fleet Guard and `construction-realestate-intelligence-platform` (reconciliation, lines 22 and 27).
- Recommendation (OWNER-DECISION OD-FG-2): Fleet Guard owns the **machines**. That means their hours, operators, jobsite reference, maintenance, fuel and parts.
- The construction platform owns **projects and property**. Fleet Guard shares only equipment cost/hours per jobsite, through an API. L-FG §7 says the same: "without turning FleetGuard itself into a complete construction-management system".
- Engine hours and jobsites are already built, so a contractor can use Essentials today. FG-CAP-13 to 16 come later.

## A3. Draft packages

| Package | Contents | Pilot? |
| --- | --- | --- |
| **Fleet Guard Essentials**, priced per asset per month | CAP-01 to 10 | **PILOT-MVP** |
| **Partner console** (for resellers and fleet-management companies) | CAP-11, plus the ADS → partner → customer provisioning | **PILOT-MVP** |
| Fleet Guard Workshop Network | CAP-12, 16 | LATER |
| Fleet Guard Equipment (construction, mining, agriculture) | Essentials + CAP-13, 14, 15 | LATER |
| Fleet Guard Intelligence | CAP-17, 19, 20 | LATER |
| Fleet Guard Connect | CAP-18, 23 | LATER |
| Fleet Guard Rental & Owners | CAP-21, 22, 25 | LATER |

Prices are not set here. The Library BRS treats past figures as "scenario assumptions" (L-FG §19).

## A4. First pilot: fleet-management reseller (recommended)

**Why a reseller, not a maintenance-network operator:**
- What the reseller sells (Essentials) is already built.
- Each customer fleet stays a separate ADS organisation, which is how isolation works today.
- A maintenance network needs work orders to cross between companies: a garage works on many fleets' vehicles (CAP-12). That is new, cross-tenant design work (size L).

**Pilot shape.**
- One reseller partner with 3–5 transporter customers (taxi/bus/truck owners), about 10–50 assets each.
- Manual meter and fuel capture only: no telemetry, no payments in the app.
- ADS bills the partner a subscription outside the app (billing v1).

**What the partner needs to provision its own customers (gap 1):**

| Need | Today | Build | Class |
| --- | --- | --- | --- |
| A partner organisation above its customers | Kit organisations are flat (`platform.organizations`: id, name, slug, status, kind; no parent) | Kit: organisation levels (foundation plan) | PILOT-MVP |
| The partner admin creates a customer fleet within what ADS allowed (product = Fleet Guard, package = Essentials, asset cap) | Only an ADS admin can, via CLI | Kit: provisioning API and screen limited by entitlements | PILOT-MVP |
| The partner invites the customer's owner as `owner_admin` | Fleet Guard records invitations; the role grant is separate | FG-B-01 (kit invitations) | PILOT-MVP |
| Partner staff see and support their customers' fleets, without the customer's admin rights | The `partner` role exists with no screens and is not invitable (`INVITABLE_ROLES`) | FG-B-02 partner console (read assets, alerts, work orders; open support cases) | PILOT-MVP |
| Package limits are enforced (asset cap, modules) | None | FG-B-03 | PILOT-MVP |
| ADS and the partner see usage (active assets per customer) for billing | None | FG-B-07 metering | PILOT-MVP |
| The customer can leave with its data | Not built (FG-J-19) | FG-B-11 | LATER (before paid renewals) |

**Pilot success checks:**
- The partner provisions a customer without ADS staff.
- The customer's people sign in and use the 12 journeys.
- The partner cannot see another partner's customers.
- The asset count per customer matches the bill.

## A5. Integration contracts still to build

| Contract | State | What Fleet Guard must build | Class |
| --- | --- | --- | --- |
| **Fleet Guard → Transport: vehicle availability v1** (Transport-Platform `contracts/fleetguard-vehicle-availability.v1.md`) | Transport has built against a mock and refuses `FLEETGUARD_MODE=live` (`src/server/adapters.mjs`, lines 48–51). With no answer it saves "not checked", so Transport works without Fleet Guard. | Endpoint `GET /api/v1/integrations/mobility/vehicles/{vehicleRef}/availability` (FG-B-04):<br>• Match `vehicleRef` to `asset.external_ref`, which is unique per tenant.<br>• Report `DOWN` when a breakdown or work order is open, and `DO_NOT_USE` when a compliance document has expired or the asset is blocked.<br>• Keep a consent record per customer.<br>• Accept Transport's service credential plus the operator's ADS token. This needs the kit to issue a token Fleet Guard accepts (exchange or audience); today Fleet Guard accepts only its own audience (`src/server/identity.mjs`). | OWNER-DECISION. Recommend LATER, right after the pilot set (size M), unless the pilot customer also runs Transport |
| **Fleet Guard → Logistics: vehicle reference** (LOG-FR-026, EP-LOG-14) | Logistics decision D7: optional, never a dependency; `not_started` in Logistics traceability | Reuse the same v1 endpoint. Logistics needs only availability, so no second contract is needed now. | LATER |
| Fleet Guard → VentureWorks: capability manifest and usage reporting | VentureWorks has `src/contracts/ecosystem.ts` (no Fleet Guard in its system list) | Publish the manifest above and the metering numbers (master plan §5). Owned by the VentureWorks plan. | LATER (the manifest document itself is PILOT-MVP) |
| Fleet Guard → Construction platform: equipment hours/cost per jobsite | Not written | After OD-FG-2 | LATER |

## A6. Security follow-ups

| Check | Finding | Action | Class |
| --- | --- | --- | --- |
| Payment pattern (worker/webhook functions the runtime role can call; no amount/currency check on payment confirmations) | **Does not apply.** Fleet Guard has no payments, no webhooks and no provider callbacks (`git grep webhook\|payment src/server` finds only the "no money moves" note). | Apply the Tontine fix pattern if billing (D5) or settlement (D4) ever enters the product | — |
| SECURITY DEFINER | One function: `fleet_tenants_for_jobs()` (`006_row_level_security.sql`, lines 66–70), executable by `fleetguard_app`. It returns **every tenant's ID** (no other data) to the runtime role, for the hourly alert job. | Low risk. Better: run the alert job under its own login role, and revoke EXECUTE from the request role | LATER (FG-B-09) |
| Support-agent access | Policies trust the setting `app.support_agent = 'on'`. Any session can set its own custom setting, so this protection is only as strong as the server code that sets it (the same is true of `app.tenant_id`). | Accept, and document it in the security notes. Optionally move support reads into a separate role | LATER |
| Runtime role | Good: `fleetguard_api` login, NOBYPASSRLS, append-only audit, no DELETE | — | — |

---

# Part B: Digital Tontine

## B1. Current state

### What is built
All 15 MVP journeys are built and tested locally on 18 Oct (`docs/delivery/E2E_STATUS.md`), and merged (`b2b9160`). `docs/journeys/CUSTOMER_JOURNEYS.md` still shows old "not started" statuses, which is stale.

| Journey | What the user can do |
| --- | --- |
| DT-J11, J12 | Sign in with ADS; EN/FR; phone and payout number confirmed by an SMS code |
| DT-J01 | Group admin creates a group and invites by **SMS** with a single-use code (168 h); the invitee sees the published rules, consents, and goes through KYC (mock) when the scheme requires it |
| DT-J02, J08 | Versioned rules published with the members' approval; obligations generated; "My tontines" shows what is due next, arrears and turn |
| DT-J03 | Pay by MTN MoMo / Orange Money (**kit mock only**): Pending → Paid after the provider confirms |
| DT-J05, J18 | Failed / reversed / unmatched payments, reconciliation cases, disputes handled by an officer |
| DT-J04 | Payout: the treasurer proposes, a second official approves (maker-checker), the partner pays, the beneficiary confirms |
| DT-J09 | Auditor trail and CSV export (PDF tested at the API level) |
| DT-J07 | Guidance agent answers only from approved rules (mock RAG) and refuses when it has no source |
| DT-J13–15 | SMS reminders and receipts, help (kept offline as a draft), leaving a group with settlement shown |

The ledger:
- It is built in this repo (README decision 3, option a).
- It uses balanced double entry, is append-only, and keeps "pool = sum of member balances" (`src/server/routes/money.mjs`, `ledgerTotals`).
- Live mode **fails closed**. With no verified settlement adapter, the money endpoints return 503 `VERIFIED_SETTLEMENT_ADAPTER_REQUIRED` (`src/server/adapters.mjs`).

### Roles and how they are granted
- **Roles** (`src/server/domain/services.mjs`, lines 7–8):
  - member, entrepreneur, group_admin
  - staff: treasurer, payout_approver, auditor, compliance_officer, support_officer
- **A tenant is one ADS organisation.** One organisation can run many groups.
- **Staff roles reach every group in their organisation.** `groupAccess` lets staff into every group of the tenant; they are not scoped to one group.
- **No self-service roles.** `e2e/global-setup.mjs` registers the client with `selfRoles: []`, `personal: false`, and every role is granted by an operator in the kit.
- **An invitee must already hold a Tontine role** in the group's organisation (E2E_STATUS risk 1). People outside the organisation cannot join on their own.

### What is left, and why
From the backlog's later epics, `docs/backlog/USER_STORIES_MVP.md` lines 155–164:

| Item | Why | Class |
| --- | --- | --- |
| EP-T2B Tontine-to-Business (FR-019–022, 029) | After the savings core; needs VentureWorks and Education handoffs | LATER |
| EP-FEES fees and revenue share (FR-023–025) | Needs legal approval (FR-023 says so) | LATER (OD-DT-5) |
| EP-PLANNER, EP-AGENTS-OPS (FR-027, 028; DT-FR-038, 039) | AI work after the guidance agent | LATER |
| EP-CLOSE group dissolution (DT-FR-037) | Not in any document before 18 Oct | LATER (a pilot can run one cycle without it) |
| EP-DATA export and deletion (DT-FR-041) | Platform requirement | LATER |
| EP-USSD (DT-FR-033) | Decision 4: SMS now, USSD later | LATER |
| EP-SCHEMES-MORE: partner-return, credit-linked, investment/dividend, matched savings (FR-008, 024) | **Need a licensed partner** | LATER |
| EP-APPS native apps | PLAT-CH-001 | LATER |
| Step-up MFA for money roles (DT-FR-032) | The kit token has no `auth_time`/MFA; maker-checker is the pilot control | LATER |
| Live settlement partner (README decision 2) | Go-live gate (PLAT-EXT-001) | OWNER-DECISION (OD-DT-1, 2) |
| Payout disbursement | The kit mock has no transfer-to-another-number API. Tontine reuses request-to-pay as a stand-in (`adapters.mjs`, `disburse`). The kit added refunds to the payer (`357e6b7`), which is not the same thing. | LATER (kit item DT-B-08) |
| Daily provider statement import | Reconciliation asks the provider per transaction | LATER |

### Kit switch-over follow-ups
1. **Invite into an organisation through the kit** (the main follow-up). Tontine sends its own SMS code (`src/server/routes/groups.mjs`, lines 171–260), but acceptance needs the invitee to already be a member of the organisation with a role. The kit now has invitations that grant organisation membership and roles on acceptance (`c3d13ef`), but **they are email-based**:
   - only the account with the invited email can accept (`INTEGRATING_A_PRODUCT.md`, line 137);
   - phone is only an optional extra SMS.

   Many tontine members have only a phone. So the switch needs two things:
   - (a) the kit supports **phone-number accounts and phone invitations** (PLAT-ID-003, `not_started` in Tontine traceability);
   - (b) Tontine creates the kit invitation (roles `member`) and keeps its own consent and rules step after acceptance.

   This is DT-B-01 and kit item K-02, both PILOT-MVP.
2. **The kit pin is old:** `1d3ee27` (`.github/workflows/e2e.yml`, lines 6 and 9). Update to at least `c3d13ef`, which also brings the reload sign-out fix. PILOT-MVP.
3. **RAG mock shape.** Tontine calls the old `/rag/v1/retrieve` mock. Switch to `ai-gateway-client` (`8f23cf8`) when Progress is connected. LATER.
4. **Duplicate client code** (`src/app/domainApi.ts`, `src/platform/*`, README decision 10). Remove. LATER.
5. **No axe accessibility check in Playwright** (E2E_STATUS risk 3). Fleet Guard has one. PILOT-MVP (S).

## B2. Draft capability manifest (sellable features)

Sources:
- Repo BRS: `docs/ADS_Digital_Tontine_Full_BRS_v1.0.md`.
- Library BRS: `docs/audit/library-sources/digital-tontine-brs.md` (L-DT).
- Master plan row: "Savings-group SaaS, association management, cooperative administration".

| Cap. ID | Sellable feature | Source | Built? | Class |
| --- | --- | --- | --- | --- |
| DT-CAP-01 | Group creation, phone invitations, consent, member roster | FR-001, 003, 005 | yes (kit invite switch pending) | PILOT-MVP |
| DT-CAP-02 | Scheme rules: amount, frequency, payout order, penalties; versioned, approved by members | FR-006, 007, 009 | yes | PILOT-MVP |
| DT-CAP-03 | Scheme types: **rotating** (and goal, solidarity, custom are accepted) | FR-008 | 4 of 8; eligibility logic is rotating-turn only | PILOT-MVP: rotating only (OD-DT-3) |
| DT-CAP-04 | Obligations, arrears, "what I owe next", my turn | FR-012 | yes | PILOT-MVP |
| DT-CAP-05 | **Record-only contributions and payouts** (cash or the group's own account, recorded by the treasurer and confirmed by a second person or the member) | L-DT §8 "platform … display balances … maintain scheme ledgers and reconcile" | **no** | PILOT-MVP (OD-DT-1) |
| DT-CAP-06 | Group ledger, member and group statements (PDF, EN/FR) | FR-011, 014 | yes | PILOT-MVP |
| DT-CAP-07 | Payout approvals with maker-checker | FR-015, 016 | yes | PILOT-MVP |
| DT-CAP-08 | Disputes, reversals, reconciliation cases | FR-013, 018 | yes | PILOT-MVP |
| DT-CAP-09 | Auditor workspace and export | FR-004 | yes | PILOT-MVP |
| DT-CAP-10 | SMS reminders and receipts; help; leave a group | DT-FR-035, 040, 036 | yes (mock SMS) | PILOT-MVP |
| DT-CAP-11 | Association/partner console: provision associations, assign their officers, support them | Master plan §4–5; L-DT §10 | **no** | PILOT-MVP |
| DT-CAP-12 | Mobile-money collection and payout **through a licensed provider** | FR-010, 017 | built against a mock only | LATER (go-live gate; OD-DT-2) |
| DT-CAP-13 | Scheme guidance agent | FR-026, 030, 031 | yes (mock RAG) | LATER for real users (test mode only until Progress is live) |
| DT-CAP-14 | Cooperative administration: many groups under one cooperative, group-scoped officers, consolidated reports | L-DT §10; master plan | partial (an organisation holds many groups, but officers are organisation-wide) | LATER (OD-DT-4) |
| DT-CAP-15 | Group dissolution and final settlement | DT-FR-037 | no | LATER |
| DT-CAP-16 | USSD channel for feature phones | DT-FR-033 | no | LATER |
| DT-CAP-17 | Goal planner, affordability assistant, ledger explainer, unusual-transaction flagger | FR-027, 028; DT-FR-038, 039 | no | LATER |
| DT-CAP-18 | Tontine-to-Business pathways and handoff to VentureWorks/Education/financing | FR-019–022, 029 | no | LATER |
| DT-CAP-19 | Regulated schemes: partner-return, credit-linked, investment/dividend, matched savings | FR-008, 024; L-DT §3 | no | LATER (licensed partner only) |
| DT-CAP-20 | Consented contribution history shared with a bank/MFI | L-DT §11; Banking OD-B1 | no | LATER |
| DT-CAP-21 | Configurable platform fees and revenue share | FR-023, 025 | no | LATER (OD-DT-5) |
| DT-CAP-22 | Data export, consent withdrawal, deletion | DT-FR-041 | no | LATER |

## B3. Draft packages

| Package | Contents | Pilot? |
| --- | --- | --- |
| **Tontine Records** (per group or per association per month) | CAP-01 to 10. Money never passes through ADS. | **PILOT-MVP** |
| **Association Partner console** | CAP-11, plus provisioning | **PILOT-MVP** |
| Tontine Mobile Money | CAP-12; requires a named licensed provider in the contract | LATER |
| Cooperative Administration | CAP-14, 15 | LATER |
| Tontine Intelligence | CAP-13, 17 | LATER |
| Tontine-to-Business | CAP-18, 20 | LATER |
| Regulated Schemes | CAP-19, 21; only with a licensed partner and legal sign-off | LATER |

## B4. First pilot: association-management partner, record-only (recommended)

**Regulatory boundary.** The first thing to settle.
- Both BRSs say ADS is technology, "not an unlicensed deposit-taking institution" (L-DT §8; repo BRS §1, FR-017, FR-024).
- **Kit mocks** (PLAT-EXT-001): in test mode there is no money at all.
- **Live risk.** The live design would collect into a mobile-money merchant account held by whoever owns the provider credentials. That is the operator of Tontine: ADS, or the partner. The group's pot would then sit in that account between collection and payout. **That is holding customer money.** It is the situation the BRS forbids unless a licensed party holds the account.
- **The pilot therefore must not run live mobile money.** It should be either:
  - **(a) record-only (recommended):** members pay as they do today (cash at the meeting, or into the group's **own** account). The treasurer records each receipt, a second official or the member confirms it, and Tontine keeps the rules, ledger, statements, reminders and disputes. ADS holds no money, and neither does the partner.
  - **(b) test mode only:** a demonstration. Real people use mock money, and every screen says TEST MODE. This shows value but proves little.
- **Live mode later.** Only when a licensed provider (MoMo/Orange operator, bank or MFI) holds the collection account, in the group's name or as its regulated escrow/trust account, and pays out under its own licence. ADS stores references and statuses only. This is the same rule ADS Banking follows ("no local wallet, balance or ledger", banking-platforms `docs/requirements/README.md`).
- **Legal review needed** (gap 7) before any live money, and of the pilot wording:
  - how a record-keeping tontine tool is treated under the CEMAC/COBAC microfinance and payment-services rules;
  - the partner contract;
  - screen wording. Today the UI says "My confirmed savings / Mon épargne confirmée" and "Group pool / Caisse du groupe" (`src/app/i18n.ts`, lines 17, 71, 119, 173), which could be read as ADS holding savings.

  I am not giving legal advice. These points are for counsel.

**Pilot shape.**
- One partner that digitises associations (a workplace, church, women's or alumni association).
- 3–5 associations, one ADS organisation each, with one rotating group each and 10–40 members per group.
- One full cycle.
- Record-only money, SMS reminders, EN/FR.
- ADS bills the partner a subscription outside the app. **No fee on members' contributions** (OD-DT-5).

**What the partner needs to provision its customers (gap 1):**

| Need | Today | Build | Class |
| --- | --- | --- | --- |
| A partner organisation above its associations | Flat organisations | Kit organisation levels (foundation) | PILOT-MVP |
| The partner creates an association organisation within its entitlement (product, package, group/member caps) | ADS CLI only | Kit provisioning API and screen | PILOT-MVP |
| The partner invites the association's group_admin and treasurer; officers invite members **by phone** | Tontine's own SMS code; the invitee must already hold a role | DT-B-01 + kit K-02 (phone accounts and phone invitations) | PILOT-MVP |
| Partner staff support associations without money powers | `support_officer` reaches all groups in an organisation; full ledger access is only for treasurer/auditor/admin (`money.mjs`, `full`) | DT-B-09: confirm by test that the partner's support role cannot propose or approve payouts or see member ledgers beyond the summary | PILOT-MVP |
| Package limits (groups, members, SMS volume) | None | DT-B-07 | PILOT-MVP |
| Usage for billing (active groups/members) | None | DT-B-13 | PILOT-MVP |

**Pilot success checks:**
- One full rotating cycle is recorded with zero unexplained differences between the group's own cash book and the Tontine ledger.
- Every payout has two approvals.
- Members receive reminders and receipts in their language.
- Nobody outside the association sees its data.
- No screen suggests ADS or the partner holds money.

## B5. Integration contracts still to build

| Contract | State | What to build | Class |
| --- | --- | --- | --- |
| **Tontine → licensed money provider** (collection and disbursement) | Adapter interface in `src/server/adapters.mjs` (requestToPay, disburse, status, signed webhook). Kit mocks have no disbursement. | (1) Kit mock for disbursement to a beneficiary number (DT-B-08).<br>(2) A live adapter per chosen provider, in which **the collection account belongs to the group or to the licensed party** (DT-B-16).<br>(3) Daily statement import. | LATER (go-live gate) |
| **Tontine ↔ ADS Banking** | Banking keeps "cooperative/group banking" as BNK-FR-020, later, and says "tontine stays in digital-tontine" (banking README, line 92). Banking owns customer consent and loan packages to partner banks (OD-B1). Settlement/Ledger/Payments stay shared adapters (OD-B2). | A consented "contribution history package" from Tontine to Banking's partner-bank flow (for CAP-20 / Tontine-to-Business). **Not** a money path: money goes through the shared payments adapter to the licensed provider, not through Banking. | LATER |
| **Tontine → VentureWorks** | The VentureWorks BRS lists "Digital Tontine/financial-inclusion pathways" as an integration (v4.0 §12). `src/contracts/ecosystem.ts` has no `tontine` system. | (1) Publish the capability manifest and usage (with the VentureWorks plan).<br>(2) Later, a Tontine-to-Business handoff (savings goal, capital gap, consent) as an `EcosystemHandoff`. | Manifest PILOT-MVP; handoff LATER |
| Tontine → Education | Named in FR-021 | Readiness and training handoff | LATER |

## B6. Security follow-ups

**The portfolio-wide payment pattern is present in Tontine:**

| # | Finding (file) | Risk | Fix | Class |
| --- | --- | --- | --- | --- |
| S1 | **The amount check is conditional.** `applyContributionOutcome` compares amounts only `if (amount != null)` (`src/server/domain/services.mjs`, lines 127–133). A confirmation without an amount is accepted as Paid. | A provider message without an amount marks a due as paid | Require amount **and currency** on every SUCCESSFUL confirmation. Missing or different → reconciliation case, not Paid | PILOT-MVP (DT-B-03) |
| S2 | **The status-check path passes no amount at all.** `checkPending` calls `applyContributionOutcome(c, ctx, fresh, {status, reason})` (`money.mjs`, around lines 20–35) and does not compare the provider's `reference` with the contribution. | Same as S1, on the polling path | Pass amount, currency and reference from the status answer, and compare them | PILOT-MVP (DT-B-03) |
| S3 | **Payouts have no amount check.** `applyPayoutOutcome` (`services.mjs`, lines 186–216) marks the payout paid and posts the ledger with the *expected* amount whatever the provider reports. | A partial or wrong disbursement shows as fully paid | Compare the paid amount and currency with `payout_case.amount_minor`; a mismatch opens a case | PILOT-MVP (DT-B-03) |
| S4 | **Webhook and status checks run as the same role as user requests.** They run as `tontine_app`, the same role users' requests use, and that role has INSERT on `ledger_entry` / `ledger_transaction` and UPDATE on `contribution` / `payout_attempt` (migrations 007 and 008). Nothing at database level separates "provider confirmed" from "a user request". | A bug or injection in any user route could post money entries | Apply provider outcomes through a dedicated role or functions that only the webhook/worker login can execute, and remove direct money-state writes from the request role | LATER, but a **go-live gate** before live money (DT-B-05) |
| S5 | **No separate API login.** In production the API connects with `DATABASE_URL` and does `SET LOCAL ROLE tontine_app` per transaction (`src/server/db.mjs`). E2E risk 4 says the product connects as the database **owner**. | If any code path skipped `withTenant`, it would run with owner rights | Use a login role that is only a member of `tontine_app` (the Fleet Guard pattern) | PILOT-MVP (DT-B-04) |

The webhook itself is sound:
- HMAC signature over the raw body, 300 s tolerance, duplicate `event_id` acknowledged but not applied, an unmatched reference opens a case (`money.mjs`, `handleWebhook`).
- The tenant in the URL is not signed. Lookups are row-level-security scoped to that tenant, so a wrong tenant only creates an "unmatched" case, and only with a valid signature.

**SECURITY DEFINER:**
- `tontine_register_tenant()` inserts only the caller's own tenant, which is fine.
- `tontine_list_tenants()` returns every tenant ID to `tontine_app` (`009_support_and_leave.sql`, lines 55–63). Low risk, the same as Fleet Guard. Move it to the reminder job's own login. LATER.

---

# Part C: Gaps 1–7 for these two products

| Gap | Fleet Guard | Digital Tontine |
| --- | --- | --- |
| 1 Organisation levels | Each customer fleet = one ADS organisation (already how isolation works). Needs the partner level above, partner provisioning and the partner console (FG-B-02). | Each association = one organisation. Partner provisioning, **phone** invitations (K-02), partner support role without money powers (DT-B-09). |
| 2 Entitlements | Package = Essentials with an asset cap; Fleet Guard reads entitlements from the kit and blocks features beyond them (FG-B-03). The `partner` role is granted only through a partner entitlement. | Package = Records; caps on groups, members and SMS; scheme types allowed per package (rotating only in the pilot). Mobile-money features are blocked unless a licensed-provider entitlement exists (DT-B-07). |
| 3 Billing v1 | Per-asset monthly subscription billed by ADS to the partner, outside the app. Fleet Guard supplies metering (FG-B-07). Decision D5 changes from "no billing" to "billing via platform v1" (OD-FG-3). | Subscription per association, billed outside the app. **No percentage or fee on contributions** in the pilot (regulatory and trust reasons). Metering via DT-B-13. |
| 4 Public catalogue (Hub, later) | Publish Essentials + Partner console from the manifest above | Publish Records + Partner console. Wording must pass legal review first (gap 7). |
| 5 VentureWorks | Manifest and usage reporting, owned by the VentureWorks plan. Possible opportunities: "Fleet management reseller", "Maintenance network operator" (later). | Manifest; opportunity "Association digitisation partner". The Tontine-to-Business handoff comes later. |
| 6 Name check | Both repos cite handbook v1 (`AGENTS.md`); neither uses "Full-Stack Methodology v2". No change needed here. | Same |
| 7 Legal review | Low. Only if financing/insurance evidence (CAP-25) or settlement (CAP-22) is added. | **High.** Record-only pilot wording; the partner contract; the live custody model (who holds the collection account); KYC level per scheme; fees on contributions; regulated scheme types. Must be done before any live money and before the catalogue listing. |

---

# Part D: Finalization build register

Size: S = up to about 2 days, M = up to about 1 week, L = more than 1 week. These are my estimates from similar items already built in these repos, not measured.

### Shared kit items
Owned by the foundation plan, listed here so dependencies are clear.

| ID | Title | What it is | Depends on | Size | Acceptance check | Class |
| --- | --- | --- | --- | --- | --- | --- |
| K-01 | Organisation levels and partner provisioning | Partner organisation as parent; the partner admin creates customer organisations within its entitlement and invites their first admin | Foundation decisions | L | A partner creates a customer organisation and invites its owner; it cannot see another partner's customers; ADS sees all | PILOT-MVP |
| K-02 | Phone accounts and phone invitations | PLAT-ID-003: sign up and accept an invitation with a phone number and SMS code (no email needed) | K-01 | M | A member with no email accepts an SMS invitation and lands in the right organisation with role `member` | PILOT-MVP (Tontine) |
| K-03 | Cross-product token for contracts | Transport's server can call Fleet Guard on behalf of the operator (token exchange or an audience Fleet Guard accepts), with consent | — | M | Fleet Guard accepts a Transport-exchanged token for the same tenant only; refuses other tenants | LATER |
| K-04 | Entitlements in the token or API | The package and its limits per organisation and product | K-01 | M | The product reads the package; a call above a limit is refused | PILOT-MVP |
| K-05 | Billing v1 | Subscription invoices to partners from metering | K-04 | M | A monthly invoice per partner matches the metered usage | PILOT-MVP |
| K-06 | Disbursement mock | Mock transfer to a beneficiary number, with a signed webhook | — | S | Tontine payouts use it instead of the request-to-pay stand-in | LATER |

### Fleet Guard

| ID | Title | What it is | Depends on | Size | Acceptance check | Class |
| --- | --- | --- | --- | --- | --- | --- |
| FG-B-01 | Kit update and invitations through the kit | Update the pin to ≥ `c3d13ef`; Team invites and role changes go through `/admin/v1` (token exchange); remove the reload waits | Kit `c3d13ef` | M | FG-J-20 passes with the role arriving on acceptance; no manual `grant-role` in tests | PILOT-MVP |
| FG-B-02 | Partner console | Screens for the `partner` role: list managed customer fleets, read assets/alerts/work orders, open support cases; no admin rights | K-01 | M | Partner staff see their customers only, cannot invite or approve; a new Playwright journey passes EN desktop + FR 360 px | PILOT-MVP |
| FG-B-03 | Entitlement enforcement | Asset cap and package modules checked on the server | K-04 | S | The 51st asset on a 50-asset package is refused with a clear message | PILOT-MVP |
| FG-B-04 | Vehicle availability endpoint v1 | FG-FR-034, as in §A5, with a consent record | K-03 | M | Transport's contract tests pass against the live Fleet Guard endpoint; another tenant's vehicle returns 404 | OWNER-DECISION (recommend LATER) |
| FG-B-05 | Utilization and idle time | FR-009 rest; utilization tile on the dashboard | — | M | Utilization % per asset and jobsite matches hand calculation on test data | LATER |
| FG-B-06 | External workshop work orders | Send a work order to an outside garage organisation; quote, approval, evidence | K-01 | L | The garage sees only the work orders sent to it | LATER |
| FG-B-07 | Usage metering | Active assets per customer per month, for billing and VentureWorks | K-05 | S | The count equals the active assets in the database at month end | PILOT-MVP |
| FG-B-08 | Docs refresh | E2E_STATUS ("not merged"), journeys statuses, D5 wording | — | S | Docs match main | PILOT-MVP |
| FG-B-09 | Job role for the alert sweep | Separate login for the hourly job; revoke `fleet_tenants_for_jobs()` from the request role | — | S | The request role can no longer list tenants; alerts still fire | LATER |
| FG-B-10 | Staging deploy and CI evidence | Run verify and e2e in CI; deploy to the tester host | Hosting plan | M | CI green on main; staging URL works for testers | PILOT-MVP |
| FG-B-11 | Customer data export | CSV export of assets, documents, work orders, costs (FG-J-19) | — | M | The owner downloads their data; other tenants are excluded | LATER (before paid renewals) |

### Digital Tontine

| ID | Title | What it is | Depends on | Size | Acceptance check | Class |
| --- | --- | --- | --- | --- | --- | --- |
| DT-B-01 | Invite into the organisation through the kit | Kit phone invitation grants membership + `member`; Tontine keeps its rules/consent step after acceptance; update the kit pin | K-01, K-02 | M | A person outside the organisation joins a group from an SMS link with no operator action; DT-J01 passes | PILOT-MVP |
| DT-B-02 | Record-only contributions and payouts | Treasurer records a cash or own-account receipt with method and evidence; a second official or the member confirms; ledger marks it "recorded" (not "provider-confirmed"); payouts recorded the same way with maker-checker | — | M | One full rotating cycle can be run with mobile money switched off; the ledger is balanced; every record has two people | PILOT-MVP (if OD-DT-1 = a) |
| DT-B-03 | Payment confirmation checks | S1–S3: amount + currency + reference required and compared on webhook, status check and payout | — | S | Tests: missing amount → case; wrong currency → case; short payout → case; correct → Paid | PILOT-MVP |
| DT-B-04 | Separate API login role | `tontine_api` LOGIN, member of `tontine_app` only, not the owner | — | S | The API runs as `tontine_api`; the owner login is not used at runtime | PILOT-MVP |
| DT-B-05 | Provider outcomes isolated in the database | Only a dedicated webhook/worker role can mark money states and post provider ledger entries | DT-B-04 | M | The request role gets "permission denied" on these writes; webhook tests still pass | LATER (go-live gate) |
| DT-B-06 | Wording and custody disclosure | Replace "savings / épargne / pool / caisse" wording; show "Money is held by: <the group / licensed provider>" on balances and statements | Legal review (gap 7) | S | Legal reviewer signs off the EN/FR strings | PILOT-MVP |
| DT-B-07 | Entitlement enforcement | Group/member/SMS caps; allowed scheme types; mobile-money blocked without a licensed-provider entitlement | K-04 | S | Over-cap and disallowed actions refused with a clear message | PILOT-MVP |
| DT-B-08 | Disbursement adapter on the kit mock | Use K-06 instead of the stand-in | K-06 | S | DT-J04 passes using the transfer mock | LATER |
| DT-B-09 | Partner support role test | Prove `support_officer` (partner staff) cannot propose or approve payouts or read full ledgers | K-01 | S | API tests for each denied action pass and are audited | PILOT-MVP |
| DT-B-10 | Group-scoped officers | Treasurer/auditor limited to the groups they are assigned to | — | M | The treasurer of group A gets 404 on group B in the same organisation | OWNER-DECISION (OD-DT-4; LATER if one association = one organisation) |
| DT-B-11 | Docs refresh | Journeys statuses, E2E_STATUS "branch not merged", README decisions taken | — | S | Docs match main | PILOT-MVP |
| DT-B-12 | Accessibility checks in E2E | Add axe to every Playwright spec (as Fleet Guard does) | — | S | No serious/critical violation in EN desktop or FR 360 px | PILOT-MVP |
| DT-B-13 | Usage metering | Active associations, groups and members per month | K-05 | S | The count matches the database | PILOT-MVP |
| DT-B-14 | Switch RAG to the AI gateway client | `ai-gateway-client` with the Progress-shaped mock | Kit `8f23cf8` | S | DT-J07 passes on the new client | LATER |
| DT-B-15 | Step-up for money roles | MFA/`auth_time` from the kit for treasurer and approver | Kit MFA | M | Approving a payout asks for a fresh second factor | LATER |
| DT-B-16 | Live licensed-provider adapter | Provider chosen by you; the collection account is held by the group or licensed party; daily statement import | OD-DT-2, legal review | L | Sandbox certification with the provider; go-live record signed | LATER |
| DT-B-17 | Staging deploy and CI evidence | As FG-B-10 | Hosting plan | M | CI green; staging URL for testers in TEST MODE | PILOT-MVP |

**Smallest pilot set:**
- **Fleet Guard:** FG-B-01, 02, 03, 07, 08, 10.
- **Tontine:** DT-B-01, 02, 03, 04, 06, 07, 09, 11, 12, 13, 17.
- **Kit:** K-01, K-02, K-04, K-05.

---

# Part E: Decisions needed from the owner

| # | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| OD-FG-1 | Fleet Guard pilot partner type | (a) fleet-management reseller; (b) maintenance-network operator | **(a).** Uses what is built; (b) needs cross-company work orders (FG-B-06, L) |
| OD-FG-2 | Where the construction/heavy-equipment scope lives | (a) Fleet Guard owns machines, hours, operators, jobsite reference, maintenance, fuel and parts, and the construction platform owns projects/property; (b) all in the construction platform; (c) all in Fleet Guard | **(a).** Matches L-FG §7 and ADR 0001; the policy engine, fuel cards and procurement stay LATER in Fleet Guard |
| OD-FG-3 | Decision D5: billing | (a) no billing; (b) per-asset subscription via billing v1, invoiced outside the app | **(b).** Simple, no money moves in Fleet Guard |
| OD-FG-4 | When to build the Transport availability endpoint (FG-B-04) | (a) in the pilot set; (b) right after it | **(b),** unless the pilot customer also runs Transport. Transport already copes with "not checked" |
| OD-FG-5 | Decision D4: owner/investor settlement | (a) now; (b) later via shared Settlement | **(b)** |
| OD-DT-1 | Tontine pilot money mode | (a) record-only; (b) test-mode mocks only; (c) live mobile money | **(a).** Real value with no money held. (c) is not possible before a licensed provider and legal review |
| OD-DT-2 | Live custody model (for later) | (a) collection account in the group's/association's own name at a licensed provider; (b) licensed provider's regulated escrow/trust account; (c) an ADS or partner merchant account | **(a) or (b). Never (c).** (c) would mean ADS or the partner holds member money |
| OD-DT-3 | Scheme types in the pilot | rotating only; or rotating + goal + solidarity | **Rotating only.** Eligibility logic is rotating-turn today; add others after one clean cycle |
| OD-DT-4 | One association per organisation, or many groups per organisation | (a) one customer = one organisation; (b) cooperatives with many groups and group-scoped officers (DT-B-10) | **(a)** for the pilot; (b) LATER with the Cooperative package |
| OD-DT-5 | Fees on members' money | (a) none, subscription only; (b) a percentage per contribution | **(a).** A fee on contributions needs legal approval (FR-023) and partner agreement |
| OD-DT-6 | Open README decisions | 1 baseline; 3 ledger; 7 KYC level; 8 Tontine-to-Business; 10 duplicate code | 1: keep the BRS, bump to v1.1 in place. 3: keep the in-repo ledger for records. 7: no KYC in record-only mode, set by the licensed provider later. 8: keep Tontine-to-Business as LATER. 10: remove the duplicate code (S, LATER) |
| OD-DT-7 | Scope of the Tontine legal review (gap 7) | — | Before the pilot, review the record-only wording and the partner contract. Before live, review the custody model, the CEMAC/COBAC position, KYC thresholds and fees |

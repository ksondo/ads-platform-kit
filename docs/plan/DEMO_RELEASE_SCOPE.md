# Demo release scope for the five pilot platforms (planning, 20 Oct 2026)

Owner direction (20 Oct 2026, 02:57):
- Build the **demo environment** first. A lot must work there.
- **Complete most of the unbuilt work on the five pilot platforms.**
- Agree the scope, then build **one platform at a time**.

The order: Commerce, VentureWorks and Education first, then Fleet Guard and Tontine.

**Approach:** one code base per platform, deployed to a separate demo environment with sample data and demo accounts. The demo user is shown on screen with an autofill button; the second demo user and the demo admin are shared by the owner. No repos are copied. Evidence and full item details are in the plan documents in this folder.

**The scope rule for the demo:**
- **Build now:** everything that does not need a real partner, real money, a licence or a lawyer.
- **Test mode:** everything that needs one of those is built against the test-mode stand-ins, and labelled "Test mode".
- **Out of scope:** only items that need a legal or commercial decision first.

## 0. The demo environment itself (needed before any platform is shown)

| ID | Item | Size |
| --- | --- | --- |
| DE-01 | **Security first:** close the self-escalation route in the kit, remove the Software Factory test password, and check that ADS-only staff roles count only in ADS staff organisations (6 products) | M |
| DE-02 | **Demo sign-in instance:** the kit's sign-in on its own server and database, test-mode partners (payments, SMS, bank, KYC, AI) and the AI gateway | M |
| DE-03 | **Demo accounts:** demo user, second demo user and demo admin. Created at deploy, password kept as a server secret, shown from settings on the demo sign-in with "Use demo account". A safety switch refuses them on any non-demo environment | M |
| DE-04 | **Demo organisations and sample data:** one demo organisation per product, plus ADS staff and partner organisations; demo accounts hold every role there. Sample data loads, and resets nightly | M |
| DE-05 | **Containers and deploy workflows:** for the 5 pilot platforms first, then the other ~20 (preflight → backup → migrate → restart → smoke test) | L |
| DE-06 | **Landing page** (approved mock-up) on the Hub: tiles from one list, EN/FR, one sign-in | M |
| DE-07 | **Shared foundation**, needed for the "partner" features below to show in the demo: organisation levels ADS → partner → customer, entitlements and packages, provisioning, billing v1 (test mode), phone sign-up and invitations, and the portfolio payment rule (separate DB roles for webhooks and workers, amount and currency checks) | L (several items, in `PLATFORM_FOUNDATION_PLAN.md`) |

## 1. Commerce (build first)

**Built:** 15 journeys. Shopper discovery, orders and tracking; merchant storefront, review and publication, goods receiving; cash POS with offline sales and manager approval; cash batches and bank collection with reconciliation; profile, notifications and help.

| # | Not built yet | In demo scope? | Note |
| --- | --- | --- | --- |
| C1 | Entitlements, packages, menus from entitlements (CE-01–03) | **Yes** | Replaces the hard-coded menus |
| C2 | Partner sets up its own merchants, plus a partner dashboard (CE-04, 05) | **Yes** | Pilot A |
| C3 | Staff invitations through the ADS sign-in (CE-06) | **Yes** | |
| C4 | Separate payment and worker DB roles, retire the old cash-pickup route, security headers (CE-08–10) | **Yes** | Security |
| C5 | Digital payments: MTN MoMo, Orange Money, card (CE-13) | **Yes, test mode** | Under the payment rule |
| C6 | Storefront branding and own shop link (CE-11) | **Yes** | Pilot C |
| C7 | Partner marketplace page (CE-12) | **Yes** | Pilot B |
| C8 | Category packs: supermarket, restaurant, hardware, clothing, bakery, wholesale, online-only, multi-branch group, inventory (CE-15) | **Yes, in priority order:** supermarket, restaurant, wholesale, then the rest | Pharmacy waits for legal review |
| C9 | Branch group reporting | **Yes** | |
| C10 | Accountant, auditor and bank portfolios (CE-16, part) | **Yes** | Regulator view later |
| C11 | ERP extension: shifts, purchase orders, transfers, lots and serials (37 stories, CE-16) | **Partly:** shifts and purchase orders | Rest later |
| C12 | Full offline POS and installable app (PWA) | **Yes** | |
| C13 | Courier delivery with Logistics | **Yes, through the Logistics contract** | Logistics is merged |
| C14 | Disputes, saved items and reorder, data export and deletion, meeting-point handover | **Yes** | |
| C15 | Merchant guidance through the AI gateway | **Yes, test mode** | |
| C16 | Counter-sale endpoint for Tourism (CE-14) | **Yes** | Tourism already has the mock |
| C17 | Pharmacy pack; BNPL (Pilot D) | **No:** legal review first | |

## 2. VentureWorks

**Built:** about 73% of its journeys: evidence verification, business planning, KPIs, financial monitoring, investor checks, assessments.

| # | Not built yet | In demo scope? |
| --- | --- | --- |
| V1 | Privacy fix: people list and venture team membership (VW-B03) | **Yes, first** |
| V2 | Opportunity registry and platform link, multi-operator and exclusivity (VW-B01, B02, B05) | **Yes** |
| V3 | Partner applications, screening, due diligence (VW-B04) | **Yes** |
| V4 | Fee schedule, offer, agreement signing, onboarding-fee payment in test mode (VW-B06–B08) | **Yes, test values and test mode** |
| V5 | Venture from opportunity; plan and KPI templates; three financial scenarios; the KPI status model (VW-B09–B12) | **Yes** |
| V6 | Regulatory check per requirement, "applicability established" (VW-B13) | **Yes** |
| V7 | Provisioning request to the sector platform; platform report intake; portfolio view (VW-B14–B17) | **Yes** |
| V8 | Real role grants through the ADS sign-in (VW-B18) | **Yes** |
| V9 | Public catalogue API for the Hub (VW-L01) | **Yes** (the Hub page comes later) |
| V10 | AI drafts through the gateway: business plans, regulatory checklists, risk (VW-L03, L04) | **Yes, test mode, drafts only** |
| V11 | Investor and bank access controls, access log visible to founders (VW-L05) | **Yes** |
| V12 | Talent matching and profiles; command-centre metrics; ADS as Venture #001; closure, export and deletion (VW-L06, L07, L10, L11) | **Yes** |
| V13 | E-signature provider (VW-L08) | **Test-mode stand-in** |
| V14 | Pilot A acceptance test across VentureWorks and Commerce (VW-B19) | **Yes** |

## 3. Education

**Built:** 19 journeys. Admissions, enrolment, classes, attendance, assessment, report cards, parents, staff.

| # | Not built yet | In demo scope? |
| --- | --- | --- |
| E1 | **Role grants that actually take effect** (ED-02) | **Yes, first** |
| E2 | Entitlements per school; schools under a partner; partner dashboard; help routing (ED-03, 04, 07, 08) | **Yes** |
| E3 | Promotion rule as a setting; minors' data export and deletion; worker DB role; security headers (ED-05, 06, 09, 10) | **Yes** |
| E4 | School finance journeys (ED-11) and fee payments by mobile money in test mode (ED-12) | **Yes** |
| E5 | Learning delivery (course reader, lessons, notes) and exam preparation | **Yes** |
| E6 | Tutoring centre, online academy and training-centre packages (cohorts, sessions, credentials) (ED-13) | **Yes** |
| E7 | AI tutor and assistants through the gateway | **Yes, test mode** |
| E8 | Career Path referral (consented) | **Yes** (Career Path is merged) |

## 4. Fleet Guard

**Built:** 12 journeys (about 52–58% of the BRS). Assets, inspections and work orders, breakdowns, preventive maintenance, dashboard, team.

| # | Not built yet | In demo scope? |
| --- | --- | --- |
| F1 | Kit update; invitations through the ADS sign-in; entitlements; usage metering; partner and reseller console (FG-B-01, 02, 03, 07) | **Yes** |
| F2 | Vehicle-availability endpoint for Transport (FG-B-04) | **Yes** (Transport already uses its mock) |
| F3 | Utilization and idle time; external workshop work orders (FG-B-05, 06) | **Yes** |
| F4 | Policy rules (repair thresholds, fuel limits, approval levels); fuel authorization and anomaly review; spare-parts procurement; asset economics | **Yes** |
| F5 | Telemetry, GPS and live map | **Yes, with simulated feeds** |
| F6 | Technical knowledge and three assistants through the gateway; predictive maintenance support | **Yes, test mode** |
| F7 | Rental and lease operations; customer data export | **Yes** |
| F8 | Owner and investor payout split; asset-backed financing evidence to regulated partners | **No** for now (decision D4; licensed partner) |

## 5. Digital Tontine

**Built:** 15 journeys (about 61–68% of the BRS). Groups, schemes, contributions and payouts with maker-checker, statements, disputes, auditor.

| # | Not built yet | In demo scope? |
| --- | --- | --- |
| T1 | **Record-only contributions and payouts**, payment checks, separate DB login, custody wording (DT-B-02, 03, 04, 06) | **Yes, first** |
| T2 | Invitations through the ADS sign-in (phone and SMS); entitlements; partner and association console; usage metering (DT-B-01, 07, 09, 13) | **Yes** (needs phone sign-up in the kit) |
| T3 | Group-scoped officers; cooperative administration (many groups, consolidated reports) (DT-B-10) | **Yes** |
| T4 | Group dissolution and final settlement; data export, consent withdrawal and deletion | **Yes** |
| T5 | Goal planner, affordability assistant, ledger explainer, unusual-transaction flagger; guidance agent on the gateway (DT-B-14) | **Yes, test mode, explain-only** |
| T6 | USSD channel for feature phones | **Yes, test mode** (USSD gateway mock) |
| T7 | Tontine-to-business pathways to VentureWorks and Education | **Yes** |
| T8 | Mobile-money collection and payout through a licensed provider; regulated schemes (credit-linked, investment, matched savings); sharing contribution history with a bank | **No:** licensed partner and legal review first |

## 6. Proposed build order (one platform at a time, as asked)

1. **DE-01 to DE-04:** security, demo sign-in, demo accounts, demo organisations. This is needed for anything to be shown.
2. **DE-07, foundation part 1:** organisation levels, entitlements and packages, provisioning. Commerce and VentureWorks need these first.
3. **Commerce:** C1–C4 (foundation wiring and security), then C5–C16 in the order listed.
4. **VentureWorks:** V1 first, then V2–V14.
5. **Education:** E1 first, then E2–E8.
6. **DE-07, foundation part 2:** billing v1, phone sign-up and invitations. Tontine and the fee flows need these.
7. **Fleet Guard:** F1–F7.
8. **Tontine:** T1–T7.
9. **DE-05 and DE-06:** host each platform in the demo environment as soon as it is ready, with the other ~20 platforms at their present state, plus the landing page.

Every item follows the usual rules: real tests (API, database, and browser in EN and FR), an independent review before merging, and honest "Test mode" labels.

## 7. Decisions for the owner before building starts

1. **Scope:** approve the "In demo scope" column. Change any row you want earlier, later or out.
2. **Commerce category packs:** confirm the priority (supermarket, restaurant, wholesale first).
3. **Build order:** confirm it (security and demo accounts, foundation, Commerce, VentureWorks, Education, Fleet Guard, Tontine).
4. **Parallel building:** one platform at a time, or two at once within the usage limits? Recommendation: one platform plus one foundation track at a time.

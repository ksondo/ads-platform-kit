# Fit-for-purpose audit: Banking

Round 17, 23 Oct 2026. Briefs: `audit/BRIEF17-audit-and-fix.md`, `BRIEF15-fit-for-purpose.md` (with step 7) and `BRIEF16-demo-journeys.md`. Part 1 (this report) describes what we found on `main`. Part 2 (small fixes for demo users) is in the product PR listed at the end; nothing here is merged.

**Owner's question:** can the person who came here get the outcome they came for?

**Verdict: Yes, with gaps.** A small trader can find the partner banks and their loan products, give and revoke consent, get an explainable credit score, contest a factor, prepare a loan package, send it to the bank and see the bank's decision and who opened the package. A bank officer can open the consented package (and the opening is logged). ADS operations can register partner banks and publish products, and review score corrections. Diaspora send-money and airtime hand-offs work to "paid out" / "delivered". All of it worked for real in English and French, on phone, tablet and desktop, against the API and PostgreSQL, with the demo accounts and the merged demo seed.

The gaps:
- **Products cannot be compared.** No interest rate, fees, total cost or repayment amount anywhere; only an amount range, a term range and the bank's criteria in words. A loan marketplace user expects to compare cost first.
- **The officer cannot decide in the workspace.** The decision arrives from the bank's own system (mock: approves about 2 s after sending). There is no approve / decline / request-information action, no notes, no filter, sort or assignment in the officer list. By design ADS is not the lender, but an officer workflow product is expected to record the officer's step.
- **Nothing after the decision:** no answer to "more information" (no document upload), no offer acceptance, contract, disbursement or repayment schedule (Funding engine is later, BNK-FR-024), no SMS/e-mail when the decision comes.
- **Demo rules:** the phone menu covers the language switch; a German/other browser gets English, not French. (Fixed in the PR.)

## Set-up and commits tested

| Item | Value |
| --- | --- |
| Product | `ksondo/Banking-platforms` `origin/main` `53d0e68` (demo seed PR #1 merged) |
| Kit | `ksondo/ads-platform-kit` `main` `d28b6ac`. Real identity service in demo mode (`ADS_ENV=demo`, `DEMO_MODE=1`, `DEMO_SHOW_CREDENTIALS=1`) started with `ads-e2e up` + kit mocks; client entry from `config/clients.demo.json` (banking only, local redirect) applied with `apply-clients.mjs`, then `demo-bootstrap` and `demo-orgs`. |
| Data | `src/server/migrate.mjs`, then `scripts/demo-seed.mjs` (demo partner bank DEMO1 bound to the demo organisation, 4 fictitious catalogue banks, 6 EN/FR products). PostgreSQL 16, throwaway DBs `g5_bank_identity`, `g5_bank_app`; API as a restricted login (member of `bank_app`, no BYPASSRLS). `BANKING_OPERATOR_TENANT_IDS` = demo main tenant (as on the demo host). Product mocks (`mocks/server.mjs`: partner bank, Commerce evidence, remittance, airtime, AI Gateway facade) on their defaults. |
| Accounts | `demo.user` (shown on the sign-in page, "Use demo account"), `demo.checker` (same roles, password not shown), `demo.admin` (owner-shared; `banking_admin` in the operator organisation). The demo organisation holds `banking_customer` + `bank_officer`; it is also the demo partner bank. |
| Ports | identity 32480, kit mocks 32481, Banking 32482, Banking mocks 32483, PostgreSQL 32499 |
| Browser | Playwright Chromium, from the front door through the product's **Sign in** and the kit sign-in page. 360×740 (touch), 768×1024 and 1280×860, EN and FR. |

## 1. Purpose and users

**Purpose:** a small business owner in Cameroon comes to get a loan from a licensed partner bank using their own sales record as evidence, under their control; they leave with a decision from the bank. Bank officers come to receive complete, consented packages. Diaspora senders come to send money or airtime home through licensed providers.

| User | Comes to |
| --- | --- |
| Customer (`banking_customer`) | See banks and products, give/revoke consent, get and understand a score, apply, follow the decision; send money / airtime |
| Bank officer (`bank_officer`, in a partner bank organisation) | Receive packages, open them (audited) |
| ADS banking operations (`banking_admin` in the operator organisation) | Register partner banks (licence check), publish products, review score corrections |
| Diaspora sender (`banking_customer`) | Verify identity, add a recipient, get a quote, hand off to the licensed provider; top up airtime |

## 2. Market standard checklist

Yardsticks: a **digital loan marketplace** (e.g. Kiva Borrower / LendingTree-type comparison, Branch / Jumo-type mobile loan apps: compare offers, apply, decision, accept, repay) and a **bank officer's loan-origination workspace** (e.g. nCino / Temenos Infinity: queue, package, decision, conditions, notes).

| # | Expectation | Score | What happened |
| --- | --- | --- | --- |
| 1 | Browse lenders and their loan products (amount, term, criteria) | **Works** | 5 seeded banks, each with products, licence status ("active, test registry") and plain criteria, EN/FR (`d-03-banks`). |
| 2 | Compare products: rate/APR, fees, total cost, monthly repayment | **Missing** | Products carry only min/max amount, min/max term and criteria text. Nothing to compare cost. |
| 3 | Eligibility pre-check / filter by need | **Missing** | No filter by amount, purpose or bank type; the apply form lists every product (12 after the walk) and validates the range only after "Review the package". |
| 4 | Consent to share data: who, what, why, until, how to stop; revoke | **Works** | Consent card lists the five facts; "Consent given until 21 Jan 2027"; revoke asks for confirmation (`d-04-consent`). |
| 5 | Credit score with factors and how to improve | **Works** | 620 "Fair", five factors with value, points bar and "Reach 50 sales for 150 points"; "not a loan decision" notice (`d-05-score`, `m-05-score`). |
| 6 | Plain-language explanation and dispute | **Works with friction** | AI explanation with sources and "Test sources" (`d-06-ai`); contest a factor → "Correction request sent". **Friction:** the outcome of the review shows only on the score page; no notification. |
| 7 | Application form with validation | **Works with friction** | Clear field errors ("Outside this product's amount range"). **Friction:** business name and phone are not prefilled; products of banks without consent are offered and then blocked by a warning; the registry accepts duplicate product names (the walk created 4× "Demo audit loan"). |
| 8 | Review exactly what is sent before sending | **Works** | Package review lists amount, term, purpose, business, phone, score, evidence values, consent end (`d-08-apply-review`). |
| 9 | Submission reference and status tracking | **Works** | Reference `BNK-APP-…`, timeline, auto-refresh until a final status. |
| 10 | Lender decision with reason | **Works** | "Decision by ADS Demo Partner Bank (test): Approved by the bank — Approved by the partner credit committee (test)" (`d-09-decision`). The reason text is the bank's own words (English in FR mode, `tf-09-decision`). |
| 11 | Notification (SMS/e-mail) when the decision comes | **Missing** | Only visible in the app. |
| 12 | Answer "more information" / upload documents | **Missing** | `MORE_INFO` is shown with the bank's reason, but the customer cannot reply or attach anything. |
| 13 | Accept offer, contract, disbursement, repayment schedule | **Missing** | Out of the MVP (Funding engine, BNK-FR-024). ADS is not the lender, but a marketplace user expects the hand-off. |
| 14 | Officer queue: filter, sort, search, assign | **Works with friction** | List of received packages, newest first, with band and amount (`d-10-officer-list`); no filter, search, status tabs or assignment. |
| 15 | Officer opens the full package; access is audited | **Works** | Applicant, request, score factors, consent end; "This view is recorded" (`d-11-officer-package`). |
| 16 | Officer records a decision / conditions / notes | **Missing** | No action in the workspace; the decision comes from the bank core system (webhook). |
| 17 | Customer sees who opened the package | **Works** | "Officer …a0ed35 of ADS Demo Partner Bank (test), 23 Oct 2026 11:24". The officer is shown as a cut id. |
| 18 | Operations: register a lender (licence check), publish products | **Works with friction** | Licence checked against the (mock) registry; product published (`d-16-ops-partners`). **Friction:** the partner bank's organisation must be typed as a raw ADS organisation id; no screen to edit, retire or suspend a product or bank. |
| 19 | Send money: identity check, recipient, quote (rate, fee, receive amount), hand-off, status | **Works** | KYC "Identity verified", recipient with consent tick, quote from "Licensed Remittance Partner (test)", payment instruction `PAY-…`, "Paid out by the provider" (`d-13-quote`, `d-14-paid-out`). |
| 20 | Airtime top-up | **Works** | Range check, then "Delivered by the provider" (`d-15-airtime`). |

**Score counts (20 items): 10 Works end to end, 4 Works with friction, 0 Broken, 6 Missing.**

## 3. The walks

### Customer and officer (`demo.user` via "Use demo account"; desktop 1280 EN, phone 360 FR, tablet 768 EN and FR)

| Step | Result | Screenshot |
| --- | --- | --- |
| Front door → Sign in → kit demo page (password masked here) → Use demo account | Lands on Banks and consent | `d-01-landing`, `d-02-kit-signin`, `m-01-landing` |
| Banks list: 5 banks with products | OK, no sideways scroll | `d-03-banks`, `m-03-banks`, `t-03-banks` |
| Give consent to DEMO1 | "Consent given until …" | `d-04-consent` |
| Calculate score; AI explanation | 620 Fair; sourced explanation | `d-05-score`, `d-06-ai`, `m-05-score` |
| Contest a factor | "Correction request sent" | — |
| Apply (Market trader working capital, 120–180 k XAF, 6 months) → review → send | Package review, then application page | `m-07-apply-form`, `d-08-apply-review`, `t-08-apply-review` |
| Partner decision | Approved with reason (about 2 s, mock) | `d-09-decision`, `m-09-decision`, `t-09-decision`, `tf-09-decision` |
| Applications received (officer) → open package | Package with "This view is recorded" | `d-10-officer-list`, `d-11-officer-package`, `m-11-officer-package`, `tf-11-officer-package` |
| Customer: application → access log | Officer view listed | — |
| Send money: KYC, recipient, quote 150 EUR, confirm | "Paid out by the provider" | `d-13-quote`, `d-14-paid-out`, `m-14-paid-out` |
| Airtime 2,000 XAF Orange | "Delivered by the provider" | `d-15-airtime` |

All four sizes/languages passed every step (20/20 each); one tablet run first failed on a selection race in the walk script, not in the product, and passed on re-run.

### ADS banking operations (`demo.admin`, owner-shared, typed)

| Step | Result | Screenshot |
| --- | --- | --- |
| Sign in → lands on Partner banks | 5 seeded partners | `d-16-ops-partners` |
| Add a product to DEMO1 | "Product published." | — |
| Score corrections → uphold the customer's request with a note | "Review recorded." | `d-17-corrections` |

## 4. Owner rules: EN/FR and three sizes

Sweep of the 7 customer/officer pages at 360/768/1280 in EN and FR (42 page checks + menu + sign-in checks):

| Rule | Result |
| --- | --- |
| Styles load on all sizes | **Pass** |
| Whole page changes language | **Pass** for every UI string. Server/partner texts stay as the partner wrote them (bank decision reason in English). FR grammar: "Décision de ADS Demo Partner Bank" (should be "d'ADS"). |
| No horizontal scroll | **Pass** on every page at every size |
| Language kept through sign-in | **Pass**: the page sends `ui_locales`, and Banking keeps no per-account language |
| Switch visible | **Pass** in the top bar. **Fail inside the phone menu**: the drawer covers the top bar (`s-360-fr-menu-open`, `s-360-en-menu-open`). |
| First visit with a `de-DE` browser gives French | **Fail**: English |
| Tablet/desktop sidebar | **Fail (small):** from 768 px the first sidebar line ("Signed in as Demo User") is hidden under the top bar (the drawer's `bottom:0` made the sticky sidebar slide up 33 px; `s-768-en-_apply`). |

## 5. User-experience pass

- **First impression:** one clear promise ("Share your sales record with a partner bank, on your terms…"), one Sign in, the TEST MODE banner and the "ADS is not a bank" note on every page. Good.
- **Next step is clear:** the score page says how to raise each factor; the apply page says what is missing ("You need a consent and a score first") with links. Good.
- **Empty states and errors:** plain language everywhere checked; no raw codes on screen.
- **Mobile:** score factors become stacked cards at 360 px; forms are one column; 44 px targets.
- **Speed:** API calls are fast locally; the partner decision takes about 2 s with the mock.
- **What would make a tester give up:** (1) nothing to compare between products (no cost); (2) after "approved" nothing happens; (3) on a phone the language cannot be changed while the menu is open; (4) a tester who wants to play the bank officer or ADS operations has no account shown on the sign-in page (only the demo user is shown; the officer view works with the same account, operations needs the owner-shared admin).

## 6. Demo completability (BRIEF16)

Built journeys (`docs/delivery/E2E_STATUS.md`): BNK-J-01 … J-08 (8).

| Journey | Before (main + demo seed) | After (PR) |
| --- | --- | --- |
| J-01 sign in / out | Yes; phone menu hides the switch, `de-DE` → English | Yes; switch in the phone menu, French default |
| J-02 partner registry + product | Owner-shared demo admin only | Same; proven by the suite (operations persona → falls back to demo admin until the kit offers it) |
| J-03 consent give/revoke | Yes | Yes |
| J-04 score, AI, contest, operations review | Customer yes; the review needs the owner-shared admin | Same; two personas in the suite |
| J-05 apply + partner decision | Yes (DEMO1 seeded, mock decides) | Yes |
| J-06 officer opens package | Yes, but only as the same demo account (no separate officer persona on the page) | Suite uses a second persona (`officer` → `demo.checker` until the kit persona picker) |
| J-07 send money | Yes | Yes |
| J-08 airtime | Yes | Yes |

**Completable by a tester from the sign-in page alone: 6 of 8 before → 6 of 8 after; 8 of 8 with the owner-shared admin, and with the kit operations/officer personas.** What is missing for 8/8 by any tester: the kit persona picker must offer `operations` (banking_admin in the operator organisation) and `officer` (bank_officer in the partner bank organisation) — `build/demo-personas-20261023`. The seed already reads `products.banking.personas.operations.sub` and, if the kit makes a separate `bank` demo organisation, binds DEMO1 to it. Nightly reset: proven by the suite (kit `demo-reset` + `demo-seed --reset`, then the desktop journeys again).

## 7. Verdict and the fixes that most change it

**Can it perform its duty? Yes, with gaps.** It does the consent-first part of a loan marketplace well (banks, consent, explainable score, package, decision, access log) and the diaspora hand-offs. It does not let a borrower compare cost, answer a bank's question or continue after approval, and the officer cannot act in the workspace.

| # | Fix | Size | Plan item |
| --- | --- | --- | --- |
| 1 | Product cost fields (rate/APR, fees, example repayment) shown and comparable; filter products by amount/purpose; prefill business and phone | M | BNK-FR products (registry), UX |
| 2 | Officer actions in the workspace: request information, record the bank's decision/conditions, notes; list filters and search | M | BNK-FR-018 area, officer workspace |
| 3 | "More information" loop: customer answers and uploads documents; decision notification by SMS/e-mail | M | BNK-J-05 follow-up; PLAT-NOT-001 |
| 4 | After approval: offer acceptance and hand-off to the Funding engine (disbursement, schedule) | L | BNK-FR-024, OD-4 (shared engine home) |
| 5 | Demo: kit personas `customer`, `officer` (partner bank org), `operations` (operator org) shown on the sign-in page | S (kit) | `build/demo-personas-20261023` |

Small items noted: officer shown as a cut id; duplicate product names allowed; no edit/retire product screen; partner organisation typed as a raw id; "de ADS" in French.

## 8. Part 2 — fixes made for demo users (PR, not merged)

| Fix | Where |
| --- | --- |
| French is the default for every browser language except English | `src/App.tsx` `initialLang` |
| Language switch inside the phone menu (`lang-toggle-drawer`) | `src/App.tsx`, `src/styles.css` |
| Sidebar no longer slides under the top bar from 768 px (`bottom:auto`) | `src/styles.css` |
| Seed reads demo persona subs (`personas.operations.sub`, fallback `DEMO_ADMIN_SUB`) and a separate `bank` demo organisation when the kit makes one; test added | `scripts/demo-seed.mjs`, `tests/demo-seed.test.mjs` |
| `e2e-serve` keeps a given `BANKING_OPERATOR_TENANT_IDS` (demo organisation) | `scripts/e2e-serve.mjs` |
| Demo-journeys suite: all 8 journeys through the real kit sign-in page in demo mode, personas with fallback, desktop EN + phone FR, main journey (apply → decision → officer) also tablet EN/FR; language rules; nightly reset then desktop again; hosted smoke with `DEMO_BASE_URL` | `e2e/demo-journeys/`, `playwright.demo.config.mjs`, `scripts/demo-journeys.mjs`, `.github/workflows/demo-journeys.yml` |

PR: `ksondo/Banking-platforms` #2 (`build/demo-journeys-20261023`). The first CI run of the demo-journeys workflow on the PR passed (all journeys, all projects, and again after the reset).

## 9. Method notes and limits

- Partner bank, Commerce evidence, remittance, airtime and AI are the product's TEST MODE mocks; KYC and the licence registry are kit mocks. No real bank, money or identity check.
- The walk scripts and the sweep ran from a private scratch folder against throwaway databases and are not committed; the committed proof is `e2e/demo-journeys/`.
- Screenshots are compressed to 128 colours; demo passwords are masked. `d-` desktop EN, `m-` phone FR, `t-` tablet EN, `tf-` tablet FR, `s-<width>-<lang>-` the sweep.

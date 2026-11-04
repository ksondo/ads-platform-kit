# Fit-for-purpose audit: AfriCover (micro-insurance)

Round 17, 23 Oct 2026. Briefs: `audit/BRIEF15-fit-for-purpose.md` (with step 7), `audit/BRIEF16-demo-journeys.md`, `audit/BRIEF17-audit-and-fix.md`.
Part 1 (this report) describes what we found on `origin/main`. Part 2 fixed only small items that stopped a demo tester; those
fixes are in the product pull request named at the end, **not merged** (an independent reviewer merges).

**Owner's question:** can the person who came here get the outcome they came for?

**Verdict: Yes, with gaps.** A smallholder can find a crop cover, see who carries the risk and what is excluded, apply, get a quote
checked by two insurer staff, pay by MTN MoMo or Orange Money (a failed payment can be retried), and leave with an active policy, a
PDF certificate in English or French and a share link. They can cancel in the cooling-off period and are refunded, complain and
appeal, link their farm from ADS Agriculture and follow a weather event. The insurer and ADS sides (product approval, underwriting,
trigger review, complaints desk, enquiry hand-off, audit) all work with real roles and maker-checker rules.

The gaps:
- **Nobody can be paid out.** A confirmed weather event ends at "Payout pending": the shared payout service and a kit payout mock do not exist.
- **No ordinary claim.** Only parametric (weather) triggers; a customer cannot report a loss (later epic EP-CLAIMS).
- **On the demo, a weather event never happens.** ADS Agriculture sends no observations yet, so the trigger, review and payout screens stay empty (fixed for the demo by seeding one event, see Part 2).
- **Four of the six demo covers could not be applied for**, and the region filter could not find them (seed stored English region names). Fixed in Part 2.
- **A French tester saw English after signing in**, because the shared demo account had English saved. Fixed in Part 2.
- **The shared demo accounts hold every insurer role**, so the customer is also the underwriter, the complaint officer and the support officer: the complainant is assigned their own complaint and can decide their own appeal, and the help page shows the support queue instead of the customer's own questions. Needs the kit demo personas (in progress on the kit).

## Set-up and commits tested

| Item | Value |
| --- | --- |
| Product | `ksondo/Africover-Insurance-project`, `origin/main` `6a4ec3e` (demo seed PR #7 merged) |
| Kit | `ksondo/ads-platform-kit` main `d28b6ac`. Real identity service in demo mode (`ADS_ENV=demo`, `DEMO_MODE=1`, `DEMO_SHOW_CREDENTIALS=1`) through `ads-e2e up`, kit mocks (MoMo/Orange, SMS, email, insurer). AfriCover and Agriculture entries of `config/clients.demo.json` with local return addresses, then `apply-clients`, `demo-bootstrap`, `demo-orgs`. |
| Data | `src/migrate.mjs`, then `scripts/demo-seed.mjs` (operator row, demo insurer, 6 covers, 6 applications, 2 policies). Private PostgreSQL 16 cluster, throwaway databases `g7_*`. |
| Agriculture | The real ADS Agriculture (`origin/main` `8f232de`) ran next to it with its demo seed, with `COVER_AGRICULTURE_URL` and the shared partner secret set, so the farm link was walked across both products. |
| Accounts | `demo.user` and `demo.checker` (every customer and insurer role in "ADS Demo – Insurer", plus `interest_reviewer` and `platform_admin` in "ADS Staff – AfriCover operator"), `demo.admin` (`insurer_admin`). |
| Browser | Playwright Chromium. Journeys start at `/` and go through AfriCover's **Sign in** button and the kit page ("Use demo account" for the demo user). 360 × 740, 768 × 1024, 1280 × 860, EN and FR. |
| Note | The machine was heavily loaded by other agents during the round, so some screens took seconds to appear; speed is not judged here. |

## 1. Purpose and users

**Purpose:** a farmer (and later other micro-insurance customers) comes to get affordable cover from a licensed insurer that pays out
automatically when the weather fails, and leaves with an active policy, a certificate and, after a bad season, a payout.

| User | Comes to |
| --- | --- |
| Customer / policyholder (`insurance_customer`) | Compare covers, apply, pay by mobile money, get the certificate, link the farm, follow payouts, complain |
| Insurer staff (`product_manager`, `underwriter`, `underwriting_approver`, `trigger_officer`, `claims_approver`, `complaint_officer`, `support_officer`, `auditor`) | Publish covers, quote and approve, review weather events, decide complaints, answer questions, audit |
| Insurer admin (`insurer_admin`) | Register the insurer with its licence, see staff and the audit trail |
| ADS operator (`platform_admin`, `interest_reviewer`) | Approve insurers and cover versions, hand enquiries to an insurer |

## 2. Market standard checklist

Yardsticks: **Pula / ACRE Africa** (index-based crop insurance sold with mobile money and paid by weather data) and **BIMA / Turaco**
(mobile micro-insurance: simple enrolment, mobile premium, SMS confirmation, claims and complaints by phone).

| # | Expectation | Score | What happened |
| --- | --- | --- | --- |
| 1 | Browse and compare covers: insurer, licence, exclusions, premium | **Works with friction** | Six demo covers with "Simulation — no real cover", insurer and CIMA licence, exclusions and indicative premium; comparing two gives a clear table (`d-cust-05-compare`). **Friction:** the region filter found nothing for Est, Extrême-Nord, Ouest or Nord (`d-cust-04-filter-est-empty`): the seed stored the covers' regions in English ("East") while AfriCover's regions are French labels. *Fixed in Part 2.* |
| 2 | Plain-language product page (cover, trigger, exclusions, cooling-off, complaints contact) | **Works** | `d-cust-06-product` |
| 3 | Apply online with few fields | **Works with friction** | Name, phone, farm reference, region, crop, hectares, sum insured, 4-step indicator (`d-cust-08-apply-form`). Applying for the Cocoa (Centre) cover gave "Application sent. ADS Demo Insurer (test) answers by 28 October 2026." **Friction:** for the four covers above, the region list offered "East" and sending gave only "Please check the information you entered." (`d-cust-09-apply-east-result`; the API answered 422 on the region). No document upload. *Seed fixed in Part 2.* |
| 4 | Underwriting with a second check | **Works** | The underwriter quotes; approving one's own quote is refused "You are not allowed to do this. The attempt was recorded." (`d-uw-03-self-approve`); the second demo tester approved. |
| 5 | Accept the quote and pay by MTN MoMo / Orange Money, with failure and retry | **Works** | A number ending 0001 gave "Payment failed (not enough funds). Try again." (`d-cust-12-pay-pending`); a second number gave "Paid — your policy is issued and active." (`d-cust-14-paid-issued`). |
| 6 | Policy active only after the payment is confirmed; policy page | **Works** | Insurer and risk-carrier id, cover, exclusions, premium schedule, renewal, payout number (`d-cust-15-policy`). |
| 7 | Certificate PDF in EN/FR and a share link | **Works** | Download gave `AFC-2026-…-fr.pdf` and "Certificate downloaded."; the share link opened the certificate only, in French on a phone (`m-share-certificate-fr`). |
| 8 | Premium schedule, failed premium, grace and lapse | **Works with friction** | Shown per premium with status. **Friction (demo):** the seeded "Plantain – Littoral" application sat in "Payment pending" with no button for ever (accepted, but no premium row). Lapse after grace is proven only in API tests. *Seed fixed in Part 2 (shows "Payment failed" with Pay again).* |
| 9 | Cancel in the cooling-off period with refund | **Works** | "Policy cancelled. Refund pending." then "Refunded: 20,000 XAF" (`d-cust-23-cancelled-refund`). |
| 10 | Link the insured farm with consent (data from ADS Agriculture) | **Works** | In Agriculture the demo farmer shared the verified farm and copied the `AGS1…` reference; on the AfriCover policy: paste, tick consent, "Farm linked. Weather readings are now checked for your policy." (`d-cust-22-farm-linked`). **Demo host:** needs `COVER_AGRICULTURE_URL` and the shared partner secret on both products; no demo deploy file sets them yet. |
| 11 | Weather event → review → payout | **Broken (demo)** | No source sends observations (Agriculture's weather source is a later epic), so "Weather events" stays "No weather event yet." for every tester (`d-trg-01-empty`). The review chain itself (trigger officer → different claims approver → insurer approves → "Payout pending") is proven by the product's E2E suite. *Part 2 seeds one event waiting for review.* |
| 12 | Payout reaches the customer's phone | **Missing** | Stops at "Payout pending" (PLAT-PAY-001 settlement not connected, no kit payout mock). |
| 13 | Report an ordinary loss (claim) | **Missing** | Later epic EP-CLAIMS (open decision 4). |
| 14 | Complaint with reference, officer, deadline; appeal to another officer | **Works with friction** | "Complaint CMP-22DE3A29 received. Demo User will answer by 7 November 2026." Decision, appeal, "A different officer will decide." **Friction (demo roles):** the complaint is assigned to the complainant (Demo User is also a complaint officer), and the complainant then decided their own appeal (`d-off-03-own-appeal`). A product guard "the complainant cannot decide their own complaint" is also missing. |
| 15 | Help: ask, get an answer | **Broken (demo)** | The question was sent ("Question sent. Reference HLP-627F9487."), but the customer's Help page then said "You have not asked anything yet": a person who also holds `support_officer` sees the support queue, not their own questions. A question asked from the Help page goes to the ADS operator, and nobody in the ADS staff demo organisation holds `support_officer` (`d-off-02-help-desk` is empty), so it is never answered. A question asked from a policy goes to the insurer and can be answered by the second tester. |
| 16 | Notifications by SMS/email in the account language | **Works with friction** | Quote ready, policy active, complaint decided, each with "Email: delivered SMS: delivered" (`d-cust-18-notifications`). Wording "per period" where the product says "per season". |
| 17 | Language, contact details and channel choice | **Works with friction** | Settings save language, phone, email, SMS/email/marketing choices. **Friction:** a French browser saw English after signing in (the shared account had `en` saved and the account language always won), and a German browser got English (`m-fr-after-sign-in`). *Fixed in Part 2.* |
| 18 | Insurer onboarding, product approval by ADS, publication | **Works** | Product manager drafts and submits, ADS publishes in the staff workspace, the cover appears in the explorer (`d-pm-01-products`, `d-ops-03-published`). |
| 19 | Insurer staff list and audit trail with export | **Works with friction** | Staff with roles and last seen; filter and CSV export (`d-adm-01-my-insurer`). The "Who" column shows raw account ids and actions are raw codes (`PRODUCT_VERSION_PUBLISHED`) in both languages. |
| 20 | Agent / USSD enrolment and offline use | **Missing** | Later epic EP-CHANNELS. A help question typed offline is kept and sent later (E2E). |

**Score counts (20 items): 8 Works end to end, 7 Works with friction, 2 Broken (demo), 3 Missing.**

## 3. The walks

### Customer (desktop 1280 EN, `demo.user`)

| Step | Result | Screenshot |
| --- | --- | --- |
| Front door: 6 covers, families, Test mode banner | OK | `d-cust-01-front-door` |
| Region filter "Est" | Empty (seed regions) | `d-cust-04-filter-est-empty` |
| Compare two covers | Table | `d-cust-05-compare` |
| Cassava (East) → Apply → signed-out panel → Sign in → kit page → "Use demo account" → workspace | Back on the apply form | `d-cust-02-kit-login-filled`, `d-cust-02-kit-workspace`, `d-cust-08-apply-form` |
| Send the Cassava application | "Please check the information you entered." | `d-cust-09-apply-east-result` |
| Apply for Cocoa (Centre) | "Application sent…" | `d-cust-10-applications` |
| Pay with 0001, then another number | Failed, then "Paid — your policy is issued and active." | `d-cust-12-pay-pending`, `d-cust-14-paid-issued` |
| Policy, certificate FR, share link on a phone | OK | `d-cust-15-policy`, `m-share-certificate-fr` |
| Complaint from the policy; appeal | OK, assigned to themselves | `d-cust-16-complaint`, `d-cust-20-appealed` |
| Help question from the Help page | Sent, then not listed; never answered | `d-off-02-help-desk` |
| Crop enquiry; health enquiry hand-off refused ("not available for this type of cover") | Correct | `d-cust-21-enquiry`, `d-ops-01-review` |
| Link farm with an Agriculture share | "Farm linked…" | `d-cust-22-farm-linked` |
| Cancel in cooling-off | Refunded | `d-cust-23-cancelled-refund` |

### Insurer staff (`demo.user`, `demo.checker`) and ADS operator (staff workspace)

| Step | Result | Screenshot |
| --- | --- | --- |
| Underwriting queue, quote, self-approval refused, second tester approves | OK | `d-uw-01-queue`, `d-uw-03-self-approve` |
| Complaints desk: decide; appeal decided by another officer | OK (but the complainant is that officer) | `d-off-01-complaints-desk`, `d-off-03-own-appeal` |
| Weather events | Empty on the demo | `d-trg-01-empty` |
| Product manager: create, submit; ADS publishes | Published, visible | `d-pm-01-products`, `d-ops-03-published` |
| Insurer admin (`demo.admin`): My insurer, staff, audit | OK, raw ids/codes | `d-adm-01-my-insurer` |

## 4. Owner rules: EN/FR and three sizes

Sweep: 15 screens (explorer, product, compare, applications, policies, complaints, help, notifications, settings, underwriting,
products, weather events, complaints desk, my insurer, enquiries) × 360/768/1280 × EN/FR = 90 checks, signed in as the demo user.

| Rule | Result |
| --- | --- |
| Styles load on all sizes | **Pass** |
| No horizontal scroll | **Pass** on all 90 |
| Switch visible, also with the phone menu open | **Pass** (`s-360-fr-menu-open`) |
| Whole page changes | **Pass** for every UI string (EN/FR key parity test) — but see the next row |
| Language kept through sign-in | **Fail before Part 2:** all 45 French checks showed English after sign-in (`s-360-fr-policies`): the account's saved `en` always overrode the page. A tester choosing FR on the page also lost it at sign-in and on reload (the choice was not stored). |
| First visit in `de-DE` gives French | **Fail before Part 2:** English |
| Kit sign-in page follows the language | **Pass** (`ui_locales`) |
| Seed text | Cover names and exclusions are bilingual; the coverage line in French kept the English crop code ("la saison (cocoa)"); *fixed in Part 2 for new seeds* |

## 5. User-experience pass

- **First impression:** clear promise ("Cover you understand, from licensed insurers"), the Test mode banner and "Simulation — no real cover" on every cover and policy. Good for trust.
- **Next step is clear:** every application says who answers and by when; quotes show the premium, validity and exclusions next to the pay button; payment messages say whether the person is covered.
- **Error messages:** the region refusal was the generic "Please check the information you entered." — the specific `REGION_NOT_COVERED` text was not shown because the API failed earlier on the region list. Other errors are specific.
- **Shared demo roles** make several screens confusing for a tester: one person is customer, underwriter, complaint officer and support officer at once (§2 items 14–15). Kit demo personas will separate them.
- **Phone layout:** good; the signed-in name is hidden on phones, the menu drawer keeps the language switch reachable.

## 6. Verdict and the fixes that would most change it

**Yes, with gaps.**

| Fix | Size | Plan item |
| --- | --- | --- |
| Connect payouts (shared settlement service + kit payout mock) so a confirmed event reaches "Paid" | L | PLAT-PAY-001, AfriCover risk 1 |
| Agriculture weather source sending observations (makes parametric cover real) | L | AG-J-14 (Agriculture later epic) |
| Ordinary claims (report a loss, evidence, decision) | L | EP-CLAIMS (decision 4) |
| Kit demo personas (customer, underwriter/approver, complaint officer, support officer, ADS operator) and `support_officer` in the ADS staff demo organisation | M (kit) | Kit `build/demo-personas-20261023` |
| Guard: a complaint officer cannot handle their own complaint; customer help page always shows the customer's own questions | S–M | COV-US-013, COV-US-015 |
| Demo host settings for the farm link (`COVER_AGRICULTURE_URL`, shared partner secret on both products) | S (deploy) | Demo release scope |
| Audit trail: show names and translated action labels | S | COV-US-017 |

## 7. Demo completability (BRIEF16)

Built journeys (`docs/delivery/E2E_STATUS.md`): COV-J21, J22, J26, J01, J27, J02, J24, J29, J09, J05, J10, J30, J23 = **13**.

| Journey | Before (main) | After Part 2 | What was missing |
| --- | --- | --- | --- |
| J21 Sign in | Yes | Yes | — |
| J22 Language and contact | **No** (FR tester gets English) | Yes | Page language kept through sign-in; French default for other browser languages |
| J26 Insurer onboarding / publish | Yes | Yes | — |
| J01 Explorer | Yes (filter misses 4 covers) | Yes | Seed regions |
| J27 Enquiry hand-off | Yes | Yes | — |
| J02 Apply → pay → policy | Yes for 2 of 6 covers | Yes | Seed regions |
| J24 Premium failure, cooling-off refund | Yes (seeded stuck application) | Yes | Seeded failed first premium |
| J29 Certificate | Yes | Yes | — |
| J09 Farm link | Yes locally; **demo host needs settings** | Same | `COVER_AGRICULTURE_URL` + partner secret on the demo host |
| J05 Weather event → payout pending | **No** (no event can occur) | Yes (to "Payout pending") | Seeded event waiting for review; Paid needs PLAT-PAY-001 |
| J10 Complaint and appeal | Yes (complainant is the officer) | Yes | Personas for a clean demo |
| J30 Notifications | Yes | Yes | — |
| J23 Help | **No** for Help-page questions | Policy questions: Yes; Help-page questions: No | `support_officer` in the ADS staff demo organisation (kit), personas |

**Completable: 10 of 13 before → 12 of 13 after** (J23 only for questions asked from a policy).

Part 2: branch `build/demo-journeys-20261023` in `ksondo/Africover-Insurance-project` (pull request and CI result in the round summary, agent g7). Not merged.

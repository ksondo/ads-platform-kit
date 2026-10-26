# Fit-for-purpose audit: VentureWorks (23 Oct 2026)

Round 15 (BRIEF15). The owner's question: **can the person who came here get the outcome they came for?** This is a read-only audit. Nothing in the product was changed or pushed.

**Verdict: Yes with gaps.** It works for founders. It does not work for ADS operators or investors.

- **Founders: yes.** A founder can go from idea to "investment-ready" and publish to the Investment Platform. That covers venture, maturity, documents, paid assessment, roadmap with KPIs, plan approval, tasks, evidence, independent review, readiness and investor interest. The 17 main screens are fully bilingual. They hold up at 360, 768 and 1280 px.
- **ADS operators and investors: no.** VentureWorks does not record what was achieved:
  - There is no KPI actual against target. "Verified" only means a reviewer accepted a file. A venture with 12 bags sold against a target of 200 became "Investment-ready".
  - Budgets and scenarios are stored but never shown.
  - There is no portfolio view across ventures.
  - Investors see five text fields and nothing else.

With the demo accounts as configured, **4 of 13 journeys cannot be finished at all** and 5 more need workarounds (section 4). The 7 "More" screens and the public marketplace are English only.

## 1. Purpose and users

**Purpose.** A founder or partner operator comes to turn an opportunity into an operating business. They should leave with an approved plan, KPIs, verified evidence of progress and a readiness status they can show to ADS and investors. ADS operators come to steer a portfolio of such ventures. Investors come to check them.

| User type | Account used | Came for |
| --- | --- | --- |
| Founder / partner operator | demo user (**Use demo account**): `founder`, `venture_manager`, `evidence_reviewer`, `regulatory_reviewer` | plan, track and prove progress; reach investors |
| ADS operator (programme admin) | demo admin: `tenant_admin` only | see all ventures, set up the library, manage people and reviewers |
| Independent reviewer (checker) | second demo user `demo.checker` (same roles as the demo user) | accept or reject evidence and legal checkpoints |
| Investor / bank | none: the role `investor` exists in code but is granted to no one. Investors live on the Investment Platform | see investment-ready ventures, check them, express interest |
| Contributor / partner (supplier, Software Factory, Education) | none: no ecosystem role is granted | find needs, apply, deliver |

**Yardsticks:**

| Side | Reference products |
| --- | --- |
| Founder and studio | venture-studio and accelerator tools such as Visible.vc (KPI updates), the founder side of Carta or Pulley (cap table and financials), and accelerator portals (milestones, mentors, demo-day readiness) |
| Investor | data rooms such as AngelList, Carta and DocSend: a portfolio list, KPIs over time, financials, documents with permissions, an access log and periodic updates |

## 2. How it was run

**Code tested**
- **Journey walk (sections 3–4):** a detached worktree of `origin/main` `aa960dd`, which includes the demo seed (PR #92). PR #91 (`fix/demo-no-venture-20261020`, head `7d5ca20`) was merged locally into it, giving `e82ede7` (never pushed).
- **EN/FR × 360/768/1280 matrix, demo-account checks and the no-venture check:** the final `origin/main` = **`2c710ee`**, after PR #91 merged. The rebuild changed only the review edit in `src/app/ui.tsx` and the Vite pin. The web app was built with the already-installed Vite 6.4.3; `main` now pins 6.4.5.
- **Kit:** `ads-platform-kit` `main` = `3997342`. Identity ran in demo mode (`ADS_ENV=demo`, `DEMO_MODE=1`, `DEMO_SHOW_CREDENTIALS=1`) with the kit mocks, through `ads-e2e up`. `apply-clients` used a copy of `config/clients.demo.json` that kept only VentureWorks and changed the URIs to `http://localhost:32100/`. Then `demo-bootstrap` and `demo-orgs` ran.

**Product set-up**
- The product ran as the demo host would run it:
  - migrations as owner, with a NOBYPASSRLS runtime login (`vw_runtime` in `ventureworks_api`);
  - `scripts/demo-seed.mjs`, which wrote 73 rows;
  - a single Node server serving the web and API;
  - `VW_TEST_MODE=true`, mock payments, RAG and email, price 25 000 FCFA;
  - the labelled mock Investment Platform from `e2e/support/mock-iip.mjs`.
- Investment Platform events (listing published, investor interest) were sent as signed provider events, because the investor side has no screen in VentureWorks.

**Environment**
- Ports 32100–32103. Throwaway databases `fa_vw_identity` and `fa_vw_app` on a private PostgreSQL 16 cluster on port 32119.
- The Google Fonts on the hosted sign-in page are blocked by this sandbox. That is not a product issue.

**The walk**
- Playwright, starting from the front door `/`. It used the product's own **Sign in**, then **Use demo account**, then clicked the menu links.
- Every page was opened in EN and FR at 360, 768 and 1280 px using the top-bar switch (section 5).
- Screenshots are in [`img/ventureworks/`](img/ventureworks/):
  - `j*` = the journey walk (desktop EN);
  - `d*` = demo-account checks;
  - `m-*` = the size and language matrix.
- Hosted sign-in page screenshots are not committed, because they show the demo password.

## 3. Market standard checklist and scores

**Scores:** **E2E** = works end to end · **Friction** = works with friction · **Broken** · **Missing**

### Founder / partner operator (venture studio / accelerator yardstick)

| # | What any founder expects | Score | What happened |
| --- | --- | --- | --- |
| F1 | Front door that says what this is, and one sign-in | **E2E** | "Grow your venture with evidence, not guesswork", **Sign in with ADS** and **Browse public opportunities** ([j01](img/ventureworks/j01-front-door.jpg)). Sign-in with the demo panel lands on the overview of the first venture. |
| F2 | Create a venture (idea, startup, existing), unregistered allowed | **E2E** | Name, sector, stage, country, legal status. Then "*Kribi Cassava Processing* is created" and a clear next step, **Describe business maturity** ([j03](img/ventureworks/j03-venture-created.jpg)). |
| F3 | Business profile and private documents | **E2E** | Known, unknown or not applicable per fact, saved as "founder-reported" ([j05](img/ventureworks/j05-maturity-saved.jpg)). Private upload with a SHA-256 fingerprint ([j06](img/ventureworks/j06-document-uploaded.jpg)). |
| F4 | A diagnostic or assessment that tells me something | **Friction** | Price, terms, consent and mock MoMo all work ([j07](img/ventureworks/j07-assessment-checkout.jpg), [j08](img/ventureworks/j08-assessment-unlocked.jpg)). The consent check refuses payment until the box is ticked. **But the result is my own answers echoed back as "Assumption"**. The one "Sourced" finding cited "Test policy: insurance claims" for a cassava business, because the mock RAG returns an unrelated source ([j09](img/ventureworks/j09-assessment-result.jpg)). There is no score, no gaps and no recommendations. Under the result, the **Buy the assessment / Pay FCFA 25,000** form appears again, with no explanation that it is for a reassessment. |
| F5 | A business plan or blueprint for my stage | **Broken** (for a founder alone) | For any sector except the seed's own, it says "No blueprint exists for your sector yet … Request a blueprint" → "Requested. We will tell you when it is ready" ([j10](img/ventureworks/j10-blueprint-none-for-sector.jpg)). No ADS screen lists these requests. It worked only after the demo admin typed a template into Administration › Library ([d05](img/ventureworks/d05-blueprint-after-template.jpg)). The four seeded ventures have a blueprint with a budget and three scenarios in the database, but the screen says "Complete the assessment first" ([d06](img/ventureworks/d06-seeded-blueprint-hidden.jpg)), because the seed has no completed assessment. |
| F6 | Roadmap: milestones, KPIs with targets, costs, evidence needed | **E2E** | A manual form with objectives, milestones, dates, cost and effort ranges, KPI targets and units, then "Draft saved" ([j11](img/ventureworks/j11-roadmap-form.jpg)). Nothing is pre-filled from the assessment or the template. |
| F7 | Budget and financial scenarios (conservative, base, optimistic) | **Missing** | Not shown anywhere. The seed stores them in `venture_blueprint` and `venture_business_record` (`financial_budget`), but no screen reads them. Plan approval shows only the cost range per milestone. |
| F8 | Approve a versioned plan | **E2E** | "Approving locks this version with your name and the time" → "Version 1 approved by Demo User" ([j12](img/ventureworks/j12-plan-draft.jpg), [j13](img/ventureworks/j13-plan-approved.jpg)). |
| F9 | Tasks with owner, due date and the KPI they prove | **E2E** | "Task added", with the KPI linked ([j14](img/ventureworks/j14-task-added.jpg)). The owner can only be "Me" or the one listed person, because there is no venture team (VW-B03). |
| F10 | Submit evidence; someone independent verifies it | **Friction** | The submission works: "Submitted. The assigned reviewer is notified" ([j15](img/ventureworks/j15-evidence-submitted.jpg)). But on a new venture **nobody is assigned**, and the founder is not told. The admin must open a collapsed "Assign an independent reviewer". It refuses the admin themself: "The reviewer must be independent of the founder and of you" ([j16](img/ventureworks/j16-admin-self-assign-refused.jpg)). The person list contains only people who have already signed in to VentureWorks. After the checker was assigned, they saw "Waiting for your decision" and accepted ([j17](img/ventureworks/j17-checker-review-queue.jpg)). Maker-checker holds. |
| F11 | KPI actuals against target, over time | **Missing** | There is no place to enter a value. A KPI is "Verified" once one file is accepted. The evidence said "12 bags sold" against a target of 200, and the venture became **Ready to operate: Yes** and **Investment-ready** ([j18](img/ventureworks/j18-investment-ready.jpg)). |
| F12 | Financial monitoring: revenue, expenses, budget against actual | **Friction** | Only under More › CRM and finance: an English-only page with "Amount in minor units", "SELF_REPORTED_NOT_AUDITED" and a monthly total. There is no budget, no variance, no runway and no chart. A contact saved, and an opportunity can be created. |
| F13 | One readiness dashboard I can trust | **Friction** | It is clear: dimensions, % bars and a KPI list ([j02](img/ventureworks/j02-overview-seeded-venture.jpg)). But see F11. "Ready to operate: **Yes**" showed while legal checkpoints were "Not started, 0 %" on a food business whose licence was "unknown". The rule text says "pending owner confirmation" (decision VW-10). |
| F14 | Legal and regulatory checklist with sources | **Friction** | Applicability lists the conditions with authority and source. Checkpoints work when the admin proposes them, assigns a reviewer with a qualification, and the reviewer approves ([d04](img/ventureworks/d04-checker-approves-after-assignment.jpg)). The seeded proposed checkpoints cannot be approved by any demo account (section 4). |
| F15 | Notifications and help | **E2E** | The bell count works. Payment, evidence, listing and interest notifications show with "email sent" ([j23](img/ventureworks/j23-notifications.jpg)). A help ticket gets the reference `VW-HLP-…` and a status ([d07](img/ventureworks/d07-help-ticket.jpg)). |

### ADS operator (studio portfolio yardstick)

| # | What an operator expects | Score | What happened |
| --- | --- | --- | --- |
| O1 | Portfolio view: all ventures, stage, KPI completion, overdue items, blockers | **Missing** | There is only the venture drop-down. All journeys › VW-J31 "Venture Command Centre" opens **Administration › Access requests** ([j24](img/ventureworks/j24-command-centre-opens-admin.jpg)). The API `GET /v1/command-centre/ventures` exists, but no screen uses it (VW-B17). |
| O2 | Give people roles | **Broken** | The demo admin files an access request, then is refused on approval: "You cannot approve your own request or a request you proposed" ([d03](img/ventureworks/d03-admin-cannot-approve-own-request.jpg)). There is no second `tenant_admin`. Even when approved, the grant stays "Approved — grant pending", because "the ADS role administration service is not connected yet" (VW-B18). |
| O3 | Programme library: plan templates, legal conditions | **Friction** | Add forms work ("Template added"). But there is no list of the existing templates and conditions, and no queue of founders' blueprint requests. |

The audit log (Administration › Audit) was not exercised this round. The G1 demo check opened it (PASS).

### Investor / bank (data-room yardstick)

| # | What an investor expects | Score | What happened |
| --- | --- | --- | --- |
| I1 | Find investment-ready ventures | **Friction** | The founder publishes after a "five fields" confirmation, then sees "Awaiting delivery" and "Live on the Investment Platform" once the platform answers ([j19](img/ventureworks/j19-investment-form.jpg)–[j21](img/ventureworks/j21-investor-interest.jpg)). Discovery happens on the Investment Platform, which is not connected in the demo, so without it the listing stays "Awaiting delivery". |
| I2 | A data room: plan, KPIs over time, financials, documents, permissions, access log | **Missing** | Investors get only title, summary, sector, region and stage. The verify calls are not shown to the founder (VW-L05). |
| I3 | Express interest; the founder answers | **Friction** | With simulated platform events, the founder sees "Angel investor · FCFA 5,000,000 · indicative — not a commitment" and the message, and accepts a discussion ([j22](img/ventureworks/j22-interest-accepted.jpg)). This works only with a simulator; no investor can be signed in. |
| I4 | Periodic investor updates (monthly KPIs and cash) | **Missing** | There is nothing like a Visible.vc update. |

### Contributor / partner

| # | What a partner expects | Score | What happened |
| --- | --- | --- | --- |
| P1 | Browse opportunities or needs | **Missing** | "No published opportunities match this sector" ([d10](img/ventureworks/d10-marketplace-empty.jpg)). The page is English only, and it is the one public link on the front door. |
| P2 | Apply, agree terms, deliver, get verified | **Missing** in the demo | The Contributors and Delivery verification pages load, but no demo account holds `contributor` and nothing is published (VW-B01, B04–B07). |
| P3 | Referral to Software Factory, Education or the Investment Platform with consent | **Friction** | "Grant scoped consent" records consent and opens "Share permitted information" ([d09](img/ventureworks/d09-partner-referral-consent.jpg)). It is English only, and the purpose field is a bare required input. Queuing and delivery were not tested. |

**Score counts (25 items):** 7 E2E · 9 Friction · 2 Broken · 7 Missing.

## 4. Can the demo accounts complete every journey? (owner rule)

Demo accounts as created by `demo-orgs`:
- **demo user** and **demo checker** hold `founder`, `venture_manager`, `evidence_reviewer` and `regulatory_reviewer`;
- **demo admin** holds only `tenant_admin` (`admin_roles`);
- all three are in "ADS Demo – Venture Studio". There is no staff organisation and no ecosystem roles.

| # | Journey | Demo accounts can finish it? | What is missing, exactly |
| --- | --- | --- | --- |
| 1 | Sign in, including an organisation with no venture | **Yes** | PR #91 fixed it on `2c710ee`: "Create your first venture to start" ([d12](img/ventureworks/d12-no-venture-empty-state-360.jpg)). |
| 2 | Create venture → maturity → documents → paid assessment | **Yes** | The host must set `VW_PAYMENTS_MODE=mock`, `ADS_MOCKS_URL`, `ADS_MOCKS_WEBHOOK_SECRET`, `VW_ASSESSMENT_PRICE_XAF` and `VW_ASSESSMENT_TERMS_VERSION`. Without the price, checkout is unavailable. |
| 3 | Blueprint for the visitor's own venture | **Only with the admin's help** | **Seed:** the only template is sector `s1-demo`/`startup`. Seed one template per stage for common sectors, or make a sector `all` template match. |
| 4 | Blueprint and roadmap screens on the 4 seeded ventures | **No** | **Seed:** no completed assessment (`venture_assessment` and a paid entitlement) for the seeded ventures, so both screens say "Complete the assessment first", even though a plan, budget and scenarios exist. |
| 5 | Roadmap → plan approval → tasks | **Yes** | — |
| 6 | Evidence review on the seeded ventures | **Yes, but only by demo checker** | The seed assigns the **demo admin** as checker (and `DEMO_DATA.md` says so). The admin lacks `evidence_reviewer`, so no queue shows and the API returns `403 EVIDENCE_REVIEWER_REQUIRED` ([d01](img/ventureworks/d01-admin-no-review-queue.jpg)). **Role:** add `evidence_reviewer` and `regulatory_reviewer` to VW `admin_roles` in `clients.demo.json`, or correct the seed text to name the checker. |
| 7 | Evidence review on the visitor's new venture | **Only if the checker has signed in before, and the admin assigns them** | **Seed:** create `venture_user_profile` rows for all three demo accounts, so the reviewer list is never empty. The admin cannot assign themself (independence rule, correct). **Optional seed/config:** auto-assign the demo checker on new demo ventures. |
| 8 | Regulatory checkpoints on the seeded ventures (School 1, Fleet 1 and Association 1 proposed) | **No** | Only the demo admin is seeded as `regulatory_reviewer`, and they lack the role: the checker gets "You are not assigned to review this venture" ([d02](img/ventureworks/d02-checker-not-assigned-regulatory.jpg)). **Seed:** assign the demo checker as regulatory reviewer with a qualification (or give the admin the role, as in row 6). |
| 9 | Regulatory checkpoints on a new venture | **Yes**, using all three accounts | Admin proposes, admin assigns the checker with a qualification, checker approves. |
| 10 | Access request → role grant | **No** | **Membership:** a second `tenant_admin` is needed, because the requester cannot approve their own request. **Config:** `ADS_ROLE_ADMIN_URL` and `ADS_ROLE_ADMIN_TOKEN` (kit role-admin, VW-B18). Until then it ends at "grant pending". |
| 11 | Publish to the Investment Platform → interest → answer | **Partly** | The founder's side works. **Config:** `VW_IIP_BASE_URL`, `WPB_REFERRAL_TOKEN` and `WPB_INVESTMENT_WEBHOOK_SECRET` pointing at the Investment Platform demo, which must also be connected. Without that, the listing stays "Awaiting delivery" and no interest can arrive. **Role:** there is no investor demo account (on either side). |
| 12 | Marketplace → contributor application → delivery review | **No** | **Role:** no demo account holds `contributor`; the ecosystem roles are not in `assignable_roles`. **Seed:** no published need or opportunity. |
| 13 | Help, notifications, settings, CRM, capability gaps, partner-referral consent | **Yes** | **Shared-account side effect:** a visitor who switches to FR while signed in saves FR on the shared demo account, so **the next visitor, with an English browser, lands in French** ([d11](img/ventureworks/d11-next-visitor-gets-french.jpg)). |

**Result:**
- **4 journeys cannot be finished at all:** rows 4, 8, 10 and 12.
- **5 more need a workaround or another account's help:** rows 3, 6, 7, 9 and 11.
- **4 work fully:** rows 1, 2, 5 and 13.

All the fixes are configuration or seed work (size S), except the role-admin connection (VW-B18).

## 5. Language (EN/FR) and layout: 360, 768, 1280 px

The checks covered 24 founder pages plus Administration, the front door and the public marketplace, in each of the 6 combinations (`m-*` screenshots). They were made with the product's top-bar switch, never the URL.

| Owner rule | Result |
| --- | --- |
| Switch visible on every page and size, including with the mobile menu open | **Pass.** It is in the top bar next to the bell and account ([m-user-00-menu-open-360-fr](img/ventureworks/m-user-00-menu-open-360-fr.jpg)) |
| Language survives sign-in and reload | **Pass** in all 6 combinations. The hosted sign-in page also follows the language (`lang=fr`) |
| Styles load on every size; no horizontal scroll | **Pass.** No page wider than the viewport, no failed stylesheet, no API 4xx/5xx and no JavaScript error on any page |
| Whole page changes language | **Pass for the 17 main screens and Administration.** **Fail for 8 screens:** the 7 under **More** (All journeys, CRM and finance, Capability gaps, Knowledge adviser, Contributors, Delivery verification, Partner referrals) and the public **Opportunity marketplace**, which is reachable from the front door ("Voir les opportunités publiques" leads to "Explore business opportunities"). Those pages also use developer wording ("Authoritative application and engagement records loaded", "XAF minor units", journey IDs) ([m-user-core-operations-360-fr](img/ventureworks/m-user-core-operations-360-fr.jpg), [m-user-00-marketplace-360-fr](img/ventureworks/m-user-00-marketplace-360-fr.jpg)) |
| Data | Seed names and KPIs are English and carry "(s1 demo)" or "(s1)" in names and reviewers ("Demo Admin (s1)") |

**Small layout defects**
- On phone, tapping the page you are already on in the drawer leaves the drawer open. It closes only on a hash change (`VentureShell.tsx`).
- The test-mode banner takes three lines (about 80 px) at 360 px.
- Breadcrumbs truncate ("Vue d'ens…").

## 6. User-experience pass

- **First impression.**
  - The front door is clear and calm, with one primary action.
  - After sign-in, the seeded overview is a good dashboard: readiness gates, dimensions with % bars and KPI states.
  - On a **new** venture, the overview lists five "Not met" rows and no "start here" checklist. Only the venture-created screen gives a next step.
- **Clarity of the next step.**
  - Good inside each screen: "Complete the assessment first → Assessment", "Build the roadmap", "Publish to the Investment Platform".
  - Weak between people: nothing tells the founder that no reviewer is assigned, or that a blueprint request is waiting on ADS.
- **Empty states.** They are present and honest everywhere ("No tasks yet", "No investor interest yet", "No published opportunities match this sector").
- **Errors.**
  - Plain and specific: "The reviewer must be independent of the founder and of you", "You are not assigned to review this venture", "Tick the consent box to continue".
  - The refused self-approval is clear, but leaves no way forward in a one-admin organisation.
- **Speed.** Every screen rendered within the 1.5–1.8 s wait used locally. Nothing felt slow. It was not measured.
- **Wording.** The disclaimers are careful and correct. They are dense on the "More" pages, which read like internal tooling.
- **Dates.**
  - The listing expiry is sent as 23:59:59 UTC and shown in local time, so in Cameroon (WAT) "Visible until" shows **the day after** the date chosen (31 Mar → "1 Apr 2027").
  - Expiry and file inputs follow the browser locale (mm/dd/yyyy in an en-US browser), not the app language.
- **Would a tester give up?**
  - A founder would get through, though the assessment result will disappoint.
  - An ADS operator looking for "my portfolio", or an investor looking for numbers, would give up.
  - A visitor who clicks the public opportunities link in French lands on an English, empty page.

## 7. Verdict and the fixes that would change it most

**Can it perform its duty? Yes with gaps.**
- **Founders: yes.** The core plan, prove and review loop works end to end, bilingual and responsive.
- **ADS operators and investors: no.** VentureWorks records that evidence exists, not what was achieved. It shows no money and no portfolio.
- **Demo: not every journey finishes.** With the accounts as configured, 4 journeys cannot be finished at all.

| # | Fix | Size | Changes | Plan item |
| --- | --- | --- | --- | --- |
| 1 | **Demo set-up that lets every journey finish.** Add `evidence_reviewer` and `regulatory_reviewer` to the VW demo admin roles, or seed the checker as the assigned evidence and regulatory reviewer and correct `DEMO_DATA.md`. Seed a completed assessment for the 4 ventures, profiles for the 3 demo accounts, and blueprint templates per stage. Add a second `tenant_admin` or connect role-admin. Grant `contributor` to the second demo user and seed one published need. Let the device's switch choice win over the shared account's saved language. Point the demo at the Investment Platform demo. | S | Section 4 rows 3, 4, 6, 7, 8, 10, 11 and 12; F5, F14, P1 | DEMO_HOST_SETTINGS §4 (seed spec), VW-B18 |
| 2 | **KPI actuals and a financial view.** Record measured values (value, date, source) against each KPI target, with the evidence attached. "Verified" means the measured value was accepted, and readiness counts achievement against target. Show the budget and the three scenarios, plus budget against actual from operating entries. | M | F7, F11, F12, F13 | VW-B11, VW-B12, VW-B16; decision VW-10 |
| 3 | **Portfolio view for ADS.** One screen over `GET /v1/command-centre/ventures`: ventures by stage, KPI completion, overdue tasks, open reviews and blockers, with a filter by parent platform or opportunity. Point VW-J31 at it, not at Administration. Also add a queue of blueprint requests and unassigned evidence. | S–M | O1, O3, F5, F10 | VW-B17 |
| 4 | **Assessment that earns its 25 000 FCFA.** Findings that add something: gaps, risks and next steps per answer, a clear "no source found" when there is none, and never an off-topic citation. A pre-filled roadmap and KPIs from the assessment and template. Replace the second "Buy the assessment" form with a labelled "Reassess (new payment)". | M | F4, F6 | VW-B10; VW-L03 and L04 for AI drafts |
| 5 | **Bilingual and polish.** Translate the 7 "More" screens and the public marketplace, or hide them from the menu and the front door until they are ready, using plain wording. Remove "(s1 demo)" and "(s1)" from seed names. Show the expiry date in the chosen day. Close the phone drawer on any tap. Do not show "Ready to operate: Yes" while legal checkpoints are not started. | S | Section 5, F13, I1 | VW-B20 (wording), VW-B01 (rename to "Needs marketplace") |

**Next, by the existing plan:**
- the investor data room and access log (I2, VW-L05). It is LATER in the plan, but it is what an investor judges first;
- the venture team (VW-B03), so tasks can have real owners and the people list is scoped;
- the opportunity registry and partner recruitment (VW-B01 and B04) for P1 and P2.

## Unmerged branches

`main` = `2c710ee` includes the demo seed (PR #92) and the no-venture fix (PR #91). There is **one open PR, #88** (`deploy/contabo-ventureworks-staging`, Contabo staging deployment). The repository has **79 remote branches not merged into `main`**:
- the most recent are from 16 Oct (`feature/ads-auth-reconciliation-20261016`, `fix/ventureworks-keycloak-invalid-scope-20261016` and `deploy/contabo-ventureworks-staging`);
- the rest are 12–14 Oct slices (`feat/vw-pr1-core-venture-operations-20261014`, `feat/vw-pr2-marketplace-ecosystem-20261014`, `feat/vw-ui01-…` and others), most of them superseded by the MVP build.

This audit ran on `main` only.

## Repro notes (for whoever fixes)

- **Seed:** `scripts/demo-seed.mjs` assigns `users.admin` as `evidence_reviewer` and `regulatory_reviewer` (`rev-admin` and `reg-admin` rows). The decision code requires the token role first (`src/server/mvp/build.mjs:172`, `src/server/mvp/legal.mjs:48`).
- **Blueprint and roadmap gating:** `assessmentCompleted` in `src/app/screens/PlanScreens.tsx:18,43`.
- **Reviewer list:** comes from `venture_user_profile`, created at first sign-in (`listPeople`, `src/server/mvp/legal.mjs:72`). Self-assignment is refused at `legal.mjs:64`.
- **Language:** `LocaleSync` in `src/app/AppRoot.tsx` applies the server preference (`version > 1`) over the browser choice.
- **Expiry:** `InvestmentScreen.tsx:29` sends `expiry + 'T23:59:59Z'`; `formatDate` shows it in local time.
- **Drawer:** `VentureShell.tsx` closes the menu only in `useEffect([hash])`.

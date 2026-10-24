# Fit-for-purpose audit: Investment Platform (IIP)

Round 17, 23 Oct 2026. Briefs: `audit/BRIEF17-audit-and-fix.md`, `BRIEF15-fit-for-purpose.md` (with step 7) and `BRIEF16-demo-journeys.md`. Part 1 (this report) describes what we found on `main`. Part 2 (small fixes for demo users) is in the product PR listed at the end; nothing here is merged.

Repository: `ksondo/Intelligent-Cryptocurrency-platform`. The product in it is the **ADS Intelligent Investment Platform (IIP)**: an investment-opportunity marketplace whose first (and, in the MVP, only) source is VentureWorks. Crypto and gold are later research verticals.

**Owner's question:** can the person who came here get the outcome they came for?

**Verdict: Yes, with gaps.** An investor can find published ventures, filter and search them, see why a venture matches their preferences, open a venture page with readiness and evidence status, follow it, send a non-binding interest (delivered to VentureWorks), ask for diligence, ask the research assistant, and ask for help. Staff can review and re-check listings, triage diligence requests, answer help requests, read and export the audit trail and manage staff roles. All of it worked against the API and PostgreSQL (forced RLS), with the real ADS sign-in in demo mode.

The gaps:
- **No data room.** A venture page has a summary, sector/region/stage, readiness dimensions and KPI targets, but no documents (deck, financials), no team, no figures beyond targets, no Q&A with the founder. Investment-marketplace users expect a data room.
- **Nothing after "interest":** no founder conversation in IIP (the founder answers in VentureWorks), no commitment or subscription (by decision: no money moves in the MVP), no post-investment updates.
- **On the demo, staff journeys do not work:** the kit puts the demo reviewer and support roles in a separate "ADS Staff – Investment Platform" organisation, but IIP shows listings, diligence and help requests only inside the investors' organisation. The demo staff see empty queues. (Needs a kit change; the PR's demo-journeys suite proves it works once the roles are in the investors' organisation.)
- **Research assistant answers "Research unavailable" on the demo:** the research mock has no sources loaded. (Fixed in the PR: the seed loads test sources.)
- **Demo language rules fail:** the shared demo account's saved language overrides the language the tester chose; the phone menu covers the language switch; a German browser gets English; the profile page scrolls sideways at 360 px. (Fixed in the PR.)

## Set-up and commits tested

| Item | Value |
| --- | --- |
| Product | `origin/main` `42626bc` (demo seed PR #16 merged) |
| Kit | `ksondo/ads-platform-kit` `main` `d28b6ac`. Identity in demo mode (`ADS_ENV=demo`, `DEMO_MODE=1`, `DEMO_SHOW_CREDENTIALS=1`) via `ads-e2e up` + kit mocks (e-mail, research); `iip-web` entry from `config/clients.demo.json` (local redirect, client secret generated at apply time, not shown), then `demo-bootstrap`, `demo-orgs`. |
| Data | `src/server/migrate.mjs`, then `scripts/demo-seed.mjs` with `DEMO_SEED_VW_MOCK_URL` (6 published listings, registered with the labelled VentureWorks test double `tests/support/ventureworks-mock.mjs`). PostgreSQL 16, throwaway DBs `g5_iip_identity`, `g5_iip_app`; API as a restricted login (`iip_app`, `iip_outbox_worker` SET only). `IIP_DISCOVERY_ENABLED=1`, `IIP_PREVIEW_JOURNEYS=1`. |
| Accounts | `demo.user` ("Use demo account"; `investor` in "ADS Demo – Investment Platform", `investment_reviewer` + `support_agent` in "ADS Staff – Investment Platform"), `demo.checker` (same, password not shown), `demo.admin` (owner-shared; `iip_admin` in both). The kit asks which workspace to open. |
| Ports | identity 32490, kit mocks 32491, IIP 32492, VentureWorks double 32493, PostgreSQL 32499 |
| Browser | Playwright Chromium from the front door through **Sign in** and the kit sign-in page; 360×740 (touch), 768×1024, 1280×860; EN and FR. |

## 1. Purpose and users

**Purpose:** an investor (angel, fund, diaspora, institution) comes to find investment-ready ventures prepared by VentureWorks, understand them and express non-binding interest; they leave with an interest the founder can answer, or a diligence answer. ADS staff come to decide what is published and to support investors.

| User | Comes to |
| --- | --- |
| Investor (`investor`) | Discover, match, read, follow, express interest, ask for diligence, research, get help |
| Investment reviewer (`investment_reviewer`) | Review VentureWorks publications (maker-checker), re-check, suspend; triage diligence |
| Support agent (`support_agent`) | Answer help requests and complaints |
| IIP administrator (`iip_admin`) | Audit trail, staff roles |
| Founder (in VentureWorks) | Publish a venture, answer interests (outside IIP) |

## 2. Market standard checklist

Yardsticks: **AngelList / Gust / Seedrs-type investment marketplaces** (deal discovery, deal page with data room, follow, express interest/commit, Q&A, portfolio updates) and a **VDR / data room** (documents, access control, activity log).

| # | Expectation | Score | What happened |
| --- | --- | --- | --- |
| 1 | Browse listings with key facts | **Works** | 6 cards with "From VentureWorks", sector · region · stage and summary (`d-06-marketplace`). |
| 2 | Search and filter | **Works** | Sector "Agriculture" → 1; text "solar" → 1. |
| 3 | Matching to my preferences, with reasons | **Works** | Match score and reasons on each card after preferences are saved. |
| 4 | Deal page: team, traction, financials, readiness, evidence | **Works with friction** | Facts with "reported / verified" evidence badges, readiness dimensions, KPI targets, "as of" date (`d-07-venture`). **Friction:** no team, no actual figures (targets only), no valuation or raise amount. On the demo the readiness dimensions show raw keys `venture.dim.team`, `venture.dim.market`, `venture.dim.financials`: the seed used names VentureWorks does not send (it sends plan, kpis, execution, legal, blockers). |
| 5 | Data room: documents with access control | **Missing** | No documents of any kind. |
| 6 | Follow / watchlist | **Works** | Follow → Following list and dashboard. |
| 7 | Alerts when a followed listing changes | **Works with friction** | Built (centre + e-mail) but only triggered by VentureWorks events; nothing a demo tester can cause ("No notifications"). |
| 8 | Express interest (non-binding) with amount and message | **Works** | "Interest sent — not a commitment", reference `INT-…`, "Delivered to VentureWorks" (`d-08-interest`, `d-09-interests`); a second open interest on the same venture is refused with a clear message. |
| 9 | Q&A / messaging with the founder | **Missing** | The founder can only accept or decline in VentureWorks; the investor sees the answer. |
| 10 | Diligence request with status and reason | **Works with friction** | Request → reviewer triage ("Needs information" + reason) → investor dashboard. **Friction:** the triage screen shows the referral id, not the venture name; on the demo the reviewer cannot see the request (separate staff organisation). |
| 11 | Investor profile (type, language, contact), KYC/accreditation | **Works with friction** | Type, language, channel. No KYC/accreditation (owner default decision 5a: not needed for non-binding interest). Profile page scrolls 39 px sideways at 360 px; with a long verified e-mail (the demo account's) the e-mail line overflows its box and covers the Save button on a phone. |
| 12 | My activity / portfolio dashboard | **Works** | Interests with status and next step, following, diligence, preferences, budget (`d-11-dashboard-after`). |
| 13 | Commit / subscribe / pay / e-sign | **Missing** | By decision (no money moves in the MVP). |
| 14 | Research assistant with cited sources | **Works with friction** | Built (Progress RAG adapter, cited answers only). **On the demo:** "Research unavailable. No answer is invented." — the mock has no sources (`d-10-research`). |
| 15 | Help and complaints with reference and answer | **Works with friction** | "Received. Your reference is SUP-…". On the demo the support agent's queue is empty (staff organisation), so the answer never comes. |
| 16 | Listing review and publishing (maker-checker) | **Works with friction** | Review queue, sync, approve (two references), suspend. On the demo: empty queue for staff (`d-12-review-queue`), and a new publication can only come from VentureWorks. **Friction (found by the demo-journeys suite):** after Sync/Approve/Suspend the queue reloads and the "Saved." confirmation disappears with the item, so the reviewer gets no confirmation. |
| 17 | Audit trail and export | **Works** | Filter by opportunity, CSV export. (In the staff workspace it is empty: `d-15-audit`.) |
| 18 | Staff role management | **Works** | Members, give/remove role, invite (`d-16-staff`). |
| 19 | Bilingual and mobile | **Works with friction** | All UI strings EN/FR; see §4 for the four rule failures. |
| 20 | Updates from ventures after interest/investment | **Missing** | Only listing-change alerts. |

**Score counts (20 items): 8 Works end to end, 8 Works with friction, 0 Broken, 4 Missing.**

## 3. The walks

### Investor (`demo.user`, "Use demo account", workspace "ADS Demo – Investment Platform"; desktop 1280 EN, phone 360 FR, tablet 768 EN/FR)

| Step | Result | Screenshot |
| --- | --- | --- |
| Front door → Sign in → kit demo page → Use demo account → choose workspace | Lands on the dashboard ("Welcome… Set your preferences" on a fresh account) | `d-01-landing`, `d-02-kit-signin`, `d-03-workspace`, `d-04-dashboard` |
| Profile: investor type | Saved | — |
| Preferences (3 per facet), indicative budget 5,000,000 | Saved | `d-05-preferences` |
| Opportunities: 6 listings; filter Agriculture → 1; search "solar" → 1 | OK, no sideways scroll | `d-06-marketplace` |
| Open "POS Deployment Network – Yaoundé" → follow | Following | `d-07-venture` |
| Express interest 2,500,000 XAF with message | "Interest sent — not a commitment", then "Delivered to VentureWorks" | `d-08-interest`, `d-09-interests` |
| Ask for diligence | "Request sent" | — |
| Research question | **"Research unavailable"** (no sources in the mock) | `d-10-research` |
| Help request | "Received. Your reference is SUP-…" | — |
| Dashboard | Interest, following, diligence "Submitted" | `d-11-dashboard-after` |

Phone 360 FR and tablet 768 EN/FR: the same investor screens were captured (`m-01…m-12`, `t-07-venture`, `tf-06-marketplace`, `tf-07-venture`). On the tablet EN run (English browser, English front door) the whole app came back **in French** after sign-in, because the previous run had saved French on the shared demo account (`t-08-lang-forced-fr`). Several later phone/tablet steps timed out because the shared build host was overloaded (load average above 100, browser crashes); those screens were covered by the bilingual sweep (§4) and by the demo-journeys suite in CI.

### Reviewer / support (`demo.checker`, typed; workspace "ADS Staff – Investment Platform") and administrator (`demo.admin`)

| Step | Result | Screenshot |
| --- | --- | --- |
| Review queue | **Empty** ("No publication requests") — the listings live in the investors' organisation | `d-12-review-queue` |
| Diligence triage | **Empty** — the investor's request is not visible | — |
| Support queue | **Empty** — the investor's help request is not visible | — |
| Admin: audit trail (staff workspace) | "No audit entries" | `d-15-audit` |
| Admin: staff roles | 3 members | `d-16-staff` |
| Investor again: diligence still "Submitted", help still "Received" | Never answered | `d-17-help-answered` |

## 4. Owner rules: EN/FR and three sizes

Sweep of the 10 investor pages at 360/768/1280 in EN and FR (60 page checks + menu + sign-in checks):

| Rule | Result |
| --- | --- |
| Styles load | **Pass** |
| Whole page changes language | **Pass** for UI strings, except the raw readiness keys on the demo venture pages (seed data, see item 4). Listing titles and summaries are the founder's words (EN). |
| No horizontal scroll | **Pass** except **Profile at 360 px: 39 px** (the investor-type fieldset keeps a 170 px minimum column plus padding; `s-360-fr-_profile`). |
| Switch visible | **Pass** in the top bar; **Fail inside the phone menu** (the drawer covers it, `s-360-fr-menu-open`). |
| Phone menu | Opens and reaches every page, but tapping the page already open leaves the drawer covering the screen (found by the demo-journeys suite). |
| Language kept through sign-in | **Fail for the shared demo accounts:** after sign-in "the saved language wins" (IIP-AC-003-1). The previous tester's choice is saved on the shared account, so a tester who chose French on the front door is switched back to English (and the other way round). Seen twice: tablet FR walk (FR before sign-in, English after) and tablet EN walk (English browser, French after, `t-08-lang-forced-fr`). |
| First visit with `de-DE` gives French | **Fail**: English |

## 5. User-experience pass

- **First impression:** clear promise ("Invest in ventures VentureWorks has prepared"), Sign in and Create account, "Interest is not a commitment" fine print, TEST MODE banner. Good.
- **Next step:** a new investor is asked to set preferences; each interest shows its next step ("Wait for the founder's answer"). Good.
- **Empty states:** plain and honest ("Research unavailable. No answer is invented.", "No publication requests"), but on the demo they are what staff see everywhere.
- **Workspace choice:** every demo sign-in stops on the kit's "Choose a workspace" page (investor vs staff organisation); a tester has to know which to pick.
- **What would make a tester give up:** (1) the staff side is empty; (2) the research assistant never answers; (3) language jumps back after sign-in; (4) a venture page has no documents or numbers to evaluate.

## 6. Demo completability (BRIEF16)

Built journeys (`docs/delivery/E2E_STATUS.md`): 20 rows.

| Journey | Before | After (PR + kit change K-IIP-1) |
| --- | --- | --- |
| J02 sign in / register, J53 sign out | Yes (language forced by the saved one) | Yes, page language kept |
| J03 profile + language, J06 preferences, J07 budget, J08 dashboard | Yes | Yes |
| J11/J14 discover + match, J12 venture page | Yes | Yes |
| J15 follow | Yes | Yes |
| J47 listing alerts | **No** — needs a VentureWorks change event | No (VentureWorks demo) |
| J16/J50 interest + withdraw | Yes | Yes |
| J17 founder response | **No** — the founder answers in VentureWorks | No (VentureWorks demo) |
| J09 receive a new publication | **No** — needs VentureWorks to publish | No (VentureWorks demo) |
| J10 review / re-check / suspend | **No** — staff queue empty (staff organisation) | Yes on the seeded listings (re-check) once K-IIP-1 |
| J18 diligence (investor + reviewer) | **No** — reviewer cannot see the request | Yes once K-IIP-1 |
| J39 research | **No** — no sources in the mock | **Yes** (seed loads test sources) |
| J41 consent withdrawal | **No** — VentureWorks event | No (VentureWorks demo) |
| J42 audit trail | Yes (admin in the investors' workspace) | Yes |
| J52 staff roles | Yes | Yes |
| J48 help (investor + support) | **No** — support queue empty | Yes once K-IIP-1 |
| Preview | Yes | Yes |

**Completable: 12 of 20 before → 13 of 20 with the PR alone → 16 of 20 with the kit change K-IIP-1.** The other 4 (J09, J17, J41, J47) need the VentureWorks demo publishing to IIP (cross-product, M).

**K-IIP-1 (kit, S):** give the demo reviewer and support personas `investment_reviewer` / `support_agent` **in the investors' demo organisation** (`products.investment` main), not only in the staff one — in `config/clients.demo.json` `demo_orgs.main.roles`, or as personas with `org: "main"` in `build/demo-personas-20261023`. The PR's runner applies exactly this to the demo client entry until the kit does (`DEMO_STAFF_IN_MAIN`, documented); with the kit list unchanged the staff journeys fail. Making IIP serve a separate ADS staff organisation across tenants is a product change (M) and needs an owner decision.

Nightly reset: the suite runs kit `demo-reset` + `demo-seed --reset` and then the desktop journeys again. Note: the VentureWorks double and the research mock keep their data in memory; the demo host must re-run the seed after either restarts (documented in `deploy/DEMO_DATA.md`).

## 7. Verdict and the fixes that most change it

**Can it perform its duty? Yes, with gaps.** It does discovery, matching, deal pages with honest evidence status, follow, non-binding interest and diligence with real maker-checker and audit. It lacks a data room and any conversation or commitment after interest, and on the demo its staff side is empty.

| # | Fix | Size | Plan item |
| --- | --- | --- | --- |
| 1 | Demo staff in the investors' organisation (K-IIP-1) and a reviewer/support persona on the sign-in page | S (kit) | `build/demo-personas-20261023` |
| 2 | Data room on the venture page: documents from VentureWorks with access log; team and actual KPIs with dates | M | IIP deal page; VentureWorks contract §4.1 |
| 3 | Founder Q&A thread (through VentureWorks) and interest follow-up | M | IIP-US-013 follow-up |
| 4 | VentureWorks demo publishing to IIP (new publication, changes, withdrawal) so J09/J17/J41/J47 can be shown | M (cross-product) | VentureWorks demo seed, IIP contract §6 |
| 5 | Triage shows the venture name; workspace choice explained on the sign-in page | S | IIP-US-014; kit |

## 8. Part 2 — fixes made for demo users (PR, not merged)

| Fix | Where |
| --- | --- |
| Shared demo accounts: the language chosen on the page wins after sign-in and is saved (real accounts keep IIP-AC-003-1: the saved language follows the account) | `src/App.tsx`, `src/identity.ts` (`isDemoSession`, kit `demo` claim) |
| French is the default for every browser language except English | `src/i18n.ts` |
| Language switch inside the phone menu (`drawer-lang-en/fr`); the menu closes when the current page is tapped | `src/App.tsx`, `src/styles.css` |
| Profile page no longer scrolls sideways at 360 px, and a long e-mail wraps instead of covering Save | `src/styles.css` |
| Review queue keeps its "Saved." confirmation (with the venture name) after an action | `src/screens/ReviewQueue.tsx` |
| Seed sends VentureWorks' readiness dimensions; the venture page never shows a raw key for an unknown dimension | `scripts/demo-seed.mjs`, `src/screens/VentureDetail.tsx` |
| Seed loads test research sources into the kit research mock (`DEMO_SEED_RAG_MOCK_URL` / `ADS_MOCKS_URL`) and reads the reviewer persona sub (`personas.reviewer.sub`, fallback demo admin); test added | `scripts/demo-seed.mjs`, `tests/demo-seed.test.mjs`, `deploy/DEMO_DATA.md` |
| Demo-journeys suite through the real kit sign-in page in demo mode, personas with fallback; desktop EN + phone FR for every journey, main journey (discover → venture → follow → interest → dashboard) also tablet EN/FR; language rules; nightly reset then desktop again; hosted smoke with `DEMO_BASE_URL` | `e2e/demo-journeys/`, `playwright.demo.config.mjs`, `scripts/demo-journeys.mjs`, `.github/workflows/demo-journeys.yml` |

PR: `ksondo/Intelligent-Cryptocurrency-platform` #17 (`build/demo-journeys-20261023`).

## 9. Method notes and limits

- VentureWorks is the labelled test double; e-mail and research are kit mocks. No money moves.
- Walk scripts and sweep ran from a private scratch folder against throwaway databases (not committed).
- Screenshots compressed to 128 colours; passwords masked. `d-` desktop EN, `m-` phone FR, `t-` tablet EN, `tf-` tablet FR, `s-<width>-<lang>-` sweep.

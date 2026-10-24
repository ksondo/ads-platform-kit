# Fit-for-purpose audit: Career Path

Round 17, 23 Oct 2026. Briefs: `audit/BRIEF15-fit-for-purpose.md`, `audit/BRIEF16-demo-journeys.md`, `audit/BRIEF17-audit-and-fix.md`.
Part 1 (this report) describes what we found on `main`. Part 2 fixed the small demo blockers on a separate branch (section 8).

**Owner's question:** can the person who came here get the outcome they came for?

**Verdict: Yes, with gaps.** A student or graduate can say what they want to become (or ask "what can I become with my programme?"), get a realistic path from where they are today with requirements, programmes, total cost and a cheaper route, check if they can apply, find matching scholarships and the remaining funding gap, read the job market and skills employers ask for, keep an action plan that is recalculated when they progress, save deadlines with reminders, and report wrong data that curators answer. Curated data changes go through a second curator. All of this worked for real in English and French, on phone, tablet and desktop.

The gaps:
- **On `main` the advisor never answered on the demo** ("I can't answer this reliably right now"): the demo seed did not load the test corpus into the kit RAG mock (fixed on the branch).
- **French testers were switched to English after sign-in**: the shared demo account's saved language won over the page, and switching language saved it on the shared account for the next tester. A German browser opened in English (fixed on the branch).
- **Dates were raw ISO** (`Deadline 2026-11-12`) in both languages (fixed on the branch).
- **No way to take the plan away** (PDF/print/share), and no human mentor or counsellor, which career-guidance tools usually offer.
- **All data is sample/test** (labelled), and HopeBridge funding, the job feed and the ADS Education catalogue run as mocks until their contracts are live.

## Set-up and commits tested

| Item | Value |
| --- | --- |
| Product | `ksondo/career-path-platform` |
| Code tested | `origin/main` `fb265df` (demo seed merged as PR #1) |
| Kit | `ksondo/ads-platform-kit` main `d28b6ac`, real identity in demo mode (`ADS_ENV=demo`, `DEMO_MODE=1`, `DEMO_SHOW_CREDENTIALS=1`) plus the kit mocks (email, RAG). Client from `config/clients.demo.json` (Career entry only, local return address), then `demo-bootstrap`, `demo-orgs` |
| Data | `db/migrate.mjs`, `db/seed.mjs` (sample Cameroon catalogue), `db/staff-tenants.mjs`, `db/runtime-login.mjs` (restricted login), `scripts/demo-seed.mjs` (2 learner profiles, 6 goals, 16 saved items, staff tenant). Throwaway PostgreSQL 16 databases `g6_career_*` |
| Accounts | `demo.user` and `demo.checker` (`learner` in "ADS Demo – Career Path", `curator` in "ADS Staff – Career Path curators"), `demo.admin` (owner; gets `learner`). No personas yet |
| Browser | Playwright Chromium from the front door, Career's own **Sign in with ADS** and the kit page's **Use demo account**; second curator in a second browser. 360 × 740 (touch), 768 × 1024, 1280 × 860, EN and FR |

## 1. Purpose and users

**Purpose:** a young adult in Cameroon (18+) comes to turn "I want to become X" or "what can I do with my degree?" into a concrete, costed path with funding and next steps, and leaves with a plan they can follow and be reminded about.

| User | Comes to |
| --- | --- |
| Learner (`learner`) | Profile, target career, roadmap, eligibility and funding, job market, plan, saved items, advisor, reports |
| Curator (`curator`, ADS staff only) | Add sources and requirements, approve the other curator's work, answer learners' reports |
| Partner services (Education, HopeBridge, job feed, Progress RAG) | Supply courses, scholarships, postings and cited answers (mocks in test mode) |

## 2. Market standard checklist

Yardsticks: **LinkedIn Learning / LinkedIn career tools** (skills employers ask for, courses to close a skills gap, job postings) and **career-guidance tools** such as CareerExplorer or national guidance portals (career profiles, entry requirements, study routes, costs and funding, an action plan).

| # | Expectation | Score | What happened |
| --- | --- | --- | --- |
| 1 | A profile of where I am: studies, grades, skills, languages, budget | **Works** | Seeded 3-step profile (BSc Biology, University of Buea (sample), grades /20, skills, budget). |
| 2 | Pick a target career and country; get a path | **Works** | "Medical" → Medical Doctor → Cameroon → roadmap with 7 stages and 5 gaps (`d-04-roadmap`). |
| 3 | A roadmap from today to the destination, each step with its state and evidence | **Works** | Today card, stages marked Completed / Missing / Not verifiable, source and date on each, "Sample data (test mode)" badges. |
| 4 | Gaps with what to do next | **Works** | Each gap has a consequence and a next action. |
| 5 | Study programmes to get there, including ADS Education courses, within my budget | **Works with friction** | Public and private faculties, an ADS Education listing; over-budget ones hidden and counted. **Friction:** Education catalogue is a mock; Education publishes no fees ("ask the school"). |
| 6 | What it will cost and a cheaper route | **Works** | 2,900,000 XAF per year, 20,320,000 XAF total, 14,020,000 XAF still to find; one unknown fee shown and not counted; cheaper route offered. |
| 7 | Can I apply? What if my grade changes? | **Works** | Eligible / not eligible per programme from self-reported grades; a grade scenario re-runs it. |
| 8 | Scholarships I can get, plan to apply, remaining funding gap | **Works with friction** | 4 matches (eligible, potentially eligible, not met, closed) with reasons; **Plan to apply** changes the scenario gap (`d-05-funding`). **Friction:** HopeBridge is a mock; no link to the provider's application. |
| 9 | Job market: demand, titles, cities, salary, skills employers ask for | **Works with friction** | "5 posting(s) observed", titles, cities, skills ranked (`d-06-jobs`). **Friction:** test job feed; salary often unknown. |
| 10 | Courses to close my skills gap (LinkedIn Learning's core) | **Works with friction** | Missing skills listed with matching courses by name; no link to open or enrol in the course. |
| 11 | An action plan with dates and status that updates the path | **Works** | Marking a step done → **Recalculate** → "New version 2 created. What changed: … Missing requirement → Completed"; versions kept (`d-07-plan`); notification "Your path changed (version 2)". |
| 12 | Save programmes and scholarships; deadline reminders | **Works with friction** | 8 seeded saved items with deadlines; reminders in the app or by email (kit mock). **Friction (main):** deadlines as `2026-11-12` in both languages (fixed on branch). |
| 13 | "What can I become with my programme?" | **Works** | BSc Biology → direct, adjacent and further-study options with reasons; **Explore** drafts a path (`d-08-discover`). |
| 14 | Compare routes side by side | **Works** | Duration, total cost, requirements met, scholarships, job market, stale-data flags (`d-09-compare`). |
| 15 | Ask questions and get answers with sources | **Broken (demo)** on `main` → **fixed on branch** | Every question: "I can't answer this reliably right now." The kit RAG mock had no Career corpus on the demo. The branch's demo seed loads the test corpus; the demo-journeys suite proves an answer. |
| 16 | Report wrong data and see the answer | **Works** | Report on a stage → curator puts it "in review" with a note → the learner sees the note under Help & my reports. |
| 17 | Curated data changes checked by a second person | **Works** | Curator A (desktop EN) added a source and a requirement (Draft, "A second curator must approve"); curator B (tablet FR) approved both (`d-11-curation`, `t-01-curation-approved`). **Friction:** the report queue shows `requirement: d0000000-…` (raw kind and id) instead of the item's title. |
| 18 | A human mentor or counsellor | **Missing** | Not in the MVP scope. |
| 19 | Take my plan with me (PDF, print, share with a parent or adviser) | **Missing** | No export or share. |
| 20 | Fully bilingual and usable on a phone | **Works with friction** on `main` → **fixed on branch** | Every screen translated, no overflow (section 4). **Fails on `main`:** phone FR tester → English after sign-in (`m-04-roadmap`, `m-06-jobs` …), `de-DE` → English, ISO dates. |

**Score counts (20 items, on `main`): 11 Works end to end, 6 Works with friction, 1 Broken, 2 Missing.**

## 3. The walks, step by step

### Learner (desktop 1280 EN, demo user)

| Step | Result | Screenshot |
| --- | --- | --- |
| Front door → **Sign in with ADS** → kit page → **Use demo account** | Lands on "What do you want to become?" (seeded profile, no path yet) | `d-01-landing`, `d-02-kit-login`, `d-03-first-screen` |
| Choose a career → Medical Doctor, Cameroon → build | Roadmap, 7 stages, 5 gaps, cost and cheaper route | `d-04-roadmap` |
| Advisor: "What is the entrance exam for medicine?" | **"I can't answer this reliably right now."** | — |
| Eligibility & funding → find scholarships → save → plan to apply | 4 matches, gap 14,020,000 XAF | `d-05-funding` |
| Job market | 5 postings, skills employers ask for | `d-06-jobs` |
| Action plan → done → recalculate | Version 2 with the change explained | `d-07-plan` |
| What can I become? (BSc Biology) → explore two | Options tree; two paths drafted | `d-08-discover` |
| Compare routes | Two columns side by side | `d-09-compare` |
| Saved items, notifications | 9 saved; "Your path changed (version 2)" | — |
| Report a problem on a stage | Listed under My reports, Open | — |
| Settings | Language, country, reminder channel, advisor sharing | `d-10-settings` |

### Learner on a phone (360 FR, demo user)

Same walk from a French front door (`m-01-landing`): after sign-in **every screen was in English** (`m-04-roadmap`, `m-06-jobs`, `m-07-plan`, `m-08-discover`, `m-09-compare`, `m-10-settings`). The layout held: cards stack, the compare table scrolls inside its card, the drawer opens from ☰.

### Curators (demo user desktop EN, second demo user tablet FR, staff workspace chosen on the kit page)

Source + requirement as Draft by A; A has no approve button; B approves both; B takes the learner's report into review with a note (`d-11-curation`, `t-01-curation-approved`).

### Demo admin

Signs in and gets the learner profile wizard (`d-12-admin`); Career has no admin role, which is correct for the product.

## 4. Owner rules: EN/FR and three sizes

The automatic sweep (7 pages × 3 sizes × 2 languages) could not finish: the shared walk machine was restarted twice and ran at load average 50–100, and the browser crashed mid-sweep. The results below come from the walk screenshots at 360 and 1280 px, the tablet curator walk at 768 px, and the demo-journeys suite, which passed on CI at desktop, phone 360 and tablet 768 in both languages.

| Check | Result |
| --- | --- |
| Styles load at 360/768/1280 | **Pass** (every screenshot themed: navy top bar, teal accents, cards) |
| No horizontal page scroll | **Pass** in the walk; the compare table scrolls inside its card at 360 px |
| Language switch visible | **Pass** in the top bar at all sizes; the phone drawer opens below the top bar, so the switch stays reachable (CI test "phone: the language switch stays reachable with the menu open" passed) |
| Whole page changes | **Pass** for UI strings (EN/FR dictionaries); sample data names stay in their own language by design |

| Rule | Result |
| --- | --- |
| Kit sign-in page follows the language | **Pass** |
| Language kept through sign-in | **Fail on `main`** (FR → EN for the shared demo account; switching also saved the language on the shared account). Fixed on branch |
| First visit `de-DE` gives French | **Fail on `main`** (English). Fixed on branch |
| Dates in the reader's language | **Fail on `main`** (ISO dates). Fixed on branch |

## 5. User-experience pass

- **First impression:** clear promise ("Plan your career with one ADS account": Today → My path → Destination), adults-only note, one sign-in button. Test-mode banner on every page.
- **Next step clear:** after sign-in the learner goes straight to "What do you want to become?"; the roadmap links to funding, jobs and plan.
- **Honesty:** sample data and unknown costs are labelled, never shown as facts ("Not verifiable", "1 cost item unknown and not counted"). Good.
- **Would make a tester give up:** (1) the advisor never answers on `main`; (2) a French tester is switched to English; (3) the curator's report queue shows raw ids; (4) no way to save or share the plan as a document.

## 6. Verdict and the fixes that most change it

**Can it perform its duty? Yes, with gaps.** Career Path already does what career-guidance tools do for the path itself (requirements, programmes, cost, eligibility, funding, jobs, plan), more honestly than most about data quality. It lacks take-away and human support, and its partner data is still mocked.

| # | Fix | Size | Plan item |
| --- | --- | --- | --- |
| 1 | Demo seed loads the advisor corpus; page language kept through sign-in; French default; localised dates | S | Done on branch (section 8) |
| 2 | **Export / share the plan** (PDF or print view; share link to a parent or adviser) | M | new (CP backlog) |
| 3 | Curator report queue: show the item's title and kind in words, link to it | S–M | CP-US-021 follow-up |
| 4 | Links from missing skills and programmes to the course page (ADS Education) and from scholarships to the provider's application | M | Education and HopeBridge integration contracts |
| 5 | Real curated Cameroon data, HopeBridge funding API, job-data provider | L / owner | open decisions 8, 9 |

## 7. Demo completability (BRIEF16)

Built journeys (`docs/delivery/E2E_STATUS.md`): J-05, J-01, J-02, J-03, J-04, J-06, J-11, J-12, J-15, J-17 = **10**.

| Journey | Before (main) | After (branch) | What was missing |
| --- | --- | --- | --- |
| J-01 goal-first path (includes the cited advisor) | **No** (advisor never answers) | Yes | Test corpus in the kit RAG mock, loaded by the demo seed |
| J-06 language and settings | Yes, with the sign-in language fault | Yes | Page language kept through sign-in |
| Other 8 | Yes | Yes | — |

**Completable: 9 of 10 before → 10 of 10 after.** J-15/J-17 need two curators and a learner; they work with the demo user and the second demo user in separate browsers (the second has to type its address until personas exist).

## 8. Part 2: fixes and proof

Branch `build/demo-journeys-20261023`, PR ksondo/career-path-platform#2 (not merged; reviewer merges):
- demo seed: advisor test corpus into the kit RAG mock; persona subs when present;
- language kept through sign-in (picked on the page or demo account; CP-US-019 unchanged otherwise), French default for non-EN/FR browsers, dates in the reader's language;
- `e2e/demo-journeys/` suite (desktop EN, phone FR, main journey also tablet 768 EN/FR) through the kit sign-in page, `scripts/demo-journeys.sh`, CI job `demo-journeys` (**15 passed, 1 phone-only test skipped on desktop**, PR run on `773c316`, with ci and e2e green); kit pin moved to kit main.
- `2d71b82`: the helper and seed use the kit persona keys from kit PR #20 (`learner`, `curator`) and `signInAsPersona` from the product page. **CI blocked by billing** for this commit (startup failure on push and PR runs); it changes only the persona path, which is not active until the kit personas merge.

## 9. Method notes and limits

- The walk machine was heavily shared (load average 50–100); some local steps were re-run, and CI is the reference for the suite.
- On the phone run, the walk's "signed in" check looked for the e-mail in the top bar, which is hidden below 768 px by design; the sign-in itself worked.
- Screenshots are reduced to 128 colours; passwords masked. `d-` desktop EN, `m-` phone FR, `t-` tablet FR.

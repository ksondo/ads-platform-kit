# Fit-for-purpose audit: MamaCare

Round 17, 23 Oct 2026. Briefs: `audit/BRIEF15-fit-for-purpose.md`, `audit/BRIEF16-demo-journeys.md`, `audit/BRIEF17-audit-and-fix.md`.
Part 1 (this report) describes what we found on `main`. Part 2 fixed the small demo blockers on a separate branch (section 8).

**Owner's question:** can the person who came here get the outcome they came for?

**Verdict: Yes, with gaps.** A pregnant woman can follow her pregnancy week by week, ask questions answered only from approved articles, open the danger signs in one tap, find antenatal care, request visits and see them confirmed by her linked midwife, keep her health history, and, when her clinician puts her on closer blood-pressure checks, get the urgent screen (call 119, no AI) while her care team is alerted. A parent can keep child profiles with age-band guidance. All of this worked for real, with two demo people in two browsers, in English and French, on phone, tablet and desktop.

The gaps:
- **The support desk cannot answer.** The `ads_support` role exists only in the ADS staff organisation, and tickets are visible only inside the facility organisation where they were written. In the demo, the desk is always empty, so "ask support and read the answer" stops halfway.
- **The facility administrator has nothing to do.** The demo admin (`facility_admin`) lands on the public home page. Inviting clinicians works only through the kit admin API.
- **On `main` the monitoring pathway could not start on the demo:** no approved rule set was seeded (fixed on the branch, section 8).
- **Language was lost at sign-in** for French testers of the shared demo account, and a German browser got English (fixed on the branch).
- **All clinical content is labelled "Test content – awaiting clinical review".** It is honest, but nothing is clinically approved yet (decisions D5, D10).

## Set-up and commits tested

| Item | Value |
| --- | --- |
| Product | `ksondo/Mama-care-and-intelligent-services` (local folder `mama-care-and-intelligent-services`) |
| Code tested | `origin/main` `91b70d9` (demo seed merged as PR #20; vite bump PR #21) |
| Kit | `ksondo/ads-platform-kit` main `d28b6ac`. Real identity service in demo mode (`ADS_ENV=demo`, `DEMO_MODE=1`, `DEMO_SHOW_CREDENTIALS=1`) plus the kit mocks (SMS, registry). Client from `config/clients.demo.json` (MamaCare entry only, local return address), then `demo-bootstrap` and `demo-orgs` |
| Data | `scripts/migrate.mjs`, `scripts/content.mjs mode test`, `scripts/demo-seed.mjs` (6 visit requests, 5 tickets, 5 child profiles, 8 routines). Server `EXTERNAL_MODE=test CONTENT_MODE=test`, runtime role `mamacare_app`, `MAMACARE_STAFF_TENANT_IDS=<staff>`. Throwaway PostgreSQL 16 databases `g6_mamacare_*` |
| Accounts | `demo.user` (all four main roles + all three staff roles), `demo.checker` (same), `demo.admin` (`facility_admin`). No personas yet (kit `build/demo-personas-20261023` unmerged) |
| Browser | Playwright Chromium. Every walk starts at `/`, uses MamaCare's own **Sign in** button and the kit page's **Use demo account**. The second person is in a second browser. 360 × 740 (touch), 768 × 1024, 1280 × 860, EN and FR |

## 1. Purpose and users

**Purpose:** a pregnant woman (and later a parent) in Cameroon comes to know where she is in her pregnancy, what to do next, when to worry, and to stay connected with her midwife; she leaves with a confirmed visit, reliable guidance and a safe route to urgent care. Her clinician comes to follow the mothers who linked them and act on warnings.

| User | Comes to |
| --- | --- |
| Mother (`maternal_user`) | Pregnancy timeline, guidance, danger signs, visits, health history, home checks when prescribed |
| Midwife / clinician (`professional`) | Linked mothers, visit confirmation, due date, monitoring plan, escalations |
| Parent / guardian (`parent`, `guardian`) | Child profiles, age-band guidance, activity log, child-safety help |
| ADS content author and steward | Write and approve guidance (maker-checker) |
| ADS support | Answer questions from families |
| Facility administrator (`facility_admin`) | Run the facility's team (invite clinicians, see activity) |

## 2. Market standard checklist

Yardsticks: **maternal health apps** (BabyCenter / Pregnancy+ style week-by-week tracking, WHO-based guidance, kick and symptom tools; Safe Delivery-type danger-sign content) and **a clinic's antenatal workflow** (booking visit, scheduled ANC contacts, record held by the midwife, BP monitoring with referral when raised). MamaCare deliberately keeps AI off every safety path; that rule is respected.

| # | Expectation | Score | What happened |
| --- | --- | --- | --- |
| 1 | Register the pregnancy; due date and weeks shown | **Works** | Seeded pregnancy shows "21 weeks 3 days", due date and its source ("The due date you entered"). |
| 2 | Week-by-week / stage guidance | **Works with friction** | Three stage articles under "For this stage", each with source and version. **Friction:** every article is "Test content – awaiting clinical review" (D5). The source citations ("WHO antenatal care recommendations (2016), summarised for MamaCare") stay English in French mode. |
| 3 | Ask a question; answers only from approved sources; danger words go to danger signs | **Works** | "What should I eat…" returned "From the approved library: Eating well in pregnancy…". The assistant is off (D9); no AI on the safety path. |
| 4 | Danger signs in one tap, call buttons, works offline | **Works** | Red **Danger signs** button on every screen; 119/117/118 as `tel:` links (`d-07-danger-signs`). |
| 5 | Find antenatal care near me, call the facility | **Works with friction** | Two fictional Yaoundé facilities with hours and tap-to-call (`d-06-find-care`). **Friction:** test directory only; Health's real directory contract is pending (MC-INT-03). |
| 6 | Request a visit, see its status, cancel | **Works** | "Requested" until confirmed, "Cancelled" after cancel. |
| 7 | The clinic confirms the visit with time and place; the mother sees it | **Works with friction** | The linked clinician confirmed a seeded request (phone FR) and the mother saw **Confirmed**. **Friction:** the clinician's "Visit confirmed" message disappears at once, because the mother's detail reloads and redraws the section. |
| 8 | Antenatal record: health history | **Works** | Checkboxes for earlier pregnancies, conditions, family; pre-eclampsia gives "early assessment" guidance and a **Find care** button (`d-04-history`). |
| 9 | Link my midwife and control access | **Works** | Clinician (second demo user, phone FR) made code `B2B3-9CP4`; the mother saw who it is and a purpose-specific consent, agreed, and later removed access (`m-03-pro-code`, `d-11-care-consent`). |
| 10 | Clinician-entered due date; ask for a correction | **Works** | Clinician set the date; mother asked for a check with a note; clinician corrected; mother saw "Corrected to 28 February 2027 · Demo Checker" (`d-12-correction-requested`). |
| 11 | Closer BP checks when prescribed: readings, symptom check-ins, warning → urgent screen, care team alerted, action recorded | **Broken (demo)** on `main` → **fixed on branch** | The clinician got "No approved rule set for your facility: the plan cannot start" (`m-06-no-rule-set`). The demo seed had no approved rule set. The branch seeds the repository's TEST-ONLY rule set through the maker-checker tool; the demo-journeys suite walks plan → warning reading → urgent screen → escalation → action. |
| 12 | Reminders and notifications | **Works with friction** | Bell with confirmed visits and plan reminders; reminders are discreet by design. SMS goes to the kit mock (test mode). |
| 13 | Child profiles with age guidance, activity log, safe delete | **Works** | Five seeded children; activity logged; a new child added and deleted with a confirm step (`m-07-children`, `m-08-child-activity`). |
| 14 | Child-safety help without signing in | **Works with friction** | 117/119/118 tap-to-call, "I am struggling to cope" support (`m-09-child-safety`). **Friction:** verified child-protection contacts are still `awaiting_owner`; source line English in French. |
| 15 | Pregnancy loss handled with care | **Works** | Confirm step, then bereavement support; plan and reminders stop (`d-16-loss-confirm`, `d-17-loss-support`). The nightly `--reset` restores the seeded pregnancy. |
| 16 | My data: export and consent withdrawal | **Works** | `mamacare-my-data.json` downloaded; consents listed with withdraw. |
| 17 | Ask support and read the answer | **Broken (demo)** | The mother got reference `MC-QU28PHZF`. The support desk, opened by an ADS staff account, showed nothing: `ads_support` is an ADS-staff-only role, but tickets are only visible inside the facility organisation. Nobody can answer in the demo set-up. |
| 18 | Guidance changes approved by a second person | **Works** | Author (demo user, staff workspace) proposed; her own version had no approve button; the second demo user (tablet FR) approved (`d-13-content-review`, `t-01-content-approved`). |
| 19 | Facility administrator console (team, invitations, activity) | **Missing** | The demo admin sees Home, Find care, Learn, Child safety, Help (`d-15-admin-home`). `#/facility` falls back to Home. Invitations only through the kit `/admin/v1` API. |
| 20 | Fully bilingual and usable on a phone | **Works with friction** on `main` → **fixed on branch** | All screens translated and no overflow at 360/768/1280 (section 4). **Fails on `main`:** a French tester signing in to the shared demo account was switched to English (`m-10-after-signin-lang`), and a `de-DE` browser opened in English. |

**Score counts (20 items, on `main`): 11 Works end to end, 6 Works with friction, 2 Broken, 1 Missing.**

## 3. The walks, step by step

### Mother (desktop 1280 EN, demo user)

| Step | Result | Screenshot |
| --- | --- | --- |
| Front door → **Sign in** → kit page → **Use demo account** | Back on MamaCare, signed in | `d-01-home`, `d-02-kit-login` |
| My pregnancy | 21 weeks 3 days, due date, 6 seeded visit requests | `d-03-my-pregnancy` |
| Request a visit | "Requested" | — |
| Health history (pre-eclampsia ticked) | Saved; early-assessment guidance | `d-04-history` |
| Learn → ask a routine question | Answer from the approved library | `d-05-learn-ask` |
| Find care (Yaoundé) | Two test facilities, tap to call | `d-06-find-care` |
| Danger signs | One tap; 119/117/118 | `d-07-danger-signs` |
| My checks | "Your care team has not set a monitoring plan" | `d-08-my-checks` |
| Settings → export | `mamacare-my-data.json` | `d-09-settings` |
| Help → send a question | Reference `MC-QU28PHZF` | `d-10-help` |

### Clinician and mother together (second demo user on phone FR, demo user on desktop EN)

| Step | Result | Screenshot |
| --- | --- | --- |
| Clinician: front door FR → sign in (typed address; only the demo user is shown on the kit page) | Signed in, French | `m-01-home-fr` |
| Phone menu open → language switch | Switch stays on top and reachable | `m-02-menu-open` |
| Professional → licence `MW-12345` → code | Code shown, verified by the test registry | `m-03-pro-code` |
| Mother: My care team → code → consent → agree | Linked, scopes listed | `d-11-care-consent` |
| Clinician: my mothers → open → confirm a visit (time, facility) | Mother sees **Confirmed** | `m-04-mother-detail`, `m-05-visit-confirmed` |
| Clinician: due date | "Date du terme enregistrée." | — |
| Clinician: start monitoring plan | **"Aucun jeu de règles approuvé…" (no rule set)** | `m-06-no-rule-set` |
| Mother: ask to check the date; clinician corrects | "Corrected to 28 February 2027 · Demo Checker" | `d-12-correction-requested` |

### Parent (second demo user, phone FR)

Children list with five seeded children → activity logged → child added and deleted (`m-07-children`, `m-08-child-activity`). Child safety without sign-in (`m-09-child-safety`).

### Staff (staff workspace chosen on the kit page)

Content: author proposes, second person approves (`d-13-content-review`, `t-01-content-approved`). Support desk: **empty** (item 17).

### Facility admin (demo admin)

Lands on the public menu only (`d-15-admin-home`).

### Pregnancy loss and reset

Confirm → support page (`d-16-loss-confirm`, `d-17-loss-support`); `demo-seed.mjs --reset` restored the active pregnancy and the six visit requests.

## 4. Owner rules: EN/FR and three sizes

Sweep, signed in as the demo user: 12 pages × 3 sizes × 2 languages = **72 checks; 66 clean, 6 flagged**, all text, none layout.

| Rule | Result |
| --- | --- |
| Styles load on all sizes | **Pass** (138 CSS rules on every page) |
| No horizontal scroll at 360/768/1280 | **Pass** on all 72 |
| Switch visible on every page | **Pass**, also with the phone menu open (`m-02-menu-open`) |
| Whole page changes | **Pass** for UI strings. **Flags:** child-safety source citation in English (3 sizes); seeded visit purposes are mixed EN/FR by design (sample data, not a product leak). Content-review dates and titles were English-only (fixed on branch). |
| Kit sign-in page follows the language | **Pass** |
| Language kept through sign-in | **Fail on `main`**: FR chosen → after sign-in EN, because the shared account's saved language wins (`m-10-after-signin-lang`). Fixed on branch |
| First visit `de-DE` gives French | **Fail on `main`** (English). Fixed on branch |

## 5. User-experience pass

- **First impression:** calm home page with one promise, a red **Danger signs** button and plain next steps. Test-mode banner on every page.
- **Next step clear:** yes for the mother (visits, history, find care). The clinician's caseload is clear; escalations sit on top.
- **Empty states:** helpful ("Your care team has not set a monitoring plan", "Nobody has access to your record").
- **Errors:** plain language ("No approved rule set…", "this code was already used").
- **Would make a tester give up:** (1) the clinician cannot start the plan on `main`; (2) support never answers; (3) the facility admin has nothing to do; (4) the demo user holds every role, so the mother also sees "My mothers" and the clinician sees "My pregnancy" (personas fix this in the kit); (5) only the demo user is offered on the kit page, so the second person must type the checker's address and password.

## 6. Verdict and the fixes that most change it

**Can it perform its duty? Yes, with gaps.** For the mother, the clinician and the parent the product does what a good maternal app plus a midwife's ANC follow-up does, with safety-first rules (no AI on safety paths, maker-checker on rules and content). It cannot yet serve the support desk or the facility administrator, and its clinical content awaits approval.

| # | Fix | Size | Plan item |
| --- | --- | --- | --- |
| 1 | **Support desk across organisations:** let the ADS staff `ads_support` role read and answer tickets of the facility organisations it supports (RLS policy + API scope), and notify the family when answered | M | MC-US-018; ACC-05 staff organisations |
| 2 | **Facility admin console:** team list, invite clinician (kit invitation), see linked mothers count and open escalations | M | MC-US-021 follow-up; DEMO_HOST_SETTINGS §6 MamaCare open point |
| 3 | **Demo personas** (mother-only, clinician-only, parent, author, steward, support, facility admin) and a persona picker on the kit page | M (kit) | BRIEF16 personas, `build/demo-personas-20261023` |
| 4 | **Clinical approval:** Steward approval of articles, danger signs and child-safety text; real thresholds by the named clinical lead and checker; owner-supplied child-protection contacts | Owner/clinical | D5, D10, `config/child-protection-contacts.json` |
| 5 | Small: keep the clinician's "visit confirmed" message after the reload; translate source citations | S | — |

## 7. Demo completability (BRIEF16)

Built journeys (`docs/delivery/E2E_STATUS.md`): J-24/J-17, J-30, J-01/J-07, J-02, J-31, J-32, J-33, J-34, J-09/J-14, J-21, J-18, J-29, J-28, J-22 = **14**.

| Journey | Before (main) | After (branch) | What was missing |
| --- | --- | --- | --- |
| J-34 monitoring and escalation | **No** | Yes | Approved rule set + backup contact in the demo seed |
| J-28 help and support | **No** (question yes, answer no) | **No** | Support role scope (fix 1, M) |
| All other 12 | Yes | Yes | — (language through sign-in fixed for all) |

**Completable: 12 of 14 before → 13 of 14 after.** Two-person journeys (J-33, J-34, J-21, J-29) work with the demo user and the second demo user in separate browsers; the second person has to type the checker's address until personas exist.

## 8. Part 2: fixes and proof

Branch `build/demo-journeys-20261023`, PR ksondo/Mama-care-and-intelligent-services#22 (not merged; reviewer merges):
- demo seed: TEST-ONLY rule set via maker-checker + backup contact; persona subs when present;
- language kept through sign-in (picked on the page or demo account), French default for non-EN/FR browsers;
- content-review dates and titles in the reader's language;
- `e2e/demo-journeys/` suite (desktop EN, phone FR, main journey also tablet 768 EN/FR), `scripts/demo-journeys.sh`, CI job `demo-journeys`; kit pin moved to kit main.

## 9. Method notes and limits

- The machine running the walks was heavily shared (load average above 100); a few local Playwright steps timed out and were re-run. CI is the reference for the demo-journeys suite.
- SMS and registry checks went to the kit mocks; facility directory and SoulBridge are in-process test doubles.
- Screenshots are reduced to 128 colours; passwords are masked. `d-` desktop EN, `m-` phone FR, `t-` tablet FR.

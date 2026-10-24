# Fit-for-purpose audit: Health (AfriCare / IHCP)

Round 17, 23–24 Oct 2026. Briefs: `audit/BRIEF15-fit-for-purpose.md`, `audit/BRIEF16-demo-journeys.md`, `audit/BRIEF17-audit-and-fix.md`. Part 1 describes `main`; Part 2 fixes (small items only) are on the product branch `build/demo-journeys-20261023` (see §8).

**Owner's question:** can the person who came here get the outcome they came for?

**Verdict: Yes with gaps, once two demo blockers are fixed (fixed on the branch). On `main` with the demo host's settings: No.**

- **Blocker 1, sign-in:** Health sends people back to `/signed-in`, but the kit's demo client list (`config/clients.demo.json`) registers `https://health.test.africadigitalsynergy.com/`. The demo identity refuses the sign-in: "Something went wrong. This app sent an invalid return address." (`d-00-signin-invalid-return-address.png`). Nobody can sign in on the demo host.
- **Blocker 2, demo seed:** `scripts/demo-seed.mjs` looks for the tenant ids under a top-level `health` key; the kit's `demo-orgs` writes them under `products.health`. The seed stops with "health main/staff tenant ids missing", so the demo host has **no facilities and no sample appointments**: a visitor's search finds nothing.

With both fixed, a patient can find a facility by service and city, open its profile, request an appointment (signing in from the booking page without losing it), give consent next to the form, and a receptionist confirms or declines with a reason and an alternative time; the patient gets a discreet SMS and an in-app notification, can cancel, export their data and ask for deletion. A facility admin publishes a listing through ADS review (maker-checker) and invites staff. Walked for real (API + PostgreSQL + kit sign-in + mocks), EN and FR, phone, tablet and desktop.

Gaps against a Doctolib-type booking product and a clinic's daily view:
- **No real-time slots.** The patient proposes a time; reception confirms it. Doctolib shows bookable slots per practitioner.
- **No practitioners.** Search and booking are per facility, not per doctor or specialty.
- **No clinic agenda.** Reception has one long list of requests in every status, not a day/week calendar; no arrival/check-in or no-show.
- **No reschedule** (cancel + new request) and **no staff answer screen** for help tickets.

## Set-up and commits tested

| Item | Value |
| --- | --- |
| Product | `ksondo/health` |
| Code tested | `origin/main` `8669c1e` (demo seed merged, PR #5). The two blockers were confirmed on `main`; to walk the rest, the seed's tenant lookup was patched locally and `/signed-in` added as a second return address in the local identity only. The later walks (phone, tablet) ran on the branch build (same screens; only sign-in return and language changed). |
| Kit | `ksondo/ads-platform-kit` main `d28b6ac`, identity in demo mode (`ADS_ENV=demo`, `DEMO_MODE=1`, `DEMO_SHOW_CREDENTIALS=1`) + mocks; `apply-clients` with the Health entry of `config/clients.demo.json` (local return address), `demo-bootstrap`, `demo-orgs`; client secret from `apply-clients` in `HEALTH_IDENTITY_CLIENT_SECRET`. |
| Data | `scripts/migrate.mjs` as a non-superuser owner; runtime logins in `health_app` / `health_job` (NOBYPASSRLS); `scripts/demo-seed.mjs`: 8 published facilities, 11 sample appointments, 2 care consents, 2 profiles. No clinical data. Throwaway databases `g3_identity`, `g3_health`. |
| Accounts | `demo.user`, `demo.checker`: `patient` + `reception` in "ADS Demo – Health facility", `ads_reviewer` in "ADS Staff – Health listing review". `demo.admin`: owner and `facility_admin` of the facility organisation. |
| Ports | identity 32440, mocks 32441, Health 32443, PostgreSQL 32459. |
| Browser | Playwright Chromium, service workers blocked, time zone Africa/Douala. Front door → product **Sign in** (or **Sign in** on the booking page) → kit page (**Use demo account** for `demo.user`). |

## 1. Purpose and users

**Purpose:** a person in Cameroon comes to find a health facility that offers the care they need near them and to get an appointment there, without sharing more personal data than needed; facilities come to be found and to manage incoming requests.

| User | Comes to |
| --- | --- |
| Visitor / patient | Find care by service and city, see a trustworthy profile (hours, phone, services), request and follow an appointment, control consent and data |
| Receptionist | See incoming requests, confirm, decline with a reason or propose another time |
| Facility administrator | Publish and update the facility's listing, invite and manage staff |
| ADS reviewer | Verify a listing before it becomes public (maker-checker) |
| Clinician (later) | Encounters, orders, results: later epics, not in the MVP |

## 2. Market standard checklist

Yardsticks: **Doctolib** (patient search, practitioner profile, live slots, booking, reminders, cancel/reschedule, documents) and a **clinic front desk** (day agenda, requests, arrival, no-show, staff).

| # | Expectation | Score | What happened |
| --- | --- | --- | --- |
| 1 | Sign in with the ADS account (demo host settings) | **Broken → fixed** | "This app sent an invalid return address" (`d-00`). On the branch Health returns to `/` and continues to the person's home. |
| 2 | Find care by service and city | **Works** | 8 facilities; "maternité" + Douala → 1 result; Kribi cardiology → "No facility found. Try another city or service." with **Reset search** (`d-02`, `d-03`). |
| 3 | Facility profile | **Works with friction** | Services, address, hours, **Call +237 …**, "Takes appointment requests online" (`d-04`). **Friction:** no map, photo or practitioner list; seeded hours show both languages in one string ("Lun–Sam 7h30–19h / Mon–Sat 7:30am–7pm"); an unknown link says "This facility is not listed." (clear). |
| 4 | Search by practitioner / specialty doctor | **Missing** | Facility level only. |
| 5 | Live availability, pick a slot | **Missing** | The patient types a preferred date and time; "The facility confirms the final time." (decision D7). |
| 6 | Book, signing in on the way without losing the page | **Works** | "Sign in to book. You will come back here with nothing lost." → back on the same booking page (`d-05`…`d-08`). |
| 7 | Consent at the point of booking | **Works** | Care consent required next to the form; research off by default; seeded consent shown as given (`d-07`). |
| 8 | Confirmation or decline by the facility | **Works** | Reception: **Confirm** → "Confirmed. The patient has been notified."; decline needs a reason, alternative time optional (`d-10`). |
| 9 | SMS/email confirmation and reminders, discreet | **Works** | Mock SMS: "ADS Health: your appointment at Centre Médical Akwa Démo (s5) is confirmed for Sun, 25 Oct 2026 at 10:00. Details: …/appointments" — no service name in the SMS. |
| 10 | My appointments with status | **Works** | 9–11 cards: Requested, Confirmed, Declined (with reason and alternative), Cancelled (`d-09`). |
| 11 | Cancel and reschedule | **Works with friction** | Cancel: "Cancelled. The facility has been told." with a 24 h cut-off. **No reschedule** (cancel + new request). |
| 12 | Clinic agenda (day/week, per practitioner) | **Missing** | Reception has a list only. |
| 13 | Reception queue usable at the desk | **Works with friction** | All requests of the organisation in one list, every status mixed, no date grouping, filter or facility name (`m-reception.png`, 20+ cards on a phone). The demo accounts hold patient **and** reception, so a "patient" tester lands on the reception queue after sign-in (`m-03`). |
| 14 | Arrival / check-in / no-show | **Missing** | Not in the MVP. |
| 15 | Facility listing with ADS review (maker-checker) | **Works** | Admin drafts and submits ("In review"); the reviewer must write what they verified; the listing becomes public (`d-14`, `d-15`; demo-journeys suite). Own-facility approval is refused (e2e). |
| 16 | Staff invitations and roles | **Works** | Through the kit admin API with the product's client secret; invitation e-mail in test mode (demo-journeys suite). Needs `HEALTH_IDENTITY_CLIENT_SECRET` on the demo host, otherwise "Only an administrator of this facility can manage staff." |
| 17 | Notifications centre | **Works** | Confirmation and decline notices with links, mark as read (`d-11`). |
| 18 | Help and support | **Works with friction** | "Sent. Your reference is HLT-…"; emergency words light the emergency panel. **No staff screen to answer**; tickets stay open. |
| 19 | Export and deletion with medico-legal retention | **Works** | JSON download; "Done. Deleted: profile, support messages, research consent. Kept by law for 10 years: 10 appointment records." |
| 20 | EN/FR on phone, tablet, desktop; emergency info | **Works with friction → fixed** | All screens pass (styles, `lang`, no horizontal scroll, switch reachable with the phone menu open, 44 px high). **Friction:** the profile's saved language overrode the page choice at sign-in (EN tester got the French reception screen); `de-DE` opened in English. On a phone the emergency panel sits above the page content on every screen (`m-reception`). |

**Score counts (20 items): 9 Works end to end, 6 Works with friction, 1 Broken, 4 Missing** (on `main`; the broken item and two friction items are fixed on the branch).

## 3. The walks

### Patient (desktop 1280 EN, `demo.user`)

| Step | Result | Screenshot |
| --- | --- | --- |
| Front door (anonymous): 8 facilities, search, no-match, profile | OK | `d-01`…`d-04` |
| Request an appointment → "Sign in to book" → kit demo panel → workspace "Health facility" | Back on the booking page | `d-05`, `d-06-kit-login`, `d-06-kit-workspace` |
| Vaccination at Clinique Démo Bastos, consent already given | "Requested — the facility will confirm." | `d-07`, `d-08` |
| My appointments | 11 cards, all statuses | `d-09` |
| Settings: phone + SMS channel | "Settings saved." | `d-12` |
| Second request (Akwa), confirmed by reception | SMS received, discreet | — |
| Cancel one appointment | "Cancelled. The facility has been told." | — |
| Help ticket | "Sent. Your reference is HLT-…" | `d-13` |
| Export, deletion request | JSON; 10-year retention explained | — |
| Sign out | Front door again | — |

### Reception (desktop, `demo.checker`) and facility/review (`demo.admin`, `demo.user` in the review workspace)

| Step | Result | Screenshot |
| --- | --- | --- |
| Sign-in lands on /reception (French: the seeded profile language) | Queue of 12–14 requests | `d-10` |
| Confirm the patient's request; decline another with reason + alternative | Confirmed / Declined, patient notified | `d-10`, `d-11` |
| Admin drafts "Clinique … Limbe", submits | "In review" | `d-14` |
| Reviewer writes what was verified, approves | Published; public search finds it (suite) | `d-15` |
| Admin invites a receptionist | Invitation listed; e-mail in the mock (suite) | — |

### Phone 360 FR (`demo.checker`) and tablet 768 EN/FR (`demo.user`)

Front door, sign-in, search Douala → Maternité → booking → "Demandé — l'établissement va confirmer.", appointments, reception, settings, help, notifications: all OK, no horizontal scroll; the language switch stays reachable with the menu open (`m-01`…`m-07`, `m-appointments`, `m-settings`). Tablet EN: sign-in, search, booking, appointments, reception OK; tablet FR: sign-in, search and booking OK (`t-*`); the last tablet FR pages could not be captured because the shared machine's browser crashed (memory), not because of Health.

## 4. Owner rules: EN/FR and three sizes

| Rule | Result on `main` | After the branch |
| --- | --- | --- |
| Styles on all sizes | Pass | Pass |
| Switch visible, also with the phone menu open | Pass (header button "English/Français", 44 px high) | Pass |
| Whole page changes (incl. server codes → sentences) | Pass; seeded facility hours are bilingual strings in both languages (data, not UI) | Same |
| Kept through sign-in (shared demo account) | **Fail**: EN page, account profile FR → French after sign-in | Pass: the page choice wins when picked before sign-in, and always for demo accounts (`demo` claim) |
| `de-DE` first visit gives French | **Fail** (English) | Pass |
| No horizontal scroll | Pass at 360/768/1280 | Pass |

## 5. User-experience pass

- **First impression:** "Find care near you" with the search form and the emergency numbers (117, 118, 119) visible at once; good for the setting. On a phone the emergency panel comes **before** the content of every page, so the reception queue or a booking starts below the fold.
- **Next step is clear:** booking explains that the facility confirms the time; declines carry a reason and an alternative; cancel explains the 24 h cut-off.
- **Privacy:** consent next to the form, SMS without the service, deletion explains what the law keeps. Strong.
- **Things that make a tester give up:** (1) on the demo host, sign-in fails and the directory is empty (both fixed on the branch); (2) a "patient" tester lands on the reception queue (demo accounts hold both roles; kit personas `patient`, `reception`, `facility-admin`, `reviewer` solve it); (3) no slots: "pick any time and wait" feels unlike Doctolib.

## 6. Verdict and the fixes that most change it

**Can it perform its duty? On the demo host as merged: No. With the branch: Yes, with gaps** (request-based booking, no practitioners, no agenda).

| # | Fix | Size | Plan item |
| --- | --- | --- | --- |
| 1 | **Sign-in return address and seed tenant lookup** (demo blockers). | S | Done on the branch |
| 2 | **Slots**: facility opening hours + service duration → bookable slots; reception confirms automatically or by rule. | L | D7 slot/schedule engine |
| 3 | **Reception day view**: today/this week, filter by status and facility, arrival and no-show. | M | HLT-US-009 follow-up, J-13 |
| 4 | **Practitioners** on facility profiles and in search. | M/L | Later epic E-HLT-12 |
| 5 | **Reschedule** and a **staff answer screen** for help tickets. | M | HLT-US-010, HLT-US-013 |
| 6 | **Phone layout**: emergency panel as a compact bar (tap to expand) so content comes first. | S | UIUX reference |

## 7. Demo completability (BRIEF16)

Built journeys (`docs/delivery/E2E_STATUS.md`): J-20, J-21, J-01, J-14, J-26 review, J-26 staff, J-15, J-02, J-25, J-11/J-22, J-23, J-17 = **12**.

| Journey | Before (main + kit demo settings) | After (branch) | What was missing |
| --- | --- | --- | --- |
| J-01 discovery | **No**: empty directory | Yes | Seed read the wrong tenants-file shape |
| All signed-in journeys (11) | **No**: sign-in refused | Yes | Return address `/signed-in` not registered; product now returns to `/` |
| J-21 language | **No**: saved profile language wins | Yes | Product fix |
| J-26 staff | Needs `HEALTH_IDENTITY_CLIENT_SECRET` (from `apply-clients`) in the Health server settings on the demo host | Yes when set | Deploy setting |

**Before: 0 of 12. After: 12 of 12** (J-26 staff with the client secret set on the host). Two-person journeys use two browsers: patient + receptionist, admin + reviewer. With the kit personas (kit PR #20) the seed and suite use `patient`, `reception`, `facility-admin`, `reviewer` automatically.

## 8. Part 2: fixes on `build/demo-journeys-20261023` (product repo)

- Sign-in returns to `/` (registered in the kit demo list); from the front door the app continues to `/signed-in` so people still land on their home screen.
- Demo seed reads `products.health.tenants` (kit `demo-orgs` shape; the old shape still works; the seed test now uses the kit shape) and persona subs (`patient`, `facility-admin`, `reception`, `reviewer`) with fallback to `DEMO_USER_SUB`/`DEMO_USER2_SUB`/`DEMO_ADMIN_SUB`.
- Language picked before sign-in (and always for demo accounts) wins over the profile language; French for browsers asking neither EN nor FR.
- `e2e/demo-journeys/` + `playwright.demo.config.mjs` + CI job: discovery → booking → reception confirms (desktop EN, phone FR, tablet EN/FR), cancel/settings/help/export/deletion, language, listing review and staff invitation.

M/L items left: slots, practitioners, reception day view with arrival/no-show, reschedule, help answer screen, compact emergency bar on phones.

## 9. Method notes and limits

- No health data inference: all people, facilities and appointments are fictitious seed or test values; no clinical content exists in the product.
- The shared machine restarted twice and ran at load averages of 50–120 during the audit; several walk steps were re-run, and the tablet FR pages after booking could not be captured. Timings in logs reflect that.
- Screenshots: 128-colour PNG, passwords masked. `d-` desktop EN (the reception screens are French because of the language bug above), `m-` phone FR, `t-` tablet.

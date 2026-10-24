# Fit-for-purpose audit: Fleet Guard

Round 15, 23 Oct 2026. Brief: `audit/BRIEF15-fit-for-purpose.md`. This report only describes what we found. Nothing was fixed.

**Owner's question:** can the person who came here get the outcome they came for?

**Verdict: Yes, with gaps.** A fleet manager, a driver and a mechanic can run the core maintenance loop from start to finish. The loop is:

1. register the vehicle and its papers;
2. assign a driver;
3. the driver does a pre-use check, logs fuel and meter readings (also offline) and reports a breakdown;
4. the manager turns the defect or breakdown into a work order;
5. the mechanic finishes the work with photo evidence;
6. a second person approves the return to service;
7. the dashboard, alerts and history update.

All seven steps worked for real against the API and PostgreSQL, in English and French, on phone, tablet and desktop.

The gaps:
- **The partner user has nothing.** The role exists but has no screens and cannot be invited.
- **Nothing can be exported or reported.**
- **No GPS or telematics.** Samsara-style users expect this.
- **No parts stock.**
- **Several texts stay in English in French mode:** alerts, notifications, asset history, import errors.
- **The phone menu covers the language switch.** This breaks an owner rule.

## Set-up and commits tested

| Item | Value |
| --- | --- |
| Product | `ksondo/fleet-guard-and-intelligent-services` |
| Code tested | `8d86909`: `origin/main` `36648fb` with `build/demo-seed-20261020` merged locally (a fast-forward, nothing pushed). During the audit the reviewer merged the same branch into main as `feb1ec4` (PR #17). `git diff 8d86909 feb1ec4` is empty, so the tested code **is** current main. |
| Kit | `ksondo/ads-platform-kit` main `3997342`. Real identity service in demo mode (`ADS_ENV=demo`, `DEMO_MODE=1`, `DEMO_SHOW_CREDENTIALS=1`) plus the kit mocks (email/SMS). Clients came from `config/clients.demo.json` (Fleet Guard entry only, with a local redirect). Then `demo-bootstrap` and `demo-orgs` ran. |
| Data | `db/migrate.mjs`, then `db/staff-tenants.mjs`, then `db/demo-seed.mjs` (49 rows in "ADS Demo – Test Fleet"). PostgreSQL 16 with throwaway DBs `fa_fg_identity` and `fa_fg_app`. The server ran as a restricted login that is a member of `fleetguard_app`. |
| Accounts | `demo.user` (all 12 fleet roles in the demo fleet), `demo.checker` (same roles; linked by the seed as the driver "Second Demo User"), `demo.admin` (`owner_admin`). |
| Ports | identity 32140, mocks 32141, Fleet Guard (API + web, one origin) 32142, PostgreSQL 32159. |
| Browser | Playwright Chromium. Every journey starts at `/` and goes through the product's own **Sign in** button and the kit sign-in page. Sizes 360 × 740 (touch), 768 × 1024 and 1280 × 860, each in EN and FR. |

## 1. Purpose and users

**Purpose:** a fleet owner or manager in Cameroon comes to keep vehicles and machines safe, legal and working: papers valid, maintenance on time, breakdowns repaired and approved. They leave knowing which assets are available, what is overdue and what it costs. Drivers and mechanics come to record their part of that work from a phone.

| User | Comes to |
| --- | --- |
| Fleet owner / admin (`owner_admin`) | Set up the fleet, invite the team, set units, see the whole picture |
| Fleet manager / workshop manager | Register assets and documents, assign drivers, plan maintenance, turn defects into work orders, approve return to service, watch alerts and costs |
| Driver / equipment operator | See "my vehicle today", do the pre-use check, log fuel and meter readings, report a breakdown, even with no signal |
| Mechanic / technician | See assigned work orders, do the work, record parts, submit evidence |
| Partner (reseller, external garage) | Look after customer fleets they manage; receive and complete outside work orders |

## 2. Market standard checklist

The yardsticks are **Fleetio** (fleet maintenance: assets, inspections, issues, work orders, service reminders, parts, fuel, reports) and **Samsara** (driver app, DVIR inspections, live GPS, safety, dashboards). The 20 items below are what any fleet manager or driver expects from this type of product, whatever our own design looks like.

| # | Expectation | Score | What happened |
| --- | --- | --- | --- |
| 1 | Asset register: add, search, filter, open a detail page with specs, meter and status | **Works with friction** | Adding an asset worked ("Asset added. Next: add its documents."). Search by plate found 1 row. The detail page has 7 tabs. **Friction:** the seed stores 3 machines with class `machine`. The list shows the raw word "machine" (both languages) and the detail page shows a blank class ("· Owned · 12,100 h"). The seed's buses and trucks are the generic class `vehicle`, so the class filter "Bus"/"Truck" never finds them. No photo or VIN field. On a phone, plates wrap across lines ("CE- / 619-FA"). |
| 2 | Bulk import from a spreadsheet | **Works with friction** | The CSV preview showed 2 valid rows and 1 rejected row, and "Nothing is saved until you confirm". Saving gave "2 assets saved" and a download of the rejected rows. **Friction:** the reasons are developer codes, `assetClass: one_of; Plate: plate_or_serial_required; baselineMeter: range`, the same in FR. |
| 3 | Documents (insurance, technical inspection, vignette, carte grise) with expiry dates and reminders | **Works** | Insurance was added with a file: "Document saved". The expiry date and days left show on the asset. A warning alert appeared at once with "EMAIL sent (test)". The expired technical inspection on the truck shows as a critical alert with a **Renew document** button. |
| 4 | Drivers and operators: licence, expiry, assignment to a vehicle | **Works with friction** | Assigning a driver to a vehicle gave "Assignment started". Assigning the operator whose licence had expired was **refused** with a clear reason, and an alert was raised. **Friction:** at **768 px** the drivers table is wider than the screen (17 px horizontal scroll). The "Assigned" column and the **Assign driver** button are cut off on the right (`s-768-fr-p-drivers.png`). The licence category of the seeded operator shows as the raw word "equipment". |
| 5 | Driver home: "my vehicle today" with one-tap actions | **Works with friction** | After assignment, the driver sees the plate, status and last reading, and four big buttons: fuel, meter, pre-use check, breakdown (`m-drv-03-my-vehicle.png`). **Friction (demo):** the seed does not assign the demo driver to any vehicle, so a tester sees "No vehicle is assigned to you right now" until a manager assigns one. Both demo users also carry all 12 roles, so the "driver" lands on the manager dashboard, not on My vehicle. A tester cannot see the driver-only experience. |
| 6 | Pre-use inspection (DVIR) with photo, defect and "do not use" | **Works** | 9 items; 5 are marked *safety*. One tyre problem gave: "Problem reported. Your manager was alerted. Do not use this vehicle until it is reviewed." The asset changed to *Do not use*, and an open defect appeared on the work-order board. |
| 7 | Fuel and meter log with receipt photo and an odometer sanity check, also offline | **Works** | 60 L at 840 XAF with a receipt: "Fuel saved." It appears on the asset (60 L · 50,400 FCFA) and on the dashboard. A meter reading **lower** than the last one was saved but marked "sent to your manager for review". **Offline:** with the network cut, a reading was "Saved on this device · Waiting to send" under the offline banner. It was sent by itself when the network came back, and the queue emptied. |
| 8 | Breakdown / issue report with location → downtime | **Works** | Description, place ("Péage de Boumnyébel") and **Use my location**. Then "Breakdown reported. Your manager was alerted." The asset changed to *Down*, with "Down since" and a downtime counter. The breakdown shows under Breakdowns on the work-order board. |
| 9 | Defect or breakdown → work order → assign a mechanic | **Works** | "Open work order" from the defect and from the breakdown prefills the asset and the title. A technician can be chosen. The board is grouped by status (Open, In progress, Awaiting approval, Completed, Cancelled). |
| 10 | Mechanic completes the work with evidence; someone else approves the return to service | **Works with friction** | Start, then a confirmation, then "Work done" with a photo, then "Completion submitted for approval". When the same person tried to approve: "You did this work, so another manager must approve it" (maker-checker holds). The second demo user approved: "Approved. The asset is back in service." **Friction:** once completed, the work order **no longer shows the work done or the evidence**; the card is empty (`m-drv-15-approved.png`). The timeline shows "Open" twice (the assignment is drawn as Open). There is no labour time and no parts cost on the work order. |
| 11 | Preventive maintenance by km, engine hours or date, with due status | **Works** | 6 seeded plans show "x km left / next date" with OK or Due. Due plans link to their open work order and raise "Service due" alerts. A new plan (5,000 km / 120 days) gave "Plan saved". |
| 12 | Alerts and notifications by severity, acknowledge, email/SMS choice | **Works with friction** | Critical and warning alerts each have an **Act** link to the right screen. Acknowledging asks for a note ("what you will do"). There is a bell with an unread count, and per-severity email/SMS choices in Settings. **Friction:** the alert and notification texts are **English even in French mode**, for example "Insurance for … expires in 18 days", "Breakdown: … is down", "Meter reading … is lower than the last one … Please review", "Defect reported … : tyres" (the item key is raw too). |
| 13 | Dashboard: availability, downtime, maintenance due, compliance, fuel, cost | **Works with friction** | 6 tiles, each with a period, an "as of" time and a link to the records behind it. The figures moved correctly after the walk (fuel 60 L, cost 135,400 FCFA, 1 open breakdown). **Friction:** no charts or trends, no fuel economy (L/100 km), no utilisation. On a fresh demo the truck is *Down* but Downtime says "0 min / 0 open breakdowns", because the seed has no breakdown and no fuel in the last 30 days. FR plural: "1 pannes en cours", "1 expirés". |
| 14 | Operating costs per asset, and cost per km/hour (total cost of ownership) | **Works with friction** | A cost entry (category, amount in XAF, optional evidence) gave "Coût enregistré" (FR run) and shows on the dashboard. **Gap:** no cost per km/hour, no fuel economy, no repair-vs-replace view. These are planned LATER (EP-FG-10, FG-CAP-17). |
| 15 | Asset history / audit trail | **Works with friction** | Every action is recorded with who and when. **Friction:** the History tab shows raw event codes, `work_order.open`, `inspection.failed`, `fuel.create`, `breakdown.report`, in both languages (`m-fr-asset-history.png`). |
| 16 | Team: invite a driver or mechanic with a role; remove access | **Works with friction** | The owner invited a technician and got "Invitation sent. The ADS administrator grants the role in the shared sign-in." The person is listed as *Invited*, and Deactivate works. **Friction:** the owner cannot finish onboarding alone; an ADS administrator must grant the role (FG-B-01, kit invitations). `partner` cannot be invited. |
| 17 | Reports and export (CSV/PDF of assets, work orders, fuel, costs) | **Missing** | No report or export anywhere. This is planned LATER (EP-FG-14, FG-B-11). Fleetio users expect it on day one. |
| 18 | Partner: reseller console or external workshop work orders | **Missing** | The `partner` role has no capability in `src/server/roles.mjs`. A partner-only user would land on Help. It cannot be invited (`INVITABLE_ROLES`). External-garage work orders do not exist. Planned as FG-B-02 (PILOT-MVP) and FG-CAP-12 (LATER). |
| 19 | Live GPS / telematics map, trips, geofences | **Missing** | There is only manual meter entry. Planned LATER (FG-CAP-18, EP-FG-08). This is the core of Samsara-type tools; Fleetio-type maintenance tools treat it as optional. |
| 20 | Parts inventory: stock, reorder, cost into the work order | **Missing** | A work order can record a part fitted or removed by serial number (anti-swap tracking). There is no stock, supplier or reorder. Planned LATER (FG-CAP-16). |

**Score counts (20 items): 6 Works end to end, 10 Works with friction, 0 Broken, 4 Missing.**

## 3. The walks, step by step

### Manager (desktop 1280 EN; again at tablet 768 FR)

| Step | Result | Screenshot |
| --- | --- | --- |
| Front door → **Sign in** → kit demo page → **Use demo account** | OK, lands on the Fleet dashboard | `d-mgr-01-landing`, `d-mgr-02-dashboard` |
| Availability tile → Assets → search "CE-103" → open truck → 7 tabs | OK | `d-mgr-03…05-*` |
| Add asset (taxi, plate, meter) | "Asset added. Next: add its documents." | `d-mgr-06-*` |
| Add insurance document with file | "Document saved." | `d-mgr-07-document` |
| Drivers → assign "Second Demo User" to CE-002-S1 | "Assignment started." | `d-mgr-08-*` |
| Assign an operator whose licence has expired | Refused with the reason, alert raised | `t-mgr2-03-expired` |
| Work orders → open a work order from a defect, technician chosen | Created | `d-mgr-09/10-*`, `t-mgr2-04…06` |
| Start → submit completion with photo | "Completion submitted for approval." | `d-mgr-11-*`, `t-mgr2-07` |
| Approve own work | Refused (maker-checker) | `d-mgr-12-self-approve` |
| Maintenance → new plan | "Plan saved." | `d-mgr-13-*` |
| Alerts → acknowledge with a note | Done | `t-mgr-14-*` |
| Breakdown → open work order | Created | `t-mgr2-08/09` |
| Asset → Costs → add 85,000 XAF | "Coût enregistré." | `t-mgr2-10/11` |
| Dashboard after the walk | Figures updated | `t-mgr2-12-dashboard` |
| CSV import (2 good rows, 1 bad) | Preview, then "2 assets saved" and rejected rows downloadable | `d-mgr-20/21-*` |

Some steps in the second (tablet) manager run stopped because the first run had already used the seeded defect and driver. They were repeated on fresh records (the `t-mgr2-*` screenshots) and passed. These were data effects, not product faults.

### Driver and checker (phone 360 FR, `demo.checker`)

| Step | Result | Screenshot |
| --- | --- | --- |
| Front door → FR → Sign in | Lands on the manager dashboard (all roles) | `m-drv-01/02` |
| Menu → Mon véhicule | Vehicle card and 4 big buttons | `m-drv-03-my-vehicle` |
| Pre-use check, tyres = problem + note | "Problème signalé… N'utilisez pas ce véhicule avant contrôle." | `m-drv-04/05` |
| Fuel 60 L, receipt photo | "Carburant enregistré." | `m-drv-06/07` |
| Meter lower than last | Saved and marked for review | `m-drv-08-meter` |
| Breakdown with place | "Panne signalée. Votre gestionnaire est averti." | `m-drv-09/10` |
| Offline meter reading, then back online | Queued, then sent by itself | `m-drv-20/21` |
| As checker: approve the mechanic's work | "Approuvé. L'engin est remis en service." | `m-drv-12…15` |

### Owner (desktop 1280 EN, `demo.admin`)

| Step | Result | Screenshot |
| --- | --- | --- |
| Sign in | Lands on the dashboard; Team appears in the menu | `d-own-01-home` |
| Team → invite a technician | "Invitation sent. The ADS administrator grants the role…" | `d-own-02/03` |
| Settings | Fleet units can be edited (owner only) | `d-own-04-settings` |

### Mechanic and partner

The mechanic steps (start, evidence, parts, submit) were walked by `demo.user`, which holds the technician role. No demo account has **only** the technician, driver or partner role. So the role-limited menus were checked in the code (`roles.mjs` `CAN`), not seen in the browser. A partner-only user would see Settings and Help only.

## 4. Owner rules: EN/FR and three sizes

Sweep: every menu page plus the asset detail, the documents tab, the work-order detail and the Team page (as owner), at 360/768/1280 in EN and FR: **116 checks passed and 8 found problems.** The checks covered: styles loaded (208 CSS rules, Inter font, dark top bar), `<html lang>`, the switch visible, no horizontal scroll, and a French text leak check. Screenshots are named `s-<width>-<lang>-*`.

| Rule | Result |
| --- | --- |
| Styles load on all sizes | **Pass**: every page at every size has the theme |
| Switch visible on every page | **Pass** in the top bar. **Fail inside the phone menu:** the drawer covers the top bar, so the EN/FR switch cannot be reached while the menu is open (`s-360-en-menu-open.png`, `s-360-fr-menu-open.png`). The buttons are 44 × 40 px, just under the 44 px target. |
| Whole page changes | **Pass** for every UI string (422/422 keys translated). **Fail for server-made text:** alerts, notifications, the asset History tab (`work_order.open` …) and CSV import errors stay in English or show raw codes. Seed values `machine` and `equipment` show raw. |
| Persists after reload | **Pass** (landing and signed-in pages) |
| Persists after sign-in / sign-out | **Pass**. Also: a choice made in one browser follows the account into a fresh browser |
| Kit sign-in page follows the language | **Pass** ("Environnement de démonstration / Essayer la démo ADS") |
| No horizontal scroll | **Pass** except **Drivers at 768 FR** (17 px; columns cut off) |
| First visit `de-DE` should give French (plan §4.2.5) | **Fail**: it gives English |
| Phone menu | Opens and reaches every section. Tapping the page you are already on leaves the drawer open; you must tap outside to close it. |

## 5. User-experience pass

- **First impression:** the landing page says in one line what the product is for ("Run your fleet with fewer surprises"), lists 4 benefits and has one clear **Sign in**. After sign-in the dashboard is calm and every tile says what it counts, for what period and links to the records. Good.
- **Next step is clear:** success messages say what to do next ("Asset added. Next: add its documents."). Alerts carry an **Act** or **Renew document** button. Driver buttons are big and labelled.
- **Empty states:** they are present and helpful ("No vehicle is assigned to you right now. Ask your fleet manager."; "No documents yet. Add insurance, technical inspection and road tax."). On the demo, though, the driver's first screen is exactly this empty state, because the seed does not assign the demo driver.
- **Error messages:** form errors on screens are plain language (expired licence, self-approval, file too big). Import errors and server-made texts are not (see §4).
- **Mobile:** the driver app is well suited to a phone: big buttons, offline queue, camera capture. The product name is cut to "ADS Flee…" at 360 px. Tables (assets, drivers) are cramped on a phone and overflow on a tablet.
- **Speed:** locally the landing page is ready in 170 ms; the slowest API call is 163 ms (notifications); the JS bundle is 79 kB gzipped. Nothing slow.
- **Things that would make a tester give up:** (1) a "driver" who signs in sees the manager's dashboard and an empty My vehicle; (2) a French tester sees English alerts and notifications; (3) a partner tester has nothing to do; (4) on a phone, they cannot switch language once the menu is open.

## 6. Verdict and the fixes that most change it

**Can it perform its duty? Yes, with gaps.** For an owner-operated fleet (manager, drivers, in-house mechanic) it does what Fleetio's core does: assets, papers, inspections, issues, work orders with approval, service reminders, fuel, costs and alerts. It does that bilingually and offline-capable. It cannot yet serve a partner, give reports, track location or manage parts stock.

| # | Fix | Size | Plan item |
| --- | --- | --- | --- |
| 1 | **Translate server-made text.** Store alerts, notifications and history as a code with parameters and render them in the reader's language. Map import errors to sentences. Add the classes `machine`/`vehicle` and the licence category `equipment` to the dictionary, or seed specific classes (`bus`, `truck`, `excavator`…). | M | BILINGUAL_RESPONSIVE_MOBILE_PLAN §4.2.2 (leak check); FG-J-08, FG-J-14 |
| 2 | **Phone and tablet layout fixes.** Keep the EN/FR switch reachable with the menu open (put it in the drawer, or keep the top bar above it). Close the drawer when the current page is tapped. Make the switch buttons 44 px. Show assets and drivers as cards below 1,024 px (drivers overflows at 768). Default `de-DE` to French. | S | BILINGUAL_RESPONSIVE_MOBILE_PLAN §4.2–4.3, K2 |
| 3 | **Partner console:** make `partner` invitable and give it read access to assets, alerts and work orders of the fleets it manages, plus support cases. External-garage work orders follow later. | L | FG-B-02 (PILOT-MVP), FG-CAP-11; FG-CAP-12 (LATER) |
| 4 | **Reports and export:** CSV/PDF for assets, work orders, fuel and costs; fuel economy and cost per km/hour on the asset and the dashboard. Also keep work done and evidence visible on completed work orders. | M | EP-FG-14 / FG-B-11 (now LATER: recommend bringing basic export forward); EP-FG-10 / FG-CAP-17 (partial) |
| 5 | **Make the demo show each person's job.** The seed should assign the demo driver to a vehicle, add a breakdown for the *Down* truck and some fuel in the last 30 days. The kit should give single-role demo access (driver-only, technician-only, partner) or a role switcher. The team invite should finish the role grant without an ADS administrator. | S (seed) + M (kit) | DEMO_HOST_SETTINGS / BRIEF12 seed; FG-B-01 (kit invitations) |

Smaller items noted above: the duplicate "Open" in the work-order timeline, French plurals ("1 pannes"), the plate wrapping on phone, and no asset photo or VIN.

## 7. Method notes and limits

- Each persona was tested only as far as the demo accounts allow. The two demo users carry every fleet role, so role-limited menus (driver-only, technician-only, partner) were read from `src/server/roles.mjs` and not seen.
- Email/SMS went to the kit mocks. Delivery was confirmed in the app ("EMAIL sent (test)"), not in a real inbox.
- No telematics, AI assistant or billing was tested; none is built.
- Screenshots are compressed to a 128-colour palette to keep the repository small. `d-` is desktop EN, `t-` is tablet FR, `m-` is phone FR, and `s-<width>-<lang>-` is the bilingual sweep.
- The walk scripts are not committed. They ran from a private scratch folder against throwaway databases.

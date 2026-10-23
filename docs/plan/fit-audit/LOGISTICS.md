# Fit-for-purpose audit: ADS Logistics

Round 17, 23 Oct 2026, agent g1. Briefs: `audit/BRIEF15-fit-for-purpose.md`, `audit/BRIEF16-demo-journeys.md`, `audit/BRIEF17-audit-and-fix.md`.
Part 1 describes `origin/main`. Part 2 fixes are on `ksondo/Logistics` branch `build/demo-journeys-20261023` (see §7).

**Owner's question:** can the person who came here get the outcome they came for?

**Verdict: Yes, with gaps.** A sender (shipper) can price a parcel, book it with contacts, pay by mobile money (test mode), download a label and follow it on a timeline. An operator's dispatcher assigns a courier. The courier accepts, collects with a photo and waybill check, goes in transit and arrives. The parcel can then be delivered and the sender sees **Delivered**. The recipient can track it on a public page without an account. All of this worked against the real API, PostgreSQL with row-level security, the kit sign-in and the kit mocks, in EN and FR.

The gaps:
- **The demo could not finish a delivery the normal way.** The recipient's one-time code goes by SMS to a fictitious phone (mock capture), so no tester can read it. The only way through was to type a wrong code three times, which locks the code, then send a photo proof and have the dispatcher confirm it.
- **The demo dispatch board had no courier.** The seed created no approved courier ("No courier is available"), so a tester had to register as a courier and get the admin to approve before anything could be assigned.
- **Quotes only work inside one zone.** Bastos → Mvog-Ada, one of the seed's own routes, gives "No service covers this route yet". The area box offers no suggestions, so testers must guess area names.
- **No live map or ETA, no cash on delivery, no reports.** These are what Glovo, Gozem or DHL users expect on day one.
- **The shared demo account's saved language overrides the page language after sign-in.** A non-EN/FR browser gets English. On the phone, the open drawer hides the language switch.

## Set-up and commits tested

| Item | Value |
| --- | --- |
| Product | `ksondo/Logistics` `origin/main` `edd01ca` (demo seed merged, PR #11) |
| Kit | `ksondo/ads-platform-kit` main `d28b6ac`. Identity in demo mode (`ADS_ENV=demo`, `DEMO_MODE=1`, `DEMO_SHOW_CREDENTIALS=1`) through `ads-e2e up` + mocks. `demo-bootstrap` and `demo-orgs` were run (Logistics and Hub entries, local redirects). Logistics is registered with admin roles and a client secret (admin API). |
| Data | Migrations 001–013, then `scripts/demo-seed.mjs` (5 zones, 10 prices, 4 staff invitations, 8 shipments in "ADS Demo – Logistics shipper"). PostgreSQL 16, throwaway DBs `g1_identity`, `g1_log_app`. The API ran as `logi_e2e_runtime` (no superuser, no BYPASSRLS). Payments, SMS and KYC were mocks (test mode banner shown). |
| Accounts | `demo.user` and `demo.checker`: `dispatcher` and `courier` in "ADS Demo – Logistics operator", `shipper` and `merchant` in "ADS Demo – Logistics shipper". `demo.admin`: `operator_admin` in both. Each sign-in shows the kit "Choose a workspace" page. |
| Ports | identity 32400, mocks 32401, Logistics 32403, PostgreSQL 32419 |
| Browser | Playwright Chromium from the front door (`/`, **Sign in**, kit page). `demo.user` uses **Use demo account**; the others are typed. Passwords are masked. Sizes 360 × 740 touch, 768 × 1024, 1280 × 860. |

## 1. Purpose and users

**Purpose:** a person or small business in Yaoundé or Douala comes to get a parcel picked up and delivered across town, at a known price, and to know where it is. They leave with a waybill, a paid booking and a delivery they can prove. Operators (courier companies) come to publish zones and prices and to run their dispatchers and couriers.

| User | Comes to |
| --- | --- |
| Shipper / sender (`shipper`) | Price, book, pay, track, cancel, get help |
| Merchant (`merchant`) | Send orders from Commerce/Agriculture (fulfilment API; no screens) |
| Recipient (no account) | Track the parcel, receive it with a code |
| Dispatcher (`dispatcher`) | Assign paid shipments to couriers, review photo proofs |
| Courier (`courier`) | Register, accept jobs, collect, deliver, record failed attempts, also offline |
| Operator admin (`operator_admin`) | Zones, prices, staff, courier approval, support inbox |

## 2. Market standard checklist

The yardsticks are **Glovo / Gozem** (on-demand courier: instant price, mobile money, live courier, PIN on delivery) and **DHL Express / ParcelPerfect-style tools** (waybill, label, public tracking, proof of delivery, exceptions, returns).

| # | Expectation | Score | What happened |
| --- | --- | --- | --- |
| 1 | Front door says what it is; sign in once; track without an account | **Works** | "Send parcels across town, tracked from pickup to delivery", **Sign in** and **Track a parcel** (`d-shp-01-front`) |
| 2 | Instant price for my route before booking | **Works with friction** | Bastos → Nlongkak gave 2 000 XAF Standard (24 h) and 4 000 XAF Express (6 h), with a validity time (`d-shp-04-quotes`). **Friction:** both areas must be in one zone. **Bastos → Mvog-Ada (a seeded route) gave "No service covers this route yet".** Areas are free text, matched exactly, and no suggestions are offered. |
| 3 | Book with parcel type, priority and contacts → waybill | **Works** | "Request received", waybill `LWB-UVQ3M6WU4M` (`d-shp-05-booked`) |
| 4 | Pay by mobile money (MTN / Orange) | **Works** | **Request payment**, then **Paid** within seconds (mock), with a receipt in the notifications (`d-shp-07-paid`) |
| 5 | Printable label | **Works** | **Download label (PDF)** on the detail page (E2E checks the file) |
| 6 | My shipments with clear statuses | **Works** | 8 seeded and the new ones, newest first: Requested, Courier assigned, Picked up, In transit, Delivered, Cancelled (`d-shp-03-shipments`) |
| 7 | Shipment timeline with times | **Works** | 9 steps from "Request received" to "Delivery code sent to the recipient" (`d-shp-08-in-progress`) |
| 8 | Public tracking by waybill, no account, no personal data | **Works** | Status, freshness, operator and service window; unknown waybill gives "Not found. Check the waybill number." (`m-trk-01`) |
| 9 | Live courier position and ETA | **Missing** | "No arrival time is shown until the courier reports one." No map or GPS. |
| 10 | Dispatcher assigns a courier | **Works with friction** | After a courier was approved: "Assigned to Jean." (`d-dsp-02-assigned`). **On the fresh demo the board said "No courier is available. Approve couriers in Staff and couriers."** (`d-dsp-01-board`): the seed has no courier. |
| 11 | Courier app: accept, collect with photo and waybill check, in transit, arrived, offline queue | **Works** | Phone FR as `demo.checker`: Accepter → photo + LWB check → En transit → Livreur arrivé, with "Le code a été envoyé au destinataire par SMS." (`m-cou-03/04`). The offline queue is covered by E2E `j07`. |
| 12 | Proof of delivery with the recipient's code | **Broken (demo)** | The code goes only to the recipient's SMS (mock) and is never shown to anyone, by design. **No demo persona can finish.** The only way through was 3 wrong codes ("Saisie bloquée…"), then **Envoyer une preuve photo**, then the dispatcher's **Confirm delivery**, then **Delivered** for the sender (`m-cou-05`, `t-dsp-03`, `d-shp-10`). The photo-proof button label also appears twice on that screen. |
| 13 | Failed delivery: reason and photo; sender chooses retry or return | **Works** | E2E `j11` (not re-walked this round) |
| 14 | Cancel before dispatch with refund | **Works** | E2E `j03-j04` (refund pending → refunded by signed event; failed refund opens a case) |
| 15 | Notifications (in-app, SMS) in my language | **Works with friction** | The shipper's in-app messages are in their language ("Jean will collect your parcel…", "Payment received… Receipt…"). Staff and courier messages are written "EN / FR" together. Recipient SMS are not visible in the demo. |
| 16 | Help: a case on a shipment, answered by the operator | **Works** | E2E `j19` |
| 17 | Operator set-up: zones and prices | **Works** | Seeded; E2E `j09` |
| 18 | Staff and couriers: invite, approve courier (maker-checker), deactivate | **Works with friction** | Approving `demo.checker`'s courier registration as `demo.admin` at 768 FR worked (KYC mock "validée", `t-adm-01/02`). Seeded staff rows say "Accès ADS : non envoyé", and `demo.user`'s courier row stays "Invité" until they first act as a courier. Accepting an invitation needs the activation e-mail (mock), which a tester cannot read. |
| 19 | Cash on delivery and merchant settlement | **Missing** | LOG-J-10, later. In Cameroon this is expected (Glovo/Gozem/Jumia). |
| 20 | Operator reports: deliveries, failures, revenue, courier performance, export | **Missing** | Later epic |
| 21 | Bilingual and phone-ready | **Works with friction** | All screens have EN/FR keys. **Fails:** after sign-in the account's saved language replaced the page language (360 EN became FR on the operator pages); a `de-DE` browser got English; with the phone drawer open, the top bar and its language switch are covered (`s-m-en-menu-open`). No horizontal scroll on any page measured (courier 360, staff 768, dispatch 768). |

**Score counts (21 items): 12 Works end to end, 5 Works with friction, 1 Broken, 3 Missing.**

## 3. The walks, step by step

### Main journey: send → pay → dispatch → collect → deliver (personas in their own browsers)

| Step | Who / size | Result | Screenshot |
| --- | --- | --- | --- |
| Front door → **Sign in** → **Use demo account** → choose "Logistics shipper" | `demo.user`, desktop EN | Lands on **Send a parcel** | `d-shp-01`, `d-shp-02-send` |
| Bastos → Mvog-Ada → **See prices** | same | "No service covers this route yet" (different zones) | — |
| Bastos → Nlongkak → prices → contacts → **Request pickup** | same | Waybill LWB-UVQ3M6WU4M | `d-shp-04/05/06` |
| **Request payment** (MTN, test number) | same | Paid | `d-shp-07-paid` |
| Choose "Logistics operator" → Dispatch board | `demo.user`, desktop EN | "No courier is available" | `d-dsp-01-board` |
| My jobs → courier registration | `demo.checker`, phone FR | "En attente d'approbation…" | `m-cou-01/02` |
| Staff and couriers → **Approuver** | `demo.admin`, tablet FR | Courier available | `t-adm-01/02` |
| Assign Jean | `demo.user`, desktop EN | "Assigned to Jean." | `d-dsp-02-assigned` |
| Accept → photo + waybill → in transit → arrived | `demo.checker`, phone FR | Code sent by SMS (mock) | `m-cou-03/04` |
| Sender's view and notifications | `demo.user`, desktop EN | Timeline to "Delivery code sent"; no code anywhere | `d-shp-08/09` |
| 3 wrong codes → photo proof | `demo.checker`, phone FR | Locked, photo sent | `m-cou-05-photo-proof` |
| **Confirm delivery** | `demo.user`, tablet EN | Delivered | `t-dsp-03-confirmed` |
| My shipments | `demo.user`, desktop EN | **Delivered** | `d-shp-10-delivered` |
| Public tracking `/track/LWB-…` | no account, phone EN | Status, operator, window | `m-trk-01` |

## 4. Owner rules: EN/FR and three sizes

| Rule | Result |
| --- | --- |
| Styles load on every size | **Pass** |
| Switch visible | **Pass** in the top bar. **Fail** while the phone drawer is open (it covers the top bar). |
| Whole page changes | **Pass** for UI text. Staff/courier notifications are bilingual by design. |
| Kept after reload | **Pass** |
| Kept through sign-in | **Fail**: the account's saved language wins (shared demo accounts carry the last tester's choice) |
| Kit sign-in page follows the language | **Pass** (`lang` is passed as `ui_locales`) |
| No horizontal scroll | **Pass** wherever measured (360 courier and shipper pages, 768 staff and dispatch, 1280) |
| Non-EN/FR browser → French | **Fail** (English) |

The full 3 × 2 sweep could not be completed. The build machine ran at load ~100 on 2 CPUs and restarted twice, and several browser contexts crashed. 16 of 18 measured checks passed; the 2 failures are the language-through-sign-in rule.

## 5. User-experience pass

- **First impression:** clear and honest. It says what the product does and that tracking needs no account. The test-mode banner is always visible.
- **Next step:** good on every screen, one primary action at a time (the courier screen in particular). The workspace chooser after sign-in ("Logistics operator" / "Logistics shipper") is unexplained for a tester.
- **Dead ends a tester hits:** "No service covers this route" for an ordinary cross-town route; "No courier is available" on the board; the courier at "Code du destinataire" with no code to type.
- **Errors:** plain language ("Wrong code", "no money was taken", "Not found. Check the waybill number.").
- **Speed:** fine locally. Under heavy machine load, sign-in and the board were slow but correct.

## 6. Verdict and the fixes that most change it

**Can it perform its duty? Yes, with gaps.** The sender, dispatcher and courier loop from booking to proof of delivery works for real, also offline, with refunds and help. What separates it from Glovo/Gozem: live position/ETA, cash on delivery, and making the demo finishable.

| # | Fix | Size | Plan item |
| --- | --- | --- | --- |
| 1 | **Demo delivery code:** in test mode, show the recipient's code to the sender in the app | S | Done on the branch |
| 2 | **Seed approved couriers; city-wide zones; area suggestions** | S | Done on the branch |
| 3 | **Language kept through sign-in; FR default; switch reachable in the phone drawer** | S | Done on the branch |
| 4 | **Live courier location and ETA** (courier app sends position while on a job; tracking page shows an ETA) | L | Later epic (tracking) |
| 5 | **Cash on delivery and settlement to merchants/operators** | L | LOG-J-10 |
| 6 | **Operator reports and export** (deliveries, failures, revenue, per courier) | M | Later epic |
| 7 | **Quote across zones** (a zone-to-zone price matrix, not only one zone) | M | LOG-US-003/006 follow-up |
| 8 | **Demo invitation acceptance:** a persona that can open the invitation (demo inbox or pre-accepted persona) | M (kit) | BRIEF16 personas |

## 7. Demo completability (BRIEF16)

Built journeys (E2E_STATUS): J16 sign-in, J01 request, J02 price, J03 my shipments, J04 cancel, J05 dispatch, J06 courier registration, J07/J23 pickup and offline, J08 tracking and delivery code, J09 operator set-up, J11 failed delivery, J17 profile, J18 notifications, J19 help, J20 payment, J22 staff and roles. That is **16 journeys**.

| Journey | Before (main) | After the branch | Missing |
| --- | --- | --- | --- |
| J05 dispatch | **no** (no courier in the seed) | yes (seeded approved couriers) | — |
| J08 delivery with code | **no** (code unreadable; only the lock + photo workaround) | yes (test-mode code shown to the sender in the app) | — |
| J01/J02 request and price | yes, with friction (cross-zone "no service", no suggestions) | yes (city-wide zones, suggestions) | — |
| J22 staff invitation accepted by the invitee | **no** | **no** | The invitee must open an activation/invitation e-mail captured by the mock. Needs a kit persona or a demo inbox (M). The admin side (invite, deactivate) works. |
| The other 12 | yes | yes | J16/J17: language now kept through sign-in |

**Completable: 13 of 16 before, 15 of 16 after the branch.** The `--reset` restores couriers (upsert), zones, prices, staff invitations and shipments.

## 8. Method notes and limits

- Two-person journeys used different personas in separate browser contexts: `demo.user` as shipper and dispatcher, `demo.checker` as courier, `demo.admin` as operator admin. Dedicated single-role personas are not in the kit yet. The seed already reads `products.logistics.personas.{shipper,courier,dispatcher}` when present.
- J04, J07 offline, J11, J19 and J20 failure paths rely on the existing E2E suite plus the new demo-journeys suite; they were not all re-walked by hand this round.
- Screenshots are compressed to 128 colours. `d-` is desktop EN, `t-` is tablet, `m-` is phone FR, `s-` is the sweep. Passwords are masked.

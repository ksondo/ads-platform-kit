# Fit-for-purpose audit: Agriculture (AfriNourish)

Round 17, 23 Oct 2026. Briefs: `audit/BRIEF15-fit-for-purpose.md` (with step 7), `audit/BRIEF16-demo-journeys.md`, `audit/BRIEF17-audit-and-fix.md`.
Part 1 (this report) describes what we found on `origin/main`. Part 2 fixed only small items that stopped a demo tester; those
fixes are in the product branch named at the end, **not merged** (an independent reviewer merges).

**Owner's question:** can the person who came here get the outcome they came for?

**Verdict: Yes, with gaps.** A farmer can keep a simple farm diary per batch (planting, weeding, feeding, vaccination...), record a
harvest into a stock lot and put part of it on the Bush Market. A buyer can find verified farms and produce by region, product and
season, order with the quantity held for them, pay by MTN MoMo or Orange Money (a failed payment can be retried), cancel and be
refunded, and confirm collection. ADS staff verify farm profiles and answer help questions. A farmer can also share a verified farm
with AfriCover for crop insurance.

The gaps:
- **The farmer is never paid.** After collection the order says "Payout to the farmer pending (ADS payment service not connected yet)."
- **The farmer cannot act on an order**: no "ready for pickup", no "handed over"; only the buyer confirms collection. No delivery option (buyer collects, decision D6).
- **No ratings, no market prices, no reports or exports** (yields, sales, costs).
- **On the demo, the onboarding and review journey could not be done**: both demo farmers already have a verified farm, there was no visible way to register another farm, and the review queue was empty. Fixed in Part 2.
- **Language:** a tester who picked French on the page lost it at sign-in; a German browser got English; on a phone the EN/FR switch sits under the open menu. Fixed in Part 2.

## Set-up and commits tested

| Item | Value |
| --- | --- |
| Product | `ksondo/Agriculture`, `origin/main` `8f232de` (demo seed PR #6 merged) |
| Kit | `ksondo/ads-platform-kit` main `d28b6ac`. Real identity service in demo mode (`ADS_ENV=demo`, `DEMO_MODE=1`, `DEMO_SHOW_CREDENTIALS=1`) through `ads-e2e up`, kit mocks (MoMo/Orange, SMS). Agriculture entry of `config/clients.demo.json` with a local return address; `apply-clients`, `demo-bootstrap`, `demo-orgs`. |
| Data | `src/migrate.mjs`, the restricted runtime login, then `scripts/demo-seed.mjs` (staff organisation, 2 verified demo farms, 6 batches with 12 diary entries, 6 stock lots, 6 listings). Private PostgreSQL 16 cluster, throwaway databases `g7_*`. The server ran as the restricted login (it refuses an owner login). |
| Accounts | `demo.user` and `demo.checker` (`farmer` + `buyer` in "ADS Demo – Agriculture cooperative"; `reviewer` + `support` in "ADS Staff – Agriculture review"); `demo.admin` (`tenant_admin`). |
| Browser | Playwright Chromium, from `/` through the product's **Sign in** and the kit page. 360/768/1280, EN and FR. |
| Note | The machine was heavily loaded by other agents and restarted twice during the round; speed is not judged here. |

## 1. Purpose and users

**Purpose:** a smallholder comes to keep simple records of what was done on the farm and to sell the harvest to buyers nearby with
mobile-money payment; a buyer comes to find verified produce, order and pay safely, and collect.

| User | Comes to |
| --- | --- |
| Farmer (`farmer`) | Register the farm, record batches and diary entries, harvest into stock, list for sale, see orders, get paid, share the farm with AfriCover |
| Buyer (`buyer`) | Find produce by region/product/season, order, pay, collect, cancel and be refunded, ask for help |
| ADS reviewer / support (`reviewer`, `support` in an ADS staff organisation) | Verify farm profiles; answer help cases |
| Organisation admin (`tenant_admin`) | See the team, switch off access, invite on the ADS admin page |

## 2. Market standard checklist

Yardsticks: an agri-marketplace such as **Twiga / AgroCenta / Jumia Food-style produce markets** (verified sellers, price and stock,
reservation, mobile payment, collection or delivery, payout, ratings), and farm record keeping such as **Farmable / Cropwise Grower**
(activities per field or flock, inputs, harvests, reminders, reports).

| # | Expectation | Score | What happened |
| --- | --- | --- | --- |
| 1 | Browse produce with price per unit, quantity left, farm, region, pickup place | **Works** | 6 demo listings and 2 verified farms on the front door, "(test price)" labels (`d-farmer-01-front-door`). |
| 2 | Filter by region, product, season; map | **Works** | Filters work; the "map" is a grid of the 10 regions with counts (`d-buyer-01-map`), no real map (decision D1: no coordinates are public). |
| 3 | Verified-farm badge and farm profile | **Works** | "Verified" badge; farm page with number, region/town, type, main product (`d-farmer-03-farm`). |
| 4 | Order with the quantity held for the buyer | **Works with friction** | "Order placed — 50 kg reserved for you. Pay to confirm. Reserved until 11:48" (`d-buyer-04-order-placed`). **Friction:** "Sign in to order" brought the buyer back to the explorer start, not to the listing; they had to find it again (`d-buyer-02-after-sign-in`). *Fixed in Part 2.* |
| 5 | Pay by mobile money; failure and retry | **Works** | 0001 number: "Payment failed, no money was taken. Not enough money in the account. Your order is held until … so you can try again." (`d-buyer-07-pay-failed`); retry: "Paid. The farmer is preparing your order." (`d-buyer-05-paid`). The test-number hint is shown in test mode. |
| 6 | Farmer is told about the order and handles it | **Works with friction** | The order appears under "For my farm" with status Paid and in Today (`d-farmer-07-orders`), with an SMS. **Friction:** the farmer has no action on the order (ready / handed over / problem). |
| 7 | Collection or delivery | **Works with friction** | Buyer confirms "I have collected it" → "Collection confirmed." (`d-buyer-06-collected`). Buyer collects only (D6); no delivery. |
| 8 | Farmer payout | **Missing** | "Payout to the farmer pending (ADS payment service not connected yet)." |
| 9 | Cancel and refund | **Works** | Clear rule in the dialog; "Order cancelled. Refunded to your mobile money account." (`d-buyer-08a-cancel-dialog`, `d-buyer-08-cancel-refund`). |
| 10 | Ratings and reviews of farms/buyers | **Missing** | Not in the release. |
| 11 | Farm diary per batch with activity tiles, notes, plans and reminders | **Works** | Icon tiles (planting, fertiliser, weeding, spraying, note; feeding, vaccination… for animals), "Plan for later", timeline (`d-farmer-09-batch`); Today lists activities due. |
| 12 | Harvest → stock lot → listing | **Works** | "Record harvest" made a 120 kg lot; "Sell" opened the listing form for that lot (`d-farmer-10-harvested`, `d-farmer-11-listing-form`). |
| 13 | Register a farm and have it verified | **Works with friction** | Built (form, plots, consented location, submit, ADS review with verify/return). **Friction (demo):** both demo farmers already have a verified farm, the farm page had no way to register another one (only by typing `#/farm/new`), and the review queue was empty (`d-staff-01-review`). *Fixed in Part 2.* |
| 14 | Help and support with a case number | **Works** | Case AG-1001 → ADS support answered in the help desk → the buyer sees the answer (`d-buyer-09-help`, `d-staff-02-helpdesk`). |
| 15 | Notifications by SMS / in the app | **Works** | Bell with count; SMS through the kit mock. |
| 16 | Settings: language, units, phone, SMS | **Works with friction** | Saved. **Friction:** the language picked on the page was lost at sign-in and on reload (not remembered); a German browser got English. *Fixed in Part 2.* |
| 17 | Works on poor network / offline | **Works** | Offline banner, entries queued and sent later (E2E AG-J-26; not re-walked here). |
| 18 | Records and reports (yields, sales, costs; export) | **Missing** | No report or export. |
| 19 | Market price guidance | **Missing** | Prices are whatever the farmer types. |
| 20 | Team and access | **Works with friction** | Team lists members, roles, "Switch off access"; invitations and roles are on the hosted ADS admin page (`d-admin-01-team`). |

**Score counts (20 items): 10 Works end to end, 6 Works with friction, 0 Broken, 4 Missing.**

## 3. The walks

### Buyer (desktop 1280 EN, `demo.checker`) and farmer (`demo.user`)

| Step | Result | Screenshot |
| --- | --- | --- |
| Front door, list and region map | OK | `d-farmer-01-front-door`, `d-buyer-01-map` |
| Cocoa listing → "Sign in to order" → kit page → workspace | Back on the explorer start, not the listing | `d-buyer-02-after-sign-in` |
| Order 50 kg, pay with 0001 then another number | Failed then Paid | `d-buyer-03-order-form`, `d-buyer-04-order-placed`, `d-buyer-07-pay-failed`, `d-buyer-05-paid` |
| Farmer: Today, Orders | Paid order visible, no action | `d-farmer-02-home`, `d-farmer-07-orders` |
| Buyer collects | "Collection confirmed", payout pending | `d-buyer-06-collected` |
| Plantain order, pay, cancel | Refunded | `d-buyer-08a-cancel-dialog`, `d-buyer-08-cancel-refund` |
| Help question | Case AG-1001 | `d-buyer-09-help` |
| Farmer: batch, diary entry, harvest 120 kg, list 100 kg | OK | `d-farmer-09-batch`, `d-farmer-10-harvested`, `d-farmer-11-listing-form` |
| Farmer: share the verified farm with AfriCover | Signed `AGS1…` reference; linked on an AfriCover policy | `d-farmer-05-share-ref` |

### ADS staff (`demo.user` in the staff organisation) and admin (`demo.admin`)

| Step | Result | Screenshot |
| --- | --- | --- |
| Review farms | "No farm profiles waiting." | `d-staff-01-review` |
| Help desk: answer AG-1001 | Answered | `d-staff-02-helpdesk` |
| Admin: Team | Members, roles, switch off access, invite link | `d-admin-01-team` |

## 4. Owner rules: EN/FR and three sizes

The full 3-size sweep could not finish on `main` before the machine restarts; what was checked:

| Rule | Result |
| --- | --- |
| Styles load; no horizontal scroll | **Pass** on the screens walked at 360 and 1280 (`s-360-en-explore`, `s-360-en-market`) and in the product's E2E (`expectFits`) |
| Kit sign-in page follows the language | **Pass** (`m-fr-kit-login`) |
| French browser stays French after sign-in | **Pass** (`m-fr-after-sign-in`; the demo accounts have no saved Agriculture language) |
| Language chosen on the page kept through sign-in | **Fail before Part 2:** an English browser that switched to FR came back in English after sign-in and after reload |
| First visit `de-DE` gives French | **Fail before Part 2:** English |
| Switch reachable with the phone menu open | **Fail before Part 2:** the drawer and its shade cover the top-bar EN/FR switch (`s-360-en-menu-open`) |
| Whole page changes | **Pass** for UI strings (EN/FR key parity test); demo seed names are French ("Ferme démo…", "marché") in both languages, which is acceptable as proper names |

## 5. User-experience pass

- **First impression:** the front door shows real produce with prices immediately and a clear "Sign in to order"; good.
- **Next step is clear:** order and payment messages say what is held, until when, and whether money was taken. Farmer screens use icons and short labels (low-literacy goal).
- **Empty states:** helpful ("Nothing due.", "No farm profiles waiting.") — but on the demo the reviewer only ever saw the empty state.
- **Errors:** plain language (not enough money, reservation time, collected orders cannot be cancelled → "Report a problem").
- **Shared demo roles:** both demo users are farmer and buyer in the same cooperative; the same person can buy their own produce only through the second account, which is fine for a demo but personas (farmer, buyer, reviewer) will be clearer.
- **Nightly reset:** demo listings that testers ordered from are kept as they are (by design, the reset never deletes testers' orders), so stock on those listings shrinks over time; a periodic manual clean-up may be needed.

## 6. Verdict and the fixes that would most change it

**Yes, with gaps.**

| Fix | Size | Plan item |
| --- | --- | --- |
| Farmer payout through the shared ADS payment service (+ kit payout mock) | L | PLAT-PAY-001, AG-US-011 remaining |
| Farmer order actions (ready for pickup, handed over, problem) and optional delivery | M | AG-J-07 follow-up, decision D6 |
| Farm records report and export (batches, harvests, sales) | M | Later epic |
| Ratings after collection | M | Later epic |
| Weather source sending observations to AfriCover (makes the farm share useful for insurance) | L | AG-J-14 |
| Kit demo personas (farmer, buyer, ADS reviewer/support) | M (kit) | Kit `build/demo-personas-20261023` |

## 7. Demo completability (BRIEF16)

Built journeys (`docs/delivery/E2E_STATUS.md`): AG-J-18, J-01, J-02 onboarding, J-02 production, J-25, J-07, J-22, J-23, J-19, J-20, J-21, J-26 = **12**.

| Journey | Before (main) | After Part 2 | What was missing |
| --- | --- | --- | --- |
| AG-J-18 Sign in | Yes | Yes | — |
| AG-J-01 Explore | Yes | Yes | — |
| AG-J-02 Farm onboarding | **No** | Yes | A visible "Register another farm" (demo farmers already have a verified farm) |
| AG-J-02 Production cycle | Yes | Yes | — |
| AG-J-25 Review farms; team | **No** (queue always empty) | Yes | Seeded farm waiting for review; new farms can be submitted |
| AG-J-07 Order and pay | Yes (buyer must find the listing again after sign-in) | Yes | Return to the listing's order form |
| AG-J-22 Payment failure | Yes | Yes | — |
| AG-J-23 Cancel and refund | Yes | Yes | — |
| AG-J-19 Language and units | **No** (page language lost at sign-in; phone switch hidden under the menu) | Yes | Language kept through sign-in; FR default; switch in the phone drawer |
| AG-J-20 Notifications | Yes | Yes | — |
| AG-J-21 Help | Yes | Yes | — |
| AG-J-26 Poor network | Yes (E2E) | Yes | — |

**Completable: 9 of 12 before → 12 of 12 after** (payout to the farmer stays "pending" in every case: PLAT-PAY-001).

Part 2: branch `build/demo-journeys-20261023` in `ksondo/Agriculture` (pull request and CI result in the round summary, agent g7). Not merged.

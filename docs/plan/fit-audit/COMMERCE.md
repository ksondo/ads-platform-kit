# Fit-for-purpose audit: Commerce (23 Oct 2026)

Round 15 (BRIEF15). The owner's question: **can the person who came here get the outcome they came for?** This is a read-only audit. Nothing in the product was changed.

**Verdict: Yes with gaps.** A shopper can find a product, send a pickup request and follow it until the shop hands it over. The till works in English and French on phone, tablet and desktop. But with the demo accounts as they are configured today, two of the five journeys cannot be finished:

- the bank collection stops at the handover, because the agent never sees their code;
- the ADS review stops, because the demo admin is not a reviewer.

Merchant delivery cannot be used by a normal shopper. There is no payment step and no receipt for online orders. Each of these gaps has a known fix (section 7).

## 1. Purpose and users

**Purpose.** A Cameroonian shopper finds a product in a local shop and gets it, by pickup or by the shop's own delivery, paying cash. The shop owner leaves with orders fulfilled, counter sales recorded, and the cash moved safely to the bank.

| User type | Account used | Came for |
| --- | --- | --- |
| Shopper (anonymous, then signed in) | none, then demo user via **Use demo account** | find a product, order it, track it, get help |
| Merchant owner | demo user, workspace "ADS Demo – Commerce shop" | list products, receive and fulfil orders, see sales, send cash to the bank |
| Cashier | demo user (same account, `commerce_cashier`) | ring up cash sales, give change and a receipt, refund |
| ADS reviewer / support | demo admin (as briefed), then the second demo user | publish reviewed products, answer help requests |
| Bank officer and bank agent | demo user, workspace "ADS Demo – Commerce bank"; second demo user as officer | accept a collection, collect the cash, credit the shop |

**Yardsticks:**

| User | Reference products |
| --- | --- |
| Shopper | Jumia, Glovo |
| Till | Loyverse POS, Shopify POS |
| Merchant | a typical merchant dashboard (Shopify admin) |

## 2. How it was run

**Code and set-up**
- `ads-commerce-platform` `main` = `b580721`. It includes the merged `scripts/demo-seed.mjs`, `deploy/demo/DEMO_DATA.md` and the staff sync.
- The kit `main` = `3997342`. Identity ran in demo mode (`ADS_ENV=demo`, `DEMO_MODE=1`, `DEMO_SHOW_CREDENTIALS=1`) with the kit mocks, through the e2e-kit runner.
- `apply-clients` used a local copy of `config/clients.demo.json` with only Commerce in it; only the URIs were changed. Then `demo-bootstrap` and `demo-orgs` ran.
- Commerce was set up the way the demo host does it:
  - migrations as owner, with a NOBYPASSRLS runtime login;
  - `db/staff-tenants.mjs` with the staff organisation;
  - `scripts/demo-seed.mjs` wrote 61 rows;
  - the API ran with `NODE_ENV=demo` and `ADS_MOCKS_URL` set;
  - the web was the production Vite build, served by `vite preview`.
- Ports 31980–31999. Databases `fa_commerce_identity` and `fa_commerce_app` on a private PostgreSQL 16 cluster. All of it has since been dropped and stopped.

**The walk**
- Playwright, starting from the front door `/` (it redirects to `/commerce`), clicking the visible links and buttons like a user. Deep links were used only where the product has no link to a screen; those cases are flagged.
- Each step was screenshotted: desktop EN (1366 or 1280 px) and phone FR (360 px). The shopper checkout and the POS sale were also run at all six combinations: 360, 768 and 1280 px, each in EN and FR. Screenshots are in [`img/commerce/`](img/commerce/).
- Screenshots of the hosted sign-in page are not committed, because that page shows the demo password by design.

## 3. Market standard checklist and scores

**Scores:** **E2E** = works end to end · **Friction** = works with friction · **Broken** · **Missing**

### Shopper (Jumia / Glovo yardstick)

| # | What any shopper expects | Score | What happened |
| --- | --- | --- | --- |
| S1 | Land and understand what is on offer: shops, sectors, areas | **Friction** | The home page is clean and fast (0.8 s) and the products show just under the hero ([01](img/commerce/01-shopper-home-desktop-en.png)). But there is no shop directory, no region or city filter and no business types: shops can only be reached from a product card. The copy is heavy with disclaimers ("planning basket", "no payment or delivery is confirmed"). |
| S2 | Find a product: search, filter, sort | **E2E** | Search finds "riz" and "rice", because the seeded names are bilingual. The price, category, sort and in-stock filters work ([02](img/commerce/02-search-desktop-en.png)). |
| S3 | See price, stock, photo and details, then add to basket from the product page | **Friction** | Price and listed stock show. **No photo** (an emoji on every card) and no description. The product page **cannot add to the basket**: it says "This page does not accept orders" ([03](img/commerce/03-product-desktop-en.png)). Its header also differs from the marketplace ("Commerce V2", a "Merchant workspace" link shown to anonymous visitors). |
| S4 | Basket: add, change quantity, remove, see total | **Friction** | Works. The basket is a "planning basket" panel at the foot of the page, reached through "My basket (n)". Mixing two shops is blocked with a clear message ("send one request per shop") ([05](img/commerce/05-basket-two-shops-desktop-en.png)). On a phone the basket panel is 29 px wider than the screen, and "Load my saved account basket" and "Save basket to my account" show as unstyled browser buttons ([63](img/commerce/63-basket-overflow-phone-fr.png)). |
| S5 | Sign in at checkout without losing the basket | **Friction** | The basket survives sign-in. But the workspace picker offers only "Commerce shop", "Commerce bank" and "Review team", **with no personal shopper workspace** ([06](img/commerce/06-workspace-picker-desktop-en.png)). To buy, the shopper must pick the merchant's own organisation; the other two refuse checkout. Back on the page, the shopper must press **Send** again. |
| S6 | Checkout with pickup, and a confirmation with a reference | **E2E** | "Request sent — Payment not collected · Order reference …" with a tracking link. Passed at 360, 768 and 1280 px, in EN and FR ([07](img/commerce/07-request-sent-desktop-en.png), [64](img/commerce/64-request-sent-phone-fr-browser-switched-to-en-by-account.png)). |
| S7 | Home delivery to my address | **Broken** | "Merchant-arranged delivery" asks for an "Approved destination reference — never enter a home address". Send is refused unless the shopper types an 8+ character code such as `addr:…` ("Provide an approved opaque destination reference, not an address"). The addresses saved under My account are not offered ([08](img/commerce/08-merchant-delivery-reference-desktop-en.png)). A real shopper cannot complete this. |
| S8 | Choose how to pay (cash on pickup or delivery, MoMo, Orange Money, card), online or at the till | **Missing** | There is no payment step. Orders stay "Payment not collected" even after handover. The till takes cash only. |
| S9 | Track the order and be told when it changes | **E2E** | The timeline shows Requested → Accepted → Ready → Handed over. In-app notifications arrived for accepted, ready, handed over and new message ([09](img/commerce/09-my-orders-desktop-en.png), [11](img/commerce/11-notifications-desktop-en.png)). No SMS was sent, because no phone is saved on the demo profile (mock SMS capture was empty). |
| S10 | Receipt for an online order | **Missing** | Online orders have no receipt. Only POS sales have one. |
| S11 | Cancel, contact the shop, ask for help, order again | **Friction** | All four work: cancel, the message thread with the shop, a help request (reached the ADS support queue as `HLP-…`), and "Order these again". But the ADS support phone is still a placeholder (`+237 222 00 00 00`), and both demo shops show the same phone number. "Order these again" is also offered on a cancelled order. |
| S12 | Returns, disputes, ratings and reviews | **Missing** | The shop page shows a declared returns policy, but there is no way to raise a return or dispute and no rating. |

### Merchant owner (typical merchant dashboard)

| # | What any merchant expects | Score | What happened |
| --- | --- | --- | --- |
| M1 | Reach my shop dashboard and see sales at a glance | **Friction** | The marketplace header has **no link to the merchant workspace**. The visitor must know `/commerce/merchant` or find the link on a product page. The overview shows a branch report: requests, unpaid requested value, owner-attested cash, published products ([20](img/commerce/20-merchant-overview-desktop-en.png)). There is no date range, no trend, no top products and no export. |
| M2 | Add a product and get it on sale | **Friction** | "Add product" has only SKU, name, category, price and opening stock: **no photo, description or variants** ([22](img/commerce/22-add-product-desktop-en.png)). Draft → "Request review" works. Publishing needs an independent reviewer (see R1). |
| M3 | Receive an order, prepare it, hand it over or deliver it | **Friction** | Accept → Ready for pickup → handover works, and so does Ready for dispatch → Dispatched → Delivered (attested), each with a server-recorded state and a buyer notification. But see the four problems below this table. |
| M4 | Keep stock right | **E2E** | Goods receiving with supplier references, stocktake and recount, reorder policy and timed holds all work, and stock goes down on POS sales ([21](img/commerce/21-catalogue-desktop-en.png)). |
| M5 | Add staff and give them roles | **Missing** | "Staff and receipts" only lists people who have already signed in, plus a till-branch assignment ([26](img/commerce/26-staff-desktop-en.png)). There is no invitation (C3). |

The four problems with M3:
1. **No new-order alert** for the shop. The bell shows the shopper's notifications, because it is the same account.
2. **Handover needs a typed "custody evidence reference"** of 8+ characters from `[A-Za-z0-9._:/-]`. When it is missing, the error appears at the top of the page, away from the order card ([24](img/commerce/24-handover-needs-evidence-desktop-en.png)).
3. There is **no buyer pickup code** to check that the right person collects (Glovo and Jumia use one).
4. **The cash taken at handover is never recorded.** It does not appear in Cash on hand and cannot go to the bank (N-05).

### Cashier at the till (Loyverse / Shopify POS)

| # | What any cashier expects | Score | What happened |
| --- | --- | --- | --- |
| P1 | Ring up items, take cash, show change, print a receipt | **E2E** | SKU scan or typing works, and so do quantities. Example: total 6 300, cash 10 000, change 3 700. The non-fiscal receipt shows TVA included, the cashier's name and **Print receipt** ([31](img/commerce/31-pos-receipt-desktop-en.png)). This passed at all six size and language combinations. Products are a list with quantity boxes rather than tap tiles, which is slower than Loyverse on a phone but usable ([66](img/commerce/66-pos-phone-fr.png)). |
| P2 | Keep selling when the network drops | **Friction** | Works: the offline banner shows, a provisional receipt prints, and when the network returns the app says "1 offline sale(s) sent" ([32](img/commerce/32-pos-offline-desktop-en.png)). But the receipt on screen still says "Provisional receipt — not yet sent" after the sale has gone. |
| P3 | Refund, with a manager's approval | **Friction** | "Refund in cash" with a reason works, and the stock comes back ([33](img/commerce/33-pos-refund-desktop-en.png)). The owner refunds **without a PIN**. The manager-PIN path cannot be shown, because every demo account is an owner. |
| P4 | Open and close a shift, X and Z reports, count the drawer | **Missing** | C11. |

### Getting paid and oversight

| # | What is expected | Score | What happened |
| --- | --- | --- | --- |
| B1 | Send the day's cash to the bank, have it collected and credited, see it reconciled | **Broken (as configured)** | See the walk below the table. |
| R1 | An ADS reviewer publishes a product, and it appears on the marketplace | **Broken (as configured)** | See the walk below the table. |

**B1, step by step**
1. The owner creates a batch and asks the bank to collect ([40](img/commerce/40-cash-batch-requested-desktop-en.png)).
2. The bank user gets a notification. **They land on the shopper marketplace, with no link to the bank queue** ([41](img/commerce/41-bank-user-lands-on-marketplace-desktop-en.png)); `/commerce/bank` has to be typed.
3. Accept and assign the agent works.
4. **Every demo account in the bank organisation holds both `bank_officer` and `bank_agent`. The app shows the one-time handover code only to agents who are not officers** (`cashBatches.mjs:316`). So the agent's screen says "Wait for the shop to enter your code", but no code is ever shown ([42](img/commerce/42-agent-no-code-officer-and-agent-desktop-en.png)), and the shop cannot start the handover.
5. With a local fix (the demo user set to `bank_agent` only, the second demo user as officer), the rest works end to end: code → shop count → agent count → in bank custody → mock bank credit `TEST-BCR-…` → **Reconciled** within seconds ([43](img/commerce/43-agent-custody-desktop-en.png), [44](img/commerce/44-batch-reconciled-desktop-en.png)).

**R1, step by step**
- **The demo admin has no reviewer role.** `demo-orgs` gives the demo admin only `merchant_owner`, in every organisation including the review team. So `/commerce/review` says "Independent reviewer role required" ([50](img/commerce/50-demo-admin-review-denied-desktop-en.png)).
- The demo user is a reviewer but created the drafts. The self-review rule hides them, and the queue says "No products await review", which reads as if nothing is pending.
- Only the second demo user can publish. That account has no "Use demo account" button, so a public tester cannot use it. With it, publishing worked and the product appeared on the marketplace ([51](img/commerce/51-review-form-user2-desktop-en.png)).
- There is no link to `/commerce/review` or `/commerce/support` anywhere in the menus. The support queue works ([52](img/commerce/52-support-queue-desktop-en.png)).

### Count per score (23 items)

| Works end to end | Works with friction | Broken | Missing |
| --- | --- | --- | --- |
| 5 (S2, S6, S9, M4, P1) | 10 (S1, S3, S4, S5, S11, M1, M2, M3, P2, P3) | 3 (S7, B1, R1) | 5 (S8, S10, S12, M5, P4) |

## 4. User-experience pass

**First impression and next step**
- The home page looks finished: emerald brand, clear hero, real products straight away.
- Most visitors will not know why the basket is a "planning basket", or what to do after reading "no payment or delivery is confirmed". Almost every screen repeats a legal-style disclaimer. Testers will find this tiring.

**Finding your way**
- The **visible navigation follows the shopper only.** The merchant, bank, review and support screens exist, but nothing in the header leads to them for a user who holds those roles.
- After sign-in everyone lands on the marketplace, whatever workspace they chose. This is the most likely place for a tester to give up ("I signed in as the bank, now what?").

**Empty states** are good and plain: "Nothing new. Updates about your orders and cash collections appear here."; "No saved address yet."; "No supplier records yet."

**Error messages**
- Most are plain.
- These are jargon and will stop users: "Provide an approved opaque destination reference, not an address" and "Handover requires a verifiable custody evidence reference".
- The merchant order error shows at the top of the page, not next to the order.

**Inconsistencies**
- The marketplace and merchant screens show **FCFA**; buyer orders, POS and cash show **XAF**.
- The shop page shows its hours twice ("Reported hours…" and "Hours (declared by the shop)…") and repeats the marketplace hero text.

**Speed** is fine locally: the home page is ready in about 0.8 s. Merchant screens load about 1 s after network idle. No JavaScript errors and no failed API calls on any walked screen.

**Seed data** is enough to make every screen non-empty. It has orders in six states, POS sales, an open batch and a product awaiting review. Product names are bilingual ("Riz parfumé 5 kg / Fragrant rice 5 kg"), so they read as mixed language on purpose.

## 5. Bilingual and devices

**How it was checked**
- On each width (360, 768 and 1280 px) the browser started in English. The visible language switch was changed EN → FR, and later back FR → EN.
- At each step the page was reloaded, then signed in, then checked again. Each page was scanned for lines left in the other language.
- The layout was checked for horizontal overflow and for whether the styles had loaded.
- The checkout and the POS sale (including offline and refund) ran at all six combinations.

| Check | 360 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| Styles load (stylesheet and DM Sans font) | Yes | Yes | Yes |
| Language switch visible | Yes, in the header (no collapsed menu on these pages) | Yes | Yes |
| Whole shopper page changes EN → FR → EN | Yes | Yes | Yes |
| Choice kept after reload (same tab) | Yes | Yes | Yes |
| Choice kept after sign-in | Yes, **unless the account has a saved language** (see below) | same | same |
| Merchant and POS pages fully in FR | Sidebar "Digital payments" and "Courier delivery" stay English | Same two items | Same two items ([74](img/commerce/74-merchant-sidebar-untranslated-desktop-fr.png)) |
| Layout | **Basket panel overflows by 29 px**; two basket buttons and the fulfilment select unstyled ([63](img/commerce/63-basket-overflow-phone-fr.png)) | **Merchant and POS top bar overflows to 912–956 px**: the language select covers the breadcrumb, and "Demo User" and Sign out are cut off ([71](img/commerce/71-merchant-topbar-overflow-tablet-fr.png)) | No overflow |
| Checkout (pickup) | EN pass, FR pass | EN pass, FR pass | EN pass, FR pass |
| POS sale, change, receipt, offline, refund | EN pass, FR pass | EN pass, FR pass | EN pass, FR pass |

**Language failures**
1. **The account's saved language overrides the visible switch at sign-in** (`session.tsx:24-25`).
   - A visitor who chose Français and then signs in is switched to English if the account has English saved.
   - On the shared demo account, the language is whatever the last visitor saved.
   - Shown in [64](img/commerce/64-request-sent-phone-fr-browser-switched-to-en-by-account.png) and [68](img/commerce/68-pos-receipt-phone-fr-account-lang-en.png): a French browser shows English after sign-in, because the account was set to English earlier in this run.
2. **A new tab or window goes back to the device language.** The choice is kept only in `sessionStorage` for that tab; otherwise the app uses `navigator.language`. This happens even after the account's language was saved as Français, because a new tab starts signed out. So the language still depends on the device.
3. The hosted sign-in page follows the visible choice (it opened in French). It returned to the product in the chosen language when the account had no saved language.

## 6. Hosting notes found along the way

- `deploy/demo/compose.yml` (`commerce-api`) sets `COMMERCE_BANK_URL: ""` and `COMMERCE_SMS_URL: ""` and **does not pass `ADS_MOCKS_URL`**. `DEMO_HOST_SETTINGS.md` lists it, but the compose file does not use it. Without it, `bankAdapter.mjs` has no bank, and bank collection (B1) and SMS cannot work on the hosted demo. `COMMERCE_PUBLIC_API_URL` (for the bank callback) is also missing.
- The demo sign-in panel shows only the demo user. So the second demo user and the demo admin, which the maker-checker and review journeys need, are not usable by a public tester.

## 7. Verdict and the fixes that would change it most

**Can it perform its duty? Yes with gaps.**
- Shopping by pickup and the cash till work end to end in both languages on all three sizes.
- Delivery, payment and online receipts do not exist yet in a usable form.
- In the demo as configured, the bank collection and the publication review cannot be finished by a visitor.

The top five fixes are below. Fixes 1, 2 and 5 are small and turn B1 and R1 into "Works end to end", and fix most of section 5.

| # | Fix | Size | Changes | Plan item |
| --- | --- | --- | --- | --- |
| 1 | **Demo roles that let each journey finish.** In the bank organisation, give the demo user `bank_agent` only and the second demo user `bank_officer`. Give the demo admin `commerce_reviewer` (and `commerce_support`) in the review-team organisation. Offer a personal (shopper) workspace, or document "pick Commerce shop to buy". Pass `ADS_MOCKS_URL` and `COMMERCE_PUBLIC_API_URL` to `commerce-api` in `deploy/demo/compose.yml`. | S | B1, R1, S5, P3 | DE-03, DE-04, N-06 |
| 2 | **Role home and menu after sign-in.** Land a merchant on `/commerce/merchant`, the bank on `/commerce/bank` and staff on `/commerce/review`. Show those links in the header by role. Add a new-order badge for the shop. | S–M | M1, B1, R1, M3 | C1 (menus from entitlements) |
| 3 | **Delivery and cash at handover.** Choose a saved address for merchant delivery instead of an "opaque destination reference". Show "Pay cash at pickup / on delivery" at checkout. Record the cash received at handover so it joins Cash on hand. Give the shopper a pickup code that the shop checks instead of a typed custody reference. Add an order receipt. | M | S7, S8 (cash), S10, M3 | N-05, J-10 |
| 4 | **Product photos and a product page you can buy from.** Image upload with review, a description field, and "Add to basket" on the product page. | M | S3, M2 | N-04 |
| 5 | **Bilingual and responsive fixes.** Only an explicit choice of the visible switch on that device decides the language, with the account language only a default, and the choice kept across tabs in `localStorage`. Translate "Digital payments" and "Courier delivery". Fix the 768 px merchant top bar and the 360 px basket overflow and unstyled basket buttons. Use one currency label (FCFA). | S | Section 5 | DE-06 (EN/FR rule) |

**Next, by the existing plan:**
- C11 shifts with X and Z reports (P4)
- C5 MoMo and Orange Money in test mode (S8)
- C3 staff invitation (M5)
- C14 disputes and returns (S12)
- N-01, N-02 and N-03: shop directory, regions and business types (S1)
- D-A1: real support number (S11)

## Unmerged branches

`main` = `b580721` includes the demo seed (PR #57) and the staff sync (PR #58). The repository still has **59 remote branches that are not merged into `main`**.

Two of them are recent and touch the demo:
- `deploy/ghcr-commerce-demo-v1` (22 Oct, 6 commits);
- `deploy/commerce-public-demo-approved-origins-20261022` (22 Oct, 3 commits).

The rest date from 12–16 October (`build/commerce-*`, `feature/commerce-v2-*`). Most are earlier slices that were later merged in another form. This audit ran on `main` only, so nothing on those branches is reflected above.

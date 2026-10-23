# Fit-for-purpose audit: ADS Hub (africa-digital-synergy-hub)

Round 17, 23 Oct 2026, agent g1. Briefs: `audit/BRIEF15-fit-for-purpose.md`, `audit/BRIEF16-demo-journeys.md`, `audit/BRIEF17-audit-and-fix.md`.
Part 1 (this report) describes what we found on `origin/main`. Part 2 fixes are on the product branch `build/demo-journeys-20261023` (see the end).

**Owner's question:** can the person who came here get the outcome they came for?

**Verdict: No (for the hub's main duty). The lead-capture website and the staff pipeline work.** A visitor can read what ADS does, pick one of eight pathways, and send a request or a partner registration. They get a reference and an e-mail. ADS staff can then answer it in the staff portal, and an admin can grant portal access. All of this works for real against the Hub API, PostgreSQL and the kit sign-in, in EN and FR.

What the yardstick asks for does not exist yet: **a front door that routes each visitor to their sector platform and signs them in once.**
- The hub has **no link to any ADS product.** That covers Commerce, Logistics, Education, Fleet Guard, Tontine and VentureWorks.
- The "Sector Solutions" menu opens four older bank-era marketing pages: POS & Commerce, Fiscal Tracking, Identity Verification and Modules. They do not open the live products.
- The sector grid component (`src/components/site/Sectors.tsx`, "available / coming soon") exists but is not shown anywhere.
- Single sign-on works between products. Opening Logistics in the same browser after signing in to the Hub asked for no password, only "Choose a workspace". The Hub simply never hands the visitor over (HUB-US-002 / EP-GATE not built).

## Set-up and commits tested

| Item | Value |
| --- | --- |
| Product | `ksondo/africa-digital-synergy-hub` `origin/main` `e221925` (demo seed merged, PR #6; vite advisory PR #7) |
| Kit | `ksondo/ads-platform-kit` main `d28b6ac`. Real identity service in demo mode (`ADS_ENV=demo`, `DEMO_MODE=1`, `DEMO_SHOW_CREDENTIALS=1`) through `ads-e2e up` with `ADS_E2E_IDENTITY_ENV_*`, plus the kit mocks (email/SMS). `demo-bootstrap`, then `demo-orgs` with the Hub and Logistics entries of `config/clients.demo.json` (local redirects). |
| Data | `server/src/migrate.mjs`, then `server/scripts/demo-seed.mjs` (11 rows: 8 engagements, 3 access requests incl. a pending one for `demo.checker`). PostgreSQL 16, throwaway DBs `g1_identity`, `g1_hub_app`. The API ran as a non-owner login role in `hub_runtime`. |
| Accounts | `demo.user` and `demo.checker` (`member` in "ADS Demo – Hub members", `staff` in "ADS Staff – Hub operators"), `demo.admin` (`staff_admin` in both). Sign-in starts with the Hub's operator tenant as the hint, so all three land as staff. |
| Ports | identity 32400, mocks 32401, Hub (API + web) 32402, PostgreSQL 32419 |
| Browser | Playwright Chromium. Every walk starts at `/` (or `/portal`) and uses the Hub's own **Sign in** button and the kit sign-in page. `demo.user` uses **Use demo account**; the others are typed. Passwords are masked in the screenshots. Sizes: 360 × 740 touch, 768 × 1024, 1280 × 860, each in EN and FR. |

## 1. Purpose and users

**Purpose:** a visitor (entrepreneur, business owner, developer, school, bank/MFI, technology partner) comes to understand ADS and to get to the ADS platform or programme that fits them. They should leave signed in on that platform, or with a request ADS will answer. ADS staff come to answer and route those requests and to grant portal access.

| User | Comes to |
| --- | --- |
| Visitor / prospect | Understand ADS, find their sector or pathway, open the right platform, or leave a request |
| Partner institution (education, financial, technology) | Register partnership interest, be contacted |
| Signed-in member | Sign in once, see their access status, reach the products they use, set language |
| ADS staff (`staff`) | Work the engagement pipeline: assign, answer, route |
| ADS staff admin (`staff_admin`) | Approve portal access and grant roles |

## 2. Market standard checklist

The yardsticks are:
- **Google Account / Microsoft 365 app launcher:** one sign-in, and every product is one click away with no second password.
- **Stripe.com / Andela:** a company front door that explains the offer, routes by need ("I am a developer / a business"), and captures leads with a clear next step.

The 18 items below are what a visitor or staff member expects from this kind of hub.

| # | Expectation | Score | What happened |
| --- | --- | --- | --- |
| 1 | Home page says in one line what ADS is and what to do next | **Works** | "Connecting African capability, technology and enterprise", with **Choose your pathway** and **Explore the ecosystem** (`d-vis-01-home`, `m-vis-01-home-fr`) |
| 2 | Directory of sectors and products, showing which ones are live | **Missing** | No product list. The **Sector Solutions** menu lists 4 legacy pages; `Sectors.tsx` (6 sectors with "available / coming soon") is not mounted. The **Learn & Build** menu items all go to `/#ecosystem`, whose "Explore this capability" links jump to page anchors (`#engage`, `#participate`). |
| 3 | Each sector or product entry opens the live platform | **Missing** | Not one outbound link to an ADS product (checked all `<a href>` on the home page and the sector pages) |
| 4 | Sign in once with the shared ADS account | **Works** | Header **Sign in**, then the kit page ("Try the ADS demo", **Use demo account**), then back to the same page (`d-stf-02-kit-signin`, `d-stf-03-after-signin`). The kit page follows the page language (`m-chk-01-kit-fr`: "Se connecter à ADS Hub"). |
| 5 | Single sign-on hand-off into the products | **Works with friction** | SSO itself works. With the Hub session open, Logistics' **Sign in** went straight to "Choose a workspace" with no password asked (`d-sso-02-logistics-after`). The Hub offers no way to get there (US-002 gateways not built). |
| 6 | Account menu, portal link, sign out | **Works** | The account menu shows "Signed in as …", **Portal**, **Profile and settings** and **Sign out** (`d-stf-04-account-menu`). Sign-out returned to `/` with **Sign in** visible. |
| 7 | Pathway forms: short form, consent, reference, reply promise | **Works** | "Digitalize My Business" gave "Thank you, reference HUB-KLVEC8. We will reply within 2 working days." (`d-vis-02/03`) |
| 8 | Partner registration | **Works** | `/partners` on a 360 px phone in FR gave a reference (`m-vis-04-partner-sent`) |
| 9 | Contact / help with a way to follow up | **Works with friction** | The phone menu has **Aide et contact**, and a question gave a reference (`m-vis-03-contact-sent`). There is no page to follow the answer; it arrives only by e-mail (by design, HUB-J21). |
| 10 | Acknowledgement e-mail in the visitor's language | **Works** | Mock capture, Test mode (covered by the existing E2E; not visible to a demo tester) |
| 11 | Staff pipeline: list, filter, assign to me, answer, route | **Works with friction** | 8 seeded engagements plus the walk's 3. Assign and answer gave the status "Answered" (`d-stf-05/06`). **At 768 px the list was 147 px wider than the screen** and the name and owner columns were cut off (`t-adm-01-staff-home`). At 360 px the top bar was 34–76 px too wide, cutting off the account button (`m-chk-02-portal`). |
| 12 | Access requests: requester sees "pending", admin approves, requester gets in | **Works with friction** | The admin side worked at 768 FR: the seeded request from "Second Demo User (s1)" was approved, and the screen said "Accès accordé. Un e-mail a été envoyé…" (`t-adm-02/03`). The **requester side cannot be demoed**: every demo account is already `staff`, so `/portal` sends them straight to the staff portal and nobody sees "No access yet" or "Pending since…". The grant offers only *Staff* or *Staff admin*, even for a request that says "Member portal access". |
| 13 | Profile and settings: language and e-mail choice kept | **Works with friction** | Saving worked (`d-stf-07-settings`). **But the saved language overrode the page language after sign-in.** A French phone browser signing in as `demo.user` (saved EN) switched to English (`m-lang-01-after-signin`). This breaks owner rule 5. The same happened for `demo.admin`. |
| 14 | Whole site in EN and FR | **Works with friction** | 368/368 dictionary keys are translated. **Still in English in FR:** 5 older sector pages (Fiscal Tracking, Funding, Verification, Modules, Marketplace Bridge; for example "Ensure records match local accounting standards…", "Request pricing tables", "**Tax Authority Linkage**" with literal asterisks), the footer ("Built for Africa", product names) and "Read the full story →". **A de-DE first visit gave English, not French.** `<html lang>` stayed `en` on portal pages shown in French. |
| 15 | Phone menu with a reachable language switch | **Works with friction** | The public phone menu has EN/FR (`m-vis-02-menu-fr`). In the **staff portal**, the phone drawer covers the top bar and has no switch (`s-360-*-staff-drawer`). |
| 16 | Privacy and terms pages | **Broken** | The footer **Privacy** and **Terms** links are `href="#"` |
| 17 | Sector pages lead to a next step | **Broken** | **Apply**, **Request pricing tables** and **Evaluate assets** go to `/#register`. The home page has no `#register`, so the visitor lands at the top of the home page. |
| 18 | Guided advisor / search ("which product is for me?") | **Missing** | Planned later (HUB-J11, Agentic Advisor) |

**Score counts (18 items): 6 Works end to end, 7 Works with friction, 2 Broken, 3 Missing.**

## 3. The walks, step by step

### Visitor (desktop 1280 EN; phone 360 FR)

| Step | Result | Screenshot |
| --- | --- | --- |
| `/`, hero, 8 pathway cards | OK | `d-vis-01-home` |
| Card 03 "Digitalize My Business", fill in, consent, **Send** | Reference HUB-KLVEC8 | `d-vis-02-pathway`, `d-vis-03-pathway-sent` |
| **Sector Solutions** menu | Two elements carry the same text (desktop and drawer), and every item goes to a legacy page | — |
| Phone FR: menu, **Aide et contact**, question | Reference shown | `m-vis-02-menu-fr`, `m-vis-03-contact-sent` |
| Phone FR: `/partners` form | Reference shown; no horizontal scroll | `m-vis-04-partner-sent` |

### Staff (`demo.user`, desktop EN) and checker (`demo.checker`, phone FR)

| Step | Result | Screenshot |
| --- | --- | --- |
| Header **Sign in**, then **Use demo account** | Back on `/` as "Demo User". Sign-in from the header returns to the home page, not to the portal. | `d-stf-02/03` |
| Account menu, **Portal** | `/portal/staff`, 11 engagements | `d-stf-04/05` |
| HUB-S10006: **Assign to me**, answer, **Send answer and mark answered** | Status "Answered" | `d-stf-06-answered` |
| Checker on phone FR: menu, **Se connecter**, kit page in FR, typed sign-in | Page stays FR; `/portal` goes to the staff portal; top bar too wide | `m-chk-01/02` |

### Staff admin (`demo.admin`, tablet 768 FR)

| Step | Result | Screenshot |
| --- | --- | --- |
| `/portal`, **Se connecter**, typed sign-in | Staff portal; **list 147 px wider than the screen** | `t-adm-01-staff-home` |
| **Approbations**: seeded pending request, **Approuver**, confirm | "Accès accordé. Un e-mail a été envoyé à r3.s1@example.com." | `t-adm-02/03` |

### Language and single sign-on

| Check | Result |
| --- | --- |
| `demo.user` saves EN; new FR phone browser, signs in from a FR page | **Switched to English** after sign-in (`m-lang-01-after-signin`) |
| Same browser: open Logistics, **Sign in** | No password, kit "Choose a workspace" (`d-sso-01/02`) |
| First visit with a `de-DE` browser | English (should be French) |

## 4. Owner rules: EN/FR and three sizes

Sweep: 14 public pages at 3 sizes × 2 languages, plus 3 staff pages as `demo.admin`. **50 checks passed, 52 found a problem.** The problems were:
- the untranslated legacy texts above (every FR page shows the footer line);
- `<html lang="en">` on `/portal*` and `/account/settings` in FR;
- overflow on the staff pages: 360 px 34–63 px, 768 px 147 px.

| Rule | Result |
| --- | --- |
| Styles load on every size | **Pass** (953 CSS rules, Fraunces/Inter) |
| Switch visible on every page | **Pass** in the public header and phone menu. **Fail** in the staff phone drawer. |
| Whole page changes language | **Fail** on the 5 legacy pages, the footer and the About teaser (see item 14) |
| Persists after reload / sign-in | Reload: **Pass**. Sign-in: **Fail**, because the saved account language wins over the page choice. |
| Kit sign-in page follows the language | **Pass** |
| No horizontal scroll | **Pass** on all public pages; **Fail** on staff pages at 360 and 768 |
| Non-EN/FR browser gets French | **Fail** (English) |

## 5. User-experience pass

- **First impression:** calm, editorial, clearly ADS. The value line is good. Eight pathways is a lot for a first screen, but each card says what happens next.
- **Next step clarity:** strong for "leave a request", absent for "use a product". A Logistics or Commerce customer who arrives here cannot find the shop or the parcel service.
- **Errors and empty states:** form errors are plain ("Please check the highlighted fields."); the 404 page has three useful links.
- **Mobile:** public pages are fine at 360. Staff pages overflowed (now fixed on the branch).
- **What would make a tester give up:** (1) "where is the platform?": no route to any product; (2) the staff portal cut off on a tablet; (3) a French tester switched to English after sign-in; (4) sector pages whose buttons go nowhere.

## 6. Verdict and the fixes that most change it

**Can it perform its duty? No** for routing and single sign-on into the sectors. **Yes** as a lead-capture website and staff pipeline.

| # | Fix | Size | Plan item |
| --- | --- | --- | --- |
| 1 | **Product gateways:** a sector/product directory (live vs coming soon) on the home page and in the menu. Each live product links to its URL for the environment (demo/test/prod, from config) and starts sign-in with `ui_locales` and the right tenant hint, so the user arrives signed in. | M | HUB-US-002, EP-GATE, upgrade plan §5 |
| 2 | **Replace the legacy bank-era sector pages** with the real sector pages (Commerce, Logistics, Education, Fleet Guard, Tontine, VentureWorks…), each with "Open the platform" and "Talk to us" | M | Decision 6, HUB-US-003 |
| 3 | **Privacy and terms pages** (needed before collecting leads in production) | S–M | PLAT-DATA-001, HUB-J24 |
| 4 | **Member persona in the kit** (member only, no staff role), so the requester side of HUB-J14/J18 can be demoed. Offer a *Member* grant in Approvals. | S (kit) + S | BRIEF16 personas; HUB-US-008 |
| 5 | Language, layout and translation fixes (done on the branch, below) | S | BILINGUAL_RESPONSIVE_MOBILE_PLAN §4.2–4.3 |

## 7. Demo completability (BRIEF16)

Built journeys (E2E_STATUS): HUB-J01, J02–J09, J13, J21 (with J20 e-mail), J17, J12, J14+J18, J19. That is **8 journey groups**.

| Journey | Before | After the branch | What is missing |
| --- | --- | --- | --- |
| J01 home → pathways | yes | yes | — |
| J02–J09 pathway request | yes | yes | — |
| J13 partner registration | yes | yes | — |
| J21 contact (+ J20 e-mail in mock) | yes | yes | The tester cannot see the e-mail (mock capture) |
| J17 sign in / out | yes, but language lost | yes | — |
| J12 staff pipeline | yes, but cut off at 768 / 360 | yes | — |
| J14+J18 access request and approval | **no**: admin side only | **no** until the kit personas merge | A member-only persona. The seed now gives the pending request to `personas.member` / `personas.requester` when present, otherwise to `DEMO_USER2_SUB`. |
| J19 settings and language | yes, but the saved language overrode the page | yes | — |

**Completable: 7 of 8 before, and 7 of 8 after the branch.** It becomes 8 of 8 once kit `build/demo-personas-20261023` lands with a member persona for `hub`. The nightly `--reset` restores the pending request.

## 8. Method notes and limits

- The build machine was heavily loaded (load average around 100 on 2 CPUs) and restarted twice. Some sweep screenshots at 768/1280 were not kept; the findings come from the logged sweep (`walk.log` values quoted above).
- E-mail went to the kit mock. Delivery was confirmed in the app ("Un e-mail a été envoyé…"), not in an inbox.
- Screenshots are compressed to 128 colours. `d-` is desktop EN, `t-` is tablet, `m-` is phone, `s-` is the sweep. Passwords are masked.

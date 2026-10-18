# ADS UI/UX Register v1.0

**Status:** canonical list of the UI/UX reference for every ADS product. **Approved by the owner on 18 October 2026 as the standard for all ADS products**: every benchmark in section 1, the secondary references in section 2, and the master design system and sector-profile scheme in section 3. Products are built with the Software Factory master design system plus their sector profile.

**Owner decisions, 18 October 2026:** (1) one ADS corporate navy = the master navigation/ink `#102B43` (already used by the shared sign-in); RCK and Hub navies map to it. (2) VentureWorks code switches from teal to its approved green `#18764B`. (3) IIP uses the master primary `#087E79`. (4) Products with no benchmark (Personal Finance, Career Path, Nutrition, Hub) take the section 2 references.

How to use it: every story with a screen names its product's reference here (handbook §4). Each product keeps a short `docs/uiux/UIUX_REFERENCE.md` that points to its row and holds its mockups. The ADS master design system (section 3) applies to all products; a product overrides only its colours, benchmark and journeys through a sector profile.

Status labels: **APPROVED** = owner approved (dated). The column below keeps each row's history; since 18 October 2026 every PROPOSED, SELECTED or NONE row counts as **APPROVED 2026-10-18** with the section 2 reference where one is given.

## 1. Register (one row per product)


Typography: Inter is the template default unless stated otherwise.

| # | Repo | Benchmark(s), and where | Status | Palette (primary / nav / canvas) | Type | Mockups | Code follows it? | Conflicts between copies |
|---|---|---|---|---|---|---|---|---|
| 1 | software-factory (Foundry) | **Linear** (+ GitHub)<br>`docs/uiux/APPROVED_DESIGN_SYSTEM_v1.md:3`<br>`ADS_UIUX_BENCHMARK…:9-10`<br>VW `docs/uiux/ADS_VISUAL_REFERENCE_DECISION_2026-10-09.md:8` | APPROVED 2026-10-09 | `#087E79` / `#102B43` / `#EDF4F5` | Inter | 22 SVG (CM-UI-01..07, dept 01 states, dept 02-10 sheets); a 15-page registration PDF is referenced in `docs/uiux/README.md` but not uploaded | Partly: palette + `DeveloperShell` yes; dept screens are a generic `DepartmentWorkspace`; CM/AM screens have no routes | `SECTOR_ADAPTIVE_APPROVED_FRONTEND_DIRECTION_v1.0.md:5` says "bright blue selected navigation", which conflicts with the approved teal |
| 2 | africa-digital-synergy-ventureworks | **monday.com** (+ Notion)<br>`docs/uiux/APPROVED_DESIGN_SYSTEM_v1.md:3`<br>`ADS_VISUAL_REFERENCE_DECISION_2026-10-09.md:14`<br>SF `docs/standards/ADS_UNIVERSAL_FULL_STACK_HARDENING_STANDARD_v2.1.md:93` | APPROVED 2026-10-09 | `#18764B` / `#155C42` / `#F4F7F2` | Inter | 6 SVG (5 `WORKSPACE_MOCKUPS_v1.svg` + founder dashboard HF) | Structure yes; **colours no**: `src/app/ventureShell.css:1` uses teal `#157b74` (≈ SF), none of the 10 token hexes | A second `APPROVED_DESIGN_SYSTEM_v1.md` exists with the same name as SF's but a different palette |
| 3 | intelligent-cryptocurrency-platform (IIP) | **Republic** (+ Wealthfront, "Carta-like" density)<br>`docs/uiux/APPROVED_INVESTMENT_PLATFORM_DESIGN_SYSTEM_AND_ROLLOUT_v1.md:3,7,27` | APPROVED (no date) | `#087F79` / `#082F4C` / `#EEF3F5`; gold `#D9A441` | Inter | 1 SVG (superseded) + HTML `prototype/` (8 files) | Yes for palette + shell; about 40 of 46 journeys use a generic step form | Teal `#087F79` differs from SF `#087E79` by 1 bit; should be the same token |
| 4 | ads-commerce-platform | **Shopify / Jumia**; visual source is RCK `CommercePublicStorefrontV2.tsx`<br>JSON `references` | SELECTED (owner-selected V2), acceptance pending | `#087D5B` / `#103E35` / `#F5F9F6` | Inter | 0 | **Yes** (`src/styles.css`, `tests/theme.test.mjs`); about 13 off-palette greys | The `.md` still says PROPOSED blue `#2547A0`/`#192F6B` (lines 3, 29, 31) while the JSON says emerald; 3 token blobs across 57 branches |
| 5 | retail-connect-kit (AfriCoreStack) | Per-module refs:<br>Bolt/Grab/Uber, Airbnb/Amazon/Shopify, Duolingo/Khan, Headspace/Calm, Airbnb/Booking/Hopper, Zillow/Compass, TaskRabbit/Thumbtack, Lemonade, Monzo/Wise/Revolut/Nubank<br>`docs/architecture-evaluation/CORESTACK_DESIGN_LANGUAGE_REFERENCE_PER_MODULE_v1.0.md:14-74`<br>Universal: Stripe, Linear, Airbnb, Duolingo, Notion/Figma in `CORESTACK_UX_AWARD_BENCHMARK_RESEARCH_v1.0.md:24-35` | "Active design reference" (written by Claude; no owner approval recorded) | navy `218 46% 20%` (≈`#1C2E4A`) / sidebar same / gold `43 53% 54%`, teal `163 75% 25%` (`src/index.css:18,40-56`) | Inter | 0 (marketing JPGs only); Lovable `.lovable/memory` (19 files), 12 storefront themes `src/lib/storefront-themes.ts` | Partly: sector accents in `src/platform/publicExperienceThemeRegistry.ts`; raw Tailwind slate/emerald widely | Predates SF; uses neither SF nor VW palette. Health refs (Headspace/Calm) clash with Health repo (Doctolib) |
| 6 | education-and-intelligent-services | Duolingo / Coursera (template); RCK adds Khan Academy | PROPOSED | `#2456A6` / `#193968` / `#F4F8FF` | Inter | 0 | Partly (tokens + a11y + EN/FR; no frames, badges or skills map) | — |
| 7 | health (AfriCare/IHCP) | Doctolib / Zocdoc (template) | PROPOSED | `#146D91` / `#124B69` / `#F3FAFC` | Inter | 0 | Colours only; journeys not built | RCK module ref says Headspace/Calm for Health |
| 8 | soulbridge-mental-health-project | Headspace / Calm (template) | PROPOSED | `#236E73` / `#21474C` / `#F7FAF9` | Inter | 0 | Colours only; CSS byte-identical to Health | — |
| 9 | agriculture (AfriNourish) | OneSoil / Cropwise (template); RCK: "High-Tech Earth", sunlight contrast | PROPOSED | `#256143` / `#193F2D` / `#F5F9F3` | Inter | 0 | Colours only | — |
| 10 | logistics | Uber / Onfleet (template); RCK says inherit from Commerce/Mobi | PROPOSED | `#164E80` / `#173654` / `#F3F7FB` | Inter | 0 | Partly; the old teal block is still active | Template vs RCK "no own identity" |
| 11 | fleet-guard-and-intelligent-services | Samsara / Geotab (template); RCK Mobi: Bolt/Grab/Uber | PROPOSED | `#134E73` / `#102F48` / `#F2F7FA` | Inter | 0 | Colours only; no map-first UI | — |
| 12 | home-services | Taskrabbit / Thumbtack (template; RCK agrees) | PROPOSED | `#0B766B` / `#164940` / `#F3F9F7` | system-ui (token says Inter) | 0 | Colours only | — |
| 13 | africover-insurance-project | Lemonade / Policybazaar (template; RCK "unverified") | PROPOSED | `#1D4E89` / `#17355F` / `#F4F8FD` | Inter | 0 | Colours only | — |
| 14 | digital-tontine-and-intelligent-services | Moniepoint / Revolut (template) | PROPOSED | `#3E46A5` / `#252E70` / `#F5F6FC` | Inter | 0 | Partly (tokens tested; no ledger or payout screens) | RCK §11 asks for one ownable ADS finance accent; the tontine indigo, IIP teal and PLFI (none) do not share one |
| 15 | mama-care-and-intelligent-services | Huckleberry / BabyCenter (template) | PROPOSED | `#7D3677` / `#573050` / `#FFF8FB` | Inter | 0 | Yes for tokens; journeys partial | — |
| 16 | hopebridge | Givebutter / GlobalGiving (template) | PROPOSED; the owner kept the Lovable "foundation palette" (`src/test/ads-design-contract.test.ts`) | `#7C3BED` / `#3C2862` (unused) / `#F8F9FC` | ui-sans-serif | 0 SVG; Lovable prototype (8 photo assets) | Partly; prism teal/coral/gold gradients outside the tokens | Template vs approved Lovable foundation |
| 17 | ads-leisure-recreation-events | Eventbrite / Meetup (template) | PROPOSED | `#6D37AC` / `#3D226A` / `#FBF7FF` | Inter | 0 | Partly; teal base and purple override in one `src/style.css` | — |
| 18 | project-management-platform | ClickUp / Asana (template) | PROPOSED | `#283C68` / `#1D2A4B` / `#F5F7FB` | Inter | 0 | Partly (override block over hard-coded `#111827`) | An internal governance tool like SF that does not reuse the SF (Linear) system |
| 19 | go-ahead-guesser (Morphoo / LTTS) | YouVersion, BibleProject, Mighty Networks, Hallow, Circle<br>`docs/ux/morphoo-unified-five-platform-ux-standard.md:12-16,28` | Own standard; owner approval not recorded | `#203B52` / deep blue / `#F7F4ED`; gold `#C7A66B`, sage `#3C7669` | Figtree + Fraunces | 0; Lovable (`.lovable/plan.md`) | Tokens yes; about 17 of 66 routes modernised | Outside the SF schema; no `ads-design-tokens.v1.json` |
| 20 | africa-digital-synergy-hub (website) | None named; own brand in `docs/DEVELOPER_GUIDE.md` §5 (lines 120-123), `src/index.css:8-15` | Own brand (implicit owner); Lovable preview | Navy `#0C1A3A` / Gold `#EF9F27` / Cream `#F8F7F4` | Inter + Fraunces | 0 | Mostly (about 31 raw colour classes) | A third "ADS navy", different from SF `#102B43` and RCK `#1C2E4A` |
| 21 | nutrition-intelligence-platform | None named; POC FRS §2-3 ASCII layout; `docs/uiux/NUTRITION_UIUX_CONSOLIDATION_v2.md:2,10-11` (30 screens, green/blue/violet bands) | Spec "for owner review"; UI-02 open | No tokens; code `#086958` / — / `#f7f9f8` | Inter | 0 | Layout yes; no tokens | — |
| 22 | personal-life-financial-intelligence | None (FRS FR-001..005 dashboard elements only) | NONE | — | — | 0 | No frontend | — |
| 23 | career-path-platform | None; FRS §17 "Dashboard starting design" (text) | NONE | — | — | 0 | No frontend | — |
| — | ads-platform-kit (shared sign-in) | n/a | n/a | accent per client, default `#087E79`; ink `#102B43` (`services/identity/src/pages.mjs:87,94`) | system-ui | 0 | EN/FR + dark mode | The sign-in pages already use the SF palette as the ADS default (good) |

Notes:

- **Out of scope:** rag-intelligence-ai-platform (headless). progress-education-training and animated-intelligence-platform are outside the focus set and have no design reference.
- **Tokens are consistent within each repo across branches:** one blob per repo, except Commerce (3 blobs).
- **Copies conflict across repos:** 17 repos, 17 different token blobs. This is intended (sector-adaptive), but there is no `extends` link to a master.

## 2. Secondary and added references (APPROVED 2026-10-18)

These are for repos with no benchmark, or only a generic template one. Every proposal must be judged against mobile-first use on low-end Android, low bandwidth, and EN/FR.

| Repo | Proposed primary / secondary | One-line reason |
|---|---|---|
| personal-life-financial-intelligence | **Monzo** (budgets/pots, spending insights) / **Wave (sn) or Chipper Cash** | Monzo is the clearest budget-category UX. Wave and Chipper show francophone-Africa mobile-money simplicity on cheap phones. |
| career-path-platform | **LinkedIn Career Explorer / Handshake** / **Khan Academy** | Skills-gap and path-to-role views map to FRS §17 "TODAY → PATH → DESTINATION"; Khan's one-system learner→counsellor scaling matches. |
| nutrition-intelligence-platform | **Yazio** / **MyFitnessPal** | Yazio offers meal-plan-first day-strip planning with a light UI. MFP is the food-catalogue/search reference; both work offline-tolerant on mobile. |
| health (replace or confirm) | **Doctolib** (keep) + **mPharma / Helium Health** as secondary | Keeps the proven booking flow. The secondary references are African clinic/pharmacy workflows built for intermittent connectivity. |
| logistics | **Glovo / Gozem** in place of Uber as secondary | Gozem is a Francophone-West/Central-Africa super-app (moto taxi and delivery, used in Cameroon); Glovo has the courier tracking pattern. |
| fleet-guard | **Samsara** (keep) + **Bolt Fleet/Driver** | Keeps the operator console. Bolt covers the driver-side mobile flow for Cameroon taxi and bendskin operators. |
| digital-tontine | **M-Pesa/Wave** (in place of Revolut) + Moniepoint (keep) | Group contribution and payout UX for users of mobile money (MTN MoMo, Orange Money) matters more than neobank polish. |
| africover-insurance | **Lemonade** (keep) + **ACKO** or **Turaco** | Turaco is a micro-insurance product built around claims via USSD or WhatsApp in Africa; it fits low-income, low-bandwidth users. |
| africa-digital-synergy-hub | **Stripe.com** (corporate site IA) / **Andela** | Stripe shows clear multi-product "ecosystem" navigation; Andela is a credible pan-African tech-brand tone. |
| project-management-platform | **Linear** (adopt SF) or keep ClickUp | It is an internal delivery tool like Foundry; reusing the approved Linear-inspired system saves design work. |
| ads-leisure / mama-care / home-services / agriculture / soulbridge / education / hopebridge | Keep the template choices; add **one African reference** each: Afrotix/Quicket (events), *no change* (mama-care), Jumia Services/Gozem (home), Hello Tractor/Esoko (agri), Wysa (wellness: text-first, light), uLesson (edu), M-Changa (giving) | Each existing benchmark is Western-only; the African peer adds patterns for low-data, mobile-money and French support. |

## 3. Master design system (APPROVED 2026-10-18)

1. **Master file: SF `docs/uiux/APPROVED_DESIGN_SYSTEM_v1.md`**, promoted and renamed `ADS_MASTER_DESIGN_SYSTEM_v1.md`, with SF `ads-design-tokens.v1.json` becoming `ads-design-tokens.master.v1.json`.
   - The palette is already owner-approved.
   - It is already the default in the shared sign-in pages (`ads-platform-kit`).
   - It is already the IIP teal, to within 1 bit.
2. **The master owns** everything except colour and benchmark:
   - Base neutrals: canvas, surface, border, text and muted text.
   - Status colours: success `#18794E`, warning `#A46A11` and danger `#B93843`, with the rule "verified = green only with backend confirmation".
   - Inter typography and the type scale.
   - 44px touch targets, focus ring, breakpoints 360/768/1280, and reduced motion.
   - State set: loading, empty, validation, unauthorized, pending, success, failure and offline/retry.
   - The shared shell pattern and the EN/FR rule.
3. **Each product file becomes a sector profile** (`ads-design-tokens.<product>.v1.json`) with:
   - `"extends": "ads-design-tokens.master.v1.json"`.
   - Overrides **only** for `primary`, `navigation`, `accentSurface`, an optional `canvas` tint and an optional display font (Morphoo Fraunces, Hub Fraunces).
   - `references` and `journeys`.
4. **VentureWorks:** VW `APPROVED_DESIGN_SYSTEM_v1.md` is renamed `SECTOR_PROFILE_VENTUREWORKS_BUSINESS_v1.md`.
   - It keeps the monday.com inspiration and the green palette (`#18764B`/`#155C42`/`#F4F7F2`/`#E3F5DD`).
   - It inherits the master statuses. VW's amber `#D38A23` and danger `#B94B4B` either become documented overrides or adopt master values; owner decision.
   - The VW code switches from teal to VW green (owner, 18 Oct 2026).
5. **Other adoptions:**
   - IIP sets `primary` to the master `#087E79`.
   - Commerce fixes its `.md` to match its JSON.
   - RCK and Hub map their navy and gold to a master-aligned "ADS brand" profile; the ADS corporate navy is `#102B43` (owner, 18 Oct 2026).
   - Morphoo gets a sector profile JSON generated from its own standard.
6. **Fix SF `SECTOR_ADAPTIVE…v1.0.md:5`:** replace "bright blue selected navigation" with the master primary.

## 4. Shared UX patterns every ADS product should use

| Pattern | Standard | Best existing example to reuse |
|---|---|---|
| Sign-in / registration | One ADS account: email + activation email, Google, SSO, "Secured by Africa Digital Synergy" | **ads-platform-kit** `services/identity` + `packages/identity-client/ads-identity.js` (EN/FR, dark mode, per-product accent). Retire per-repo logins: RCK `src/pages/Login.tsx`, SF `DeveloperLogin.tsx`, Hub `src/pages/auth/Login.tsx`, Morphoo `src/pages/Auth.tsx` |
| App shell / navigation | Collapsible sidebar (drawer below 768px), product/project switcher, top bar with locale, notifications and account | SF `apps/developer-portal/components/DeveloperShell.tsx` + `foundry-navigation.ts` (data-driven nav); VW `src/app/VentureShell.tsx` + `ventureRoutes.ts`; IIP `src/App.tsx` department sidebar |
| Customer account ("My Account") | Universal CustomerShell: profile, orders/requests, payments, consents | RCK `src/components/customer/CustomerShell.tsx`, `src/pages/me/MeProfile.tsx` |
| Loading / empty / error / offline states | Skeletons (no spinners on lists); one-line empty state + 1 action (Linear rule, RCK benchmark :24); `role="alert"` errors; offline/retry banner | Skeleton component `src/components/ui/skeleton.tsx` (RCK, Hub, HopeBridge, Morphoo); IIP state toggles (draft/empty/pending/rejected/approved/unavailable). **No repo has a shared EmptyState component**; build one in the kit |
| Notifications centre | Bell + drawer, server-sourced, read/unread, EN/FR | Weak everywhere: RCK (15 files) and Education/HopeBridge (8-9) have notification code but no shared centre. **Build one in ads-platform-kit** |
| Settings / profile | Profile, language, notifications, security (from identity), data/consent | Morphoo `src/pages/Settings.tsx`, `MemberProfile.tsx`; RCK `MerchantSettings.tsx` |
| Language switch EN/FR | Visible toggle in the shell; i18n JSON per locale; persisted per account | Hub `src/components/LanguageToggle.tsx` + `src/i18n/locales/{en,fr}.json`; HopeBridge `LanguageSwitcher.tsx`; Morphoo `src/i18n/{en,fr}.json`; SF `apps/shared/platform-i18n.ts` (shared candidate) |
| Accessibility | WCAG AA contrast, 44px targets, focus-visible, skip link, reduced motion, screen-reader labels; a tokens/a11y test in CI | Template repos' `ads-theme.test.ts` / `tests/theme.test.mjs` (Commerce, Tontine, Education, Fleet, Mama-care, PMP); skip links in Africover, Agriculture, Health, Home, SoulBridge `src/public/styles.css`. Leisure has a CI job `.github/workflows/ads-uiux.yml` |
| Trust / evidence status | Reported / pending / verified (backend-confirmed only) / rejected badges | VW evidence-state rule (`APPROVED_DESIGN_SYSTEM_v1.md:10`); SF "designed / implemented / verified / deployed" |
| Low-bandwidth | Compressed media, text-first, cached shell, local mobile-money payment methods | Commerce token note ("low-bandwidth product media", Cameroon payments) |

## 5. Gaps and next actions

1. ~~The owner approves the master and the sector-profile scheme~~ Done: approved 18 October 2026, together with all section 1 and 2 references.
2. **Mockups exist for only 3 products** (SF 22, VW 6, IIP 1 + prototype). Every other product has 0. Priority frames: Commerce, Education, Health, Tontine and Career-path (one desktop and one mobile frame per critical journey, all states).
3. **Code drift to fix:**
   - VW teal vs approved green.
   - Commerce `.md` vs JSON.
   - Leisure and Logistics dual palettes.
   - Nutrition has no tokens.
   - HopeBridge nav is unused.
4. **Put the shared components in `ads-platform-kit`:** sign-in (done), shell, EmptyState/ErrorState, NotificationCentre and LanguageToggle. Each product then consumes them with its sector profile.

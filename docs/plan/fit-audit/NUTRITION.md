# Fit-for-purpose audit: Nutrition

Round 17, 23 Oct 2026. Briefs: `audit/BRIEF15-fit-for-purpose.md`, `audit/BRIEF16-demo-journeys.md`, `audit/BRIEF17-audit-and-fix.md`. Part 1 describes what we found on `main`; Part 2 fixes (small items only) are on the product branch `build/demo-journeys-20261023` (see the end).

**Owner's question:** can the person who came here get the outcome they came for?

**Verdict: Yes, with gaps.** A family can sign in with the demo account, set up a household (adults and children), declare allergies, set a weekly FCFA budget and get a safe 7- or 30-day meal plan from local Cameroonian foods, with a portion for each person, the projected spend, swaps that never break an allergy, and one shopping list. Progress check-ins, reminders, help, export and deletion all work, and the food-data team's two-person release works. Everything was walked for real (API + PostgreSQL + the kit sign-in), in English and French, on phone, tablet and desktop.

The gaps against a MyFitnessPal/Yazio-type product and a nutritionist's tools:
- **No food diary.** You cannot log what you actually ate, search the food list or scan a barcode. The product plans meals; it does not track intake.
- **No recipes.** A "meal" is a list of foods with grams ("Ndolé leaves 635 g"), not a dish with preparation.
- **No nutritionist tools** (client list, consented review, plan approval): Level 2 is not started.
- **Demo gaps, now fixed on the branch:** plans showed "The explanation is not available right now" (no TEST guidance in the RAG mock); the account's saved language overrode the language picked on the page; a German browser opened in English; the first-run screen had no language switch.

## Set-up and commits tested

| Item | Value |
| --- | --- |
| Product | `ksondo/nutrition-intelligence-platform` (GitHub `Nutrition-intelligence-platform`) |
| Code tested | `origin/main` `9c42fb2` (demo seed merged, PR #16) |
| Kit | `ksondo/ads-platform-kit` main `d28b6ac`. Real identity service in demo mode (`ADS_ENV=demo`, `DEMO_MODE=1`, `DEMO_SHOW_CREDENTIALS=1`) plus the kit mocks (email/SMS/RAG). Clients from `config/clients.demo.json` (Nutrition and Health entries, local redirect), then `demo-bootstrap`, `apply-clients` and `demo-orgs`. |
| Data | `scripts/e2e/prepare.mjs` (migrations, restricted runtime and worker roles), `scripts/db/staff-tenants.mjs`, `scripts/demo-seed.mjs` (12 TEST foods EN/FR, 12 TEST Yaoundé prices, released by two people). PostgreSQL 16, throwaway databases `g3_identity`, `nutrition_g3_demo`. |
| Accounts | `demo.user` and `demo.checker`: `nutrition_user` in "ADS Demo – Nutrition household" and `food_data_admin` in "ADS Staff – Nutrition food data". `demo.admin` owns both organisations. |
| Ports | identity 32440, mocks 32441, Nutrition 32442, PostgreSQL 32459. |
| Browser | Playwright Chromium. Journeys start at `/` and use the product's **Sign in** button and the kit page's **Use demo account**. 360 × 740 (touch), 768 × 1024 and 1280 × 860, EN and FR. |

## 1. Purpose and users

**Purpose:** a person or a family in Cameroon comes to eat safely and affordably: they leave with a meal plan for the week or month that fits their energy needs, never contains their allergens, uses local foods at local prices within their budget, and a shopping list for the market.

| User | Comes to |
| --- | --- |
| Individual | Get a safe plan for their own goal (keep, lose or gain weight) and follow it |
| Household parent / caregiver | Plan shared family meals with a portion per person, children included, within a FCFA budget |
| Family member | Join the household plan by invitation, help edit or just view |
| ADS food-data administrator | Import, check, release and revoke the food and price data plans are built from |
| Nutritionist / dietitian (Level 2) | Review and approve plans for consenting clients (not built) |

## 2. Market standard checklist

Yardsticks: **MyFitnessPal / Yazio** (profile and targets, food diary and database, recipes, meal plans, shopping list, progress, reminders) and a **nutritionist's practice tool** (client list, assessment, plan, follow-up).

| # | Expectation | Score | What happened |
| --- | --- | --- | --- |
| 1 | Sign in and first run | **Works with friction** | Front door → **Sign in** → kit demo panel → **Use demo account** → Continue → workspace choice → "Who are you planning for?" → household created. **Friction:** the family tester must choose between "ADS Demo – Nutrition household" and "ADS Staff – Nutrition food data"; picking the staff one lands on the food-data admin screen with only Settings and Food data (`d-02-kit-workspace.png`). The first-run screen had no language switch. |
| 2 | Profile and daily energy target, explained | **Works** | Height 20 cm refused ("Enter a height between 40 and 250 cm."), nothing saved. Then 2,110 kcal/day with the rule name and version and "awaiting review by a nutrition safety reviewer" (`d-05-needs.png`). |
| 3 | Generate a 7- or 30-day meal plan | **Works** | Breakfast, lunch, supper per day, grams, kcal, macros, cost and source per item (`d-06-plan.png`). Changing the weight marks the plan "Out of date: a profile changed"; Replan gives version 2; **Compare** shows what changed (`d-07-compare.png`). |
| 4 | Food diary: log what I ate, barcode | **Missing** | No intake logging. The core of MyFitnessPal/Yazio. |
| 5 | Search the food database with nutrient detail | **Missing** | Foods appear only inside plans, swaps and the report form; no food search or food page. |
| 6 | Allergies and hard restrictions | **Works** | "no nuts maybe, groundnuts" is ambiguous, so the app asks to confirm (`d-08-rule-confirm.png`); saved as "Hard rule peanut · severe". The 30-day plan has 0 peanut items. Several hard rules and a separate preference also work (e2e). |
| 7 | Swap a food | **Works** | Swapping in the groundnut sauce is refused: "Contains peanut — not allowed for Me." (`d-12-swap-refused.png`); a safe swap is compared and confirmed. |
| 8 | Recipes / dishes | **Missing** | Meals are food lists, not dishes with steps. |
| 9 | Family portions, children | **Works** | A child cannot be saved without the caregiver box; then "Me: 175 g · Junior: 115 g" for each shared dish, and per-person kcal against target in the plan header (`d-11-plan-family.png`). |
| 10 | Budget and local prices (FCFA) | **Works with friction** | 2,000 FCFA/week: "The budget is too low for a safe plan. The minimum is about 21,200 FCFA per week. Allergies are never relaxed to fit a budget." (`d-10-budget-too-low.png`). With enough budget: "93,475 FCFA / 112,286 FCFA · Within budget". **Friction:** until a price region is chosen every cost shows "Inconnu"/"Unknown" (`m-04-plan.png`): a new tester's first plan has no prices. There is no screen to enter your own market prices (API only). |
| 11 | Shopping list | **Works with friction** | One list for 7 or 30 days, grouped by food with kg and FCFA, a **Report** link per line, and print/save as PDF (`d-13-shopping.png`). **Friction:** you cannot tick items off at the market. |
| 12 | Progress (weight) and plan revision | **Works with friction** | Off until consent; check-in 71.5 kg "partly followed" saved and listed; the plan goes "Out of date: a check-in was recorded" (`d-15-progress.png`). **Friction:** a list only, no chart or trend. |
| 13 | Explanations (AI) with sources | **Works with friction (demo: broken)** | Numbers never depend on the AI. On the demo host the RAG mock had no nutrition guidance, so every plan said "The explanation is not available right now." **Fixed** on the branch (the demo seed loads TEST guidance into the mock). |
| 14 | Reminders and notifications | **Works** | Shopping reminder by SMS (test mode): "Tomorrow is your shopping day. Your shopping list is ready: …"; bell count and notification centre (`d-16-settings.png`, `d-17-notifications.png`). |
| 15 | English/French everywhere | **Works with friction → fixed** | 36/36 screen checks pass (styles, `lang`, no English left in FR). **Friction:** the account's saved language won over the page choice at sign-in; `de-DE` opened in English; no switch on first run. All three fixed on the branch. |
| 16 | Help / report wrong data, follow status | **Works** | "Received" → the food-data admin resolves → the tester sees "Resolved" (`d-18-help-report.png`, `d-23-admin-checker.png`). |
| 17 | Print, export, delete my data | **Works** | Print view with plan and shopping list; JSON download; delete with confirmation → back to first run (`d-19-print.png`, `d-25-delete-confirm.png`). |
| 18 | Invite a family member; leave or hand over | **Works** | Email invitation (test mode) → the second tester signs in from the link and accepts as editor (`d-20…21`). The only owner cannot leave; hand-over then leave works (`d-24-leave-confirm.png`). |
| 19 | Food data import, two-person release, revoke | **Works** | Import a CSV; "A different administrator must release this dataset."; the second admin releases; revoke marks plans out of date (`d-22-admin.png`, `d-23-admin-checker.png`). |
| 20 | Nutritionist tools: client list, consented review, approval | **Missing** | Level 2 (CJ-NUT2-05/06/07/19) not started. |

**Score counts (20 items): 9 Works end to end, 7 Works with friction, 0 Broken, 4 Missing.**

## 3. The walks

### Family tester (desktop 1280 EN, `demo.user`)

| Step | Result | Screenshot |
| --- | --- | --- |
| Front door → Sign in → Use demo account → workspace "household" | Lands on first run | `d-01`, `d-02-kit-login`, `d-02-kit-workspace`, `d-03` |
| Household "Famille Demo", profile (bad height refused, then saved) | 2,110 kcal/day | `d-05` |
| Generate 7 days; change weight; replan; compare | v1 → Out of date → v2, comparison | `d-06`, `d-07` |
| Allergy "groundnuts" → confirm as hard rule; add child Junior (caregiver box required) | Saved | `d-08`, `d-09` |
| Budget 2,000 FCFA → minimum shown; budget raised → 30-day plan | Within budget, portions per person, 0 peanut items | `d-10`, `d-11` |
| Swap to groundnut sauce refused; safe swap | Refused with reason / confirmed | `d-12` |
| Shopping list 7/30 days | 10 items, 93,655 FCFA | `d-13` |
| Progress consent + check-in | Plan out of date | `d-15` |
| SMS reminder (mock) | Delivered, bell shows 1 | `d-16`, `d-17` |
| Report wrong price | "Received" → later "Resolved" | `d-18` |
| Print and export | PDF view, JSON file | `d-19` |
| Invite `demo.checker` by email; they accept in another browser | Joined as editor | `d-20`, `d-21` |
| Hand over ownership, leave | Back to first run | `d-24` |

### Food-data team (desktop, `demo.user` then `demo.checker`, staff workspace)

| Step | Result | Screenshot |
| --- | --- | --- |
| Maker registers "mango set", imports CSV, tries to release | "A different administrator must release this dataset." | `d-22` |
| Checker releases; resolves the family's report; revokes | Released → Resolved → "Revoked. 0 active plan(s) are now marked out of date." | `d-23` |

### Phone 360 FR (`demo.checker`) and tablet 768 EN/FR (`demo.user`)

Front door, sign-in, first run, profile, plan, shopping list, family, progress, settings and help all worked; no horizontal scroll anywhere; the language switch stays reachable with the phone menu open (top element at the EN button is the button itself; 40 × 44 px) (`m-01…m-07`, `t-en-plan`, `t-fr-shopping`).

## 4. Owner rules: EN/FR and three sizes

Sweep: Plan, Family, Budget & shopping, Progress, Settings and Help at 360/768/1280 in EN and FR, plus the Food data screen at 360/768 FR: **36/36 pass** (styles loaded, `<html lang>` right, no horizontal scroll, no English dictionary text on FR pages, no raw codes).

| Rule | Result on `main` | After the branch |
| --- | --- | --- |
| Styles on all sizes | Pass | Pass |
| Switch visible on every page | **Fail on the first-run screen** (no switch); pass elsewhere, also with the phone menu open | Pass (switch added to first run) |
| Whole page changes | Pass (UI and server texts) | Pass |
| Kept through sign-in (shared demo account) | **Fail**: picked EN on the page, account saved FR → FR after sign-in (`d-30-lang-after-signin.png`) | Pass: the page choice wins when picked before sign-in, and always for demo accounts (`demo` claim) |
| `de-DE` first visit gives French | **Fail** (English) | Pass |
| No horizontal scroll | Pass at 360/768/1280 | Pass |

## 5. User-experience pass

- **First impression:** a calm landing with what the product does and one **Sign in**. After sign-in, "Who are you planning for?" with two clear choices. Good.
- **Next step is clear:** each screen says what is missing ("Add your profile to see your needs", budget minimum, "Out of date: …" with Replan).
- **Trust:** every number shows its rule version and source ("Source: Demo TEST row D-008"), and the test-mode banner says nothing reaches real people. Good for a health-adjacent product.
- **Empty states and errors:** plain language, in both languages (height range, caregiver authorisation, sole owner, self-release).
- **Mobile:** works well at 360 px; the plan is long (21 meals × items) and needs scrolling; day tabs scroll sideways.
- **What would make a tester give up:** (1) on a phone in French, every price says "Inconnu" until they find the price region under Budget; (2) the workspace choice shows an "ADS Staff" option to a family tester; (3) no way to log what they ate, which is what most people expect from a nutrition app.

## 6. Verdict and the fixes that most change it

**Can it perform its duty? Yes, with gaps.** For "plan safe, affordable family meals from local foods" it does the job end to end, bilingually, on every size. It is not a nutrition tracker and not yet a nutritionist's tool.

| # | Fix | Size | Plan item |
| --- | --- | --- | --- |
| 1 | **Food diary and food search**: log meals eaten (from the plan in one tap, or by search), daily kcal/macros against target. | L | New (FRS v2 has intake/adherence only as check-in feedback) |
| 2 | **Default price region** from the household's city (or ask at first run) so the first plan has prices; a screen for "my own market prices" (API exists). | S (default) + M (screen) | NUT-US-010/013, CJ-NUT2-02 "What is left" |
| 3 | **Recipes / dishes** (ndolé, eru, koki…) built from released foods, with steps and per-person portions. | M | POC Journey C (local dishes) |
| 4 | **Shopping list at the market**: tick items, offline. Progress chart. | S/M | CJ-NUT2-22 (offline), NUT-US-017 |
| 5 | **Nutritionist tools (Level 2)** after the safety review and credential decision. | L | CJ-NUT2-05/06/19, WP-07+ |
| 6 | **Workspace choice for family testers**: give the family demo persona only the household organisation (kit personas: `user`, `food-data-admin`). | S (kit) | BRIEF16 demo personas |

## 7. Demo completability (BRIEF16)

Built journeys (`docs/delivery/E2E_STATUS.md`): CJ-NUT2-12, 21, 01, 03, 02, 04, 13, 23, 20, 14, 15, 16, 17, 18 = **14**.

| Journey | Before (main) | After (branch) | What was missing |
| --- | --- | --- | --- |
| CJ-NUT2-01 safe plan with explanation | **No**: plan yes, explanation "not available" | Yes | TEST guidance in the RAG mock (seed) |
| CJ-NUT2-14 language | **No**: page choice lost at sign-in; `de-DE` → EN; no switch on first run | Yes | Product fixes |
| The other 12 | Yes, with `demo.user` + `demo.checker` (two browsers for invite, report/resolve, maker/checker) | Yes | — |

**Before: 12 of 14. After: 14 of 14.** Two-person journeys use the two shared accounts; once the kit's personas land (`user`, `food-data-admin`), the seed and the demo-journeys suite use them automatically.

## 8. Part 2: fixes on `build/demo-journeys-20261023` (product repo)

- Language kept through sign-in (page choice picked before sign-in, or any demo account, wins over the saved language and is saved); French for browsers asking neither EN nor FR; language switch on the first-run screen. `/api/me` exposes the kit `demo` claim.
- Demo seed: reads persona subs (`products.nutrition.personas['food-data-admin'].sub` as maker; second demo user as checker; fallback `DEMO_USER_SUB`/`DEMO_USER2_SUB`), refuses maker = checker, and loads TEST guidance into the RAG mock when explanations go to the mocks.
- `e2e/demo-journeys/` + `playwright.demo.config.mjs`: every built journey, signed in through the real ADS sign-in page, on the demo seed after `--reset`; desktop EN and phone FR, the main journey also at tablet 768 EN/FR; a `demo-journeys` CI job on the kit template (pinned to kit main `d28b6ac`). `DEMO_BASE_URL` points it at the hosted demo.

M/L items left: food diary and search, recipes, own-price screen, shopping tick-off/offline, progress chart, nutritionist tools (Level 2).

## 9. Method notes and limits

- No health inference is made about anyone; all profiles are invented test values.
- The demo users hold every Nutrition role, so role-only menus were checked in code (`web/src/app/main.jsx` NAV).
- Email/SMS/RAG went to the kit mocks (test mode).
- The shared test machine was heavily loaded (load average 50–110); some timings in the logs reflect that, not the product (local API calls are fast when idle).
- Screenshots are 128-colour PNGs; passwords are masked. `d-` desktop EN, `m-` phone FR, `t-` tablet, `s-` sweep.

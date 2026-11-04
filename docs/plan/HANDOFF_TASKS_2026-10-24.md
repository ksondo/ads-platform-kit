# ADS build: halt report and remaining tasks (24 Oct 2026, 09:20)

All Claude builds are halted. All work is saved on GitHub (unfinished work as "WIP" commits on its branch).
Remaining tasks below are written so another assistant (GPT) can pick them up. Claude keeps ~16% weekly usage
for **auditing and recommendations only**.

## Rules every task must follow (unchanged owner rules)
- Branch from or continue the named branch; never push to main or `deploy/*`; open a PR; merge only after an
  independent review and green GitHub CI (the reviewer is not the author).
- No secrets in code (no literal passwords, tokens or keys, including in tests); demo passwords come from server
  secrets/env. No Supabase. Sign-in only through the ADS kit (`ads-platform-kit` identity).
- Database: forced RLS, restricted runtime login, never weaken policies; demo seeds refuse to run unless
  `ADS_ENV=demo` AND `DEMO_MODE=1`; two-person (maker–checker) rules kept in data and code.
- Every user-facing string in EN and FR; the existing language switch must work on phone (360 px), tablet (768 px)
  and desktop (1280 px); the language chosen on the page must survive sign-in; French is the default for
  non-EN/FR browsers.
- Demo rule (owner, 23 Oct): demo users must be able to complete every built journey to its real outcome.
  Standard: `/home/claude/audit/BRIEF16-demo-journeys.md` (copied below in short).
- Kit E2E template pin: use the current kit main SHA.
- GitHub Actions: PR runs were blocked by "account locked due to a billing issue" as of 05:35 on 24 Oct.
  **Owner must fix billing first**, otherwise no PR can pass CI or merge.

### Demo-journey standard (short)
1. From the platform's front door, sign in on the ADS sign-in page with a demo persona ("Use this account"),
   finish each built journey to its outcome. 2. Two-person steps use two personas. 3. Every precondition is in the
   demo seed. 4. Works at 360/768/1280 in EN and FR. 5. Page language kept through sign-in. 6. Still true after the
   nightly `--reset`. 7. Proof: `e2e/demo-journeys/` Playwright suite through the real kit sign-in page, run in CI.

---

## A. Done and merged (no action)
| Item | Where |
|---|---|
| Demo data (seed + nightly reset that survives tester activity) | all 25 platforms |
| Tontine A/B/C: record-only money, partners/cooperatives, assistants, USSD (83% of FRs) | Tontine main 125e2b6 |
| Fleet Guard demo journeys (22 demo-journey tests) | Fleet Guard PR #19, ce3a488 |
| Commerce staff sync + server fix guide | Commerce PRs #57, #58 |
| VentureWorks blank-page fix | VW PR #91 |
| Vite security update | 9 platforms |
| Kit: Ubuntu 24.04 test runner, sign-in wait fix | kit PRs #16, #17 |
| Owner decisions D-REL-01 (Education), D-9/D-10 (Morphoo) | Education #42, Morphoo #36 |
| Fit-for-purpose audits | Commerce, Fleet Guard, Education*, VentureWorks, Tontine, MamaCare, Career Path (kit branch `plan/launch-wave1-20261020`, `docs/plan/fit-audit/`) |

\* Education audit file may be missing from the plan branch (push may have failed at a machine restart) — see T-02.

---

## B. Remaining tasks

### B1. Ready for review and merge (built; needs reviewer + green CI)
| ID | Repo | PR / branch | State | What the reviewer must check | Size |
|---|---|---|---|---|---|
| T-01 | ads-platform-kit | PR #20 `build/demo-personas-20261023`, head 4f01a43 | Claude review **approved**; only CI missing (billing) | Re-run CI; merge with `sha=4f01a43…`. After merge, demo host needs `DEMO_PERSONA_PASSWORD` in identity env, then `demo-bootstrap` + `demo-orgs`. 130 personas in `config/demo-personas.json`. | S |
| T-03 | Commerce | PR #62 `build/demo-journeys-20261023` | Built; review started, not finished; may conflict with GPT's merged #60/#61 | Rebase on main, resolve conflicts; review seed (reviewer ≠ creator, bank agent ≠ officer), role landing/nav, saved-address delivery keeps server validation, language through sign-in, layout fixes, demo-journeys suite | M |
| T-04 | Education | PR #45 `build/demo-journeys-20261023` (latest WIP commit pushed at halt) | Built + WIP; review started | Finish WIP (session.tsx + demo-journey specs), then review: class term, grading policy (creator ≠ approver), partner member, AI test content with citations, guardian-link default, D-REL-01 not contradicted | M |
| T-05 | MamaCare | PR #22 head 106c420 | Built; review started | Seed rule set approved by two distinct test clinicians, TEST-ONLY content, no AI on safety paths; regular e2e is already flaky on main — don't merge on a new failure | S |
| T-06 | Career Path | PR #2 head 2d71b82 | Built | Advisor test docs only in AI mock; language rule; French default | S |

### B2. Built in part — finish, open PR, then review/merge
| ID | Repo | Branch | Done | Remaining | Size |
|---|---|---|---|---|---|
| T-07 | VentureWorks | `build/demo-journeys-20261023` | Seed (assessments, templates, reviewers, contributor), language, small fixes; server/seed tests pass | Finish `e2e/demo-journeys/` (4 tests crashed on memory, re-run); open PR. Audit: `fit-audit/VENTUREWORKS.md` | M |
| T-08 | Tontine | `build/demo-journeys-20261023` (WIP pushed) | Seed with personas, extra tests started | Personas in seed (group-admin, treasurer, 2 approvers ≠ proposer/beneficiary, beneficiary, auditor, cooperative, partner); test mobile-money group; demo-only "Test messages" inbox (SMS/email codes for own numbers only); clear error when kit client secret missing; host settings in deploy/DEMO_DATA.md; language fixes (dispute statuses, notifications, audit codes, phone menu, USSD date); reset clears assistant sources and hides dissolved groups; demo-journeys suite. Audit: `fit-audit/TONTINE.md` (today 11/24 journeys completable) | M |
| T-09 | Hub | `build/demo-journeys-20261023` | 1 commit of fixes | Finish audit report (WIP draft on kit branch `wip/hub-audit-20261024`, file `docs/plan/fit-audit/HUB.md`) and fixes; demo-journeys; PR | S |
| T-10 | Logistics | `build/demo-journeys-20261023` (WIP pushed) | Seed edits started | Finish fixes, audit report, demo-journeys, PR | S |
| T-11 | Project Management | `build/demo-journeys-20261023` | 1 commit | **Remove literal test passwords from `e2e/demo-journeys/demo.mjs` (already pushed on this branch) — generate throwaway passwords at test start or read from env.** Then finish fixes, audit, PR. Main auto-deploys behind a preflight; preflight fails until server `runtime.env` has `PUBLIC_URL` and `ADS_IDENTITY_CLIENT_SECRET` (owner/server task) | S |
| T-12 | Software Factory | `build/demo-journeys-20261023` | Uncommitted work in Claude's machine only (not pushed: contained literal test passwords) | Redo: demo-journeys suite without literal passwords, seed fixes (`scripts/demo-seed.mjs`), foundry UI fixes; audit; PR. Same auto-deploy/preflight note as PMP | M |
| T-13 | Nutrition | `build/demo-journeys-20261023` | 1 commit (language default/kept through sign-in, first-run switch) | Docs (DEMO_DATA, E2E_STATUS), demo-journeys, audit, PR | S |
| T-14 | Health | `build/demo-journeys-20261023` | 1 commit | Finish fixes, audit, demo-journeys, PR | S |
| T-15 | HopeBridge | `build/demo-journeys-20261023` | 2 commits; desktop EN demo walk 10/10 | Phone FR walk, audit report, PR | S |
| T-16 | SoulBridge | `build/demo-journeys-20261023` | nothing committed | Language fixes, audit report, demo-journeys, PR | S |
| T-17 | Banking | `build/demo-journeys-20261023` head d2f5b4b | 3 commits | CI on head, audit report, PR | S |
| T-18 | Investment | `build/demo-journeys-20261023` head cee051b | 3 commits | CI on head, audit report, PR | S |
| T-19 | AfriCover | `build/demo-journeys-20261023` | 2 commits | `demo` flag in claims/me, specs, audit, PR | S |
| T-20 | Agriculture | `build/demo-journeys-20261023` | 2 commits | Config + specs, audit, PR | S |
| T-21 | Morphoo | `build/demo-journeys-20261023` (WIP pushed) | 3 commits + WIP | D-9 onboarding wording (EN/FR): "formation can start alone"; demo fixtures; audit; PR | S |
| T-22 | Personal Finance | `build/demo-journeys-20261023` | 1 commit | Demo-journeys suite, audit, PR | S |
| T-23 | Tourism | `build/demo-journeys-20261023` | 3 commits (demo flag in claims/me, language rule in progress) | Finish, audit, PR. CI fails on any skipped test | S |
| T-24 | Transport | `build/demo-journeys-20261023` | 2 commits | Finish, audit, PR. CI fails on any skipped test | S |
| T-25 | Home Services | `build/demo-journeys-20261023` | 1 commit | **Refund bug: sends `originalRequestId`, kit mock requires `paymentId` — every refund fails.** Audit report, demo-journeys, PR | S |
| T-26 | Leisure | `build/demo-journeys-20261023` | nothing committed | Fixes, demo-journeys infrastructure, audit, PR | S |
| T-02 | ads-platform-kit plan branch | `plan/launch-wave1-20261020` | Audits on branch | Confirm `docs/plan/fit-audit/EDUCATION.md` exists; write the cross-platform summary table of all audits | S |

### B3. On hold by owner decision (do NOT start without owner OK)
| ID | Item | Branch | State | Size |
|---|---|---|---|---|
| H-01 | Personal 30-day sandboxes (sign-up, private copies, switch role, expiry) — **build in the real MVP** | kit `build/demo-sandboxes-20261023` | ~40% | L |
| H-02 | Commerce hub with map, sectors/regions, shop locations (Leaflet/OSM; Airbnb/Google Maps/Glovo patterns) | Commerce `build/commerce-hub-map-20261023` (migrations 040–044) | ~35% | L |
| H-03 | Commerce marketing: 4 professional themes, promotions (server-side), share link/QR poster, featured shops, Shop tools page | Commerce `build/commerce-marketing-20261023` (migrations 045–049; WIP pushed) | ~35% | L |
| H-04 | Sandbox connections on 25 platforms (`/internal/demo/sandboxes` create/delete) | — | 0% | M |
| H-05 | End-to-end simulation: 79 items (52 S, 19 M, 8 L) — mocks on demo host, decision-waiting mode, simulator panel, payouts/card/courier/e-signature/USSD mocks, per-platform completion | — | 0% (inventory done) | L |

### B4. Owner / server actions
| ID | Action |
|---|---|
| O-01 | Fix GitHub billing (account locked) so PR CI runs |
| O-02 | Demo host: add `DEMO_PERSONA_PASSWORD` to identity env after T-01 merges; run `demo-bootstrap`, `demo-orgs` |
| O-03 | Commerce demo host: follow `COMMERCE_DEMO_SERVER_FIX.md` (seed, staff sync, settings); add kit mocks service |
| O-04 | PMP and Software Factory: add `PUBLIC_URL`, `ADS_IDENTITY_CLIENT_SECRET` to server `runtime.env`; allow the server to reach ADS sign-in |
| O-05 | HopeBridge production DB owner is a superuser — change to a normal owner login |
| O-06 | Delete merged/superseded branches (cleanup docs exist in Commerce, Tontine, VentureWorks: `docs/cleanup/BRANCH_CLEANUP_2026-10-18.md`); enable "automatically delete head branches" |
| O-07 | VentureWorks PR #88 (deploy/contabo staging): A keep (port tooling to main) or B close (recommended) |
| O-08 | Disable old test account `test-access@africorestack.invalid` |
| O-09 | Tontine: confirm defaults (record-only; exact amounts; 10-year retention pending legal; cash-only final settlement; no write-off) and legal sign-off of EN/FR wording |
| O-10 | MamaCare: clinical lead sign-off of thresholds; child-protection contacts |
| O-11 | Nutrition: accept loosened requirements-count test (32 BR / 86 FR) |
| O-12 | Google Play: D-U-N-S number and ADS company Play account (apps after audits pass) |

### B5. Larger product gaps found by audits (for later prioritisation)
- Commerce: payment choice (MoMo/Orange test mode), online-order receipt, returns/disputes/ratings, staff invitation, till shifts with X/Z, product photos.
- VentureWorks: KPI actuals vs targets, budget and 3 scenarios, ADS portfolio view, better assessment, investor data room.
- Education: real report card, parent communication (absence SMS, announcements), homework, practice quizzes.
- Fleet Guard: reports/export, partner console, GPS, parts stock.
- Tontine: fines, overdue reminders, per-turn register, "record this meeting".
- MamaCare: support desk reachable, facility admin console. Career Path: export/share plan, curator titles, links out.
- Dev-only: vitest/tinypool critical advisories (major vitest upgrade); Hub/Morphoo Tailwind v4 advisories.

## C. How Claude will use the remaining ~16%
Review GPT's PRs against the rules above (security, RLS, maker–checker, bilingual, demo-journey standard),
merge those that pass, and give recommendations. No new building by Claude unless the owner asks.

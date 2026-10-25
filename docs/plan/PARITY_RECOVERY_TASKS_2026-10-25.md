# ADS platforms: parity recovery tasks (25 Oct 2026)

**Purpose.** No working journey from the old Retail Connect Kit (RCK) or from a platform's own Supabase-era app may
disappear without the owner's written decision. This file lists everything to resolve, per platform, as tasks.
Commerce has its own list (`COMMERCE_FINALIZATION_TASKS_2026-10-25.md`); it is summarised here only.

**Why work went missing.** On 28 Aug 2026 Supabase was removed from RCK (commit `a31e402`). Its business logic (tables,
triggers, edge functions) went with it, and RCK main became screens only, with commands that answer "success" without
doing anything. The platforms were then rebuilt in their own repos. Nobody kept a parity checklist, so journeys that were
not rebuilt were silently lost.

**Where the old work is kept (read-only references):**
- **RCK screens and journeys:** `ksondo/retail-connect-kit` commit `469f9f05`. Read with `git show 469f9f05:<path>`.
- **RCK real business logic** (Supabase migrations and edge functions): commit `a31e402^`, folders `supabase/migrations`
  and `supabase/functions`. Business-rule reference only: rewrite on PostgreSQL. Never restore Supabase.
- **Platform-own Supabase history:** for example Hub `ae397df`, HopeBridge `2affdfd`, Morphoo `fd8808f`.
- **RCK module map:** `ads-platform-kit` branch `audit/rck-module-map-20261019`, `docs/audit/RCK_MODULE_MAP_2026-10-19.md`.
  Merge it (docs only) as the index.

**Status values:** Not started · In progress · Done · Owner (decision needed) · Later (after first release).

---

## A. The rule for every platform (do first)

| ID | Task | Done when |
|---|---|---|
| A-1 | Write `docs/parity/RCK_PARITY_CHECKLIST.md` in each platform repo. Use the same format as Commerce: one row per old RCK screen, journey, edge function or Supabase table group. Columns: RCK id/file · what it does (one line) · v2 status (Done / Partial / Missing / Dropped by owner) · v2 file · test that proves it. | A checklist exists in each repo in section C |
| A-2 | For platforms that had their own Supabase app (Hub, HopeBridge, Morphoo), add rows for the Supabase-era pages and functions. | |
| A-3 | **No row is "Dropped" without the owner's written OK in that row.** Every "Missing" row becomes a backlog item in the repo's FRS/journey list. | |
| A-4 | Every new or restored journey goes into the platform's `e2e/demo-journeys/` suite, signing in as a demo account through the real ADS sign-in page, at 360/768/1280 px in EN and FR, and is in the demo seed. | |
| A-5 | Each PR updates the checklist rows it covers. A platform's first release is "finished" only when every row is Done, Dropped-with-OK, or Later-with-OK. | |
| A-6 | Cross-platform summary `docs/plan/PARITY_SUMMARY.md` on the kit plan branch: one row per platform (rows Done / Partial / Missing / Dropped). Updated weekly. | |

**Rules (unchanged):**
- **Branches and review:** a branch per task, a PR, green CI and Claude's review before merge. Never push to `main` or `deploy/*`.
- **Server and data:** no Supabase. ADS kit sign-in only. Forced row-level security. Two-person checks where money or approvals are involved.
- **Money and secrets:** payments and partners run through kit mocks in test mode. No secrets in code or tests.

---

## B. Owner decisions needed (these unblock the "at risk" items)

| ID | Decision | Options | Blocks |
|---|---|---|---|
| D-FG1 | **Fleet Guard D1:** who owns the old Mobi vehicle registry, ownership titles (carte grise), co-ownership and share buyout, liens, ownership transfer, owner payouts (versement), transport unions (syndicates), regulator approval, fuel-station POS? | Fleet Guard (recommended), a new "Mobility Registry" repo, or park | FG-1 … FG-9 |
| D-HUB1 | **Hub portals removed on 18 Oct:** rebuild the Bank portal, Merchant portal, pitch generator and pitches, meetings/scheduler, licences panel? Where? | Bank portal → Banking; Merchant portal → Commerce merchant workspace; pitches / meetings / licences → Hub staff portal (recommended) or park | HUB-1 … HUB-5 |
| D-CON1 | **Construction / Real estate:** the repo `construction-realestate-intelligence-platform` is empty. Build it, or park? | Build (old logic: 19 screens, rent, tranche, split, milestone functions) or park with the history pointer | CON-1 … CON-3 |
| D-PRO1 | **Processing** (old RCK `process` module; existing decision OD-2, default "shared engine") | Shared engine used by Agriculture and others, or own repo, or park | PRC-1 |
| D-REU1 | **Reuse / circular economy** (old RCK `reuse`, parked on 18 Oct) | Keep parked, or assign (e.g. to the Environment/Waste platform) | REU-1 |
| D-PRF1 | **Professional services** (old RCK `professional`) | Home Services (as in the module map) or park | PRF-1 |
| D-HLT1 | **Health:** IHCP Phase 1/Phase 2 split, and the missing Module 17 billing addendum (receipts) | Owner to confirm the split and provide the addendum | HLT-1, HLT-2 |

---

## C. Tasks per platform

### C1. Commerce (see its own list)
Touch POS, per-shop storefront with themes, map as the fourth entry, unified marketplace, clean-up, roles.
117-row checklist already on main (59 partial, 58 missing). Tracked in `COMMERCE_FINALIZATION_TASKS_2026-10-25.md`.

### C2. Fleet Guard: the biggest loss (~7% of the old module). Old code: RCK `src/modules/mobi`, `src/tenants/fleetguard`, `services/mobility`; logic at `a31e402^` (29 tables, 8 functions, 22 triggers; `mobi-cga-finalize`, `mobi-versement-run`, `mobi-compliance-score`)
| ID | Journey to restore | Status |
|---|---|---|
| FG-0 | Parity checklist (A-1) | Not started |
| FG-1 | Vehicle registry with ownership title; owner registers a vehicle with documents | Owner (D-FG1) |
| FG-2 | Carte grise application and finalisation (old `mobi-cga-finalize`) | Owner (D-FG1) |
| FG-3 | Co-ownership shares and share buyout | Owner (D-FG1) |
| FG-4 | Liens on a vehicle | Owner (D-FG1) |
| FG-5 | Ownership transfer with signatures, regulator approval | Owner (D-FG1) |
| FG-6 | Owner payouts and settlement (old `mobi-versement-run`), owner reports (FG-J-12 "lost from RCK") | Owner (D-FG1) |
| FG-7 | Compliance score (old `mobi-compliance-score`); extend FG-J-08 document-expiry alerts | Owner (D-FG1) |
| FG-8 | Transport union (syndicate) members and discipline; regulator dashboard | Owner (D-FG1) |
| FG-9 | Fuel-station POS: terminals, pumps, shifts (reuse the Commerce POS engine once its shifts are built) | Owner (D-FG1) |
| FG-10 | Send a parcel by bus: confirm whether Transport or Logistics owns it | Owner |
| — | Moved out by design (no action): vehicle marketplace and dealers → car-dealer repo; bus schedules → Transport | Done |

### C3. Hub: Supabase-era portals deleted on 18 Oct (`e2b4f5f`), not rebuilt
| ID | Journey to restore | Status |
|---|---|---|
| HUB-0 | Parity checklist from Hub's Supabase-era app (`ae397df`) | Not started |
| HUB-1 | Bank portal: branches, merchants, loans, POS, transactions, regulatory items → Banking (per D-HUB1) | Owner |
| HUB-2 | Merchant portal → Commerce merchant workspace (per D-HUB1) | Owner |
| HUB-3 | Pitch generator and pitches panel | Owner |
| HUB-4 | Meetings panel and scheduler | Owner |
| HUB-5 | Licences panel (regulatory items) | Owner |
| HUB-6 | Finish open PR #8 (demo journeys) | In progress |

### C4. Health (~65%). Old: RCK `src/modules/health`; real PostgreSQL tables on RCK main (`deploy/postgres/001_health_commerce.sql`)
| ID | Journey to restore | Status |
|---|---|---|
| HLT-0 | Parity checklist | Not started |
| HLT-1 | Health POS: record a visit, issue a receipt (old `health_encounters`, `health_receipts`) | Owner (D-HLT1) |
| HLT-2 | Patient lookup (old `health-patient-resolve`) with consent and access logging | Owner (D-HLT1) |
| HLT-3 | Facility dashboard: extend beyond the appointment queue | Not started |
| HLT-4 | Subsectors: catalogue beyond the 4 fixed categories | Not started |
| HLT-5 | Finish open PR #6 (appointment confirmation/cancellation demo journeys) | In progress |

### C5. Morphoo (church platform, repo `go-ahead-guesser`)
| ID | Task | Status |
|---|---|---|
| MOR-0 | Parity checklist from the Supabase-era app (`fd8808f`, 61 pages, 4 functions) | Not started |
| MOR-1 | **Bug:** Sanctuary post composer AI (draft, polish, shorten, expand, scripture) calls `social-post-ai`, which has no server route. Port it to `server/morphoo-api.ts` through the kit AI gateway, or remove the buttons. | Not started (small) |
| MOR-2 | `claude-formation`: confirm it is replaced by `server/companion-rag.ts`; delete the unused `useFormationAI` hook | Not started |
| MOR-3 | Old public church pages (Life, Partner, Apps, Testimonies), removed on purpose for the Morphoo rebrand (MOR-US-031): record "Dropped by owner" in the checklist | Owner (confirm) |
| MOR-4 | Finish open PR #39 (demo journeys) | In progress |

### C6. Agriculture (~35%). Old: RCK `src/modules/agric` (14 routes); logic at `a31e402^` (30 tables, `agric-farm-onboard`)
| ID | Journey to restore | Status |
|---|---|---|
| AGR-0 | Parity checklist | Not started |
| AGR-1 | Suitability wizard: what to farm and where (extend AG-J-01) | Not started |
| AGR-2 | Input market: farmer orders seeds, fertiliser, tools (AG-J-03) | Later |
| AGR-3 | Advisory guidance (AG-J-14) | Later |
| AGR-4 | Landowner lists land (AG-J-11) | Later |
| AGR-5 | Labour pool: worker joins, farmer hires (AG-J-15) | Later |
| AGR-6 | Forum and bush-market community (AG-J-16) | Later |
| AGR-7 | Farm POS (AG-J-17), reusing the Commerce POS engine | Later |
| AGR-8 | Transport provider registers: add it to the journey list, or hand it to Logistics | Owner |

### C7. Home Services (~65%). Old: RCK `src/modules/serv` (19 routes); logic at `a31e402^`
| ID | Journey to restore | Status |
|---|---|---|
| HS-0 | Parity checklist | Not started |
| HS-1 | Instant booking (HS-J-03) | Later |
| HS-2 | Report misconduct and safety console (HS-J-13) | Later |
| HS-3 | Provider portfolio (HS-J-12) | Later |
| HS-4 | Provider job workspace: materials (HS-J-06) | Later |
| HS-5 | Payout payment split (HS-J-07) | Later |
| HS-6 | Job chat (no table today): add to the journey list | Owner |
| HS-7 | Operator analytics: add to the journey list | Owner |
| HS-8 | Finish PR #9, including the refund fix (`originalRequestId` vs `paymentId`) | In progress |

### C8. Logistics (~77%). Old: RCK `src/modules/logi` (13 routes)
| ID | Journey to restore | Status |
|---|---|---|
| LOG-0 | Parity checklist | Not started |
| LOG-1 | Counter booking at the operator POS | Later |
| LOG-2 | Other platforms request a delivery (LOG-J-12): delivery API for Commerce, Agriculture, Health | Later |
| LOG-3 | Disputes workflow (beyond "report an issue") | Not started |
| LOG-4 | Franchise hubs: several operators | Later |
| LOG-5 | Finish PR #12; update the stale `docs/delivery/E2E_STATUS.md` | In progress |

### C9. Education (~90%)
| ID | Task | Status |
|---|---|---|
| EDU-0 | Owner signs the existing parity doc `EDUCATION_UI01_RCK_JOURNEY_PARITY_2026-10-16.md`, extended into the checklist format | Owner |
| EDU-1 | Bursar end-of-day Z-report | Not started |
| — | Loan centre left out by design (EDU-FR-038: refer to HopeBridge or the funding service) | Done |

### C10. Tourism (~75%). New owner since 19 Oct. Old: RCK `src/modules/tour` (18 tables, 11 functions)
| ID | Journey to restore | Status |
|---|---|---|
| TOU-0 | Parity checklist (extend `docs/provenance/RCK_TRANSFER.md`) | Not started |
| TOU-1 | Itinerary builder (TOUR-FR-021) | Later |
| TOU-2 | Accountant journals (TOUR-FR-024) | Later |
| TOU-3 | Bank tourism panel (TOUR-FR-025) | Later |
| TOU-4 | Diaspora payment (TOUR-FR-026); exchange rates (old `tour-fx-rate`); dispute escalation (old `tour-escalate-disputes`) | Later |
| TOU-5 | Operator POS: connect to the real Commerce POS engine (today a mock) | Later |
| TOU-6 | Open a PR for `build/demo-journeys-20261023` | Not started |

### C11. Banking (diaspora ~50%)
| ID | Task | Status |
|---|---|---|
| BNK-0 | Parity checklist (diaspora and finance modules, plus Hub Bank portal if D-HUB1 says so) | Not started |
| BNK-1 | KYC upgrade journey | Not started |
| BNK-2 | Finance public explorer (BNK-FR-023) | Later |
| BNK-3 | Construction site (chantier) bank panel (BNK-FR-018) | Owner (D-CON1) |
| — | Loans, repayment, staged disbursement left to the Funding engine (OD-B2); wallet/ledger dropped (OD-B4, no licence); diaspora "sponsor" stays in each product | Done |

### C12. SoulBridge (~90%)
| ID | Task | Status |
|---|---|---|
| SB-0 | Parity checklist | Not started |
| SB-1 | Workplace and employer wellness, aggregate-only reporting (SB-CAP-09) | Later |

### C13. AfriCover (~85% of old steps; repo richer)
| ID | Task | Status |
|---|---|---|
| COV-0 | Parity checklist | Not started |
| COV-1 | Conventional claims ("Make a claim", COV-BL-26/27, open decision 4) | Owner |

### C14. HopeBridge (repo richer)
| ID | Task | Status |
|---|---|---|
| HB-0 | Parity checklist from the Supabase-era app (`2affdfd`) | Not started |
| HB-1 | Finish partial items HB-BR-10, HB-BR-11, HB-BR-16 (story HB-US-023) | Not started |
| HB-2 | Open a PR for `build/demo-journeys-20261023` | Not started |

### C15. Leisure (sports 100%)
| ID | Task | Status |
|---|---|---|
| LEI-0 | Parity checklist (short) | Not started |
| LEI-1 | Start `build/demo-journeys` (T-26) | Not started |

### C16. Modules with no owner (only in RCK history: highest risk of loss)
| ID | Module | Old work | Task | Status |
|---|---|---|---|---|
| CON-1 | Construction / Real estate | 19 screens: projects, marketplace, tenants, settlement; functions rent, tranche, split, milestone; 17+ tables | Per D-CON1: build in `construction-realestate-intelligence-platform`, or park with a history pointer | Owner |
| CON-2 | | | If built: parity checklist, first release, demo journeys | — |
| CON-3 | | | If parked: `docs/PARKED.md` in the empty repo pointing to RCK `469f9f05` / `a31e402^` paths | — |
| PRC-1 | Processing | 13 files, 7 tables, 1 function | Per D-PRO1 / OD-2 | Owner |
| REU-1 | Reuse / circular | 4 files, 4 tables | Per D-REU1 | Owner |
| PRF-1 | Professional services | 11 files | Per D-PRF1; if Home Services, HS-J-05 / HS-J-12 | Owner |

### C17. Platforms checked, no loss found (checklist only)
| ID | Platform | Task |
|---|---|---|
| CL-1 | Software Factory | Short parity note: each Supabase persistence call has a PostgreSQL equivalent (done); open the T-12 PR |
| CL-2 | Project Management | No Supabase history; nothing to recover |
| CL-3 | VentureWorks, Tontine, MamaCare, Career Path, Nutrition, Personal Finance, Transport, Investment, Agriculture-adjacent repos | No RCK module, or rebuilt fresh. Write a one-line parity note. Transport: confirm it holds the bus schedules moved from Mobi |

---

## D. Order of work
1. **This week:** A-1 checklists for the platforms most at risk (Fleet Guard, Hub, Health, Construction pointer), MOR-1 bug fix, owner decisions in section B.
2. **Next:** checklists for all other platforms (A-1 … A-6), then restore "Not started" journeys platform by platform, in the same order as the go-live gate (Commerce first, then Education, VentureWorks, Fleet Guard, Tontine, then the rest).
3. **"Later" rows:** scheduled into each platform's release plan; none closed without the owner's OK.

## E. Reporting
Each weekly report includes:
- the PARITY_SUMMARY table: % of old journeys Done, before vs now, per platform
- decisions still open
- every unmerged branch

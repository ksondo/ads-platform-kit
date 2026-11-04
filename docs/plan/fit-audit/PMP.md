# Fit-for-purpose audit: ADS Project Management (PMP)

Round 17, 23 Oct 2026. Briefs: `audit/BRIEF15-fit-for-purpose.md` (with step 7), `audit/BRIEF16-demo-journeys.md`, `audit/BRIEF17-audit-and-fix.md`.
Part 1 (this report) describes what we found on `origin/main`. Part 2 fixed only small items that stopped a demo tester; those
fixes are in the product pull request named at the end, **not merged** (an independent reviewer merges).

**Owner's question:** can the person who came here get the outcome they came for?

**Verdict: Yes, with gaps.** A manager can set up the organisation (departments, teams, manager lines, a role catalogue,
positions that exist before anyone fills them, objective → programme → project), assign a role-aligned task to someone in their
reporting line, and that person accepts it and submits evidence. A different person verifies it (maker-checker holds: nobody can
approve their own work), and the Progress page shows **verified** work apart from merely **reported** work, per team and per
project. Notifications, settings, help requests, invitations, role grants and an unchangeable audit trail all work, in English and
French, on phone, tablet and desktop.

Measured against Jira, Asana or Trello, the gaps are large for day-to-day team use:
- **No board, no search, no comments.** Tasks are lists per page; there is no Kanban board, no way to search or filter tasks and no discussion on a task.
- **A task cannot be edited, reassigned, re-prioritised or cancelled** after it is assigned (no route or screen). Priority exists in the database but not on the form.
- **Evidence is a link or a note**, not a file upload.
- **No timeline, calendar, dependencies, sub-tasks or workload view** (blocked status exists, but no dependency is recorded on screen).
- **No export** (CSV/PDF) of tasks or progress.
- **On the demo (before the fixes):** "My team" told the demo manager "Nobody reports to you yet", the verification queue was empty, and role catalogue, positions and organisation were empty; a French tester was switched to English after sign-in; two pages scrolled sideways on a phone; the open phone menu hid the language switch. All fixed in Part 2.

## Set-up and commits tested

| Item | Value |
| --- | --- |
| Product | `ksondo/project-management-platform` (GitHub: `ksondo/Project-Management-Platform`), `origin/main` `b7b2eca` (demo seed PR #12 merged) |
| Kit | `ksondo/ads-platform-kit` main `d28b6ac`. Real identity service in demo mode (`ADS_ENV=demo`, `DEMO_MODE=1`, `DEMO_SHOW_CREDENTIALS=1`) through `ads-e2e up` with `ADS_E2E_IDENTITY_ENV_*`, kit mocks (email). PMP entry of `config/clients.demo.json` with a local return address, then `apply-clients` (admin-API client secret), `demo-bootstrap`, `demo-orgs`. |
| Data | `apps/api/dist/migrate.js` (runtime login under row-level security), the base seeds (`dist/seed.js`, as the deploy runs them), then `scripts/demo-seed.mjs` (6 projects, 10 tasks, 6 tester reports). Private PostgreSQL 16 cluster, throwaway databases `g2_pmp_*`. |
| Accounts | `demo.user` and `demo.checker` (hr, manager, employee, verifier, ceo, cto, qa, developer, tester, organizer in "ADS Demo – Project Management"), `demo.admin` (`admin`). Kit personas were not available yet (kit branch `build/demo-personas-20261023`, unmerged). |
| Browser | Playwright Chromium. Journeys start at `/` and go through PMP's **Sign in** button and the kit page ("Use demo account" for the demo user; the other demo accounts typed). 360 × 740, 768 × 1024, 1280 × 860, EN and FR. |
| Note | The machine was shared with other agents and restarted twice during the round (load averages 50–110 on 2 CPUs); a few browser crashes and slow screens were caused by that, not by the product. Speed is not judged here. |

## 1. Purpose and users

**Purpose:** an organisation (ADS itself first, then customers) comes to turn objectives into projects and tasks, give each task to
the right role and person, and know which work is **verified** done, not just reported done; it leaves with an accountable record of
who did, checked and approved what.

| User | Comes to |
| --- | --- |
| Executive / CEO | See verified vs reported progress across the organisation; own objectives |
| Manager | Assign role-aligned tasks to their reporting line, verify submitted work, follow progress |
| Employee | See their tasks, accept, submit the deliverable with evidence, be told the outcome |
| HR | Keep departments, teams, manager lines, the role catalogue and positions current |
| Administrator | Invite people, grant and remove roles, read the audit trail |

## 2. Market standard checklist

Yardsticks: **Jira** (issues, workflow states, boards, search, comments, reports) and **Asana / Trello** (projects, tasks with
assignee and due date, boards, comments and attachments, my tasks, notifications, timeline). The 20 items below are what anyone using
a project/task tool expects, independent of our design.

| # | Expectation | Score | What happened |
| --- | --- | --- | --- |
| 1 | Projects grouped under goals (portfolio) | **Works** | Objective → programme → project created from the screen; each project shows its task count. |
| 2 | Create a task with assignee, due date, deliverable | **Works with friction** | The form has project, title, deliverable, required role, assignee, due date, evidence required; a role mismatch asks for confirmation. **On the demo (before):** the demo manager had nobody in their reporting line ("Nobody reports to you yet. Ask HR to set manager lines."), so a tester had to find Organisation → Set manager first (`img/pmp/before-d-team-nobody.png`). Fixed by the seed. |
| 3 | "My tasks" with status and next action | **Works** | Accept, then submit; status badges in both languages. |
| 4 | Workflow board (Kanban) / drag between states | **Missing** | Lists only. Status changes only through accept / submit / verify. |
| 5 | Comments / discussion on a task | **Missing** | No comments anywhere. |
| 6 | Attachments / evidence files | **Works with friction** | Evidence is a link (https only) or a note; no file upload (E2E_STATUS: "File upload as evidence"). |
| 7 | Search and filter tasks | **Missing** | No search box or filter on My tasks, My team or Verification. Only the audit trail has filters. |
| 8 | Due dates, overdue view, calendar / timeline | **Missing** | Due date stored and shown; no overdue highlight, calendar or timeline/Gantt. |
| 9 | Notifications (in-app + email) | **Works** | Bell with unread count: "Demo User assigned you …", "… was verified and approved …"; email in the recipient's language (test mailbox). |
| 10 | Review / approval of finished work | **Works** | Verifier approves in a confirmation dialog or sends back with a required reason; own work refused ("You cannot verify your own work"). Stronger than the yardsticks. |
| 11 | Reports / dashboards | **Works with friction** | Progress: verified vs reported, by team and by project, organisation-wide for executives. No charts, trends or export. |
| 12 | Invite people, roles and permissions | **Works with friction** | Invite by email through the ADS sign-in (resend works); grant a role; deactivate. Revoking one role has no button (API only). |
| 13 | Activity history / audit | **Works** | Append-only audit trail with filters (admin). There is no per-task history on the task itself. |
| 14 | Sub-tasks and dependencies (blocked by …) | **Missing** | A "Blocked" status exists (seeded) but no screen records the dependency or sub-tasks. |
| 15 | Priority and labels | **Works with friction** | Priority exists in the data (seeded high/normal/low) but is not on the form or the cards; no labels. |
| 16 | Edit, reassign or cancel a task | **Missing** | No route or screen after assignment. |
| 17 | Export (CSV/PDF) | **Missing** | None. |
| 18 | Help / support | **Works with friction** | Help request with a reference ("Sent. Your reference is …"); there is no staff screen to answer it (status changes only in the database). |
| 19 | Workload / capacity | **Missing** | Planned in the BRS (capacity without surveillance); nothing on screen. |
| 20 | Phone, tablet and bilingual use | **Works with friction** (before) → **Works** (after) | Before: FR tester switched to English after sign-in; Organisation page 55 px and Settings 3 px wider than a 360 px phone; the open phone menu covered the EN/FR switch; tapping the page you are on left the menu open over the page. All fixed in Part 2. |

**Score counts (20 items, on `origin/main`): 5 Works end to end, 7 Works with friction, 0 Broken, 8 Missing.**
(After Part 2, item 2 and item 20 also work end to end on the demo: 7 / 5 / 0 / 8.)

## 3. The walks

All walks below are also the committed demo-journeys suite (`e2e/demo-journeys/*.spec.mjs`, Part 2), so they can be re-run.

### Manager → employee → manager (desktop 1280 EN; phone 360 FR; tablet 768 EN and FR)

| Step | Before (main + seed) | After Part 2 | Screenshot |
| --- | --- | --- | --- |
| Front door → **Sign in** → kit page → "Use demo account" | Lands on My team | Same; page language kept | `after-d-01-team.png`, `before-m-fr-03-home-en.png` |
| My team → assign "Install POS terminal at Mvog-Mbi" to Demo Checker, role Field technician | **Blocked:** "Nobody reports to you yet"; no assignee offered | "… assigned. Demo Checker has been notified." | `before-d-team-nobody.png`, `after-d-02-assigned.png`, `after-m-fr-02-assigned.png` |
| Verification (seeded work waiting) | "Nothing waiting for verification" | Seeded "Reconcile test cash deposits" waiting, submitted by Demo Checker | `before-d-verification-empty.png` |
| Employee (second browser): bell → My tasks → Accept → evidence link → Submit | Works (seeded tasks) | "Submitted. Verification pending." | `after-d-03-employee-task.png`, `after-d-04-submitted.png` |
| Manager: approve in the dialog | Works | "Approved by Demo User at …" | `after-d-05-approved.png` |
| Progress | Works (8 tasks, all in team "—") | Verified and reported counts move; by team "Yaoundé delivery team" | `after-d-06-progress.png` |
| Employee: notification and "Approved" badge | Works | Works | — |

### Organisation set-up (manager/HR)

| Step | Result | Screenshot |
| --- | --- | --- |
| Organisation: add department and team | "… created."; seeded departments shown after Part 2 (empty before) | `after-d-structure.png`, `after-m-fr-structure.png` |
| Role catalogue: create a role with activities | "Role … created." (catalogue empty before) | `after-d-catalogue.png` |
| Positions: open vacant, then fill | "Vacant", then "Occupied" | `after-d-positions.png` |
| Objectives & projects: objective → programme → project | Saved and listed (no objective/programme before; projects shown under "Project" only) | `after-d-portfolio.png`, `after-m-fr-portfolio.png` |

### Administrator and everyone

| Step | Result | Screenshot |
| --- | --- | --- |
| Users & roles: invite by email | "Invitation sent to …"; listed as pending; Resend available | `after-d-invited.png` |
| Grant a role to Demo Checker | "Role … granted to Demo Checker." (through the ADS identity admin API) | — |
| Audit trail filtered by `invitation.` | Entries listed | `after-d-audit.png` |
| Settings (language, email) and Help request | "Settings saved."; "Sent. Your reference is …" | `after-m-fr-help.png` |
| Sign out | Back on the sign-in card, same language | — |

## 4. Owner rules: EN/FR and three sizes

Sweep: every menu page as `demo.checker` and `demo.user` at 360 / 768 / 1280 in EN and FR (48 page checks per account), plus the open phone menu.

| Rule | Before (main) | After Part 2 |
| --- | --- | --- |
| Styles load on all sizes | **Pass** | Pass |
| Switch visible on every page | **Pass** in the top bar; **Fail** with the phone menu open: the menu and its shade cover the top bar, so EN/FR cannot be reached | Pass: the switch is repeated inside the menu |
| Whole page changes | **Pass** for every screen string (i18n test: every key has French). Seed content (project, role and programme names, evidence note) and the legacy "Delivery (K1–K7)" dashboard label "Assign" stay English | Same (sample data is English) |
| Language kept through sign-in | **Fail**: a French page becomes English after sign-in, because the shared demo account had English saved (`before-m-fr-03-home-en.png`) | Pass: the language on screen at "Sign in" wins and is saved with the account |
| First visit `de-DE` gives French | **Fail** (English) | Pass |
| Kit sign-in page follows the language | Pass | Pass |
| No horizontal scroll | **Fail** at 360: Organisation (55 px: a hidden label in the people table escaped its scroll box, `before-m-fr-structure-overflow.png`) and Settings (3 px: long email) | Pass on every page at 360 / 768 / 1280 |
| Phone menu | Tapping the page you are already on leaves the menu open over the page, and the next tap on the page is swallowed | Fixed: every menu tap closes the menu |

## 5. User-experience pass

- **First impression:** the front door is a bare sign-in card ("Sign in to PMP — Use your one ADS account"). It does not say what PMP does for a visitor; a short landing page (what you can do, sample screens) would help a demo tester.
- **Next step:** good inside the journeys: success messages name the person and the next state; the team page tells a manager without a team exactly what to ask HR. The Verification page explains "Reported is not verified".
- **Empty states:** clear on every page ("No roles yet. Create the first one."). On the demo before Part 2 too many pages opened empty.
- **Errors:** human messages for every refusal (own work, outside reporting line, missing evidence, version conflict).
- **Phone:** the success message after assigning a task is at the top of a long page and scrolls out of sight on a phone; the employee sees it only by scrolling up (`after-m-fr-02-assigned.png`).
- **Roles:** the shared demo accounts hold every role, so the demo manager is also employee, verifier and executive; the "employee only" and "executive only" views cannot be seen until kit personas exist.
- **Two products in one:** the "Delivery (K1–K7)" area (tester reports, QA, releases) is the older ADS delivery tool; it uses different screens and is English-heavy. Testers will wonder how it relates to the MVP.

## 6. Verdict and the fixes that would most change it

**Yes, with gaps.** The core execution-with-verification loop works end to end and is stronger than the market on accountability;
the everyday task-tool basics (board, search, comments, editing a task, attachments) are missing.

| Fix | Size | Plan item |
| --- | --- | --- |
| Task board (status columns) with search and filters on My tasks / My team | M | new story (PMP backlog EP-execution) |
| Comments on a task, and per-task history | M | new story |
| Edit / reassign / re-prioritise / cancel a task (with audit, maker-checker unchanged) | M | new story |
| Evidence file upload (kit file storage, virus check) | M | E2E_STATUS "Left" for PMP-J06 |
| Export of progress and tasks (CSV/PDF) | S–M | new story |
| Staff answer screen for help requests; revoke-a-role button | S | E2E_STATUS "Left" for J22 / J14 |
| Kit demo personas (manager, employee, verifier, executive, HR, admin) | M (kit) | Kit `build/demo-personas-20261023` |
| A short landing page at the front door | S | PLAT UX |

## 7. Demo completability (BRIEF16)

Built journeys (`docs/delivery/E2E_STATUS.md`): PMP-J19, J01, J02, J03, J04, J05, J06, J07, J14, J18, J20, J21, J22 = **13**.

| Journey | Before (main) | After Part 2 | What was missing |
| --- | --- | --- | --- |
| J19 Sign in / out | Yes | Yes | — |
| J01 Structure | Yes (empty) | Yes | Seeded departments, teams, manager line |
| J02 Role catalogue | Yes (empty) | Yes | Seeded roles |
| J03 Vacant position | Yes (needs a role first) | Yes | Seeded role and vacant position |
| J04 Objectives → projects | Yes | Yes | Seeded objective and programmes (projects were unlinked) |
| J05 Assign a task | **No** without first changing Organisation (no reporting line) | Yes | Reporting line demo.checker → demo.user |
| J06 Accept and submit | Yes (seeded tasks) | Yes | — |
| J07 Verify and progress | **No** for the seeded work (queue empty); yes only after J05/J06 by the tester | Yes | Seeded submission by demo.checker waiting for demo.user |
| J14 Users, roles, audit | Yes (demo.admin) | Yes | — |
| J18 Invite | Yes (needs `ADS_IDENTITY_CLIENT_SECRET` on the demo host) | Same | Demo host setting |
| J20 Settings and language | **No** (FR tester forced to English at sign-in; switch hidden in the phone menu) | Yes | Language kept through sign-in; switch in the menu |
| J21 Notifications | Yes | Yes | — |
| J22 Help | Yes (request and reference; no answer screen) | Same | Staff answer screen (M, not built) |

**Completable: 10 of 13 before → 13 of 13 after** (J22 to the reference number; an answer needs the staff screen).

Part 2: branch `build/demo-journeys-20261023` in `ksondo/Project-Management-Platform`, pull request #13 (head `1beaab4`). Local: demo journeys 10/10 passed (desktop EN, phone FR, tablet EN/FR), seed test and unit tests pass. Not merged.

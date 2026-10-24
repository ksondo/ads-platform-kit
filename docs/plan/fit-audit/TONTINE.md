# Fit-for-purpose audit: Digital Tontine

Round 15 + Round 16 (demo journeys), 23 Oct 2026. Briefs: `audit/BRIEF15-fit-for-purpose.md`, `audit/BRIEF16-demo-journeys.md`. This report only describes what we found. Nothing was fixed.

**Owner's question:** can the person who came here get the outcome they came for?

**Verdict: Yes, with gaps (product). The demo, as configured, is not successful under the owner's 23 Oct rule.**

The product does the core njangi job. A treasurer records a cash or group-account contribution and a second person confirms it. The member sees what they owe, when their turn is and what they have contributed. The cycle-1 payout went from "proposed" to two approvals, then "awaiting hand-over", then the hand-over was recorded and confirmed, and the payout showed **Paid**. Disputes, help, statements (PDF), the audit trail, the explain-only assistants and USSD all worked against the real ADS sign-in and the kit mocks. "ADS does not hold your money" is on every screen, in EN and FR.

The demo accounts cannot finish most journeys:
- **Nobody can run the seeded group.** The seed makes the demo user the group's organiser (`group_admin` membership). The kit does not give that account the `group_admin` role, so it gets no invite form and no rules form. It also cannot approve leaving or propose closing the group. The demo admin has the role but is not in the seeded group.
- **Payouts stop after turn 1.** Only two demo accounts can approve. From turn 2 on, one of them is the beneficiary and the other proposed the payout, so the second approval can never happen. "Beneficiary confirms receipt" is never shown, because the turn-1 beneficiary is a sample member nobody can sign in as.
- **Anything that needs an SMS cannot be finished by a tester.** This covers the invitation link, the USSD set-up code and the payout-number change. The codes go to the kit SMS mock, which has no inbox a tester can open. Email invitations fail with "The ADS sign-in service cannot be reached", because the demo host gives Tontine no client secret.
- **The account's saved language beats the page choice.** A tester who picks EN on the front door lands in French, or the reverse, depending on the last tester (Round 16 rule 5).
- **Partner, cooperative, mobile-money (test) and USSD journeys have no demo persona, no seed and no simulator.**

**Score counts (20 items): 6 Works end to end, 12 Works with friction, 0 Broken, 2 Missing.**
**Demo completability (24 journey rows): 11 can be completed by the demo accounts, 5 partly, 8 not.**

## Set-up and commits tested

| Item | Value |
| --- | --- |
| Product | `ksondo/Digital-tontine-and-intelligent-services` **main `125e2b6`** (includes the vite 6.4.5 bump; `npm ci`, `vite build`) |
| Kit | `ksondo/ads-platform-kit` main `d28b6ac`. Real identity service in demo mode (`ADS_ENV=demo`, `DEMO_MODE=1`, `DEMO_SHOW_CREDENTIALS=1`) plus the kit mocks (SMS, AI facade). The client came from `config/clients.demo.json` (Tontine entry only, local redirect), applied with `apply-clients`. Then `demo-bootstrap` and `demo-orgs` ran. |
| Data | PostgreSQL 16 cluster with **timezone UTC**, throwaway DBs `fa_tt_identity` and `fa_tt_app`. Steps: `migrate.mjs`, then `dbLogins.mjs provision` (three restricted logins `fa_tt_api`/`_webhook`/`_worker`), then `scripts/demo-seed.mjs` (94 rows). Later `--reset` (87 rows, new group generation). The product ran as the restricted logins, `EXTERNAL_MODE=mock`. |
| Extras (beyond the documented demo host settings) | AI facade configured (`TONTINE_AI_GATEWAY_URL`/secret, use cases); `tools/partner-intake-mock` (VentureWorks/Education); USSD gateway secret and pepper; `tools/ussd-gateway-mock` driven from a script. Without these, guidance, assistants, pathways and USSD answer "not available" (`adapters.mjs`, `ai/gateway.mjs` return `null`). |
| Accounts (kit) | `demo.user`: roles member, entrepreneur, treasurer, payout_approver, auditor, compliance_officer, support_officer. `demo.checker`: the same roles. `demo.admin`: `group_admin` only. All three are in "ADS Demo – Savings Group". |
| Ports | identity 32380, mocks 32381, product 32382, partner intake mock 32384, PostgreSQL 32399 |
| Browser | Playwright 1.56.1 Chromium. Every journey starts at `/` and uses the product's own **Sign in** button and the kit sign-in page. Personas and devices: demo user on desktop 1280 (front door EN), demo checker on phone 360 × 740 touch (front door FR), demo admin on tablet 768 (EN). |
| Machine | Shared with other agents. Load average reached 80–108 and the machine restarted twice. Parts of the 768 and 1280 sweep crashed ("Target crashed") and are marked below. |

## 1. Purpose and users

**Purpose:** a njangi/tontine (rotating savings association) comes here to keep honest shared records. For each meeting: who paid, who has not, who receives the pot next, and what each person owes or is owed. Two people confirm each entry, so members can trust the records without anyone handing money to ADS. They leave with proof (statements, an audit trail) and fewer arguments.

| User | Comes to |
| --- | --- |
| Member | See what I owe and when, when my turn is, confirm the payments the treasurer recorded for me, get proof, raise a dispute, use a feature phone (USSD) |
| Treasurer | Record cash or group-account contributions and payout hand-overs, see who has not paid, propose the payout, send reminders, reconcile |
| Group organiser (president/admin) | Create the group, invite members, publish rules (amount, frequency, rotation, penalties, approvals), approve joining and leaving, close the group at the end |
| Second official / auditor | Approve payouts (maker-checker), confirm records, read and export the audit trail |
| Partner / cooperative administrator | Run several associations: counts, support, consolidated reports |

## 2. Market standard checklist

Yardsticks:
- **What a Cameroonian njangi treasurer and member expect:** the meeting register (who paid this session), the order of beneficiaries, fines for lateness, written proof and disputes settled in the open.
- **Group-savings apps** such as **Esusu**-style rotation apps and **Chama** apps (ChamaSoft, Chamaa): contributions per cycle, rotation, reminders, statements, fines, loans from the group fund, and member visibility of the books.

| # | Expectation | Score | What happened |
| --- | --- | --- | --- |
| 1 | Create a group and set its rules (amount, frequency, rotation order, late penalty, approvals) | **Works with friction** | Demo admin: "Create a group", then the scheme draft, then rules **"Version 1 published. 1 due date(s) created."** (`t-03`, `t-06`). **Friction:** the seeded organiser (demo user) sees the rules read-only (`d-07`), because the token lacks `group_admin`. The order is set with ↑/↓ buttons only. No meeting place or time. |
| 2 | Invite members, including people with only a phone | **Works with friction** | Phone invitation: "Invitation sent by SMS". The SMS link opened the invitation (`m-21`). The rules were shown, the person consented ("Demande envoyée. L'administrateur doit l'approuver.", `m-23`) and the admin approved (`t-10`). **Friction:** invitation with an email answers **"The ADS sign-in service cannot be reached. Nothing was changed"** (`t-05`). Cause: `ADS_ADMIN_NOT_CONFIGURED`, because the demo host gives `tontine-web` no client secret (`needs_client_secret: false`). The message misleads. People with only a phone still need an ADS account with an email (kit K-02). |
| 3 | Member: what I owe, next due date, overdue | **Works** | Home card shows "Next payment 10 000 FCFA on 5 Oct 2026", "Overdue 10 000 FCFA" and the hint "Pay the treasurer in cash or into the group's own account… then you confirm" (`d-04`). It updates after confirmation ("Overdue: None", `s-360-fr-home`). |
| 4 | Who is next / my turn | **Works** | "My turn: 2 of 6 · 5 Sept 2026" on the home card. The Members tab lists every turn (`d-06`). USSD option 4: "your turn 2 of 6, 05 Sept 2026. Payout: proposed." |
| 5 | Treasurer records a cash or group-account payment; a second person confirms | **Works** | The demo user recorded 3 contributions (cash, and group account with a transfer reference): "Recorded. Waiting for a second person to confirm." (`d-09`). The recorder gets no confirm button on their own records. The checker confirmed all 3 ("Confirmé par deux personnes", `m-06`). Each member got an SMS asking them to confirm or reject. |
| 6 | Meeting register: who has / has not paid this round | **Works with friction** | The Payouts tab lists "Missing contributions" for the next turn (`d-12`), and Records lists every record. **Friction:** no per-turn grid (members × turns) and no "record the whole meeting" screen. A treasurer records members one at a time from a long drop-down (`m-05`). |
| 7 | Proof: receipt and statement | **Works** | Member statement PDF (1,977 bytes) and group statement PDF (2,979 bytes) downloaded. The record has a method, a date and a reference. SMS notices are sent on record and decision. |
| 8 | Payout: propose, two officials approve, hand over, beneficiary confirms | **Works with friction** | Turn 1: the checker gave the second approval and the status became `awaiting_handover` (`m-08`). The demo user recorded the hand-over and the checker confirmed it as an official. Status: **Paid** (`m-09`). **Friction:** the "Next payout" card shows the confirmed amount so far ("Turn 3 · 10 000 FCFA"), which reads like the pot size. In the demo, the beneficiary's own confirmation is never seen (see §4). |
| 9 | Fines for late payment | **Missing** | A late fee (500 FCFA after 5 days) is stored in the rules and explained by the assistant. It is never charged, recorded or shown as owed (`git grep lateFee src/server`: validation and text only). |
| 10 | Reminders before the due date, and chasing late payers | **Works with friction** | "Send due reminders" reported **"0 / 0 / 0"** (sent / failed / skipped, with no labels). Reminders go only for due dates from today within the lead days. Overdue dues are never reminded (`engagement.mjs` `due_at >= today`). |
| 11 | Disputes ("I paid but it shows unpaid") | **Works** | The member raised a dispute with a reference: "Dispute recorded: DSP-…" (`d-20`). The checker upheld it with an evidence note, and the member got an SMS ("dispute … was upheld"). |
| 12 | Group books / totals visible to members | **Works with friction** | "Held by the group (per the records) 100 000 FCFA = sum of members, Balanced" (`d-13`). **Friction:** the ledger table has no member name. All seeded entries carry the seed-run date ("23 Oct 2026"), not the meeting date. |
| 13 | Audit trail and export | **Works with friction** | 14 events, CSV and PDF export (`d-15`). **Friction:** the actions are raw codes (`record.contribution_confirmed`, `payout.awaiting_handover`). The actor is a 12-character id, not a name. "success" also appears in FR. |
| 14 | Leave the group with a settlement | **Works with friction** | The preview shows "I paid / I received / group owes me / I still owe" (`m-15`), and the request was sent: "Demande envoyée à l'administrateur" (`m-20`). In the demo nobody can approve it (§4). |
| 15 | End of cycle / dissolve with a final settlement | **Works with friction** | Built and covered by E2E (DT-J21). In the demo, the "Closing" tab shows the settlement preview but no account can propose closure (`d-26`, `m-14`). |
| 16 | Feature phone (USSD / SMS) | **Works with friction** | Through the gateway mock with PIN 2468: menu, "What you owe (records only): 4 due date(s), 40 000 FCFA due, 10 000 FCFA late". Confirming a treasurer-recorded payment with a PIN step-up worked: **"Confirmed: 10 000 FCFA. It is now in the group's records."** **Bug:** the pick list shows the raw date `Fri Oct 23 2026 00:00:00 GMT+0000 (Coordinated Universal Time)`. **Friction:** set-up needs the app plus an SMS code. The demo host has no USSD simulator. |
| 17 | Group fund loans, emergency fund, auction (bidding) tontine | **Missing** | Not in scope today: rotating eligibility only. The "goal/solidarity/custom" types have no own logic. Common in Cameroonian njangi and in Chama apps. |
| 18 | Help with the rules (explain only) | **Works** | "When is my turn?" was answered with a citation of rules v1. Goal planner: 120 000 FCFA, giving 12 monthly due dates of 10 000 (`d-18`). Flags: "0 new flag(s)". **Friction:** after the nightly `--reset` the same question was withheld ("I can't answer that right now", `d-17`). The old group's indexed rule sections stay in the tenant's knowledge box. It answered again after the mocks restarted. Answers in FR mode mix languages: "Selon les sources de test : What is the late penalty? A late penalty of…" (`d-17b`). |
| 19 | Full EN/FR | **Works with friction** | Every screen string switches. **Leaks:** (a) Disputes drop-down shows raw statuses `paid`/`due` in FR; (b) stored notifications stay in the language of the moment they were sent (FR page shows "…recorded… confirmed… cash"); (c) audit action codes; (d) seed values are bilingual pairs ("Membre démo S1-03 / Demo member S1-03", "Tontine rotative mensuelle / Monthly rotating tontine"). The seed's saved locale forces the language after sign-in (§5). |
| 20 | Clear that the platform never holds the money | **Works with friction** | The footer "ADS does not hold your money. Money stays with your group: in cash with the treasurer, or in the group's own account. ADS only keeps the records." is on every screen, signed in or not, EN/FR. Records and Closing repeat it. Home says "My net recorded contributions"; the ledger says "Held by the group (per the records)". No "savings / épargne / deposit / wallet / caisse" wording appeared on any screen walked. **Friction (wording risk):** Create group offers "Mobile money — TEST MODE, no real money" (demo package only). Settings has "Payout number (mobile money)", which reads as if ADS sends payouts. The kit's demo organisation is called **"ADS Demo – Savings Group"** (`clients.demo.json`). |

## 3. The walks, step by step

### Demo user: treasurer and member (desktop 1280, front door EN)

| Step | Result | Screenshot |
| --- | --- | --- |
| Front door EN, then **Sign in**, then kit demo panel **Use demo account** | Signed in. **Page came back in FR** (saved profile locale `fr` from the seed); switched to EN | `d-01`, `d-03`, `d-04` |
| Open group, then Members, then Rules | Read-only for the "organiser" (no invite or rules form) | `d-05…07` |
| Records: record S1-04 turn 2 (cash), S1-06 turn 2 (group account, ref), checker turn 3 | "Recorded. Waiting for a second person to confirm." ×3; own records have no confirm button | `d-08`, `d-09` |
| Payouts: own turn-1 proposal | No approve button (maker-checker) | `d-10` |
| Records: record turn-1 hand-over to S1-03 (after the checker approved) | Recorded | `d-11` |
| Payouts: turn 2 (demo user is the beneficiary, checker proposed) | **No approve button for anyone**: stuck | `d-12` |
| Ledger, then member and group statement PDFs; Reconciliation run; Audit and CSV | All OK ("All matched", 14 events) | `d-13…15` |
| Notifications, then "Send due reminders" | "0 / 0 / 0" | `d-16` |
| Rules assistant; Assistants (goal); Flags | Answered with citation (first run); after reset withheld; goal table; 0 flags | `d-17`, `d-17b`, `d-18`, `d-19` |
| Dispute "paid but unpaid" with reference; Help request | DSP-… and SUP-… references | `d-20`, `d-21` |
| Pathways: VentureWorks with consent | "Request sent." (intake mock) | `d-22` |
| USSD set-up: phone, then SMS code (read from the mock by the auditor), then PIN | "On for ••••0301" | `d-23`, `d-24` |
| Settings, then download my data (JSON) | Downloaded | `d-25` |
| Closing tab; Leave tab (as organiser) | No propose-closure button; no leave-request approvals | `d-26`, `d-33` |

### Demo checker: second person (phone 360, front door FR)

The kit page shows no "use this account" for this persona. The auditor typed the e-mail and the server-side password; a tester has neither.

| Step | Result | Screenshot |
| --- | --- | --- |
| Front door FR, then Sign in (typed), then home | Page language after sign-in followed the saved profile (EN in run 1, FR in run 2) | `m-01`, `m-03`, `m-04` |
| "Records to confirm", then confirm 3 records | "Confirmé par deux personnes" | `m-05`, `m-06` |
| Payouts, then approve turn 1 (second approval) | `awaiting_handover` | `m-07`, `m-08` |
| Confirm the hand-over the demo user recorded | Payout **Payé** | `m-09` |
| Propose turn 2 | Proposed; nobody left to approve | `m-10` |
| Disputes, then uphold with evidence; Help, then answer | Upheld; answered | `m-11…13` |
| Leave, then request | "Demande envoyée à l'administrateur", never approved | `m-15`, `m-20` |
| Open the SMS invitation link to the admin's new group, sign in, consent | Join request sent; admin approved | `m-21…23` |

### Demo admin: organiser of a new group (tablet 768, EN)

| Step | Result | Screenshot |
| --- | --- | --- |
| Sign in (typed) | Home: "You are not in any tontine yet", with "Create a group" | `t-02` |
| Create "Njangi des couturières de Bafoussam" (record-only) | Lands on Members | `t-03`, `t-04` |
| Invite by phone + e-mail | **"The ADS sign-in service cannot be reached"** | `t-05` |
| Invite by phone only | "Invitation sent by SMS." | `t-09` |
| Scheme draft, then rules v1 (5 000 FCFA) | "Version 1 published. 1 due date(s) created." | `t-06` |
| Approve the checker's join request | Second Demo User Active | `t-10` |
| Menu | No Partner or Cooperative entries (the demo package excludes them, and no account holds the roles) | `t-02` |

### Nightly reset

`demo-seed.mjs --reset` closed generation 1 (the group became `dissolved`, open records were rejected, dues cancelled) and seeded generation 2 with new ids. The walk was then repeated on generation 2 with the same results. Three side effects for testers:
- the rules assistant withheld its answers;
- the Flags and Guide group lists show the dissolved and the new group under the **same name**;
- the profile (language, display name, USSD number) is not reset, because the seed uses `ON CONFLICT DO NOTHING`.

## 4. Demo completability (owner rule, 23 Oct)

Personas available: `demo.user` (one-click on the kit page), `demo.checker` and `demo.admin` (password not shown to testers). "Yes" means a tester can reach the real outcome with the demo accounts as configured.

| Journey (E2E_STATUS) | Demo can complete? | What is missing |
| --- | --- | --- |
| DT-J11 Sign in | **Partly** | Only the demo user has "Use demo account". The checker and admin need passwords testers do not have (kit persona picker, BRIEF16). |
| DT-J12 Settings (language, payout number by SMS code) | **Partly** | Language: yes. New payout number: the SMS code lands only in the kit mock (no tester inbox). |
| DT-J08 Member home | **Yes** | — |
| DT-J01 Create group and invite | **Partly** | The admin can create a group and invite by phone, but the invitee must open the SMS link (mock only). The seeded organiser cannot invite: the kit must grant the demo organiser persona `group_admin` (`clients.demo.json` main roles), or the seed must make the demo admin the organiser. |
| DT-J02 Publish rules | **Partly** | Only in a new group made by the demo admin. The seeded group's rules cannot be changed (same cause). |
| DT-J19 Record-only contribution (treasurer + second person) | **Yes** | — |
| DT-J20 Record-only payout, turn 1 | **Yes** (official confirms) | The beneficiary's own confirmation cannot be shown: the turn-1 beneficiary is the sample member S1-03. The seed should make a persona the turn-1 beneficiary. |
| DT-J04/J20 Payout, turn 2 onwards | **No** | Needs a third approver persona (payout_approver) who is neither proposer nor beneficiary. Today the two approver accounts are always one proposer plus one beneficiary. |
| DT-J03 Pay by mobile money (test) / DT-J05 failed or reversed payment | **No** | The seeded group is record-only. No mobile-money test group or dues are seeded (a deliberate pilot choice; if the demo should show it, seed one labelled test group). |
| DT-J05/J18 Dispute and case handling | **Yes** | — |
| DT-J09 Auditor trail and export | **Yes** | — |
| DT-J07 Rules assistant | **Yes**, until the first nightly reset | Demo host settings must add `TONTINE_AI_GATEWAY_URL` + secret and configure the mock facade. `--reset` must withdraw the old group's `ai_source` rows / knowledge-box entries. |
| DT-J13 Reminders and notifications | **Partly** | Reminders send nothing on the seed (no due date inside the 1-day lead window; overdue never reminded). Seed a due date for tomorrow, or remind overdue dues. |
| DT-J14 Help | **Yes** | — |
| DT-J15 Leave | **No** | The request works; approval needs an active `group_admin` member (none in the seeded group). |
| DT-J21 Dissolution | **No** | Proposal needs an active `group_admin` member (none). |
| DT-J16 Data rights | **Yes** (export) | Withdrawal and erasure were not tried on the shared accounts (they would break the next tester). They need a throwaway persona. |
| DT-J22/J23 Invitations through ADS | **No** | Demo host: `tontine-web` has no client secret (`needs_client_secret: false`), so the admin API grant fails. The phone path needs the SMS. `clients.demo.json` also has `allow_personal_workspace: false` and no `invitee` self-role, unlike `e2e/kit-registration.mjs`. |
| DT-J24/J25 Partner console | **No** | No partner organisation, no `partner_admin`/`partner_support` persona, no `TONTINE_PLATFORM_TENANT_ID`; the demo package turns the partner console off. |
| DT-J26/J27 Cooperative | **No** | The demo package has `tontine.cooperatives: false`; there is no `cooperative_admin` persona and no officer assignments. |
| DT-J28 Explain-only assistants | **Yes** | Needs the AI facade settings above. |
| DT-J29 Unusual-transaction flags | **Yes** (runs) | The seed has nothing unusual, so "No flags". Seed one flaggable record to show the outcome. |
| DT-J30 USSD | **No** (for a tester) | Set-up needs the SMS code. Dialling needs a gateway: the demo host has no USSD simulator page. Settings `TONTINE_USSD_GATEWAY_SECRET`/`PEPPER` are not in the demo host settings. |
| DT-J31 Pathways | **Yes** | Needs `TONTINE_VENTUREWORKS_INTAKE_*` / `TONTINE_EDUCATION_INTAKE_*` and the intake mock on the host (not in DEMO_HOST_SETTINGS §3). |

**Totals (24 rows): 11 Yes, 5 Partly, 8 No.**

There is no `e2e/demo-journeys/` suite yet (BRIEF16 item 7).

## 5. Owner rules: EN/FR and three sizes

Checks:
- **Phone:** 360 EN (13 pages, first sweep) and 360 FR (two sweeps).
- **Desktop:** 1280 FR, 7 pages.
- **Partial:** 1280 EN (4 pages) and 768 FR (front + home).
- **Walks:** a phone FR walk (`m-*`), a desktop EN walk (`d-*`) and a tablet EN walk (`t-*`).

The 768 EN/FR sweep and the rest of 1280 EN crashed on the overloaded machine ("Target crashed"), so they were not re-proven here. The tablet walk showed no layout fault.

| Rule | Result |
| --- | --- |
| Styles load at every size | **Pass**: theme, Inter stack, navy sidebar, 44 px targets on every page checked |
| No horizontal page scroll | **Pass** on every page checked. The group tab bar scrolls sideways on phone and tablet with no cue that more tabs exist (at 360 only "Résumé · Membres · Règles · Verse…" show; at 768, Reconciliation…Closing are hidden, `t-05`). |
| Switch visible on every page | **Pass** in the top bar. **Fail while the phone menu is open:** the drawer covers the EN/FR switch (`s-360-fr-menu-open`). Tapping the dimmed area closes the drawer (checked). The switch buttons are 44 × 40 px. |
| Whole page changes | **Pass** for UI strings. **Fail** for: Disputes due-date list (`paid`/`due`), stored notifications (language at send time), audit actions and "success", seed bilingual names, and mixed-language assistant answers. |
| Kit sign-in page follows the language | **Pass** ("Environnement de démonstration / Essayer la démo ADS") |
| Language kept through sign-in (Round 16 rule 5) | **Fail.** `App.tsx` `loadMe` applies the account's saved `profile.locale` over the page choice. The seed saves `fr` for the demo user and `en` for the checker, and every switch saves again. Observed: chosen EN, landed FR (360 and 1280); chosen FR, landed EN (360 run 1, 1280). |
| Persists after reload | **Pass** |

## 6. User-experience pass

- **First impression:** the front door is a sign-in card: "Your njangi, with confidence", one **Sign in** button and the custody note. It is clear, but there is no landing page saying what a tester can try. Tontine is also **not in the demo portal catalogue** (`apps/demo-portal/catalogue.json` has only a "Finance" tile with `demoUrl: null`), so the ecosystem front door does not lead here.
- **Next step:** the member home is the best screen. It shows the amount, the date, "pay the treasurer, then confirm", my turn and the overdue amount. Record and confirm messages are plain ("Recorded. Waiting for a second person to confirm.").
- **Confusing for a treasurer:**
  - "Groups I am an officer of" said "No group assigned yet" in one run and listed every group in the tenant in another, including the admin's group the user is not in.
  - The Records form puts a 30-line drop-down of every future due date first, and the items to confirm below it (`m-05`).
  - The payout card shows a partial amount.
- **Empty states:** good on the admin home ("You are not in any tontine yet") and in Records. Reminders show "0 / 0 / 0" with no explanation.
- **Error messages:** mostly plain, but the invitation failure blames the sign-in service ("cannot be reached") when the real cause is a missing setting.
- **Speed:** the front door was ready in 129 ms. The JS bundle is 89 kB gzipped and the CSS 3 kB. The API was fast; the slowness seen came from the shared machine.
- **Things that would make a tester give up:**
  1. The "organiser" cannot do organiser things.
  2. Turn 2 can never be paid.
  3. Every SMS-based step dead-ends.
  4. The language flips after sign-in.
  5. Only one persona can sign in without a password.

## 7. Verdict and the fixes that most change it

**Can it perform its duty? Yes, with gaps.** For a record-only njangi it covers what members and treasurers need most: who paid (two-person confirmed), who is next, what I owe, proof and disputes. It does this in EN/FR, on a phone, and also by USSD. It never suggests ADS holds the money. It lacks fines, a meeting register and late-payer chasing. **As a demo it does not pass the owner's rule:** 8 of 24 journey rows cannot be finished by the demo accounts and 5 only partly.

| # | Fix | Size | Plan item |
| --- | --- | --- | --- |
| 1 | **Tontine demo personas and seed.** Kit personas: organiser (`group_admin`), treasurer, two approvers, member/beneficiary, auditor, partner_admin (partner org), cooperative_admin. The seed puts the organiser persona in the seeded group as `group_admin`, makes a persona the turn-1 beneficiary, and adds a third approver so turns 2+ complete. It also adds a pending leave request and a dissolvable test group. The kit page gets a persona picker. | M (kit) + S (seed) | BRIEF16 `config/demo-personas.json`; DEMO_HOST_SETTINGS §4 "Digital Tontine" and §6 (give `group_admin`) |
| 2 | **Keep the page language through sign-in.** Do not apply the saved `profile.locale` over the language chosen on the gate (or send `ui_locales` and let it win for demo accounts). The seed and `--reset` stop saving a locale. Render notifications in the reader's current language; translate dispute statuses and audit actions; seed single-language names. | S | BILINGUAL_RESPONSIVE_MOBILE_PLAN §4.2; BRIEF16 rule 5 |
| 3 | **Demo host settings for Tontine.** Client secret (`needs_client_secret: true`, `ADS_IDENTITY_CLIENT_SECRET`) so ADS invitations work; `personal` workspace + `invitee` as in `e2e/kit-registration.mjs`; AI gateway URL/secret plus facade config; USSD secret/pepper; intake mocks. **Testers need an SMS inbox page in the kit mocks and a browser USSD simulator.** Fix the misleading "sign-in service cannot be reached" message. | M | DEMO_HOST_SETTINGS §3 row 5; FLEETGUARD_TONTINE_PLAN Part B follow-up 1 (kit K-02) |
| 4 | **Treasurer essentials.** Late fines recorded as dues (from the published penalty); reminders for overdue dues; a per-turn "who paid" register with bulk "record this meeting"; a ledger with member names and real dates; a payout card that shows the full pot. | M | DT-B-02 "What is left" (no bulk meeting screen); BRS penalties |
| 5 | **Reset and polish.** `--reset` withdraws old `ai_source` rows / knowledge-box entries and resets demo profiles; dissolved demo groups are hidden from pickers; format the USSD record date; give the tab bar a scroll cue; keep the EN/FR switch reachable with the phone menu open. Optionally rename the kit org "ADS Demo – Savings Group" to "ADS Demo – Njangi Association". Add the `e2e/demo-journeys/` suite. | S | BRIEF16 items 6–7; DT-B-06 wording |

Smaller items noted above: mixed-language assistant answers; "Payout number (mobile money)" wording in a record-only pilot; the browser date input shows `10/23/2026` in FR; seeded ledger dates.

## 8. Method notes and limits

- Each persona was tested only as far as the demo accounts allow. The checker and admin were signed in by typing their server-side passwords, which a real tester cannot see.
- SMS went to the kit mock. The USSD set-up code and invitation link were read from the mock control API by the auditor, which a tester cannot do. USSD was driven with `tools/ussd-gateway-mock` from a script (there is no screen for it).
- Not tried: data withdrawal/erasure on the shared accounts; the mobile-money test flow (no seed); partner and cooperative consoles (no persona or package).
- Screenshots are compressed to 128 colours. Kit sign-in page screenshots were left out because they show the demo password. Prefixes: `d-` desktop EN (demo user), `m-` phone FR (checker), `t-` tablet EN (admin), `s-<width>-<lang>-` the bilingual sweep.
- The walk scripts are not committed. They ran from a private scratch folder against throwaway databases (`fa_tt_*`).

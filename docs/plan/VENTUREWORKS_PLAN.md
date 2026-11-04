# VentureWorks: wave-1 plan (partner network and Pilot A)

Owner: Kengjiseh Sondo (ADS). Written 20 October 2026 on the planning branch `plan/launch-wave1-20261020`. **Planning only: no code, repository or deploy setting was changed.**

Evidence base: `ksondo/africa-digital-synergy-ventureworks` `origin/main` at `df5f6a3` (the MVP build merged on 19 Oct). Where this plan says "VW", it means that repository. Other repositories read: `intelligent-cryptocurrency-platform` (`2fe89cc`), `ads-commerce-platform` (`924d714`), `africa-digital-synergy-hub`, `rag-intelligence-ai-platform` (`baf3ce3`), `ads-platform-kit` `origin/main`. Master plan: `docs/plan/source/ADS_MASTER_PLAN_PARTNER_NETWORK_v1.0_2026-10-19.md` (cited below as "MP §n").

Companion documents in this folder: `PLATFORM_FOUNDATION_PLAN.md` (organisation levels, entitlements, provisioning API, billing v1; being written in parallel, referred to by name only), `COMMERCE_EDUCATION_PLAN.md` (the Commerce side of Pilot A), `LAUNCH_PLAN_WAVE1.md` (the synthesis).

---

## 0. Summary for the owner

| Product | % of FRS built (before vs now) | First release finished? |
| --- | --- | --- |
| VentureWorks, measured against its own baseline (BRS v4.0 plus 46 journeys) | about 73% (estimate, see §1.1), the same before and after this planning round | No. The venture-execution core is built and tested on local machines: sign-in, venture, payment, assessment, legal checks, plan, tasks, evidence, readiness and Investment Platform publishing. Nothing has been accepted by users yet |
| VentureWorks, measured against the master plan's 10 workspaces | 2 already built, 5 to extend, 3 new | No. The partner-network front end does not exist yet: the opportunity registry, applications, fees, agreements, provisioning and reporting back |

What this means:
- **The second half of the work already exists.** Once a partner is approved, VW can already plan, assign KPIs, collect evidence, have it checked by an independent reviewer and score readiness.
- **The first half is missing.** VW cannot yet show an opportunity, take an application, charge an entry fee, sign an agreement or provision a shop.
- **The smallest pilot set is 21 build items** (§8). Four of them are large: the registry, applications, the cross-repo acceptance test and partner isolation. Pilot A can run in test mode once these items are built and Commerce has the receiving end of provisioning and reporting.
- **One safety issue must be fixed before partners share VentureWorks.** Any founder can see the names and emails of every user in the tenant (§1.4, item VW-B03).

---

## 1. Current state on `origin/main`

### 1.1 What is built
| Area | On main | Evidence |
| --- | --- | --- |
| Journeys | 46 defined. **25 built**: the 21 MVP journeys tested end to end, plus 4 earlier ones (J17, J22, J24, J25). **17 partial.** **4 not started** (J36, J41, J42, J45) | `docs/journeys/CUSTOMER_JOURNEYS.md` |
| Stories | 26 MVP stories, VW-US-001 to VW-US-026. All are `in_progress`: built and tested, not yet accepted by users | `docs/backlog/USER_STORIES_MVP.md`, `docs/traceability/TRACEABILITY.csv` |
| Requirements | 52 functional requirements (FR-001 to FR-048, VW-FR-053 to 056). **43 have code** (in progress). **9 have none**: FR-002, 010, 017, 019, 020, 026, 029, 030, 036 | `TRACEABILITY.csv` (66 rows: 56 in progress, 10 not started) |
| Screens | 19 MVP routes (17 screens pass the accessibility check), plus 8 earlier workspaces under "More": CRM and finance, capability gaps, adviser, needs marketplace, contributors, delivery review, partner referrals, all-journeys index | `src/app/ventureRoutes.ts` |
| API | About 50 MVP routes in `src/server/mvpRoutes.mjs`, plus the earlier routes dispatched in `src/server/api.mjs`: budgets, CRM, funding needs, operating entries, compliance, marketplace, contributors, referrals, command centre | files named |
| Database | PostgreSQL. 30 migrations, about 51 tables. Row-level security is forced per tenant, and the runtime login cannot bypass it | `db/migrations/001`–`030` |
| Tests (local only; GitHub Actions is disabled) | Playwright: 88 of 88 in a full run (44 tests in English on desktop and French at 360 px). API and database: 26 of 26. Node: 178. Vitest: 153 | `docs/delivery/E2E_STATUS.md` |
| AI | Two separate paths, and neither uses the ADS AI Gateway. (1) The assessment uses the kit mock RAG (`src/server/adapters/rag.mjs`). (2) The adviser calls Progress directly (`src/server/agentAdvisory.mjs`) and returns 503 until it is configured. There is also an unwired scaffold, `src/arag/runtime.ts`. The Blueprint and Evidence agents (FR-029, FR-030) are not built | Software-Factory `origin/audit/agentic-rag-standard-20261019` `docs/audit/AGENTIC_RAG_PORTFOLIO_CHECK_2026-10-19.md` row 4 |
| Integrations | Kit sign-in (real). Kit mock MoMo (signed webhook, refunds). Kit mock email. The Investment Platform publication contract v1.1, in test mode with a mock. Role grants wait for the kit admin service | `E2E_STATUS.md` |

**How the 73% estimate is calculated.** Built journeys count 1, partial journeys count 0.5, and not-started journeys count 0: (25 + 8.5) ÷ 46 ≈ 73%. This is consistent with the "about 75%" quoted for VW. It measures VW's own baseline, not the master plan.

### 1.2 New since the VW status was written
- **The kit role-admin service now exists.** `ads-platform-kit` main, commit `c3d13ef` (organisation admin API, invitations, token exchange). VW's E2E_STATUS still says it is "not built", so VW-US-003 AC-1 can now be wired up. Kit invitations are also the way to bring a partner's staff into VentureWorks.
- **The ADS AI Gateway is merged.** It is in `rag-intelligence-ai-platform` at `baf3ce3` (contract `contracts/ai-gateway-v1`, with a mock version in kit `packages/ai-gateway-client`). VW does not call it yet.

### 1.3 Decisions pending from the owner (inherited from VW)
| # | Decision | Default VW built | Needed for Pilot A? |
| --- | --- | --- | --- |
| VW-10 | When a venture counts as *investment-ready* | Option (a), configurable through `VW_INVESTMENT_READY_RULE` (`src/server/mvp/readiness.mjs`): every KPI accepted, the approved plan is current, no critical blocker is open, and regulated gates are shown but do not block. Screens say "pending owner confirmation" | No |
| VW-11 | What a founder sees about an investor before accepting a discussion | Option (a): investor type, indicative amount ("not a commitment") and message. A name or contact is refused | No |
| Assessment price and terms | Price in XAF and terms version | These are configuration values (`VW_ASSESSMENT_PRICE_XAF`, `VW_ASSESSMENT_TERMS_VERSION`), and the owner has not supplied them. Checkout says so | Partly: see decision D-3 |
| README 1–9 | Baseline, 16 Oct branches, colours, ID scheme, gate names, roles, payment provider, parked features, file rename | Decisions 2, 3 and 6 were taken by default (E2E_STATUS) | Decision 6 (roles) only |

### 1.4 The remaining ~25% (later epics) and how each relates to the pilot
| Epic | Content | Pilot A | Why |
| --- | --- | --- | --- |
| EP-MKT Talent matching | Contributor profile, explainable matching (FR-002, 019, 020; J23, J36) | **LATER** | The partner recruits staff itself. The KPI "Recruit and train deployment staff" only needs contracts and training records as evidence |
| EP-AI Agents | Adviser, Blueprint and Evidence agents (FR-028–030; J32–J34) | **LATER** | Pilot plans and KPIs come from an ADS template (VW-B10). AI drafts are not needed to run the pilot |
| EP-CMD Governance and command centre | Velocity, reliability, confidence, intervention (FR-023.x, 024; J31) | **PILOT-MVP for a portfolio view only** (VW-B17); the rest **LATER** | ADS must see each pilot operator's progress. Velocity scores can wait |
| EP-WAIVE Commercial: sponsorship and waivers | FR-036 | **PILOT-MVP** (part of VW-B08) | Pilot fees may be waived, and the system must not pretend a payment happened |
| EP-OPS Budgets, CRM, compliance | J18–J20 (partial) | **EXTEND inside the pilot** (VW-B11, VW-B16) | Budget versus actual is part of Financial Monitoring |
| EP-HAND Handoffs | Software Factory, Education, IIP due diligence (J26–J30) | **LATER** | Not on the Pilot A path |
| EP-V001 ADS as Venture #001 | FR-026 | **LATER / OWNER-DECISION** (D-9) | A useful way to test the system on ADS itself, but it is not the pilot |
| EP-CLOSE, EP-DATA, EP-OFF | Closure, export and deletion, poor network | **LATER** (before real customers go live) | Test mode only |

**Safety finding to fix before partners share VW.**
- **The leak.** `GET /v1/people` (`src/server/mvp/legal.mjs:72`) returns the name and email of every user in the tenant to any founder. If several partner companies work in one VW tenant, partner A would see partner B's staff.
- **The one-owner limit.** A venture also has exactly one owner, `venture.created_by_actor_ref` (`src/server/mvp/common.mjs:4`). A partner company with a general manager, a finance lead and a compliance officer needs several people on one venture.
- Both problems are fixed by VW-B03 (venture team membership).

---

## 2. The 10 workspaces in the master plan against what exists

Key:
- **ALREADY-BUILT**: it works today and needs only small changes for the pilot.
- **EXTEND**: a base exists and needs real additions.
- **NEW**: nothing usable exists yet.

| # | Workspace (MP §6) | Class | Evidence on main | What is missing | Pilot |
| --- | --- | --- | --- | --- | --- |
| 1 | Opportunity Management (registry) | **NEW** | Nothing with this meaning. The `opportunity` table (`001`) is a venture's *need* for contributors (FR-011). The route `public-marketplace` is labelled "Opportunity marketplace" but shows those needs. `venture.origin` already accepts `ads_opportunity` (`src/server/api.mjs:145`), but nothing links a venture to an opportunity | Registry, versions, approval, publishing, link to platforms (§3). To avoid confusion, relabel the existing marketplace as "Needs marketplace" | PILOT-MVP: without the registry nothing can be applied for (VW-B01, B02) |
| 2 | Partner Recruitment | **NEW** (reuses patterns) | Patterns to reuse: contributor application and selection (J24), venture intake, maturity and documents (J03–J05), the independent reviewer rule (`SELF_REVIEW_FORBIDDEN`), reviewer assignment (`024`), kit KYC and registry mocks | Partner company record, applications to an opportunity and territory, screening, due-diligence checklist, decisions | PILOT-MVP (VW-B04) |
| 3 | Commercial Agreements | **NEW** (reuses patterns) | Patterns to reuse: versioned terms and consent before payment (J06), the payment pipeline with signed webhook (`010`, `030`), contributor terms acceptance (FR-022, J25). There is no e-signature provider in the kit mocks (`services/mocks/README.md`) | Fee schedule per opportunity, offer, agreement template and execution, entry-fee payment or waiver | PILOT-MVP (VW-B06, B07, B08) |
| 4 | Business Planning | **EXTEND** | Blueprint library (J10), roadmap with milestones and measurable KPIs (J12), versioned approval by the founder (J13), financial budgets and funding needs (`commercialService.mjs`, kept as "founder estimate, not verified") | A plan template per opportunity. Three scenarios (conservative, base, optimistic) with visible assumptions (MP §7). The partner's spending broken down by category | PILOT-MVP (VW-B10, B11) |
| 5 | KPI Management | **EXTEND** | Tasks with owner, due date, priority and evidence type (`venture_task`, `030`). The readiness calculation (`readiness.mjs`). Task states are `todo, in_progress, submitted, verified, rejected`; evidence states are `submitted, accepted, rejected` | The MP §6 statuses *not started, in progress, submitted, under verification, approved, rejected, expired*. "Under verification" and "expired" do not exist. A named responsible role (for example "Compliance officer"). Dependencies that block. Evidence that expires on a validity date | PILOT-MVP (VW-B12) |
| 6 | Regulatory Intelligence | **EXTEND** | Library of conditions with authority, citation and source version (`vw_legal_condition`). Checkpoints approved by an assigned reviewer, with self-review refused (J09). The rule "no source found, so nothing is invented" (J08) | Applicability is a single per-venture flag: `regulated_activity` is yes, no or unknown, and conditions marked `regulated_only` then apply to everything (`src/server/mvp/legal.mjs:21`). So an ART authorization would be imposed on any "regulated" venture, which is exactly the master plan's counter-example. The library also lacks a **retrieval date** and an **applicability assessment** per condition. VW does not use the AI Gateway | PILOT-MVP: the "applicability established" rule plus a reviewed starter library for Cameroon (VW-B13). LATER: AI-drafted conditions through the gateway (VW-L03, L04) |
| 7 | Evidence Verification | **ALREADY-BUILT** | Submit, reject with a reason, resubmit, accept by the assigned reviewer, self-review refused, audit (J15, `e2e/vw-j14-j15-j16-execution.spec.mjs`) | Small additions for the pilot: evidence reported by a platform (counts from Commerce) that a reviewer accepts (VW-B15), and expiry (VW-B12) | PILOT-MVP (inside B12, B15) |
| 8 | Financial Monitoring | **EXTEND** | Budgets, funding needs, operating entries (revenue or expense, always `self_reported`, `025`), operating summary (J19, partial, under "More") | Plan scenario against actuals. Figures reported by the platform. A budget-variance view | PILOT-MVP, simple (VW-B16) |
| 9 | Investor & Bank Portal | **EXTEND**, mostly on the Investment Platform side | Publication with consent: five fields, expiry, verify, withdraw (VW-J46). Investor identity is hidden until the founder accepts. Verify calls are authenticated, but are only written to the server log (`src/server/investmentDisclosureVerify.mjs` has no audit insert) | NDA record, document-level permissions, an access log the founder can see, bank roles | LATER: Pilot A needs no investors (§5) |
| 10 | Portfolio Administration | **EXTEND** | Command-centre list (`GET /v1/command-centre/ventures`, J31 "list only"), audit (J35) | A view per opportunity: operators, KPI completion, evidence approvals, deployments against target, fees collected (MP §13) | PILOT-MVP, small (VW-B17) |

---

## 3. Opportunity registry design

### 3.1 Principles (MP §1, §3, §14)
- **There is one authoritative registry, and it lives in VW.** The sector platforms, the Hub and the Investment Platform read it. They never keep their own copy as the master.
- **Three things are kept separate:** a *digital tool* (in the platform's capability manifest), a *business opportunity* (in the VW registry) and an *operating company* (a partner company and its venture). This is MP §3.
- **Customer data stays where it is created.** VW never holds the partner's customers (the merchants). It receives only aggregate figures (MP §5 "operational reporting API", §14).

### 3.2 Relationships
```
Platform (Commerce)                  ← kit product client id; capability manifest version
  └─ Opportunity COM-001 v2          ← published version only; non-exclusive unless an agreement says otherwise
       ├─ Application (Partner Company A, territory CM-CE)  → approved → Agreement A → Venture A
       │     Venture A ── provisioning request ──→ Commerce: partner organisation A + its merchant shops
       │     Venture A ←── aggregate reports ───── Commerce (active storefronts, POS sales count …)
       └─ Application (Partner Company B, territory CM-LT)  → approved → Agreement B → Venture B
Partner Company A can also apply to COM-003 (one partner, several opportunities), subject to eligibility.
```

### 3.3 Data (new tables in VW, all with tenant row-level security; table names indicative)
| Record | Key fields | Notes |
| --- | --- | --- |
| `vw_platform` | key (`commerce`), kit product client id, display name, repository, manifest version, provisioning endpoint and reporting endpoint (references only, never secrets), status | Seeded by an ADS admin. The manifest format comes from `PLATFORM_FOUNDATION_PLAN.md` |
| `vw_programme_opportunity` and `…_version` | code (`COM-001`), platform key, title, summary, commercial model (one of the six in MP §2), eligible partner categories (MP §10), required capabilities (manifest references), target customers, operating model, territories offered, **readiness class** (`ready`, `needs_adaptation`, `concept_only`, from MP §12), **exclusivity policy** (`non_exclusive` by default, or `exclusive_available`), maximum operators (empty means no limit), fee schedule reference, plan template reference, KPI template reference, public fields, status | Lifecycle: `draft` → `submitted` (platform owner) → `validated` (technical) → `approved` (commercial; must be a different person) → `published` → `paused` / `retired`. A published version can never be edited; a change creates a new version. Applications open only when the class is `ready` |
| `vw_partner_company` | legal name, registration status (may be "not registered": registering is KPI 1), partner categories (several are allowed, MP §10), kit organisation id, principal contact, KYC status | The partner's own organisation in the kit is created at provisioning (§3.5). Gap 1 |
| `vw_partner_application` | opportunity version, partner company, territory requested (ISO 3166-2, for example `CM-CE` Centre or `CM-LT` Littoral; this matches the existing jurisdiction format), answers, documents, state (`draft, submitted, screening, due_diligence, approved, rejected, withdrawn`), reviewer, reason | |
| `vw_operator_grant` | opportunity, partner company, territory, `exclusive` (yes or no), valid from and to, agreement id | Created only when an agreement is executed. **The rule:** an exclusive grant blocks any other approval for the same opportunity and an overlapping territory during its validity. A non-exclusive grant blocks nothing. The database enforces this with an exclusion constraint. Several operators per opportunity is the default (MP §3) |
| `venture` (extended) | new columns: `opportunity_id`, `opportunity_version`, `partner_company_id`, `agreement_id` | `origin='ads_opportunity'` (already allowed) |
| `vw_provisioning_request` | venture, platform, package code and limits from the agreement, target kit organisation, idempotency key, state (`requested, accepted, provisioned, failed, suspended`), attempts | Sent through an outbox, using the same pattern as `venture_investment_outbox` |
| `vw_platform_report` | venture, platform, period, metrics (JSON, aggregates only), signature check, received at | Stored as "platform-reported". It becomes *verified* only when a reviewer accepts it as KPI evidence |

### 3.4 How a platform registers an opportunity (the controlled process)
1. **The platform declares it.** The platform team adds the opportunity to its capability manifest, which lives in the platform's repository. The format is set in `PLATFORM_FOUNDATION_PLAN.md`; the MP §4 "Opportunity Integration Standard".
2. **ADS enters it as a draft.** For the pilot, an ADS admin creates the VW draft from that manifest on a registry screen. A push API from platforms is LATER (VW-L02).
3. **Engineering checks it.** A technical validator confirms that the required capabilities exist on the platform's `main`: the readiness class.
4. **Commercial approves it.** A commercial approver, who is not the person who created it, approves the fees, wording and templates.
5. **It is published.** Every step is audited.

### 3.5 How a venture triggers provisioning in the sector platform
- **Gate.** All four must hold:
  1. The agreement is executed.
  2. The entry fee is confirmed or formally waived.
  3. An operator grant exists.
  4. The venture is in test mode (pilot), or the live gates have been approved (later; see decision D-6).
- **Request.** VW sends a provisioning request to the **commercial provisioning API defined in `PLATFORM_FOUNDATION_PLAN.md`**. It carries:
  - the partner company,
  - its kit organisation (created if missing),
  - the package code (for example `commerce.pos-deployment-network`),
  - the limits the agreement allows (for example a maximum number of merchant shops, and test mode),
  - the venture and agreement references.
- **What VW does not do.** VW never writes into Commerce's database and never keeps the entitlement record. The kit holds the entitlements and Commerce enforces them (gap 2).
- **Afterwards.** The partner's administrator creates merchant shops in Commerce within those limits (gap 1). Commerce reports aggregate figures back. Ending or suspending an agreement sends a `suspend` request.

---

## 4. Acceptance scenario: Pilot A, POS Deployment Network (COM-001)

Everything runs in test mode:
- the real ADS sign-in;
- kit mocks for MoMo, KYC, registry and email;
- every screen shows "Test mode", and no real money moves.

Two partner companies apply to the same opportunity: A for Yaoundé (`CM-CE`) and B for Douala (`CM-LT`). This proves that one opportunity can have several operators.

| Step | Who | What happens | Existing or new |
| --- | --- | --- | --- |
| 0. Set up | ADS admin, technical validator, commercial approver | COM-001 is registered from Commerce's manifest, validated, approved and published. It has: a fee schedule with **test values only**; the agreement template v0.1 marked "draft, for legal review"; a plan template with the three scenarios; the KPI template with the 10 KPIs of MP §6 (each with a responsible role, evidence type and dependencies); and the reviewed starter library of Cameroon conditions | NEW: B01, B02, B06, B10, B13 |
| 1. Invite | ADS commercial team | The partner is invited through kit invitations (`c3d13ef`) with a link to COM-001. The public Hub catalogue comes later (§5.2) | Kit (exists) |
| 2. Apply | Partner GM | Signs in with an ADS account, creates the company profile ("not registered" is allowed), chooses a territory, answers the screening questions and uploads documents | NEW: B03, B04. Reuses the documents upload |
| 3. Screen and due diligence | ADS commercial reviewer (not the creator) | Works through the checklist: KYC of the principal (kit KYC mock) and a registry lookup if the company is registered (kit registry mock). Then approves or rejects with a reason. Self-review is refused and every step is audited | NEW: B04 |
| 4. Offer and agreement | ADS and the partner | ADS issues an offer that shows the fee categories (MP §7), what the entry fee pays for, and the neutral wording (§6). The partner accepts the agreement version (name and time recorded) and an ADS signatory countersigns. The stored PDF keeps a fingerprint (SHA-256) so it cannot be changed unnoticed. An operator grant is created (non-exclusive) | NEW: B06, B07, B05 |
| 5. Entry fee | Partner, ADS finance | **Either** the partner pays by kit mock MoMo, and the entitlement is created once, only after the signed webhook (the existing pipeline, generalised); **or** ADS finance confirms a bank transfer, with a second person approving; **or** ADS waives the fee with a reason (FR-036). Pending, failed and refunded payments are shown honestly | EXTEND: B08 (reuses J06 and J40) |
| 6. Activation | System | The venture is created automatically: `origin=ads_opportunity`, linked to the opportunity, partner company and agreement. The partner's team (GM, finance, compliance, sales, operations) is invited onto the venture. An ADS venture manager is assigned. The assessment entitlement is included (decision D-3) | NEW: B09, B03 |
| 7. Plan | Partner GM, ADS analyst | The blueprint and roadmap are pre-filled from the template: the 10 KPIs, owners and due dates. The three scenarios have editable assumptions (target merchants, monthly fee per merchant, staffing and so on), and the totals are labelled "illustrative" (MP §7). The GM approves plan v1 (existing J13) | EXTEND: B10, B11 |
| 8. Applicability | Compliance officer (regulatory reviewer) | For each condition, the reviewer records *applies*, *does not apply* or *not yet assessed*, with a reason and a source. Only *applies* creates a mandatory KPI. ART authorization stays "not assessed" or "does not apply" for an ordinary POS reseller | EXTEND: B13 |
| 9. Execute KPIs | Partner staff, ADS evidence reviewer | Tasks are assigned only to members of the venture team. Evidence goes through submitted, under verification, then approved or rejected. Evidence with an end date (for example a bank confirmation) can expire | EXTEND: B12 (reuses J14 and J15) |
| 10. Provision | System, then the partner admin | VW sends the provisioning request (§3.5). Commerce creates partner organisation A with the POS package in test mode. The partner admin creates merchant shops in Commerce within the agreed limit | NEW in VW: B14. Commerce side: `COMMERCE_EDUCATION_PLAN.md`; API: `PLATFORM_FOUNDATION_PLAN.md` |
| 11. Report back | Commerce, ADS reviewer | Commerce sends signed aggregate figures for each partner organisation and period (for example active storefronts and the count of test POS sales). These attach as *platform-reported* evidence to the KPIs "Activate merchant storefronts" and "Test POS transactions". A reviewer accepts them; they are never accepted automatically | NEW: B15 |
| 12. Monitor | Partner finance, ADS executives | Plan scenario against founder-reported operating entries and platform figures. The portfolio view for COM-001 shows two operators, KPI completion, approvals, deployments against target and fees collected | EXTEND: B16, B17 |

**Cases the test must refuse**
- A second *exclusive* grant on an overlapping territory.
- An application to a `concept_only` opportunity, such as BNPL COM-002 (§6).
- A failed or spoofed payment, which must not activate anything.
- Partner B reading A's venture, people or reports: 404 and audited.
- A provisioning failure, which must stay "failed, retrying" and never show as provisioned.
- A KPI marked mandatory without an established applicability.
- Self-review at screening and at evidence.

**Done when** the cross-repository Playwright run (VW-B19) passes on desktop in English and on mobile in French, and the main write of each step is checked in both databases.

---

## 5. Boundaries

### 5.1 Investment Platform (`intelligent-cryptocurrency-platform`, merged 19 Oct, `2fe89cc`)
| VentureWorks owns | Investment Platform owns |
| --- | --- |
| Ventures, plans, KPIs, evidence, readiness, the founder's consent and its scope (five fields), and the decision to withdraw | Investor accounts, KYC and suitability, listing review (maker-checker), discovery, interest, funding partners, NDA and investor-side access rules |

- **How they talk.** Only through `docs/integrations/INVESTMENT_PLATFORM_PUBLICATION_CONTRACT_v1.md`:
  - 4.1 publish;
  - 4.2 live verify, which hides the listing if it fails;
  - 4.3 withdraw;
  - 4.4 and 4.5 listing and interest events;
  - 4.6 founder response.
- **What each side may hold.** The Investment Platform never copies evidence documents; it re-verifies live. VW never stores an investor's identity before the founder accepts.
- **Wave-1 changes.** No contract change for Pilot A. Opportunity code, platform and partner company are *not* added to the consented fields; adding them later needs contract v1.2 and a new consent scope.
- **Known follow-ups (LATER):**
  - The contract text does not match the code. The Investment Platform's E2E_STATUS notes that interest fields sit at the top level and readiness inside `payload`. VW owns the text and should fix it (VW-L13).
  - The Investment Platform shows a venture only to investors in the same tenant. This fits decision D-1, where all programme ventures sit in the ADS tenant.
  - The founder should be able to see each investor read. Today verify calls are only written to the server log (VW-L05).
- **Banks** for Pilot A are *evidence*: the KPI "Establish corporate bank account" takes a bank confirmation document. A bank portal is LATER.

### 5.2 Hub catalogue (later build)
- VW stays the master. The Hub page reads a **public read API** from VW: published versions and public fields only, with no applicant data. Its "Apply" button deep-links into VW sign-in and the application.
- The Hub already routes `business-opportunity` to VentureWorks (`africa-digital-synergy-hub` `src/engagement/catalogue.ts`).
- For the pilot, recruitment is by invitation only. The public fields are captured now (VW-B01), so the later Hub build only consumes them (VW-L01).
- Visitors who only want software are sent to the platform's own purchase or onboarding, not to VW (MP §9).

### 5.3 AI Gateway (`rag-intelligence-ai-platform`)
VW consumes the gateway and does not keep its own regulatory engine (MP §8).
- **For the pilot**, the library is filled by people from reviewed sources. The existing "no source, nothing invented" rule stays.
- **LATER, and a gate before go-live:**
  - Replace both AI paths with one gateway client (VW-L03).
  - Every AI-drafted condition, plan or KPI list then carries jurisdiction, source, retrieval date, applicability assessment and review status, and stays a *draft* until the responsible person approves it (VW-L04).

---

## 6. Legal flags (gap 7): needs legal review

**Status: these are drafts for legal review. Nothing below has been approved by a lawyer.**

**What must be reviewed before real partners pay:**
1. **The entry-fee wording**, wherever it appears: opportunity page, offer, agreement, checkout, receipt.
2. **Refund terms.**
3. **The tax treatment of the fee.**
4. **Whether paying the fee in instalments would count as credit.** This plan's recommendation is no instalments in the pilot.
5. **Exclusivity terms.**
6. **Data-processing roles for the partner's customer data** (MP §14).
7. **Whether click-to-accept plus countersignature is valid** under the Cameroonian rules on electronic signatures.
8. **KYC/AML expectations** for partner screening.
9. **BNPL (COM-002, Pilot D).** It is registered as `concept_only`, with applications closed, and labelled as a feasibility study with an authorised financial institution. VW must refuse any application to it. No consumer financing screen exists or is planned in VW.

**Proposed neutral wording.** The owner should approve it after legal review. VW must show it in both languages.

| Where | English | Français |
| --- | --- | --- |
| Name of the fee | Partner onboarding fee | Frais d'intégration au programme partenaires |
| What it pays for | The partner onboarding fee pays for the onboarding services listed below: commercial onboarding, access to the agreed opportunity (non-exclusive unless your agreement expressly says otherwise), an initial business analysis, planning support and activation of your VentureWorks workspace. | Les frais d'intégration rémunèrent les services d'intégration énumérés ci-dessous : intégration commerciale, accès à l'opportunité convenue (sans exclusivité, sauf mention expresse dans votre contrat), une analyse initiale de votre projet, un accompagnement à la planification et l'activation de votre espace VentureWorks. |
| What it is not | This fee is not an investment, a deposit, a loan or a share in ADS or in any business. It does not buy or guarantee any revenue, profit, number of customers, financing, regulatory approval, licence or exclusivity. Refund terms are in section [x] of your agreement. | Ces frais ne constituent ni un investissement, ni un dépôt, ni un prêt, ni une participation dans ADS ou dans une entreprise. Ils n'achètent ni ne garantissent aucun chiffre d'affaires, bénéfice, nombre de clients, financement, autorisation réglementaire, licence ou exclusivité. Les conditions de remboursement figurent à l'article [x] de votre contrat. |
| Plans and scenarios | Figures in plans and scenarios are illustrative estimates for planning. They are not forecasts, market research or promises. | Les montants des plans et scénarios sont des estimations indicatives destinées à la planification. Ce ne sont ni des prévisions, ni une étude de marché, ni des promesses. |
| Pay button (pilot) | Pay onboarding fee (test mode, no real money) | Payer les frais d'intégration (mode test, aucun argent réel) |
| BNPL opportunity | Feasibility study with an authorised financial institution. Not open for applications. No consumer financing is offered. | Étude de faisabilité avec un établissement financier agréé. Candidatures non ouvertes. Aucun financement aux consommateurs n'est proposé. |

Avoid these words everywhere: "invest", "return", "guaranteed", "franchise", "earn", "profit share" (unless the agreement defines it), and "exclusive" (unless a grant exists).

---

## 7. Gaps 1–7 for VentureWorks
| Gap | How it applies to VW | Plan |
| --- | --- | --- |
| 1 Organisation levels | ADS runs the programme in its VW tenant. The partner company is a kit organisation, and its people are members of *their* venture only. The partner's customers (merchants) live only in Commerce; VW sees aggregates | VW-B03 (membership, people list scoped to the venture), §3.5. Levels defined in `PLATFORM_FOUNDATION_PLAN.md` |
| 2 Who owns entitlements | VW is the commercial source: it records what was agreed and sends the request. The kit stores entitlements and the platform enforces them. VW never stores an entitlement for another product | VW-B14 |
| 3 Billing | VW has a working, tested one-off payment pipeline (mock MoMo, signed webhook, refunds) for assessments. The entry fee reuses it, behind a billing port, so Billing v1 can take over later. Recurring per-merchant subscriptions belong to Billing v1 and Commerce; VW only shows them. VW builds no ledger or settlement | VW-B08, decision D-4 |
| 4 Public catalogue | VW holds the master data and public fields now. The Hub page and public API come later | VW-B01 (fields), VW-L01 |
| 5 VW reconciliation | This document: §1 and §2 | — |
| 6 Name check | VW cites only the ADS Software Delivery Handbook v1 (`docs/requirements/README.md`). No VW file mentions "ADS Full-Stack Methodology v2". VW also has local standards (`docs/standards/ADS_CROSS_PLATFORM_DELIVERY_STANDARD_v1.md`, `VENTUREWORKS_WP_D_APPLIED_METHODOLOGY_v1.md`) | Follow the ruling in `PLATFORM_FOUNDATION_PLAN.md`; nothing to rename in VW |
| 7 Legal review | Entry-fee wording, agreement, BNPL | §6, decision D-8 |

---

## 8. Finalization build register (VentureWorks)

Sizes:
- **S**: up to about 2 days of build.
- **M**: about 3 to 6 days.
- **L**: more than 6 days.

These are estimates by analogy with VW's round-7 MVP stories, which took one to three per day. Every item follows the handbook: a story with acceptance criteria, then API, database, screen (EN and FR, 360 px), Playwright test and traceability row.

### PILOT-MVP
| ID | Title | What it is | Depends on | Size | Acceptance check |
| --- | --- | --- | --- | --- | --- |
| VW-B01 | Opportunity registry | Versioned opportunities with readiness class, exclusivity policy, public fields and lifecycle (approval by a second person). Relabel the existing marketplace "Needs marketplace" | — | L | COM-001 goes draft → submitted → validated → approved → published, with the approver different from the creator. A published version cannot be edited. A draft is never visible to applicants. Every step is audited |
| VW-B02 | Platform link | `vw_platform` keyed to the kit product client and manifest version | Manifest format in `PLATFORM_FOUNDATION_PLAN.md` | S | An opportunity cannot be saved without an active platform. A manifest capability that does not exist is refused |
| VW-B03 | Partner company and venture team | Partner company record (several categories). Venture membership with roles per venture, replacing single-person ownership. `/v1/people` limited to the venture team and ADS staff. Staff invited through kit invitations | Kit `c3d13ef` | L | Partner B gets 404 for A's venture, people, tasks and reports, checked through the API and in the database. Three members of A all reach A's venture |
| VW-B04 | Applications, screening, due diligence | Application to an opportunity version and territory. Screening and due-diligence checklists using the kit KYC and registry mocks. Approve or reject with a reason | B01, B03 | L | The happy path reaches "approved". A rejection shows the reason. Self-review is refused. An application to a `concept_only` opportunity is refused |
| VW-B05 | Multi-operator and exclusivity | `vw_operator_grant` with an exclusion rule on opportunity, territory and period | B01, B07 | S | Two non-exclusive operators succeed. A second exclusive grant on an overlapping territory is refused by the database and shown clearly |
| VW-B06 | Fee schedule and offer | Fee categories from MP §7 per opportunity (test values). Deliverables. Neutral wording. Offer to an approved applicant | B01, B04, D-2, D-8 | M | The offer shows every category, the deliverables and the "what it is not" text in EN and FR. The amounts come from configuration, not from code |
| VW-B07 | Agreement execution | Template version filled from the offer. The partner accepts and ADS countersigns (names, times). Stored PDF with SHA-256. Creates the operator grant | B06 | M | An executed agreement is immutable. The countersigner differs from the partner. A stale version gives a conflict. The KPI "Secure ADS operating agreement" receives the executed record as evidence |
| VW-B08 | Onboarding fee: payment, bank confirmation, waiver | Generalise the assessment payment into programme charges behind a billing port. Kit mock MoMo. Bank-transfer confirmation by finance with a second approver. FR-036 waiver with a reason | B07, D-4 | M | The entitlement is created once, only after the signed webhook or a confirmation by two people. Spoofed or duplicate callbacks change nothing. A waiver is labelled "waived", never "paid" |
| VW-B09 | Venture from opportunity | Activation creates the venture (`ads_opportunity` plus links), assigns the ADS manager and includes the assessment entitlement | B07, B08, B03 | S | One venture per agreement (idempotent). Its links are visible on the venture overview |
| VW-B10 | Plan and KPI templates | Templates per opportunity (the 10 KPIs of MP §6 with responsible role, evidence type, dependencies, due-date offsets), turned into a draft roadmap | B01, existing J10, J12 and J13 | M | The COM-001 roadmap draft contains the 10 KPIs with owners and targets, and the founder approves it as v1 |
| VW-B11 | Three financial scenarios | Conservative, base and optimistic, with editable assumptions, calculated totals and partner spending by category (MP §7). Approved with the plan | B10 | M | Changing one assumption updates only that scenario. Every figure is labelled illustrative. The scenarios are stored in the approved plan version |
| VW-B12 | KPI status model | The MP §6 statuses (add "under verification" and "expired"; map todo → not started and verified → approved), responsible role, blocking dependencies, evidence validity date | Existing J14, J15 and J16 | M | Each of the 7 statuses is reachable and shown in EN and FR. Expired evidence drops readiness. A dependent task cannot start before its prerequisite is approved. Existing data migrates |
| VW-B13 | "Applicability established" | An applicability decision per condition per venture (not assessed, applies, does not apply), with reviewer, reason, source and **retrieval date**. Only "applies" creates mandatory KPIs. Reviewed starter conditions for Cameroon | Existing J08 and J09; D-7 | M | ART is not mandatory for a POS reseller until a reviewer records "applies". Each condition shows jurisdiction, source, retrieval date and review status |
| VW-B14 | Provisioning request | Outbox to the provisioning API in `PLATFORM_FOUNDATION_PLAN.md`: package code and limits from the agreement; idempotent; retry; suspend | B09, the foundation API, Commerce's receiving end | M | Provisioned once, even after a retry. A failure shows "failed, retrying". Suspension is sent when the agreement is suspended. VW stores no entitlement |
| VW-B15 | Platform report intake | Signed aggregate reports for each partner organisation and period, attached as platform-reported KPI evidence that a reviewer must accept | B14, the foundation reporting API, Commerce | M | A bad signature or a wrong partner is refused. Figures are never auto-approved. No merchant personal data is accepted |
| VW-B16 | Financial monitoring view | Scenario against founder-reported operating entries against platform figures, plus budget variance | B11, B15, existing J19 APIs | S | Variance is calculated the same way every time. Founder-reported and platform-reported figures are labelled differently |
| VW-B17 | Portfolio view per opportunity | Command centre grouped by opportunity: operators, KPI completion, approvals, deployments against target, fees collected or waived | B01, B12, B15 | S | An ADS executive sees COM-001 with both operators. A partner never sees this view |
| VW-B18 | Roles and real grants | Register the new VW roles in the kit (`commercial_reviewer`, `finance_officer`, `technical_validator`, `partner_admin`; names to be confirmed, decision D-5). Connect VW-US-003 to the kit admin API | Kit `c3d13ef` | S | An approved access request becomes a real grant: VW-US-003 AC-1 passes |
| VW-B19 | Pilot A acceptance test | Cross-repository Playwright run of §4 (VW, Commerce, kit identity and mocks), including the refusal cases | All of the above, plus Commerce | L | §4 "Done when" is met, desktop EN and mobile FR |
| VW-B20 | Wording and test-mode labels | The §6 wording on every fee, plan and agreement screen and receipt, EN and FR, after legal review | D-8 | S | A text check finds no banned words on the new screens. Every screen shows the test-mode banner |
| VW-B21 | OpenAPI for `/v1` | `docs/api/openapi.yaml` for the new and existing MVP endpoints (missing today, per E2E_STATUS) | B01–B15 | S | A contract test checks the responses against the file |

### LATER
| ID | Title | What it is | Depends on | Size | Acceptance check |
| --- | --- | --- | --- | --- | --- |
| VW-L01 | Public catalogue API for the Hub | Read-only published opportunities and an Apply deep link | B01; Hub build | S | Only public fields of published versions are returned; drafts return 404 |
| VW-L02 | Platform self-registration API | Platforms push manifest opportunities as drafts | B01, B02 | M | A push creates a draft only; a person must still approve |
| VW-L03 | One AI Gateway client | Replace the kit RAG adapter and the direct Progress adviser with the gateway client (`/v1/ai/ask`, `/v1/ai/find`) | Gateway deployed | M | The gateway mock-contract tests pass. Answers without citations are refused. Tenant filters are always sent |
| VW-L04 | AI drafts | Drafts of plans, regulatory checklists, KPI lists and evidence-completeness checks, always marked draft | L03 | L | Nothing becomes mandatory or approved without a named person. Every requirement carries jurisdiction, source, retrieval date, applicability and review status |
| VW-L05 | Investor and bank access controls | NDA record (Investment Platform side), document-level permission, third-party read log visible to the founder, bank role | IIP | M | Every 4.2 verify call is visible to the founder with time and purpose |
| VW-L06 | Talent matching and profiles | FR-002, 019, 020; J23, J36 | — | L | Matches show their reasons, and a person chooses |
| VW-L07 | Command-centre metrics and intervention | FR-023.1–023.4, FR-024 | B17 | M | Velocity and confidence are calculated the same way from accepted evidence |
| VW-L08 | E-signature provider | Adapter for a qualified e-signature provider | B07; legal review | M | Signed documents can be checked with the provider |
| VW-L09 | Subscriptions shown from Billing v1 | VW shows recurring fees owned by Billing v1 | Billing v1 | S | VW holds no subscription record of its own |
| VW-L10 | ADS as Venture #001 | FR-026 | D-9 | S | The ADS venture runs through the same flow |
| VW-L11 | Closure, termination, export and deletion | J41 and J42, including de-provisioning | B14 | M | Termination suspends provisioning, and export gives the roadmap and report |
| VW-L12 | Reconciliation debt | Converge the earlier routes (`/tasks`, `/evidence-files`, `/plan-approvals`, `/regulatory-checkpoints`) and the earlier `venture_regulatory_checkpoint` with the MVP ones | — | M | One route per action, and the old routes are removed after migration |
| VW-L13 | Publication contract text | Make the contract document match the code (Investment Platform note) | — | S | The Investment Platform's contract test and the document agree |
| VW-L14 | Pilots B, C and D | Register COM-003 and COM-004 once Pilot A passes. COM-002 BNPL stays `concept_only` | B19; legal | S | New opportunities go through the same lifecycle |

---

## 9. Decisions needed from the owner
| # | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| D-1 | Where programme ventures live | (a) All in the ADS VentureWorks tenant, isolated by venture membership; (b) a separate VW tenant per partner company | **(a).** ADS staff must review across partners, the Investment Platform already matches on the same tenant, and the partner's own organisation is created on the platforms through provisioning. This requires VW-B03 first |
| D-2 | Fee values for Pilot A | Supply test values now and real values after legal review | **Test values only in the pilot.** The 9 500 000 FCFA in MP §7 is illustrative and must not appear as a price |
| D-3 | Assessment price, and the assessment for partner ventures | (a) The entry fee includes the assessment (MP §2 "initial business analysis"), so partner ventures receive it as an included entitlement, and founders outside the programme pay the assessment price; (b) both are charged | **(a).** The owner still needs to supply the assessment price and terms for founders outside the programme |
| D-4 | Who collects the entry fee in the pilot | (a) VW's existing payment pipeline behind a billing port, with Billing v1 taking over later; (b) wait for Billing v1 | **(a).** Large amounts may exceed mobile-money limits (an assumption to check with the providers), so keep the bank-transfer confirmation path |
| D-5 | New role names | `commercial_reviewer`, `finance_officer`, `technical_validator`, `partner_admin`, or other names | Approve these names, so they can be registered in the kit for the VW client |
| D-6 | When provisioning goes live | (a) Test-mode workspace at activation; live only after KPIs 1–4 (company registered, bank account, applicability review, agreement) are approved and the go-live gates pass; (b) live at activation | **(a)** |
| D-7 | Who fills the starter regulatory library | An ADS regulatory steward or a professional-services partner (MP §10) | Name a qualified person. VW will not invent conditions |
| D-8 | Entry-fee wording and legal review | Approve §6 after review by a lawyer; no instalments; BNPL closed | **Review before any real partner pays.** Test mode can start with the §6 text marked "draft" |
| D-9 | ADS as Venture #001 | Now or later | **Later**, after Pilot A |
| D-10 (VW-10) | Investment-ready rule | Confirm the default (a), or choose (b) or (c) | **Confirm (a).** It does not block the pilot |
| D-11 (VW-11) | What a founder sees about an investor | Confirm the default (a), or (b) | **Confirm (a)** |
| D-12 | Exclusivity in the pilot | Non-exclusive only, or allow territorial exclusivity | **Non-exclusive only in the pilot.** The rule is still built (VW-B05) so it can be granted later by agreement |

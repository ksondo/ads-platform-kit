# ADS Software Delivery Handbook v1.0

**Status:** canonical for every Africa Digital Synergy (ADS) product repository, from 18 October 2026.
**Owner:** Kengjiseh Sondo (Product Owner, ADS). **Maintained in:** `ksondo/Software-Factory` `docs/handbook/`.

This handbook is the one method ADS uses to specify, design, build, test and release software. It replaces the overlapping process documents listed in [SUPERSEDED.md](SUPERSEDED.md) and is built on recognised practice: Scrum/Kanban, user stories with Given/When/Then acceptance criteria, OpenAPI contracts, the testing pyramid, OWASP ASVS Level 2 and the twelve-factor app. What ADS learned the hard way (evidence rules, tenant isolation, money-state rules) is kept in sections 6, 12 and Appendix A.

Software Factory uses this handbook as the standard it applies when it builds apps for customers. ADS shared services (sign-in, roles, audit, notifications, payments) are implemented in `ksondo/ads-platform-kit`; every product must meet the cross-cutting requirements in [PLATFORM_REQUIREMENTS.md](PLATFORM_REQUIREMENTS.md).

---

## 0. Scope, authority and change control

1. **One handbook.** There is one copy, here. Product repos link to it from `AGENTS.md` and `README.md`; they do not copy it.
2. **Precedence** when documents disagree: this handbook → product ADRs (section 4) → the product's canonical requirements baseline → code and tests. Code and tests decide what is *implemented*; requirements decide what is *wanted*.
3. **Product extensions** go in the product repo as `docs/handbook-extension.md` (for example extra regulatory rules for Health). An extension may add rules, never relax them.
4. **Changing the handbook:** a pull request to Software-Factory, approved by the Product Owner, with a CHANGELOG line. The handbook is versioned (v1.0, v1.1, …) in place; old versions live in git history, never as side-by-side files.

## 1. Roles and way of working

| Role | Responsibility |
| --- | --- |
| **Product Owner (PO)** | Owns each product's requirements baseline, priorities and acceptance. Signs off baselines and accepts stories. |
| **Tech Lead / Architect** | Owns architecture, ADRs, security baseline and the Definition of Ready for technical items. |
| **Developer** (human or AI agent) | Builds one story at a time on its own branch, with tests. |
| **Independent Reviewer / QA** | Reviews every pull request and tests acceptance criteria. Never the author of the change. |
| **Release Owner** | Decides and records releases (section 12). |

**Cadence (light Scrum with a Kanban board):** two-week iterations. Backlog refinement weekly; planning, review/demo and retrospective each iteration. Work moves `Backlog → Ready → In progress → In review → Done`, plus `Blocked` (with the blocker named). Work-in-progress limit: two stories per developer.

## 2. Requirements hierarchy

```
Vision → BRS (BR-xx) → FRS (FR-xx) → Epics (EP-xx) → User stories (US-xx) → Acceptance criteria (AC-xx)
                         ↘ Customer journeys (story maps across stories)
```

- **BRS** (Business Requirements Specification): why the product exists, who it serves, business rules, constraints, success measures. IDs `BR-001…`.
- **FRS** (Functional Requirements Specification): what the system must do, testable, IDs `FR-001…`, each tracing to one or more BRs.
- **Epic:** a group of stories delivering one capability (often one FR or a few).
- **User story** (INVEST: independent, negotiable, valuable, estimable, small, testable):
  > **US-014** As a *parent*, I want *to pay school fees with MTN MoMo* so that *I don't have to travel to the school*.
- **Acceptance criteria** in Given/When/Then, including the unhappy paths:
  > **AC-014-1** Given an invoice of 25 000 XAF, when the parent confirms MoMo payment and the provider confirms success, then the invoice shows *Paid* and a receipt is sent in the parent's language.
  > **AC-014-2** Given the provider has not answered after 2 minutes, then the payment shows *Pending* and the parent can check again; it is never shown as *Paid*.
  > **AC-014-3** Given a user from another school, when they request this invoice, then access is denied and the attempt is audited.
- **Customer journeys** are story maps: the ordered steps an actor takes to reach a goal (for example "Parent enrols a child and pays the first fees"). Every journey lists its stories. Journeys are not a separate requirements layer.

Every product must cover these standard journeys unless the baseline explicitly excludes them: sign-up and sign-in (through the shared ADS sign-in), profile and settings, language choice (EN/FR), notifications, help and support, payment failure and refund (where money is involved), cancellation, data export and deletion requests, and the staff/admin journeys that serve customers. Template: [templates/CUSTOMER_JOURNEYS.md](templates/CUSTOMER_JOURNEYS.md).

## 3. Definition of Ready

A story may start only when:

- [ ] It has an ID, a "As a … I want … so that …" statement and traces to an FR (or is marked as a technical enabler).
- [ ] Acceptance criteria are written in Given/When/Then and include denied access, cross-tenant access, validation errors and provider failure where relevant.
- [ ] The actor's role and tenant (organisation workspace) context are clear.
- [ ] Design references exist (section 4): screen in the product's UI reference or mockup with its states; sequence diagram if it crosses a boundary; API contract and data change identified.
- [ ] Dependencies (other stories, partners, shared services) are known. An external party that is not available yet (regulator, licence, bank, insurer, settlement or payment provider, KYC provider, legal or clinical sign-off) **never blocks the story**: it is built and tested against a sandbox or a mock adapter (section 12.1).
- [ ] It fits in one iteration; otherwise split it.

## 4. Design artefacts per story (proportionate)

| Artefact | When | Where | Standard |
| --- | --- | --- | --- |
| **Screen design** with loading, empty, error, denied, success and offline states | Every story with UI | Product UI reference (see [UIUX_REGISTER.md](UIUX_REGISTER.md)); mockup in `docs/uiux/` | ADS master design system + product sector profile; WCAG 2.2 AA |
| **Sequence diagram** | Any flow crossing a boundary (browser → API → database → partner/shared service) | `docs/design/sequence/<journey>.md` | Mermaid `sequenceDiagram` |
| **API contract** | Every new or changed endpoint | `docs/api/openapi.yaml` | OpenAPI 3.1, versioned; AsyncAPI for events |
| **Data model + migration** | Every schema change | `db/migrations/NNN_*.sql` + `docs/design/data-model.md` | Forward migration + documented rollback; row-level security for tenant data |
| **ADR** (Architecture Decision Record) | Any decision about boundaries, ownership, technology or security | `docs/adr/NNNN-title.md` | [templates/ADR.md](templates/ADR.md) |

Design follows the story, never the other way round: stories and acceptance criteria come first, then the design that satisfies them.

## 5. Testing strategy

Test pyramid, every level automated in CI:

1. **Unit tests:** business rules, validation, calculations.
2. **Contract tests:** API responses match `openapi.yaml`.
3. **Integration tests on a real PostgreSQL:** including row-level security with a restricted runtime role, and two-tenant negative tests (tenant A can never read or write tenant B).
4. **End-to-end tests per customer journey** (Playwright): happy path plus the most important unhappy path, in English and French, on a mobile viewport (360 px) and desktop, with an automated accessibility check.
5. **Container smoke test:** the real runtime image starts, passes `/health`, and serves one journey.

Rules: every acceptance criterion maps to at least one test (section 10). A negative test must reach the code path it claims to test. Never weaken a test, a security rule or an acceptance criterion to get CI green; classify the failure (code, test fixture, database runner, packaging, auth, proxy, partner, acceptance) and fix the cause.

## 6. Security baseline

- **Checklist:** OWASP ASVS 4.0 **Level 2** for every product; **OWASP Top 10 for LLM applications** for AI features. Each epic gets a short threat model.
- **Identity:** every product signs users in through the shared ADS sign-in (PLAT-ID-001). No product stores its own passwords. Tokens are verified on the server (issuer, audience, signature, expiry).
- **Authorisation:** checked on the server for every request and every object; tenant isolation enforced by forced row-level security with a restricted runtime database role; cross-tenant denial tested. The service/admin database role never replaces the caller's authorisation.
- **ADS-specific controls (kept from experience):**
  - Maker-checker: nobody approves their own submission; holding a role is not the same as being granted a specific record.
  - Money states are separate: self-reported ≠ provider-confirmed ≠ bank-settled. Unknown provider outcomes stay *Pending* until reconciled.
  - Writes that matter use idempotency keys and optimistic concurrency (expected version); webhooks are signed and replay-protected.
  - AI/RAG: filter by tenant, user, consent and source version *before* retrieval; cite sources; model output never authorises a change by itself; test for prompt injection.
  - Secrets never in the repository or the browser bundle; demo accounts and their credentials are revoked when demos end.
- **Data protection:** consent recorded where personal data is used beyond the core service; retention periods per data type; data export and deletion requests supported.

## 7. Operations (twelve-factor)

Config in environment variables; secrets outside the repository; backing services (database, mail, payment providers) attached by configuration; separate build, release and run; stateless processes; logs as structured streams with request IDs; dev/staging/production parity; admin tasks as one-off commands. Also: a migration ledger with checksums; migration credentials separate from runtime credentials; automated backups with a tested restore; health and readiness endpoints; monitoring and alerting; an incident runbook. Deployments are non-destructive (no volume pruning, no `DROP` in normal releases).

## 8. Source control, pull requests and review

- `main` is the only canonical branch and is protected. Requirements, standards and code that matter live on `main`.
- Short-lived branches named `feat/US-014-pay-fees-momo`, `fix/…`, `docs/…`. One story per pull request.
- Pull request template: [templates/PULL_REQUEST.md](templates/PULL_REQUEST.md) (story ID, acceptance criteria evidence, tests run, what was not run and why).
- **At least one human approval** before merge; **two** for changes to authorisation, money, migrations or the shared sign-in. AI agents never approve or merge their own work.
- CI must be green on the latest commit of the branch; rebase on `main` before merging stacked work and re-run CI.

## 9. Requirements versioning and change control

- **One canonical baseline per product:** `docs/requirements/BRS.md` and `docs/requirements/FRS.md` (or the single file named in `docs/requirements/README.md`). Edit in place; git keeps history.
- Each working baseline gets a version (v1.0, v1.1, v2.0) recorded in `docs/requirements/CHANGELOG.md` and a git tag `requirements-v1.1`.
- **No side-by-side versions** (`FRS_v1.md` next to `FRS_v2.md`). Superseded documents move to `docs/archive/` with a pointer, or are listed in `docs/requirements/README.md` as superseded until they can be moved.
- Product records (reconciliations, audits) never live in `docs/standards/`; that folder, if present, only links to this handbook.
- New scope found during building is raised as a change: a new FR or story with PO approval, never built silently.

## 10. Traceability

Each product keeps one matrix, `docs/traceability/TRACEABILITY.csv`:

`fr_id, story_id, ac_id, journey, screen, api, table, sequence_diagram, test, status`

Status values: `not_started`, `in_progress`, `done` (meets the Definition of Done), `accepted` (accepted by the ADS test team with the product's entrepreneur). CI checks that IDs are unique and every AC points to a test once its story is `done`. Template: [templates/TRACEABILITY.csv](templates/TRACEABILITY.csv).

## 11. Definition of Done

A story is **Done** when:

- [ ] All its acceptance criteria pass in automated tests (and manual checks are recorded where automation is impossible).
- [ ] Code is reviewed and merged to `main`; CI is green on `main`.
- [ ] API contract, migration, sequence diagram and screen states match what was built.
- [ ] EN/FR texts, mobile layout and accessibility check pass.
- [ ] No open high or critical security finding; security checklist items for the story are ticked.
- [ ] Traceability matrix updated.
- [ ] Deployed to staging and accepted by the Product Owner (status `accepted`).

## 12. Releases and evidence levels

Use semantic versioning per product. A release record ([templates/RELEASE_RECORD.md](templates/RELEASE_RECORD.md)) states the exact commit SHA and time, migrations applied, rollback and restore checks, and who released.

**Evidence ladder** (each level is a different claim; never report a higher one without proof):

`merged → CI green on main → deployed to staging and verified → partner connected → accepted by ADS test team → production released`

- CI green is not merged; merged is not deployed; deployed is not accepted.
- A preview build is not a release; a release is identified by its commit SHA.
- Status defaults to *not run*; a partner integration that runs only on a sandbox or mock is *sandbox only* with the partner named.
- Progress is reported against the product's **working baseline**: for each requirement, which layers are built and tested (frontend, backend, database, sequence diagram, end-to-end test), and how many acceptance criteria have passing tests. Counting documents, routes or screens is not progress.

### 12.1 External rules and partners do not block development (owner decision, 18 Oct 2026)

Regulators, licences, banks, insurers, settlement and payment providers, KYC providers, and legal or clinical sign-offs are **external rules**. They never block design, build or testing.

- Every external party sits behind an adapter (port) in the product. Build and test against the provider's **sandbox** when one exists, otherwise against a **mock adapter** with realistic success, failure, timeout and duplicate-event behaviour. Shared mocks (mock bank, mock MoMo/Orange Money, mock regulator, simulated insurer, mock KYC) belong in `ksondo/ads-platform-kit`.
- The real connection is chosen by configuration, never by code changes. Sandbox and mock modes are clearly labelled on screen ("Test mode — no real money / no real policy") so no one mistakes them for live service.
- The external approval is a **go-live gate only**: real customers, real money, real policies or real clinical data are not switched on until the licence, partner contract or sign-off exists. That gate is recorded in the release record, not in the backlog as a blocker.
- Statuses like `BLOCKED_EXTERNAL` or "waiting on partner" in older documents mean *build against sandbox now; go-live gate later*.

### 12.2 Working baselines (owner decision, 18 Oct 2026)

There is no separate owner sign-off step before building. The baseline named in each product's `docs/requirements/README.md` is its **working baseline**: the team builds from it straight away, and the owner changes it when needed through that README. Acceptance testing with real users is done by the ADS test team together with the entrepreneur who runs each product; their result is the `accepted` level above.

## 13. Working with existing code

Before changing an existing product: inventory what exists (routes, screens, tables, tests, deployments), classify each part as **keep**, **converge** (merge duplicates), **migrate** (move to the right owner) or **replace after a verified migration**, and never delete working behaviour until its replacement passes the same journeys. One system of record per entity; one app shell, route registry and design system per product.

## 14. AI agents

AI agents are developers under this handbook. Each repo has an `AGENTS.md` (and `CLAUDE.md` pointing to it) from [templates/REPO_AGENTS.md](templates/REPO_AGENTS.md): read this handbook and the product baseline first; one story per branch; write tests with the code; never mark something passed without evidence; never approve or merge their own pull request; stop and ask when requirements are unclear or a change is irreversible.

---

## Appendix A. Lessons register (informative)

Keep these in mind; they came from real ADS incidents. Details: Software-Factory `docs/standards/ADS_FULL_STACK_LESSONS_REGISTER_v2.1.json`, `ADS_FULL_STACK_OPERATIONAL_GATES_v2.2.json`, `ADS_FULL_STACK_REPEAT_FAILURE_PREVENTION_v2.3.json`.

1. Build and smoke-test the real runtime image, including runtime assets; a green unit run does not prove the container works.
2. Give each CI job its own isolated PostgreSQL; never share databases between jobs.
3. Normalise dates to ISO at the database boundary; use one UUID helper everywhere.
4. Translate interior forms and messages, not only menus.
5. Test deep links, page reloads and denied routes, not only navigation from the home page.
6. Rebase stacked pull requests onto current `main` and re-run CI before merging.
7. Retire a demo only after its replacement reaches parity; revoke demo credentials when you do.
8. Never store state that must be shared or trusted in browser storage.
9. Keep migration credentials separate from runtime credentials; provisioning must never drop data.
10. A role grants a capability, not access to every record: check the object.

## Appendix B. Templates

| Template | Use |
| --- | --- |
| [templates/REQUIREMENTS_README.md](templates/REQUIREMENTS_README.md) | Index of a product's canonical baseline and superseded documents |
| [templates/USER_STORY.md](templates/USER_STORY.md) | Story with acceptance criteria and design references |
| [templates/CUSTOMER_JOURNEYS.md](templates/CUSTOMER_JOURNEYS.md) | Journey list per actor, including the standard journeys |
| [templates/SEQUENCE_DIAGRAM.md](templates/SEQUENCE_DIAGRAM.md) | Mermaid sequence diagram per journey |
| [templates/TRACEABILITY.csv](templates/TRACEABILITY.csv) | Traceability matrix |
| [templates/ADR.md](templates/ADR.md) | Architecture decision record |
| [templates/PULL_REQUEST.md](templates/PULL_REQUEST.md) | Pull request description |
| [templates/RELEASE_RECORD.md](templates/RELEASE_RECORD.md) | Release record |
| [templates/REPO_AGENTS.md](templates/REPO_AGENTS.md) | `AGENTS.md` for each product repo |

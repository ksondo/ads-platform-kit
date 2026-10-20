# ADS wave-1 launch plan: synthesis (20 Oct 2026)

**Planning only.** Builds are halted, and nothing is changed until the owner approves.

This document brings together the six planning documents in this folder. The detail, the evidence and the full build registers are in those documents.

## 1. The five pilot platforms today

All five have their first release merged on `main` with CI green. **None is pilot-ready.** Each still lacks the partner layer, entitlements, its hosting and your acceptance.

| Platform | Built (own baseline, method in each doc) | First release | What blocks the pilot |
| --- | --- | --- | --- |
| VentureWorks | ~73% of its own journeys | Merged | <ul><li>3 of the master plan's 10 workspaces are new: opportunity registry, partner recruitment, commercial agreements</li><li>The people list is tenant-wide, so it is a privacy risk once partners share a tenant</li><li>The regulatory flag sits per venture, not per condition</li><li>Role grants stop at "pending"</li></ul> |
| Commerce | 45 of 98 requirement rows have code (35 tested end to end) | Merged (15 journeys) | <ul><li>No partner level, entitlements or partner provisioning</li><li>Menus are hard-coded</li><li>The payment-security pattern</li><li>Staff roles from any organisation can open data across organisations</li></ul> |
| Education | 40 of 50 rows have code (20 tested end to end) | Merged (19 journeys) | <ul><li>Role grants never activate (wrong endpoint)</li><li>No partner level or entitlements</li><li>Minors' data export and deletion is missing</li></ul> |
| Fleet Guard | ~52–58% of BRS functions | Merged (12 journeys) | <ul><li>No partner console or entitlements</li><li>Invitations do not go through the kit</li><li>Staff roles from any organisation can open data across organisations</li><li>The vehicle-availability endpoint for Transport is missing</li></ul> |
| Digital Tontine | ~61–68% of BRS functions | Merged (15 journeys) | <ul><li>**Money boundary:** a record-only pilot is recommended</li><li>No phone invitations</li><li>The payment-check pattern</li><li>It logs in as the DB owner in production</li></ul> |

## 2. What every platform needs first: the shared foundation (in ads-platform-kit)

| Need (master-plan gap) | Plan |
| --- | --- |
| Organisation levels ADS → partner → customer (gap 1) | Added in the kit only. Products keep isolating by `tenant_id`. Partner staff enter a customer's workspace only through a named, customer-approved, time-limited grant that is audited. |
| Entitlements and provisioning (gap 2) | Owned by the kit. Software Factory holds the package templates. Each product publishes a capability manifest and enforces it on the server. A disabled feature never breaks the rest. |
| Billing v1 (gap 3) | `services/billing` in the kit. It covers entry-fee and subscription invoices through the MoMo/Orange mocks. "Paid" only after the provider confirms. **In the pilot, partners invoice their own customers outside ADS.** |
| Phone accounts and invitations | Needed by Tontine (and many Cameroonian users). Not built today. |
| Public catalogue (gap 4) | A Hub page in a later build. During the pilot, VentureWorks is invitation-only. |
| Name check (gap 6) | "Methodology v2" was superseded by Handbook v1 on 18 Oct. The master plan v1.1 should cite Handbook v1 and the AI standard, which still needs your approval. |
| Legal (gap 7) | Fee renamed "Partner onboarding fee". Neutral EN/FR wording is drafted. BNPL stays feasibility-only. A lawyer reviews before any real partner pays. |

## 3. Security items that must close first

These come from the account audit and the 19 Oct reviews.

1. **Self-escalation:** any signed-in user can create an organisation through the old `/v1/identity/onboard` route and grant themselves staff roles. In 6 products those roles open other customers' data: Commerce, Fleet Guard, MamaCare, SoulBridge, Morphoo and Nutrition. **Close this before anything is hosted** (H-00 / ACC-03, ACC-05).
2. **The fixed test-account password** in a Software Factory workflow: remove it and disable the account (ACC-14).
3. **Portfolio payment rule:** separate DB roles for webhooks and workers, and an amount and currency check on every payment confirmation. It applies to Commerce, Tontine, Logistics, Transport, Tourism and Banking (and Education's notification worker). Write it once as a handbook rule (proposed PLAT-PAY-002), then fix the products.
4. **HopeBridge:** `app_identity.users` has no row-level security.
5. **Browser security headers and rate limits** are missing in Commerce and Education. Add them at the hosting proxy for all products.

## 4. Sequence (gates, not dates; each gate has acceptance checks)

| Stage | What | Main items | Outcome |
| --- | --- | --- | --- |
| **A. Host all 20+ for testers** | Close self-escalation, host the sign-in, mocks and gateway, containerise and deploy every product to `*.test.africadigitalsynergy.com`, seed data and test organisations, landing page | H-00…H-08, L-01…L-03 (in `HOSTING_AND_LANDING_PLAN.md`) | Testers sign up once, browse every sector from one landing page, and get staff roles by invitation |
| **B. Shared foundation** | Organisation levels, partner provisioning, entitlements, billing v1, phone accounts, the portfolio payment rule | FND-01…FND-12, phone accounts (FG/DT plan K-02), PLAT-PAY-002 | Partners can provision their own customers within what ADS allows |
| **C. Finalization builds, first three** | VentureWorks, Commerce, Education on the foundation | VW-B01…B21; CE-01…10, CE-17; ED-01…10, ED-14; PRD-COM-01, PRD-EDU-01, PRD-VW-01 | Pilot A (Commerce POS network) and the Education school-SaaS pilot run end to end in test mode |
| **D. Finalization builds, next two** | Fleet Guard, Tontine | FG-B-01, 02, 03, 07, 08, 10; DT-B-01, 02, 03, 04, 06, 07, 09, 11, 12, 13, 17; PRD-FG-01, PRD-DT-01 | Fleet reseller pilot and record-only association pilot |
| **E. Pilot with real partners (test mode)** | Recruit, onboarding fee (test values), agreements, KPIs, provisioning, reports | VW-B19 acceptance, CE-17, ED-14 | Validated operating model (master plan §12 step 04) |

Stages A and B can run side by side. A first gives testers something to see; B is the critical path for the pilots.

## 5. Pilots (recommended)

| Platform | Pilot | Scope |
| --- | --- | --- |
| Commerce | **Pilot A**: POS Deployment Network | 1 partner, 3–5 shops, Yaoundé or Douala. Bank collection only if a real bank signs. Pilots B and C follow once partner provisioning is proven; Pilot D (BNPL) is legal feasibility only |
| VentureWorks | Runs the pilots | 2 partners on COM-001 (Yaoundé and Douala), non-exclusive, test-fee values, test-mode workspace until the company, bank, regulatory and agreement steps are approved |
| Education | School-SaaS partner | 2–3 private schools, tested journeys only, no school fees, operator-assisted export and deletion of minors' data |
| Fleet Guard | Fleet-management reseller | 3–5 transport customers on an "Essentials" package, billed per asset |
| Tontine | Association-management partner | 3–5 associations, **record-only** (money stays with the group), rotating schemes, no fee on contributions, legal review before any live money |

## 6. Decisions needed from you (the most important; full lists in each doc)

| # | Decision | Recommendation |
| --- | --- | --- |
| 1 | Approve the sequence: host for testers (A) alongside the foundation (B), then VentureWorks, Commerce and Education (C), then Fleet Guard and Tontine (D) | Yes |
| 2 | Test environment: separate test server or separate stack, domain `*.test.africadigitalsynergy.com` | Separate, to protect live sites |
| 3 | Landing-page mock-up before building | Yes |
| 4 | Partner ventures live in the ADS tenant, isolated by venture membership (VW D-1) | Yes |
| 5 | Pilot fees: test values only; the 9,500,000 FCFA example never shown as a price | Yes |
| 6 | Partners invoice their own customers outside ADS during the pilot | Yes |
| 7 | Tontine pilot is record-only | Yes |
| 8 | Approve the Agentic/RAG standard and cite Handbook v1 in master plan v1.1 | Yes |
| 9 | Lawyer review of the onboarding-fee wording, BNPL and Tontine custody before any real partner pays | Yes |
| 10 | Package names, contents and prices (commercial team) | Owner and commercial team to fill in |
| 11 | Commerce support phone number, investment-ready rule, investor visibility, assessment price | Owner to supply or confirm |
| 12 | Close the self-escalation route before hosting (security) | Yes, do it first |

## 7. Finalization build register (summary)

The full registers, with dependencies, sizes and acceptance checks, are in the source documents.

| Group | Pilot-MVP items | Later items | Source |
| --- | --- | --- | --- |
| Hosting and landing | H-00…H-08, L-01…L-03 (12) | — | `HOSTING_AND_LANDING_PLAN.md` |
| Accounts and access | ACC-01…ACC-15 (mostly inside H-items) | — | `ACCOUNT_ACCESS_AUDIT.md` |
| Shared foundation | FND-01…FND-12, phone accounts, PLAT-PAY-002 | Revenue share, settlement, ledger, funding | `PLATFORM_FOUNDATION_PLAN.md` |
| VentureWorks | VW-B01…VW-B21 | VW-L01…VW-L14 | `VENTUREWORKS_PLAN.md` |
| Commerce | CE-01…CE-10, CE-17 | CE-11…CE-16 | `COMMERCE_EDUCATION_PLAN.md` |
| Education | ED-01…ED-10, ED-14 | ED-11…ED-13 | `COMMERCE_EDUCATION_PLAN.md` |
| Fleet Guard | FG-B-01, 02, 03, 07, 08, 10 | FG-B-04, 05, 06, 09, 11 | `FLEETGUARD_TONTINE_PLAN.md` |
| Tontine | DT-B-01, 02, 03, 04, 06, 07, 09, 11, 12, 13, 17 | DT-B-05, 08, 10, 14, 15, 16 | `FLEETGUARD_TONTINE_PLAN.md` |

The other ~20 platforms are hosted as they are in Stage A. Their own finalization builds are planned from Friday, as you asked.

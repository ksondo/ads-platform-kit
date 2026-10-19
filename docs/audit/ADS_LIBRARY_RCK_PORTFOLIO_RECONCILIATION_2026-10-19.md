# ADS portfolio Library ↔ GitHub ↔ Retail Connect Kit reconciliation — 2026-10-19

**Status:** active evidence-based audit; not an implementation or production certification claim. **Owner direction:** preserve historical POCs, compare latest ChatGPT Library documents against canonical GitHub requirements and code, reconcile Retail Connect Kit (RCK) capabilities without deleting its source, decide standalone repository ownership only after checking overlap, then deliver per-project FRS-to-code evidence and controlled MVP releases.

## Scope and inventory
- GitHub account `ksondo`: **37 accessible repositories** in the 19 October listing. This is not 37 certified ADS products. Includes test/legacy, shared platform, product, preview and kit repos.
- ChatGPT Library: **1,218 items** listed by paginating Library metadata on 19 October. Mixed PDFs, DOCX, MD, generated artifacts, duplicates and unrelated files; **not 1,218 BRSs**.
- RCK `services/sector-registry.json`: **14 sectors**; `docs/MODULE_V2_DEVELOPMENT_REFERRAL_REGISTRY_v1.0.md` maps domain-specific recovery; `docs/requirements/CONSOLIDATION_2026-10-18.md` records **60 proposed uncovered stories plus E29 Construction 12**. Audit these against code and other repos before labeling unimplemented.
- Date of Library upload is **not** a replacement for document internal version, owner decision or later GitHub authority.

## High-value ChatGPT Library source index (original filenames; compare content, do not silently supersede)
| Destination | Library source | Internal version / date | Review focus |
|---|---|---|---|
| africa-digital-synergy-hub | `ADS_BRS_01_v2_Website_Intelligent_Engagement_Ecosystem_Acquisition(1).pdf` | ADS-BRS-01 v2, 2026-09-12 | Exactly eight Phase 1 participation pathways; Agentic demo entitlements, ADS identity, qualified handoff |
| Education-and-intelligent-services | `ADS_BRS_02_v2_Digitalization_Education_Agentic_Learning_Collaboration(1).pdf` | ADS-BRS-02 v2, 2026-09-12 | Controlled Agentic use, conventional/offline content, assessment, governed certification, partner pathways |
| Software-Factory | `ADS_BRS_03_Software_Factory_Developer_Ecosystem_Digital_Haven_v1(1).pdf` | ADS-BRS-03 v1, 2026-09-12 | Full discover→operate lifecycle, capability composition, autonomous preview, application knowledge/continuity, Digital Haven |
| Software-Factory | `ADS_SoftwareFactory_Reconciled_Specification(1)(1).pdf`; `ADS_Software_Factory_Master_Journeys_Screen_Register.pdf`; `ADS_Software_Factory_MASTER_All_Roles_Journeys_UI_UX.pdf` | 2026-08/10 Library files | Compare against split canonical requirements, screen and role journeys; preserve UI-01..05 work |
| Africa-Digital-Synergy-VentureWorks | `ADS_VentureWorks_Full_BRS_v2_Progress_Evidence_Readiness(4).pdf` | v2, September 2026; uploaded October 8 | Contributor agreements, verified contribution, venture milestones, evidence confidence, readiness, financier-consented views, ADS portfolio command centre |
| Mama-care-and-intelligent-services | `ADS_MamaCare_Maternal_Pregnancy_Newborn_Intelligence_Platform-1.pdf` | uploaded 2026-10-18 | Compare maternal, newborn, parenting and personalized child guidance to current FRS |
| Health | `IHCP_Phased_Intended_Design_v1.0.pdf` | uploaded 2026-10-18 | Intended phased healthcare design; do not call approved BRS without review |
| go-ahead-guesser (Morphoo) | `MORPHOO_Sprint_Directive_v3.0.docx`; `ADS_Morphoo_Christian_Formation_Intelligence_Platform(1).pdf` | uploaded 2026-10-18 | Directive vs requirements vs verified code; ensure no legacy UI survives |
| Fleet-guard-and-intelligent-services | `ADS_FleetGuard_Vehicle_Heavy_Equipment_Asset_Intelligence_Platform.docx`; `BRS_Construction_Fleet_Heavy_Equipment_Intelligence_v1.0.docx` | September 2026 | FleetGuard vs construction asset/equipment ownership, maintenance and financial controls |
| Digital-tontine-and-intelligent-services | `ADS_Digital_Tontine_Njangi_Tontine_to_Business_Platform.pdf` | September 2026 | Scheme obligations, group finance, controlled external integrations |
| Soulbridge-mental-health-project | `SoulBridge_BRS_v1.0.pdf`; `HopeBridge_SoulBridge_Referral_v1.0-1.pdf` | BRS v1; referral uploaded October 18 | Privacy, referral authority and shared boundaries |
| ADS-Commerce-Platform | `Commerce_POS_Engine_Intended_Design_v1.4-2.pdf`; `ADS_Workstream_U_Shared_Commerce.pdf` | August 2026 | POS, cashier, settlement, authoritative orders and RCK parity |
| Nutrition-intelligence-platform | `BRS-NUTRITION-INTELLIGENCE-POC-v1.md`; `FRS-NUTRITION-INTELLIGENCE-POC-v1.md`; `TSD-NUTRITION-INTELLIGENCE-POC-v1.md` | Original POC, August 2026 | Preserve POC; compare with merged v2 consolidation |
| Construction-realestate-intelligence-platform | `BRS_Construction_Fleet_Heavy_Equipment_Intelligence_v1.0.docx` + RCK construction/real-estate referral | September 2026 | Separate construction project/property lifecycle from equipment FleetGuard; original POC recovery still to verify |
| **Unassigned candidate** | `BRS_Role_Interview_Recruitment_Intelligence_v1.0.docx` | BRS v1, 2026-09-08 | Role knowledge factory, candidate/interviewer/panel modes; decide Career Path extension vs standalone |
| **Unassigned candidate** | `TourismCorestack_BRS_v1.docx` | v1, April 2026 | Tourism RCK module; dedicated deployable product candidate |
| Shared ADS services | `Funding_Engine_Intended_Design_v1.0.pdf`; `Verification_Engine_Intended_Design_v1.0.pdf`; `Africa_Digital_Synergy_Progress_Agentic_RAG_Accelerated_October_2026_Plan.pdf` | August/September 2026 | Shared service authority; avoid copying engines into each vertical |

## GitHub repositories in inventory (37)
`test`, `BizApp-test`, `shop-data-deployer`, `africa-digital-synergy-hub`, `go-ahead-guesser`, `retail-connect-kit`, `hopebridge`, `lovable-demo-plan`, `v2-live-preview`, `RAG-Intelligence-AI-Platform`, `Animated-Intelligence-Platform`, `Software-Factory`, `Project-Management-Platform`, `Education-and-intelligent-services`, `Digital-tontine-and-intelligent-services`, `Mama-care-and-intelligent-services`, `Fleet-guard-and-intelligent-services`, `Africa-Digital-Synergy-VentureWorks`, `Progress-Education-training`, `Intelligent-Cryptocurrency-platform`, `ADS-Leisure-Recreation-Events`, `Home-Services`, `Africover-Insurance-project`, `Soulbridge-mental-health-project`, `ADS-Commerce-Platform`, `Logistics`, `Health`, `Agriculture`, `Personal-Life-Financial-Intelligence`, `Nutrition-intelligence-platform`, `career-path-platform`, `betting-pronostics-platform`, `construction-realestate-intelligence-platform`, `family-ancestry-platform`, `car-dealer-marketplace-platform`, `transport-booking-platform`, `ads-platform-kit`.

## RCK module ownership register — review before any repo creation
| Sector | RCK source | Proposed destination | Decision |
|---|---|---|---|
| Education | `src/modules/edu` | Education-and-intelligent-services | Existing |
| Commerce | `src/commerce`, POS, merchant, bank collection | ADS-Commerce-Platform | Existing; reconcile all finance/auditor/POS roles |
| Agriculture | `src/modules/agric` | Agriculture | Existing |
| Logistics | `src/modules/logi` | Logistics | Existing |
| Health | `src/modules/health` | Health | Existing |
| Construction | `src/modules/construction` | construction-realestate-intelligence-platform | Existing, currently empty at earlier check; original POC not yet confirmed transferred |
| Mobility | `src/modules/mobi` | transport-booking-platform + Fleet-guard-and-intelligent-services | Split booking vs asset/maintenance ownership |
| Services | `src/modules/serv` | Home-Services | Existing |
| Insurance | `src/modules/africover` | Africover-Insurance-project | Existing |
| Sports | `src/modules/sports` | ADS-Leisure-Recreation-Events | Existing |
| Tourism | `src/modules/tour` | **Candidate new repository** | No matching dedicated repo in current 37; validate independence |
| Diaspora | `src/modules/diaspora` | **Candidate new repository** | Check gateway vs shared services |
| Banking | `src/pages/BankDashboard.tsx`, finance | **Candidate new repository** | Determine regulated bank-facing product vs shared engine |
| Process | `src/modules/process` | Shared ADS engine or vertical | Architecture decision required; no automatic repo |

**Other RCK domains not to forget:** reuse, professional/legal services, church, public CMS, approval flows, platform admin, regulator portfolios, settlements, banking cash collection, DGP/goods provenance, funding and verification. Assign explicit owning repo/service; do not infer all need separate repos.

## Decision gates
1. Compare **Library document text** to GitHub current canonical BRS/FRS, recent PRs and commits; classify as `ADOPT / ALREADY COVERED / SUPERSEDED / CONFLICT / FUTURE / EXTERNAL DEPENDENCY`.
2. Reconcile each RCK module's requirements **and code** with destination frontend, backend, database and Agentic RAG, with file/commit/test evidence.
3. Preserve original POC under immutable source paths; no silent rewrite of historical documents.
4. Create new repositories **only** after checking whether a distinct deployable system, data authority, API and owner exists; candidate is not approval.
5. Keep RCK code until parity and extraction/certification gates are met. RCK registry says no vertical extraction before Software Factory certification.
6. For each requirement record: BRS/FRS ID, journey, FE file, BE API/service, DB migration, Agentic service, tests, live evidence, gap, priority, accountable owner.
7. Release states: specified → built → tested → independently UAT accepted → approved → enabled for tenant/role/cohort. Feature flags cannot replace backend RBAC or tenant isolation.
8. Do not calculate fresh completion percentages from old estimates or document presence.

## Work queue (not yet completed)
- [x] Enumerate Library metadata and all 37 repositories.
- [x] Identify high-value BRS families, read ADS-BRS-01/02/03 v2/v1, VentureWorks v2, Recruitment v1.
- [x] Read RCK sector registry, module referrals and 18 October consolidation.
- [ ] Full content/version diff for every Library family and repository canonical BRS/FRS.
- [ ] Check open PRs, branches and code/test evidence for each of 37 repositories.
- [ ] Verify POC transfer for Construction and Betting; earlier check found empty repos. Career Path original POC already recorded copied.
- [ ] Reconcile 60 RCK stories and E29 12 against destination code, preserving IDs and avoiding duplicates.
- [ ] Resolve new repo candidates: Tourism, Diaspora, Banking, Recruitment, Process.
- [ ] Produce per-product verified requirements coverage, E2E/UAT and MVP exposure matrices.
- [ ] Merge approved document changes, build remaining journeys, test, deploy and certify separately.

**Claude review:** Validate all source authorities and owner decisions, confirm RCK parity and cross-sector data boundaries, inspect code/test evidence, and identify conflicts before merging. This register is a discovery baseline, not a final approved replacement BRS.


## Owner direction, 19 October — Progress Agentic RAG integration (binding for reconciliation)
- `ksondo/Progress-Education-training` is the developer education reference: `docs/START-HERE.md`, `docs/TRAINING-GUIDE.md`, `docs/builds/00..13`, and `labs/build-XX`. Learn and implement the taught integration pattern; do not assume placeholder/simulated labs prove live connectivity. The Progress training corpus is already in the external Progress knowledge base; do not re-ingest a duplicate.
- `ksondo/RAG-Intelligence-AI-Platform` is ADS's shared **integration/governance** repository and Application Gateway contract layer, not a mandate to rebuild Progress's Agentic RAG engine. Resolve overlaps with Progress first.
- Every vertical's Agentic/Intelligent BRS requirement must map to: **business decision and human authority**, app-side trigger/UI/API, shared gateway adapter, Progress API/knowledge-base contract (when provided), tenant and role authorization, consent/data minimization, grounded response/evidence, fallback/error path, audit/observability, mock contract tests, live integration test pending partner access.
- Application implementation proceeds now using documented interfaces and mocks, while Progress live integration is labeled **EXTERNAL INTEGRATION PENDING** until contract, credentials, authorization, connectivity and E2E evidence are verified. Never report mock success as live.
- Do not silently drop later implemented or approved requirements because a Library BRS is older. Library documents are **source candidates** for additive reconciliation, not an automatic replacement of GitHub's current authoritative baseline. Preserve newer GitHub code, owner decisions, PRs and accepted journeys. Disposition per finding: ALREADY COVERED / ADD TO BRS / SUPERSEDED / CONFLICT FOR OWNER / FUTURE / PARTNER INTEGRATION.

## Owner-prioritized missing sector repository coverage — Transport, Banking, Tourism (2026-10-19)

The owner explicitly requests **Transport, Banking and Tourism** to be listed together as the three priority missing ADS sector repository workstreams for Claude's reconciliation. **Distinguish missing repository from an existing but empty repository:**

| Priority sector | RCK registered sector/source | GitHub status verified | Action for Claude |
|---|---|---|---|
| **Transport / Mobility** | `mobility`; `src/modules/mobi`; `services/mobility` | **`ksondo/transport-booking-platform` already exists but is empty** (GitHub contents API reports repository empty). It is missing a populated/operational codebase, **not missing a GitHub repository**. | Recover and audit Mobility BRS/FRS, code and journeys from RCK and other POCs; populate the existing Transport repository only after extraction/certification gates and owner approval; distinguish passenger booking, operators, routes and tickets from Fleet Guard's maintenance/asset scope. **Do not create a duplicate transport repository.** |
| **Banking / AfriBanking** | `banking`; `src/pages/BankDashboard.tsx`; `services/banking` | No dedicated Banking repository identified in the 37-repo inventory | Audit existing finance, payments, ledger, funding, verification and regulatory boundaries; propose a standalone Banking repository only if ownership/deployability justify it. |
| **Tourism Intelligence** | `tourism`; `src/modules/tour`; `services/tourism`; Library `TourismCorestack_BRS_v1.docx` | No dedicated Tourism repository identified in the 37-repo inventory | Reconcile Tourism BRS and RCK journeys; propose dedicated Tourism repository, preserving original code and current direction. |

**Status:** These are **three priority sector gaps**, not three absent GitHub repositories: **two absent dedicated repos (Banking and Tourism) plus one existing empty repo (Transport)**. Do not claim creation, transfer, implementation or certification has happened. All Agentic/Intelligent features must use the Progress-Education-training learning path and prepare application-side integration with external Progress Agentic RAG, not create a competing RAG engine.

## Repository creation shortlist (not yet created)
| Candidate | Library/RCK evidence | Current GitHub repo? | Recommendation |
|---|---|---|---|
| Tourism Intelligence | `TourismCorestack_BRS_v1.docx`; RCK Tourism sector | No dedicated Tourism repo in 37-repo listing | **Create after checking Tourism journeys and standalone data/API ownership** |
| Diaspora Gateway | RCK Diaspora module | No dedicated Diaspora repo | **Conditional**: create if separate deployable onboarding/remittance/partner product; otherwise ADS Hub/shared |
| AfriBanking / Banking Services | RCK Banking module, bank dashboard, funding/verification designs | No dedicated Banking repo | **Conditional**: regulatory and shared-finance boundary review first; do not imply bank license |
| Role & Recruitment Intelligence | `BRS_Role_Interview_Recruitment_Intelligence_v1.0.docx` | No dedicated recruitment repo; `career-path-platform` exists | **Conditional**: standalone if employer/panel and recruitment data authority distinct from Career Path |
| Process / Value Addition | RCK Process sector | No dedicated Process repo | **Default shared capability**, create only if separately deployable product justified |

**Already exist — do not create duplicates:** `construction-realestate-intelligence-platform`, `career-path-platform`, `betting-pronostics-platform`, `transport-booking-platform`, `car-dealer-marketplace-platform`, `family-ancestry-platform`, `Personal-Life-Financial-Intelligence`, `Progress-Education-training`, `RAG-Intelligence-AI-Platform`. Check original POC transfers independently.

## BRS consolidation rule
For each identified Library BRS and RCK module: find destination repository; read canonical BRS/FRS and latest implementation/PRs; compare source requirements and later changes; add **only missing, non-superseded** requirements through reviewed GitHub PR; preserve traceability back to filename, internal version/date and specific requirement; never regress working code. Newly discovered Library material is tagged `CANDIDATE FOR BRS CONSOLIDATION`, not automatically labeled final. The register's original source index above is the initial candidate list, not an exhaustive content diff.

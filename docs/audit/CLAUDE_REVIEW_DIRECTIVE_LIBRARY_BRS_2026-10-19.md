# Claude review directive — ADS Library BRS and Retail Connect Kit audit

**Date:** 2026-10-19
**Status:** AUDIT REQUIRED — not an approved BRS rewrite or authorization to merge application changes.
**Audit entry point:** `docs/audit/ADS_LIBRARY_RCK_PORTFOLIO_RECONCILIATION_2026-10-19.md`.

## Required workflow
1. Inspect each source in `docs/audit/library-sources/`. These are **text extracts** from original ChatGPT Library documents, not the original binary PDFs/DOCX. Preserve references to the original names and verify tables, figures, formatting against originals where needed.
2. Find its destination GitHub repository and locate canonical current BRS/FRS, owner decisions, PRs, branches, commits, code, DB migrations and tests. **Do not overwrite newer approved functionality merely because the Library BRS is older.**
3. Compare individual source requirements with current BRS/FRS and actual implementation; tag each `ALREADY COVERED`, `ADDITIVE BRS GAP`, `CONFLICT FOR OWNER`, `SUPERSEDED`, `FUTURE`, or `PROGRESS INTEGRATION PENDING`.
4. Propose additive requirements and traceability updates **in each destination repository**, as reviewable PRs. Preserve existing POCs and the canonical current direction. Do not merge without owner review.
5. Audit Retail Connect Kit's 14 registered sectors, plus cross-sector modules and referrals, and compare its 60 uncovered Phase-10 stories + 12 Construction E29 stories against current destination requirements and code. Do not remove RCK code until the extraction/certification gates are satisfied.
6. Check candidate new repositories **Tourism Intelligence, Diaspora Gateway, AfriBanking, Recruitment Intelligence, Process/Value Addition** against existing repository boundaries, regulatory obligations, deployability and data ownership. Recommend creation only when justified; avoid duplicate repos.
7. Return a report by repository: original BRS source and version, current BRS/FRS, newer additions preserved, requirements missing, RCK modules to reconcile, frontend/backend/DB evidence, Agentic integration adapter evidence, tests, blockers, proposed PR, new repo decision and confidence. No fabricated completion percentages.

## Binding Agentic/Intelligent direction from owner
- Use `ksondo/Progress-Education-training` as the developer education path. Read `docs/START-HERE.md`, `docs/TRAINING-GUIDE.md`, `docs/builds/00..13`, and labs. The training corpus already exists in Progress; don't duplicate ingestion.
- ADS applications implement the app-side UI, backend triggers, tenant/role checks, consent, evidence and fallback, using mock adapters initially.
- `ksondo/RAG-Intelligence-AI-Platform` is ADS's shared **integration/governance and Application Gateway boundary**, not a duplicate of Progress's RAG engine.
- Integrate with external Progress Agentic RAG systems when approved API contracts, credentials and access are available; verify live E2E separately. **Mocks or training labs do not prove live integration.**
- Map all Agentic/Intelligent requirements to shared Progress integration patterns rather than building competing domain RAG stacks.

## Source extracts uploaded in this branch (15)
- `website-brs01-v2.md`
- `education-brs02-v2.md`
- `software-factory-brs03-v1.md`
- `ventureworks-brs-v2.md`
- `recruitment-brs-v1.md`
- `tourism-brs-v1.md`
- `nutrition-brs-poc-v1.md`
- `nutrition-frs-poc-v1.md`
- `mamacare-brs.md`
- `fleetguard-brs.md`
- `digital-tontine-brs.md`
- `soulbridge-brs.md`
- `health-ihcp-design.md`
- `commerce-pos-v1-4.md`
- `construction-fleet-brs.md`

## Not uploaded / requires recovery
- Morphoo BRS text extraction: blocked by upload safety checks. Original Library filename `ADS_Morphoo_Christian_Formation_Intelligence_Platform(1).pdf`.
- Nutrition technical POC specification text extraction: blocked by upload safety checks. Original `TSD-NUTRITION-INTELLIGENCE-POC-v1.md`.
- Additional important Library sources (not yet copied): `MORPHOO_Sprint_Directive_v3.0.docx`, `HopeBridge_SoulBridge_Referral_v1.0-1.pdf`, `ADS_Software_Factory_Master_Journeys_Screen_Register.pdf`, `ADS_Software_Factory_MASTER_All_Roles_Journeys_UI_UX.pdf`, `ADS_SoftwareFactory_Reconciled_Specification(1)(1).pdf`, `ADS_AfriEdu_Education_Intelligence_Platform.pdf`, `ADS_Workstream_U_Shared_Commerce.pdf`, `Funding_Engine_Intended_Design_v1.0.pdf`, `Verification_Engine_Intended_Design_v1.0.pdf`, `ADS_Digital_Tontine_Njangi_Tontine_to_Business_Platform.pdf` (uploaded), and relevant newer GitHub documents. The complete Library is not yet transferred.

**Delivery acceptance:** produce a traceable requirements delta matrix and per-repository Claude findings, not merely an inventory. No approval to silently create repositories, rewrite BRS, or claim production certification.

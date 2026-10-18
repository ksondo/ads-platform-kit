# Documents superseded by the ADS Software Delivery Handbook v1.0

From 18 October 2026 the documents below are **reference only**. Where they conflict with the handbook, the handbook wins. They stay in place for now because automated tests and links still read them; they will move to `docs/archive/` once those references are updated. No new versions of them should be written.

| Handbook section | Supersedes |
| --- | --- |
| §0 Authority and change control | Authority sections of `docs/standards/AFRICORESTACK_BUILD_STANDARD_v1.0.md`, `AI_BUILD_PROTOCOL_v1.0.md`, `ADS_UNIFIED_RAPID_BUILD_AND_SECURITY_STANDARD_v1.0.md`, `ADS_UNIVERSAL_FULL_STACK_*_v2.0–v2.3`; retail-connect-kit master architecture §15; Leisure `docs/methodology/STANDARD_REFERENCE.md` |
| §1 Roles and way of working | `docs/standards/ADS_AUTONOMOUS_EXECUTION_WP_B_TO_D.md`; `AGENTS.md` execution loop; retail-connect-kit workflow states and collaboration guide 11 |
| §2 Requirements hierarchy | `ADS_CROSS_PLATFORM_DELIVERY_STANDARD_v1.md` (L1–L9 layers), `ADS_WP_D_REUSABLE_METHODOLOGY_v1.md`, `ADS_SECTOR_DELIVERY_AND_JOURNEY_STANDARD_v1.0.md`, `ADS_DUAL_LENS_PRODUCT_ARCHITECTURE_EXPERIENCE_STANDARD_v1.0.md`, `ADS_L1_L5_*` and `ADS_L2_*` baselines (as method; their content becomes product backlog), retail-connect-kit 15-field story traceability |
| §3 Definition of Ready | retail-connect-kit readiness report §14.1 and technical blueprint §17; build standard stages 2–4 |
| §4 Design artefacts | Build standard stages 5–9; retail-connect-kit module integration & security standard §4–5 (all three copies); one-shell rules of v2.0/v2.1 |
| §5 Testing | Module standard testing gates; v2.1 G5; v2.2 OP22-07/09; v2.3 RE23-10/12; AI build protocol repair loop |
| §6 Security | Unified rapid security baseline; sector standard §5; module standard §5–6; retail-connect-kit security guide 10 (Supabase-specific rules no longer apply); `ADS_SHARED_IDENTITY_AND_SSO_STANDARD_v1.md` becomes background for the identity decision now implemented in ads-platform-kit |
| §7 Operations | VentureWorks Contabo deployment standard (branch); retail-connect-kit database connection standard; v2.2 OP22-08 |
| §8 Source control and review | RAG platform branch and release strategy and PR template; premerge reconciliation; OP22-02; RE23-02; FS21-02 |
| §9 Requirements versioning | Side-by-side version stacks (retail-connect-kit master v1.0–1.2, checklist v1.0–1.4, branch registry v1.0–1.4); the v2.0→v2.3 add-on chain |
| §10 Traceability | WP-D TraceRow, cross-platform trace row, dual-lens register, v2.0 acceptance-to-PR ledger, Education E2E ledger format, Leisure TRACEABILITY.md |
| §11 Definition of Done | All seven previous Definitions of Done |
| §12 Releases and evidence | Build standard stage 12 and its status scale; FS21-26/27; v2.3 six reporting axes; production baseline and preview rules; sector completion statuses |
| §13 Existing code | v2.0 entry states; retail-connect-kit master §9 reuse classification; FS21-01; OP22-01; RE23-01 |
| §14 AI agents | `AI_BUILD_PROTOCOL_v1.0.md`; all existing `AGENTS.md` / `CLAUDE.md` instructions |
| Appendix A Lessons | Lessons registers v2.1, v2.2, v2.3 (kept as detail) |

**Not methodology** (product requirements of Software Factory; to be moved to `docs/requirements/`): `MVP_AI_ANALYSIS_HUMAN_BUILD_STANDARD_v1.0.md`, `MVP_PAID_ANALYSIS_AND_DEVELOPMENT_COMMISSIONING_v1.0.md`, `INTELLIGENT_ANALYSIS_TO_AUTONOMOUS_BUILD_STANDARD_v1.0.md`, `ENGINEER_*`, `ENTREPRENEUR_PROJECT_DOCUMENT_RAG_DISCOVERY_STANDARD_v1.0.md`, `PROJECT_ANALYSIS_AND_BUILD_MANIFEST_SCHEMA_v1.0.md`, `PROGRESS_ARAG_TRAINING_CAPABILITY_CATALOG_v1.0.md`.

**Dropped practices:** agents merging without human review; side-by-side versioned files; "does not replace" add-on standards; authoritative documents on non-`main` branches; user stories written after the UML and data models; per-story traceability strings of 15–20 fields; counting documents, routes or journeys as progress; colliding gate names (Gate 1 / G1 / L1 / WP-A / P1). One vocabulary now: Epic, Story, Definition of Ready, Definition of Done, Release.

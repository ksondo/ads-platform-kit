# ADS Institutional Access & Aggregation — Business Opportunities Extension (proposal)

**Scope:** Business Opportunities catalogue only; no changes to the current homepage, platform pages, shared sign-in, or deployed Commerce. This describes possible partner-operated businesses, **not** government access or integrations that are operating today.

## Decision

Make `Institutional Access, Regulatory Services & Aggregation` a discoverable **business-opportunity family**, with subcategories for tax, customs/trade, licensed finance, standards, sector licenses, insurance and cross-institution coordination. An entrepreneur may pick a defined service package, qualify through VentureWorks, become an ADS implementation/operator partner and serve paying businesses using a curated set of reusable engines.

**ADS** maintains APIs, integrations, hosting and quality gates. **Operator** owns customer acquisition, service delivery, professional staffing, mandates, and lawful agency relationships. **Authority or licensed partner** alone makes official determinations, grants clearance/licences, moves regulated funds, or authenticates official status.

## Existing architecture evidence (not live claims)

- CoreStack v1.2, `retail-connect-kit`: Policy & Correction, Verification/Eligibility, Goods Provenance, Landed Cost, Fiscal Compliance Gateway, Funding, Audit, and Trade & Customs Facilitation ownership already defined.
- Trade & Customs Facilitator is **DESIGNED / PRESERVED**, not built or currently active; do not portray as available integration.
- `ads-platform-kit` has mock KYC, registries, banks, MoMo and insurer providers; an official API is **NOT** evidenced by a mock.
- `Banking-platforms` explicitly limits regulated decisions/transactions to licensed financial partners.
- Cameroon GUCE already provides the official e-GUCE single window and an e-Business channel for partner interconnections. An ADS operator would complement and connect via approved protocols, **not rebuild or impersonate** GUCE.

## Discovery seed

The separate file `seed/institutional-aggregation-candidates.v1.json` contains **20 candidate tool/operator opportunities**, with operator profile, customer benefit, business model, reused engines and integration prerequisite. They are **not yet merged into the 333 published-candidate sector-to-tool rows**, and must be deduplicated by capability/sector before a catalogue release or its counts change.

## Service-access levels

| Level | Description | What can be shown publicly? |
| --- | --- | --- |
| A | Official public information, sourced eligibility criteria and deadlines | Guidance and navigation; sources and freshness shown |
| B | Pre-fill, document checklist, consented dossier workspace | Applicant-preparation support only |
| C | Human-assisted filing by an appropriately accredited representative | Requires verified appointment, professional credentials and explicit mandate |
| D | System-to-system submission/status via an approved integration | Requires documented agency/bank partner approval, scoped credentials and end-to-end certification |
| E | Regulated financial, customs brokerage, insurance or official determination | Only performed by the licensed/accredited legal actor; ADS is never the substitute |

A and B can be offered before a direct API exists, subject to local law and accuracy checks. C–E must remain inactive until their legal and contractual conditions are met.

## Architecture (per institution; no arbitrary connector)

```
Public ADS Business Opportunities
    -> discover aggregator service -> request contact/partner qualification
        -> (future) VentureWorks blueprint, authorization and readiness
            -> operator business workspace (separate product / tenant)
                -> customer authorization/mandate + identity roles
                -> cross-institution case / task / evidence orchestration
                -> specific reusable engine (Fiscal / Trade / Funding / Policy / Verification...)
                -> institution-specific adapter with audited allowed operations
                    -> public official resource or authorized live endpoint
```

The orchestration layer should own:
- `institution_directory` (organization, role, jurisdiction, official URLs and public help);
- `integration_approval` (source, authentication method, contract/legal basis, effective/expiry dates, environment, allowed operations, review evidence);
- `operator_qualification` (business/legal identity, professional licence if required, staff authorizations, conflicts and suspensions);
- `customer_mandate` (principal, scope, consent, validity, revocation, authorized representative);
- `case`, `case_step`, `case_document`, `external_submission`, `status_event`, `audit_event`;
- `commercial_offer` with operator fees distinguished from official fees, taxes, bank charges and independently approved payments.

Do not store shared government passwords or scrape authenticated portals. Do not automate restricted forms using a human login without express authorization. Signed requests, correlation IDs, idempotency, backoff, per-tenant boundaries and independently verifiable receipts are required for live adapters.

## Business model

Operators may offer service setup, subscription-based compliance operations, B2B document/case-management services, authorized technology integration or disclosed referrals with valid agreements. They must not sell expedited approvals, promise favorable regulatory decisions, imply official affiliation, impose unofficial government charges, or represent themselves as payment/banking entities without appropriate permissions. Any statutory fee must be separately identified and paid through permitted channels.

## Illustrative cross-sector package: wood processor/exporter

1. Production/Processing records (product and batch source evidence).
2. Commerce E-commerce and POS, and inventory/stock control as applicable.
3. Goods Provenance and verification dossier.
4. Tax registration/returns guidance, DGI/DGE/CIME only as applicable.
5. Export documentation + GUCE/customs case coordination **if importing/exporting**, using authorized actors and channels.
6. Bank trade domiciliation/working-capital application preparation (bank retains decision and operations).
7. Audit, documents, reminders and logistics tracking.

A local professional could operate the **trade/tax documentation coordination service** across many unrelated processors, but cannot become the official authority or customs representative without the required status.

## First gates before adding to public opportunity counts

1. Deduplicate 20 entries against existing 333 opportunities and 324 candidate names; preserve one authoritative tool with many sector mappings.
2. Legal and operational classification for each offer, especially reserved professions, institutional representation and payment/insurance activities.
3. Verify official institution names, supported public e-services, data access conditions and contract route.
4. Confirm source-of-truth engine and separate case-state from government status; use pending/verified/mock labels.
5. Approve bilingual English/French summaries and no-integration claims.
6. Only then publish discovery entries with status `concept` or `documentation_service`; set any `Try demo` link only after a real verified service deployment.
7. Public homepage and all other existing pages remain byte-for-byte unchanged.

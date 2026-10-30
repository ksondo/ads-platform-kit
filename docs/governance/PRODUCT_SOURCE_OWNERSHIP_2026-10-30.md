# ADS product source ownership and Software Factory recovery — 30 October 2026

**Owner-adopted directive.** This repository is the authoritative owner of its application/business capability, code, APIs, data model, UI, requirements, tests, packaging and independent manual Contabo release evidence, subject to shared-service boundaries. **Software Factory is not presently the product deployment authority.** It will only become operational as such after its own hosted Contabo customer-facing app passes real build → preview → customer-initiated deployment → acceptance tests.

**This repository's recovery rule:** Platform Kit owns the portal, demo identity, and explicitly designated shared services. Reconcile the Factory portal release controller here with existing portal deployment tooling and keep cross-sector billing/entitlements here only after an ownership ADR, not by copying Workstream U indiscriminately.

## Required before adding or repeating implementation
1. Follow the canonical [ADS Software Factory delivery handbook](https://github.com/ksondo/Software-Factory/tree/main/docs/handbook), while keeping executable product code **here**.
2. Cross-check historical `Software-Factory` code, `retail-connect-kit` source, old migration branches and the current product BRS/FRS/traceability **before writing new code**. Classify each historical capability as `already-owned`, `missing-adapt`, `shared-service`, `Factory-product-only` or `deferred`.
3. Recover only functionality absent from this canonical repo; adapt to approved UI, OIDC/role/tenant authorization, actual PostgreSQL schemas, security and tested requirements. **Never bulk-copy** Factory database migrations, alternate shells, commerce/checkout engines or old insecure identity implementations.
4. Keep the full product BRS/FRS intact; the Agriculture MVP is a business priority, not cancellation of this repository or a license to drop completed journeys. Future sector work remains independently launchable.
5. Use GitHub for source, approved PR/CI and release candidates; a human-controlled operator deploys the **owner-repository** approved SHA directly to Contabo with backup, forward-only migration, container smoke, hosted E2E, audit and rollback. GitHub Actions success is not a deployed Factory or proof of product acceptance.
6. Do not delete or disable existing running workloads, enable paused Factory host-mutating workflows, or change shared login/ingress as part of this documentation update.

**Programme decision and misplaced-code register:** [Software Factory governance PR #138](https://github.com/ksondo/Software-Factory/pull/138). Resolve any claimed capability move against that register and file a targeted recovery PR **here**; record original source SHA, target test, result and deployment evidence. This note itself does not move code or claim the release is live.

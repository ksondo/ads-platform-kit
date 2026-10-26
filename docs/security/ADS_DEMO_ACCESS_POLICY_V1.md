# ADS Demo Access Policy v1 — cross-platform source audit and staged security release

**Status: SOURCE-ONLY PROPOSAL; NOT ENFORCED IN CONTABO OR ANY PRODUCT YET.**

## Owner scope
- Keep the current ADS public landing page, /opportunities, platform pages and new-tab navigation unchanged.
- Reuse `services/identity`, OIDC client registrations, admin/invitation APIs and product-owned RBAC. Do not implement a second login, public portal account system, or browser-side access authorization.
- Preserve the working Commerce and POS deployment and all demo/test data.
- Do not rerun `demo-bootstrap`, `demo-orgs`, `demo-reset`, rotate login secrets, or change a live tenant without a separately approved, tested runbook.

## Inventory: authenticated products and demo personas
- Source: `config/clients.demo.json`, **25** OAuth clients; `rag-gateway` is separately listed without a client.
- Source: `config/demo-personas.json`, per-product, single-job personas for learner, merchant, operator, institutional and staff flows.
- Identity already has validated issuer/audience/JWKS/tenant/roles checks, staff-only role metadata, strict role grants, per-tenant administration and user session revocation.
- Product implementations must prove their own API guards, not merely their dashboards. No general claim that all 25 products are deployed or certified.

## Critical source audit findings (not claims about current Contabo environment settings)

1. The shared `demo user` and `demo user2` are added to every listed role in each demo organization by `ensureDemoOrgs`; this is an **omnibus test identity**, inappropriate for an unrestricted prospect.
2. The identity login can present `demo-personas` from any product selected by the OAuth client. The current page uses a shared persona password (including staff personas), when `DEMO_SHOW_CREDENTIALS=1`. Hiding some personas in the UI **alone is not a security boundary**: separately protected passwords/accounts and server access enforcement are required.
3. `/admin` and privileged capabilities are intentionally real authorization surfaces in demo mode, so shared privileged demonstration credentials should be available only in a dedicated internal test environment.
4. Current `demo` mode prevents production use, but does not itself distinguish public prospects from staff testers or trusted institutional partners.
5. Do not assume a role displayed in the browser is authorized: both the signed product token and the actual tenant/role membership must be checked by product API.

Run `node scripts/audit-demo-access.mjs --json` for a read-only finding report. `--release-gate` returns nonzero while HIGH exposures exist. This does not access databases or secrets.

## User-facing access tiers — policy, not new user identities

| Tier | Visitor journey | Account/access condition |
| --- | --- | --- |
| Public | Existing landing page, Business Opportunities, public catalogue and verified public demo | No login; no backend mutation |
| Registered demo | Approved sample buyer/learner workflows | Verified shared ADS sign-in and product/tenant role; demo-only API |
| Qualified business | Merchant POS, processing company or business operator preview | Product/tenant role **and separate approved, expiring ADS demo entitlement** |
| Institutional partner | Restricted bank, regulator coordination and formal integration scenarios | Verified partner status, relevant product role and time-limited approved demo entitlement |
| ADS staff/admin | Review, permission grants, configuration, logs | Approved staff tenant, restricted nonpublic credentials, product-specific roles and grants |
| ADS engineer | Diagnostics and test hooks | Staff verification, explicit engineer role and sandbox only; no live data |

Do not assign one global ADS role that automatically grants access to all products. A staff member with Commerce access does not thereby administer Health, Investment or banking services.

## One canonical authorization decision

`packages/demo-access-policy/index.mjs` defines `evaluateDemoAccess(...)` and `validatePolicy(...)`. It defaults to **DENY**, except for explicitly public actions. The rule registry contains an initial Commerce-focused policy and release-disabled sample entries for Education and VentureWorks.

Input requirements:
- `identity` must come from **server-verified** signed ADS OIDC credentials and a live tenant/membership lookup. `productId` must match the product audience, `tenantId` must be an authorized organization workspace and `roles` are the current product-granted roles.
- `approval` must be fetched by the **product server**, from a separate operator-approved entitlement record, independently reviewed, bound to the same subject/product/tenant/action, non-revoked and within its time window.
- Client-provided JSON fields such as `verifiedByServer`, `approvedBy`, `roles` or `staffTenantVerifiedByServer` are **untrusted** and must never be passed directly into this evaluator.
- Underlying product RBAC, RLS, business audit and method-specific checks remain mandatory. The policy function grants only an additional preview entitlement, never permission to submit payments, bank transactions, government requests or change official data.

This shared library is **not integrated with production product APIs yet**. Merely importing it into a browser or adding menus would not secure anything.

## Rollout sequence — explicit independent gates

**Gate A: source inventory** — status partially completed here
- Audit all 25 client definitions and persona lists; record product IDs, role names, active verified demo routes and staff-only roles.
- Validate configuration with the policy utility and unit tests.
- Compare product API authorization to FRS and signed provider evidence, not to visual UI alone.

**Gate B: identity safety in isolated staging** — pending
- Separate publicly demonstrated account credentials from staff, checker, institutional and administrator identities. The shared all-role account must not appear on a public login.
- Move restricted personas to a nonpublic staff test identity/access process or separate demo set with distinct unrevealed secrets. Treat previously displayed credentials as compromised for any restricted-access use; rotate or retire safely in the isolated demo only, preserving production accounts.
- Add server-side policy enforcement and negative tests for accessing hidden/privileged persona credentials, wrong organization, forged role, revoked grant and replay.
- Verify standard OIDC login/callback, invite/approval, role updates, sign-out and sample-data isolation.

**Gate C: pilot Commerce product integration** — pending
- Keep public marketplace readable.
- Permit buyer-only demo with explicitly approved sample journeys.
- Require role + independent operator approval for merchant-owner, cashier/POS, bank and reviewer previews. Product API must return 403 for unauthorized actions even when a URL is guessed.
- Require test-mode transactions only, never real PSP settlement, real bank balances or legal fiscal invoices.
- Test desktop/mobile EN/FR and landing -> new tab -> hosted ADS sign-in -> product return -> original ADS tab intact.

**Gate D: other product onboarding** — pending
- Adopt the same contract product-by-product and require CI+browser evidence for each before enabling its demoUrl.
- Start with Commerce, then verified Education/VentureWorks and other platforms as they qualify; no automatic mass enrollment for all 25 products.

**Gate E: Contabo deployment** — pending
- Review main-branch CI, backup and rollback; never apply source-only policy without separate operator grant DB/provisioning and runbook.
- Enforce least-privilege service keys, auditable grant/revocation, timeouts, monitoring and no production/demo data mixing.
- Check permitted public pages remain public and that existing sign-in/Commerce endpoints continue unchanged.

## Existing Business Opportunities work
The 333 sector×digital-tool mappings and proposed institutional aggregation opportunities remain publicly discoverable **without** a login. The entitlement policy applies only when a user enters an approved authenticated **demo application**. This new branch deliberately does not modify portal pages, routes, asset bundles or catalogue records.

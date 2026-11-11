# ADS five-priority demonstration release — Contabo, 11 November 2026

**PREPARATION ONLY — not deployed or opened by merging this file.**

This wave includes **Commerce, Education, Agriculture (AfriNourish), Fleet Guard and Digital Tontine**, plus isolated ADS demo Identity and the ADS demo landing portal. **VentureWorks is excluded**, even though an existing wider release manifest lists it. The 25 catalogue entries are not 25 working demos. Five are prioritized for release; each is opened only after its own hosted QA passes.

## Exact source inventory

| Component | Verified merged source SHA | Gate or outstanding live action |
|---|---|---|
| Commerce | 7c40e214c6b364d075506d45eba06ac708c0a424 | Previously 7/7 QA personas pass. Preserve. Verify migration 125 ledger and localized fixture data; no automatic demo reset. |
| Education | bf4fb02e4c46ec370ade3cb461666b48ffac2135 | Previously 9/9 QA personas pass. Preserve. Check migrations 085/086. **Security finding:** public demo API receives EDUCATION_DEMO_SEED_DATABASE_URL (schema-owner credential); remedy/approve before broader activation. |
| Agriculture | 7c6d8db8c3f0685f527d334507cabedd7356a54b | Promote approved source. Six working roles; four additional roles deliberately "Coming soon". Verify isolated seed worker and run read-only scripts/check-demo-explorer.mjs. |
| Fleet Guard | f73bfb3c0659eeeeaf2658225161ab2d9a4c77ec | Source tests green. Live 404 indicates demo flag off: the **env-file variable** read by Compose is FLEET_DEMO_ACCESS=1, which maps into FLEETGUARD_DEMO_ACCESS. Confirm Identity secret/issuer and start the private demo-seed-worker; public API must not receive owner DB URL. |
| Digital Tontine | b2ed5240bb9825265a4d3b1aabb792f850d9f9c9 | PRs #42 and #43 merged on Nov 11. Promote only after Contabo isolated restore, 23 migration checksums, restricted login RLS, mock/record-only payout proof, private worker, seven listed roles and two helper roles browser QA. No live money movement. |
| ADS demo Identity / portal | Kit main was 6eb6428cf5679e737cfd26422b113e184e1bbda2 when this plan was prepared | **Re-pin both to the *final approved merge SHA of this portal PR*** for image publication. Do not use older kit SHA 119eb340 for new portal features. Keep private Identity mode and current QA grants. |

Use immutable, verified Docker image SHA/digest and retain the current live image for rollback. **The old seven-service manifest and superseded five-demo workflow are not valid launch commands for this scoped wave.**

## Sequence and ownership

### 1. Source and release acceptance
Owner reviews and merges this PR only after portal/Kit tests pass. Obtain exact new Kit main SHA, record GHCR/locally built image digest, validate the five product pins, and agree which images actually need replacing. Do not recreate Commerce/Education merely to make every app deploy in one batch.

### 2. Read-only preflight on Contabo
Verify the actual host is vmi3191089, live container names and services, loopback bindings, Nginx, disk, image IDs, health, isolated Identity issuer, and QA account grants. From the correct merged Kit checkout (paths may differ on the host), use:

    bash deploy/contabo-demo/release-acceptance.sh --plan
    bash deploy/contabo-demo/release-acceptance.sh --product commerce
    bash deploy/contabo-demo/release-acceptance.sh --product education
    bash deploy/contabo-demo/release-acceptance.sh --product agriculture
    bash deploy/contabo-demo/release-acceptance.sh --product fleet-guard
    bash deploy/contabo-demo/release-acceptance.sh --product digital-tontine

Image pin checks are expected to fail *before* a new image is promoted; record failures by category rather than ignoring them. If the command's container-name assumptions differ from actual Compose labels, stop and correct the plan, not the database. Print secret **presence** only; never secret values.

### 3. Protected backup and isolated restore
Before any Identity/client-registration DB write, migration, seed or application swap, save root-only backups plus an isolated restore verification for each affected DB, retaining previous images, env backups and the current audit/grant records. No --reset for Commerce or other products unless expressly authorized with a separate demo-data loss decision. Never use docker compose down -v or prune.

### 4. Identity (only necessary reviewed updates)
Deploy isolated ADS demo Identity **only if** the approved Kit version is needed for current product callbacks/private grants. Preserve the working issuer, signing keys, user accounts, grants, all client secrets, DEMO_ACCESS_PRIVATE_ENABLED=1 and DEMO_ACCESS_ENABLED=0. Never rerun demo-bootstrap or the generic apply-clients script against every product. If live OAuth registrations drift, use the Kit's specific register-identity-client.sh after Identity backup to apply **only the affected client**. Regression-test Commerce and Education sign-in.

### 5. Products (least disruptive order)
- **Commerce:** QA already passed. Keep the current product available; promote pinned web/API only for required localized content fixes after approval. Migration 125 and data refresh require explicit verification and separate authorization. E-commerce and POS remain one Commerce platform, not two extra deployed platforms.
- **Education:** preserve passing experience; do not expose the owner's seed DB credentials through the public API. Treat this as an opening blocker until repaired or security sign-off states otherwise.
- **Agriculture:** promote pinned main with the worker separated from public API, preserve previously seeded visitor data; check Explorer and six functional persona homes at EN/FR.
- **Fleet Guard:** set FLEET_DEMO_ACCESS=1 in the *actual* Fleet Guard env file. Confirm FLEET_DEMO_ACCESS_IDENTITY_URL and matching FLEET_DEMO_ACCESS_CHECK_SECRET, start internal worker profile and recreate Fleet Guard service only, with no public worker port. Signed QA persona GET and prepare POST must return 200, not 404.
- **Digital Tontine:** verify 23 migrations/DB restore and mock/record-only maker-checker before swapping app+worker at the pinned merge SHA; no real providers or payout custody. Verify seven roles + two fictional helpers, three workspaces, one payout awaiting approval and tenant isolation.

### 6. Live browser QA, THEN portal LAST
For each product: portal entry -> /demo introduction (EN/FR) -> ADS Identity sign-in -> /demo/personas -> role choice and role switch -> populated workspace -> sign out -> ADS home. Test desktop 1280 and phone 360, grant expiry/no-access, tenant isolation and a returning user. Require release-acceptance.sh PASS after promotion and record deployed SHA/image digest, rollback route and owner approval.

Promote new **portal image last** and set activation on the owner-controlled /etc/ads-demo/portal/demo-activation.json only for products that passed live QA:
- commerce: existing verified demoUrl (not an activation-file key);
- education, agriculture, digital-tontine, fleet-guard: change their key from preparing to open **individually as approved**;
- ventureworks: keep preparing (excluded).

Check that /, /platforms and /demo-access prominently show all five, that the other 20 remain browseable, that the open count is based on actual activation, and that visitors receive **no passwords**, shared QA credentials, or public request form. If a product fails, its card must remain preparing.

### 7. Rollback
Return only the failed app to its prior pinned compatible image after schema-compatibility checks; do not automatically roll back Identity or overwrite any database. Close only the affected portal activation entry (open -> preparing). Preserve existing working demo sessions as far as possible. Document the exact error, host/container, release image and acceptance result.

## Operating verdict
**Current stage: source preparation.** No Contabo deployment, migration, reset, password change, OAuth registration update or portal activation is performed by this PR. Owner/operator approval and positive live acceptance are still mandatory.

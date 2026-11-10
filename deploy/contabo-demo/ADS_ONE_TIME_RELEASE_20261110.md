# ADS — one coordinated Contabo demo release (10 November 2026)

**Status: release package prepared; deployment NOT executed or authorized.** This file and `ads-release-20261110.manifest.json` pin all merged, CI-verified source changes. **One-time** means a single coordinated maintenance window, not that GitHub CI automatically deploys, migrates or creates accounts.

## Exact source snapshot
| Sequence | Component | GitHub repository | Pinned merged commit |
|---|---|---|---|
| 1 | Isolated ADS demo Identity | `ksondo/ads-platform-kit` | `119eb34017029817eb237230649735a3395c5864` |
| 2 | Commerce web/API/migrator | `ksondo/ADS-Commerce-Platform` | `7c40e214c6b364d075506d45eba06ac708c0a424` |
| 3 | Education | `ksondo/Education-and-intelligent-services` | `bf4fb02e4c46ec370ade3cb461666b48ffac2135` |
| 4 | Agriculture (AfriNourish) | `ksondo/Agriculture` | `7c6d8db8c3f0685f527d334507cabedd7356a54b` |
| 5 | Fleet Guard | `ksondo/Fleet-guard-and-intelligent-services` | `f73bfb3c0659eeeeaf2658225161ab2d9a4c77ec` |
| 6 | ADS landing/demo portal, LAST | `ksondo/ads-platform-kit` | `119eb34017029817eb237230649735a3395c5864` |

**Excluded:** Tontine PR #42 is a draft awaiting full E2E, protected backup/isolated restore and independent financial/security signoff. Do not silently use the old Tontine SHA from `batch-release.manifest.json`. The next release revision may add it only after certification.

**Important:** The existing `contabo-five-demo-release.yml` workflow is NOT an executable workflow for this six-service package: it *requires* Tontine, omits Commerce and Identity, and uses an older five-SHA manifest. Do not dispatch its `deploy` operation for this release. A separate reviewed workflow/host-side coordinator is needed for a true one-click deployment; until then execute the approved existing per-service runbooks **within one protected operator window**, with an explicit STOP on any failed gate.

## Operator preflight (read-only; before any release writes)
On the actual Contabo server, with an authorized SSH session:
```bash
hostname -s
docker compose version
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
nginx -t
df -h /
```
Verify the host is `vmi3191089`, the actual Docker Compose project and service labels, loopback ports (do **not** assume defaults), Identity callback URLs, current DB roles, image digests and protected env-file locations. Confirm the exact five source commits above are present on `origin/main` and record their immutable GHCR digests. Do not alter the legacy Software Factory Identity, its networks, any public database port, real payment provider, or unrelated services.

## Controlled release order — operator-only, STOP on first error
1. **Freeze and record current state.** Coordinate with the portal-owner release controller, record running image digests and application health, confirm server capacity, and obtain authorized human review of the shared OIDC/refusal redirect and all product isolation rules.
2. **Back up and restore-test FIRST.** Take protected backups of every affected existing demo DB, especially Commerce and isolated ADS Identity; demonstrate restore to an isolated database before updating. Retain old images, env files, database volumes and nginx configuration. Never use `docker compose down -v` or `prune`.
3. **Commerce schema gate.** Apply only the forward migration `db/migrations/125_product_names_en_fr.sql` via the pinned Commerce migration image, *after* backup and *before* starting the new Commerce API. The reviewed `deploy/demo/compose.yml` command is:
   ```bash
   docker compose --env-file /etc/ads-demo/commerce.env -f deploy/demo/compose.yml --profile migration run --rm migrate
   ```
   Run from the pinned Commerce checkout. Check the two nullable names, length constraints, preserved older rows and continued RLS. Migration 125 does **not** rewrite existing product names or historical order snapshots.
4. **Isolated demo Identity, then Commerce.** Verify that the tested Kit `119eb340...` Identity image has been published; review protected `/etc/ads-demo/identity.env`, `/etc/ads-demo/images.env`, registered exact callback URIs and issuer. Use the reviewed `deploy/contabo-demo/deploy-identity.sh` from the pinned Kit checkout, then verify local health and private OIDC. Run the Commerce deployment in `deploy/demo/DEPLOYMENT_GATE.md` using **matching same-SHA web/API/migrator images** and mock providers only; check `/api/ready`, sign-in, no-access and POS. Do not bootstrap an already configured Identity database again.
5. **Explicit demo sample refresh if approved.** Only after protecting existing Commerce demo activity, use the approved `deploy/demo/DEMO_DATA.md` `demo-seed --reset` operator command. This deletes/replaces *demo* POS/cash activity, restores seeded catalogue names in separate EN/FR columns and retains old buyer-order snapshots. It is not a no-op and must never run against production.
6. **Education, Agriculture, Fleet Guard.** Use the reviewed product-specific Docker/Compose runbooks at exactly the pinned SHAs. Confirm Education migrations 085/086 and sample seed before app update; isolate Agriculture privileged seed workers; coordinate Fleet Guard with the new Identity error callback in this same release. No new ports or passwords are inferred from old runbooks. Check each local `/health` or `/ready` and the current host Nginx/TLS route before proceeding.
7. **ADS portal LAST.** Only after all preceding services pass, switch `ADS_PORTAL_IMAGE` to the pinned Kit SHA and use the reviewed `deploy/contabo-demo/deploy-portal.sh` (or its protected operator-approved alternative). Retain existing public links and keep unverified demo entries disabled until live acceptance is recorded.
8. **Live acceptance and handoff.** Test EN/FR at 360/768/1280, keyboard and 200% zoom, real OIDC callbacks, persona switching, missing/expired/revoked grants, strict cross-tenant refusal, Finance mock-only behavior, product-name language and Commerce stock/order flows. Provision QA/partner accounts **only for confirmed identities**, via the documented operator CLI, storing generated credentials in owner-only host files; no secrets in GitHub, chat or logs.

## Rollback
Stop immediately on failed service or identity/tenant checks. Before a schema change, an application-image rollback may be sufficient. **After migration 125, never assume old application images remain schema-compatible**; preserve the backups and use a separately approved recovery strategy. Do not automatically restore an old DB over new data. Portal goes last so public entry points remain intact if a product fails.

## Release gate record
- [ ] Protected snapshots + isolated restore verification
- [ ] Owner/operator and independent shared-Identity/security approval
- [ ] Immutable image digests checked; old images retained
- [ ] Commerce migration 125 verified against isolated demo DB
- [ ] Each product upgraded and local + HTTPS checks passed
- [ ] Fleet Guard new `access_denied` callback and no-loop checks passed
- [ ] Approved Commerce demo reset and financial mock-mode only
- [ ] EN/FR, permissions, tenant isolation and partner/QA acceptance passed
- [ ] Portal promoted last and rollback evidence archived

**Handoff:** All boxes start *unchecked*. Source CI and successful merges do **not** constitute actual Contabo preflight, database restore, deployment, account provisioning or live acceptance. This manifest is **not** the input contract for the older five-demo workflow.

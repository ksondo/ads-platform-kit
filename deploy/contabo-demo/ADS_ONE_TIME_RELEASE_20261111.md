# ADS — one coordinated Contabo demo release (11 November 2026)

**Status: release package prepared; deployment NOT executed or authorized.** This file and `ads-release-20261111.manifest.json` supersede the 10 November revision ([`ADS_ONE_TIME_RELEASE_20261110.md`](ADS_ONE_TIME_RELEASE_20261110.md)). The pins of that revision are unchanged; Digital Tontine moves from "excluded until certified" into the pinned sources and VentureWorks is added. **One-time** means a single coordinated maintenance window, not that GitHub CI deploys, migrates or creates accounts.

## Exact source snapshot
| Sequence | Component | GitHub repository | Pinned merged commit |
|---|---|---|---|
| 1 | Isolated ADS demo Identity | `ksondo/ads-platform-kit` | `119eb34017029817eb237230649735a3395c5864` |
| 2 | Commerce web/API/migrator | `ksondo/ADS-Commerce-Platform` | `7c40e214c6b364d075506d45eba06ac708c0a424` |
| 3 | Education | `ksondo/Education-and-intelligent-services` | `bf4fb02e4c46ec370ade3cb461666b48ffac2135` |
| 4 | Agriculture (AfriNourish) | `ksondo/Agriculture` | `7c6d8db8c3f0685f527d334507cabedd7356a54b` |
| 5 | Fleet Guard | `ksondo/Fleet-guard-and-intelligent-services` | `f73bfb3c0659eeeeaf2658225161ab2d9a4c77ec` |
| 6 | Digital Tontine (PR #43) | `ksondo/Digital-tontine-and-intelligent-services` | `b2ed5240bb9825265a4d3b1aabb792f850d9f9c9` |
| 7 | VentureWorks (PR #102) | `ksondo/africa-digital-synergy-ventureworks` | `3744e3c86fccb9ce3a570be1634e23506dcc6726` |
| 8 | ADS landing/demo portal, LAST | `ksondo/ads-platform-kit` | `119eb34017029817eb237230649735a3395c5864` |

**Kit re-pin before relying on the new Identity and portal behaviour.** Identity and portal stay at `119eb340…` as in the 10 November package. VentureWorks private visitors (`--platform ventureworks`), the `ventureworks-web` and `tontine-web` no-access return, the VentureWorks portal destination and the operator activation mount ship in the kit pull request that adds this file. Re-pin both kit rows to that pull request's merge commit in a reviewed revision before using them live.

**Superseded tooling.** `batch-release.manifest.json`, `batch-release.py` with it (and therefore the manual `contabo-five-demo-release` workflow) and `build-staged-demo-images.sh` pin stale SHAs. They are kept as provenance and refuse to run with a `SUPERSEDED` message.

## Identity, keys and secrets (names only)
| Product (portal id) | Demo Access key | Identity client | Identity check secret | Product switch |
|---|---|---|---|---|
| `commerce` | `commerce` | `commerce-web` | `DEMO_ACCESS_CHECK_SECRET_COMMERCE` | `COMMERCE_DEMO_ACCESS` |
| `education` | `education` | `education-web` | `DEMO_ACCESS_CHECK_SECRET_EDUCATION` | `EDUCATION_DEMO_ACCESS` |
| `agriculture` | `agriculture` | `agriculture-web` | `DEMO_ACCESS_CHECK_SECRET_AGRICULTURE` | `AGRICULTURE_DEMO_ACCESS` |
| `fleet-guard` | `fleet-guard` | `fleet-guard-web` | `DEMO_ACCESS_CHECK_SECRET_FLEET_GUARD` | `FLEETGUARD_DEMO_ACCESS` |
| `digital-tontine` | `tontine` | `tontine-web` | `DEMO_ACCESS_CHECK_SECRET_TONTINE` | `TONTINE_DEMO_ACCESS` |
| `ventureworks` | `ventureworks` | `ventureworks-web` | `DEMO_ACCESS_CHECK_SECRET_VENTUREWORKS` | `VENTUREWORKS_DEMO_ACCESS` |

Identity runs in private mode (`DEMO_ACCESS_PRIVATE_ENABLED=1`, `DEMO_ACCESS_ENABLED=0`). Both `tontine-web` and `ventureworks-web` list their `.demo` callback and post-logout addresses in `config/clients.demo.json`.

## Controlled release order — operator-only, STOP on first error
Steps 1–6 of the 10 November revision apply unchanged (freeze, backup and restore test, Commerce migration 125, Identity then Commerce, approved demo refresh, Education/Agriculture/Fleet Guard). Then:

7. **Digital Tontine, then VentureWorks.** Use each product's reviewed `deploy/demo` runbook at exactly the pinned SHA, after a protected backup and isolated restore of its database. VentureWorks: `migrate`, `runtime-login`, then `demo-seed` (run-once jobs), then the `ventureworks` service; keep `VW_DEMO_ACCESS` empty until Identity has `DEMO_ACCESS_CHECK_SECRET_VENTUREWORKS`. Tontine: keep its seed worker paired with `TONTINE_DEMO_ACCESS=1`. Mock money only.
8. **Identity clients.** If `release-acceptance.sh` reports client drift, fix one client at a time with `register-identity-client.sh` (RUNBOOK §E3.1), after the Identity backup.
9. **Acceptance per product.** Run `bash deploy/contabo-demo/release-acceptance.sh --product <id>` (RUNBOOK §G1). Every line must be PASS (INFO lines are notes).
10. **Portal LAST.** Promote the portal image, then open accepted products one by one in `/etc/ads-demo/portal/demo-activation.json` (RUNBOOK §G2). Keys are exactly `education`, `agriculture`, `digital-tontine`, `fleet-guard`, `ventureworks`.

## Rollback
As in the 10 November revision. For the portal: set the product back to `preparing` or delete the host activation file. Never auto-restore an old database over new data.

## Release gate record
- [ ] Kit Identity/portal re-pinned to the merge of the kit PR carrying this file
- [ ] Protected snapshots + isolated restore verification (Identity, Commerce, Tontine, VentureWorks and each modified product)
- [ ] Owner/operator and independent shared-Identity/security approval
- [ ] Immutable image digests checked; old images retained
- [ ] `release-acceptance.sh` all PASS for each product before it is opened
- [ ] Portal activation file switched product by product; rollback evidence archived

**Handoff:** All boxes start unchecked. Source CI and merges do **not** constitute Contabo preflight, restore, deployment, account provisioning or live acceptance.

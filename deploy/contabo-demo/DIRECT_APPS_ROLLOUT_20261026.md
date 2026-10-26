# ADS direct GitHub → Contabo deployment of seven additional demo apps (26 October 2026)

## Scope and confirmation

This package follows the existing **individual application** deployment method documented under `deploy/contabo-demo/` for the ADS landing portal and Commerce. It does **not** deploy any central orchestration product or create a new deployment service.

Existing public applications, to preserve unchanged during preparation:
- `https://demo.africadigitalsynergy.com` (landing portal; currently configured to proxy localhost port 18089).
- `https://commerce.demo.africadigitalsynergy.com/commerce` (Commerce web/API; localhost 18086).
- `https://login.demo.africadigitalsynergy.com` (isolated demo identity; localhost 18090).

Seven targets, each independently deployed on the same VPS (`vmi3191089`, `161.97.128.153`):

| App | Repo | DNS/HTTPS address | Existing release building blocks |
| --- | --- | --- | --- |
| Education | `ksondo/Education-and-intelligent-services` | `education.demo.africadigitalsynergy.com` | `deploy/compose.education-staging.yml` (web/API), PostgreSQL and seed |
| Fleet Guard | `ksondo/Fleet-guard-and-intelligent-services` | `fleetguard.demo.africadigitalsynergy.com` | `Dockerfile.api` (web + API), PostgreSQL and seed |
| Home Services | `ksondo/Home-Services` | `home-services.demo.africadigitalsynergy.com` | `src/server.mjs` (web/API), migrations + seed; isolated Docker packaging required |
| MamaCare | `ksondo/Mama-care-and-intelligent-services` | `mamacare.demo.africadigitalsynergy.com` | `Dockerfile` (web + API), migrations + seed |
| Morphoo | `ksondo/go-ahead-guesser` | `morphoo.demo.africadigitalsynergy.com` | `deploy/compose.prod.yml` (web/API/RAG/worker/db), but **must adapt** host port 18089 already used by portal, avoid existing 18090 identity; inspect DB version and network |
| Digital Tontine | `ksondo/Digital-tontine-and-intelligent-services` | `tontine.demo.africadigitalsynergy.com` | `Dockerfile.api`, DB separate API/webhook/worker logins, seed; 26-Oct E2E 128 pass/4 fail after reset |
| VentureWorks | `ksondo/Africa-Digital-Synergy-VentureWorks` | `ventureworks.demo.africadigitalsynergy.com` | `deploy/wp-b/Dockerfile.api`, existing staging runtime path `/opt/ads/ventureworks`; inspect before any new deployment |

## Direct run from Contabo SSH (NO SCP)

The original on-host checkout is expected at `/opt/ads/demo-platform-kit`; check it exists first and do not reset or overwrite it.

```bash
ssh root@161.97.128.153
test -d /opt/ads/demo-platform-kit/.git
git -C /opt/ads/demo-platform-kit remote -v
git -C /opt/ads/demo-platform-kit fetch origin refs/heads/ops/direct-contabo-seven-apps-20261026
git -C /opt/ads/demo-platform-kit worktree add --detach /opt/ads/direct-app-rollout FETCH_HEAD
cd /opt/ads/direct-app-rollout
bash deploy/contabo-demo/direct-apps-preflight.sh | tee /root/ads-direct-apps-preflight.txt
bash deploy/contabo-demo/stage-direct-apps.sh --plan
```

Only after reviewing the report and confirming GitHub SSH access:

```bash
bash deploy/contabo-demo/stage-direct-apps.sh --stage
```

The staging command clones only seven GitHub source trees under `/opt/ads/demo-rollout-sources/`, pins each to its currently fetched SHA, and **does not** run migrations, create or change databases, start containers, alter Nginx, request certificates or publish URLs.

If the worktree path already exists, check its status and version instead of recreating it. If the VPS does not have access to all private repositories, stop and adjust the existing deploy key or approved GitHub App access on the VPS (never paste credentials into chat). If the active portal checkout is not at the documented path, inspect it first and replace that path with the real cloned kit checkout.

## Per-app release procedure after the read-only inspection

For every new platform, perform all of these individually:

1. **Review source release:** Select a green commit (not just the latest main); record exact 40-character SHA, test evidence and Docker image digest. Do not automatically deploy an unreviewed HEAD.
2. **Isolation:** Assign a distinct Compose project, internal Docker network and unique loopback-only web port after checking `ss` and `docker ps`. Preserve 18086, 18089, 18090 and every existing allocation.
3. **Database:** Create an app-specific PostgreSQL database/volume and separate owner, runtime and special-role logins required by the application; retain passwords in root-owned protected files under `/etc/ads-demo`, never GitHub or chat. Back up before forward-only migration. Verify schema, roles, RLS and tenant isolation.
4. **Application:** Build each app's approved Dockerfile, or add missing safe packaging through that app's own GitHub PR. Set `ADS_ENV=demo`, `DEMO_MODE=1` as appropriate and mock external providers; do not send real money, SMS, identity, medical, insurance or financing events.
5. **Shared sign-in:** Reuse exactly `https://login.demo.africadigitalsynergy.com` as issuer. Register each app's exact HTTPS redirect URI with the existing demo identity, and configure intended client id and RLS role/persona/tenant.
6. **Seed:** After migrating, run that specific app's reviewed demo-seed command with `ADS_ENV=demo` and `DEMO_MODE=1`. Do not automatically run `--reset` against testers' data.
7. **Local smoke:** Verify API health, web root, static assets, seeded records, authentication, staff roles and cross-tenant denial at localhost before routing publicly.
8. **DNS/HTTPS:** Verify A records for the app's hostname point to 161.97.128.153, check host Nginx has no conflicting `server_name`, stage separate ACME HTTP-01 server, obtain a hostname-matching Let's Encrypt cert, install an isolated HTTPS reverse proxy to its loopback-only port, test `nginx -t` before reload, verify public certificate without `curl -k`.
9. **Portal link:** Only after public browser acceptance, update the matching `platforms[].demoUrl` and `availability=verified_demo` in `ads-platform-kit/apps/demo-portal/catalogue.json`, then validate and publish the **portal alone** through its existing approved image release. Preserve the Commerce URL and POS tool URL.
10. **Evidence and rollback:** Record DB backup paths, migration versions, source SHA, image digest, Nginx config backup, tested user journeys (EN/FR and mobile/desktop), and rollback for each app. Roll back only the changed app/portal image, never unrelated containers.

## Known per-app blockers / non-assumptions

- Morphoo's existing `deploy/compose.prod.yml` binds `127.0.0.1:18089`, directly colliding with the portal. Its RAG gateway also uses internal port 18090; isolated private networks can reuse an internal port, but the existing public login host port must remain untouched. Inspect its preconfigured external Docker network, PostgreSQL version, runtime dependencies and credentials first.
- Home Services has no top-level Dockerfile as of this check; build a safe container package or use an isolated systemd/node service, without changing the already-running software.
- Education's Compose relies on protected DB/worker/webhook URLs and exact build-time OIDC values; a static web image alone is not a deployed Education backend.
- Tontine's latest 26-Oct demo-journey CI reported 4 failing cooperative-group checks after reset. Stage code, but do not mark the affected journey as certified.
- VentureWorks has a separate staging configuration; look for its actual containers and existing DB migrations before changing it.
- Some runtime services reject mock configuration under `NODE_ENV=production`. Choose reviewed demo settings in each app and do not weaken the production security gates merely to start the demo.
- The portal's current GitHub catalogue is **not** proof of a live application: its seven new platform links are `null`/coming soon. Preserve the Commerce link: `https://commerce.demo.africadigitalsynergy.com/commerce`; POS: `https://commerce.demo.africadigitalsynergy.com/commerce/merchant/pos`.

## Final portal regression acceptance

From the **public** `https://demo.africadigitalsynergy.com` landing page:
- Open `/platforms`, then each `/platforms/<id>`, launch the intended app in a separate tab, sign in with existing ADS demo Identity, navigate one real database-backed journey, use logout/switch-account.
- Recheck Commerce marketplace, shop pages, POS, direct deep-link refresh, product images and existing demo accounts after every portal publish.
- Validate HTTP→HTTPS, TLS chain/hostname, security headers, private DB ports not publicly exposed and EN/FR 360/768/1280 browser behavior.
- Only publish platform links after passing. Record PASS/FAIL/NOT_RUN with evidence rather than calling source CI a hosted deployment.

**This change adds an operator preflight and source staging only; it does not itself deploy databases, Docker services, Nginx or HTTPS.** Those actions require the on-host inventory and app-specific configs to avoid collateral damage.

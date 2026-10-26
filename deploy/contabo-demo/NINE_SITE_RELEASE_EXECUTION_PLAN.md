# ADS Nine-Site Direct Contabo Release — Execution Plan

**Date:** 26 October 2026 | **Host:** `vmi3191089` / `161.97.128.153` | **Release type:** DEMO ONLY

## Objective
From one authenticated Contabo SSH terminal command, run a reviewed **all-in-one release coordinator** sourced from `ksondo/ads-platform-kit`. The coordinator executes the proven **approved SHA -> git fetch -> ancestry validation -> immutable git archive -> app-specific backup/migration -> private canary -> promote -> verified HTTPS -> portal last** method.

**Scope:** Update Commerce; deploy five new demo apps (Education, Fleet Guard, Home Services, MamaCare and Digital Tontine); verify and securely publish two already-running apps (VentureWorks and Morphoo); update the landing portal **last**. Keep the existing isolated demo Identity, public Business Opportunities API and all unrelated software unchanged. Nothing in this plan deploys Software Factory.

## Baseline evidence from Contabo operator preflight

- VPS disk: 193 GB total, 106 GB available; memory: 11 GiB total, 5.9 GiB available, 4 GiB swap (snapshot on October 26, not reserved capacity).
- Healthy Landing web `ads-demo-portal` bound to `127.0.0.1:18089`; Commerce web/API at `127.0.0.1:18086` with separate healthy database; isolated demo Identity at `127.0.0.1:18090`; business directory at `127.0.0.1:18190`.
- Existing VentureWorks staging web at `127.0.0.1:18480`, plus healthy API and DB. Existing Morphoo web at **publicly bound** `0.0.0.0:18100`, plus healthy API, RAG gateway, worker and database. Do not apply Morphoo's current source Compose host port 18089: it conflicts with Landing.
- All nine listed public A records point to `161.97.128.153`. HTTPS verified for Landing, Commerce and demo Identity. The other seven names return certificate validation error 60 (not proven live).
- Public portal catalogue still marks the seven new application links `coming_soon` / `demoUrl: null`; Commerce points to `/commerce`. Root GitHub SSH access test succeeded for `go-ahead-guesser` but failed for the six other repositories.
- The server hosts many other Docker services; do not rely on any assumed free port, memory headroom for seven simultaneous builds, or Docker pruning.

## Deployment manifest

`release-nine-manifest.json` is the source-of-truth **plan**, not approval. All `releaseSha` and `releaseScript` values remain `null` until the actual app-level release implementation is reviewed and accepted. No branch-head or CI-only unmerged SHA should be treated as approved by default.

Delivery order (logical, one master command, serialized application promotions):

| Order | Component | Work | Dependency/gate |
| --- | --- | --- | --- |
| 1 | Commerce | Verify fixes included in selected SHA, backup, migrate if needed, private canary, promote, check shops/POS | Existing portal & Identity still green |
| 2 | Education | Isolated Postgres; owner/worker/webhook DB roles, migrations, API/web, seed, OIDC | Approved demo commit; private network |
| 3 | Fleet Guard | Isolated Postgres, migration, web/API, seed and role checks | Approved demo commit; runtime DB role/RLS |
| 4 | Home Services | Add reviewed Docker packaging, isolated Postgres, migration, web/API, seed | No top-level Dockerfile at baseline |
| 5 | MamaCare | Isolated Postgres, migration, web/API, seeded fixture content | No real patient records/providers |
| 6 | Digital Tontine | Separate app/webhook/worker DB roles; migration and guarded demo seed | Four post-reset cooperative journeys failed on Oct 26; resolve or explicitly exclude while unlisted |
| 7 | VentureWorks | Reuse healthy staging web/API/DB; verify migrations and exact image SHA, sign-in, HTTPS; update only if approved | Do not overwrite existing data/staging by default |
| 8 | Morphoo | Reuse existing API, RAG/worker/web/DB; secure 18100 exposure; publish HTTPS; update only if approved | Do not reuse occupied 18089/18090 on host |
| 9 | Landing portal | Publish exact URLs of **all seven verified applications**, retain Commerce POS links, smoke and browser regression | LAST, only after every required application gate is green |

## Sequential gates

### G0 — Freeze a release
- Identify nine **approved, immutable 40-character SHAs**, including Commerce latest accepted fixes and the portal catalogue change. Store reviewed SHAs in the manifest. For applications with passing CI on PR branches, merge or explicitly approve a deployable commit before freezing; passing PR CI is not proof the fixes are on main.
- Require all required application-level checks green for the selected SHA; record exceptions explicitly, do not label incomplete demo journeys certified.
- Validate that the portal target URLs in the release candidate are exact hostnames and safe same-origin/`noopener` launches; Commerce must remain `https://commerce.demo.africadigitalsynergy.com/commerce` and POS `/commerce/merchant/pos`.

### G1 — Infrastructure and GitHub access
- Run existing read-only preflight, inspect storage/RAM/port claims and health. Solve six failing GitHub read permissions with scoped read-only deployment keys or an already approved SSH identity; **never print/share tokens or keys**.
- Choose new unallocated **127.0.0.1-only** host ports for five new web services after `ss -ltn` and Nginx site inspection. Preserve existing host port allocations.
- Verify DNS authoritative A records for every public hostname; verify Nginx virtual host ownership and no duplicate `server_name` in the active configuration.

### G2 — Backups, database, Identity and security
- Record backup/restore validation for all existing apps before any migration, and snapshot each new database before later forward-only migrations. Database owner/migrator and runtime service roles must be separate, without runtime BYPASSRLS; check tenant isolation.
- Use app-isolated Docker networks, separate DB volumes/databases and root-owned `/etc/ads-demo` runtime secrets (`0600`, directory `0700`). Never share production data, live payment providers, real patients, production authentication keys or the existing identity DB.
- Register each exact HTTPS OAuth2+PKCE redirect URI with `https://login.demo.africadigitalsynergy.com`, then exercise valid, denied and expired session paths.
- Demo-only providers/mocks. Any script requiring `ADS_ENV=demo`, `DEMO_MODE=1` must use both; do not weaken source runtime checks or reuse production settings.

### G3 — Build, canary, migrate and promote individually
- Each app has an in-repository shell release script accepting `--check`, `--deploy`, `--verify`, `--rollback`; a separate master coordinator calls these. The controller must obtain a release lock, fetch/verify approved SHA, stage with git archive, test script syntax, verify backup, migrate forward-only, privately smoke the candidate and promote only that app.
- Use **staging-before-promotion**: test build/canary and rollback readiness prior to changing the public app. Respect available RAM/disk; process sequentially, not seven concurrent builds.
- Every app runs its official guarded idempotent demo seed AFTER migrations. Never run destructive `--reset` implicitly. Record source SHA, image digest, migration number, backup path, health result and demo persona tests.

### G4 — HTTPS publication and certification
- Start from an isolated loopback backend; stage host-specific Nginx/ACME, obtain and verify Let's Encrypt full-chain certificate, `nginx -t`, then reload only host Nginx. Never use `curl -k` to call a certificate valid.
- Confirm port 80 redirects to HTTPS, correct hostname+certificate, SPA deep-link refresh, API paths, security headers, network/DB ports not publicly reachable, OIDC flow and EN/FR responsive layouts.
- Treat Morphoo public `18100` exposure as a separate security finding requiring an approved safe containment change before marking its hostname released.

### G5 — Portal publication LAST
- Prepare and test an updated portal catalogue with exact verified URLs for Education, Fleet Guard, Home Services, MamaCare, Digital Tontine, VentureWorks and Morphoo. Preserve Commerce and POS addresses and links.
- Publish only after **all required** release checks succeed. If a new platform is intentionally excluded due to a blocker, record a revised release scope; do not silently claim all nine websites launched.
- Launch via the actual landing portal, confirm each app opens and signs in, role-driven journeys work, and Commerce marketplace/shops/POS remain accessible.

### G6 — Evidence and recovery
- Write an operator release report and structured JSON summary to protected paths under `/var/lib/ads-demo`; include PASS/FAIL/NOT_RUN, UTC timestamp, SHAs, image digests, migration versions, TLS details and backup locations (not secrets).
- On any failure **before portal publication**, stop further deployment, keep the existing landing catalogue unchanged, and retain healthy already-promoted independent applications without advertising incomplete URLs. Restore only the failing app's known-good image where appropriate.
- Never automatically roll back forward-only DB migrations, delete volumes or run `docker system prune`; any database restore requires separate explicit authorization and integrity checks.
- Repeatable master reruns must compare the recorded SHA and exact app health and skip already verified stages. Avoid merging a PR or updating an app during an active release.

## One command UX (target state, not yet executable)

1. Operator connects to Contabo using SSH.
2. A minimal guarded launcher fetches the approved **master** SHA from `ksondo/ads-platform-kit` using the already configured portal checkout, tests its ancestry to `origin/main`, archives it into `/var/lib/ads-demo/releases/<master-sha>` and checks the coordinator syntax.
3. Operator executes `bash /var/lib/ads-demo/releases/<master-sha>/deploy/contabo-demo/release-nine-demo-apps.sh --apply`.
4. The master invokes app-specific releases in manifest order, gathering evidence; publishes the portal last.

**Current implementation limit:** The committed coordinator supports `--plan` and `--preflight` only. It intentionally refuses `--apply` until all per-app scripts and gates are installed, tested and the release manifest is populated with approved SHAs. Running plan or preflight is not a live deployment.


## Source staging and image-build checkpoint (26 October)

Operator confirmed six private repositories' read-only deploy key access and direct Git cache initialization. The five new app sources were staged using checked main-ancestor, immutable SHA git archives:

| Application | Pinned source staged on Contabo | Candidate image |
| --- | --- | --- |
| Education | b3202c70d926599793fc0c4957d49c4eb255d847 | API Dockerfile available; web image needs approved OIDC build inputs |
| Fleet Guard | ce3a4883862104e05a4fafd3da023089c5f46052 | Dockerfile.api available |
| Home Services | 8eee741b0181b5ab7d21cd51d58918c97d0c1619 | Existing pinned SHA lacks Dockerfile; see Home-Services PR #11, then stage a NEW approved SHA |
| MamaCare | c8cb4d2aa0e11d62f6c2a24c485df6c06fbdb573 | Dockerfile available |
| Digital Tontine | 125e2b6a2c6507efd566912445254102d2d63834 | Dockerfile.api available; journey acceptance unresolved |

Candidate image-builder entry point, after a new master fetch:

~~~bash
bash deploy/contabo-demo/release-nine-demo-apps.sh --images-plan
~~~

Only if the plan is correct and host capacity remains acceptable:

~~~bash
bash deploy/contabo-demo/release-nine-demo-apps.sh --build-candidates
~~~

This serially builds the pinned **Education API, Fleet Guard, MamaCare and Tontine** images, using unique SHA-derived local tags; it does not start containers or migrate databases. Tontine image build is NOT Tontine journey certification. Home Services needs its reviewed Dockerfile included in an approved new source SHA; Education web needs exact OIDC build inputs before image creation. No public site will be marked verified on the basis of image build alone.


## Create-only database foundations (after successful image builds)

Five isolated PostgreSQL 16 database containers can be initialized on the existing VPS without publishing PostgreSQL host ports. Unlike per-app schema migrations and RLS grants, this phase creates ONLY new database containers and migration-owner credentials. Existing Portal, Commerce, Identity, VentureWorks and Morphoo databases remain untouched.

Commands after fetching an approved deployment-script SHA:

~~~bash
bash deploy/contabo-demo/release-nine-demo-apps.sh --databases-plan
bash deploy/contabo-demo/release-nine-demo-apps.sh --prepare-databases
bash deploy/contabo-demo/release-nine-demo-apps.sh --databases-verify
~~~

- Each app has its own named PostgreSQL 16 container (ads-demo-<app>-db), Docker private bridge network, and dedicated persistent Docker volume.
- Root-only credentials are generated on Contabo under /etc/ads-demo/apps/<app>-db.env, permissions 0600. Never print, copy into GitHub or share owner credentials.
- No TCP host-published Postgres ports, production data or payment connections.
- Application runtimes must **NOT** use the migration owner (the PostgreSQL Docker bootstrap owner is privileged). Before launching the application, each requires reviewed forward-only migrations, a separately authenticated least-privileged login, worker/webhook separation and RLS checks.
- Repeated runs refuse unexpected existing containers, resource collisions and unsafe pre-existing secret paths rather than deleting volumes.
- This consumes VPS RAM and disk; the script checks basic capacity before creating anything.

**A healthy empty Postgres database is not an application deployment or certification.** Run app-specific schema migrations, safe demo seeds, OIDC/HTTPS and browser checks before publishing any portal links.

## Next gate: per-app forward-only database migrations (after five DB health checks)

The VPS operator confirmed all five new Postgres 16 demo containers healthy, with no host-published ports. A dedicated guarded migration runner now invokes the actual migrator **from each pinned, immutable Git archive** over only that app's private Docker network. The owner credentials never go into GitHub or command-line arguments, and the temporary migration container is removed after execution.

Inspect the five migrations first:

~~~bash
bash deploy/contabo-demo/release-nine-demo-apps.sh --schemas-plan
~~~

Run and verify **one app at a time**, stopping on the first error; recommended: Education, Fleet Guard, Home Services, MamaCare, Tontine. Example:

~~~bash
bash deploy/contabo-demo/release-nine-demo-apps.sh --migrate-app education
bash deploy/contabo-demo/release-nine-demo-apps.sh --schema-verify education
~~~

Repeat for other app names only if the prior one passes: fleetguard, home-services, mamacare, tontine. These operations change the five NEW DATABASE SCHEMAS only. They do not create app containers, publish HTTP/HTTPS, grant all runtime memberships, load seeded data, or alter any old ADS service.

- The runner enforces exact staged SHA, existing protected owner credentials, app-labelled healthy DB, no published DB ports, and the app's own immutable migration files.
- The verification compares expected migration files to ledger rows and requires at least one FORCE RLS table. Further policy and least-privilege user tests are mandatory before app release.
- Home Services migrator can establish its dedicated `home_runtime` login, with a protected generated password; the others still require explicit restricted runtime and webhook/worker login provisioning after migrations.
- The migration runner does NOT roll back schema changes automatically. On any error, stop and inspect the failing isolated database; don't delete volumes, rerun on a production DB, or try to restore other apps.
- This is an intermediate *schema-ready* stage, not a certified, public demo site.

## Work packages in GitHub (concrete backlog)

| WP | Deliverable | Completion evidence |
| --- | --- | --- |
| WP-01 | Release manifest finalization, approved SHAs and per-repo GitHub access | 9 pinned sources reachable/verified from Contabo |
| WP-02 | Commerce pinned release with old/new journey regression | Passed catalogue/shops/POS/login; rollback proved |
| WP-03 | Education build/DB/identity/seed/release script | Local canary + public HTTPS + E2E proof |
| WP-04 | Fleet Guard build/DB/identity/seed/release script | Local canary + public HTTPS + E2E proof |
| WP-05 | Home Services Docker package and DB/release script | Local canary + public HTTPS + E2E proof |
| WP-06 | MamaCare build/DB/identity/seed/release script | Local canary + public HTTPS + E2E proof |
| WP-07 | Digital Tontine demo acceptance fix/DB/release script | E2E evidence; no live payments; HTTPS |
| WP-08 | VentureWorks and Morphoo existing runtime reuse, secure routing | No port conflict; HTTPS and demo sign-in E2E |
| WP-09 | Portal candidate + seven exact links, preserve Commerce and POS | EN/FR 360/768/1280 portal-to-app and commerce acceptance |
| WP-10 | Fail-closed master `--apply`, per-app locks, release report, tested rollback | One-command rehearsal on isolated or test environment, then operator release |

## Release acceptance

Declare the nine-site demo rollout complete only after nine domains pass TLS, seven application links work from the landing portal, Commerce's shop and POS journeys remain working, seven new application releases/existing publishes are documented, demo database isolation and shared ADS sign-in pass, and the final release report shows all mandatory gates green.

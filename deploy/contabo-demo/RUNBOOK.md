# Contabo ADS Demo Gateway — incremental deployment runbook (22 October 2026)

## Outcome and separation
The public ADS ecosystem portal, dedicated demo login server and Commerce's integrated E-commerce/POS are three independently versioned services. This plan uses GitHub as source of truth; tests and immutable GHCR images precede each deployment.

**Existing Contabo VPS**: `vmi3191089` at `161.97.128.153`. The old Software Factory identity container `africorestack-identity` and its database `africorestack-identity-postgres` must never be stopped, removed, migrated or modified by this runbook. Never run `deploy/docker-compose.yml` over the live identity server: it is NOT the isolated demo configuration.

Known occupied: `18084` RAG runtime, `18085` public retail container, `18088` nginx. Preserve these services and do not reassign their ports.

Proposed reserved loopback ports (verify available first):
- Portal: `127.0.0.1:18089` (independent lightweight nginx)
- ADS demo identity: `127.0.0.1:18090` (separate Postgres 16 volume `ads-demo-identity-postgres`)
- Commerce demo: `127.0.0.1:18086` (separate Postgres DB/volume, in Commerce repo)
- Tourism demo: `127.0.0.1:18130` (`TOUR_DEMO_PORT`, separate Postgres volume, in the Tourism repo; §E3.2)

No port is publicly exposed by these Compose stacks. Existing ingress should later route approved HTTPS domain names to those loopback ports; inspect current proxy config first.

## A. GitHub build and versioned release
- `.github/workflows/demo-portal.yml` already tests and publishes `ghcr.io/ksondo/ads-demo-portal:sha-<40-char-commit>` from main.
- `.github/workflows/identity-image.yml` tests PostgreSQL-backed identity with safety controls then publishes `ghcr.io/ksondo/ads-platform-kit-identity:sha-<commit>` from main.
- The Commerce repo has its own GHCR build candidate workflow for web/API/migrator and requires the public demo identity URL and Commerce URL to be approved before publication.
- Do not equate a passing build or image publication with successful Contabo deployment. Record the exact SHA (better: digest) plus time of each release.

## B. Inspect Contabo, without changes

From the Windows terminal:
    ssh root@161.97.128.153

On the VPS, run this **read-only** diagnostic (do NOT add `|| exit 1` on the SSH host):
    docker compose version
    docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
    ss -ltnp | grep -E ':(80|443|18090|18086|18089)\b' || true
    df -h /
    free -h

Do not proceed if the selected loopback ports are already used by unrelated apps. Do not interfere with `africorestack-developer` Docker network.

## C. One-time host preparation

Clone the **private** kit repository using a previously configured GitHub SSH deploy key or authenticated HTTPS account (no passwords/tokens typed into chat):
    mkdir -p /opt/ads
    cd /opt/ads
    git clone git@github.com:ksondo/ads-platform-kit.git demo-platform-kit
    cd demo-platform-kit

If repository is already cloned, use a careful `git status` and `git fetch`; do not delete or reset an unrelated working copy. When a PR is merged, select its reviewed commit.

Create operator-owned config outside Git:
    install -d -m 700 /etc/ads-demo
    cp deploy/contabo-demo/images.env.example /etc/ads-demo/images.env
    cp deploy/contabo-demo/identity.env.example /etc/ads-demo/identity.env
    chmod 600 /etc/ads-demo/images.env /etc/ads-demo/identity.env

Edit the env files locally on the VPS; set approved SHA tags, 32-byte random hex database password, separate 32-byte cookie secret, unique demo passwords and demo-only HTTPS issuer. Example generation:
    openssl rand -hex 32

The signing private key is **not** the Software Factory signing key. Generate a separate PKCS8 RSA key without printing it or sending it to chat:
    umask 077
    openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out /etc/ads-demo/demo-signing-key.pem

Use Python locally on the VPS to replace the placeholder in the protected identity env file with PEM line breaks escaped as literal `\n`. Do not print the resulting value in logs or messages. Example:
    python3 - <<'PY'
    from pathlib import Path
    env=Path('/etc/ads-demo/identity.env')
    raw=Path('/etc/ads-demo/demo-signing-key.pem').read_text()
    value=raw.replace(chr(10), chr(92)+'n')
    doc=env.read_text()
    assert 'REPLACE_WITH_RS256_PRIVATE_KEY_PEM_ESCAPED' in doc
    env.write_text(doc.replace('REPLACE_WITH_RS256_PRIVATE_KEY_PEM_ESCAPED',value))
    PY
    chmod 600 /etc/ads-demo/demo-signing-key.pem /etc/ads-demo/identity.env

GitHub Container Registry pull: a private package needs a token with read:packages scoped only to required packages. Login securely without storing or printing the token in shell history:
    read -rsp 'GHCR read-only token: ' GHCR_READ_TOKEN; echo
    printf %s "$GHCR_READ_TOKEN" | docker login ghcr.io -u ksondo --password-stdin
    unset GHCR_READ_TOKEN

## D. Deploy the public landing page FIRST

Use the SHA-tagged image actually published by GitHub, entered into `/etc/ads-demo/images.env`. To make shell scripts executable when fetched via GitHub's contents API:
    bash deploy/contabo-demo/preflight.sh
    bash deploy/contabo-demo/deploy-portal.sh

This script pulls the image, tests a temporary canary, then starts only `ads-demo-portal`, bound to 127.0.0.1:18089. It records the previous Docker image and attempts rollback on a failed health check. It does NOT touch Software Factory.

Without configuring public DNS, the operator can already inspect the actual portal in a browser through an SSH tunnel from their Windows computer:
    ssh -L 18888:127.0.0.1:18089 root@161.97.128.153
Then open `http://localhost:18888` on that computer while the SSH session remains open.

Check /, /platforms, /opportunities, /cloud, /demo-access and Commerce's POS/E-commerce tool cards. About ADS and Partners must stay visible but inert; Contact must link to WhatsApp +237 654 035 075.

## D2. Existing public demo hostname: ADS Digital Ecosystem pilot

Operator-approved hostname: **https://demo.africadigitalsynergy.com** (not the login service).

Before cutover, the existing Nginx site served /root/retail-sync-io/dist and returned HTTP 500. The existing retail files must be kept. The new ADS portal is already healthy on 127.0.0.1:18089; demo identity stays isolated at 127.0.0.1:18090.

Reuse this hostname only after checking that its authoritative DNS still resolves to 161.97.128.153, and that the existing certificate is valid. DNS cannot be inferred from the existence of the Nginx site.

On Contabo, run:

    cd /opt/ads/demo-platform-kit
    git pull --ff-only origin main
    dig @ns75.domaincontrol.com +short demo.africadigitalsynergy.com A
    dig +short demo.africadigitalsynergy.com A
    python3 deploy/contabo-demo/promote-existing-demo-host.py --check

After the preflight passes, make the controlled Nginx change:

    python3 deploy/contabo-demo/promote-existing-demo-host.py --apply

The script backs up the exact old Nginx site under /var/backups/ads-demo-nginx/, preserves its Certbot HTTPS settings and HTTP redirect, replaces only the old root and / handler with a loopback proxy to 127.0.0.1:18089, runs nginx -t, reloads existing host Nginx, tests the correct TLS hostname locally, and rolls back automatically on any cutover validation failure. It does not delete the existing retail project, change another Nginx site, or alter Software Factory or Commerce/identity containers.

Verify locally via the real hostname/SNI even if DNS is pending:

    curl --noproxy '*' -fsSI --resolve demo.africadigitalsynergy.com:443:127.0.0.1 https://demo.africadigitalsynergy.com/
    curl --noproxy '*' -fsS --resolve demo.africadigitalsynergy.com:443:127.0.0.1 https://demo.africadigitalsynergy.com/ | grep -o 'ADS Digital Ecosystem' | head -1

Then test public DNS and HTTPS via a browser on a different network. If the A record is missing, the host-local route can work but public accessibility remains blocked until DNS is repaired.

For a later manual rollback, take the *exact backup path printed by the script* and restore that file to the resolved path of /etc/nginx/sites-enabled/demo.africadigitalsynergy.com, then run nginx -t and systemctl reload nginx. Do not use a guessed backup path.

## E. Isolated demo identity SECOND

### Preferred protected configuration (no secret values in chat)

After choosing an **approved distinct HTTPS hostname** for demo login and confirming that the GHCR identity image has been successfully published and pulled, use the one-time preparer rather than manually pasting passwords or signing keys into shell history. Example only (the hostname is NOT claimed to have DNS/TLS configured):

    cd /opt/ads/demo-platform-kit
    git pull --ff-only origin main
    DEMO_IDENTITY_IMAGE=ghcr.io/ksondo/ads-platform-kit-identity:sha-<approved-40-char-commit>
    docker pull "$DEMO_IDENTITY_IMAGE"
    read -rp 'Approved demo login HTTPS origin: ' DEMO_ISSUER
    bash deploy/contabo-demo/prepare-identity-config.sh "$DEMO_ISSUER" "$DEMO_IDENTITY_IMAGE"
    unset DEMO_ISSUER DEMO_IDENTITY_IMAGE

The preparer refuses to reuse the production login issuer, refuses existing config-file overwrites and a busy 18090 port, generates independent cryptographic credentials and PKCS8 signing key on the server, verifies the running portal image and restricts files to owner-only mode 0600. It **does not** start containers or change any production data.

Before starting identity, confirm `docker compose --env-file /etc/ads-demo/images.env -f deploy/contabo-demo/compose.identity.yml config --quiet`. Never share the filled config files in chat: they contain real passwords and private signing material.

After local health is established, HTTPS, DNS and OAuth callbacks must be configured and independently tested before allowing public sign-in. The demo issuer must remain separate from `https://login.africadigitalsynergy.com`.



**Do not initiate until** the dedicated identity HTTPS issuer name, ingress/TLS routing, filled environment settings, and package publication are verified. The name must not conflict with the old Software Factory issuer.

    bash deploy/contabo-demo/deploy-identity.sh
    bash deploy/contabo-demo/bootstrap-demo-accounts.sh

`deploy-identity.sh` starts its own database volume and container `ads-demo-identity`, using local port 18090; it never adopts the old identity DB. `bootstrap-demo-accounts.sh` registers the 25 reviewed OIDC demo clients, three demo accounts and their demo/staff organizations; saves generated client secrets and tenant metadata into `/var/lib/ads-demo/operator-secrets/` in files accessible only to root. It performs local EN/FR demo-login and OIDC discovery smoke tests but does not claim that TLS callbacks work until tested externally.

**Important:** In the reviewed demo manifest, the demo accounts may hold broad staff/test roles. Keep this server on wholly isolated demo databases and zero live financial/regulatory/provider integrations. Demo admin passwords are never shown on public pages.

If registration/verification email is not yet configured, use the dedicated demo accounts; do not treat `MAIL_TRANSPORT=log` as a production notification service. Never copy a demo signing key or a demo database into the Software Factory identity environment.

### E2. Publish shared demo sign-in at login.demo.africadigitalsynergy.com

Approved hostname: **https://login.demo.africadigitalsynergy.com** (separate from the public `demo.africadigitalsynergy.com` landing page and from production `auth.africadigitalsynergy.com`). The isolated identity service is healthy on `127.0.0.1:18090`, with 25 registered OIDC clients, three demo accounts, existing organization/role records, and its own Postgres volume. **Do not re-run demo account/bootstrap scripts.**

Historical identity issuer is `https://login.test.africadigitalsynergy.com`. Its change is an OIDC contract change: applications must configure the new issuer before public authentication, and existing sessions/tokens with the old issuer will not be interchangeable. Do not change the signing key, database, three passwords, or old production identity.

Use the staged reviewed utility at `deploy/contabo-demo/publish-demo-login.py` only on Contabo after the corresponding PR has been merged:

    cd /opt/ads/demo-platform-kit
    git pull --ff-only origin main
    python3 deploy/contabo-demo/publish-demo-login.py --check

`--check` verifies that **both GoDaddy authoritative name servers** return `161.97.128.153` for the new A record; that no unexpected AAAA record is present; Nginx is valid; the isolated identity is healthy; and the expected protected demo config exists. If it fails, it makes **no** changes. Existing Nginx duplicate afri-corestack warning is unrelated; do not fix in this deployment.

If preflight passes, create an **HTTP-only** Nginx site for Let's Encrypt HTTP-01 validation. This does not serve login pages until HTTPS exists:

    python3 deploy/contabo-demo/publish-demo-login.py --prepare-acme

The utility creates its own ACME challenge directory with explicit Nginx-readable 0755 directory permissions and a temporary 0644 probe file (safe even when the operator's umask is 077), refuses to modify any existing unrelated Nginx site, validates and reloads Nginx, retries the local challenge probe to accommodate asynchronous worker reloads, and rolls back on failure. **Do not run Certbot if `--prepare-acme` fails or `ADS_DEMO_LOGIN_ACME_READY=PASS` is absent:** the rollback removes the challenge route and the certificate authority will receive HTTP 404. Diagnose the challenge endpoint instead. Only after the ready marker is confirmed, request a certificate through the **webroot** authenticator; do not use `certbot --nginx`, which can edit other Nginx sites:

    certbot certonly --webroot -w /var/www/ads-demo-login-acme -d login.demo.africadigitalsynergy.com --cert-name login.demo.africadigitalsynergy.com

Certbot may prompt for account/contact details if they are not already configured. ACME requires public DNS and inbound port 80. Do not disable existing listeners, switch to standalone authenticator, or replace other certificates to get around a failure.

After Certbot reports successful issuance, activate the separate HTTPS reverse proxy to the loopback-only identity service, keeping Certbot-managed SSL files and HTTP-01 renewal path:

    python3 deploy/contabo-demo/publish-demo-login.py --activate-https

This checks certificate validity and hostname, backs up the HTTP-only Nginx configuration under `/var/backups/ads-demo-login/`, validates/reloads Nginx and locally checks OIDC discovery over the new HTTPS host. On failure, the script restores its previous site configuration.

Only after HTTPS routing passes, change the **demo identity issuer** in the protected existing environment file and recreate **only the identity service**, leaving its Postgres volume and all accounts untouched:

    python3 deploy/contabo-demo/publish-demo-login.py --promote-issuer

This backs up `/etc/ads-demo/identity.env` (permissions 0600), replaces only the exact old `IDENTITY_PUBLIC_URL` line, refuses a conflicting `IDENTITY_ISSUER` override, recreates only `ads-demo-identity` with `docker compose --no-deps`, validates health and OIDC issuer through public HTTPS, and automatically restores the prior env and recreates the demo identity on failure. Old issuer sessions will not carry across.

Final operator/public tests:

    curl -fsS https://login.demo.africadigitalsynergy.com/health
    curl -fsS https://login.demo.africadigitalsynergy.com/.well-known/openid-configuration | python3 -c 'import sys,json; print(json.load(sys.stdin)["issuer"])'
    curl -fsSI https://demo.africadigitalsynergy.com/

Then test the login page in a real external browser. Product OAuth end-to-end (PKCE, redirects, role segregation, tenant isolation, logout) requires an approved, live product callback hostname and is not certified merely by making the login page reachable. The current 25-client registry still contains `.test` callbacks, so product callbacks must be updated selectively when each product is ready, not by re-running the initial bootstrap.

Before considering the login public acceptance complete, confirm the demo instance has only isolated sandbox data, no live providers, and that publicly displayed `demo.user` credentials do not authorize any production systems. Keep secret backups and environment content off tickets, logs, and chat.

### E3. Authorize the live Commerce callback (without re-bootstrapping demo identities)

The operator approved the public Commerce hostname `https://commerce.demo.africadigitalsynergy.com` after public DNS verification. Its OAuth redirect and post-logout allow-list are updated in `config/clients.demo.json`. This source change alone does NOT modify the already-running demo identity database.

After Commerce HTTPS and application callback endpoint exist, and before testing PKCE sign-in, update only the `commerce-web` registration in the **isolated** demo Identity database using its existing reviewed CLI. Do not rerun `bootstrap-demo-accounts.sh`, `apply-clients.mjs`, demo account setup, or any command against the CoreStack production identity:

    docker exec ads-demo-identity node -e 'if(process.env.ADS_ENV!=="demo"||process.env.DEMO_MODE!=="1")process.exit(2)'
    docker exec ads-demo-identity node src/cli.mjs register-client \
      --id commerce-web --name 'ADS Commerce' \
      --redirect https://commerce.demo.africadigitalsynergy.com/ \
      --logout https://commerce.demo.africadigitalsynergy.com/ \
      --self-roles commerce_buyer --personal true \
      --admin-roles merchant_owner \
      --assignable-roles merchant_owner,commerce_manager,commerce_cashier,commerce_accountant,commerce_investor,commerce_auditor,bank_officer,bank_agent

The CLI update keeps the existing demo identities, memberships, product-role grants, signing key, database volume and client secret state unchanged. It updates only the approved registration and records an identity audit event. It does replace the former test callback URI, so do this only when Commerce is actually deployed and ready for the new hostname.

Verify registration without exposing credentials:

    docker exec ads-demo-identity node --input-type=module -e 'import pg from "pg"; const p=new pg.Pool({connectionString:process.env.DATABASE_URL});try{const r=await p.query("SELECT client_id,redirect_uris,post_logout_redirect_uris FROM platform.oauth_clients WHERE client_id=$1",["commerce-web"]);console.log(JSON.stringify(r.rows[0]??null))}finally{await p.end()}'

Expected exact callback and post-logout URI: `https://commerce.demo.africadigitalsynergy.com/`. Continue browser PKCE sign-in/out and role/tenant isolation E2E after the hostname is serving Commerce over valid HTTPS.

#### E3.1 Fix one drifted client with `register-identity-client.sh` (11 November 2026)

When `release-acceptance.sh` reports `FAIL <product> client-drift` (the registered redirect or post-logout URIs differ from the reviewed `config/clients.demo.json` inside the running Identity image), re-register **that one client** with all its reviewed fields (name, accent, redirect and post-logout URIs, self-service roles, personal-workspace flag, admin scopes, admin roles, assignable roles). Do not rerun `apply-clients.mjs` or any bootstrap.

1. Take the protected Identity database backup first and record it in a root-only marker file outside any repository (for example `/var/lib/ads-demo/operator-secrets/identity-backup-<date>.marker`: backup path, time and checksum; no passwords).
2. Dry run (reads only; prints the field-by-field difference):

       bash deploy/contabo-demo/register-identity-client.sh ventureworks-web --backup-confirmed /var/lib/ads-demo/operator-secrets/identity-backup-<date>.marker

3. Apply, for that client only, after reviewing the difference:

       bash deploy/contabo-demo/register-identity-client.sh ventureworks-web --backup-confirmed /var/lib/ads-demo/operator-secrets/identity-backup-<date>.marker --apply

The script refuses without an existing, non-empty `--backup-confirmed` file, refuses an Identity container that is not `ADS_ENV=demo`/`DEMO_MODE=1`, runs the existing `node src/cli.mjs register-client` inside `ads-demo-identity`, then re-reads the row and fails unless it matches. It never reads `client_secret_hash` or prints a secret; accounts, memberships, roles, signing keys and client secrets are unchanged. Container names follow `release-acceptance.sh` (`ADS_ACC_IDENTITY_CONTAINER`, `ADS_ACC_IDENTITY_DB_CONTAINER`). Then rerun `release-acceptance.sh --product <id>`.

Agriculture wave 2 (11 November 2026): `config/clients.demo.json` adds a `tokenExchange` entry on `agriculture-web` (audience `ads-commerce-api`, scope `commerce.sector_offers`) and two service clients in the top-level `service_clients` list (`agriculture-sector-service`, `commerce-sector-service`). Agriculture demo roles are unchanged and follow the same pattern as the other demos. Until Identity client-credentials and token-exchange support is merged and deployed, `apply-clients.mjs` and `register-identity-client.sh` ignore both; afterwards the operator registers each service client and re-registers `agriculture-web` with the dry run above, and provisions the client secrets on the server only.

Demo personas for Agriculture and Fleet Guard (11 November 2026): `config/clients.demo.json` adds the role `processor` to `agriculture-web` and `lien_holder_viewer` to `fleet-guard-web` (assignable roles and the `main` demo organisation). `config/demo-personas.json` and `config/demo-access-platforms.json` add the Agriculture personas `processor` and `landowner` (farmer role, land-holder label), give the Agriculture `demo-colleague` the roles `reviewer`, `coop_manager`, `lender_officer` and `agronomist`, and add the Fleet Guard personas `co-owner` (`vehicle_owner`), `lien-holder` (`lien_holder_viewer`) and `finance` (`finance`). **After the Identity image that carries this change is deployed, the operator (GPT) must re-apply both clients**, because `release-acceptance.sh` compares only the redirect and post-logout URIs and will not report the new roles as drift:

    bash deploy/contabo-demo/register-identity-client.sh agriculture-web --backup-confirmed /var/lib/ads-demo/operator-secrets/identity-backup-<date>.marker
    bash deploy/contabo-demo/register-identity-client.sh agriculture-web --backup-confirmed /var/lib/ads-demo/operator-secrets/identity-backup-<date>.marker --apply
    bash deploy/contabo-demo/register-identity-client.sh fleet-guard-web --backup-confirmed /var/lib/ads-demo/operator-secrets/identity-backup-<date>.marker
    bash deploy/contabo-demo/register-identity-client.sh fleet-guard-web --backup-confirmed /var/lib/ads-demo/operator-secrets/identity-backup-<date>.marker --apply

The dry run must show only the added `assignable_roles` entry (`processor`, `lien_holder_viewer`). Visitor grants keep the persona list they were provisioned with: a visitor provisioned before this change sees the new personas only after a new private provisioning (`demo-visitor-provision`). Then rerun `release-acceptance.sh --product agriculture` and `--product fleet-guard`. The products show the new personas only once their own code knows them (Agriculture ignores unknown persona keys; Fleet Guard lists them).

#### E3.2 ADS Tourism demo (TOU-0, 13 November 2026)

What the kit changes (TOU-0 PR):

- `config/clients.demo.json`: `tourism-web` accepts `https://tourism.demo.africadigitalsynergy.com/` as sign-in callback and post-logout address, next to the existing `.test.` address (same pattern as Commerce, Fleet Guard and Agriculture). `demo_access_denied_redirect` is `false` until the Tourism app shows its own no-access card.
- `config/demo-personas.json`: the Tourism `visitor` persona moves from the operator organisation (`main`, "ADS Demo – Tour operator") to its **own personal workspace**, like the Commerce `shopper`. Tourism refuses a booking on a listing of the booker's own organisation (`OWN_LISTING`), so a visitor inside the operator organisation could not book the demo operator's visits, and book → accept → gate failed. The gate agent and site operator stay in `main`; the Tourism admin stays in the ADS staff organisation.
- `config/demo-access-platforms.json`: Tourism is in the Demo Access registry (key `tourism`, reference prefix `TOU`, personas visitor, gate agent and site operator; the Tourism admin is ADS staff and never offered). Private operator provisioning is **not** enabled for Tourism (it has no product-side grant check yet), so sign-in to Tourism is unchanged for everyone else.
- Release lists: `nine-platform-rollout.json` lists Tourism (`planned_not_verified`, port 18130); `ads-release-20261113-tourism.manifest.json` pins Tourism main `3b023ac57c8421a82f2d705e8b1065f088adffed` (after TOU-1, tourism-platform #13) and Identity `399ee5b` (kit #87); `release-acceptance.sh` knows Tourism (container `ads-tourism-demo-tourism-1`, static root `/app/dist`, `/health`).
- Port: Tourism publishes only `127.0.0.1:18130` (`TOUR_DEMO_PORT`). It does not clash with the documented demo ports (portal 18089, Identity 18090, Commerce 18086, Agriculture 18140, VentureWorks 18481, Education, Fleet Guard and Tontine below 9000) or the occupied 18084, 18085 and 18088; still check it on the host: `ss -ltn | grep -c ':18130 '` prints `0`.

Gate before any step: GitHub Actions is unavailable (billing) since 13 November 2026, so GitHub publishes no images. The owner approved (13 November 2026) deploying TOU-0 today with images **built on the Contabo server** from the exact merged commits: the kit (Identity) and Tourism main `3b023ac` (TOU-1). The Identity container reads the client and persona lists from its own image (`/app/config`), so step 2 must run before the others; none of the later steps has any effect on the old image.

Steps (operator, GPT), in this order, on the Contabo host:

1. **Back up Identity** (before anything else). Take the protected Identity database backup and record it in a root-only marker file outside any repository (backup path, time and checksum; no passwords), as in §E3.1: `/var/lib/ads-demo/operator-secrets/identity-backup-<date>.marker`. Keep a copy of the current tenants file: `cp -p /var/lib/ads-demo/operator-secrets/demo-tenants.json /var/lib/ads-demo/operator-secrets/demo-tenants.json.before-tou0`.
2. **Build and deploy the Identity image on the server from the exact merged kit commit.** `<KIT_SHA>` is `399ee5bde63625f7206d0b2a636c6252e3a85735`, the merge commit of the TOU-0 PR (#87) on `main`, pinned as `ads-identity` in `ads-release-20261113-tourism.manifest.json`. `deploy-identity.sh` is **not** used here: it accepts only a GHCR tag and pulls it. The image is built with the kit's own `services/identity/Dockerfile` from a `git archive` export of exactly that commit, so no uncommitted, untracked or ignored file in the host checkout can enter the image. It is then started with the kit's `compose.identity.yml`, recreating only the `identity` service; the database container, volume `ads-demo-identity-postgres`, signing key, accounts and client secrets do not change. Run the block in its own `bash` (for example paste it after typing `bash`), so that an `exit 1` after a `STOP_…` line ends only that shell, not the SSH session.

       cd /opt/ads/demo-platform-kit
       KIT_SHA=399ee5bde63625f7206d0b2a636c6252e3a85735
       git fetch origin main && git checkout --detach "$KIT_SHA"
       # Hard stop: the commit is on origin/main and is what is checked out (the scripts and compose file below run from this checkout).
       git merge-base --is-ancestor "$KIT_SHA" origin/main && test "$(git rev-parse HEAD)" = "$KIT_SHA" || { echo STOP_WRONG_COMMIT; exit 1; }
       # No changed, untracked or ignored file where the image comes from; no changed or untracked file in the operator scripts.
       test -z "$(git status --porcelain --ignored -- services/identity config packages/identity-client)" || { echo STOP_CHECKOUT_NOT_CLEAN; exit 1; }
       test -z "$(git status --porcelain -- deploy/contabo-demo)" || { echo STOP_SCRIPTS_NOT_CLEAN; exit 1; }
       # Previous image, kept for rollback (never prune it): tag and image ID.
       docker inspect -f '{{.Config.Image}} {{.Image}}' ads-demo-identity | tee /var/lib/ads-demo/operator-secrets/identity-image-before-tou0.txt
       # Build from the committed tree only.
       build="$(mktemp -d)" && git archive "$KIT_SHA" | tar -x -C "$build"
       docker build -f "$build/services/identity/Dockerfile" --label org.opencontainers.image.revision="$KIT_SHA" -t "ads-platform-kit-identity:sha-$KIT_SHA" "$build"
       rm -rf "$build"
       docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}} {{.Id}}' "ads-platform-kit-identity:sha-$KIT_SHA" | tee /var/lib/ads-demo/operator-secrets/identity-image-tou0.txt   # revision = KIT_SHA, plus the new image ID
       docker run --rm --entrypoint grep "ads-platform-kit-identity:sha-$KIT_SHA" -q '"https://tourism.demo.africadigitalsynergy.com/"' /app/config/clients.demo.json && echo IMAGE_HAS_TOURISM_DEMO
       cp -p /etc/ads-demo/images.env /etc/ads-demo/images.env.before-tou0
       # edit /etc/ads-demo/images.env: ADS_DEMO_IDENTITY_IMAGE=ads-platform-kit-identity:sha-399ee5bde63625f7206d0b2a636c6252e3a85735   (only this line)
       # Only the Identity image line may differ. Other changed lines are shown by NAME only (values such as the DB password are never printed).
       grep -qx "ADS_DEMO_IDENTITY_IMAGE=ads-platform-kit-identity:sha-$KIT_SHA" /etc/ads-demo/images.env || { echo STOP_IDENTITY_LINE_NOT_SET; exit 1; }
       other="$(diff /etc/ads-demo/images.env.before-tou0 /etc/ads-demo/images.env | grep '^[<>]' | grep -v '^[<>] ADS_DEMO_IDENTITY_IMAGE=' | sed 's/=.*/=(value hidden)/' || true)"
       test -z "$other" && echo IMAGES_ENV_ONLY_IDENTITY_LINE_CHANGED || { printf '%s\n' "$other"; echo STOP_OTHER_LINES_CHANGED; exit 1; }
       docker compose --env-file /etc/ads-demo/images.env -f deploy/contabo-demo/compose.identity.yml config -q
       docker compose --env-file /etc/ads-demo/images.env -f deploy/contabo-demo/compose.identity.yml up -d --no-deps identity
       # Right after up: the running container is the new image, in demo mode, with no placeholder settings (yes/no only; no value printed).
       test "$(docker inspect -f '{{.Image}}' ads-demo-identity)" = "$(docker image inspect -f '{{.Id}}' "ads-platform-kit-identity:sha-$KIT_SHA")" || { echo STOP_WRONG_IMAGE_RUNNING; exit 1; }
       docker exec ads-demo-identity node -e 'const e=process.env;if(e.ADS_ENV!=="demo"||e.DEMO_MODE!=="1")process.exit(2);if(Object.values(e).some(v=>/REPLACE_WITH|REPLACE-WITH|change-me/.test(v)))process.exit(3)' && echo IDENTITY_DEMO_MODE_OK || { echo STOP_NOT_DEMO_OR_PLACEHOLDER; exit 1; }
       ! grep -Eq '(REPLACE_WITH|REPLACE-WITH|change-me)' /etc/ads-demo/images.env /etc/ads-demo/identity.env || { echo STOP_PLACEHOLDER_IN_ENV_FILES; exit 1; }
       curl -fsS http://127.0.0.1:18090/health
       curl -fsS https://login.demo.africadigitalsynergy.com/.well-known/openid-configuration | python3 -c 'import sys,json; print(json.load(sys.stdin)["issuer"])'   # https://login.demo.africadigitalsynergy.com

   Any `STOP_…` line means: do not continue; put back `images.env.before-tou0` and recreate `identity` (rollback step 3) if `up` already ran. The local tag carries `<KIT_SHA>` and the OCI revision label, which is what `release-acceptance.sh` checks against the manifest pin. This image also carries PR #85 (Agriculture and Fleet Guard personas); no Identity migration is added since `b768b47`. Re-apply `agriculture-web` and `fleet-guard-web` as described in the addendum just above, in the same window.
3. **Re-register the Tourism client: dry run, then apply.**

       bash deploy/contabo-demo/register-identity-client.sh tourism-web --backup-confirmed /var/lib/ads-demo/operator-secrets/identity-backup-<date>.marker
       bash deploy/contabo-demo/register-identity-client.sh tourism-web --backup-confirmed /var/lib/ads-demo/operator-secrets/identity-backup-<date>.marker --apply

   The dry run must show only the added `https://tourism.demo.africadigitalsynergy.com/` in the redirect and post-logout URIs (and nothing else for `tourism-web`). Stop if it shows anything more.
4. **Re-run demo-bootstrap, then demo-orgs, and preview before replacing the tenants file** (both use the server's existing demo secrets; nothing is printed). demo-bootstrap creates any missing persona account and refreshes the existing demo and persona accounts with the passwords already on the server; demo-orgs restores every demo organisation and places each persona in exactly its one workspace, which moves the Tourism visitor out of the operator organisation into its personal workspace. Both are the same operations as the original bootstrap and the nightly demo reset.

       docker exec ads-demo-identity node -e 'if(process.env.ADS_ENV!=="demo"||process.env.DEMO_MODE!=="1")process.exit(2)'
       docker exec ads-demo-identity node src/cli.mjs demo-bootstrap
       docker exec ads-demo-identity node src/cli.mjs demo-orgs --out /tmp/demo-tenants.json
       docker cp ads-demo-identity:/tmp/demo-tenants.json /var/lib/ads-demo/operator-secrets/demo-tenants.json.new
       chmod 600 /var/lib/ads-demo/operator-secrets/demo-tenants.json.new
       docker exec -u 0 ads-demo-identity rm -f /tmp/demo-tenants.json

   Preview which tenant ids changed (ids only, no secrets) before copying the file into place:

       python3 - /var/lib/ads-demo/operator-secrets/demo-tenants.json /var/lib/ads-demo/operator-secrets/demo-tenants.json.new <<'PY'
       import json, sys
       old, new = (json.load(open(f))["products"] for f in sys.argv[1:3])
       def ids(m):
           out = {}
           for slug, e in m.items():
               out.update({f"{slug}.tenants.{k}": v for k, v in e.get("tenants", {}).items()})
               out.update({f"{slug}.personas.{k}": p.get("tenant_id") for k, p in e.get("personas", {}).items()})
           return out
       a, b = ids(old), ids(new)
       for k in sorted(set(a) | set(b)):
           if a.get(k) != b.get(k): print("CHANGED", k, a.get(k), "->", b.get(k))
       PY

   Expected: only `tourism.personas.visitor` changes (from the operator organisation's tenant to its own personal workspace), plus personas that are new in this image (#85: Agriculture `processor`, `landowner`; Fleet Guard `co-owner`, `lien-holder`, `finance`) when they were not in the old file. Every `*.tenants.*` id must stay the same. Stop and keep the old file if anything else changed. Then:

       cp -p /var/lib/ads-demo/operator-secrets/demo-tenants.json.new /var/lib/ads-demo/operator-secrets/demo-tenants.json

   Check: `python3 -c 'import json;d=json.load(open("/var/lib/ads-demo/operator-secrets/demo-tenants.json"))["products"]["tourism"];p=d["personas"];print(p["visitor"]["org"], p["visitor"]["tenant_id"]!=d["tenants"]["main"], sorted(p))'` prints `personal True ['gate-agent', 'operator-admin', 'tour-admin', 'visitor']`.
5. **Tourism: build on the server, database, logins, demo data.** `<TOUR_SHA>` is `3b023ac57c8421a82f2d705e8b1065f088adffed`, Tourism `main` after TOU-1 (tourism-platform PR #13, hosting hardening), pinned as `tourism` in `ads-release-20261113-tourism.manifest.json` and `nine-platform-rollout.json`. Tourism's own `deploy/demo/RELEASE.md` at that commit is the reference; the kit-specific points are below. Run the block in its own `bash`, as in step 2.

   a. **Build both images on the server from the exact commit** (same pattern as the Identity image in step 2: hard stop on the wrong commit, build only from `git archive`, SHA in the tag and the OCI revision label):

       cd /opt/ads/tourism-platform
       TOUR_SHA=3b023ac57c8421a82f2d705e8b1065f088adffed
       git fetch origin main && git checkout --detach "$TOUR_SHA"
       git merge-base --is-ancestor "$TOUR_SHA" origin/main && test "$(git rev-parse HEAD)" = "$TOUR_SHA" || { echo STOP_WRONG_COMMIT; exit 1; }
       test -z "$(git status --porcelain -- deploy/demo)" || { echo STOP_DEPLOY_FILES_NOT_CLEAN; exit 1; }    # compose.yml is used from this checkout
       build="$(mktemp -d)" && git archive "$TOUR_SHA" | tar -x -C "$build"
       docker build --label org.opencontainers.image.revision="$TOUR_SHA" -t "ads-tourism:$TOUR_SHA" "$build"
       docker build -f "$build/deploy/demo/Dockerfile.demo-tools" --build-arg API_IMAGE="ads-tourism:$TOUR_SHA" \
         --label org.opencontainers.image.revision="$TOUR_SHA" -t "ads-tourism-demo-tools:$TOUR_SHA" "$build"
       rm -rf "$build"
       docker image inspect -f '{{.Id}}' "ads-tourism:$TOUR_SHA" "ads-tourism-demo-tools:$TOUR_SHA" | tee /var/lib/ads-demo/operator-secrets/tourism-images-tou1.txt

   b. **Env file** `/var/lib/ads-demo/operator-secrets/tourism.env` (from `deploy/demo/tourism.env.example`, `chmod 600`): `TOUR_DEMO_IMAGE=ads-tourism:<TOUR_SHA>`, `TOUR_DEMO_TOOLS_IMAGE=ads-tourism-demo-tools:<TOUR_SHA>`, `TOUR_DEMO_PLATFORM_TENANT_ID` = `products.tourism.tenants.staff` from the step 4 tenants file, and **three different database passwords**, each `openssl rand -hex 32` (hex only, they go into `postgres://` URLs): `TOUR_DEMO_DB_PASSWORD` (owner), `TOUR_DEMO_API_DB_PASSWORD` (`tour_api`) and the new **`TOUR_DEMO_WORKER_DB_PASSWORD`** (`tour_api_worker`, TOU-1). Leave `TOUR_DEMO_TRUSTED_PROXIES`, `TOUR_DEMO_EDGE_SUBNET` and `TOUR_DEMO_EDGE_GATEWAY` empty unless c. says otherwise. Then `docker compose -f deploy/demo/compose.yml --env-file /var/lib/ads-demo/operator-secrets/tourism.env config -q` is silent.

   c. **Fixed `edge` subnet check (before the first `up`).** TOU-1 fixes the app's `edge` network at `172.30.130.0/24` (gateway `172.30.130.1`, the only address besides loopback whose `X-Forwarded-For` the app believes). No ADS demo Compose file in the kit or in the other products (Commerce, Agriculture, Fleet Guard, Tontine, Education, VentureWorks, Morphoo) pins a subnet, but Docker gives networks created without one whole `/16` blocks from `172.17–31.0.0/16`, so on a busy host `172.30.0.0/16` may already be taken, which Tourism's own `ip route | grep -c '172\.30\.130\.'` would not see. This prints `FREE` (exit 0), or the overlapping networks and routes (exit 1); it exits 2 with `NO_ROUTES_READ` if no route was read (for example `ip` failed), which is not a pass:

       TOUR_EDGE_BR="br-$(docker network inspect -f '{{printf "%.12s" .Id}}' ads-tourism-demo_edge 2>/dev/null)"   # empty on the first run
       { docker network ls -q | xargs docker network inspect -f '{{.Name}} {{range .IPAM.Config}}{{.Subnet}} {{end}}'; \
         ip -4 route | awk '{d="-"; for(i=2;i<NF;i++) if($i=="dev") d=$(i+1); print "route:" d, $1}'; } \
         | python3 -I /opt/ads/demo-platform-kit/deploy/contabo-demo/check-subnet-free.py 172.30.130.0/24 "$TOUR_EDGE_BR"

      `check-subnet-free.py` (kit, read-only) also catches host routes written without `/` (treated as `/32`) and ignores `default` and IPv6 subnets. On a **re-run**, Tourism's own `ads-tourism-demo_edge` network and its own bridge route (`br-<first 12 characters of the network id>`, the `TOUR_EDGE_BR` line) are expected and skipped; anything else it prints is a clash.

      If it is not `FREE`, pick a `/24` for which the same command (with that `/24` in place of `172.30.130.0/24`) prints `FREE`, set `TOUR_DEMO_EDGE_SUBNET` and `TOUR_DEMO_EDGE_GATEWAY` (its `.1`) in `tourism.env`, and check again. A missed clash makes `up` stop with "Pool overlaps", and nothing starts.

   d. **Database, migrations, then the two app logins** (RELEASE.md steps 3-5). Back up the Tourism database first if it already holds data. Step 5 runs **after migrating**, on every release: it creates `tour_api` (requests, member of `tour_app` only) **and** `tour_api_worker` (signed payment webhook and background worker, member of `tour_worker` only; the app's second pool, `WORKER_DATABASE_URL`), and closes the database to PUBLIC. It prints `"msg":"runtime logins ready"`, or exits 1 with `runtime login refused`:

       C="docker compose -f deploy/demo/compose.yml --env-file /var/lib/ads-demo/operator-secrets/tourism.env"
       $C up -d db
       $C --profile migration run --rm migrate          # migrations applied: N (includes 007_harden_function_grants.sql)
       $C --profile migration run --rm runtime-login    # "runtime logins ready"

   e. **Demo data** with the step 4 tenants file mounted; the seed records the demo trips under the visitor's own workspace:

       $C --profile demo-seed run --rm demo-seed

      It prints `{"product":"tourism","inserted":N,"reset":false}`. If the Tourism seed ever ran **before** this change, **first back up the Tourism database** (protected dump of `tourism_demo` from the `db` service, recorded with path, time and checksum outside any repository, restore tested in a separate database), then run it once with `--reset` instead: it rebuilds only the seeded demo trips, operators and listings, so the trips move to the visitor's workspace; testers' own bookings are kept.

   f. **Start** (RELEASE.md step 7): `$C up -d commerce-pos-mock settlement-mock tourism`; `$C logs tourism | tail -n 3` shows every provider in mock mode. `TOUR_DATABASE_LOGIN_UNSAFE` means one of the two logins is not restricted to its one role: stop and repeat d.
6. **HTTPS** for `tourism.demo.africadigitalsynergy.com` → `127.0.0.1:18130` with the guarded publisher pattern (RELEASE.md step 8). The Tourism Nginx site must pass the visitor's address exactly as the kit's publishers (`publish-demo-commerce.py`, `publish-demo-login.py`) do: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`, `X-Real-IP $remote_addr` and `X-Forwarded-Proto https`. TOU-1 limits public pages per visitor address and believes that header only from loopback and the `edge` gateway, so nothing else is set in the app. Then the **release acceptance check**:

       bash deploy/contabo-demo/release-acceptance.sh --plan --product tourism --manifest deploy/contabo-demo/ads-release-20261113-tourism.manifest.json
       bash deploy/contabo-demo/release-acceptance.sh --product tourism --manifest deploy/contabo-demo/ads-release-20261113-tourism.manifest.json
       bash deploy/contabo-demo/release-acceptance.sh                              # the six products of ads-release-20261111b; Tourism shows INFO "skipped"

   Every Tourism line must be `PASS` (Demo Access switch and secrets show as `INFO`: Tourism has no product-side grant check). The Tourism manifest is run with `--product tourism` only: a full run with it FAILs the six other products as not pinned, by design. Then check in a browser, desktop English and 360 px French: visitor books a demo-operator visit and pays in Test mode → site operator accepts → gate agent scans the ticket. Only then set `"tourism": "open"` in `/etc/ads-demo/portal/demo-activation.json` (§G2).

Rollback, in this order:

1. Set Tourism to `preparing` (or `unavailable`) in `/etc/ads-demo/portal/demo-activation.json`.
2. Stop the Tourism app and take its site offline, keeping every volume and the database: from `/opt/ads/tourism-platform`, `$C stop tourism` (with `C` as in step 5d; never `down -v`), then disable its Nginx site and reload: `rm /etc/nginx/sites-enabled/tourism.demo.africadigitalsynergy.com && nginx -t && systemctl reload nginx` (the file in `sites-available` stays, so re-enabling is one `ln -s`).
3. Redeploy the previous Identity image: put back `/etc/ads-demo/images.env.before-tou0` (its `ADS_DEMO_IDENTITY_IMAGE` is the image recorded in `identity-image-before-tou0.txt`), then `docker compose --env-file /etc/ads-demo/images.env -f deploy/contabo-demo/compose.identity.yml up -d --no-deps identity` and check `/health` and the issuer as in step 2.
4. From that previous image, re-register `tourism-web` (§E3.1 dry run, then `--apply`), then run `demo-bootstrap` and `demo-orgs` inside `ads-demo-identity` as in step 4 (written to `/tmp`, not copied over the operator file). This puts the personas back where the previous image's lists place them.
5. Put back `demo-tenants.json.before-tou0` as `/var/lib/ads-demo/operator-secrets/demo-tenants.json`.
6. If the Tourism seed has to follow, back up the Tourism database first, then run the seed with `--reset`.

If the Identity database itself must be restored, restore the step 1 backup into a separately verified database before a supervised cutover. Never delete visitor data or volumes, and never use `down -v`.

Deferred to the next phase (not in TOU-0):
- A Tourism `/demo/personas` page. Until then the Demo Access entry address is the Tourism home page and visitors pick a persona on the shared ADS sign-in.
- Tourism's own no-access card, then `demo_access_denied_redirect: true`.
- A product-side Demo Access grant check in Tourism (check secret, `TOURISM_DEMO_ACCESS` switch) and, once it exists, adding `tourism` to `PRIVATE_VISITOR_PLATFORMS` (`services/identity/src/demo-access.mjs`). Only then do Identity's visitor token limits (roles narrowed to the grant's personas at code exchange and each refresh) and expiry or revocation apply to Tourism visitors. Until then Tourism is in the registry only and private operator provisioning refuses it.
- Demo data for approved visitors' own copies (`visit-*`): their site operator starts with an empty organisation because Tourism has no per-visitor seed worker yet.

#### E3.3 Morphoo demo access (MOR-9, 13 November 2026)

**Needed only when Morphoo PR #50 (MOR-9, demo access) is deployed.** Hosting Morphoo `main` privately today does not need any of this: with `MORPHOO_DEMO_ACCESS` off (the default), Morphoo does not call the grant check and signs people in exactly as before.

What the kit changes (kit side of Morphoo PR #50, as listed in Morphoo `docs/delivery/MOR-9_DEMO_ACCESS.md`, "Kit changes"):

- `config/demo-access-platforms.json`: Morphoo (key `morphoo`, prefix `MOR`, client `morphoo-web`, origin `https://morphoo.demo.africadigitalsynergy.com`, entry `/demo/personas`) with the six visitor personas, keyed as in Morphoo `scripts/ops/demo-personas.mjs`: `member`, `mentor`, `ministry-lead`, `pastoral-care`, `church-admin`, `content-steward`. Every one is in the visitor's own `main` organisation (their demo church): each approved visitor gets a separate `main` organisation in their `visit-*` set.
- `config/demo-personas.json`: `content-steward` moves from the ADS staff organisation (ADS-only role `content_steward`, refused for visitors) to `main` with role `member`; Morphoo gives it the church appointment `content_steward` inside the visitor's demo church. New `platform-admin` (ADS staff organisation, `super_admin` + `pcc_admin`, `internal_only: true`): internal ADS QA only, never offered to a visitor (the registry refuses to list it).
- `config/clients.demo.json`, `morphoo-web`: `https://morphoo.demo.africadigitalsynergy.com/demo/personas` added to the sign-in return addresses; `demo_access_denied_redirect` stays `false` (Morphoo shows its own refusal page).
- Grant-check secret `DEMO_ACCESS_CHECK_SECRET_MORPHOO` (Identity), same value as `MORPHOO_DEMO_ACCESS_CHECK_SECRET` (Morphoo env file, passed to the container as `DEMO_ACCESS_CHECK_SECRET`).

Steps (operator, GPT), only after Morphoo #50 is merged and its images are built on the server from that merge commit:

1. **Back up Identity** and keep `demo-tenants.json.before-mor9`, as in §E3.2 step 1 (marker `identity-backup-<date>.marker`).
2. **Rebuild the Identity image on the server** from the kit merge commit of this change, exactly as §E3.2 step 2 with `KIT_SHA=<kit merge commit>`: hard stop on the wrong commit, clean checkout including ignored files, build from `git archive`, record the previous tag and image ID (`identity-image-before-mor9.txt`), `images.env` changed only on the Identity line (`images.env.before-mor9`), `up -d --no-deps identity`, then the running-image, demo-mode and no-placeholder checks, health and issuer. The Identity secret is added in the same window: append `DEMO_ACCESS_CHECK_SECRET_MORPHOO=<openssl rand -hex 32>` to the protected `/etc/ads-demo/identity.env` before `up` (never printed; `identity.env` is root-only), and check it inside the container by presence only: `docker exec ads-demo-identity sh -c '[ ${#DEMO_ACCESS_CHECK_SECRET_MORPHOO} -ge 32 ]' && echo MORPHOO_SECRET_PRESENT`.
3. **Re-register `morphoo-web`: dry run, then apply.**

       bash deploy/contabo-demo/register-identity-client.sh morphoo-web --backup-confirmed /var/lib/ads-demo/operator-secrets/identity-backup-<date>.marker
       bash deploy/contabo-demo/register-identity-client.sh morphoo-web --backup-confirmed /var/lib/ads-demo/operator-secrets/identity-backup-<date>.marker --apply

   The dry run must show only the added `https://morphoo.demo.africadigitalsynergy.com/demo/personas` redirect address.
4. **demo-bootstrap and demo-orgs with the `.new` preview**, exactly as §E3.2 step 4 (`demo-orgs --out /tmp/demo-tenants.json`, copied to `demo-tenants.json.new`, the changed-ids preview, then the copy into place). Expected changes: `morphoo.personas.content-steward` moves from the staff organisation's tenant to `morphoo.tenants.main`, and the new `morphoo.personas.platform-admin` appears (staff tenant). Every `*.tenants.*` id stays the same; stop and keep the old file otherwise.
5. **Morphoo host settings** in `/var/lib/ads-demo/operator-secrets/morphoo-demo.env` (root-only): `MORPHOO_DEMO_ACCESS=1`, `MORPHOO_DEMO_ACCESS_IDENTITY_URL=https://login.demo.africadigitalsynergy.com`, `MORPHOO_DEMO_ACCESS_CHECK_SECRET=<the same value as DEMO_ACCESS_CHECK_SECRET_MORPHOO>`. Recreate the Morphoo app with its own Compose (`docker compose -f deploy/demo/compose.yml --env-file …/morphoo-demo.env up -d …`, Morphoo `deploy/demo/RELEASE.md`) and check presence only: `docker exec <morphoo app container> sh -c '[ "$MORPHOO_DEMO_ACCESS" = 1 ] && [ ${#DEMO_ACCESS_CHECK_SECRET} -ge 32 ]' && echo MORPHOO_DEMO_ACCESS_ON`.
6. **Turn off the credential display on the sign-in page**: the shared demo passwords are shown only with `DEMO_SHOW_CREDENTIALS=1`; set `DEMO_SHOW_CREDENTIALS=0` in `/etc/ads-demo/identity.env` (Identity refuses to start in private mode with it on: `DEMO_ACCESS_PRIVATE_CREDENTIALS_MUST_BE_HIDDEN`). Check, printing nothing else: `grep -qx 'DEMO_SHOW_CREDENTIALS=0' /etc/ads-demo/identity.env && docker exec ads-demo-identity sh -c '[ "${DEMO_SHOW_CREDENTIALS:-0}" != 1 ]' && echo CREDENTIALS_HIDDEN`, and `curl -fsS 'https://login.demo.africadigitalsynergy.com/login?lang=en' | grep -c 'Use demo account'` prints `0`.
7. Check in a browser (desktop English, 360 px French): a visitor signs in, sees the six personas on `/demo/personas`, switches persona, and is refused on a page outside their persona; the platform-admin persona is never shown.

Rollback: Morphoo `MORPHOO_DEMO_ACCESS=0` and recreate the Morphoo app; then the §E3.2 rollback order with the `-before-mor9` files (previous Identity image, re-register `morphoo-web`, demo-bootstrap and demo-orgs from it, then `demo-tenants.json.before-mor9`). Never delete visitor data or volumes.

Deferred to the next phase (not in this change):
- **Morphoo in `PRIVATE_VISITOR_PLATFORMS`** (`services/identity/src/demo-access.mjs`). The demo host runs in private mode (`DEMO_ACCESS_PRIVATE_ENABLED=1`, public requests answer 404), so Morphoo visitors can be provisioned (`demo-visitor-provision --platform morphoo`), and Identity's visitor token limits, expiry and revocation apply to Morphoo sign-ins, only once Morphoo is added there. That is an Identity code change that needs its own review, as Fleet Guard (7 Nov) and VentureWorks (11 Nov) had, with a private-visitor test file like `ventureworks-private-visitor.test.mjs`.
- Seeding each visitor's own demo church (Morphoo MOR-10), the visitor not owning their demo church (MOR-10), the browser journey for persona switch and refusal (MOR-10), and Morphoo's own no-access card (then `demo_access_denied_redirect: true`).

## F. Commerce integrated demo THIRD (in Commerce repository)

See `ksondo/ADS-Commerce-Platform/deploy/demo/DEPLOYMENT_GATE.md`. The demo API, web and forward-only migrator images must come from **one reviewed Commerce commit**. Provision a dedicated commerce demo PostgreSQL instance, apply migrations as a schema owner, then run the app under `commerce_demo_app` with tenant RLS enabled. Test public e-commerce and restricted cashier/merchant POS separately.

Run persistent demo fixture seeding and scheduled cleanup/reset ONLY after accepting safe demo products, stores, counts and roles. No real payments, banks, providers, production credentials or merchant/customer records are part of this demo.

### F2. Publish Commerce demo HTTPS — staged and isolated

The Commerce images from the reviewed release have been started in isolated containers, with demo web bound **only** to 127.0.0.1:18086. The operator confirmed GET /commerce and GET /api/ready through the local Commerce frontend both return HTTP 200, with the API reporting ready_for_internal_checks, schema 001–023 and EXTERNAL_SIGNOFF_REQUIRED. These indicate **internal readiness**, not production certification. For NODE_ENV=demo, the API's legacy productionOperationsEnabled field reflects enabled **demo transaction writes**, not access to any live payment provider, settlement or banking operation. Keep real integrations absent and demo data isolated.

Use the dedicated guarded publisher, modeled on the successfully deployed demo-login publisher. It only operates on /etc/nginx/sites-available/commerce.demo.africadigitalsynergy.com and its matching symlink; it refuses preexisting/unrecognized sites, hostname collisions, unexpected DNS/IP/IPv6, wrong Docker loopback port, failed Commerce readiness, incorrect certificate name and invalid Nginx syntax. It does not edit the Commerce database, Docker stack, identity, portal, CoreStack, Software Factory or RAG.

    cd /opt/ads/demo-platform-kit
    git pull --ff-only origin main
    python3 deploy/contabo-demo/publish-demo-commerce.py --check

After a **PASS** preflight, add a temporary HTTP-only Nginx site that serves only the Let's Encrypt challenge (everything else returns 404). It will roll back on probe or reload failure:

    python3 deploy/contabo-demo/publish-demo-commerce.py --prepare-acme

**Do not issue a certificate** unless the output contains ADS_COMMERCE_ACME_READY=PASS. Separately prove the challenge is reachable using public DNS, not just Nginx loopback:

    root=/var/www/ads-demo-commerce-acme/.well-known/acme-challenge
    challenge="$(mktemp "$root/ads-commerce-public-XXXXXXXX")"
    printf 'ADS_COMMERCE_HTTP_OK' > "$challenge"
    chmod 644 "$challenge"
    curl --noproxy '*' -fsS --max-time 12 "http://commerce.demo.africadigitalsynergy.com/.well-known/acme-challenge/$(basename "$challenge")"
    rm -f "$challenge"

The response must be exactly ADS_COMMERCE_HTTP_OK. If curl fails, delete that temporary challenge file and diagnose DNS, firewall, Nginx and HTTP routing; do not use certbot --nginx or stop other apps.

After both checks pass, issue **only** the new Commerce certificate:

    certbot certonly --webroot \
      -w /var/www/ads-demo-commerce-acme \
      -d commerce.demo.africadigitalsynergy.com \
      --cert-name commerce.demo.africadigitalsynergy.com

After successful certificate issuance:

    python3 deploy/contabo-demo/publish-demo-commerce.py --activate-https
    curl -fsS https://commerce.demo.africadigitalsynergy.com/api/ready
    curl -fsSI https://commerce.demo.africadigitalsynergy.com/commerce

The publisher validates/reloads Nginx and tests Commerce HTTPS with real certificate verification, the exact hostname/SNI and both frontend and API routes. If the HTTPS smoke fails it restores its backed-up HTTP-only site under /var/backups/ads-demo-commerce/. Run external browser smoke after local PASS. Do **not** equate HTTP 200 with business or role acceptance.

Only then run the Commerce client callback command in section E3. Do NOT rerun demo bootstrap. Verify browser PKCE sign-in/out, seller/checkout/POS roles, tenant isolation and seed/reset acceptance before activating the public portal's Commerce links.


## G. Cross-application acceptance and activating portal links

Only after verified HTTPS links and browser E2E, set `apps/demo-portal/catalogue.json` demoUrl fields through a reviewed PR:
- Commerce platform and E-commerce: `https://<approved-commerce-host>/commerce`
- POS: `https://<approved-commerce-host>/commerce/merchant/pos`

Run the journey: public portal → choose Commerce → browse e-commerce → sign in via shared demo identity → authorize with PKCE and return to Commerce → cashier POS allowed only with the correct roles; buyer without cashier role denied. Test EN/FR, logout, expiring session, tenant isolation, and demo reset. The domain placeholder above is NOT a live link.

### G1. Release acceptance before opening a product (11 November 2026)

On the Contabo host, from the pinned kit checkout, run the read-only check and open nothing that has a `FAIL` line:

    bash deploy/contabo-demo/release-acceptance.sh --plan                       # what will be checked, no docker/network
    bash deploy/contabo-demo/release-acceptance.sh                              # all six products
    bash deploy/contabo-demo/release-acceptance.sh --product digital-tontine    # one product

Product ids are the portal/catalogue ids: `commerce`, `education`, `agriculture`, `fleet-guard`, `digital-tontine`, `ventureworks`. Per product it checks the running image against `ads-release-20261111b.manifest.json` (the default; `--manifest FILE` for another), Identity client drift and `/authorize`, the demo access switch and grant-check secrets (yes/no only), the seed worker, `ads-identity.js` and static file permissions, health and the issuer. Container names default to each product's reviewed Compose project; confirm with `docker ps` and override with the `ADS_ACC_*` variables documented at the top of the script. Fix client drift with §E3.1. When the manifest enables `sector_link`, it also checks that each listed service client is registered, active, matches the reviewed scopes and audiences and has a secret set (yes/no only); see `ADS_RELEASE_20261111B.md`.

### G2. Switch a product's portal demo on or off without a rebuild

`compose.portal.yml` mounts the host directory `/etc/ads-demo/portal` read-only at `/etc/ads-portal-operator` (override with `ADS_PORTAL_OPERATOR_DIR`). The portal serves `/etc/ads-demo/portal/demo-activation.json` at `/demo-activation.json` when it exists, and otherwise the bundled file, where every product is `preparing`. No other file in that directory is served.

    install -d -m 0755 /etc/ads-demo/portal
    install -m 0644 apps/demo-portal/demo-activation.json /etc/ads-demo/portal/demo-activation.json
    # edit: set only the accepted product to "open"; keys exactly as in catalogue.json:
    # education, agriculture, digital-tontine, fleet-guard, ventureworks
    curl -fsS https://demo.africadigitalsynergy.com/demo-activation.json

The first deployment with the mount needs `deploy-portal.sh` (container recreated); after that, edits take effect on the next page load. Rollback: set the product back to `preparing` or `unavailable`, or delete the host file (bundled file applies). Commerce keeps its own link and is not managed by this file.

## H. Claude/ChatGPT updates later

1. Claude updates the owning GitHub repository on a feature branch, with BRS/FRS and E2E traceability.
2. PR CI verifies the new commit; merge after review.
3. Main publishes a *new immutable image tag*, without changing what currently runs on Contabo.
4. Deploy operator or a future approved GitHub self-hosted runner selects that exact tag; image promotion includes canary and health tests, and a rollback to previous tag if needed.
5. Identity/Commerce database migrations require a **pre-migration backup** and tested restore because schema migrations are forward-only; image rollback alone does not roll back database changes.
6. The portal updates without redeploying its child apps; each child app updates without rebuilding the portal, unless its approved demo URL or catalogue metadata changes.

Do not use `docker system prune -a --volumes` and do not remove, restart or migrate `africorestack-identity`, `africorestack-identity-postgres`, Software Factory, or RAG infrastructure in this release.

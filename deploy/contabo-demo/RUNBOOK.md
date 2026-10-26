# Contabo ADS Demo Gateway — incremental deployment runbook (22 October 2026)

## Outcome and separation
The public ADS ecosystem portal, dedicated demo login server and Commerce's integrated E-commerce/POS are three independently versioned services. This plan uses GitHub as source of truth; tests and immutable GHCR images precede each deployment.

**Existing Contabo VPS**: `vmi3191089` at `161.97.128.153`. The old Software Factory identity container `africorestack-identity` and its database `africorestack-identity-postgres` must never be stopped, removed, migrated or modified by this runbook. Never run `deploy/docker-compose.yml` over the live identity server: it is NOT the isolated demo configuration.

Known occupied: `18084` RAG runtime, `18085` public retail container, `18088` nginx. Preserve these services and do not reassign their ports.

Proposed reserved loopback ports (verify available first):
- Portal: `127.0.0.1:18089` (independent lightweight nginx)
- ADS demo identity: `127.0.0.1:18090` (separate Postgres 16 volume `ads-demo-identity-postgres`)
- Commerce demo: `127.0.0.1:18086` (separate Postgres DB/volume, in Commerce repo)

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
      --assignable-roles merchant_owner,commerce_manager,commerce_cashier,commerce_accountant,bank_officer,bank_agent

The CLI update keeps the existing demo identities, memberships, product-role grants, signing key, database volume and client secret state unchanged. It updates only the approved registration and records an identity audit event. It does replace the former test callback URI, so do this only when Commerce is actually deployed and ready for the new hostname.

Verify registration without exposing credentials:

    docker exec ads-demo-identity node --input-type=module -e 'import pg from "pg"; const p=new pg.Pool({connectionString:process.env.DATABASE_URL});try{const r=await p.query("SELECT client_id,redirect_uris,post_logout_redirect_uris FROM platform.oauth_clients WHERE client_id=$1",["commerce-web"]);console.log(JSON.stringify(r.rows[0]??null))}finally{await p.end()}'

Expected exact callback and post-logout URI: `https://commerce.demo.africadigitalsynergy.com/`. Continue browser PKCE sign-in/out and role/tenant isolation E2E after the hostname is serving Commerce over valid HTTPS.

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

## H. Claude/ChatGPT updates later

1. Claude updates the owning GitHub repository on a feature branch, with BRS/FRS and E2E traceability.
2. PR CI verifies the new commit; merge after review.
3. Main publishes a *new immutable image tag*, without changing what currently runs on Contabo.
4. Deploy operator or a future approved GitHub self-hosted runner selects that exact tag; image promotion includes canary and health tests, and a rollback to previous tag if needed.
5. Identity/Commerce database migrations require a **pre-migration backup** and tested restore because schema migrations are forward-only; image rollback alone does not roll back database changes.
6. The portal updates without redeploying its child apps; each child app updates without rebuilding the portal, unless its approved demo URL or catalogue metadata changes.

Do not use `docker system prune -a --volumes` and do not remove, restart or migrate `africorestack-identity`, `africorestack-identity-postgres`, Software Factory, or RAG infrastructure in this release.

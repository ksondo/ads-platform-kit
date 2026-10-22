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

## F. Commerce integrated demo THIRD (in Commerce repository)

See `ksondo/ADS-Commerce-Platform/deploy/demo/DEPLOYMENT_GATE.md`. The demo API, web and forward-only migrator images must come from **one reviewed Commerce commit**. Provision a dedicated commerce demo PostgreSQL instance, apply migrations as a schema owner, then run the app under `commerce_demo_app` with tenant RLS enabled. Test public e-commerce and restricted cashier/merchant POS separately.

Run persistent demo fixture seeding and scheduled cleanup/reset ONLY after accepting safe demo products, stores, counts and roles. No real payments, banks, providers, production credentials or merchant/customer records are part of this demo.

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

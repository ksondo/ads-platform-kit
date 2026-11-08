# One GitHub activity -> Contabo: Education, Agriculture, Fleet Guard, Tontine and ADS demo portal

**Status:** source-only operator candidate. Nothing runs automatically. The GitHub manual
workflow is .github/workflows/contabo-five-demo-release.yml, displayed under
Actions as **Contabo - five ADS demos (one manual release)**. It is available after
the reviewed PR merges into default branch.

## What one click does

Click **Actions -> Contabo - five ADS demos (one manual release) ->
Run workflow -> operation: preflight** to get read-only/service preflight results.
The GitHub runner opens one host-key-pinned SSH connection to Contabo and streams
the versioned batch-release.py source through Python stdin. **Contabo itself**
uses its own *read-only private-repository SSH deploy keys* to fetch all five
repository histories, verify each pinned commit is on origin/main, and check
Compose/port/DB isolation. This never needs an SSH password or GitHub token in chat.

When every required gate is evidenced, choose **operation: deploy** and enter
DEPLOY-ADS-FIVE. That single GitHub run builds five pinned Docker image candidates,
then recreates *only* the approved existing application services sequentially
(Education -> Agriculture -> Fleet Guard -> Tontine -> portal). Privileged seed
workers are only recreated when explicitly enabled in protected host config.
Each app undergoes a local /health (portal /) check. On failure the runner
attempts an **app-image-only rollback** in reverse order and stops. It neither
creates/replaces databases nor executes migrations or seeds.

This is ONE controlled deploy activity, **not a single atomic distributed
transaction**. Human/host checks are necessary before a deploy or before
opening the public demo links. A success means local application health, NOT
a completed live HTTPS/OIDC/tenant-isolation/UX acceptance.

## Exact pinned source (update by new reviewed PR, never floating main)

| Product | Repository | Source SHA |
|---|---|---|
| Education | ksondo/Education-and-intelligent-services | 226662b8ba97b813f713a23c2bb50c1e5b233b1e |
| Agriculture | ksondo/Agriculture | bba34165726c51c5091f4ceff7547657e03aca2f |
| Fleet Guard | ksondo/Fleet-guard-and-intelligent-services | 4bb4ef21817e14bbba98457ba83f60a72f5caf12 |
| Tontine | ksondo/Digital-tontine-and-intelligent-services | e9b1cd622701b4b6d411755efef8d7928ac151d5 |
| Demo portal | ksondo/ads-platform-kit | 4fad211011f905dd199294ccb9f952cd5e9a1168 |

The release matrix is deploy/contabo-demo/batch-release.manifest.json.
The portal is updated *last*, keeping Commerce and old portal functionality
untouched during application updates. The four new launch switches remain
PREPARING; no public "Open demo" link is enabled by this workflow.

## One-time GitHub setup (an authorized owner/DevOps operator)

In ksondo/ads-platform-kit -> Settings -> Environments create the protected
environment **contabo-demo-release**, restrict deployment to main and configure
**required reviewers**; grant permission only after inspection of the SHA matrix,
CI, release approval, and host evidence. GitHub does not necessarily protect a
new environment unless you configure required reviewers.

Create **environment secrets** (never commit or paste values into ChatGPT):
- CONTABO_DEPLOY_SSH_KEY: dedicated private SSH key allowed on the Contabo host.
- CONTABO_DEPLOY_KNOWN_HOSTS: server's verified SSH host-key record (verify out
  of band; do not blindly trust ssh-keyscan output).
Create **environment variables**:
- CONTABO_DEPLOY_HOST: the operator-verified current Contabo hostname/IP.
- CONTABO_DEPLOY_USER: dedicated deploy account (or existing root, if authorized).
A non-root deploy account needs narrowly controlled passwordless sudo for
the reviewed batch release; a generic unrestricted sudo account is not advised.

Contabo must already permit its release operator to clone the five *private*
GitHub repos using separate read-only deploy keys or an appropriately restricted
machine identity. This is **server-side Git access**: GitHub Actions does not
copy application source archives or deliver database secrets.

## One-time Contabo setup

Run the following locally on Contabo as the authorized operator; do not
paste the filled secrets, files or database connection strings into chat:

1. Inspect live Docker Compose project labels and names, upstream ports,
   Nginx, current images and DB/Identity. The source examples are NOT proof of
   current server state.
2. Copy deploy/contabo-demo/batch-release-host.example.json to
   /etc/ads-demo/batch-release-host.json (root-owned 0600). Replace all
   REPLACE_WITH_LIVE_* project values with the **actual** Compose project labels,
   and confirm private operator env file paths. Fleet Guard example port 8793
   is a fallback, NOT an observed live port. Preserve Education **18501**,
   Tontine **18505**, Agriculture **18140**, portal **18089** only if they
   match the observed host. The runner rejects mismatches; do not move Nginx.
3. In Actions run **preflight**. This stages exact Git commits under
   /var/lib/ads-demo/batch-release-sources/<release_id>/ and checks running
   services, already-installed databases, static privileged seed-worker
   isolation, existing env files, source SHA, server hostname, and port binding.
   If a service is not yet installed, **STOP** and use that product's reviewed
   initial-install runbook with Codex; this upgrade runner intentionally cannot
   initialize a database or create a new host service.
4. Complete independent security assessment and real-screen UX/keyboard and
   200% zoom review, especially Tontine's privileged worker and fictional
   maker/checker actors. Verify actual deployed ADS Identity configuration and
   grant expiry/revocation. Record protected **backups AND isolated restores**
   for each existing product database and shared Identity. Reconcile schema
   migrations BEFORE app-only deployment (this batch never runs migrations).
   Coordinate/pause the existing portal-owner release controller so it cannot
   undo a portal image switch.
5. Copy deploy/contabo-demo/batch-release-approval.example.json to
   /etc/ads-demo/batch-release-approval.json (root-owned 0600). Set
   manifest_sha256 to the **MANIFEST_SHA256** emitted by the preflight log.
   Fill real evidence references and mark each gate true **only when actually
   verified and signed off** by an authorized human. Reviewers must approve
   the exact five SHAs, including Education's prior 085/086 schema state.
6. Run **deploy** with the required typed confirmation. Retain previous
   images and protected env. Record new image digests and the GitHub run URL.

For reference: on Contabo, find existing Compose labels without exposing secrets:

    docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
    docker inspect <existing-app-container> --format '{{index .Config.Labels "com.docker.compose.project"}}'
    docker compose version

Do NOT initialize or migrate an existing product database from this batch
action. Do NOT use docker compose down -v, prune, seed --reset, change payment
provider to live, publish a database port, reconfigure shared Identity or
expose the privileged seed worker.

## After successful image updates: separate live acceptance and publication

Check each HTTPS /health, current ADS Identity callbacks, sign-in and **private
grant**, test-only EN/FR workflows at 360/768/1280 and real 200% browser zoom,
two-visitor separation, denied access, 30-day expiry and revocation <=60s,
mock-only financial actions and rollback readiness. Preserve independent
security and owner approval records.

Only after this evidence is accepted can the operator set the four entries in
apps/demo-portal/demo-activation.json to open through an approved portal
release, or mount a reviewed **operator-owned read-only** activation file in
the portal container as described in docs/demo-access/DEMO_PUBLICATION_CONTRACT.md.
Never confuse live app health with authorization to activate public demo links.

**Current blockers:** a first preflight cannot be declared passing without
Contabo access and configured SSH; remaining independent approvals, actual
host project labels/ports, protected backup+restore and live Identity acceptance
are unknown here. This PR does not assert they are complete.

## Limitations and rollback

Rollback only changes the affected application image and NEVER touches
DB/Identity volumes. If an old image is schema-incompatible, stop and do a
reviewed forward fix rather than blindly restoring old SQL. The portal owner's
separate release controller must remain coordinated after this batch operation;
otherwise an older approved image could replace the new portal again.

GitHub CI for this activity performs static checks **without** connecting to
Contabo. The actual workflow is manual-only. It never schedules a nightly job
and never runs on push/PR.

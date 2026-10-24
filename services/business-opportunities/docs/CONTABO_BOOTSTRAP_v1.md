# ADS Business Opportunities — Contabo database and API bootstrap

This is an independent, additive service for the existing ADS demo portal. Never repurpose Commerce/Identity data or change current login, pages or Nginx during the bootstrap.

Verified server preflight: VPS vmi3191089, 107 GB available, ports 18086 Commerce, 18089 Portal, 18090 Identity, and 18190 available. Existing Nginx syntax passes; CoreStack hostname warnings predate this feature.

The script at services/business-opportunities/scripts/bootstrap-contabo.sh is intended for an authorized root operator. **Run only from an immutable root-owned git archive of a reviewed green commit**, not a mutable runner checkout.

Actions:
1. Validate hostname/root, existing ADS services, available port and disk, and acquire an exclusive lock.
2. Create separate root-only /etc/ads-demo/opportunities.env and /etc/ads-demo/opportunities-api.env. Do not print secrets or copy them to the chat.
3. Build API and operator-only seed images from the pinned source. Start an independent PostgreSQL 16 Docker service with a dedicated named volume and **no published DB port**.
4. Apply the two forward-only SQL migrations. Provision a distinct PostgreSQL reader with SELECT grants, separate from schema-owner credentials.
5. Import 333 mappings and 122 summaries idempotently; assert 50 sectors, 333 mappings, 52 business profiles, 21 category groups and 122 business/institutional summaries.
6. Start the read-only API bound solely to 127.0.0.1:18190, with local HTTP smoke tests.
7. **Leave all existing Nginx, portal, Identity and Commerce services exactly as they were.**

A second, independently reviewed, backed-up Nginx change is required to expose only /api/opportunities/v1/ through the existing demo.africadigitalsynergy.com HTTPS virtual host. The proxy must preserve the complete URI path by using proxy_pass http://127.0.0.1:18190 **without a trailing path slash**. Run nginx -t and full public HTTP smoke checks; only then can the root-owned Software Factory approved portal publisher promote the new Business Opportunities page.

No database resets or destructive Docker cleanup are permitted. If anything fails, preserve the isolated database volume and review the failed step.

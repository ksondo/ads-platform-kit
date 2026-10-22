# ADS Digital Ecosystem — demo portal

Independent, lightweight, public portal in `apps/demo-portal`, using the ADS navy-and-gold visual direction from the approved concept. This is not the ADS corporate site.

## User journeys

- `/`: Africa-themed hero, search, featured sector-platform cards, featured Commerce section with POS and E-commerce, and partnership CTA.
- `/platforms`: platform directory; `/platforms/:id`: integrated platform detail, its tools and optional verified demo.
- `/opportunities`: business opportunity directory with platform filters; `/opportunities/:id`: tool description, business model and related platform.
- `/cloud`: cloud hosting, application operations and infrastructure partnership overview.
- About ADS, Partners and Contact link directly to `https://africadigitalsynergy.com/about`, `/partners`, and `/contact` in the separate company website. All calls to become a partner use `/partners`.

## Product semantics and safety

The `catalogue.json` records are curated discovery entries, **not certifications of live deployments**. A platform can have many independently described tools. A tool's business model is informational; it does not promise revenue, approval, a financing licence, or an active partnership.

`demoUrl` is null until the application has a verified public HTTPS URL. The UI shows 'Demo being prepared' instead of inventing live demos. POS and E-commerce are explicit Commerce children with dedicated-demo capability; their URLs are intentionally pending until verified and deployed.

## How to run

From the repository root:

    node --check apps/demo-portal/main.js
    node --test apps/demo-portal/tests/*.test.mjs
    docker build -f apps/demo-portal/Dockerfile -t ads-demo-portal .
    docker run --rm -p 127.0.0.1:18888:80 ads-demo-portal

Visit `http://localhost:18888`. Docker nginx serves browser deep links and adds security headers. The portal does not need the identity database or a Node process at runtime. Images and font files are referenced from public external services and should be self-hosted or licensed appropriately before final production certification.

## Deployment

`.github/workflows/demo-portal.yml` runs code and catalogue validation, Docker build and HTTP route smoke checks for PRs. After merge to main, it publishes a commit-tagged image to GitHub Container Registry. The workflow does not deploy into Contabo automatically.

To deploy on `vmi3191089`, select a validated image digest, configure GHCR pull access, start an isolated container bound to 127.0.0.1, route through HTTPS reverse proxy, validate browser E2E navigation and confirm corporate links. Publish only approved demo URLs to `catalogue.json` in a reviewed PR. Avoid using the removed Retail Connect Kit service or reusing its volumes.

## Future administration

Version 1 uses a Git-tracked JSON discovery catalogue to avoid creating a second authentication stack. A future protected admin API should support application registry, approval workflow, per-demo health status, role management, EN/FR content editing, audit trail and live URL checks. This is a separate backend checkpoint, not already implemented.

## Acceptance gaps

The layout and catalogue are implemented; visual regression testing against the concept, mobile browser acceptance, independent tool demo deployment, full FR catalogue translation, admin backend and Contabo ingress are pending verification.

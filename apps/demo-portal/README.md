# ADS Digital Ecosystem — demo portal

Independent, lightweight, public portal in `apps/demo-portal`, using the ADS navy-and-gold visual direction from the approved concept. This is not the ADS corporate site.

## User journeys

- `/`: Africa-themed hero, search, featured sector-platform cards, featured Commerce section with POS and E-commerce, and partnership CTA.
- `/platforms`: platform directory; `/platforms/:id`: integrated platform detail, its tools and optional verified demo.
- `/opportunities`: business opportunity directory with platform filters; `/opportunities/:id`: tool description, business model and related platform.
- `/cloud`: cloud hosting, application operations and infrastructure partnership overview.
- `/demo-access`: explains the existing hosted ADS demo login flow without duplicating passwords or authentication forms; links back to the approved platform demos.
- **Temporary company website upgrade:** About ADS and the corporate Partners navigation remain intentionally inactive. **Partner with ADS** instead opens a `mailto:admin@africadigitalsynergy.com` enquiry, including on Commerce; the footer lists that email first, and WhatsApp remains optional. Yaoundé is named without inventing a street address.

## Product semantics and safety

The `catalogue.json` records are curated discovery entries, **not certifications of live deployments**. A platform can have many independently described tools. A tool's business model is informational; it does not promise revenue, approval, a financing licence, or an active partnership.

`demoUrl` is null until the application has a verified public HTTPS URL. The UI shows 'Demo being prepared' instead of inventing live demos. POS and E-commerce are explicit Commerce children with verified **demo-only** URLs and shared ADS Identity; production certification is not implied.

## How to run

From the repository root:

    node --check apps/demo-portal/main.js
    node --test apps/demo-portal/tests/*.test.mjs
    docker build -f apps/demo-portal/Dockerfile -t ads-demo-portal .
    docker run --rm -p 127.0.0.1:18888:80 ads-demo-portal

Visit `http://localhost:18888`. Docker nginx serves browser deep links and adds security headers. The portal does not need the identity database or a Node process at runtime. Some images and fonts are still referenced from public external services. P4's locally hosted, individually licensed African-business photos and safe demo screenshots are pending; **do not mark image optimisation complete**. Existing strict CSP is retained.

## Deployment

`.github/workflows/demo-portal.yml` runs code and catalogue validation, Docker build and HTTP route smoke checks for PRs. After merge to main, it publishes a commit-tagged image to GitHub Container Registry. The workflow does not deploy into Contabo automatically.

To deploy on `vmi3191089`, select a validated image digest, configure GHCR pull access, start an isolated container bound to 127.0.0.1, route through HTTPS reverse proxy, validate browser E2E navigation, confirm inert corporate About/Partners navigation, functional email-first Partner CTA, and optional WhatsApp contact. Publish only approved demo URLs to `catalogue.json` in a reviewed PR. Avoid using the removed Retail Connect Kit service or reusing its volumes.

## Future administration

Version 1 uses a Git-tracked JSON discovery catalogue to avoid creating a second authentication stack. A future protected admin API should support application registry, approval workflow, per-demo health status, role management, EN/FR content editing, audit trail and live URL checks. This is a separate backend checkpoint, not already implemented.

## Acceptance gaps

Corporate About/Partners navigation remains gated; the Partner CTA opens email. P1–P3 source changes are **not deployed**, the isolated PostgreSQL source withdrawal needs the reviewed operator migration `db/003_retire_withheld_public_sector.sql` before any API promotion. Browser test artifacts cover five pages × three widths × two languages × before/after. P4 licensed photos, product screenshots and byte-budget testing are incomplete; institutional solution summaries still need curated FR copy. No production app sign-in is verified by the portal UX CI.


## 25 October 2026 UX review: shared sign-in integration guidance

**P5-2 — Products, not the public portal, perform silent sign-in.**
On first load, a registered ADS product may initiate the existing **authorization code + PKCE** flow against ADS Identity with `prompt=none`, `ui_locales=fr` or `en` from its own language selection, a freshly generated random `state` and PKCE challenge, and its **pre-registered exact redirect URI**. If there is no shared session or no authorization, the product must handle the normal OAuth redirect error (`login_required` or access denied) by offering its usual interactive sign-in. No token, access cookie, state or password is shared with the portal. This is a **consumer integration pattern**; no products are modified by this PR.

**P5-1 — Incorrect demo account.** The hosted ADS Identity `no_access` page now has an EN/FR **Switch account** action that POSTs to `/logout` with CSRF and the existing bound OAuth request. Only after checking the request does it revoke the shared SSO session and return to the product's identity sign-in page. The E2E helper retains a machine-readable no-access marker. Identity unit tests cover the protected form and rejection of uncontrolled redirect; this is a **reviewed-code candidate, not a deployed identity service**. No role authorization is bypassed.

**P5-3 — Portal status is intentionally skipped.** The current `/v1/identity/session` endpoint is token-based legacy context, not a CORS-enabled cookie-safe public portal identity read endpoint. Do **not** attempt to read ADS Identity cookies from the portal, store access tokens, or infer sign-in state. Add a product-specific, allowlisted, CSRF-safe minimal display-name endpoint in a later identity work package if explicitly approved.

**Languages.** The portal defaults to French for unrecognized browser languages and saves an explicit EN/FR switch in local storage. Products should propagate their selected language in `ui_locales` during OAuth; portal preferences alone do not configure third-party application language.

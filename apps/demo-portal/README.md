# ADS Digital Ecosystem — demo portal

Independent, lightweight, public portal in `apps/demo-portal`, using the ADS navy-and-gold visual direction from the approved concept. This is not the ADS corporate site.

## User journeys

- `/`: Africa-themed hero, search, featured sector-platform cards, featured Commerce section with POS and E-commerce, and partnership CTA.
- `/platforms`: platform directory; `/platforms/:id`: integrated platform detail, its tools and optional verified demo.
- `/opportunities`: business opportunity directory with platform filters; `/opportunities/:id`: tool description, business model and related platform.
- `/cloud`: cloud hosting, application operations and infrastructure partnership overview.
- `/demo-access`: explains the existing hosted ADS demo login flow without duplicating passwords or authentication forms; links back to the approved platform demos.
- **Temporary company website upgrade:** About ADS and Partners stay visible but are intentionally inactive. Partnership calls-to-action also remain visible without navigation. **Contact** is active and opens WhatsApp at `https://wa.me/237654035075` (+237 654 035 075) in a new tab. Reactivation of the company-site links requires an explicit reviewed change once that website relaunches.

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

To deploy on `vmi3191089`, select a validated image digest, configure GHCR pull access, start an isolated container bound to 127.0.0.1, route through HTTPS reverse proxy, validate browser E2E navigation, confirm inert About/Partners links and active WhatsApp Contact link. Publish only approved demo URLs to `catalogue.json` in a reviewed PR. Avoid using the removed Retail Connect Kit service or reusing its volumes.

## Future administration

Version 1 uses a Git-tracked JSON discovery catalogue to avoid creating a second authentication stack. A future protected admin API should support application registry, approval workflow, per-demo health status, role management, EN/FR content editing, audit trail and live URL checks. This is a separate backend checkpoint, not already implemented.

## Acceptance gaps

Company-site About/Partners and partnership CTAs are temporarily inert by owner request; WhatsApp Contact remains active. The layout and catalogue are implemented; visual regression testing against the concept, mobile browser acceptance, independent tool demo deployment, full FR catalogue translation, admin backend and Contabo ingress are pending verification.


## 25 October 2026 UX review: shared sign-in integration guidance

**P5-2 — Products, not the public portal, perform silent sign-in.**
On first load, a registered ADS product may initiate the existing **authorization code + PKCE** flow against ADS Identity with `prompt=none`, `ui_locales=fr` or `en` from its own language selection, a freshly generated random `state` and PKCE challenge, and its **pre-registered exact redirect URI**. If there is no shared session or no authorization, the product must handle the normal OAuth redirect error (`login_required` or access denied) by offering its usual interactive sign-in. No token, access cookie, state or password is shared with the portal. This is a **consumer integration pattern**; no products are modified by this PR.

**P5-1 — Incorrect demo account.** The identity service already checks tenant membership and returns a secure `no_access` page. An automatic switch must not happen via a cross-origin GET or uncontrolled redirect: global logout requires an explicit CSRF-protected POST and product-specific OAuth authorization context. A replacement account journey needs a dedicated security review and end-to-end test before activation. The new portal does not bypass role authorization.

**P5-3 — Portal status is intentionally skipped.** The current `/v1/identity/session` endpoint is token-based legacy context, not a CORS-enabled cookie-safe public portal identity read endpoint. Do **not** attempt to read ADS Identity cookies from the portal, store access tokens, or infer sign-in state. Add a product-specific, allowlisted, CSRF-safe minimal display-name endpoint in a later identity work package if explicitly approved.

**Languages.** The portal defaults to French for unrecognized browser languages and saves an explicit EN/FR switch in local storage. Products should propagate their selected language in `ui_locales` during OAuth; portal preferences alone do not configure third-party application language.

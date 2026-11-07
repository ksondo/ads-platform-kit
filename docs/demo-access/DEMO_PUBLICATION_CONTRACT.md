# ADS demo publication: portal activation and shared Identity contract

Scope: Education, Agriculture, Digital Tontine and Fleet Guard, published next to Commerce (the working reference).
This file records what the source provides. It does not mean any product is deployed, access-enabled or published on the portal.

## Statuses (kept separate)

| Status | Meaning | Who sets it |
|---|---|---|
| source-ready | Reviewed source and exact-head CI green | Pull request review |
| deployed | Image running on the demo host behind HTTPS | Operator |
| access-enabled | Identity client, check secret and private visitors configured; hosted sign-in verified | Operator |
| portal-published | `apps/demo-portal/demo-activation.json` set to `open` for the product | Operator, after the three above |

## 1. Portal

Reviewed destinations are in `apps/demo-portal/catalogue.json` (`demoDestination`). `demoUrl` stays `null` for these four products, so the existing rule "no unverified launch link" still holds.

| Portal id | Destination (opened in a new tab, with `?lang=en|fr`) |
|---|---|
| `education` | `https://education.demo.africadigitalsynergy.com/demo` |
| `agriculture` | `https://agriculture.demo.africadigitalsynergy.com/demo` |
| `digital-tontine` | `https://tontine.demo.africadigitalsynergy.com/demo` |
| `fleet-guard` | `https://fleetguard.demo.africadigitalsynergy.com/demo` |
| `commerce` | unchanged: `https://commerce.demo.africadigitalsynergy.com/commerce/demo` (catalogue `demoUrl`) |

`apps/demo-portal/demo-activation.json`, served at `/demo-activation.json`, holds one state per product:

| State | Card and detail page |
|---|---|
| `preparing` (shipped default) | "Demo being prepared" / "Démo en préparation"; card stays inside the portal; no link to the product |
| `open` | "Demo available" and "Open demo" / "Ouvrir la démo"; opens the destination in a new tab |
| `unavailable` | "Temporarily unavailable" / "Momentanément indisponible" with an explanatory alert; no link to the product |

The file never contains URLs. A missing file, invalid JSON, an unknown product or an unknown value all mean `preparing`. Only `https://<name>.demo.africadigitalsynergy.com/...` destinations can be linked.

### Activation (operator)

1. Confirm for the product: deployed app answers on its HTTPS host, `/demo` loads in EN and FR, ADS sign-in returns to the product, a private visitor reaches the persona page.
2. Either open a reviewed PR that changes the product's value to `open` (new portal image), or, without rebuilding, mount an operator copy read-only over the image file:
   `-v /etc/ads-demo/portal/demo-activation.json:/usr/share/nginx/html/demo-activation.json:ro` (Compose: the same entry under `volumes:` of the `portal` service).
3. Reload `https://demo.africadigitalsynergy.com/platforms` and check the card and the detail page in EN and FR.

**Rollback:** set the product back to `unavailable` (temporary problem) or `preparing`, or remove the mounted file. Takes effect on the next page load; no rebuild. Commerce is not affected.

## 2. Shared Identity

Issuer `https://login.demo.africadigitalsynergy.com`. Redirect URIs are compared string for string.

| Registry key | client_id | OAuth callback (exact) | Post-logout (exact) | Persona page (`entry_url`) |
|---|---|---|---|---|
| `education` | `education-web` | `https://education.demo.africadigitalsynergy.com/` | same | `…/demo/personas` |
| `agriculture` | `agriculture-web` | `https://agriculture.demo.africadigitalsynergy.com/` | same | `…/demo/personas` |
| `tontine` | `tontine-web` | `https://tontine.demo.africadigitalsynergy.com/` | same | `…/demo/personas` |
| `fleet-guard` | `fleet-guard-web` | `https://fleetguard.demo.africadigitalsynergy.com/` | same | `…/demo/personas` |
| `commerce` | `commerce-web` | `https://commerce.demo.africadigitalsynergy.com/` | same | `…/commerce/demo/personas` |

Products send the callback above as `redirect_uri` and carry the intended page in `signIn({ returnTo, lang })`.

### Visitor personas (organisation in the visitor's own `visit-*` copy)

- Education: main — school-admin, academic-admin, admissions, bursar, teacher, parent, student, applicant; partner — partner.
- Agriculture: main — farmer, buyer, coop-manager, extension-officer, lender-officer, input-supplier, farm-reviewer, help-desk, org-admin, demo-colleague. One role each (demo-colleague: `reviewer`, served by Agriculture as a different actor). `farm-reviewer` (`reviewer`) and `help-desk` (`support`) act only inside the visitor's own `visit-*` organisation, never in the ADS staff organisation; `org-admin` (`tenant_admin`) gives no Identity organisation-admin authority, because `visit-*` organisations never do. Release 2 (7 Nov 2026): Agriculture shows the coop-manager, extension-officer, lender-officer and input-supplier personas only when their screens ship; until then it ignores them.
- Tontine: main — group-admin, treasurer, payout-approver, member, auditor; cooperative — cooperative-admin; partner — partner.
- Fleet Guard: main — fleet-owner, fleet-manager, approver, driver, mechanic, approver-colleague.
- Commerce: personal — shopper; main — shop-owner, shop-manager, cashier, accountant; bank — bank-agent, bank-officer.

Identity limits every visitor token to the roles of the grant's personas in that workspace (code exchange and each refresh), ignores workspace hints the grant does not cover, and refuses codes, refreshes and new sign-ins after expiry or revocation. Narrowing to the one persona the visitor selected is done by each product server.

### Grant-check secrets (names only)

| Product | Identity | Product env file | Product container |
|---|---|---|---|
| Education | `DEMO_ACCESS_CHECK_SECRET_EDUCATION` | `EDU_DEMO_ACCESS_CHECK_SECRET` | `DEMO_ACCESS_CHECK_SECRET` |
| Agriculture | `DEMO_ACCESS_CHECK_SECRET_AGRICULTURE` | `AGRI_DEMO_ACCESS_CHECK_SECRET` | `DEMO_ACCESS_CHECK_SECRET` |
| Tontine | `DEMO_ACCESS_CHECK_SECRET_TONTINE` | `TONTINE_DEMO_ACCESS_CHECK_SECRET` | `DEMO_ACCESS_CHECK_SECRET` |
| Fleet Guard | `DEMO_ACCESS_CHECK_SECRET_FLEET_GUARD` | `FLEET_DEMO_ACCESS_CHECK_SECRET` | `DEMO_ACCESS_CHECK_SECRET` |
| Commerce | `DEMO_ACCESS_CHECK_SECRET_COMMERCE` | `COMMERCE_DEMO_ACCESS_CHECK_SECRET` | `DEMO_ACCESS_CHECK_SECRET` |

Identity variables also accept a `_FILE` variant; private provisioning requires at least 32 characters. Private mode: `DEMO_ACCESS_PRIVATE_ENABLED=1`, `DEMO_ACCESS_ENABLED=0`, `ADS_ENV=demo`, `DEMO_MODE=1`, `DEMO_SHOW_CREDENTIALS=0`.

### Private provisioning

`node src/cli.mjs demo-visitor-provision --platform <commerce|education|agriculture|tontine|fleet-guard> --email <address> --operator-ref <reference> --credentials-out <absolute owner-only path outside any repository> --apply yes`
Revoke with `demo-visitor-revoke --grant <uuid> --operator-ref <reference> --apply yes`. See [PRIVATE_OPERATOR_VISITOR.md](PRIVATE_OPERATOR_VISITOR.md).

## 3. Tests

- `apps/demo-portal/tests/demo-activation.test.mjs`: catalogue, destinations, default-off activation, Commerce links, fail-closed code paths, image packaging.
- `apps/demo-portal/tests/browser-demo-activation.mjs` (local Chromium evidence): preparing / open / unavailable / missing / invalid activation, EN/FR at 360, 768 and 1280 px, keyboard reach, no overflow.
- `services/identity/test/demo-publication-contract.test.mjs`: registry entries, exact callback and logout URLs, personas and organisations, secret variable names, private provisioning scope.
- `services/identity/test/fleet-guard-private-visitor.test.mjs`: Fleet Guard private provisioning, isolation, role narrowing, cross-tenant refusal, expiry, revocation, per-platform secrets, Commerce regression.

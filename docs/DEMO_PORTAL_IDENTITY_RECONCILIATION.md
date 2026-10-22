# ADS demo portal + shared identity: reconciliation checkpoint

## Verified code, October 22, 2026
- Public discovery portal: `apps/demo-portal`, deployed separately from the corporate website and products.
- Hosted sign-in interface and demo-user panel: `services/identity/src/pages.mjs`.
- OAuth2/OIDC endpoints: `GET /authorize`, `GET /login`, `POST /login`, `POST /token`, `GET /.well-known/openid-configuration`, `GET /.well-known/jwks.json`, `GET /sdk/ads-identity.js` in `services/identity/src/server.mjs`.
- Frontend SDK: `packages/identity-client/ads-identity.js` (authorization code + PKCE and token handling).
- Operator-only demo setup: `services/identity/src/cli.mjs` (`demo-bootstrap`, `demo-orgs`, `demo-reset`).
- Product OIDC demo configuration: `config/clients.demo.json`, currently 25 declared product clients with authorized redirects and role rules.
- Test evidence: `services/identity/test/demo-page.test.mjs`, `demo.test.mjs`, `demo-orgs.test.mjs`.

## Intended end-to-end journey
1. Visitor opens the public ADS Digital Ecosystem Portal; browsing requires no login.
2. Visitor chooses a platform or separate Commerce POS/E-commerce demo.
3. The portal offers a link only when a real deployed HTTPS demo has passed acceptance; `demoUrl: null` means not published.
4. The product's own frontend (Commerce, Education, VentureWorks, etc.) uses `window.adsIdentity.signIn()` from the existing SDK.
5. SDK starts `GET /authorize` with registered product client ID, registered redirect URI and PKCE challenge.
6. Hosted login page supports a demo-user panel with a “Use demo account” button **only** when the identity environment is explicitly `ADS_ENV=demo`, `DEMO_MODE=1`, `DEMO_SHOW_CREDENTIALS=1`. Do not copy credentials into the public portal.
7. After authentication, `POST /token` exchanges the code for a product-audience token; product backend verifies signature, audience, tenant and roles.
8. Product redirects to its own user/role home, including Commerce POS for authorized staff; the public portal is not an OAuth callback or account database.

## Current reconciliation result
The identity system exists in code and is exercised by tests. The demo portal itself does not host the login page or invoke identity APIs. The two parts can be connected through the actual sector demo application links, which are intentionally null until verified. As configured, Commerce POS and E-commerce share the `commerce-web` authentication client but have different role-specific entry points. The configured test subdomains in `clients.demo.json` are intended callback addresses, not evidence that those sites are live.

## Known client mapping (not a deployment certificate)
| Portal platform | Existing identity client | Registered product slug |
| --- | --- | --- |
| Commerce (POS/E-commerce) | commerce-web | commerce |
| Education | education-web | education |
| Healthcare | health-web | health |
| Agriculture | agriculture-web | agriculture |
| Transport | transport-web | transport |
| VentureWorks | ventureworks-web | ventureworks |
| Morphoo | morphoo-web | morphoo |

Portal's broad Finance card is ambiguous (banking vs personal finance vs other); do **not** infer an identity client without selecting the intended product.

## Current infrastructure protection
- Existing Contabo container `africorestack-identity` answers health requests on `127.0.0.1:8084` within the container, but its old image uses an incorrect localhost probe. It is not proof that the new kit service or its demo login panel has been deployed there.
- The old identity service is consumed by Software Factory. Do not replace it blindly or run the kit's default Docker Compose against it; this would create a separate database and risk existing user identity continuity.
- Use an **isolated demo environment**, database and demo-only secrets for any account showcasing. Never turn `DEMO_MODE=1` on in production or expose a demo admin password.
- Public `/internal/*` identity routes must remain blocked; only Software Factory can use them on its private network.

## Remaining release gates
1. Verify the desired demo identity environment, its separate PostgreSQL and safe secrets, and the endpoint's actual deployed OIDC discovery/PKCE behavior.
2. Verify and deploy Commerce web and API with the real shared SDK and `commerce-web` client; separately exercise buyer e-commerce and authorized cashier POS routes.
3. Independently verify education, VentureWorks and other portal demos before enabling the respective URLs.
4. Run bilingual browser tests for portal → app → hosted sign-in → callback → role-based screen, plus access denial, expired sessions, no duplicate logins, and isolation.
5. Only after acceptance edit `apps/demo-portal/catalogue.json` to add actual HTTPS `demoUrl` values and change the public catalogue from “Demo being prepared” to active links.
6. Keep About ADS and Partners visible but inactive while the corporate website is under upgrade. Contact uses WhatsApp +237 654 035 075.

## Mermaid flow
```mermaid
sequenceDiagram
  participant V as Visitor
  participant P as Public demo portal
  participant A as Sector demo application
  participant ID as Hosted ADS Identity
  participant DB as Sector API and data
  V->>P: Search platform and read tool business model
  alt Verified demo exists
    V->>A: Open approved product demo link
    A->>ID: OIDC /authorize + PKCE via ads-identity.js
    ID-->>V: Hosted login; demo user option only in demo environment
    V->>ID: Select demo account and sign in
    ID-->>A: Redirect to registered callback with code
    A->>ID: /token exchanges code and PKCE verifier
    ID-->>A: Signed access token with demo, tenant and roles
    A->>DB: Authorized action with access token
    DB-->>A: Tenant- and role-scoped results
    A-->>V: Verified demo screen
  else No verified demo
    P-->>V: Demo being prepared
  end
```

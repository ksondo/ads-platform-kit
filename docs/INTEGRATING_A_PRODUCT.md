# Connecting an ADS product to the shared sign-in

Most ADS product repos already check tokens on the server correctly (`src/private/identity.mjs` or `src/server/identity.mjs`: issuer, audience, JWKS, and the `sub`, `tenant_id`, `roles` claims). What they lack is the browser side: their screens call `window.adsIdentity.getAccessToken()`, which nothing provided. This kit provides it. A product needs four steps, typically a few hours to a day.

## 1. Register the product (once, by an operator)

```bash
node src/cli.mjs register-client \
  --id health-web --name "ADS Health" \
  --redirect https://health.africadigitalsynergy.com/workspace.html \
  --logout https://health.africadigitalsynergy.com/ \
  --logo https://health.africadigitalsynergy.com/logo.svg --accent "#146D91" \
  --self-roles patient            # roles anyone may get by signing up; omit for staff-only products
```

- `--redirect`: the exact page(s) users return to after signing in. Must be https.
- `--self-roles`: given automatically in the user's personal workspace. Leave empty for products where an admin must grant access (Commerce staff, school staff, HopeBridge caseworkers). Those users see "No access yet" until someone runs `grant-role`.
- `--personal false`: do not create personal workspaces for this product.

## 2. Configure the product server

```
OIDC_ISSUER=https://login.africadigitalsynergy.com
OIDC_AUDIENCE=health-web
OIDC_JWKS_URL=https://login.africadigitalsynergy.com/.well-known/jwks.json
```

These are the variable names the template repos already read. No server code changes are needed in repos that already verify tokens.

## 3. Add the browser library to the product pages

Copy `packages/identity-client/ads-identity.js` into the product's public folder (product pages only allow scripts from their own domain), and load it **before** the product's own script:

```html
<script src="/ads-identity.js" defer
        data-issuer="https://login.africadigitalsynergy.com"
        data-client-id="health-web"
        data-redirect-uri="https://health.africadigitalsynergy.com/workspace.html"
        data-post-logout-redirect-uri="https://health.africadigitalsynergy.com/"></script>
<script src="/workspace.js" defer></script>
```

Allow the browser to call the login service by adding it to the page's Content-Security-Policy `connect-src`:

```
connect-src 'self' https://login.africadigitalsynergy.com
```

## 4. Add a sign-in button

```html
<button id="sign-in"></button>
<script>adsIdentity.mountButton(document.getElementById('sign-in'), { signIn: 'Sign in', signOut: 'Sign out' });</script>
```

(Inline scripts are blocked by the product CSP, so in practice put that line in the product's own `.js` file.)

The library API:

| Call | Result |
| --- | --- |
| `await adsIdentity.getAccessToken()` | The current token (string) to send as `Authorization: Bearer ...`, refreshed automatically; `null` when signed out |
| `adsIdentity.signIn()` / `signIn({ screen: 'register' })` | Goes to the shared login (or registration) page and comes back |
| `adsIdentity.signOut()` | Ends the session on this device across ADS products |
| `adsIdentity.getUser()` | `{ id, email, name, tenantId, roles }` for display only. Never trust it for access decisions; the server checks the token |
| `adsIdentity.onChange(fn)` | Called when the user signs in or out |

## Granting staff roles (until the admin panel exists)

```bash
node src/cli.mjs create-organization --name "Clinique de la Cité" --owner director@example.cm   # prints the tenant id
node src/cli.mjs grant-role --email nurse@example.cm --client health-web --tenant <tenant id> --roles facility_admin
```

A user with roles in several organisations is asked once which one to use; this is the only place a choice appears at sign-in.

## Repos that need more than these steps

| Repo | Extra work |
| --- | --- |
| HopeBridge, Morphoo (go-ahead-guesser), Project Management, retail-connect-kit | Replace their own password login. Move existing users into `platform.users`, keeping scrypt hashes where compatible or asking users to reset |
| Africa Digital Synergy Hub | Signs in through Supabase in the browser; needs a small server first |
| Software Factory | Change one address; see [SOFTWARE_FACTORY_SWITCH_OVER.md](SOFTWARE_FACTORY_SWITCH_OVER.md) |
| VentureWorks | Already uses Keycloak. Can stay until Keycloak is retired or adopted platform-wide |

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
- `--self-roles`: given automatically in the user's personal workspace. Leave empty for products where an admin must grant access (Commerce staff, school staff, HopeBridge caseworkers). Those users see "No access yet" until an organisation admin invites them or grants them a role (below).
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
| `await adsIdentity.getAccessToken()` | The current token (string) to send as `Authorization: Bearer ...`, refreshed automatically; `null` when signed out. `getAccessToken({ forceRefresh: true })` fetches a new one now (e.g. after an admin changed your roles). Renewal is shared across tabs and safe across quick reloads |
| `adsIdentity.signIn()` / `signIn({ screen: 'register' })` | Goes to the shared login (or registration) page and comes back |
| `adsIdentity.signOut()` | Ends the session on this device across ADS products |
| `adsIdentity.getUser()` | `{ id, email, name, tenantId, roles }` for display only. Never trust it for access decisions; the server checks the token |
| `adsIdentity.onChange(fn)` | Called when the user signs in or out |

## Organisations, roles and invitations (PLAT-ROLE-001)

An ADS operator creates the organisation and its first owner once:

```bash
node src/cli.mjs create-organization --name "Clinique de la Cité" --owner director@example.cm   # prints the tenant id
node src/cli.mjs make-org-admin --email deputy@example.cm --tenant <tenant id>                   # optional extra admins
```

From then on the organisation's own admins manage their people. Nothing goes through the CLI or the database:

| Who | Can |
| --- | --- |
| **Organisation admin** (membership role `owner` or `admin`) | List members; grant/revoke any product's roles; deactivate/reactivate members; make members admins (owners only demote admins); invite people |
| **Product admin** (holds one of the product's `--admin-roles`, e.g. `facility_admin`) | For that product only: list members, grant/revoke its roles (not its admin roles), invite |
| Everyone else | Nothing |

Two ways to do it, both acting **as the signed-in admin**:

1. **The hosted admin page** `https://login.africadigitalsynergy.com/admin` (English/French, works at 360 px). Link to it from the product's settings menu. It uses the admin's ADS session; every action is CSRF-protected.
2. **The admin API** `/admin/v1/*`, for products with their own admin screens (VentureWorks access requests, Hub, Health, Fleet Guard, Tontine, Home Services). Called from the **product server**, never from the browser.

### Register the product for the admin API

```bash
node src/cli.mjs register-client --id health-web ... \
  --admin-scopes members:read,roles:write,members:write,invitations:write \
  --admin-roles facility_admin \
  --assignable-roles facility_admin,nurse,receptionist      # optional allow-list of grantable roles
node src/cli.mjs set-client-secret --id health-web           # printed once; store it in the product server's secrets
```

### Trust model

- The product server proves **who it is** with its client secret, and proves **who the admin is** with that admin's own access token for this product (from `adsIdentity.getAccessToken()` in the admin's browser, sent to the product server as usual). It exchanges both at `POST /token` (RFC 8693 token exchange) for an **admin token**:
  ```
  POST /token   Authorization: Basic base64(health-web:<client secret>)
  grant_type=urn:ietf:params:oauth:grant-type:token-exchange
  subject_token=<the admin's access token>  subject_token_type=urn:ietf:params:oauth:token-type:access_token
  scope=members:read roles:write            (optional; default: all the client is registered for)
  ```
  Response: `{ access_token, issued_token_type, token_type: "Bearer", expires_in (≤ 300 s), scope }`.
- The exchange is refused unless: the secret is right; the subject token is valid, signed by ADS, **issued for this product** (`aud` = client id) and its ADS session is still signed in; and the user really is an organisation or product admin **in the token's `tenant_id`**, checked in the database. Scopes are the intersection of what the client is registered for and what the user is entitled to.
- The admin token is bound to that user, that organisation workspace and that product; its audience is `<issuer>/admin`, so no product accepts it, and it cannot be exchanged again.
- **Every admin API call re-checks the admin's rights live** (a demoted admin's unexpired token stops working at once). Client credentials alone, or a product token alone, get nothing: there is no service-role path. Denials are audited (`admin_denied`, `admin_token`).
- Every change is written to the append-only `platform.identity_audit` with the acting admin (`user_id`), organisation (`tenant_id`), product, the calling client, IP, and before/after roles in `metadata`.

### Admin API

All calls: `Authorization: Bearer <admin token>`, JSON bodies. The organisation and product come from the admin token.

| Call | Scope | Result |
| --- | --- | --- |
| `GET /admin/v1/me` | any | `{ userId, tenantId, product, scopes, orgAdmin, organization }` |
| `GET /admin/v1/members` | `members:read` | `{ items: [{ userId, email, name, orgRole, status: active\|deactivated, roles (this product), joinedAt }] }` |
| `POST /admin/v1/members/{userId}/roles/grant` `{ roles: [...] }` | `roles:write` | Adds roles; a signed-in user who is not yet a member (an access request) becomes one. `{ userId, product, roles }` |
| `POST /admin/v1/members/{userId}/roles/revoke` `{ roles: [...] }` | `roles:write` | Removes roles; that user's sign-ins to this product in this workspace are ended so the old roles are not renewed |
| `POST /admin/v1/members/{userId}/deactivate` / `.../reactivate` | `members:write` | Removes/restores the person's access to this organisation. Their refresh tokens for it are revoked at once; access tokens already issued expire within 15 minutes (PLAT-ROLE-001 AC-3). Their ADS account and other organisations are unaffected |
| `POST /admin/v1/members/{userId}/org-admin` `{ admin: true\|false }` | `members:write` | Organisation admin or member |
| `GET /admin/v1/invitations` | `members:read` | This product's invitations: `status` `pending\|accepted\|revoked\|expired` |
| `POST /admin/v1/invitations` `{ email, roles, phone?, locale?: en\|fr, orgAdmin?, ttlSeconds? }` | `invitations:write` | 201 with the invitation. Emails a bilingual link (and an SMS through `IDENTITY_SMS_URL` when `phone` is given) |
| `POST /admin/v1/invitations/{id}/revoke` | `invitations:write` | Revoked |

Errors: `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 MEMBER_NOT_FOUND|USER_NOT_FOUND|INVITATION_NOT_FOUND`, `400 ROLES_INVALID|ROLE_NOT_ASSIGNABLE|EMAIL_INVALID|PHONE_INVALID`, `409 MEMBER_DEACTIVATED|CANNOT_CHANGE_YOURSELF|INVITATION_ALREADY_ACCEPTED`. A user's new roles reach the product with their next token: the browser can call `adsIdentity.getAccessToken({ forceRefresh: true })`.

### Invitations

- Single use, expire after 7 days by default (`IDENTITY_INVITATION_TTL_SECONDS`), only the token hash is stored. Inviting the same email again for the same product replaces the pending invitation.
- The link opens `/invite` on the login domain, showing the organisation, product and roles. The invitee signs in, or creates an ADS account (email prefilled; the normal activation email, whose link brings them back to the invitation), then clicks **Accept**. They get the membership and roles, and a button back to the product.
- It can only be accepted by the ADS account with the **invited email address**: a forwarded link is refused (audited as `EMAIL_MISMATCH`).

## Repos that need more than these steps

| Repo | Extra work |
| --- | --- |
| HopeBridge, Morphoo (go-ahead-guesser), Project Management, retail-connect-kit | Replace their own password login. Move existing users into `platform.users`, keeping scrypt hashes where compatible or asking users to reset |
| Africa Digital Synergy Hub | Signs in through Supabase in the browser; needs a small server first |
| Software Factory | Change one address; see [SOFTWARE_FACTORY_SWITCH_OVER.md](SOFTWARE_FACTORY_SWITCH_OVER.md) |
| VentureWorks | Already uses Keycloak. Can stay until Keycloak is retired or adopted platform-wide |

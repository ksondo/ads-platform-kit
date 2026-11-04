# ADS Demo Access — Integration Contract (v1)

How an ADS platform plugs into administrator-approved demonstration access. Commerce is the pilot; every later platform uses the same contract.

## Roles of each part

| Part | Where | Responsibility |
|---|---|---|
| Demo access module | ADS Identity (`services/identity`, Platform Kit) | Requests, admin notification, approval, invitation, 30-day grants, expiry, revocation, email outbox, audit |
| Central dashboard | ADS Identity, `/demo-admin` (served on `admin.demo.africadigitalsynergy.com`) | ADS administrators review and act on requests from every platform |
| Platform (e.g. Commerce) | Its own repository | Introduction and request page, persona page, grant check on every protected API call, demo workspace data |

A grant is for **one platform only**. Approval for Commerce gives nothing on any other platform.

## 1. Platform registry

`config/demo-access-platforms.json` lists each platform: `key`, `client_id`, allowed browser `origins`, `entry_url` (the platform's persona page) and the `personas` an approved visitor may use (keys from `config/demo-personas.json`). ADS staff personas are never listed.

## 2. Access request (browser → Identity)

`POST {IDENTITY_URL}/demo-access/v1/requests` — JSON, CORS allowed only for the platform's registered origins.

```json
{ "platform": "commerce", "email": "visitor@example.com", "locale": "en", "website": "" }
```

`website` is a hidden honeypot field; leave it empty. The platform key comes from the platform's own build configuration, never from user input.

Responses:
- `202 {"status":"received","notified":true}` — saved and the administrators' email was accepted by the mail provider.
- `202 {"status":"received","notified":false}` — saved; notification is queued or retrying. Show: "Request received and being processed."
- Duplicate pending requests and repeat requests after a recent rejection return the same neutral `202` (`notified` may be `false`).
- `400 {"error":{"code":"EMAIL_INVALID"|"PLATFORM_UNKNOWN"}}`, `429 {"error":{"code":"TOO_MANY_ATTEMPTS"}}`.

Visitor copy must never name administrators or claim an email was delivered.

## 3. Invitation and activation (handled by Identity)

Approval sends a single-use invitation (7 days) from the configured sender. The link opens Identity's `/invite` page: a new visitor sets a password there (no second activation email), an existing ADS user signs in. Acceptance activates the grant for 30 days and sends the visitor to the platform's `entry_url`.

The visitor's account is placed in **their own demo organisations** (a "demo set" per visitor, e.g. `main` shop and `bank`) plus their personal workspace. Organisation data is therefore isolated by the platform's existing tenant scoping.

## 4. Grant check (platform server → Identity)

`GET {IDENTITY_INTERNAL_URL}/demo-access/v1/grants/check?platform=commerce&sub=<user uuid>`
Header: `Authorization: Bearer <DEMO_ACCESS_CHECK_SECRET_<PLATFORM>>`

```json
{ "access": "granted", "grantId": "…", "expiresAt": "2026-12-04T09:00:00.000Z",
  "personas": [
    { "key": "shop-owner", "label": {"en":"Shop owner","fr":"…"}, "hint": {"en":"…","fr":"…"},
      "org": "main", "tenantId": "<uuid>", "roles": ["merchant_owner"] } ] }
```
Other answers: `{"access":"internal"}` (ADS internal demo/test account — allow as today) and `{"access":"none","reason":"NO_GRANT"|"EXPIRED"|"REVOKED"}`. `401` for a wrong secret.

Platform rules:
1. In the demo environment, every **authenticated** API call requires `access` = `granted` or `internal`; otherwise answer `403 {"error":"DEMO_ACCESS_REQUIRED"}` (or `DEMO_ACCESS_EXPIRED`). Public, unauthenticated pages are unaffected.
2. Cache answers per `sub` for at most **60 seconds** (revocation takes effect within 60 s). Fail closed if Identity cannot be reached.
3. A call to `grants/check` also records the visitor's first and latest activity.

## 5. Persona switching

The visitor signs in once. Personas live in one of three workspaces: `personal` (shopper), `main` (shop staff), `bank`.

- The persona page lists `personas` from the grant check.
- Choosing a persona in the **current** workspace: no sign-in at all. The browser sends `X-ADS-Demo-Persona: <key>` on API calls; the server narrows the token's roles to that persona's roles (intersection only — it can never add a role). A persona from another workspace in the header → `403 PERSONA_WORKSPACE_MISMATCH`.
- Choosing a persona in **another** workspace: restart sign-in with `tenant_hint=<persona tenantId>`. The ADS sign-in session is still open, so no password is asked.

## 6. Data and safety

- Demo workspaces hold fictional data only, seeded per visitor on first entry.
- No real payment, bank settlement or external delivery is ever triggered.
- ADS staff personas (reviewer, support) are not available to visitors.

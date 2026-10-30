# SH-0: phone sign-in implementation record

Status: local implementation under review; no push, merge, deployment or acceptance.
Requirement: PLAT-ID-003 and the Commerce finalization SH-0 brief, 30 October 2026.

As a customer without email, I want to prove my Cameroon mobile number with an SMS code so that I can use the same ADS identity and product workspaces as other customers.

## Existing boundaries preserved

The hosted identity service owns phone authentication. Products continue using authorization code + PKCE, the existing JWKS and existing `sub`, `tenant_id`, and `roles` claims. Phone-only users have a null email, not an invented email address. Email/password, Google, admin authorization and workspace selection remain in their existing engines.

Existing signed-in email/Google users can open `/phone/link` within ten minutes of sign-in and prove their new phone with SMS. A number owned by another account is never transferred. Phone-first users can open `/phone/email`, choose a password and prove a new mailbox through an emailed activation link while signed in to the same ADS account. Completion revokes old sessions; email/password, verified Google with that email, and phone subsequently resolve to the same user ID. Existing email ownership is never overwritten or merged. Changing a linked number, merging duplicate accounts and lost-number recovery need separate proof and recovery designs.

## Hosted form contract

| Method/path | Purpose |
| --- | --- |
| GET `/phone` | EN/FR phone sign-up/sign-in form, linked from existing login |
| GET `/phone/link` | Link phone to recently authenticated account |
| POST `/phone/request` | CSRF-protected `{phone, lang, req?, next?, purpose?}`; returns code form with opaque challenge |
| POST `/phone/verify` | CSRF-protected `{challenge, code, lang, req?, next?, purpose?}`; completes existing SSO/OAuth flow or linking |
| GET `/phone/email` | Recent authenticated phone-first account adds an email and chooses its password |
| POST `/phone/email/request` | CSRF-protected `{email,password,confirm,lang}`; generic mailbox acknowledgement |
| GET/POST `/phone/email/verify` | Mailbox-token confirmation, same authenticated account and chosen password; finishes linking and revokes old sessions |

`purpose=link` requires an active recent SSO session on both request and verify. Challenges bind to the browser's signed CSRF token and linking user. OAuth continuation still requires the existing browser-bound auth request; no supplied redirect URL is accepted.

SMS uses the existing `IDENTITY_SMS_URL` POST `{to,text,from}` hook with a five-second timeout. No hook or unsuccessful delivery returns a bilingual unavailable message, invalidates the challenge and never signs in. Known/unknown-number requests use the same flow. Codes are not logged or returned to the browser.

Configuration: `IDENTITY_PHONE_CODE_TTL_SECONDS` (300, clamped 60–600), `IDENTITY_PHONE_RESEND_SECONDS` (60, minimum 30), `IDENTITY_PHONE_MAX_ATTEMPTS` (5, clamped 1–10), `IDENTITY_PHONE_REQUESTS_PER_HOUR` (5, clamped 1–20), `IDENTITY_PHONE_REQUESTS_PER_IP` (30 per 15 minutes). Per-number requests and attempts persist in PostgreSQL; per-IP protection uses the existing single-instance limiter. `IDENTITY_PHONE_SMS_LIVE` defaults false; phone screens disclose Test mode. Set live only with an approved SMS connection; the flag does not itself approve release.

## Data and security

Migration `007_phone_signin.sql` adds nullable email, unique verified phone, and the phone SSO method, and extends existing email tokens with a pending address and email-link purpose. Challenges hold a keyed HMAC of the random six-digit code, browser hash, purpose, optional linking user, attempt counter and timestamps. Requests and verification serialize per phone using advisory transaction locks; verification row-locks and consumes codes atomically. Wrong attempts commit even on denial. Resend invalidates prior challenges. Hourly expiry cleanup removes challenges one day after expiry.

Phone identities and unauthenticated challenges are global authentication records, not merchant-tenant records. They retain the existing identity service database trust boundary and revoke PUBLIC table access; this package does not claim to add tenant RLS to the identity schema. Product tenant data must retain its existing forced RLS and restricted runtime role. Review runtime migration grants before deployment.

Rollback: prefer roll-forward. Before reverting application code, disable phone entry and preserve phone-only users; reverting to code requiring email makes those accounts inaccessible. Do not drop phone identifiers/challenges or restore NOT NULL email until all phone-only accounts have a verified migration/recovery path. Existing identities must not be deleted.

## Acceptance and evidence

| Criterion | Evidence |
| --- | --- |
| Accepted Cameroon forms canonicalize; invalid/injected numbers fail | `services/identity/test/phone-rules.test.mjs` |
| EN/FR forms preserve request, labels, escaped inputs and Test mode | `services/identity/test/phone-rules.test.mjs` |
| New phone user receives existing claims and returns to same account | `services/identity/test/phone.test.mjs` |
| Browser binding, wrong/expired code, attempt cap, replay/concurrency | `services/identity/test/phone.test.mjs` |
| Resend wait and old-code invalidation, hashed storage | `services/identity/test/phone.test.mjs` |
| Authenticated linking, unauthenticated denial, no ownership transfer | `services/identity/test/phone.test.mjs` |
| Phone-first email/Google keeps user ID; wrong proof, replay and existing-email takeover fail | `services/identity/test/phone.test.mjs` |
| Failed SMS and invalid CSRF cannot create a signed-in account | `services/identity/test/phone.test.mjs` |
| Phone-only staff remain identifiable and can receive roles or be deactivated | `services/identity/test/phone.test.mjs` |

Run `TEST_DATABASE_URL=<throwaway PostgreSQL> npm test` in `services/identity`. The existing test helper resets the platform schema: never point it at a shared or production database. Run the Chromium journeys with `E2E_PHONE_BROWSER_DB_URL=<separate throwaway PostgreSQL> node --test packages/e2e-kit/test/phone-browser.test.mjs` from the repository root, setting `PLAYWRIGHT_BROWSERS_PATH` when needed. The browser suite skips without its explicit database setting; a skipped run is not evidence. Optional `SH0_SCREENSHOT_DIR` saves EN desktop and FR mobile captures.

### Local results, 30 October 2026

- Real PostgreSQL 16: full identity suite completed 128 passed / 2 failed / 130 total. Both failures are pre-existing `clients.test.mjs` apply-clients checks: subprocess Git/worktree detection in its stripped Windows environment, and POSIX mode `0600` reported as `0666` on Windows. No checks were weakened. Generated test client secrets were removed and were not committed.
- After phone-only admin display and locale fixes: affected admin, existing identity, security, switch-account and phone suites passed 53/53.
- Added a phone-only staff management regression afterward: current phone rules + phone integration suites passed 9/9, including stable identity, mailbox/Google linking, replay/concurrency, expiry, resend, attempt caps, admin roles/deactivation, SMS failure and CSRF denial.
- Real Chromium against the real identity service and shared SMS mock, using a separate PostgreSQL database: English desktop 1366px and French 360px passed 2/2. Journeys include actual forms, wrong-code rejection, sign-up, sign-out and same-account sign-in. They assert labels, no horizontal overflow, selected language preservation and phone/code target heights of at least 44px. Updated screenshots were visually reviewed. This is targeted accessibility coverage, not a complete WCAG audit.
- Syntax checks and `git diff --check` pass. No push, merge, deployment or real SMS provider connection occurred.

Remaining merge gates: independent review, full green regression on the supported CI host, broader accessibility verification, and deployment runtime-role grants/migration review. The browser suite relies on the separate Windows file-URL portability repair in e2e-kit; that infrastructure change must be reviewed separately.

The ADS handbook requires two human approvals for shared-sign-in changes. This record grants no merge or deployment authority.

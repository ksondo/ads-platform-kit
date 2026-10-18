# End-to-end testing for ADS products

One shared, real test setup for all ADS products. Each product proves its journeys **screen → product API → PostgreSQL → back**, signed in through the **real** ADS sign-in, with external parties (mobile money, banks, KYC, insurers, regulators, dispatch, SMS/email, RAG) replaced by the shared mocks. This is level 4 of the handbook's testing strategy (§5) and the test-mode side of PLAT-EXT-001 (§12.1).

| Piece | Where | What it does |
| --- | --- | --- |
| `ads-e2e` CLI and harness | [`packages/e2e-kit`](../packages/e2e-kit) | Starts the real identity service (`services/identity`, same code as production) on PostgreSQL plus the mocks; seeds users, organisations and roles; mints tokens with the running service's key |
| Playwright helpers | `@ads/e2e-kit/playwright` | `signIn`, `expectSignedIn`, `signOut`, `expectSignedOut`, `withAds` fixture |
| Mock providers | [`services/mocks`](../services/mocks/README.md) | Deterministic, scriptable mocks with signed webhooks and a "TEST MODE" marker on every response |
| CI workflow | [`.github/workflows/e2e-template.yml`](../.github/workflows/e2e-template.yml) | Reusable workflow: PostgreSQL 16, identity + mocks, product migrations, product, Playwright |
| Worked example | [`examples/sample-product`](../examples/sample-product) | A tiny product (page + API + RLS table + mock MoMo) and its Playwright suite. Copy from it |

## The rules

1. **Every MVP journey has at least one Playwright test that uses the real product API and the real product database.** Happy path plus the most important unhappy path, in English and French, at 360 px and desktop (handbook §5).
2. **No mocked product API in E2E.** No `page.route()` to fake the product's own endpoints, no in-memory store in place of PostgreSQL, no stubbed `window.adsIdentity`. If the API or database is wrong, the E2E test must fail.
3. **Sign-in is real.** UI tests sign in with `signIn()` on the hosted ADS pages. `mintAccessToken()` is for API-level tests and setup only: it signs with the identity service's own key, so the product verifies it exactly like a production token. **Product code never gets a test bypass** (no "skip auth in test mode" flag, no shared secret header).
4. **Only external parties are mocked**, and only through the product's adapter, chosen by configuration (`ADS_MOCKS_URL` in test, the partner's URL at go-live). Screens show "Test mode" while a mock is in use (PLAT-EXT-001 AC-2).
5. **Assert the database, not just the screen**, for at least the main write of each journey (right tenant, right user, right status), and prove tenant isolation with a second tenant.

## Adopting it in a product

### 1. Prerequisites in the product

- The server verifies ADS tokens from `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URL` and uses `sub`, `tenant_id`, `roles` ([INTEGRATING_A_PRODUCT.md](INTEGRATING_A_PRODUCT.md)).
- Pages load `ads-identity.js` with `data-issuer`, `data-client-id`, `data-redirect-uri` taken from configuration, and the CSP `connect-src` allows the issuer.
- Each external party sits behind an adapter whose base URL comes from configuration; in test mode it is `ADS_MOCKS_URL`. Webhook handlers verify the signature over the raw body with `ADS_MOCKS_WEBHOOK_SECRET` in test mode and deduplicate on the event id.
- The product has a migration command and a `/health` endpoint.

### 2. Install

```bash
npm install -D @playwright/test@1.56.1
```

Locally, clone the kit next to the product once and link it (repeat the last line after every `npm ci`, which removes unsaved links):

```bash
git clone https://github.com/ksondo/ads-platform-kit ../ads-platform-kit
npm ci --prefix ../ads-platform-kit/services/identity
npm ci --prefix ../ads-platform-kit/packages/e2e-kit
npm install --no-save ../ads-platform-kit/packages/e2e-kit
```

Add `.ads-e2e/`, `test-results/` and `playwright-report/` to `.gitignore`. Use a Chromium that is already installed (`PLAYWRIGHT_BROWSERS_PATH`) or run `npx playwright install chromium` once.

### 3. Start the test environment

You need PostgreSQL 16 and two databases: one for identity, one for the product (a role that may create roles, such as the CI `postgres` user, if your migrations create a restricted runtime role).

```bash
npx ads-e2e up --database-url postgres://postgres:postgres@localhost:5432/ads_identity_e2e
npx ads-e2e register-client --id health-web --redirect http://localhost:4100/ --name "ADS Health"   # or do it in globalSetup
eval "$(npx ads-e2e env --client health-web --format shell)"
export PRODUCT_DATABASE_URL=postgres://postgres:postgres@localhost:5432/product_e2e
npx playwright test
npx ads-e2e down
```

`ads-e2e up` runs in the background (log in `.ads-e2e/ads-e2e.log`); `--foreground` keeps it attached. `ads-e2e status` tells you whether it is running.

`ads-e2e env` prints:

| Variable | Use |
| --- | --- |
| `OIDC_ISSUER` | Product server: expected token issuer |
| `OIDC_AUDIENCE` | Product server: expected audience (the client id) |
| `OIDC_JWKS_URL` | Product server: where the signing keys are |
| `ADS_IDENTITY_URL` | Product pages: `data-issuer` for `ads-identity.js` |
| `ADS_IDENTITY_CLIENT_ID` | Product pages: `data-client-id` |
| `ADS_MOCKS_URL` | Product adapters: base URL of the mock providers |
| `ADS_MOCKS_WEBHOOK_SECRET` | Product webhook handlers: signature secret (random per run, test only) |
| `ADS_E2E_STATE` | Tests: where `connectIdentity()` finds the running environment |

Defaults: identity on `http://127.0.0.1:18084`, mocks on `http://127.0.0.1:18090` (`--identity-port`, `--mocks-port`). Identity runs in dev mode over http with high rate limits, a throwaway signing key and email delivered to the mock email capture. Everything else is the production code path.

### 4. Playwright config

```js
// playwright.config.mjs
import { defineConfig, devices } from '@playwright/test';
import { loadE2eEnv } from '@ads/e2e-kit';

const BASE_URL = 'http://localhost:4100';
const kit = loadE2eEnv({ clientId: 'health-web' });   // reads the running environment

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.mjs',
  use: { baseURL: BASE_URL },
  projects: [
    { name: 'desktop-en', use: { ...devices['Desktop Chrome'], locale: 'en-US' } },
    { name: 'mobile-fr', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, locale: 'fr-FR' } },
  ],
  webServer: {
    command: 'npm run migrate && npm start',
    url: `${BASE_URL}/health`,
    reuseExistingServer: !process.env.CI,
    env: { ...kit, DATABASE_URL: process.env.PRODUCT_DATABASE_URL, PORT: '4100', PUBLIC_URL: BASE_URL },
  },
});
```

```js
// e2e/global-setup.mjs: register the product before anyone signs in
import { connectIdentity } from '@ads/e2e-kit';
export default async () => {
  const ads = connectIdentity();
  await ads.registerClient({ clientId: 'health-web', name: 'ADS Health', redirectUris: ['http://localhost:4100/'], selfRoles: ['patient'] });
  await ads.close();
};
```

Register clients before the first sign-in: the identity service caches allowed browser origins for up to 60 seconds, and `registerClient` waits until the origin is accepted.

### 5. Fixtures

```js
// e2e/fixtures.mjs
import { test as base, expect } from '@playwright/test';
import { withAds } from '@ads/e2e-kit/playwright';
import pg from 'pg';

export const test = withAds(base).extend({
  db: [async ({ ads }, use) => {
    const pool = new pg.Pool({ connectionString: process.env.PRODUCT_DATABASE_URL });
    try { await use(pool); } finally {
      // Delete this test's product rows (identity data is removed by the ads fixture).
      await pool.query('DELETE FROM health.visits WHERE tenant_id = ANY($1::uuid[])', [ads.createdTenantIds()]);
      await pool.end();
    }
  }, { auto: true }],
});
export { expect };
```

### 6. One journey test

```js
import { signIn, expectSignedIn } from '@ads/e2e-kit/playwright';
import { test, expect } from './fixtures.mjs';

test('receptionist books a visit and finds it again', async ({ page, ads, db }) => {
  const clinic = await ads.seedTenant({ product: 'health-web', roles: ['receptionist'] });   // unique tenant

  await page.goto('/');
  await signIn(page, { email: clinic.email, password: clinic.password, button: page.getByTestId('sign-in') });
  await expectSignedIn(page, { tenantId: clinic.tenantId, roles: ['receptionist'] });

  await page.getByLabel(/Patient/).fill('Ama Test');
  await page.getByRole('button', { name: /Book|Réserver/ }).click();
  await expect(page.getByTestId('visits')).toContainText('Ama Test');

  const { rows } = await db.query('SELECT tenant_id FROM health.visits WHERE patient_name=$1', ['Ama Test']);
  expect(rows).toEqual([{ tenant_id: clinic.tenantId }]);
});
```

The full worked suite, including the second-tenant isolation test and the mobile money cases, is in [`examples/sample-product/e2e`](../examples/sample-product/e2e).

### 7. CI

```yaml
# .github/workflows/e2e.yml in the product repo
name: e2e
on: { push: { branches: [main] }, pull_request: {} }
jobs:
  e2e:
    uses: ksondo/ads-platform-kit/.github/workflows/e2e-template.yml@main   # pin a commit for reproducible runs
    with:
      client-id: health-web
      redirect-uris: http://localhost:4100/     # omit if globalSetup registers the client
      migrate-command: npm run migrate          # omit if Playwright's webServer runs it
      start-command: npm start                  # omit if Playwright's webServer starts the product
      health-url: http://localhost:4100/health
    secrets: inherit                            # ADS_KIT_TOKEN, only while the kit repo is private
```

The workflow sets `DATABASE_URL` and `PRODUCT_DATABASE_URL` (product test database), every variable from `ads-e2e env`, and `CI=true`; installs Chromium with the official Playwright step; and uploads the Playwright report and logs when a run fails. Extra test-only variables go in `product-env` as `KEY=VALUE` lines. Never put real secrets there.

## Harness reference (`@ads/e2e-kit`)

| Call | Result |
| --- | --- |
| `connectIdentity({ stateFile? })` | Harness for the environment started by `ads-e2e up` |
| `startIdentity({ databaseUrl, port?, issuer?, mode: 'in-process' \| 'process', mocksUrl?, resetDatabase? })` | Migrates and starts identity yourself (kit self-tests, custom runners) |
| `startMocks({ port?, webhookSecret? })` | Starts the mocks in-process; `{ url, client, stop }` |
| `ads.registerClient({ clientId, redirectUris, origins?, name?, selfRoles?, personal? })` | Registers or updates the product |
| `ads.createUser({ email?, password?, verified = true, name? })` | Active account with a known password (unique email by default) |
| `ads.createOrganization({ name?, owner? })` | `{ organizationId, tenantId }` |
| `ads.grantRole({ user, org, product, role \| roles })` | Adds product roles in that workspace |
| `ads.makeOrgAdmin({ user, org })` | Makes a member an organisation admin (setup) |
| `ads.registerClient({ ..., clientSecret: true, adminRoles?, assignableRoles?, adminScopes? })` | Also enables the admin API for the product; returns `{ clientSecret }` |
| `ads.grantRoleViaApi({ admin, org, product, clientSecret, user, role \| roles })` | Grants roles through the **real admin API** (token exchange + `/admin/v1`), as an org admin's product server does |
| `ads.adminApi({ admin, org, product, clientSecret, scope? })` | Client for `/admin/v1` as that admin: `members`, `grant`, `revoke`, `deactivate`, `reactivate`, `setOrgAdmin`, `invite`, `invitations`, `revokeInvitation`, `me`. Refusals throw with `.status` and `.code` |
| `ads.inviteViaApi({ admin, org, product, clientSecret, email?, role \| roles, phone?, locale? })` | Creates an invitation through the API and returns `{ invitation, email, link }` from the email (SMS goes to the mock SMS capture) |
| `ads.invitationLink({ to })` / `ads.trackEmail(email)` | The latest invitation link sent to an address / have `cleanup()` delete an account created through the hosted pages |
| `ads.seedTenant({ product, roles })` | User + new organisation + roles in one call: `{ user, tenantId, email, password }` |
| `ads.mintAccessToken({ sub, tenant_id, roles, audience, email?, expiresIn? })` | RS256 token signed by the running service's key |
| `ads.waitForEmail({ to, subject? })` | An email the identity service sent (activation, reset) |
| `ads.mocks.*` | `script`, `operations`, `operation`, `advance`, `complete`, `webhooks`, `replayWebhook`, `messages`, `waitForMessage`, `requests`, `seedRegistry`, `seedCorpus`, `waitFor` |
| `ads.createdTenantIds()` / `ads.cleanup()` / `ads.close()` | Test data bookkeeping (the `withAds` fixture calls cleanup and close for you) |
| `loadE2eEnv({ clientId })` | The env vars above, synchronously, for `playwright.config` |
| `verifyWebhookSignature(raw, header, secret)` / `signPayload(raw, secret)` | The mock webhook signature scheme |

Playwright helpers (`@ads/e2e-kit/playwright`, no Playwright import of their own, so they work with the product's Playwright version):

| Helper | Does |
| --- | --- |
| `signIn(page, { email, password, startUrl?, button?, tenantId? })` | Triggers `adsIdentity.signIn()` (or clicks your button), fills the hosted login page (skipped when the browser already has an ADS session), picks the workspace if asked, waits until the product page holds a token. Returns `{ accessToken, user }`. Throws `SignInError` with `code` `NO_ACCESS`, `LOGIN_FAILED` or `TIMEOUT`, so unhappy paths are testable |
| `expectSignedIn(page, { email?, tenantId?, roles? })` | Asserts a valid session and its claims |
| `signOut(page)` / `expectSignedOut(page)` | Real sign-out (refresh token revoked, ADS session ended) |
| `acceptInvitation(page, { link, email, password, newAccount?, ads? })` | Opens the invitation, signs in (or with `newAccount: true` registers, activates from the email and comes back), clicks Accept. Throws `SignInError` `INVITATION_INVALID`, `WRONG_ACCOUNT` or `LOGIN_FAILED` |
| `withAds(test)` | Adds the `ads` fixture (connected harness, cleaned up after each test) |

Admin journeys: the worked example [`examples/sample-product/e2e/admin-invitations.spec.mjs`](../examples/sample-product/e2e/admin-invitations.spec.mjs) invites a new and an existing user, refuses a forwarded invitation, grants/removes roles and deactivates through the API, and drives the hosted admin page in EN/FR. Prefer `grantRoleViaApi` over `grantRole` when the test is about who may grant access; `grantRole`/`seedTenant` stay for plain setup.

On a shared build machine, set `ADS_TEST_PORT_RANGE=from-to` so the kit's own tests and `freePort()` only use your ports.

## Test data conventions

- **Unique tenant per test.** Create it with `ads.seedTenant()`. Never sign in with a shared, fixed account; never depend on data another test made.
- **Unique external references.** Phone numbers, order references and emails are generated per test, and mock scripts `match` on them. Never call `ads.mocks.reset()` while tests run in parallel.
- **A second tenant for isolation.** Each product proves at least once that tenant B cannot list, open or change tenant A's records, both through the API and in the database under the runtime role.
- **Clean up.** The `withAds` fixture deletes the users and organisations it created; the product fixture deletes its own rows for `ads.createdTenantIds()`. Use `{ auto: true }` so cleanup runs for every test.
- **Time comes from configuration.** Make timeouts configurable (the sample uses `PAYMENT_TIMEOUT_SECONDS=3`) rather than waiting for production-length timers.
- **Fake data only.** `example.test` emails, test phone numbers, no production data, no real secrets. Values printed by `ads-e2e env` are generated per run.
- **Stable selectors.** Prefer `data-testid`, labels and roles; assert French text in the `-fr` project.

## Run the self-test

```bash
sudo pg_ctlcluster 16 main start          # or any PostgreSQL 16
cd packages/e2e-kit && npm ci && npm test                     # harness, child process, CLI
cd ../../services/mocks && npm test                           # every mock provider
cd ../../examples/sample-product && npm ci
npx ads-e2e up --database-url postgres://USER:PASS@127.0.0.1:5432/ads_identity_e2e
PRODUCT_DATABASE_URL=postgres://USER:PASS@127.0.0.1:5432/product_e2e npx playwright test
npx ads-e2e down
```

CI runs the same suite through the template on every push (`.github/workflows/e2e-selftest.yml`).

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `no running environment (.ads-e2e/state.json)` | Run `ads-e2e up` in the same folder, or set `ADS_E2E_STATE` |
| `signIn` times out on the product origin | Redirect URI registered differs from the page's `data-redirect-uri` (exact match, trailing slash included) |
| Token exchange fails with a CORS error | Client registered after the identity service cached origins; register in globalSetup (`registerClient` waits up to 65 s) |
| `already running` | `ads-e2e down` (or delete a stale `.ads-e2e/state.json`) |
| Webhook returns 401 in tests | The product does not use `ADS_MOCKS_WEBHOOK_SECRET`, or verifies a re-serialised body instead of the raw one |

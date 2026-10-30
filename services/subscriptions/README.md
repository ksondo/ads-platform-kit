# ADS shared subscriptions: first SH-1 foundation

Product-neutral service beside identity. It consumes existing ADS RS256 tokens; it never creates accounts or stores passwords. This first slice is an API/database foundation, not the completed SH-1 package or a pilot release.

## Run locally

Requires Node 22+, PostgreSQL and the existing ADS identity service. `npm ci` installs the locked `pg` and `jose` dependencies. No plans, tariffs, entitlements or prices are seeded. Operators configure every plan and tariff through the API; the price screen is a later slice. A test explicitly enters 5 XAF as input, not as production configuration.

1. Set `SUBSCRIPTIONS_MIGRATION_DATABASE_URL` to an owner connection for a dedicated database and run `npm run migrate`.
2. Provision a separate LOGIN role with NOBYPASSRLS and grant it `ads_subscriptions_runtime`; keep its generated password in server secrets. Do not use the migration owner for runtime.
3. Set `SUBSCRIPTIONS_DATABASE_URL` to that restricted login, `OIDC_ISSUER`, `OIDC_JWKS_URL`, and `SUBSCRIPTIONS_PRODUCTS_JSON` (example below). Set the explicitly approved ADS staff organisation UUIDs in `SUBSCRIPTIONS_STAFF_TENANT_IDS`. No staff organisations are implicitly trusted.
4. Run `npm start`. Port defaults to 42110. Terminate HTTPS at the existing server proxy. This foundation reports test mode and must not be represented as a production payment service.

Example product binding (configuration, not default plan policy):

```json
{"commerce":{"audience":"commerce-web","subscribeRoles":["merchant_owner"]},"education":{"audience":"education-web","subscribeRoles":["institution_admin"]}}
```

Each product must have its own audience. Operator tokens use `ads-subscriptions` by default (`SUBSCRIPTIONS_OPERATOR_AUDIENCE` overrides it), signed `ads_staff: true`, a configured staff tenant and the `subscriptions_operator` product role granted through shared ADS identity administration. No service password or caller-supplied tenant override exists. A currently signed token remains usable until its normal expiry (identity currently issues 15-minute access tokens); this foundation does not introspect revoked sessions or roles on every request.

## API integration

See [OpenAPI 3.1](docs/openapi.json), [requirements](docs/requirements.md) and [design](docs/design.md). Bearer tokens are checked with the same `jose.jwtVerify` RS256/JWKS primitives used by identity's admin API, including issuer, audience and expiry. There was no exported kit server verifier to import; this service adds no alternate login or token issuer.

- `POST /v1/subscriptions/admin/plans`: operator creates `{product,key,name:{en,fr}}`.
- `POST /v1/subscriptions/admin/plans/:id/tariffs?product=commerce`: operator appends a tariff with `expectedVersion` matching the plan's latest configuration version. The body contains tariff fields only; `product` is a query parameter for this route. Entitlement keys must use the selected product namespace.
- `GET /v1/subscriptions/plans?product=commerce`: authenticated product user sees that product's currently effective, eligible tariffs; future tariffs do not replace the current price early. The latest effective tariff determines eligibility; an older tariff is never offered as a fallback.
- `POST /v1/subscriptions`: authorised organisation owner submits `{product,planId,expectedTariffId}` after reviewing the current tariff. Zero amount activates access immediately; positive amounts stay `PENDING_PAYMENT`. No paid activation endpoint exists in this slice.
- `GET /v1/subscriptions?product=commerce`: only the token organisation's subscriptions and immutable agreed terms. `effective_state` derives `EXPIRING` within seven days and `EXPIRED` after the exclusive end boundary. It is not a payment receipt.
- `POST /v1/subscriptions/:id/cancel`: `{product,expectedVersion}` cancels access with version checking.
- `GET /v1/subscriptions/entitlements/commerce.pos?product=commerce`: answers only for the signed token's product and organisation. Returns `entitled`, `limit`, and active source intervals. No grant is returned for pending, cancelled, not-yet-started or expired subscriptions. Active grants combine by union; any unlimited grant wins, otherwise the largest configured limit wins. This API supplies limits; products must enforce their own usage counts.

All writes require `Idempotency-Key` (8-128 letters/digits/colon/dot/underscore/hyphen). Keys are scoped to tenant, user, product and operation; replay returns the original result, while changing the body with the same key returns 409. Optimistic plan/subscription versions prevent overwriting another operator/customer change. Application transactions write audit and request replay evidence atomically with changes.

Tariff amount, duration, entitlements, limits, funding classification and eligibility are configured data. Historical subscriptions retain their signed tariff terms. `FREE`, `PROMOTIONAL` and `SPONSORED` classifications are explicit; a positive price in any paid/promotion/sponsorship scenario still requires future approved payment before activation. No sponsor collection or automatic charging is implemented.

## Verify

Use a dedicated disposable database with owner credentials:

```powershell
$env:SUBSCRIPTIONS_TEST_DATABASE_URL='postgres://postgres@127.0.0.1:55432/subscription_test_v3'
npm test
```

The suite creates a generated restricted LOGIN role and uses real HTTP, real PostgreSQL and cryptographically signed RS256 test tokens. It does not run hosted ADS login or Playwright. Without the test database environment variable the integration test explicitly skips; that is not a passing database claim. See [test status](docs/E2E_STATUS.md).

## Remaining work

Operator/customer EN/FR screens and approved mockups; hosted-identity/browser journeys; operator tariff-history/report screens; renewal and reminder delivery; usage-meter enforcement; sponsor identity/evidence; SH-2 independently approved payments and reconciliation; deployment/container checks; product integration and human review. Commerce's free till currently remains independent because this branch changes no Commerce gates. Future integration must keep free till/basic-stock access available during paid-service outages and must never grant paid extras on an unknown result. No live payment or customer release is authorised by a successful foundation test.

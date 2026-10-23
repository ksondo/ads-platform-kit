# Demo sandbox provisioning contract (kit → product)

Version 1 · BRIEF18 personal demo sandboxes · demo environment only

Anyone can sign up for a personal 30-day demo ("Try ADS free for 30 days"). The kit then creates that
tester's **sandbox**: one demo organisation set per product (the same shapes as `demo-orgs`: `main`,
`bank`, `staff`, `partner`… from `config/clients.demo.json`) and one persona account per persona of
`config/demo-personas.json`, all owned by the tester and tagged with the sandbox id. It then asks each
product to put its demo data into **those** tenants. This document is what a product implements.

A product that does not implement it yet is shown to the tester as "Not available yet"; every other
product still works. Nothing here exists outside `ADS_ENV=demo` with `DEMO_MODE=1`.

## Endpoints

| Call | Purpose |
| --- | --- |
| `POST {base_url}/internal/demo/sandboxes` | Seed the product's demo data for the sandbox's tenants. Idempotent. |
| `DELETE {base_url}/internal/demo/sandboxes/{sandbox_id}` | Delete everything the product holds for that sandbox. Idempotent. |

`base_url` is the product's entry in `config/demo-products.json` (`"base_url": null` = not implemented
yet). It is a server-to-server address and may be on the private network. Like every `/internal/*`
route, block it at the public reverse proxy if the product's server is reachable from the internet;
the signature below is required either way.

The product answers **404** on both routes unless it runs with `ADS_ENV=demo`, `DEMO_MODE=1` and a
`DEMO_PROVISIONING_SECRET`. Outside the demo the routes must not exist.

## Signature

Every request carries

```
ads-demo-signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, `${t}.${METHOD}.${path}.${rawBody}`)>
idempotency-key: <sandbox_id>:create | <sandbox_id>:delete
content-type: application/json
```

- `secret` is `DEMO_PROVISIONING_SECRET`, shared by the kit and every product's demo server. It comes
  from the server secrets (environment or `DEMO_PROVISIONING_SECRET_FILE`), at least 32 characters,
  never in a repository, log or response.
- `METHOD` is `POST` or `DELETE`; `path` is the contract path (`/internal/demo/sandboxes` or
  `/internal/demo/sandboxes/sb-…`), without host, query or any path prefix of `base_url` (a proxy
  route such as `https://host/commerce` is called at `https://host/commerce/internal/demo/sandboxes`
  but signed as `/internal/demo/sandboxes`); `rawBody` is the exact bytes received (empty for `DELETE`).
- Refuse with **401** when the header is missing, malformed, the HMAC differs (compare in constant
  time) or `t` is more than 300 seconds from the product's clock.

Reference check (Node.js), as in [`examples/sample-product/src/demo-sandboxes.mjs`](../../examples/sample-product/src/demo-sandboxes.mjs):

```js
export function verifyDemoSignature({ secret, method, path, rawBody, header, toleranceSeconds = 300 }) {
  if (!secret || typeof header !== 'string') return false;
  const parts = Object.fromEntries(header.split(',').map(p => p.trim().split('=')).filter(p => p.length === 2));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !/^[0-9a-f]{64}$/.test(parts.v1 ?? '') || Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${method}.${path}.${rawBody}`).digest();
  const given = Buffer.from(parts.v1, 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}
```

## POST /internal/demo/sandboxes

Request body (JSON):

```json
{
  "sandbox_id": "sb-k3v9q2m7xa",
  "product": "commerce",
  "client_id": "commerce-web",
  "expires_at": "2026-11-22T15:42:10.000Z",
  "locale": "fr",
  "owner": { "sub": "6f0c…-uuid" },
  "tenants": { "main": "uuid", "bank": "uuid", "staff": "uuid" },
  "staff_tenants": ["uuid"],
  "settings": { "COMMERCE_STAFF_TENANT_ID": "uuid" },
  "personas": { "shopper": "sub-uuid", "cashier": "sub-uuid", "bank-agent": "sub-uuid" },
  "persona_tenants": { "shopper": "uuid (the shopper's personal workspace)", "cashier": "uuid (= tenants.main)" }
}
```

| Field | Meaning |
| --- | --- |
| `sandbox_id` | `^sb-[a-z0-9]{10}$`. The key for idempotency and for `DELETE`. |
| `tenants` | This sandbox's organisation workspaces for this product, by `demo_orgs` key. Same keys as the shared demo (`demo-tenants.json`), new ids. |
| `staff_tenants`, `settings` | As in `demo-tenants.json` (`tenant_settings`), for this sandbox. A product whose staff checks read a tenant id from settings must accept these per sandbox (do not compare with the shared demo's ids only). |
| `personas` | Persona key → `sub` (user id) of this sandbox's persona accounts for this product (keys from `config/demo-personas.json`). Tokens of these users carry `demo: true` and `demo_sandbox: <sandbox_id>`. |
| `persona_tenants` | Persona key → the tenant that persona signs in to (its organisation, or its own personal workspace for `org: "personal"`). |
| `owner.sub` | The tester's own account (owner of every sandbox organisation, with the product's `admin_roles`). |
| `expires_at`, `locale` | For display only. The kit deletes the sandbox; products do not need timers. |

What the product does: run its demo seed (the logic of `scripts/demo-seed.mjs`, as a function) **for
these tenants and personas only**, with the same data as the shared demo (customers, products, orders,
fees, groups…), so every journey can start at once. Rows must be in the sandbox tenants (the product's
normal tenant columns and RLS), never in the shared demo tenants. Record `sandbox_id → tenants` so
`DELETE` can find them.

Answers:

| Status | Body | Kit does |
| --- | --- | --- |
| `201` (new) or `200` (already done) | `{"status":"ready","sandbox_id":"…"}` (extra fields such as `seeded` counts are fine) | Marks the product **ready** |
| `202` | `{"status":"provisioning"}` | Calls `POST` again (same body) with backoff; still not ready after the attempts → "Preparing…" until `demo-sandboxes retry` |
| `404`, `405`, `501` | any | **Not available** (endpoint not implemented); not retried |
| `401`, `400`, `409`, other `4xx` | `{"error":"CODE"}` | **Failed**, not retried (fix, then `demo-sandboxes retry`) |
| `408`, `425`, `429`, `5xx`, timeout, connection error | any | Retried: 4 attempts, backoff 0.5 s, 1 s, 2 s (`DEMO_PROVISIONING_ATTEMPTS`, `DEMO_PROVISIONING_BACKOFF_MS`), 15 s timeout each; then **failed** |

**Idempotency.** The same `sandbox_id` may arrive several times (retries, `demo-sandboxes retry`,
two kit workers). Repeats must not duplicate data: key the work on `sandbox_id` (a unique row, or an
upsert per seeded record) and answer `200 {"status":"ready"}`. A repeat with *different* tenants for a
known sandbox is a bug: answer `409`.

**Time.** The tester waits on "Preparing your demo…": answer within a few seconds. If seeding takes
longer, answer `202` and finish in the background; the kit polls by calling `POST` again.

## DELETE /internal/demo/sandboxes/{sandbox_id}

No body. Delete **everything** the product holds for the sandbox's tenants (orders, payments, files,
audit rows of those tenants, cached projections…): the product's `--reset` logic scoped to the
sandbox tenants, then forget the sandbox. Personal data entered by the tester must not survive.

| Status | Kit does |
| --- | --- |
| `200` `{"status":"deleted"}` or `204` | Done |
| `404` (unknown sandbox: never provisioned, or already deleted) | Done |
| `202` (deletion running) | Calls again on the next daily run |
| anything else, timeout | Retried with backoff; then again on the next daily run |

The kit deletes its own records (personas, organisations, memberships, the tester's account) only
after **every** product answered done, so a product can always still find its tenants by sandbox id.
At expiry the tester can no longer sign in and their email or phone number is erased at once, before
the products are called. The audit log keeps only counts.

## Lifecycle

1. Sign-up: email or phone + one-time code (SMS through the kit mocks in the demo), daily limits per
   IP address, email and phone number. The tester's account is created at once.
2. The kit creates the sandbox organisations and persona accounts (seconds), then calls
   `POST` on every product in parallel. "Preparing your demo…" shows each product's status and lets
   the tester continue to the product they came from as soon as that product is ready.
3. Inside a product, the kit's "Switch role" control (`/sdk/ads-demo-switch.js`, shown only for tokens
   with `demo_sandbox`) lets the tester act as any persona of their own sandbox. Products need nothing
   for this beyond including the script; tokens of all personas are ordinary ADS tokens.
4. Day 23 and day 29: reminders. Day 30: `DELETE` on every product, then the kit's own deletion.
   ADS staff can extend a sandbox (`demo-sandboxes extend <id> <days>`).

## Checklist for a product

- [ ] `POST` and `DELETE` routes, 404 outside `ADS_ENV=demo` + `DEMO_MODE=1` + secret.
- [ ] Signature check exactly as above (401 otherwise), raw body read before JSON parsing.
- [ ] Seed = the shared demo seed as a function of `(tenants, personas)`; idempotent on `sandbox_id`.
- [ ] Staff/partner settings read per sandbox from `settings` (or `tenants.staff`), not only from env.
- [ ] `DELETE` removes every row of those tenants; unknown id → 404.
- [ ] Include `<script src="…/ads-demo-switch.js">` after `ads-identity.js` on product pages (demo only, or always: it shows nothing for other accounts).
- [ ] A test that calls both routes with a signed request (the sample product's tests show how), plus an isolation test: data of sandbox A is not visible to a persona of sandbox B.
- [ ] Add `base_url` to `config/demo-products.json` in the kit.

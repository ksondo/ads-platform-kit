# ADS mock providers (TEST MODE)

One small HTTP service with deterministic mocks of the external parties ADS products depend on (PLAT-EXT-001, handbook §12.1). Products build and test whole journeys against it before any partner is contracted. **No real money, policies, identities or records are ever involved.**

- Every response has `"test_mode": true`, a `"notice": "TEST MODE ..."` field and the header `x-ads-test-mode: true`.
- Refuses to start when `ADS_ENV=production`. Listens on `127.0.0.1` by default.
- No dependencies beyond Node 22. Start alone with `node src/main.mjs` (`PORT`, default 8090; `MOCKS_WEBHOOK_SECRET`), or let `ads-e2e up` start it (random webhook secret, printed as `ADS_MOCKS_WEBHOOK_SECRET`).

## How outcomes are chosen

For each request, in order:

1. **A script** the test queued: `POST /_control/scripts` with `{ "provider", "outcome", "match"?, "times"?, ...options }`. `match` compares request fields (nested fields with dots, e.g. `"subject.idNumber"`); `times` defaults to 1 (`-1` = always).
2. **A magic value** in the request (table below).
3. **The provider default** (the happy path).

Outcome `unavailable` works for every provider: the request gets `503 PROVIDER_UNAVAILABLE`.

Script options: `settle: "auto"` (default: steps advance every `delayMs`, default 25 ms) or `"manual"` (nothing moves until the test calls `/_control/operations/{id}/advance`); `duplicates: n` (each webhook delivered n times with the same `event_id`); `reason`, `shortBy`, `premium`, `rate`, `approvedAmount`, `etaMinutes` as noted below.

Parallel tests must not share state: give each test its own reference, phone number or tenant, and match scripts on it. Do not call `reset` from tests that run in parallel.

## Webhooks

Each status change is POSTed to the request's `callbackUrl`:

```json
{ "event_id": "evt-...", "type": "payment.successful", "created_at": "...", "test_mode": true, "notice": "TEST MODE ...", "data": { "id": "...", "reference": "...", "status": "SUCCESSFUL", ... } }
```

Headers: `ads-mock-signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>`, `ads-mock-event-id`, `x-ads-test-mode: true`. Verify the signature over the **raw** body and reject timestamps older than 5 minutes (`src/signature.mjs`; the e2e-kit re-exports `verifyWebhookSignature` and `signPayload`). Deduplicate on `event_id`. Deliveries are recorded (status code per attempt) and can be replayed; there are no automatic retries, so tests stay deterministic.

## Providers

| Provider | Endpoints | Statuses | Outcomes (default first) | Magic values |
| --- | --- | --- | --- | --- |
| Mobile money (MTN MoMo, Orange Money) | `POST /momo/v1/requests` `{operator: mtn\|orange, amount (integer XAF), msisdn, reference, callbackUrl?, currency?, description?}` → 202; `GET /momo/v1/requests/{id}` | `PENDING` → `SUCCESSFUL` \| `FAILED` | `paid`, `failed` (`reason`, default `NOT_ENOUGH_FUNDS`), `timeout` (stays `PENDING`, no webhook), `duplicate` (paid, webhook sent twice) | MSISDN ending `0001` failed, `0002` timeout, `0003` duplicate |
| Bank cash collection | `POST /bank/v1/cash-collections` `{merchantId, amount, reference, callbackUrl?, pickupAddress?}` → 201; `GET /bank/v1/cash-collections/{id}`; `GET /bank/v1/credits/{reference}` (authoritative bank-credit confirmation) | `REQUESTED` → `AGENT_ASSIGNED` → `COLLECTED` (custody `agent`) → `CREDITED` (custody `bank`, `credited_amount`, `bank_credit_ref`) | `credited`, `short_credit` (`shortBy`, default 1000), `no_agent` (`FAILED`), `not_credited` (stops at `COLLECTED`) | — |
| SMS capture | `POST /sms/v1/messages` `{to, text, from?}` → 201 | `DELIVERED` \| `FAILED` | `delivered`, `failed` | — |
| Email capture | `POST /email/v1/messages` `{to, subject, text?, html?, from?}` → 201 | `DELIVERED` \| `FAILED` | `delivered`, `failed` | — |
| KYC | `POST /kyc/v1/checks` `{reference, subject: {fullName, idNumber}, callbackUrl?}` → 202; `GET /kyc/v1/checks/{id}` | `PENDING` → `PASSED` \| `FAILED` \| `MANUAL_REVIEW` | `pass`, `fail` (`reason`, default `ID_MISMATCH`), `manual_review` (decide with `advance {status: "PASSED"\|"FAILED"}`) | idNumber ending `FAIL`, `REVIEW` |
| Insurer | `POST /insurer/v1/quotes` `{product, sumInsured, currency?}` → 201 (premium = 2.5 % unless `premium`/`rate`); `POST /insurer/v1/policies` `{quoteId}` → 201 `BOUND` with `policy_number`; `POST /insurer/v1/claims` `{policyNumber, amount, reference, callbackUrl?}` → 201; `GET /insurer/v1/{quotes\|policies\|claims}/{id}` | claims: `SUBMITTED` → `UNDER_REVIEW` → `APPROVED` \| `REJECTED`, or `MORE_INFO_REQUIRED` | quote/bind: `quoted`/`bound`, `declined` (422); claims: `approved` (`approvedAmount`), `rejected` (`reason`), `more_info`. Scripts match `step: quote\|bind\|claim` | — |
| Regulator / registry | `GET /registry/v1/{business\|taxpayer\|licence\|practitioner}/{id}` | record with `status` `ACTIVE` \| `SUSPENDED`, or 404 | `found`, `not_found`, `suspended` | id ending `NOTFOUND`, `SUSPENDED` |
| Transport / ambulance dispatch | `POST /dispatch/v1/requests` `{kind: ambulance\|transport, reference, pickup, dropoff?, callbackUrl?}` → 201; `GET /dispatch/v1/requests/{id}`; `POST /dispatch/v1/requests/{id}/cancel` | `REQUESTED` → `ASSIGNED` (vehicle, driver, `eta_minutes`) → `EN_ROUTE` → `ARRIVED` → `COMPLETED`; or `FAILED` / `CANCELLED` | `completed`, `no_vehicle`, `cancelled` | — |
| Progress Agentic RAG | `POST /rag/v1/retrieve` `{query, knowledgeBox?, topK?}` | `grounded: true` with `results[].citation {document_id, title, uri}` and an `answer` ending `[1]`; or `grounded: false`, `answer: null`, `results: []` | `grounded`, `no_results`, `uncited` (an answer with no sources: the product must refuse to show it) | a query matching nothing returns `grounded: false` |

Create calls are idempotent on `reference`: the same reference returns the existing operation with `"idempotent_replay": true`. Invalid input returns `400` with `{"error": {"code": "FIELD_REQUIRED" | "AMOUNT_INVALID" | ...}}`.

## Control API (tests only)

| Call | Purpose |
| --- | --- |
| `POST /_control/scripts` | Queue an outcome (see above). `GET` lists scripts and remaining uses |
| `GET /_control/operations?provider=&reference=` | Provider-side records |
| `GET /_control/operations/{id}` | One record, with `pending_steps` |
| `POST /_control/operations/{id}/advance` | Apply the next step; or force `{ "status": "EXPIRED", "patch": {...} }`. Webhooks are delivered before it returns |
| `POST /_control/operations/{id}/complete` | Apply all remaining steps |
| `GET /_control/webhooks?operation=&provider=` | Deliveries with payload and attempts (`status`, `ok`) |
| `POST /_control/webhooks/{id}/replay` | Send a delivery again (same `event_id`) |
| `GET /_control/messages?channel=sms\|email&to=` | Captured SMS and email (including the identity service's activation and reset emails under `ads-e2e`) |
| `GET /_control/requests?path=/momo` | Every provider request the product made, with its body |
| `PUT /_control/registry/{register}/{id}` | Seed a registry record |
| `PUT /_control/rag/corpus` | `{ knowledgeBox, documents: [{ id, title, uri, text }] }` |
| `POST /_control/reset` | Clear everything (only between serial test runs) |

From tests, use the client in `@ads/e2e-kit` (`ads.mocks.script(...)`, `ads.mocks.webhooks(...)`, `ads.mocks.waitForMessage(...)`).

## Adding a mock

Add an outcome table and routes in `src/providers.mjs` following the same pattern (create → steps → signed webhook; scripts, magic values, default; idempotent on `reference`), document it in the table above, and add tests in `test/mocks.test.mjs`.

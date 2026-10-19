# @ads/ai-gateway-client

The small client every ADS product **server** uses to reach the ADS AI Gateway (contract v1 of the
ADS Agentic and RAG Integration Standard v1). Progress Agentic RAG is the only engine; the gateway
(`ksondo/RAG-Intelligence-AI-Platform`, `gateway/`) holds the Progress credentials and
knowledge-box ids. Products hold neither. No dependencies, Node 20+.

Status: built and tested against the kit mock facade and the in-process test double. The live
Progress connection is **EXTERNAL INTEGRATION PENDING** (standard §12.3).

## Use

```js
import { createAiGatewayClient, userMessage, withOneRetry, collectStream } from '@ads/ai-gateway-client';

const ai = createAiGatewayClient({
  apiBase: `${process.env.ADS_AI_GATEWAY_URL}/v1/ai`,   // tests: `${process.env.ADS_MOCKS_URL}/ai/v1`
  serviceToken: process.env.ADS_AI_GATEWAY_CLIENT_SECRET, // interim; ADS client-credentials token later
});

// In the product's own API route, after its role check and with the minimal context only:
const result = await withOneRetry(() => ai.ask(
  { useCase: 'nutrition.plan-explanation', collection: 'nutrition-guidance', query, language: 'fr', context: { goal } },
  { subjectToken: userAccessToken, requestId },
));
if (result.status === 'GROUNDED') render(result.answer, result.citations, result.testMode);
else render(userMessage(result, 'fr').text); // « Je ne peux pas répondre de façon fiable … »
```

- Tenant and roles are never sent: the gateway reads them from the verified user token. The client
  strips `tenantId`, `role`, `roles`, `actorId` and `userId` if a caller passes them.
- `ask` fails closed: a `GROUNDED` reply without citations is turned into `INSUFFICIENT_EVIDENCE`.
- `askStream` yields the normalised events (`citations`, `answer-chunk`, `status`, `error`,
  `done`). `collectStream` keeps the text only for `GROUNDED` and sets `discardShownText` otherwise,
  so the product removes anything it already showed.
- `withOneRetry` retries a retryable error once after `Retry-After` (bounded), never a refusal.
- Every failure is an `AiGatewayError`, never a raw exception: a non-gateway 429 page is
  `RATE_LIMITED` (Retry-After read as seconds or an HTTP date), a 2xx body that is not JSON is
  `PROVIDER_RESPONSE_INVALID`, a 504 page is `PROVIDER_TIMEOUT`, and a stream cut mid-way ends with
  an `error` event so `collectStream` discards the text already shown.
- `userMessage(resultOrError, 'en' | 'fr')` gives the standard's states and messages; `MESSAGES`
  has the AI and Test-mode labels.
- `ingest` (with an Idempotency-Key) sends only content that passed the product's maker-checker
  approval; `ingestStatus` shows *Processing* until `INDEXED`.

## Testing a product

- **Unit tests:** `import { createAiGatewayTestDouble } from '@ads/ai-gateway-client/test-double'`,
  pass `double.fetch` as `fetchImpl`, and queue outcomes with `double.next('insufficient' |
  'uncited' | 'stream_error' | 'RATE_LIMITED' | 'PROVIDER_TIMEOUT' | ...)`. `double.requests` shows
  exactly what the product sent (use it for the "context field never sent" and "no AI request on
  excluded paths" cases).
- **Integration / E2E:** the kit mock facade `{ADS_MOCKS_URL}/ai/v1` (see
  `services/mocks/README.md`) verifies real E2E-kit tokens and routes tenants to their own
  knowledge boxes.
- **Contract:** `import { assertContract } from '@ads/ai-gateway-client/schema-check'` validates
  any body against `contracts/ai-gateway-v1`, a byte-identical copy of the gateway repository's
  `contracts/ai-gateway-v1` (the gateway CI fails if they drift).

import { randomUUID } from 'node:crypto';

// In-process, contract-faithful test double of the ADS AI Gateway (contract v1) for PRODUCT
// UNIT TESTS. Pass `double.fetch` as `fetchImpl` to createAiGatewayClient (or use it in place of
// global fetch). Every body it returns validates against contracts/ai-gateway-v1. It checks
// that the product sends a service credential and the user's ADS token (it does not verify
// signatures: use the kit mock facade `{ADS_MOCKS_URL}/ai/v1` with E2E-kit tokens for that).
//
//   const double = createAiGatewayTestDouble({ contextAllowlist: { 'nutrition.plan-explanation': ['goal'] } });
//   double.next('RATE_LIMITED', { retryAfter: 2 });      // next call -> 429
//   double.next('insufficient');                         // next call -> 200 INSUFFICIENT_EVIDENCE
//   double.next('uncited');                              // provider answered without sources -> refused
//   double.requests                                       // what the product sent (headers, body)

const ERRORS = {
  QUERY_INVALID: [400, false], REQUEST_INVALID: [400, false], UNAUTHENTICATED: [401, false], USE_CASE_FORBIDDEN: [403, false],
  COLLECTION_NOT_AUTHORIZED: [403, false], CONSENT_REQUIRED: [403, false], RESOURCE_NOT_FOUND: [404, false], CONTEXT_FIELD_NOT_ALLOWED: [422, false],
  CONTENT_NOT_APPROVED: [422, false], SCHEMA_OUTPUT_INVALID: [422, false], RATE_LIMITED: [429, true], PROVIDER_RESPONSE_INVALID: [502, true],
  PROVIDER_UNAVAILABLE: [503, true], NOT_CONFIGURED: [503, false], PROVIDER_TIMEOUT: [504, true],
};

export const DEFAULT_CITATION = { ref: '1', resourceId: 'rid0testdouble0000000000000000001', paragraphRef: 'rid0testdouble0000000000000000001/t/body/0-42', title: 'Test document (test double)', sourceUri: 'mock://test-double/doc-1', score: 0.9, sourceVersion: null };

export function createAiGatewayTestDouble({ apiBase = 'http://ai-gateway.test/v1/ai', answer = 'A grounded test answer [1].', citations = [DEFAULT_CITATION], contextAllowlist = {}, personalData = [] } = {}) {
  const queue = [];
  const requests = [];
  const base = apiBase.replace(/\/$/, '');

  const json = (status, body, requestId, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-request-id': requestId, 'x-ads-test-mode': 'true', ...extra } });
  const error = (code, requestId, retryAfter) => json(ERRORS[code][0], { error: { code, retryable: ERRORS[code][1], requestId } }, requestId, code === 'RATE_LIMITED' ? { 'retry-after': String(retryAfter ?? 1) } : {});
  const provider = collection => ({ name: 'progress-agentic-rag', mode: 'mock', collection });
  const timing = { totalMs: 1, upstreamMs: 0, retries: 0, coalesced: false };

  async function fetchImpl(url, init = {}) {
    const u = new URL(String(url));
    const path = u.pathname.slice(new URL(base).pathname.length);
    const h = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const requestId = /^[0-9a-f-]{36}$/i.test(h['x-request-id'] ?? '') ? h['x-request-id'] : randomUUID();
    const body = init.body ? JSON.parse(init.body) : {};
    requests.push({ method: init.method ?? 'GET', path, headers: h, body });
    if (path === '/health') return json(200, { status: 'ok', service: 'ads-ai-gateway-test-double', contract: 'ai-gateway-v1', progress: 'mock' }, requestId);
    if (!String(h.authorization ?? '').startsWith('Bearer ')) return error('UNAUTHENTICATED', requestId);
    const needsUser = !['/ingest', '/withdraw'].includes(path) && !path.startsWith('/ingest/');
    if (needsUser && !h['x-ads-subject-token']) return error('UNAUTHENTICATED', requestId);
    const next = queue.shift() ?? { outcome: 'grounded', options: {} };
    if (ERRORS[next.outcome]) return error(next.outcome, requestId, next.options.retryAfter);
    const useCase = body.useCase ?? u.searchParams.get('useCase');
    const allow = contextAllowlist[useCase];
    if (allow && body.context) for (const k of Object.keys(body.context)) if (!allow.includes(k)) return error('CONTEXT_FIELD_NOT_ALLOWED', requestId);
    if (personalData.includes(useCase) && !body.consentRef) return error('CONSENT_REQUIRED', requestId);
    const runId = randomUUID();
    const grounded = next.outcome === 'grounded';
    const shown = grounded ? (next.options.citations ?? citations) : [];

    if (path === '/ask' && body.stream) {
      const events = grounded
        ? [{ type: 'citations', citations: shown.map(({ ref, resourceId, title, sourceUri, score }) => ({ ref, resourceId, title, sourceUri, score })) }, { type: 'answer-chunk', text: next.options.answer ?? answer }, { type: 'status', status: 'GROUNDED' }]
        : next.outcome === 'stream_error' ? [{ type: 'error', code: next.options.code ?? 'PROVIDER_TIMEOUT', retryable: true }] : [{ type: 'status', status: 'INSUFFICIENT_EVIDENCE' }];
      events.push({ type: 'done', runId });
      return new Response(events.map(e => JSON.stringify(e)).join('\n') + '\n', { status: 200, headers: { 'content-type': 'application/x-ndjson', 'x-request-id': requestId, 'x-ads-test-mode': 'true' } });
    }
    if (path === '/ask') {
      return json(200, { requestId, runId, useCase, status: grounded ? 'GROUNDED' : 'INSUFFICIENT_EVIDENCE', answer: grounded && !body.answerSchemaId ? next.options.answer ?? answer : null, answerJson: grounded && body.answerSchemaId ? next.options.answerJson ?? {} : null, citations: shown, evidence: { citationCount: shown.length, topScore: shown.length ? Math.max(...shown.map(c => c.score ?? 0)) : null, policy: 'kb', compositeRetry: false }, testMode: true, provider: provider(body.collection), timing }, requestId);
    }
    if (path === '/find') {
      const results = shown.map((c, i) => ({ rank: i + 1, resourceId: c.resourceId, paragraphRef: c.paragraphRef, title: c.title, text: 'Test passage (test double).', score: c.score, sourceUri: c.sourceUri }));
      return json(200, { requestId, runId, useCase, status: results.length ? 'GROUNDED' : 'INSUFFICIENT_EVIDENCE', results, nextPage: null, testMode: true, provider: provider(body.collection), timing }, requestId);
    }
    if (path === '/graph') return json(200, { requestId, runId, useCase, status: grounded ? 'GROUNDED' : 'INSUFFICIENT_EVIDENCE', paths: grounded ? [{ source: { value: 'Maize', group: 'CROP' }, relation: 'REQUIRES', destination: { value: 'Nitrogen', group: 'NUTRIENT' }, resourceIds: [] }] : [], testMode: true, provider: provider(body.collection), timing }, requestId);
    if (path === '/collections') return json(200, { requestId, collections: [], testMode: true }, requestId);
    if (path.startsWith('/resources/')) return json(200, { requestId, resourceId: decodeURIComponent(path.split('/')[2]), title: 'Test document (test double)', summary: null, sourceUri: null, labels: [], fields: {}, testMode: true, provider: provider(u.searchParams.get('collection') ?? 'test') }, requestId);
    if (path === '/ingest') {
      if (!h['idempotency-key']) return error('REQUEST_INVALID', requestId);
      if (!body.approvedBy || !body.approvedAt) return error('CONTENT_NOT_APPROVED', requestId);
      return json(202, { requestId, jobId: randomUUID(), state: 'PROCESSING', testMode: true }, requestId);
    }
    if (path.startsWith('/ingest/')) return json(200, { requestId, jobId: path.split('/')[2], state: next.options.state ?? 'PROCESSING', reason: null, sourceId: 'test-source', sourceVersion: '1', updatedAt: new Date().toISOString() }, requestId);
    if (path === '/withdraw') return json(202, { requestId, jobId: randomUUID(), state: 'WITHDRAWN' }, requestId);
    return error('RESOURCE_NOT_FOUND', requestId);
  }

  return {
    apiBase: base,
    fetch: fetchImpl,
    requests,
    /** Queue the outcome of the next call: 'grounded' | 'insufficient' | 'uncited' | 'stream_error' | any §5.8 error code. */
    next(outcome, options = {}) { queue.push({ outcome: outcome === 'uncited' ? 'insufficient' : outcome, options }); return this; },
    reset() { queue.length = 0; requests.length = 0; },
  };
}

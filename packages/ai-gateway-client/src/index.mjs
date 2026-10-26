// @ads/ai-gateway-client: the small client every ADS product server uses to reach the ADS AI
// Gateway (contract v1, ADS Agentic and RAG Integration Standard v1 §5). Server-side only: it
// carries the product's service credential and the signed-in user's ADS token. It never sends
// tenant ids or roles (the gateway reads them from the verified token) and never holds Progress
// credentials or knowledge-box ids. No dependencies; Node 20+ (global fetch).
//
//   const ai = createAiGatewayClient({ apiBase: process.env.ADS_AI_GATEWAY_URL + '/v1/ai', serviceToken });
//   //  tests: apiBase = `${ADS_MOCKS_URL}/ai/v1` (kit mock facade)
//   const r = await ai.ask({ useCase, collection, query, language, context }, { subjectToken });
//   if (r.status === 'GROUNDED') show(r.answer, r.citations); else show(userMessage(r, lang).text);

import { randomUUID } from 'node:crypto';
import { MESSAGES } from './messages.mjs';

export { MESSAGES };

const ERROR_CODES = new Set(['QUERY_INVALID', 'REQUEST_INVALID', 'UNAUTHENTICATED', 'USE_CASE_FORBIDDEN', 'COLLECTION_NOT_AUTHORIZED', 'CONSENT_REQUIRED', 'RESOURCE_NOT_FOUND',
  'CONTEXT_FIELD_NOT_ALLOWED', 'CONTENT_NOT_APPROVED', 'SCHEMA_OUTPUT_INVALID', 'RATE_LIMITED', 'PROVIDER_RESPONSE_INVALID', 'PROVIDER_UNAVAILABLE', 'NOT_CONFIGURED', 'PROVIDER_TIMEOUT']);
// Keys a product must never send: identity comes from the verified token only (standard C4).
const FORBIDDEN_KEYS = ['tenantId', 'tenant_id', 'role', 'roles', 'actorId', 'userId'];

export class AiGatewayError extends Error {
  constructor({ status, code, retryable, retryAfterSec = null, requestId = null }) {
    super(code);
    this.name = 'AiGatewayError';
    this.status = status;
    this.code = code;
    this.retryable = Boolean(retryable);
    this.retryAfterSec = retryAfterSec;
    this.requestId = requestId;
  }
}

/** Retry-After in seconds (delta-seconds or HTTP-date); null when absent or unreadable. */
function parseRetryAfter(value) {
  if (value === null || value === undefined || value === '') return null;
  if (/^\d+$/.test(String(value).trim())) return Number(value);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, Math.ceil((at - Date.now()) / 1000)) : null;
}

function transportError(error) {
  const timeout = error?.name === 'TimeoutError';
  return new AiGatewayError({ status: 0, code: timeout ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE', retryable: true });
}

const isUuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Never show an uncited answer, even if a faulty gateway sent one (defence in depth). */
function failClosed(result) {
  if (result && result.status === 'GROUNDED' && (!Array.isArray(result.citations) || result.citations.length === 0)) {
    return { ...result, status: 'INSUFFICIENT_EVIDENCE', answer: null, answerJson: null, citations: [] };
  }
  return result;
}

export function createAiGatewayClient({ apiBase, serviceToken, fetchImpl = globalThis.fetch, timeoutMs = 20_000 }) {
  if (!apiBase) throw new Error('ADS_AI_GATEWAY_URL_REQUIRED');
  if (!serviceToken) throw new Error('ADS_AI_GATEWAY_SERVICE_TOKEN_REQUIRED');
  const base = String(apiBase).replace(/\/$/, '');

  function headers({ subjectToken, requestId, idempotencyKey, json }) {
    const h = { authorization: `Bearer ${serviceToken}`, 'x-request-id': isUuid(requestId) ? requestId : randomUUID(), accept: 'application/json, application/x-ndjson' };
    if (subjectToken) h['x-ads-subject-token'] = subjectToken;
    if (idempotencyKey) h['idempotency-key'] = idempotencyKey;
    if (json) h['content-type'] = 'application/json';
    return h;
  }

  function clean(input) {
    const out = { ...input };
    for (const k of FORBIDDEN_KEYS) delete out[k];
    return out;
  }

  async function raise(res) {
    let body = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    const e = body?.error;
    const retryAfterSec = parseRetryAfter(res.headers.get('retry-after'));
    if (e && ERROR_CODES.has(e.code)) throw new AiGatewayError({ status: res.status, code: e.code, retryable: e.retryable, retryAfterSec, requestId: e.requestId ?? res.headers.get('x-request-id') });
    // A body that is not the gateway's error shape (proxy page, load balancer): classify by status.
    if (res.status === 429) throw new AiGatewayError({ status: 429, code: 'RATE_LIMITED', retryable: true, retryAfterSec, requestId: res.headers.get('x-request-id') });
    if (res.status === 401) throw new AiGatewayError({ status: 401, code: 'UNAUTHENTICATED', retryable: false, requestId: res.headers.get('x-request-id') });
    throw new AiGatewayError({ status: res.status, code: res.status === 504 ? 'PROVIDER_TIMEOUT' : res.status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'REQUEST_INVALID', retryable: res.status >= 500, retryAfterSec, requestId: res.headers.get('x-request-id') });
  }

  async function call(method, path, { body, ...opts } = {}) {
    let res;
    try {
      res = await fetchImpl(`${base}${path}`, { method, headers: headers({ ...opts, json: body !== undefined }), body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(opts.timeoutMs ?? timeoutMs) });
    } catch (error) {
      throw transportError(error);
    }
    if (!res.ok) await raise(res);
    return res;
  }
  // A 2xx body that cannot be read or parsed (cut connection, timeout, proxy HTML) is a
  // PROVIDER_RESPONSE_INVALID / PROVIDER_TIMEOUT AiGatewayError, never a raw SyntaxError.
  const json = async (method, path, opts) => {
    const res = await call(method, path, opts);
    try { return await res.json(); } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw transportError(error);
      throw new AiGatewayError({ status: res.status, code: 'PROVIDER_RESPONSE_INVALID', retryable: true, requestId: res.headers.get('x-request-id') });
    }
  };

  return {
    /** POST /v1/ai/ask (sync). Returns the §5.4 body; status GROUNDED or INSUFFICIENT_EVIDENCE. */
    async ask(input, opts = {}) {
      return failClosed(await json('POST', '/ask', { ...opts, body: { ...clean(input), stream: false } }));
    },
    /** POST /v1/ai/ask with stream:true. Yields the §6.5 normalised events. Use collectStream()
     * or remove any shown text yourself when the final status is not GROUNDED. */
    async *askStream(input, opts = {}) {
      const res = await call('POST', '/ask', { ...opts, body: { ...clean(input), stream: true } });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      const parse = line => { if (!line.trim()) return null; try { return JSON.parse(line); } catch { return { type: 'error', code: 'PROVIDER_RESPONSE_INVALID', retryable: true }; } };
      for (;;) {
        let chunk;
        // A stream cut mid-way (timeout, reset) ends with an error event, not a thrown raw error,
        // so collectStream discards any text already shown.
        try { chunk = await reader.read(); } catch (error) {
          const e = transportError(error);
          yield { type: 'error', code: e.code, retryable: true };
          return;
        }
        const { done, value } = chunk;
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        let i;
        while ((i = pending.indexOf('\n')) >= 0) { const e = parse(pending.slice(0, i)); pending = pending.slice(i + 1); if (e) yield e; }
      }
      const last = parse(pending + decoder.decode());
      if (last) yield last;
    },
    find: (input, opts = {}) => json('POST', '/find', { ...opts, body: clean(input) }),
    graph: (input, opts = {}) => json('POST', '/graph', { ...opts, body: clean(input) }),
    resource: (resourceRef, { useCase, collection }, opts = {}) => json('GET', `/resources/${encodeURIComponent(resourceRef)}?${new URLSearchParams({ useCase, ...(collection ? { collection } : {}) })}`, opts),
    collections: (useCase, opts = {}) => json('GET', `/collections?${new URLSearchParams({ useCase })}`, opts),
    /** POST /v1/ai/ingest. Send only content that passed the product's maker-checker approval. */
    ingest: (input, opts = {}) => json('POST', '/ingest', { ...opts, idempotencyKey: opts.idempotencyKey ?? randomUUID(), body: clean(input) }),
    ingestStatus: (jobId, opts = {}) => json('GET', `/ingest/${encodeURIComponent(jobId)}`, opts),
    withdraw: (input, opts = {}) => json('POST', '/withdraw', { ...opts, idempotencyKey: opts.idempotencyKey ?? randomUUID(), body: clean(input) }),
    health: (opts = {}) => json('GET', '/health', opts),
  };
}

/** Consumes askStream events: the answer is kept only if the final status is GROUNDED. */
export async function collectStream(events, onChunk = () => {}) {
  let text = '';
  let citations = [];
  let status = null;
  let error = null;
  let runId = null;
  for await (const e of events) {
    if (e.type === 'answer-chunk') { text += e.text; onChunk(e.text); }
    else if (e.type === 'citations') citations = e.citations;
    else if (e.type === 'status') status = e.status;
    else if (e.type === 'error') error = { code: e.code, retryable: e.retryable };
    else if (e.type === 'done') runId = e.runId;
  }
  const grounded = !error && status === 'GROUNDED' && citations.length > 0 && text.length > 0;
  return { status: error ? 'ERROR' : grounded ? 'GROUNDED' : 'INSUFFICIENT_EVIDENCE', answer: grounded ? text : null, citations: grounded ? citations : [], error, runId, discardShownText: !grounded };
}

/** One retry for a retryable error, after Retry-After (bounded), within the same user action (§10.1). */
export async function withOneRetry(fn, { maxWaitSec = 5, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  try { return await fn(); } catch (error) {
    if (!(error instanceof AiGatewayError) || !error.retryable) throw error;
    const after = Number.isFinite(error.retryAfterSec) ? error.retryAfterSec : null;
    if ((after ?? 0) > maxWaitSec) throw error;
    const wait = Math.min(maxWaitSec, Math.max(0.2, after ?? 0.5));
    await sleep(wait * 1000);
    return fn();
  }
}

/** The user-facing state and EN/FR message for a result or error (standard §4, §10.1). */
export function userMessage(resultOrError, lang = 'en') {
  const m = MESSAGES[lang === 'fr' ? 'fr' : 'en'];
  if (resultOrError instanceof AiGatewayError) {
    if ([401, 403].includes(resultOrError.status)) return { kind: 'denied', text: m.denied };
    if (resultOrError.status === 429) return { kind: 'rate_limited', text: m.rateLimited, retryAfterSec: resultOrError.retryAfterSec };
    if ([400, 404, 422].includes(resultOrError.status)) return { kind: 'unavailable', text: m.unavailable };
    return { kind: 'unavailable', text: m.unavailable };
  }
  if (resultOrError?.status === 'GROUNDED') return { kind: 'grounded', text: m.aiLabel, testModeLabel: resultOrError.testMode ? m.testMode : null };
  if (resultOrError?.status === 'ERROR') return { kind: 'unavailable', text: m.unavailable };
  return { kind: 'insufficient', text: m.insufficient };
}

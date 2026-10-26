import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { AiGatewayError, MESSAGES, collectStream, createAiGatewayClient, userMessage, withOneRetry } from '../src/index.mjs';
import { createAiGatewayTestDouble } from '../src/test-double.mjs';
import { assertContract } from '../src/schema-check.mjs';
import { createMocks } from '../../../services/mocks/src/server.mjs';
import { createSigner } from '../../../services/mocks/test/jwt-helper.mjs';

const TENANT = '11111111-1111-4111-8111-111111111111';
const ISSUER = 'https://login.e2e.ads.invalid';
const SECRET = 'leisure-web-gateway-client-secret-for-tests';

describe('client against the in-process test double', () => {
  let double, ai;
  beforeEach(() => {
    double = createAiGatewayTestDouble({ contextAllowlist: { 'leisure.event-help': ['eventType'] }, personalData: ['leisure.private'] });
    ai = createAiGatewayClient({ apiBase: double.apiBase, serviceToken: 'svc', fetchImpl: double.fetch });
  });

  it('sends the service credential and the user token, never tenant or role fields', async () => {
    const r = await ai.ask({ useCase: 'leisure.event-help', collection: 'events', query: 'What time does it start?', tenantId: 'forged', role: 'admin', context: { eventType: 'concert' } }, { subjectToken: 'user-token' });
    assertContract('ask-response', r);
    assert.equal(r.status, 'GROUNDED');
    const sent = double.requests.at(-1);
    assert.equal(sent.headers.authorization, 'Bearer svc');
    assert.equal(sent.headers['x-ads-subject-token'], 'user-token');
    assert.equal(sent.body.tenantId, undefined);
    assert.equal(sent.body.role, undefined);
  });
  it('maps errors to AiGatewayError with Retry-After, and gives EN/FR messages', async () => {
    double.next('RATE_LIMITED', { retryAfter: 7 });
    const e = await ai.ask({ useCase: 'leisure.event-help', collection: 'events', query: 'abc' }, { subjectToken: 't' }).catch(x => x);
    assert.ok(e instanceof AiGatewayError);
    assert.equal(e.code, 'RATE_LIMITED');
    assert.equal(e.retryAfterSec, 7);
    assert.equal(userMessage(e, 'fr').text, MESSAGES.fr.rateLimited);
    double.next('insufficient');
    const r = await ai.ask({ useCase: 'leisure.event-help', collection: 'events', query: 'abc' }, { subjectToken: 't' });
    assert.equal(userMessage(r).text, MESSAGES.en.insufficient);
    const ctx = await ai.ask({ useCase: 'leisure.event-help', collection: 'events', query: 'abc', context: { email: 'x' } }, { subjectToken: 't' }).catch(x => x);
    assert.equal(ctx.code, 'CONTEXT_FIELD_NOT_ALLOWED');
    const consent = await ai.ask({ useCase: 'leisure.private', collection: 'events', query: 'abc' }, { subjectToken: 't' }).catch(x => x);
    assert.equal(consent.code, 'CONSENT_REQUIRED');
  });
  it('withOneRetry retries a retryable error once, never a non-retryable one', async () => {
    double.next('PROVIDER_UNAVAILABLE');
    const r = await withOneRetry(() => ai.ask({ useCase: 'leisure.event-help', collection: 'events', query: 'abc' }, { subjectToken: 't' }), { sleep: async () => {} });
    assert.equal(r.status, 'GROUNDED');
    double.next('USE_CASE_FORBIDDEN');
    await assert.rejects(withOneRetry(() => ai.ask({ useCase: 'leisure.event-help', collection: 'events', query: 'abc' }, { subjectToken: 't' }), { sleep: async () => {} }), /USE_CASE_FORBIDDEN/);
  });
  it('collectStream keeps text only for GROUNDED and tells the product to discard otherwise', async () => {
    const ok = await collectStream(ai.askStream({ useCase: 'leisure.event-help', collection: 'events', query: 'abc' }, { subjectToken: 't' }));
    assert.equal(ok.status, 'GROUNDED');
    assert.ok(ok.answer);
    double.next('stream_error', { code: 'PROVIDER_TIMEOUT' });
    const shown = [];
    const bad = await collectStream(ai.askStream({ useCase: 'leisure.event-help', collection: 'events', query: 'abc' }, { subjectToken: 't' }), t => shown.push(t));
    assert.equal(bad.status, 'ERROR');
    assert.equal(bad.answer, null);
    assert.equal(bad.discardShownText, true);
  });
  it('fails closed if a faulty gateway ever returns GROUNDED without citations', async () => {
    double.next('grounded', { citations: [] });
    const r = await ai.ask({ useCase: 'leisure.event-help', collection: 'events', query: 'abc' }, { subjectToken: 't' });
    assert.equal(r.status, 'INSUFFICIENT_EVIDENCE');
    assert.equal(r.answer, null);
  });
  it('ingest sends an Idempotency-Key and needs approval', async () => {
    const r = await ai.ingest({ useCase: 'leisure.event-help', collection: 'events', sourceId: 's', sourceVersion: '1', title: 't', contentType: 'text/plain', content: 'x', approvedBy: 'u', approvedAt: new Date().toISOString() });
    assertContract('ingest-accepted', r);
    assert.match(double.requests.at(-1).headers['idempotency-key'], /^[0-9a-f-]{36}$/);
  });
});

describe('client error handling for non-gateway replies and broken transports', () => {
  const input = { useCase: 'u.c', collection: 'c', query: 'abc' };
  const reply = (status, body, headers = {}) => async () => new Response(body, { status, headers });

  it('a 429 without the gateway error body is RATE_LIMITED, retryable, with Retry-After as seconds or HTTP-date', async () => {
    let ai = createAiGatewayClient({ apiBase: 'http://gw.test/v1/ai', serviceToken: 's', fetchImpl: reply(429, '<html>slow down</html>', { 'retry-after': '3' }) });
    let e = await ai.ask(input, { subjectToken: 't' }).catch(x => x);
    assert.ok(e instanceof AiGatewayError);
    assert.equal(e.code, 'RATE_LIMITED');
    assert.equal(e.retryable, true);
    assert.equal(e.retryAfterSec, 3);
    const date = new Date(Date.now() + 2500).toUTCString();
    ai = createAiGatewayClient({ apiBase: 'http://gw.test/v1/ai', serviceToken: 's', fetchImpl: reply(429, '', { 'retry-after': date }) });
    e = await ai.ask(input, { subjectToken: 't' }).catch(x => x);
    assert.ok(Number.isFinite(e.retryAfterSec) && e.retryAfterSec >= 0 && e.retryAfterSec <= 3);
    ai = createAiGatewayClient({ apiBase: 'http://gw.test/v1/ai', serviceToken: 's', fetchImpl: reply(429, '', { 'retry-after': 'soon' }) });
    e = await ai.ask(input, { subjectToken: 't' }).catch(x => x);
    assert.equal(e.retryAfterSec, null);
    // withOneRetry never sleeps NaN: an unreadable Retry-After waits the default.
    const waits = [];
    await withOneRetry(() => Promise.reject(e), { sleep: async ms => { waits.push(ms); } }).catch(() => {});
    assert.deepEqual(waits, [500]);
  });

  it('a 2xx body that is not JSON is PROVIDER_RESPONSE_INVALID, a 504 page is PROVIDER_TIMEOUT', async () => {
    let ai = createAiGatewayClient({ apiBase: 'http://gw.test/v1/ai', serviceToken: 's', fetchImpl: reply(200, '<html>proxy</html>', { 'content-type': 'text/html' }) });
    let e = await ai.ask(input, { subjectToken: 't' }).catch(x => x);
    assert.ok(e instanceof AiGatewayError);
    assert.equal(e.code, 'PROVIDER_RESPONSE_INVALID');
    assert.equal(e.retryable, true);
    assert.equal(userMessage(e).kind, 'unavailable');
    ai = createAiGatewayClient({ apiBase: 'http://gw.test/v1/ai', serviceToken: 's', fetchImpl: reply(504, 'gateway timeout') });
    e = await ai.ask(input, { subjectToken: 't' }).catch(x => x);
    assert.equal(e.code, 'PROVIDER_TIMEOUT');
    e = await createAiGatewayClient({ apiBase: 'http://gw.test/v1/ai', serviceToken: 's', fetchImpl: reply(200, 'nope') }).health().catch(x => x);
    assert.equal(e.code, 'PROVIDER_RESPONSE_INVALID');
  });

  it('a stream cut mid-way ends in an error event, and collectStream discards the shown text', async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream({
      start(c) { c.enqueue(enc.encode('{"type":"citations","citations":[{"ref":"1","resourceId":"r","title":"t","sourceUri":null,"score":0.9}]}\n{"type":"answer-chunk","text":"partial "}\n')); },
      pull(c) { c.error(new TypeError('terminated')); },
    });
    const ai = createAiGatewayClient({ apiBase: 'http://gw.test/v1/ai', serviceToken: 's', fetchImpl: async () => new Response(body, { status: 200, headers: { 'content-type': 'application/x-ndjson' } }) });
    const shown = [];
    const r = await collectStream(ai.askStream(input, { subjectToken: 't' }), t => shown.push(t));
    assert.deepEqual(shown, ['partial ']);
    assert.equal(r.status, 'ERROR');
    assert.equal(r.error.code, 'PROVIDER_UNAVAILABLE');
    assert.equal(r.answer, null);
    assert.equal(r.discardShownText, true);
  });
});

describe('client against the kit mock facade (/ai/v1) with signed E2E-style tokens', () => {
  let mocks, base, signer, ai;
  before(async () => {
    mocks = createMocks({ log: { info() {}, warn() {}, error() {} } });
    const range = String(process.env.ADS_TEST_PORT_RANGE ?? '').match(/^(\d+)-(\d+)$/);
    const ports = range ? Array.from({ length: Number(range[2]) - Number(range[1]) + 1 }, (_, i) => Number(range[1]) + i) : [0];
    for (const p of ports) {
      try { await new Promise((res, rej) => { mocks.server.once('error', rej); mocks.server.listen(p, '127.0.0.1', res); }); break; } catch (e) { if (e.code !== 'EADDRINUSE') throw e; }
    }
    base = `http://127.0.0.1:${mocks.server.address().port}`;
  });
  after(() => new Promise(r => mocks.server.close(r)));
  beforeEach(async () => {
    signer = createSigner();
    const put = (path, body) => fetch(`${base}${path}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    await fetch(`${base}/_control/reset`, { method: 'POST' });
    await put('/_control/progress/kb/kb-leisure', { token: 'kb-leisure-service-account-token' });
    await put('/_control/ai/config', { issuer: ISSUER, jwks: signer.jwks, clients: { 'leisure-web': SECRET } });
    await put('/_control/ai/use-cases', { useCases: [{ useCase: 'leisure.event-help', clientId: 'leisure-web', allowedRoles: ['attendee'], operations: ['ask', 'find'], collections: { events: { scope: 'shared' } }, safetyExcluded: true, streaming: true }] });
    await put('/_control/ai/routes', { routes: [{ clientId: 'leisure-web', scope: 'shared', collection: 'events', kbId: 'kb-leisure' }] });
    ai = createAiGatewayClient({ apiBase: `${base}/ai/v1`, serviceToken: SECRET });
  });
  const token = (roles = ['attendee']) => signer.user({ issuer: ISSUER, audience: 'leisure-web', tenantId: TENANT, roles });

  it('ask, find and stream round-trip through the facade and match the shared contract', async () => {
    const r = await ai.ask({ useCase: 'leisure.event-help', collection: 'events', query: 'How do mobile money refunds work?' }, { subjectToken: token() });
    assertContract('ask-response', r);
    assert.equal(r.status, 'GROUNDED');
    assert.equal(r.testMode, true);
    assert.equal(userMessage(r, 'fr').testModeLabel, MESSAGES.fr.testMode);
    const f = await ai.find({ useCase: 'leisure.event-help', collection: 'events', query: 'cash collection' }, { subjectToken: token() });
    assertContract('find-response', f);
    const s = await collectStream(ai.askStream({ useCase: 'leisure.event-help', collection: 'events', query: 'refunds' }, { subjectToken: token() }));
    assert.equal(s.status, 'GROUNDED');
  });
  it('a user without an allowed role is denied, and the denial maps to the denied message', async () => {
    const e = await ai.ask({ useCase: 'leisure.event-help', collection: 'events', query: 'refunds' }, { subjectToken: token(['visitor']) }).catch(x => x);
    assert.equal(e.code, 'USE_CASE_FORBIDDEN');
    assert.equal(userMessage(e).kind, 'denied');
  });
});

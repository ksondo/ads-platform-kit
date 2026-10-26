import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { createMocks } from '../src/server.mjs';
import { createSigner } from './jwt-helper.mjs';
import { assertContract } from '../../../packages/ai-gateway-client/src/schema-check.mjs';

// Progress-shaped mock (/progress/api/v1, standard §13.1, gaps G1-G11, G14) and the AI gateway
// facade (/ai/v1, §13.2, gaps G11-G13).

const quiet = { info() {}, warn() {}, error(m) { if (process.env.DEBUG) console.error(m); } };
let mocks, base;
const TOKEN_A = 'kb-a-service-account-token';
const TOKEN_B = 'kb-b-service-account-token';
const P = '/progress/api/v1';
const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const ISSUER = 'https://login.e2e.ads.invalid';
const SERVICE_SECRET = 'nutrition-web-gateway-client-secret-for-tests';

async function listen(server) {
  const range = String(process.env.ADS_TEST_PORT_RANGE ?? '').match(/^(\d+)-(\d+)$/);
  const tryPort = port => new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
  if (!range) return tryPort(0);
  for (let port = Number(range[1]); port <= Number(range[2]); port += 1) { try { return await tryPort(port); } catch (e) { if (e.code !== 'EADDRINUSE') throw e; } }
  throw new Error('no free port in ADS_TEST_PORT_RANGE');
}

const req = async (method, path, body, headers = {}) => {
  const res = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* ndjson */ }
  return { status: res.status, headers: res.headers, text, json };
};
const sa = token => ({ 'x-nuclia-serviceaccount': `Bearer ${token}` });
const sync = { 'x-synchronous': 'true' };

before(async () => { mocks = createMocks({ log: quiet }); await listen(mocks.server); base = `http://127.0.0.1:${mocks.server.address().port}`; });
after(() => new Promise(r => mocks.server.close(r)));
beforeEach(async () => {
  await req('POST', '/_control/reset');
  await req('PUT', '/_control/progress/kb/kb-a', { token: TOKEN_A, graph: [{ source: { value: 'Maize', group: 'CROP' }, relation: 'REQUIRES', destination: { value: 'Nitrogen', group: 'NUTRIENT' }, resourceId: 'rid0beans000000000000000000000003' }] });
  await req('PUT', '/_control/progress/kb/kb-b', { token: TOKEN_B, resources: [{ id: 'ridtenantbonly00000000000000000b', title: 'Tenant B private guide', uri: 'https://example.org/b', paragraphs: ['Refunds for tenant B follow a special rule.'] }] });
});

describe('Progress-shaped API: auth (G2)', () => {
  it('401 without the service-account header, 401 for an unknown token, 403 for another KB token, 404 for an unknown KB', async () => {
    assert.equal((await req('POST', `${P}/kb/kb-a/find`, { query: 'refunds' })).status, 401);
    assert.equal((await req('POST', `${P}/kb/kb-a/find`, { query: 'refunds' }, sa('not-a-registered-token'))).status, 401);
    assert.equal((await req('POST', `${P}/kb/kb-a/find`, { query: 'refunds' }, sa(TOKEN_B))).status, 403);
    assert.equal((await req('POST', `${P}/kb/kb-zz/find`, { query: 'refunds' }, sa(TOKEN_A))).status, 404);
    const ok = await req('POST', `${P}/kb/kb-a/find`, { query: 'refunds' }, { authorization: `Bearer ${TOKEN_A}` });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('x-ads-test-mode'), 'true');
  });
});

describe('Progress-shaped API: /find (G1, G3, G7)', () => {
  it('returns resources with paragraphs, scores and best_matches as rid/t/body/s-e', async () => {
    const r = await req('POST', `${P}/kb/kb-a/find`, { query: 'mobile money refund', page_size: 5, features: ['keyword', 'semantic'], show: ['basic', 'values', 'origin'] }, sa(TOKEN_A));
    assert.equal(r.status, 200);
    assert.ok(r.json.best_matches.length >= 1);
    for (const ref of r.json.best_matches) assert.match(ref, /^[A-Za-z0-9_-]+\/t\/body\/\d+-\d+$/);
    const rid = r.json.best_matches[0].split('/')[0];
    const para = r.json.resources[rid].fields['/t/body'].paragraphs[r.json.best_matches[0]];
    assert.equal(typeof para.score, 'number');
    assert.equal(r.json.resources[rid].origin.url, 'mock://progress/refunds');
    assert.equal(r.json.next_page, false);
  });
  it('applies icon and label filters, and refuses unknown filters instead of dropping them', async () => {
    const pdfPolicy = await req('POST', `${P}/kb/kb-a/find`, { query: 'refund cash bank', filters: ['/icon/application/pdf', '/classification.labels/topic/policy'] }, sa(TOKEN_A));
    assert.deepEqual(Object.keys(pdfPolicy.json.resources), ['rid0refunds000000000000000000001']);
    const procedure = await req('POST', `${P}/kb/kb-a/find`, { query: 'refund cash bank', filters: ['/classification.labels/topic/procedure'] }, sa(TOKEN_A));
    assert.deepEqual(Object.keys(procedure.json.resources), ['rid0cash0000000000000000000000002']);
    assert.equal((await req('POST', `${P}/kb/kb-a/find`, { query: 'refund', filters: { documentIds: ['x'] } }, sa(TOKEN_A))).status, 400);
    assert.equal((await req('POST', `${P}/kb/kb-a/find`, { query: 'refund', filters: ['/tenantId/abc'] }, sa(TOKEN_A))).status, 400);
  });
});

describe('Progress-shaped API: /ask (G3-G6, G10, G14)', () => {
  it('sync: answer built from retrieved passages with [n] markers, retrieval_results and retrieval_best_matches', async () => {
    const r = await req('POST', `${P}/kb/kb-a/ask`, { query: 'How are mobile money refunds paid?', prefer_markdown: true, rephrase: true, max_tokens: 300, citations: true }, { ...sa(TOKEN_A), ...sync });
    assert.equal(r.status, 200);
    assert.match(r.json.answer, /refunded within 7 days.*\[1\]/);
    assert.ok(r.json.retrieval_best_matches.length > 0);
    assert.ok(r.json.retrieval_results.resources[r.json.retrieval_best_matches[0].split('/')[0]]);
  });
  it('records prompt.system/prompt.user and answers in French when the taught prefix is used', async () => {
    const prompt = { system: 'Be brief.', user: 'Context: {context}\n\nQuestion: {question}' };
    const r = await req('POST', `${P}/kb/kb-a/ask`, { query: 'Respond in French: how are refunds paid', prompt }, { ...sa(TOKEN_A), ...sync });
    assert.match(r.json.answer, /^Selon les sources de test/);
    const recorded = (await req('GET', '/_control/progress/prompts?kbId=kb-a')).json.items;
    assert.equal(recorded.at(-1).prompt.user, prompt.user);
    assert.equal(recorded.at(-1).query, 'Respond in French: how are refunds paid');
  });
  it('stream: NDJSON answer chunks, retrieval and status "0", lines split across network chunks, unknown items present', async () => {
    const r = await req('POST', `${P}/kb/kb-a/ask`, { query: 'refunds' }, sa(TOKEN_A));
    assert.match(r.headers.get('content-type'), /ndjson/);
    const items = r.text.trim().split('\n').map(l => JSON.parse(l).item);
    assert.ok(items.filter(i => i.type === 'answer').length >= 2);
    assert.ok(items.some(i => i.type === 'retrieval' && i.results.best_matches.length));
    assert.ok(items.some(i => i.type === 'debug'));
    assert.deepEqual(items.at(-1), { type: 'status', code: '0', status: 'success' });
  });
  it('structured output: answer_json, JSON inside answer, and item.object shapes', async () => {
    const schema = { name: 'faqs', description: 'x', parameters: { type: 'object', additionalProperties: false, properties: { faqs: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { question: { type: 'string' }, citation_resource_id: { type: 'string' } }, required: ['question', 'citation_resource_id'] } } }, required: ['faqs'] } };
    const a = await req('POST', `${P}/kb/kb-a/ask`, { query: 'refunds', answer_json_schema: schema }, { ...sa(TOKEN_A), ...sync });
    assert.equal(a.json.answer_json.faqs[0].citation_resource_id, 'rid0refunds000000000000000000001');
    const t = await req('POST', `${P}/kb/kb-a/ask`, { query: 'refunds [mock:schema_in_text]', answer_json_schema: schema }, { ...sa(TOKEN_A), ...sync });
    assert.equal(t.json.answer_json, undefined);
    assert.match(t.json.answer, /```json/);
    const o = await req('POST', `${P}/kb/kb-a/ask`, { query: 'refunds [mock:schema_item_object]', answer_json_schema: schema }, { ...sa(TOKEN_A), ...sync });
    assert.ok(o.json.item.object.faqs);
    const bad = await req('POST', `${P}/kb/kb-a/ask`, { query: 'refunds [mock:schema_bad_citation]', answer_json_schema: schema }, { ...sa(TOKEN_A), ...sync });
    assert.equal(bad.json.answer_json.faqs[0].citation_resource_id, 'rid-invented-by-model');
  });
  it('evidence outcomes: no_results, uncited, low_evidence, heading-mark titles', async () => {
    const none = await req('POST', `${P}/kb/kb-a/ask`, { query: 'refunds [mock:no_results]' }, { ...sa(TOKEN_A), ...sync });
    assert.deepEqual(none.json.retrieval_best_matches, []);
    const uncited = await req('POST', `${P}/kb/kb-a/ask`, { query: 'refunds [mock:uncited]' }, { ...sa(TOKEN_A), ...sync });
    assert.ok(uncited.json.answer && uncited.json.retrieval_best_matches.length === 0);
    const low = await req('POST', `${P}/kb/kb-a/ask`, { query: 'refunds [mock:low_evidence]' }, { ...sa(TOKEN_A), ...sync });
    assert.equal(low.json.retrieval_best_matches.length, 1);
    const rid = low.json.retrieval_best_matches[0].split('/')[0];
    assert.ok(Object.values(low.json.retrieval_results.resources[rid].fields['/t/body'].paragraphs)[0].score < 0.7);
    const marks = await req('POST', `${P}/kb/kb-a/ask`, { query: 'refunds [mock:title_with_heading_marks]' }, { ...sa(TOKEN_A), ...sync });
    assert.match(Object.values(marks.json.retrieval_results.resources)[0].title, /^## /);
  });
  it('stream failures: malformed NDJSON line, missing status', async () => {
    const bad = await req('POST', `${P}/kb/kb-a/ask`, { query: 'refunds [mock:malformed_ndjson]' }, sa(TOKEN_A));
    assert.throws(() => bad.text.trim().split('\n').forEach(l => JSON.parse(l)));
    const nostatus = await req('POST', `${P}/kb/kb-a/ask`, { query: 'refunds [mock:missing_status]' }, sa(TOKEN_A));
    assert.ok(!nostatus.text.includes('"type":"status"'));
  });
});

describe('Progress-shaped API: limits and slowness (G9)', () => {
  it('rate_limited returns 429 with Retry-After; scripted per KB and operation', async () => {
    await req('POST', '/_control/scripts', { provider: 'progress', outcome: 'rate_limited', match: { kbId: 'kb-a', op: 'ask' }, retryAfter: 3 });
    const r = await req('POST', `${P}/kb/kb-a/ask`, { query: 'refunds' }, { ...sa(TOKEN_A), ...sync });
    assert.equal(r.status, 429);
    assert.equal(r.headers.get('retry-after'), '3');
    assert.equal((await req('POST', `${P}/kb/kb-a/ask`, { query: 'refunds' }, { ...sa(TOKEN_A), ...sync })).status, 200);
  });
  it('an RPM limit set per KB produces 429 once passed', async () => {
    await req('PUT', '/_control/progress/kb/kb-r', { token: 'kb-r-service-account-token', rpmLimit: 2 });
    const call = () => req('POST', `${P}/kb/kb-r/find`, { query: 'refunds' }, sa('kb-r-service-account-token'));
    assert.equal((await call()).status, 200);
    assert.equal((await call()).status, 200);
    const third = await call();
    assert.equal(third.status, 429);
    assert.ok(Number(third.headers.get('retry-after')) >= 1);
  });
  it('slow delays the reply; unavailable is 503', async () => {
    await req('POST', '/_control/scripts', { provider: 'progress', outcome: 'slow', match: { kbId: 'kb-a' }, delayMs: 300 });
    const t = Date.now();
    assert.equal((await req('POST', `${P}/kb/kb-a/find`, { query: 'refunds' }, sa(TOKEN_A))).status, 200);
    assert.ok(Date.now() - t >= 280);
    assert.equal((await req('POST', `${P}/kb/kb-a/find`, { query: 'refunds [mock:unavailable]' }, sa(TOKEN_A))).status, 503);
  });
});

describe('Progress-shaped API: graph, resource, labelsets (G8)', () => {
  it('graph returns seeded paths only with the data-augmentation filter, noise otherwise', async () => {
    const filtered = await req('POST', `${P}/kb/kb-a/graph`, { query: { and: [{ prop: 'path', source: { value: 'Maize', group: 'CROP' }, undirected: true }, { prop: 'generated', by: 'data-augmentation' }] }, top_k: 20 }, sa(TOKEN_A));
    assert.equal(filtered.json.paths[0].relation.label, 'REQUIRES');
    const noisy = await req('POST', `${P}/kb/kb-a/graph`, { query: { and: [{ prop: 'path' }] } }, sa(TOKEN_A));
    assert.equal(noisy.json.paths[0].source.group, 'MISC');
    const nodes = await req('POST', `${P}/kb/kb-a/graph/nodes`, { query: { prop: 'node', value: 'mai' } }, sa(TOKEN_A));
    assert.deepEqual(nodes.json.nodes.map(n => n.value), ['Maize']);
  });
  it('resource with origin and classifications; 404 when missing; labelsets', async () => {
    const r = await req('GET', `${P}/kb/kb-a/resource/rid0cash0000000000000000000000002?show=basic&show=origin`, undefined, sa(TOKEN_A));
    assert.equal(r.json.origin.url, 'mock://progress/cash');
    assert.deepEqual(r.json.usermetadata.classifications, [{ labelset: 'topic', label: 'procedure' }]);
    assert.equal((await req('GET', `${P}/kb/kb-a/resource/ridmissing`, undefined, sa(TOKEN_A))).status, 404);
    const ls = await req('GET', `${P}/kb/kb-a/labelsets`, undefined, sa(TOKEN_A));
    assert.ok(ls.json.labelsets.topic.labels.some(l => l.title === 'policy'));
  });
});

describe('AI gateway facade /ai/v1 (G11-G13)', () => {
  let signer;
  const svc = { authorization: `Bearer ${SERVICE_SECRET}` };
  beforeEach(async () => {
    signer = createSigner();
    await req('PUT', '/_control/ai/config', { issuer: ISSUER, jwks: signer.jwks, clients: { 'nutrition-web': SERVICE_SECRET } });
    await req('PUT', '/_control/ai/use-cases', { useCases: [
      { useCase: 'nutrition.plan-explanation', clientId: 'nutrition-web', allowedRoles: ['member'], operations: ['ask', 'find', 'graph', 'resource', 'collections', 'ingest'], collections: { guidance: { scope: 'shared' }, 'tenant-notes': { scope: 'tenant' } }, contextAllowlist: ['goal'], safetyExcluded: true, streaming: true, labels: ['topic/policy'] },
      { useCase: 'nutrition.private-coach', clientId: 'nutrition-web', allowedRoles: ['member'], operations: ['ask'], collections: { guidance: { scope: 'shared' } }, personalData: true, consentPurpose: 'coaching', safetyExcluded: true },
    ] });
    await req('PUT', '/_control/ai/routes', { routes: [
      { clientId: 'nutrition-web', scope: 'shared', collection: 'guidance', kbId: 'kb-a' },
      { clientId: 'nutrition-web', scope: 'tenant', tenantId: TENANT_B, collection: 'tenant-notes', kbId: 'kb-b' },
    ] });
  });
  const user = (tenantId = TENANT_A, roles = ['member']) => signer.user({ issuer: ISSUER, audience: 'nutrition-web', tenantId, roles });
  const ask = async (body, headers = {}) => req('POST', '/ai/v1/ask', body, { ...svc, 'x-ads-subject-token': await user(), ...headers });

  it('grounded answer with citations, testMode and provider.mode mock; body matches the shared contract', async () => {
    const r = await ask({ useCase: 'nutrition.plan-explanation', collection: 'guidance', query: 'Why beans at lunch?', context: { goal: 'maintain' } });
    assert.equal(r.status, 200);
    assertContract('ask-response', r.json);
    assert.equal(r.json.status, 'GROUNDED');
    assert.equal(r.json.testMode, true);
    assert.equal(r.json.provider.mode, 'mock');
    assert.ok(r.json.citations.length >= 1);
  });
  it('service and subject token checks: missing, forged signature, wrong audience, expired', async () => {
    assert.equal((await req('POST', '/ai/v1/ask', { useCase: 'nutrition.plan-explanation', collection: 'guidance', query: 'beans' }, { 'x-ads-subject-token': await user() })).status, 401);
    assert.equal((await ask({ useCase: 'nutrition.plan-explanation', collection: 'guidance', query: 'beans' }, { 'x-ads-subject-token': signer.forged({ issuer: ISSUER, audience: 'nutrition-web', tenantId: TENANT_A, roles: ['member'] }) })).status, 401);
    assert.equal((await ask({ useCase: 'nutrition.plan-explanation', collection: 'guidance', query: 'beans' }, { 'x-ads-subject-token': signer.user({ issuer: ISSUER, audience: 'other-web', tenantId: TENANT_A, roles: ['member'] }) })).status, 401);
    assert.equal((await ask({ useCase: 'nutrition.plan-explanation', collection: 'guidance', query: 'beans' }, { 'x-ads-subject-token': signer.user({ issuer: ISSUER, audience: 'nutrition-web', tenantId: TENANT_A, roles: ['member'], exp: -60 }) })).status, 401);
    const jwtService = await req('POST', '/ai/v1/ask', { useCase: 'nutrition.plan-explanation', collection: 'guidance', query: 'beans' }, { authorization: `Bearer ${signer.service({ issuer: ISSUER, clientId: 'nutrition-web' })}`, 'x-ads-subject-token': await user() });
    assert.equal(jwtService.status, 200);
  });
  it('tenant routing: tenant A cannot reach the tenant-scoped collection even with forged headers or body', async () => {
    const forged = await ask({ useCase: 'nutrition.plan-explanation', collection: 'tenant-notes', query: 'refund rule', tenantId: TENANT_B, role: 'admin' }, { 'x-corestack-tenant-id': TENANT_B, 'x-corestack-roles': 'admin' });
    assert.equal(forged.status, 403);
    assertContract('error', forged.json);
    assert.equal(forged.json.error.code, 'COLLECTION_NOT_AUTHORIZED');
    const b = await ask({ useCase: 'nutrition.plan-explanation', collection: 'tenant-notes', query: 'refund rule' }, { 'x-ads-subject-token': await user(TENANT_B) });
    assert.equal(b.json.citations[0].resourceId, 'ridtenantbonly00000000000000000b');
  });
  it('role, context allow-list, consent, query and uncited refusals', async () => {
    assert.equal((await ask({ useCase: 'nutrition.plan-explanation', collection: 'guidance', query: 'beans' }, { 'x-ads-subject-token': await user(TENANT_A, ['visitor']) })).json.error.code, 'USE_CASE_FORBIDDEN');
    assert.equal((await ask({ useCase: 'nutrition.plan-explanation', collection: 'guidance', query: 'beans', context: { email: 'a@b.c' } })).json.error.code, 'CONTEXT_FIELD_NOT_ALLOWED');
    assert.equal((await ask({ useCase: 'nutrition.private-coach', collection: 'guidance', query: 'beans' })).json.error.code, 'CONSENT_REQUIRED');
    assert.equal((await ask({ useCase: 'nutrition.plan-explanation', collection: 'guidance', query: 'b' })).json.error.code, 'QUERY_INVALID');
    const uncited = await ask({ useCase: 'nutrition.plan-explanation', collection: 'guidance', query: 'beans [mock:uncited]' });
    assert.equal(uncited.json.status, 'INSUFFICIENT_EVIDENCE');
    assert.equal(uncited.json.answer, null);
  });
  it('scripted 429 with Retry-After, 503 and 504', async () => {
    await req('POST', '/_control/scripts', { provider: 'ai', outcome: 'rate_limited', retryAfter: 4 });
    const r = await ask({ useCase: 'nutrition.plan-explanation', collection: 'guidance', query: 'beans' });
    assert.equal(r.status, 429);
    assert.equal(r.headers.get('retry-after'), '4');
    await req('POST', '/_control/scripts', { provider: 'ai', outcome: 'timeout' });
    assert.equal((await ask({ useCase: 'nutrition.plan-explanation', collection: 'guidance', query: 'beans' })).status, 504);
    await req('POST', '/_control/scripts', { provider: 'ai', outcome: 'not_configured' });
    assert.equal((await ask({ useCase: 'nutrition.plan-explanation', collection: 'guidance', query: 'beans' })).json.error.code, 'NOT_CONFIGURED');
  });
  it('streaming emits the §6.5 normalised events', async () => {
    const r = await ask({ useCase: 'nutrition.plan-explanation', collection: 'guidance', query: 'refunds', stream: true });
    const events = r.text.trim().split('\n').map(l => JSON.parse(l));
    events.forEach(e => assertContract('stream-event', e));
    assert.equal(events[0].type, 'citations');
    assert.deepEqual(events.at(-2), { type: 'status', status: 'GROUNDED' });
    assert.equal(events.at(-1).type, 'done');
  });
  it('find, graph, collections and resources follow the contract', async () => {
    const svcUser = { ...svc, 'x-ads-subject-token': await user() };
    const f = await req('POST', '/ai/v1/find', { useCase: 'nutrition.plan-explanation', collection: 'guidance', query: 'refund', labels: ['topic/policy'] }, svcUser);
    assertContract('find-response', f.json);
    assert.deepEqual([...new Set(f.json.results.map(x => x.resourceId))], ['rid0refunds000000000000000000001']);
    const g = await req('POST', '/ai/v1/graph', { useCase: 'nutrition.plan-explanation', collection: 'guidance', entity: { value: 'Maize', group: 'CROP' } }, svcUser);
    assertContract('graph-response', g.json);
    assert.equal(g.json.paths[0].relation, 'REQUIRES');
    const c = await req('GET', '/ai/v1/collections?useCase=nutrition.plan-explanation', undefined, svcUser);
    assertContract('collections-response', c.json);
    assert.deepEqual(c.json.collections.map(x => x.collection), ['guidance']);
    const res = await req('GET', '/ai/v1/resources/rid0cash0000000000000000000000002?useCase=nutrition.plan-explanation&collection=guidance', undefined, svcUser);
    assertContract('resource-response', res.json);
  });
  it('ingestion jobs: approval required, PROCESSING -> INDEXED via control, WITHDRAWN', async () => {
    const key = crypto.randomUUID();
    const body = { useCase: 'nutrition.plan-explanation', collection: 'guidance', sourceId: 'guide-1', sourceVersion: 'v1', title: 'Guide', contentType: 'text/markdown', content: '# Guide' };
    assert.equal((await req('POST', '/ai/v1/ingest', body, { ...svc, 'idempotency-key': key })).json.error.code, 'CONTENT_NOT_APPROVED');
    const ok = await req('POST', '/ai/v1/ingest', { ...body, approvedBy: 'steward-1', approvedAt: new Date().toISOString() }, { ...svc, 'idempotency-key': key });
    assert.equal(ok.status, 202);
    assertContract('ingest-accepted', ok.json);
    await req('POST', `/_control/ai/jobs/${ok.json.jobId}/index`);
    const st = await req('GET', `/ai/v1/ingest/${ok.json.jobId}`, undefined, svc);
    assertContract('ingest-status', st.json);
    assert.equal(st.json.state, 'INDEXED');
    const w = await req('POST', '/ai/v1/withdraw', { useCase: 'nutrition.plan-explanation', collection: 'guidance', sourceId: 'guide-1' }, { ...svc, 'idempotency-key': crypto.randomUUID() });
    assert.equal(w.json.state, 'WITHDRAWN');
  });
});

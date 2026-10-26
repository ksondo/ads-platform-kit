import crypto from 'node:crypto';
import { createJwksResolver, verifyJwt } from './jwt.mjs';

// ADS AI Gateway facade, mock (standard §13.2, gaps G11-G13). Mounted under /ai/v1 so a product
// sets ADS_AI_GATEWAY_URL={ADS_MOCKS_URL} and calls {base}/ai/v1/... in tests. It implements the
// gateway contract v1 (standard §5): service + subject token checks against a JWKS (E2E-kit
// identity), a mock use-case registry, collection-per-tenant routing, context allow-list, consent,
// every §5.8 error, the §6.5 normalised streaming events, ingestion job states, and
// testMode: true / provider.mode: "mock" in every response. It answers from the SAME seeded
// corpus as the Progress-shaped mock (/progress/api/v1), by calling those handlers in-process.
//
// The real gateway lives in ksondo/RAG-Intelligence-AI-Platform (gateway/). Both are asserted
// against the shared schemas in packages/ai-gateway-client/contracts/ai-gateway-v1.

export const AI_PREFIX = '/ai/v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ERRORS = {
  QUERY_INVALID: [400, false], REQUEST_INVALID: [400, false], UNAUTHENTICATED: [401, false], USE_CASE_FORBIDDEN: [403, false],
  COLLECTION_NOT_AUTHORIZED: [403, false], CONSENT_REQUIRED: [403, false], RESOURCE_NOT_FOUND: [404, false], CONTEXT_FIELD_NOT_ALLOWED: [422, false],
  CONTENT_NOT_APPROVED: [422, false], SCHEMA_OUTPUT_INVALID: [422, false], RATE_LIMITED: [429, true], PROVIDER_RESPONSE_INVALID: [502, true],
  PROVIDER_UNAVAILABLE: [503, true], NOT_CONFIGURED: [503, false], PROVIDER_TIMEOUT: [504, true],
};
const FACADE_OUTCOMES = { unavailable: 'PROVIDER_UNAVAILABLE', not_configured: 'NOT_CONFIGURED', timeout: 'PROVIDER_TIMEOUT', rate_limited: 'RATE_LIMITED', provider_invalid: 'PROVIDER_RESPONSE_INVALID' };

export class FacadeError extends Error {
  constructor(code, retryAfter) { super(code); this.code = code; this.status = ERRORS[code][0]; this.retryable = ERRORS[code][1]; this.retryAfter = retryAfter; }
}
const fail = (code, retryAfter) => { throw new FacadeError(code, retryAfter); };

export function createAiState() {
  return { config: null, useCases: new Map(), routes: [], jobs: new Map() };
}

export function configureFacade(state, body) {
  if (typeof body.issuer !== 'string' || !body.issuer) throw new FacadeError('REQUEST_INVALID');
  if (!body.jwks && !body.jwksUrl) throw new FacadeError('REQUEST_INVALID');
  const clients = body.clients && typeof body.clients === 'object' ? body.clients : {};
  state.config = {
    issuer: body.issuer.replace(/\/$/, ''), gatewayAudience: body.gatewayAudience ?? 'ads-ai-gateway', clients,
    keyFor: createJwksResolver({ jwks: body.jwks, jwksUrl: body.jwksUrl }),
  };
  return { configured: true, clients: Object.keys(clients) };
}

export function loadUseCases(state, body) {
  if (!Array.isArray(body.useCases)) throw new FacadeError('REQUEST_INVALID');
  state.useCases.clear();
  for (const u of body.useCases) {
    if (!u || typeof u.useCase !== 'string' || typeof u.clientId !== 'string' || !Array.isArray(u.allowedRoles) || !u.collections) throw new FacadeError('REQUEST_INVALID');
    if (u.safetyExcluded !== true) throw new FacadeError('REQUEST_INVALID');
    state.useCases.set(u.useCase, {
      operations: ['ask'], contextAllowlist: [], personalData: false, streaming: false, languages: ['en', 'fr'], labels: [], contentTypes: [], answerSchemas: {},
      promptProfiles: { default: 'default' }, ...u, grounding: { minCitations: 1, citationPolicy: 'kb', composite: false, ...(u.grounding ?? {}) },
      limits: { maxQueryChars: 1000, ...(u.limits ?? {}) },
    });
  }
  return { useCases: state.useCases.size };
}

export function loadRoutes(state, body) {
  if (!Array.isArray(body.routes)) throw new FacadeError('REQUEST_INVALID');
  state.routes = body.routes.map(r => ({ clientId: r.clientId, scope: r.scope, tenantId: r.tenantId ? String(r.tenantId).toLowerCase() : null, collection: r.collection, kbId: r.kbId, kbAlias: r.kbAlias ?? r.collection }));
  return { routes: state.routes.length };
}

const clean = t => String(t ?? '').replace(/^#+\s*/, '').trim();
const safeUri = u => (typeof u === 'string' && /^(https:|mock:)/.test(u) && !/\/\/[^/]*@/.test(u) ? u : null);

function citationsFrom(resources, bestMatches) {
  const seen = new Set();
  const out = [];
  for (const ref of bestMatches ?? []) {
    const rid = String(ref).split('/')[0];
    if (seen.has(rid) || !resources?.[rid]) continue;
    seen.add(rid);
    const r = resources[rid];
    const p = r.fields?.['/t/body']?.paragraphs?.[ref];
    out.push({ ref: String(out.length + 1), resourceId: rid, paragraphRef: String(ref), title: clean(r.title) || rid.slice(0, 8), sourceUri: safeUri(r.origin?.url), score: typeof p?.score === 'number' ? p.score : null, sourceVersion: null });
  }
  return out;
}

export function facadeRoutes({ state, progressState, invokeProgress, takeScript }) {
  const header = (h, n) => (Array.isArray(h[n]) ? h[n][0] : h[n]);

  async function authenticate(headers, requireUser) {
    const cfg = state.config;
    if (!cfg) fail('NOT_CONFIGURED');
    const auth = header(headers, 'authorization');
    if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) fail('UNAUTHENTICATED');
    const presented = auth.slice(7);
    let clientId = null;
    if (presented.split('.').length === 3) {
      try { const p = await verifyJwt(presented, { keyFor: cfg.keyFor, issuer: cfg.issuer, audience: cfg.gatewayAudience }); clientId = p.client_id ?? p.azp ?? null; } catch { fail('UNAUTHENTICATED'); }
    } else {
      const d = crypto.createHash('sha256').update(presented).digest();
      for (const [id, secret] of Object.entries(cfg.clients)) if (crypto.timingSafeEqual(crypto.createHash('sha256').update(String(secret)).digest(), d)) clientId = id;
    }
    if (!clientId || ![...state.useCases.values()].some(u => u.clientId === clientId)) fail('UNAUTHENTICATED');
    const subject = header(headers, 'x-ads-subject-token');
    if (!subject) { if (requireUser) fail('UNAUTHENTICATED'); return { clientId, user: null }; }
    let p;
    try { p = await verifyJwt(subject, { keyFor: cfg.keyFor, issuer: cfg.issuer, audience: clientId }); } catch { fail('UNAUTHENTICATED'); }
    if (typeof p.tenant_id !== 'string' || !UUID.test(p.tenant_id) || !Array.isArray(p.roles) || (p.client_id !== undefined && p.client_id !== clientId)) fail('UNAUTHENTICATED');
    // x-corestack-* headers and body tenantId/role are never read.
    return { clientId, user: { sub: p.sub, tenantId: p.tenant_id.toLowerCase(), roles: p.roles } };
  }

  function useCase(ctx, id, op) {
    const uc = state.useCases.get(id);
    if (typeof id !== 'string') fail('REQUEST_INVALID');
    if (!uc || uc.clientId !== ctx.clientId || !uc.operations.includes(op)) fail('USE_CASE_FORBIDDEN');
    if (ctx.user && !ctx.user.roles.some(r => uc.allowedRoles.includes(r))) fail('USE_CASE_FORBIDDEN');
    if (uc.status === 'proposed') fail('NOT_CONFIGURED');
    return uc;
  }

  function route(ctx, uc, collection) {
    if (typeof collection !== 'string' || !collection) fail('REQUEST_INVALID');
    const spec = uc.collections[collection];
    if (!spec) fail('COLLECTION_NOT_AUTHORIZED');
    if (spec.scope === 'tenant' && !ctx.user) fail('COLLECTION_NOT_AUTHORIZED');
    const r = state.routes.find(x => x.clientId === uc.clientId && x.collection === collection && x.scope === spec.scope && (spec.scope === 'shared' || x.tenantId === ctx.user.tenantId));
    if (!r) fail(spec.scope === 'tenant' ? 'COLLECTION_NOT_AUTHORIZED' : 'NOT_CONFIGURED');
    const kb = progressState.kbs.get(r.kbId);
    if (!kb) fail('NOT_CONFIGURED');
    return { ...r, token: kb.token };
  }

  function facadeScript(uc, op) {
    const s = takeScript('ai', { useCase: uc.useCase, op });
    if (!s) return;
    const code = FACADE_OUTCOMES[s.outcome];
    if (code) fail(code, code === 'RATE_LIMITED' ? Number(s.options.retryAfter ?? 1) : undefined);
  }

  function query(raw, max) {
    if (typeof raw !== 'string') fail('QUERY_INVALID');
    const q = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (q.length < 3 || q.length > max) fail('QUERY_INVALID');
    return q;
  }

  function context(raw, allow) {
    if (raw === undefined || raw === null) return {};
    if (typeof raw !== 'object' || Array.isArray(raw)) fail('REQUEST_INVALID');
    for (const [k, v] of Object.entries(raw)) {
      if (!allow.includes(k)) fail('CONTEXT_FIELD_NOT_ALLOWED');
      if (!(['string', 'number', 'boolean'].includes(typeof v) || (Array.isArray(v) && v.length <= 20 && v.every(x => typeof x === 'string')))) fail('REQUEST_INVALID');
    }
    if (JSON.stringify(raw).length > 2000) fail('REQUEST_INVALID');
    return raw;
  }

  const upstream = async (r, method, path, body, sync) => {
    const out = await invokeProgress(method, `/kb/${r.kbId}${path}`, body, { 'x-nuclia-serviceaccount': `Bearer ${r.token}`, ...(sync ? { 'x-synchronous': 'true' } : {}) });
    if (out.error) {
      if (out.status === 429) fail('RATE_LIMITED', Number(out.headers?.['retry-after'] ?? 1));
      if (out.status === 404 && path.startsWith('/resource/')) fail('RESOURCE_NOT_FOUND');
      if (out.status >= 500) fail('PROVIDER_UNAVAILABLE');
      fail('NOT_CONFIGURED');
    }
    return out;
  };
  const provider = collection => ({ name: 'progress-agentic-rag', mode: 'mock', collection });
  const timing = started => ({ totalMs: Date.now() - started, upstreamMs: 0, retries: 0, coalesced: false });

  const routes = [
    ['GET', /^\/health$/, async () => ({ json: { status: 'ok', service: 'ads-ai-gateway-mock-facade', contract: 'ai-gateway-v1', progress: 'mock', liveIntegration: 'EXTERNAL INTEGRATION PENDING' } })],

    ['POST', /^\/ask$/, async ({ body, headers, ctxBase }) => {
      const ctx = await authenticate(headers, true);
      const uc = useCase(ctx, body.useCase, 'ask');
      const q = query(body.query, uc.limits.maxQueryChars);
      const language = body.language ?? 'en';
      if (!uc.languages.includes(language)) fail('REQUEST_INVALID');
      context(body.context, uc.contextAllowlist);
      if (uc.personalData && (typeof body.consentRef !== 'string' || body.consentRef.length < 3)) fail('CONSENT_REQUIRED');
      const schemaKeys = Object.keys(uc.answerSchemas);
      let schema = null;
      if (body.answerSchemaId !== undefined && body.answerSchemaId !== null) { schema = uc.answerSchemas[body.answerSchemaId]; if (!schema) fail('REQUEST_INVALID'); }
      else if (schemaKeys.length) fail('REQUEST_INVALID');
      const stream = body.stream === true;
      if (stream && (!uc.streaming || schema)) fail('REQUEST_INVALID');
      const r = route(ctx, uc, body.collection);
      facadeScript(uc, 'ask');
      const pq = (language === 'fr' ? 'Respond in French: ' : '') + q;
      const out = await upstream(r, 'POST', '/ask', { query: pq, prefer_markdown: true, rephrase: true, max_tokens: 400, citations: true, ...(schema ? { answer_json_schema: schema } : {}) }, !stream);
      if (stream) {
        // Normalised §6.5 events. Answer text is held back until citations resolve (as the real gateway does).
        const events = [];
        let citations = [], status = null, text = '', bad = false;
        for (const line of out.ndjson) {
          let item;
          try { item = JSON.parse(line).item; } catch { bad = true; break; }
          if (item?.type === 'answer') text += item.text;
          else if (item?.type === 'retrieval') citations = citationsFrom(item.results?.resources, item.results?.best_matches);
          else if (item?.type === 'status') status = String(item.code);
        }
        const grounded = !bad && status === '0' && citations.length >= uc.grounding.minCitations && text;
        if (bad || status === null) events.push({ type: 'error', code: 'PROVIDER_RESPONSE_INVALID', retryable: true });
        else if (grounded) {
          events.push({ type: 'citations', citations: citations.map(({ ref, resourceId, title, sourceUri, score }) => ({ ref, resourceId, title, sourceUri, score })) });
          const size = Math.max(8, Math.ceil(text.length / 3));
          for (let i = 0; i < text.length; i += size) events.push({ type: 'answer-chunk', text: text.slice(i, i + size) });
          events.push({ type: 'status', status: 'GROUNDED' });
        } else events.push({ type: 'status', status: 'INSUFFICIENT_EVIDENCE' });
        events.push({ type: 'done', runId: ctxBase.runId });
        return { events };
      }
      const data = out.json;
      const citations = citationsFrom(data.retrieval_results?.resources, data.retrieval_best_matches ?? data.retrieval_results?.best_matches);
      let answer = null, answerJson = null;
      const grounded = citations.length >= uc.grounding.minCitations;
      if (grounded && schema) {
        let v = data.answer_json ?? data.item?.object;
        if (!v && typeof data.answer === 'string') { const m = data.answer.match(/\{[\s\S]*\}/); if (m) { try { v = JSON.parse(m[0]); } catch { v = null; } } }
        if (!v || typeof v !== 'object') fail('SCHEMA_OUTPUT_INVALID');
        const known = new Set(Object.keys(data.retrieval_results?.resources ?? {}));
        const walk = n => { if (Array.isArray(n)) return n.map(walk); if (!n || typeof n !== 'object') return n; const o = {}; let flag = false; for (const [k, x] of Object.entries(n)) { if (k === 'citation_resource_id') { if (typeof x === 'string' && known.has(x)) o[k] = x; else { o[k] = null; flag = true; } } else o[k] = walk(x); } if (flag) o.unverified = true; return o; };
        answerJson = walk(v);
      } else if (grounded && typeof data.answer === 'string' && data.answer.trim()) answer = data.answer;
      const ok = grounded && (answer !== null || answerJson !== null);
      const shown = ok ? citations : [];
      return { json: {
        requestId: ctxBase.requestId, runId: ctxBase.runId, useCase: uc.useCase, status: ok ? 'GROUNDED' : 'INSUFFICIENT_EVIDENCE', answer: ok ? answer : null, answerJson: ok ? answerJson : null,
        citations: shown, evidence: { citationCount: shown.length, topScore: shown.length ? Math.max(...shown.map(c => c.score ?? 0)) : null, policy: uc.grounding.citationPolicy, compositeRetry: false },
        testMode: true, provider: provider(r.collection), timing: timing(ctxBase.started),
      } };
    }],

    ['POST', /^\/find$/, async ({ body, headers, ctxBase }) => {
      const ctx = await authenticate(headers, true);
      const uc = useCase(ctx, body.useCase, 'find');
      const q = query(body.query, uc.limits.maxQueryChars);
      for (const l of body.labels ?? []) if (!uc.labels.includes(l)) fail('REQUEST_INVALID');
      const r = route(ctx, uc, body.collection);
      facadeScript(uc, 'find');
      const filters = (body.labels ?? []).map(l => `/classification.labels/${l}`);
      const out = await upstream(r, 'POST', '/find', { query: q, page_size: body.pageSize ?? 5, features: ['keyword', 'semantic'], show: ['basic', 'values', 'origin'], ...(filters.length ? { filters } : {}) }, false);
      const results = [];
      for (const ref of out.json.best_matches ?? []) {
        const rid = ref.split('/')[0]; const res = out.json.resources?.[rid]; const p = res?.fields?.['/t/body']?.paragraphs?.[ref];
        if (!p) continue;
        results.push({ rank: results.length + 1, resourceId: rid, paragraphRef: ref, title: clean(res.title), text: String(p.text).slice(0, 1000), score: p.score ?? null, sourceUri: safeUri(res.origin?.url) });
      }
      return { json: { requestId: ctxBase.requestId, runId: ctxBase.runId, useCase: uc.useCase, status: results.length ? 'GROUNDED' : 'INSUFFICIENT_EVIDENCE', results, nextPage: null, testMode: true, provider: provider(r.collection), timing: timing(ctxBase.started) } };
    }],

    ['POST', /^\/graph$/, async ({ body, headers, ctxBase }) => {
      const ctx = await authenticate(headers, true);
      const uc = useCase(ctx, body.useCase, 'graph');
      const r = route(ctx, uc, body.collection);
      facadeScript(uc, 'graph');
      const path = { prop: 'path', ...(body.entity ? { source: body.entity, undirected: body.undirected !== false } : {}) };
      const out = await upstream(r, 'POST', '/graph', { query: { and: [path, { prop: 'generated', by: 'data-augmentation' }] }, top_k: body.topK ?? 50 }, false);
      const paths = (out.json.paths ?? []).map(p => ({ source: { value: p.source.value, group: p.source.group }, relation: p.relation?.label ?? String(p.relation), destination: { value: p.destination.value, group: p.destination.group }, resourceIds: p.metadata?.resource_id ? [p.metadata.resource_id] : [] }));
      return { json: { requestId: ctxBase.requestId, runId: ctxBase.runId, useCase: uc.useCase, status: paths.length ? 'GROUNDED' : 'INSUFFICIENT_EVIDENCE', paths, testMode: true, provider: provider(r.collection), timing: timing(ctxBase.started) } };
    }],

    ['GET', /^\/resources\/([A-Za-z0-9_-]+)$/, async ({ params, query: qs, headers, ctxBase }) => {
      const ctx = await authenticate(headers, true);
      const uc = useCase(ctx, qs.useCase, 'resource');
      const names = Object.keys(uc.collections);
      const r = route(ctx, uc, qs.collection ?? (names.length === 1 ? names[0] : undefined));
      const out = await upstream(r, 'GET', `/resource/${params[0]}`, undefined, false);
      const d = out.json;
      return { json: { requestId: ctxBase.requestId, resourceId: params[0], title: clean(d.title), summary: d.summary ?? null, sourceUri: safeUri(d.origin?.url), labels: (d.usermetadata?.classifications ?? []).map(c => `${c.labelset}/${c.label}`), fields: {}, testMode: true, provider: provider(r.collection) } };
    }],

    ['GET', /^\/collections$/, async ({ query: qs, headers, ctxBase }) => {
      const ctx = await authenticate(headers, true);
      const uc = useCase(ctx, qs.useCase, 'collections');
      const collections = [];
      for (const name of Object.keys(uc.collections)) {
        let r; try { r = route(ctx, uc, name); } catch { continue; }
        const out = await upstream(r, 'GET', '/labelsets', undefined, false);
        const available = new Set(Object.entries(out.json.labelsets ?? {}).flatMap(([s, v]) => (v.labels ?? []).map(l => `${s}/${l.title}`)));
        collections.push({ collection: name, labels: uc.labels.filter(l => available.has(l)), contentTypes: uc.contentTypes });
      }
      return { json: { requestId: ctxBase.requestId, collections, testMode: true } };
    }],

    ['POST', /^\/ingest$/, async ({ body, headers, ctxBase }) => {
      const key = header(headers, 'idempotency-key');
      if (!key || !UUID.test(key)) fail('REQUEST_INVALID');
      const ctx = await authenticate(headers, false);
      const uc = useCase(ctx, body.useCase, 'ingest');
      for (const f of ['sourceId', 'sourceVersion', 'title']) if (typeof body[f] !== 'string' || !body[f]) fail('REQUEST_INVALID');
      if (!['text/markdown', 'text/plain', 'application/pdf'].includes(body.contentType) || (typeof body.content !== 'string') === (typeof body.fileRef !== 'string')) fail('REQUEST_INVALID');
      if (typeof body.approvedBy !== 'string' || !body.approvedBy || !Number.isFinite(Date.parse(body.approvedAt))) fail('CONTENT_NOT_APPROVED');
      const r = route(ctx, uc, body.collection);
      const existing = [...state.jobs.values()].find(j => j.clientId === ctx.clientId && j.key === key);
      const job = existing ?? { jobId: crypto.randomUUID(), clientId: ctx.clientId, tenantId: ctx.user?.tenantId ?? null, useCase: uc.useCase, collection: r.collection, sourceId: body.sourceId, sourceVersion: body.sourceVersion, key, state: 'PROCESSING', reason: null, updatedAt: new Date().toISOString() };
      state.jobs.set(job.jobId, job);
      return { status: 202, json: { requestId: ctxBase.requestId, jobId: job.jobId, state: job.state, testMode: true } };
    }],

    ['GET', /^\/ingest\/([0-9a-f-]{36})$/, async ({ params, headers, ctxBase }) => {
      const ctx = await authenticate(headers, false);
      const job = state.jobs.get(params[0]);
      if (!job || job.clientId !== ctx.clientId || (job.tenantId && job.tenantId !== ctx.user?.tenantId)) fail('RESOURCE_NOT_FOUND');
      return { json: { requestId: ctxBase.requestId, jobId: job.jobId, state: job.state, reason: job.reason, sourceId: job.sourceId, sourceVersion: job.sourceVersion, updatedAt: job.updatedAt } };
    }],

    ['POST', /^\/withdraw$/, async ({ body, headers, ctxBase }) => {
      const key = header(headers, 'idempotency-key');
      if (!key || !UUID.test(key)) fail('REQUEST_INVALID');
      const ctx = await authenticate(headers, false);
      const uc = useCase(ctx, body.useCase, 'ingest');
      const jobs = [...state.jobs.values()].filter(j => j.clientId === ctx.clientId && j.useCase === uc.useCase && j.collection === body.collection && j.sourceId === body.sourceId && j.tenantId === (ctx.user?.tenantId ?? null));
      if (!jobs.length) fail('RESOURCE_NOT_FOUND');
      for (const j of jobs) { j.state = 'WITHDRAWN'; j.updatedAt = new Date().toISOString(); }
      return { status: 202, json: { requestId: ctxBase.requestId, jobId: jobs[jobs.length - 1].jobId, state: 'WITHDRAWN' } };
    }],
  ];
  return routes;
}

export function facadeControlRoutes(state) {
  return [
    ['PUT', /^\/_control\/ai\/config$/, ({ body }) => ({ status: 200, body: configureFacade(state, body) })],
    ['PUT', /^\/_control\/ai\/use-cases$/, ({ body }) => ({ status: 200, body: loadUseCases(state, body) })],
    ['PUT', /^\/_control\/ai\/routes$/, ({ body }) => ({ status: 200, body: loadRoutes(state, body) })],
    ['GET', /^\/_control\/ai\/jobs$/, () => ({ status: 200, body: { items: [...state.jobs.values()].map(({ key, ...j }) => j) } })],
    ['POST', /^\/_control\/ai\/jobs\/([0-9a-f-]{36})\/(index|fail)$/, ({ params, body }) => {
      const job = state.jobs.get(params[0]);
      if (!job) return { status: 404, body: { error: { code: 'NOT_FOUND' } } };
      if (job.state === 'PROCESSING') { job.state = params[1] === 'index' ? 'INDEXED' : 'FAILED'; job.reason = params[1] === 'fail' ? String(body.reason ?? 'MOCK_FAILURE') : null; job.updatedAt = new Date().toISOString(); }
      return { status: 200, body: { jobId: job.jobId, state: job.state } };
    }],
  ];
}

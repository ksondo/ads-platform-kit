import http from 'node:http';
import { NOTICE, createEngine } from './engine.mjs';
import { MockError, providerRoutes } from './providers.mjs';

const BODY_LIMIT = 256 * 1024;
export const DEFAULT_WEBHOOK_SECRET = 'ads-mocks-test-only-webhook-secret';

// One small HTTP service hosting every mock provider plus /_control endpoints that tests use
// to script outcomes and inspect what the product sent. See services/mocks/README.md.
export function createMocks({ webhookSecret = DEFAULT_WEBHOOK_SECRET, log = console, defaultDelayMs } = {}) {
  const engine = createEngine({ webhookSecret, log, defaultDelayMs });
  const routes = [...providerRoutes(), ...controlRoutes(engine)];

  const readBody = req => new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > BODY_LIMIT) { reject(new MockError(413, 'BODY_TOO_LARGE')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new MockError(400, 'INVALID_JSON')); }
    });
    req.on('error', reject);
  });

  const send = (res, status, body) => {
    // Every response says it is a test: no one can mistake a mock for a live provider.
    const payload = body && typeof body === 'object' && !Array.isArray(body) ? { ...body, test_mode: true, notice: NOTICE } : { items: body, test_mode: true, notice: NOTICE };
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-ads-test-mode': 'true' });
    res.end(JSON.stringify(payload));
  };

  async function handler(req, res) {
    const url = new URL(req.url, 'http://mocks');
    try {
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok', service: 'ads-mocks' });
      let params;
      const route = routes.find(([m, p]) => m === req.method && (params = url.pathname.match(p)));
      if (!route) throw new MockError(404, 'NOT_FOUND');
      const body = ['POST', 'PUT'].includes(req.method) ? await readBody(req) : {};
      if (!url.pathname.startsWith('/_control')) {
        engine.state.requests.push({ at: new Date().toISOString(), method: req.method, path: url.pathname, body });
      }
      const result = await route[2]({ body, params: params.slice(1), query: Object.fromEntries(url.searchParams), engine });
      return send(res, result.status, result.body);
    } catch (error) {
      if (error instanceof MockError) return send(res, error.status, { error: { code: error.code, ...(error.details ? { details: error.details } : {}) } });
      log.error?.(`mocks error ${req.method} ${url.pathname}: ${error.stack ?? error.message}`);
      return send(res, 500, { error: { code: 'MOCK_ERROR' } });
    }
  }

  return { engine, handler, server: http.createServer(handler), reset: engine.reset, webhookSecret };
}

function controlRoutes(engine) {
  const PROVIDERS = ['momo', 'bank', 'sms', 'email', 'kyc', 'insurer', 'registry', 'dispatch', 'rag'];
  const op = id => {
    const found = engine.state.operations.get(id);
    if (!found) throw new MockError(404, 'NOT_FOUND');
    return found;
  };
  return [
    ['POST', /^\/_control\/reset$/, () => { engine.reset(); return { status: 200, body: { reset: true } }; }],
    ['POST', /^\/_control\/scripts$/, ({ body }) => {
      if (!PROVIDERS.includes(body.provider)) throw new MockError(400, 'PROVIDER_INVALID', { providers: PROVIDERS });
      if (typeof body.outcome !== 'string' || !body.outcome) throw new MockError(400, 'OUTCOME_REQUIRED');
      if (body.match !== undefined && (typeof body.match !== 'object' || Array.isArray(body.match))) throw new MockError(400, 'MATCH_INVALID');
      const s = engine.addScript({ ...body, times: body.times === undefined ? 1 : Number(body.times) });
      return { status: 201, body: { id: s.id, provider: s.provider, outcome: s.outcome, match: s.match, remaining: s.remaining } };
    }],
    ['GET', /^\/_control\/scripts$/, () => ({ status: 200, body: { items: engine.state.scripts.map(s => ({ id: s.id, provider: s.provider, outcome: s.outcome, match: s.match, remaining: s.remaining })) } })],
    ['GET', /^\/_control\/operations$/, ({ query }) => ({
      status: 200,
      body: { items: [...engine.state.operations.values()].filter(o => (!query.provider || o.provider === query.provider) && (!query.reference || o.reference === query.reference)).map(engine.view) },
    })],
    ['GET', /^\/_control\/operations\/([\w-]+)$/, ({ params }) => ({ status: 200, body: { ...engine.view(op(params[0])), pending_steps: op(params[0]).steps.map(s => s.status) } })],
    ['POST', /^\/_control\/operations\/([\w-]+)\/advance$/, async ({ params, body }) => {
      op(params[0]);
      return { status: 200, body: engine.view(await engine.advance(params[0], body.status ? body : undefined)) };
    }],
    ['POST', /^\/_control\/operations\/([\w-]+)\/complete$/, async ({ params }) => {
      op(params[0]);
      return { status: 200, body: engine.view(await engine.complete(params[0])) };
    }],
    ['GET', /^\/_control\/webhooks$/, ({ query }) => ({
      status: 200,
      body: { items: engine.state.webhooks.filter(w => (!query.operation || w.operationId === query.operation) && (!query.provider || w.provider === query.provider)).map(engine.webhookView) },
    })],
    ['POST', /^\/_control\/webhooks\/([\w-]+)\/replay$/, async ({ params }) => {
      const w = await engine.replay(params[0]);
      if (!w) throw new MockError(404, 'NOT_FOUND');
      return { status: 200, body: engine.webhookView(w) };
    }],
    ['GET', /^\/_control\/messages$/, ({ query }) => ({
      status: 200,
      body: { items: engine.state.messages.filter(m => (!query.channel || m.channel === query.channel) && (!query.to || m.to.toLowerCase() === String(query.to).toLowerCase())) },
    })],
    ['GET', /^\/_control\/requests$/, ({ query }) => ({
      status: 200,
      body: { items: engine.state.requests.filter(r => !query.path || r.path.startsWith(query.path)) },
    })],
    ['PUT', /^\/_control\/registry\/([a-z]+)\/([^/]+)$/, ({ params, body }) => {
      engine.state.registry.set(`${params[0]}:${decodeURIComponent(params[1])}`, { status: 'ACTIVE', ...body });
      return { status: 200, body: { register: params[0], id: decodeURIComponent(params[1]), saved: true } };
    }],
    ['PUT', /^\/_control\/rag\/corpus$/, ({ body }) => {
      if (!Array.isArray(body.documents) || body.documents.some(d => !d || typeof d.id !== 'string' || typeof d.text !== 'string')) throw new MockError(400, 'DOCUMENTS_INVALID');
      engine.state.corpus.set(String(body.knowledgeBox ?? 'default'), body.documents.map(d => ({ id: d.id, title: d.title ?? d.id, uri: d.uri ?? null, text: d.text })));
      return { status: 200, body: { knowledge_box: String(body.knowledgeBox ?? 'default'), documents: body.documents.length } };
    }],
  ];
}

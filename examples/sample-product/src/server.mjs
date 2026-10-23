// ADS sample product: the smallest real product that uses the shared sign-in and PostgreSQL RLS.
//   Browser: public/index.html + ads-identity.js (window.adsIdentity) + public/app.js
//   API:     verifies ADS tokens (issuer, audience, JWKS, RS256) and runs each request as the
//            restricted role sample_app with app.tenant_id = the token's tenant_id.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import pg from 'pg';
import { verifyWebhookSignature } from './webhook-signature.mjs';
import { createMomoAdapter } from './payments-adapter.mjs';
import { createDemoSandboxEndpoint } from './demo-sandboxes.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
for (const name of ['DATABASE_URL', 'OIDC_ISSUER', 'OIDC_AUDIENCE', 'OIDC_JWKS_URL']) if (!env[name]) { console.error(`${name} required`); process.exit(2); }
const PORT = Number(env.PORT ?? 4100);
const HOST = env.HOST ?? '127.0.0.1';
const PUBLIC_URL = (env.PUBLIC_URL ?? `http://localhost:${PORT}`).replace(/\/$/, '');
const CALLBACK_BASE_URL = (env.CALLBACK_BASE_URL ?? `http://127.0.0.1:${PORT}`).replace(/\/$/, '');
const BROWSER_ISSUER = (env.ADS_IDENTITY_URL ?? env.OIDC_ISSUER).replace(/\/$/, '');
const PAYMENT_TIMEOUT_SECONDS = Number(env.PAYMENT_TIMEOUT_SECONDS ?? 120);
const momo = createMomoAdapter({ mode: env.PAYMENTS_MODE ?? 'mock', mocksUrl: env.ADS_MOCKS_URL });
const webhookSecret = env.ADS_MOCKS_WEBHOOK_SECRET ?? '';

const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });
const jwks = createRemoteJWKSet(new URL(env.OIDC_JWKS_URL));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class ApiError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }

// Same checks as the ADS product repos' verifiedClaims(): the token decides who and which tenant.
async function authenticate(req) {
  const match = /^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/.exec(String(req.headers.authorization ?? ''));
  if (!match) throw new ApiError(401, 'TOKEN_REQUIRED');
  let payload;
  try {
    ({ payload } = await jwtVerify(match[1], jwks, { issuer: env.OIDC_ISSUER, audience: env.OIDC_AUDIENCE, algorithms: ['RS256'] }));
  } catch {
    throw new ApiError(401, 'TOKEN_INVALID');
  }
  if (typeof payload.sub !== 'string' || !payload.sub || !UUID.test(String(payload.tenant_id)) || !Array.isArray(payload.roles)) throw new ApiError(401, 'TOKEN_CLAIMS_INVALID');
  return { actorId: payload.sub, tenantId: payload.tenant_id, roles: payload.roles };
}
const requireRole = (actor, ...roles) => { if (!roles.some(r => actor.roles.includes(r))) throw new ApiError(403, 'ROLE_REQUIRED'); };

async function asTenant(tenantId, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE sample_app');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

const demoSandboxes = createDemoSandboxEndpoint({ env, pool, asTenant: (tenantId, fn) => asTenant(tenantId, fn) });

const readRaw = req => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  req.on('data', c => { size += c.length; if (size > 64 * 1024) { reject(new ApiError(413, 'BODY_TOO_LARGE')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  req.on('error', reject);
});
const readJson = async req => { const raw = await readRaw(req); try { return raw ? JSON.parse(raw) : {}; } catch { throw new ApiError(400, 'INVALID_JSON'); } };
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };

const noteView = r => ({ id: r.id, body: r.body, authorId: r.author_id, createdAt: r.created_at });
const paymentView = r => ({ id: r.id, operator: r.operator, msisdn: r.msisdn, amount: r.amount, currency: r.currency, status: r.status, failureReason: r.failure_reason, testMode: r.test_mode, createdAt: r.created_at });

const STATIC = {
  '/app.js': ['public/app.js', 'application/javascript'],
  '/app.css': ['public/app.css', 'text/css'],
  // A real product copies ads-identity.js into its public folder; the example serves the kit's copy.
  '/ads-identity.js': ['../../packages/identity-client/ads-identity.js', 'application/javascript'],
  // Demo "Switch role" control (shows nothing outside a personal demo sandbox).
  '/ads-demo-switch.js': ['../../packages/identity-client/ads-demo-switch.js', 'application/javascript'],
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function route(req, res) {
  const url = new URL(req.url, PUBLIC_URL);
  const p = url.pathname;
  const m = req.method;
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');

  if (m === 'GET' && p === '/health') { await pool.query('SELECT 1'); return json(res, 200, { status: 'ok' }); }
  if (m === 'GET' && p === '/') {
    const html = (await readFile(path.join(here, '../public/index.html'), 'utf8'))
      .replaceAll('{{ISSUER}}', esc(BROWSER_ISSUER)).replaceAll('{{CLIENT_ID}}', esc(env.OIDC_AUDIENCE))
      .replaceAll('{{REDIRECT_URI}}', esc(`${PUBLIC_URL}/`)).replaceAll('{{TEST_MODE}}', momo.testMode ? 'true' : 'false');
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
      'content-security-policy': `default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' ${BROWSER_ISSUER}; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
    });
    return res.end(html);
  }
  if (m === 'GET' && STATIC[p]) {
    const [file, type] = STATIC[p];
    res.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' });
    return res.end(await readFile(path.resolve(here, '..', file)));
  }

  // ----- provider webhook (no user token: authenticated by the provider's signature) -----
  if (m === 'POST' && p === '/webhooks/momo') {
    const raw = await readRaw(req);
    if (!verifyWebhookSignature(raw, req.headers['ads-mock-signature'], webhookSecret)) return json(res, 401, { error: { code: 'SIGNATURE_INVALID' } });
    const event = JSON.parse(raw);
    const paymentId = event?.data?.reference;
    if (typeof event.event_id !== 'string' || !UUID.test(String(paymentId))) return json(res, 400, { error: { code: 'EVENT_INVALID' } });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE sample_app');
      const result = (await client.query('SELECT sample.apply_payment_event($1,$2,$3,$4) AS r', [event.event_id, paymentId, String(event.data.status), event.data.reason ?? null])).rows[0].r;
      await client.query('COMMIT');
      return json(res, 200, { result });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error.code === '23503') return json(res, 404, { error: { code: 'PAYMENT_NOT_FOUND' } });
      throw error;
    } finally {
      client.release();
    }
  }

  // ----- demo sandbox provisioning (kit -> product, signed; demo environment only) -----
  if (p.startsWith('/internal/demo/sandboxes')) {
    const rawBody = m === 'POST' ? await readRaw(req) : '';
    const result = await demoSandboxes({ method: m, path: p, rawBody, signature: req.headers['ads-demo-signature'] });
    return json(res, result.status, result.body);
  }

  if (!p.startsWith('/api/')) throw new ApiError(404, 'NOT_FOUND');
  const actor = await authenticate(req);

  if (m === 'GET' && p === '/api/me') return json(res, 200, actor);

  if (m === 'GET' && p === '/api/notes') {
    requireRole(actor, 'notes_reader', 'notes_writer');
    const rows = await asTenant(actor.tenantId, c => c.query('SELECT * FROM sample.notes ORDER BY created_at DESC, id LIMIT 100'));
    return json(res, 200, { items: rows.rows.map(noteView) });
  }
  if (m === 'POST' && p === '/api/notes') {
    requireRole(actor, 'notes_writer');
    const { body } = await readJson(req);
    const text = String(body ?? '').trim();
    if (!text || text.length > 500) throw new ApiError(400, 'NOTE_INVALID');
    const row = await asTenant(actor.tenantId, c => c.query('INSERT INTO sample.notes(tenant_id,author_id,body) VALUES ($1,$2,$3) RETURNING *', [actor.tenantId, actor.actorId, text]));
    return json(res, 201, noteView(row.rows[0]));
  }
  const noteMatch = /^\/api\/notes\/([^/]+)$/.exec(p);
  if (m === 'GET' && noteMatch) {
    requireRole(actor, 'notes_reader', 'notes_writer');
    if (!UUID.test(noteMatch[1])) throw new ApiError(404, 'NOT_FOUND');
    const row = (await asTenant(actor.tenantId, c => c.query('SELECT * FROM sample.notes WHERE id=$1', [noteMatch[1]]))).rows[0];
    if (!row) throw new ApiError(404, 'NOT_FOUND');
    return json(res, 200, noteView(row));
  }

  if (m === 'POST' && p === '/api/payments') {
    requireRole(actor, 'cashier');
    const input = await readJson(req);
    const operator = input.operator === 'orange' ? 'orange' : 'mtn';
    const amount = Number(input.amount);
    const msisdn = String(input.msisdn ?? '').replace(/\s+/g, '');
    if (!Number.isInteger(amount) || amount <= 0 || amount > 1_000_000) throw new ApiError(400, 'AMOUNT_INVALID');
    if (!/^\+?\d{8,15}$/.test(msisdn)) throw new ApiError(400, 'MSISDN_INVALID');
    const payment = (await asTenant(actor.tenantId, c => c.query(`INSERT INTO sample.payments(tenant_id,created_by,operator,msisdn,amount,test_mode)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [actor.tenantId, actor.actorId, operator, msisdn, amount, momo.testMode]))).rows[0];
    const sent = await momo.requestToPay({ operator, amount, msisdn, reference: payment.id, callbackUrl: `${CALLBACK_BASE_URL}/webhooks/momo`, description: 'ADS sample payment' });
    const updated = (await asTenant(actor.tenantId, c => (sent.ok
      ? c.query('UPDATE sample.payments SET provider_ref=$2, updated_at=now() WHERE id=$1 RETURNING *', [payment.id, sent.providerRef])
      : c.query("UPDATE sample.payments SET status='FAILED', failure_reason=$2, updated_at=now() WHERE id=$1 RETURNING *", [payment.id, sent.reason])))).rows[0];
    return json(res, 201, paymentView(updated));
  }
  const payMatch = /^\/api\/payments\/([^/]+)$/.exec(p);
  if (m === 'GET' && payMatch) {
    requireRole(actor, 'cashier');
    if (!UUID.test(payMatch[1])) throw new ApiError(404, 'NOT_FOUND');
    // A request the payer never approves expires here; the provider may never call back.
    const row = (await asTenant(actor.tenantId, async c => {
      await c.query(`UPDATE sample.payments SET status='EXPIRED', failure_reason='TIMEOUT', updated_at=now()
        WHERE id=$1 AND status='PENDING' AND created_at < now() - make_interval(secs => $2)`, [payMatch[1], PAYMENT_TIMEOUT_SECONDS]);
      return c.query('SELECT * FROM sample.payments WHERE id=$1', [payMatch[1]]);
    })).rows[0];
    if (!row) throw new ApiError(404, 'NOT_FOUND');
    return json(res, 200, paymentView(row));
  }

  throw new ApiError(404, 'NOT_FOUND');
}

const server = http.createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (error) {
    if (res.headersSent) return res.end();
    if (error instanceof ApiError) return json(res, error.status, { error: { code: error.code } });
    console.error(error);
    json(res, 500, { error: { code: 'SERVER_ERROR' } });
  }
});
server.listen(PORT, HOST, () => console.log(`sample product on ${PUBLIC_URL} (listening ${HOST}:${PORT}, payments ${momo.testMode ? 'TEST MODE' : 'live'})`));
const stop = () => server.close(() => pool.end().then(() => process.exit(0)));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

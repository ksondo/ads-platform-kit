import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import { createLocalJWKSet, decodeProtectedHeader, jwtVerify } from 'jose';
import { validateClientList } from '../src/demo.mjs';
import { DATABASE_URL, createActiveUser, registerClient, startService } from './helpers.mjs';

// OAuth 2.0 client_credentials for service clients (RFC 6749 §4.4) and the per-client delegated
// token exchange allow list (RFC 8693) used by the Sector Offer API v1 (Agriculture -> Commerce).
// Clients here are test fixtures; the reviewed list (config/clients.demo.json) is maintained separately.
const here = path.dirname(fileURLToPath(import.meta.url));
const TX = 'urn:ietf:params:oauth:grant-type:token-exchange';
const AT = 'urn:ietf:params:oauth:token-type:access_token';
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
const secretOf = name => `${name}-secret-${crypto.randomBytes(12).toString('hex')}`;
const basic = (id, secret) => `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
const claimsOf = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
const cli = (args, env = {}) => spawnSync(process.execPath, [path.resolve(here, '../src/cli.mjs'), ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, DATABASE_URL, ...env }, timeout: 60_000 });

async function registerService(pool, { id, scopes, audiences, secret }) {
  await pool.query(`INSERT INTO platform.oauth_clients(client_id,display_name,redirect_uris,allow_personal_workspace,kind,service_scopes,service_audiences,client_secret_hash)
    VALUES ($1,$2,'{}',false,'service',$3,$4,$5)`, [id, `Service ${id}`, scopes, audiences, sha(secret)]);
}

async function token(svc, form, { auth } = {}) {
  const res = await fetch(`${svc.base}/token`, {
    method: 'POST', body: new URLSearchParams(form),
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...(auth ? { authorization: auth } : {}) },
  });
  return { status: res.status, headers: res.headers, body: await res.json() };
}

describe('service clients and delegated token exchange', () => {
  let svc;
  let jwks;
  const outcomesSecret = secretOf('outcomes');
  const vouchersSecret = secretOf('vouchers');
  const agriSecret = secretOf('agri');
  const healthSecret = secretOf('health');
  let farmer;
  let coop;
  let n = 0;

  before(async () => {
    svc = await startService();
    jwks = createLocalJWKSet(svc.keys.jwks);
    await registerService(svc.pool, { id: 'agri-sector-service', scopes: ['commerce.sector_outcomes.read'], audiences: ['ads-commerce-api'], secret: outcomesSecret });
    await registerService(svc.pool, { id: 'commerce-sector-service', scopes: ['agri.input_vouchers', 'agri.input_vouchers.redeem'], audiences: ['ads-agriculture-api', 'ads-agriculture-api-b'], secret: vouchersSecret });
    await registerClient(svc.pool, { id: 'agriculture-web', redirect: 'https://agriculture.example.test/', selfRoles: ['farmer'], personal: true });
    await svc.pool.query("UPDATE platform.oauth_clients SET client_secret_hash=$2, token_exchange=$3::jsonb WHERE client_id=$1",
      ['agriculture-web', sha(agriSecret), JSON.stringify([{ audience: 'ads-commerce-api', scopes: ['commerce.sector_offers'] }])]);
    await registerClient(svc.pool, { id: 'health-web', selfRoles: ['patient'] });
    await svc.pool.query('UPDATE platform.oauth_clients SET client_secret_hash=$2 WHERE client_id=$1', ['health-web', sha(healthSecret)]);
    farmer = await createActiveUser(svc.pool, 'farmer@example.cm', 'Farmer-Pass-2026-x');
    const orgId = crypto.randomUUID();
    coop = crypto.randomUUID();
    await svc.pool.query("INSERT INTO platform.organizations(id,name,slug) VALUES ($1,'Coop Mbalmayo',$2)", [orgId, `coop-${orgId}`]);
    await svc.pool.query("INSERT INTO platform.tenants(id,organization_id,name) VALUES ($1,$2,'Coop Mbalmayo')", [coop, orgId]);
    await svc.pool.query("INSERT INTO platform.memberships(user_id,tenant_id,role) VALUES ($1,$2,'member')", [farmer.id, coop]);
    await svc.pool.query("INSERT INTO platform.product_roles(user_id,tenant_id,client_id,roles) VALUES ($1,$2,'agriculture-web','{coop_manager}')", [farmer.id, coop]);
  });
  after(async () => { await svc.stop(); });

  const auditRows = async (event, clientId) => (await svc.pool.query('SELECT * FROM platform.identity_audit WHERE event_type=$1 AND client_id=$2 ORDER BY id', [event, clientId])).rows;
  const userToken = (u = farmer, tenantId = coop, client = 'agriculture-web', extra = {}) => svc.keys.sign(
    { tenant_id: tenantId, roles: ['coop_manager'], client_id: client, ...extra }, { audience: client, issuer: svc.config.issuer, subject: u.id, expiresIn: 900 });
  const exchange = async ({ subject, client = 'agriculture-web', secret = agriSecret, audience = 'ads-commerce-api', scope = 'commerce.sector_offers', extra = {} }) => token(svc, {
    grant_type: TX, subject_token: subject ?? await userToken(), subject_token_type: AT, ...(audience === null ? {} : { audience }), ...(scope ? { scope } : {}), ...extra,
  }, { auth: basic(client, secret) });

  describe('client_credentials (RFC 6749 §4.4)', () => {
    it('issues a short-lived RS256 service token: sub = client id, no tenant, no roles, no refresh token; audited', async () => {
      const r = await token(svc, { grant_type: 'client_credentials', scope: 'commerce.sector_outcomes.read', audience: 'ads-commerce-api' }, { auth: basic('agri-sector-service', outcomesSecret) });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.headers.get('cache-control'), 'no-store');
      assert.deepEqual(Object.keys(r.body).sort(), ['access_token', 'expires_in', 'scope', 'token_type']);
      assert.equal(r.body.token_type, 'Bearer');
      assert.equal(r.body.expires_in, 300);
      assert.equal(r.body.scope, 'commerce.sector_outcomes.read');
      assert.equal(r.body.refresh_token, undefined);
      assert.equal(decodeProtectedHeader(r.body.access_token).alg, 'RS256');
      const { payload } = await jwtVerify(r.body.access_token, jwks, { issuer: svc.config.issuer, audience: 'ads-commerce-api', algorithms: ['RS256'] });
      assert.equal(payload.sub, 'agri-sector-service');
      assert.equal(payload.client_id, 'agri-sector-service');
      assert.equal(payload.token_use, 'service');
      assert.equal(payload.scope, 'commerce.sector_outcomes.read');
      assert.equal(payload.exp - payload.iat, 300);
      for (const k of ['tenant_id', 'roles', 'email', 'sid', 'act']) assert.equal(payload[k], undefined, k);
      const rows = await auditRows('service_token', 'agri-sector-service');
      assert.equal(rows.at(-1).outcome, 'allowed');
      assert.equal(rows.at(-1).user_id, null);
      assert.equal(rows.at(-1).tenant_id, null);
      assert.deepEqual(rows.at(-1).metadata, { audience: 'ads-commerce-api', scope: ['commerce.sector_outcomes.read'] });
    });

    it('accepts client_secret_post, defaults to all allowed scopes and to the only allowed audience', async () => {
      const r = await token(svc, { grant_type: 'client_credentials', client_id: 'agri-sector-service', client_secret: outcomesSecret });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(claimsOf(r.body.access_token).aud, 'ads-commerce-api');
      assert.equal(r.body.scope, 'commerce.sector_outcomes.read');
    });

    it('a client with several audiences must name one, and only an allowed one', async () => {
      const auth = basic('commerce-sector-service', vouchersSecret);
      assert.equal((await token(svc, { grant_type: 'client_credentials', scope: 'agri.input_vouchers' }, { auth })).body.error, 'invalid_request');
      const bad = await token(svc, { grant_type: 'client_credentials', scope: 'agri.input_vouchers', audience: 'ads-commerce-api' }, { auth });
      assert.deepEqual([bad.status, bad.body.error], [400, 'invalid_target']);
      const ok = await token(svc, { grant_type: 'client_credentials', scope: 'agri.input_vouchers agri.input_vouchers.redeem', audience: 'ads-agriculture-api-b' }, { auth });
      assert.equal(ok.status, 200);
      assert.equal(claimsOf(ok.body.access_token).aud, 'ads-agriculture-api-b');
      assert.equal(ok.body.scope, 'agri.input_vouchers agri.input_vouchers.redeem');
      const reasons = (await auditRows('service_token', 'commerce-sector-service')).map(r => `${r.outcome}:${r.reason}`);
      assert.deepEqual(reasons, ['denied:AUDIENCE_REQUIRED', 'denied:AUDIENCE_NOT_ALLOWED', 'allowed:client_credentials']);
    });

    it('wrong secret, unknown client or no credentials: 401 invalid_client, no token, no audit row', async () => {
      const before = (await auditRows('service_token', 'agri-sector-service')).length;
      for (const auth of [basic('agri-sector-service', 'wrong-secret'), basic('agri-sector-service', vouchersSecret), basic('no-such-service', outcomesSecret), undefined]) {
        const r = await token(svc, { grant_type: 'client_credentials', scope: 'commerce.sector_outcomes.read' }, { auth });
        assert.equal(r.status, 401);
        assert.deepEqual(r.body, { error: 'invalid_client' });
        assert.match(r.headers.get('www-authenticate'), /^Basic /);
      }
      assert.equal((await auditRows('service_token', 'agri-sector-service')).length, before);
    });

    it('refuses sign-in (web) clients with unauthorized_client, even with a valid secret', async () => {
      for (const [id, secret] of [['agriculture-web', agriSecret], ['health-web', healthSecret]]) {
        const r = await token(svc, { grant_type: 'client_credentials', scope: 'commerce.sector_offers', audience: 'ads-commerce-api' }, { auth: basic(id, secret) });
        assert.deepEqual([r.status, r.body.error, r.body.access_token], [400, 'unauthorized_client', undefined], id);
        assert.equal((await auditRows('service_token', id)).at(-1).reason, 'NOT_A_SERVICE_CLIENT');
      }
    });

    it('refuses scopes the client is not allowed: invalid_scope (unknown, another client\'s, admin, openid, empty)', async () => {
      const auth = basic('agri-sector-service', outcomesSecret);
      for (const scope of ['commerce.unknown', 'agri.input_vouchers', 'commerce.sector_outcomes.read commerce.sector_offers', 'members:read', 'openid', ' ']) {
        const r = await token(svc, { grant_type: 'client_credentials', scope }, { auth });
        assert.deepEqual([r.status, r.body.error], [400, 'invalid_scope'], scope);
      }
      assert.equal((await auditRows('service_token', 'agri-sector-service')).at(-1).reason, 'SCOPE_NOT_ALLOWED');
    });

    it('a service client never signs anyone in, never refreshes and is not on the admin pages', async () => {
      const q = new URLSearchParams({ response_type: 'code', client_id: 'agri-sector-service', redirect_uri: 'https://x.example.test/', state: 's', code_challenge: 'a'.repeat(43), code_challenge_method: 'S256' });
      const auth = await fetch(`${svc.base}/authorize?${q}`, { redirect: 'manual' });
      assert.equal(auth.status, 400);
      const code = await token(svc, { grant_type: 'authorization_code', client_id: 'agri-sector-service', code: 'x', code_verifier: 'v'.repeat(43), redirect_uri: 'https://x.example.test/' });
      assert.deepEqual(code.body, { error: 'invalid_client' });
      const refresh = await token(svc, { grant_type: 'refresh_token', client_id: 'agri-sector-service', refresh_token: 'x' });
      assert.deepEqual(refresh.body, { error: 'invalid_client' });
      // The admin API exchange (no audience) does not authenticate service clients either.
      const adminTx = await token(svc, { grant_type: TX, subject_token: await userToken(), subject_token_type: AT }, { auth: basic('agri-sector-service', outcomesSecret) });
      assert.equal(adminTx.status, 401);
      assert.equal(svc.app.admin.getClient && await svc.app.admin.getClient('agri-sector-service'), null);
    });

    it('the database refuses a service client row carrying sign-in fields', async () => {
      await assert.rejects(svc.pool.query(`INSERT INTO platform.oauth_clients(client_id,display_name,redirect_uris,allow_personal_workspace,kind,service_scopes,service_audiences)
        VALUES ('bad-service','Bad','{https://x.example.test/}',false,'service','{a.b}','{ads-x}')`), /oauth_clients_kind_fields_check/);
      await assert.rejects(svc.pool.query("UPDATE platform.oauth_clients SET service_scopes='{a.b}' WHERE client_id='health-web'"), /oauth_clients_kind_fields_check/);
      await assert.rejects(svc.pool.query("UPDATE platform.oauth_clients SET kind='robot' WHERE client_id='health-web'"), /oauth_clients_kind_check/);
    });

    it('is advertised in the discovery document', async () => {
      const d = await (await fetch(`${svc.base}/.well-known/openid-configuration`)).json();
      assert.ok(d.grant_types_supported.includes('client_credentials'));
      assert.ok(d.grant_types_supported.includes(TX));
    });
  });

  describe('delegated token exchange (RFC 8693) with a per-client allow list', () => {
    it('agriculture-web may exchange a signed-in user\'s token for ads-commerce-api / commerce.sector_offers', async () => {
      const subject = await userToken();
      const r = await exchange({ subject });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.issued_token_type, AT);
      assert.equal(r.body.token_type, 'Bearer');
      assert.equal(r.body.scope, 'commerce.sector_offers');
      assert.equal(r.body.refresh_token, undefined);
      assert.ok(r.body.expires_in > 0 && r.body.expires_in <= 300);
      const { payload } = await jwtVerify(r.body.access_token, jwks, { issuer: svc.config.issuer, audience: 'ads-commerce-api', algorithms: ['RS256'] });
      assert.equal(payload.sub, farmer.id, 'sub preserved');
      assert.equal(payload.tenant_id, coop, 'tenant_id preserved');
      assert.deepEqual(payload.act, { sub: 'agriculture-web' });
      assert.equal(payload.scope, 'commerce.sector_offers');
      assert.equal(payload.client_id, 'agriculture-web');
      assert.equal(payload.roles, undefined, 'no product roles leave the product');
      // The exchanged token is not a token for any sign-in product.
      await assert.rejects(jwtVerify(r.body.access_token, jwks, { issuer: svc.config.issuer, audience: 'agriculture-web' }));
      const row = (await auditRows('token_exchange', 'agriculture-web')).at(-1);
      assert.deepEqual([row.outcome, row.user_id, row.tenant_id], ['allowed', farmer.id, coop]);
      assert.deepEqual(row.metadata, { audience: 'ads-commerce-api', scope: ['commerce.sector_offers'] });
      // Scope may be left out: the listed scopes for that audience.
      const dflt = await exchange({ subject, scope: null });
      assert.equal(dflt.status, 200);
      assert.equal(dflt.body.scope, 'commerce.sector_offers');
    });

    it('refuses other clients, audiences and scopes (invalid_target / invalid_scope / unauthorized_client), audited', async () => {
      const healthToken = await userToken(farmer, coop, 'health-web');
      const cases = [
        [{ client: 'health-web', secret: healthSecret, subject: healthToken }, 'invalid_target', 'health-web', 'AUDIENCE_NOT_ALLOWED'],
        [{ audience: 'ads-agriculture-api' }, 'invalid_target', 'agriculture-web', 'AUDIENCE_NOT_ALLOWED'],
        [{ audience: 'health-web' }, 'invalid_target', 'agriculture-web', 'AUDIENCE_NOT_ALLOWED'],
        [{ scope: 'commerce.sector_outcomes.read' }, 'invalid_scope', 'agriculture-web', 'SCOPE_NOT_ALLOWED'],
        [{ scope: 'commerce.sector_offers members:read' }, 'invalid_scope', 'agriculture-web', 'SCOPE_NOT_ALLOWED'],
        [{ client: 'agri-sector-service', secret: outcomesSecret }, 'unauthorized_client', 'agri-sector-service', 'NOT_A_SIGN_IN_CLIENT'],
      ];
      for (const [opts, error, clientId, reason] of cases) {
        const r = await exchange(opts);
        assert.deepEqual([r.status, r.body.error, r.body.access_token], [400, error, undefined], JSON.stringify(opts));
        const row = (await auditRows('token_exchange', clientId)).at(-1);
        assert.deepEqual([row.outcome, row.reason], ['denied', reason], JSON.stringify(opts));
      }
      const wrong = await exchange({ secret: healthSecret });
      assert.deepEqual([wrong.status, wrong.body.error], [401, 'invalid_client']);
    });

    it('refuses a subject token of another product, an admin/service/exchanged token, and a user who lost access', async () => {
      const exchanged = (await exchange({})).body.access_token;
      const service = (await token(svc, { grant_type: 'client_credentials' }, { auth: basic('agri-sector-service', outcomesSecret) })).body.access_token;
      const subjects = [
        await userToken(farmer, coop, 'health-web'),
        exchanged,
        service,
        await userToken(farmer, coop, 'agriculture-web', { token_use: 'admin' }),
        await svc.keys.sign({ client_id: 'agriculture-web' }, { audience: 'agriculture-web', issuer: svc.config.issuer, subject: 'agri-sector-service', expiresIn: 60 }),
        'not-a-jwt',
      ];
      for (const subject of subjects) {
        const r = await exchange({ subject });
        assert.deepEqual([r.status, r.body.error], [400, 'invalid_grant']);
      }
      assert.equal((await auditRows('token_exchange', 'agriculture-web')).at(-1).reason, 'SUBJECT_TOKEN_INVALID');
      n += 1;
      const leaver = await createActiveUser(svc.pool, `leaver-${n}@example.cm`, 'Leaver-Pass-2026-x');
      await svc.pool.query("INSERT INTO platform.memberships(user_id,tenant_id,role) VALUES ($1,$2,'member')", [leaver.id, coop]);
      const before = await userToken(leaver);
      assert.equal((await exchange({ subject: before })).status, 200);
      await svc.pool.query("UPDATE platform.memberships SET status='disabled' WHERE user_id=$1", [leaver.id]);
      const r = await exchange({ subject: before });
      assert.deepEqual([r.status, r.body.error], [400, 'invalid_grant']);
      assert.equal((await auditRows('token_exchange', 'agriculture-web')).at(-1).reason, 'ACCESS_REMOVED');
    });

    it('without audience, the token endpoint keeps the admin API exchange exactly as before', async () => {
      const r = await exchange({ audience: null, scope: null });
      // The farmer is not an organisation admin and agriculture-web has no admin scopes here.
      assert.deepEqual([r.status, r.body.error], [400, 'access_denied']);
      assert.equal((await svc.pool.query("SELECT reason FROM platform.identity_audit WHERE event_type='admin_token' ORDER BY id DESC LIMIT 1")).rows[0].reason, 'SCOPE_NOT_ALLOWED');
    });
  });
});

describe('service token rate limit', () => {
  let svc;
  const secret = secretOf('limited');
  before(async () => {
    svc = await startService({ env: { IDENTITY_LIMIT_TOKEN_PER_IP: '3' } });
    await registerService(svc.pool, { id: 'limited-service', scopes: ['commerce.sector_outcomes.read'], audiences: ['ads-commerce-api'], secret });
  });
  after(async () => { await svc.stop(); });

  it('client_credentials shares the token endpoint limit per address', async () => {
    const statuses = [];
    for (let i = 0; i < 5; i += 1) statuses.push((await token(svc, { grant_type: 'client_credentials' }, { auth: basic('limited-service', secret) })).status);
    assert.deepEqual(statuses, [200, 200, 200, 429, 429]);
  });
});

describe('client list and operator CLI: service clients and tokenExchange', () => {
  const base = () => JSON.parse(readFileSync(path.resolve(here, '../../../config/clients.demo.json'), 'utf8'));
  const service = { client_id: 'test-sector-service', kind: 'service', display_name: 'Test sector service', allowedServiceScopes: ['commerce.sector_outcomes.read'], allowedAudiences: ['ads-commerce-api'] };
  const withAgri = (doc, rule) => { const a = doc.products.find(p => p.client_id === 'agriculture-web'); a.tokenExchange = rule; return doc; };
  const good = () => withAgri({ ...base(), service_clients: [structuredClone(service)] }, [{ audience: 'ads-commerce-api', scopes: ['commerce.sector_offers'] }]);

  it('accepts service_clients and a tokenExchange allow list', () => {
    assert.doesNotThrow(() => validateClientList(good()));
  });

  it('refuses malformed service clients and exchange lists', () => {
    const bad = [
      [d => { d.products.push({ ...structuredClone(service), client_id: 'other-sector-service' }); }, /kind "service" is not allowed in products/],
      [d => { d.service_clients[0].kind = 'web'; }, /kind must be "service"/],
      [d => { d.service_clients[0].redirect_uris = ['https://x.example.test/']; }, /redirect_uris is not allowed on a service client/],
      [d => { d.service_clients[0].admin_roles = ['x']; }, /admin_roles is not allowed/],
      [d => { d.service_clients[0].allowedServiceScopes = ['members:read']; }, /allowedServiceScopes: bad value/],
      [d => { d.service_clients[0].allowedServiceScopes = []; }, /allowedServiceScopes must be a non-empty list/],
      [d => { d.service_clients[0].allowedAudiences = ['commerce-web']; }, /audience commerce-web is a client id/],
      [d => { d.service_clients[0].allowedAudiences = ['https://commerce.example/']; }, /allowedAudiences: bad value/],
      [d => { d.service_clients[0].needs_client_secret = false; }, /needs_client_secret must be true/],
      [d => { d.service_clients[0].client_id = 'agriculture-web'; }, /duplicate client_id agriculture-web/],
      [d => { d.service_clients = {}; }, /service_clients must be a list/],
      [d => { withAgri(d, [{ audience: 'ads-commerce-api', scopes: ['commerce.sector_offers'], extra: 1 }]); }, /unknown field extra/],
      [d => { withAgri(d, [{ audience: 'commerce-web', scopes: ['commerce.sector_offers'] }]); }, /audience commerce-web is a client id/],
      [d => { withAgri(d, [{ audience: 'ads-commerce-api', scopes: [] }]); }, /scopes must be a non-empty list/],
      [d => { withAgri(d, [{ audience: 'ads-commerce-api', scopes: ['a.b'] }, { audience: 'ads-commerce-api', scopes: ['a.c'] }]); }, /listed twice/],
      [d => { withAgri(d, 'ads-commerce-api'); }, /tokenExchange must be a list/],
      [d => { d.products.find(p => p.client_id === 'agriculture-web').needs_client_secret = false; }, /tokenExchange needs needs_client_secret: true/],
      [d => { d.products.find(p => p.client_id === 'health-web').allowedAudiences = ['ads-x']; }, /allowedAudiences is only for service clients/],
    ];
    for (const [mutate, message] of bad) {
      const doc = good();
      mutate(doc);
      assert.throws(() => validateClientList(doc), message, String(message));
    }
  });

  describe('register-client and apply-clients', () => {
    let svc;
    let dir;
    before(async () => {
      svc = await startService();
      dir = mkdtempSync(path.join(os.tmpdir(), 'kitident-svc-'));
    });
    after(async () => { await svc.stop(); rmSync(dir, { recursive: true, force: true }); });

    it('register-client --kind service saves a service client and refuses sign-in fields or bad scopes', async () => {
      const ok = cli(['register-client', '--kind', 'service', '--id', 'cli-sector-service', '--name', 'CLI sector service', '--service-scopes', 'commerce.sector_outcomes.read', '--service-audiences', 'ads-commerce-api']);
      assert.equal(ok.status, 0, ok.stderr);
      const row = (await svc.pool.query("SELECT * FROM platform.oauth_clients WHERE client_id='cli-sector-service'")).rows[0];
      assert.deepEqual([row.kind, row.service_scopes, row.service_audiences, row.redirect_uris, row.allow_personal_workspace], ['service', ['commerce.sector_outcomes.read'], ['ads-commerce-api'], [], false]);
      for (const extra of [['--redirect', 'https://x.example.test/'], ['--admin-scopes', 'members:read'], ['--personal', 'true']]) {
        const r = cli(['register-client', '--kind', 'service', '--id', 'cli-sector-service', '--name', 'X', '--service-scopes', 'a.b', '--service-audiences', 'ads-x', ...extra]);
        assert.equal(r.status, 1, extra.join(' '));
        assert.match(r.stderr, /not allowed for a service client/);
      }
      for (const [flag, value, message] of [['--service-scopes', 'members:read', /bad value/], ['--service-audiences', 'cli-sector-service', /is a client id/], ['--service-scopes', '', /non-empty list/]]) {
        const args = { '--service-scopes': 'a.b', '--service-audiences': 'ads-x', [flag]: value };
        const r = cli(['register-client', '--kind', 'service', '--id', 'cli-sector-service', '--name', 'X', ...Object.entries(args).flat()]);
        assert.equal(r.status, 1, `${flag} ${value}`);
        assert.match(r.stderr, message);
      }
      const web = cli(['register-client', '--id', 'cli-web', '--name', 'CLI web', '--redirect', 'https://cli.example.test/', '--token-exchange', '[{"audience":"ads-commerce-api","scopes":["commerce.sector_offers"]}]']);
      assert.equal(web.status, 0, web.stderr);
      assert.deepEqual((await svc.pool.query("SELECT token_exchange FROM platform.oauth_clients WHERE client_id='cli-web'")).rows[0].token_exchange, [{ audience: 'ads-commerce-api', scopes: ['commerce.sector_offers'] }]);
      const badWeb = cli(['register-client', '--id', 'cli-web', '--name', 'CLI web', '--redirect', 'https://cli.example.test/', '--token-exchange', '[{"audience":"cli-sector-service","scopes":["a.b"]}]']);
      assert.equal(badWeb.status, 1);
      assert.match(badWeb.stderr, /is a client id/);
      const reuse = cli(['register-client', '--id', 'ads-commerce-api', '--name', 'Clash', '--redirect', 'https://clash.example.test/']);
      assert.equal(reuse.status, 1);
      assert.match(reuse.stderr, /used as an audience by another client/);
    });

    it('apply-clients registers service clients with a secret (never printed) and the tokenExchange list; the grant works', async () => {
      const file = path.join(dir, 'clients.json');
      writeFileSync(file, JSON.stringify(good()));
      const applyScript = path.resolve(here, '../scripts/apply-clients.mjs');
      const run = args => spawnSync(process.execPath, [applyScript, '--file', file, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, DATABASE_URL }, timeout: 120_000 });
      const dry = run(['--dry-run']);
      assert.equal(dry.status, 0, dry.stderr);
      assert.match(dry.stdout, /would register test-sector-service \(service client\) \(\+ client secret\)/);
      const out = path.join(dir, 'secrets.json');
      const r = run(['--secrets-out', out]);
      assert.equal(r.status, 0, r.stderr);
      const secret = JSON.parse(readFileSync(out, 'utf8')).clients['test-sector-service'].secret;
      assert.ok(secret && !r.stdout.includes(secret) && !r.stderr.includes(secret));
      const row = (await svc.pool.query("SELECT * FROM platform.oauth_clients WHERE client_id='test-sector-service'")).rows[0];
      assert.equal(row.kind, 'service');
      assert.deepEqual((await svc.pool.query("SELECT token_exchange FROM platform.oauth_clients WHERE client_id='agriculture-web'")).rows[0].token_exchange,
        [{ audience: 'ads-commerce-api', scopes: ['commerce.sector_offers'] }]);
      const t = await token(svc, { grant_type: 'client_credentials', scope: 'commerce.sector_outcomes.read' }, { auth: basic('test-sector-service', secret) });
      assert.equal(t.status, 200, JSON.stringify(t.body));
      // A bad list stops before anything is registered.
      const bad = good();
      bad.service_clients[0].allowedAudiences = ['commerce-web'];
      writeFileSync(file, JSON.stringify(bad));
      const refused = run(['--dry-run']);
      assert.equal(refused.status, 2);
      assert.match(refused.stderr, /is a client id/);
    });
  });
});

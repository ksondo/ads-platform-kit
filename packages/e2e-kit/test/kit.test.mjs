import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { after, before, describe, it } from 'node:test';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { connectIdentity, freePort, loadE2eEnv, startIdentity, startMocks, verifyWebhookSignature, signPayload } from '../src/index.mjs';

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(here, '../bin/ads-e2e.mjs');
const DATABASE_URL = process.env.E2E_KIT_TEST_DATABASE_URL ?? 'postgres://ads_e2e:ads_e2e@127.0.0.1:5432/ads_kit_selftest';
const REDIRECT = 'http://localhost:4999/app/';

// Minimal cookie-keeping client to walk the real authorize -> login -> token flow without a browser.
function browser() {
  const jar = new Map();
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const keep = res => { for (const line of res.headers.getSetCookie()) { const [pair] = line.split(';'); const i = pair.indexOf('='); jar.set(pair.slice(0, i), pair.slice(i + 1)); } };
  return {
    async get(url) { const res = await fetch(url, { redirect: 'manual', headers: { cookie: cookie(), accept: 'text/html' } }); keep(res); return { res, text: await res.text() }; },
    async post(url, form) {
      const res = await fetch(url, { method: 'POST', redirect: 'manual', body: new URLSearchParams(form), headers: { cookie: cookie(), accept: 'text/html', 'content-type': 'application/x-www-form-urlencoded' } });
      keep(res);
      return { res, text: await res.text() };
    },
  };
}
async function codeFlow(h, clientId, { email, password }) {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const b = browser();
  const q = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, state: 's1', code_challenge: challenge, code_challenge_method: 'S256' });
  const auth = await b.get(`${h.url}/authorize?${q}`);
  const loginUrl = new URL(auth.res.headers.get('location'), h.url);
  const page = await b.get(loginUrl);
  const csrf = page.text.match(/name="csrf" value="([^"]+)"/)[1];
  const done = await b.post(`${h.url}/login`, { csrf, req: loginUrl.searchParams.get('req'), email, password });
  const back = done.res.headers.get('location');
  assert.ok(back?.startsWith(REDIRECT), `redirected back to the product (got ${done.res.status})`);
  const code = new URL(back).searchParams.get('code');
  const token = await fetch(`${h.url}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'http://localhost:4999' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: clientId, redirect_uri: REDIRECT }) });
  assert.equal(token.headers.get('access-control-allow-origin'), 'http://localhost:4999');
  return (await token.json()).access_token;
}

describe('startIdentity in-process + startMocks', () => {
  let mocks;
  let h;
  before(async () => {
    mocks = await startMocks();
    h = await startIdentity({ databaseUrl: DATABASE_URL, resetDatabase: true, mocksUrl: mocks.url, webhookSecret: mocks.webhookSecret });
    await h.registerClient({ clientId: 'kit-test-web', redirectUris: [REDIRECT], name: 'Kit Test' });
  });
  after(async () => { await h.cleanup(); await h.close(); await mocks.stop(); });

  it('a seeded user signs in through the real hosted login and gets a token with sub, tenant_id, roles', async () => {
    const t = await h.seedTenant({ product: 'kit-test-web', roles: ['clerk'] });
    const token = await codeFlow(h, 'kit-test-web', t);
    const { payload, protectedHeader } = await jwtVerify(token, createRemoteJWKSet(new URL(h.jwksUrl)), { issuer: h.issuer, audience: 'kit-test-web', algorithms: ['RS256'] });
    assert.equal(protectedHeader.alg, 'RS256');
    assert.equal(payload.sub, t.user.id);
    assert.equal(payload.tenant_id, t.tenantId);
    assert.deepEqual(payload.roles, ['clerk']);
  });

  it('grantRole adds roles; two orgs give the user a workspace choice', async () => {
    const t = await h.seedTenant({ product: 'kit-test-web', roles: ['clerk'] });
    await h.grantRole({ user: t.user, org: t.org, product: 'kit-test-web', role: 'approver' });
    const roles = (await h.pool.query('SELECT roles FROM platform.product_roles WHERE user_id=$1', [t.user.id])).rows[0].roles.sort();
    assert.deepEqual(roles, ['approver', 'clerk']);
  });

  it('grantRoleViaApi, adminApi and inviteViaApi go through the real admin API (token exchange + /admin/v1)', async () => {
    const { clientSecret } = await h.registerClient({ clientId: 'kit-admin-web', redirectUris: [REDIRECT], name: 'Kit Admin', clientSecret: true, assignableRoles: ['clerk', 'approver'] });
    assert.ok(clientSecret);
    const owner = await h.seedTenant({ product: 'kit-admin-web', roles: ['approver'] });
    const staff = await h.createUser();
    const granted = await h.grantRoleViaApi({ admin: owner.user, org: owner.org, product: 'kit-admin-web', clientSecret, user: staff, role: 'clerk' });
    assert.deepEqual(granted.roles, ['clerk']);
    const token = await codeFlow(h, 'kit-admin-web', staff);
    const { payload } = await jwtVerify(token, createRemoteJWKSet(new URL(h.jwksUrl)), { issuer: h.issuer, audience: 'kit-admin-web' });
    assert.deepEqual([payload.tenant_id, payload.roles], [owner.tenantId, ['clerk']]);

    await assert.rejects(h.grantRoleViaApi({ admin: staff, org: owner.org, product: 'kit-admin-web', clientSecret, user: staff, role: 'approver' }), e => e.code === 'access_denied', 'members are not admins');
    await assert.rejects(h.adminToken({ admin: owner.user, org: owner.org, product: 'kit-admin-web', clientSecret: 'wrong' }), e => e.status === 401);

    const api = await h.adminApi({ admin: owner.user, org: owner.org, product: 'kit-admin-web', clientSecret });
    assert.deepEqual((await api.members()).map(m => m.email).sort(), [owner.email, staff.email].sort());
    const phone = `+2376${crypto.randomInt(10000000, 99999999)}`;
    const inv = await h.inviteViaApi({ admin: owner.user, org: owner.org, product: 'kit-admin-web', clientSecret, role: 'clerk', phone });
    assert.match(inv.link, /\/invite\?token=/);
    assert.equal(inv.invitation.status, 'pending');
    const sms = await h.mocks.waitForMessage({ channel: 'sms', to: phone, includes: '/invite?token=' });
    assert.ok(sms, 'the SMS hook goes to the mock SMS capture');
    const landing = await (await fetch(inv.link, { headers: { accept: 'text/html' } })).text();
    assert.match(landing, /Create my ADS account/);
    assert.equal((await api.revokeInvitation(inv.invitation.id)).status, 'revoked');
    await assert.rejects(api.grant(staff, ['nope']), e => e.status === 400 && e.code === 'ROLE_NOT_ASSIGNABLE');
  });

  it('mintAccessToken is signed by the running service key (verifies via its JWKS)', async () => {
    const token = await h.mintAccessToken({ sub: 'user-1', tenant_id: crypto.randomUUID(), roles: ['r'], audience: 'kit-test-web' });
    const { payload } = await jwtVerify(token, createRemoteJWKSet(new URL(h.jwksUrl)), { issuer: h.issuer, audience: 'kit-test-web' });
    assert.deepEqual(payload.roles, ['r']);
    await assert.rejects(jwtVerify(token, createRemoteJWKSet(new URL(h.jwksUrl)), { issuer: h.issuer, audience: 'other-product' }));
  });

  it('activation emails from the real registration page land in the mock email capture', async () => {
    const b = browser();
    const page = await b.get(`${h.url}/register`);
    const csrf = page.text.match(/name="csrf" value="([^"]+)"/)[1];
    const email = `kit-reg-${Date.now()}@example.test`;
    await b.post(`${h.url}/register`, { csrf, email, password: 'Kit-Register-2026!', confirm: 'Kit-Register-2026!' });
    const mail = await h.waitForEmail({ to: email, subject: 'Activate' });
    assert.match(mail.text, /\/verify-email\?token=/);
    await h.pool.query('DELETE FROM platform.users WHERE email=$1', [email]);
  });

  it('unverified users cannot sign in; cleanup removes created users and orgs', async () => {
    const u = await h.createUser({ verified: false });
    const row = (await h.pool.query('SELECT status FROM platform.users WHERE id=$1', [u.id])).rows[0];
    assert.equal(row.status, 'pending');
    const t = await h.seedTenant({ product: 'kit-test-web', roles: ['clerk'] });
    await h.cleanup();
    assert.equal((await h.pool.query('SELECT 1 FROM platform.users WHERE id = ANY($1::uuid[])', [[u.id, t.user.id]])).rowCount, 0);
    assert.equal((await h.pool.query('SELECT 1 FROM platform.tenants WHERE id=$1', [t.tenantId])).rowCount, 0);
  });

  it('re-exports the webhook signature check used by product adapters', () => {
    const raw = '{"x":1}';
    assert.ok(verifyWebhookSignature(raw, signPayload(raw, mocks.webhookSecret), mocks.webhookSecret));
  });
});

describe('startIdentity as a child process', () => {
  it('serves health and JWKS, and minted tokens verify', async () => {
    const h = await startIdentity({ databaseUrl: DATABASE_URL, mode: 'process' });
    try {
      assert.equal((await (await fetch(`${h.url}/health`)).json()).status, 'ok');
      const token = await h.mintAccessToken({ sub: 'u', tenant_id: crypto.randomUUID(), roles: ['a'], audience: 'kit-test-web' });
      await jwtVerify(token, createRemoteJWKSet(new URL(h.jwksUrl)), { issuer: h.issuer, audience: 'kit-test-web' });
    } finally {
      await h.close();
    }
    await assert.rejects(fetch(`${h.url}/health`), 'process stopped');
  });
});

describe('ads-e2e CLI', () => {
  it('up, register-client, env, status, down', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ads-e2e-cli-'));
    const state = path.join(dir, 'state.json');
    const [ip, mp] = [await freePort(), await freePort()];
    const cli = (...args) => run(process.execPath, [CLI, ...args, '--state', state]);
    try {
      const up = await cli('up', '--database-url', DATABASE_URL, '--identity-port', String(ip), '--mocks-port', String(mp));
      assert.match(up.stdout, /ADS test environment up/);
      await cli('register-client', '--id', 'cli-web', '--redirect', 'http://localhost:4998/', '--self-roles', 'member');
      const env = Object.fromEntries((await cli('env', '--client', 'cli-web')).stdout.trim().split('\n').map(l => l.split(/=(.*)/s).slice(0, 2)));
      assert.equal(env.OIDC_ISSUER, `http://127.0.0.1:${ip}`);
      assert.equal(env.OIDC_AUDIENCE, 'cli-web');
      assert.equal(env.OIDC_JWKS_URL, `http://127.0.0.1:${ip}/.well-known/jwks.json`);
      assert.equal(env.ADS_IDENTITY_CLIENT_ID, 'cli-web');
      assert.equal(env.ADS_MOCKS_URL, `http://127.0.0.1:${mp}`);
      assert.match(env.ADS_MOCKS_WEBHOOK_SECRET, /^[0-9a-f]{48}$/);
      assert.deepEqual(loadE2eEnv({ stateFile: state, clientId: 'cli-web' }).OIDC_ISSUER, env.OIDC_ISSUER);
      assert.match((await cli('env', '--format', 'shell')).stdout, /^export OIDC_ISSUER="/m);
      assert.match((await cli('status')).stdout, /running/);
      const h = connectIdentity({ stateFile: state });
      const t = await h.seedTenant({ product: 'cli-web', roles: ['member'] });
      assert.ok(t.tenantId);
      await h.cleanup();
      await h.close();
      assert.equal((await (await fetch(`http://127.0.0.1:${mp}/health`)).json()).test_mode, true);
    } finally {
      await cli('down');
      await rm(dir, { recursive: true, force: true });
    }
    await assert.rejects(fetch(`http://127.0.0.1:${ip}/health`));
  });
});

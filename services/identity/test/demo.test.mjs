import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import { demoSettings, loadConfig } from '../src/config.mjs';
import { bootstrapDemoAccounts, resetDemo } from '../src/demo.mjs';
import { DATABASE_URL, browser, createActiveUser, csrfFrom, mailCount, refreshWith, registerClient, signInTokens, startService } from './helpers.mjs';

// DE-03: demo accounts with a safety switch (ADS_ENV=demo AND DEMO_MODE=1).
const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, '../src/cli.mjs');
const DOMAIN = 'demo.africadigitalsynergy.com';
const PW = { user: `Demo-User-${crypto.randomBytes(6).toString('hex')}`, user2: `Demo-Two-${crypto.randomBytes(6).toString('hex')}`, admin: `Demo-Admin-${crypto.randomBytes(6).toString('hex')}` };
const DEMO_ENV = { ADS_ENV: 'demo', DEMO_MODE: '1' };
const decode = jwt => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
const runCli = (args, env) => spawnSync(process.execPath, [cli, ...args], {
  encoding: 'utf8', env: { PATH: process.env.PATH, DATABASE_URL, ...env }, timeout: 60_000,
});
const legacyLogin = (svc, email, password) => fetch(`${svc.base}/v1/identity/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }),
}).then(async r => ({ status: r.status, body: await r.json() }));
async function pageLogin(svc, email, password) {
  const b = browser(svc.base);
  const page = await b.get('/login');
  const r = await b.post('/login', { csrf: csrfFrom(page.text), email, password });
  return { b, ...r };
}

describe('demo mode switch (settings)', () => {
  const base = { IDENTITY_PUBLIC_URL: 'https://login.example.test', DATABASE_URL: 'postgres://x', IDENTITY_COOKIE_SECRET: 'c'.repeat(40) };
  it('is on only with ADS_ENV=demo AND DEMO_MODE=1', () => {
    assert.equal(demoSettings(DEMO_ENV).enabled, true);
    assert.equal(demoSettings({ ADS_ENV: 'demo' }).enabled, false);
    assert.equal(demoSettings({ ADS_ENV: 'demo', DEMO_MODE: 'true' }).enabled, false, 'only the explicit value 1');
    assert.equal(demoSettings({ ADS_ENV: 'staging', DEMO_MODE: '1' }).enabled, false);
    assert.equal(demoSettings({ IDENTITY_DEV_MODE: 'true', DEMO_MODE: '1' }).enabled, false);
    assert.equal(loadConfig({ ...base, ...DEMO_ENV }).demo.enabled, true);
    assert.equal(loadConfig(base).demo.enabled, false);
  });
  it('stops a production start that asks for demo mode', () => {
    assert.throws(() => loadConfig({ ...base, DEMO_MODE: '1' }), /DEMO_MODE_NOT_ALLOWED_IN_PRODUCTION/);
    assert.throws(() => demoSettings({ ADS_ENV: 'production', DEMO_MODE: '1' }), /DEMO_MODE_NOT_ALLOWED_IN_PRODUCTION/);
  });
  it('keeps demo emails under the demo domain', () => {
    const s = demoSettings(DEMO_ENV);
    assert.deepEqual(Object.values(s.accounts).map(a => a.email), [`demo.user@${DOMAIN}`, `demo.checker@${DOMAIN}`, `demo.admin@${DOMAIN}`]);
    assert.throws(() => demoSettings({ ...DEMO_ENV, DEMO_ADMIN_EMAIL: 'boss@africadigitalsynergy.com' }), /DEMO_ADMIN_EMAIL_MUST_BE_UNDER/);
  });
  it('shows credentials only in demo mode with DEMO_SHOW_CREDENTIALS=1, and needs the password then', () => {
    assert.equal(demoSettings({ ADS_ENV: 'staging', DEMO_SHOW_CREDENTIALS: '1', DEMO_USER_PASSWORD: 'x' }).showCredentials, false);
    assert.equal(demoSettings({ ...DEMO_ENV, DEMO_USER_PASSWORD: 'x' }).showCredentials, false);
    assert.equal(demoSettings({ ...DEMO_ENV, DEMO_SHOW_CREDENTIALS: '1', DEMO_USER_PASSWORD: 'x' }).shownPassword, 'x');
    assert.throws(() => loadConfig({ ...base, ...DEMO_ENV, DEMO_SHOW_CREDENTIALS: '1' }), /DEMO_USER_PASSWORD_REQUIRED/);
  });
});

describe('demo accounts in demo mode, then in a non-demo environment', () => {
  let svc;
  let client;
  let demoTokens;
  let demoCookieJar;
  before(async () => {
    svc = await startService({ env: DEMO_ENV });
    client = await registerClient(svc.pool, { id: 'commerce-web', redirect: 'https://commerce.example.test/', selfRoles: ['commerce_buyer'] });
  });
  after(async () => { await svc.stop(); });

  it('demo-bootstrap creates three active demo accounts, refreshes them on a second run, and never takes over a real account', async () => {
    const first = await bootstrapDemoAccounts(svc.pool, svc.config.demo, PW);
    assert.deepEqual(first.map(a => [a.key, a.created]), [['user', true], ['user2', true], ['admin', true]]);
    const again = await bootstrapDemoAccounts(svc.pool, svc.config.demo, PW);
    assert.deepEqual(again.map(a => a.created), [false, false, false]);
    const rows = (await svc.pool.query('SELECT email,status,is_demo,demo_key,email_verified_at IS NOT NULL AS verified FROM platform.users WHERE is_demo ORDER BY demo_key')).rows;
    assert.deepEqual(rows.map(r => [r.demo_key, r.status, r.verified]), [['admin', 'active', true], ['user', 'active', true], ['user2', 'active', true]]);

    await createActiveUser(svc.pool, `real@${DOMAIN}`, 'Real-Person-2026');
    const settings = demoSettings({ ...DEMO_ENV, DEMO_USER2_EMAIL: `real@${DOMAIN}` });
    await assert.rejects(bootstrapDemoAccounts(svc.pool, settings, PW), /belongs to a real account/);
    await assert.rejects(bootstrapDemoAccounts(svc.pool, svc.config.demo, { ...PW, admin: '' }), /missing DEMO_ADMIN_PASSWORD/);
    await assert.rejects(bootstrapDemoAccounts(svc.pool, svc.config.demo, { ...PW, user: 'short' }), /DEMO_USER_PASSWORD is not accepted/);
    await assert.rejects(bootstrapDemoAccounts(svc.pool, demoSettings({ ADS_ENV: 'staging' }), PW), /refused: demo accounts/);
  });

  it('signs the demo user in, with a demo claim in the product token', async () => {
    const email = svc.config.demo.accounts.user.email;
    demoTokens = await signInTokens(svc, client, { email, password: PW.user });
    const claims = decode(demoTokens.access_token);
    assert.deepEqual(claims.roles, ['commerce_buyer']);
    assert.equal(claims.demo, true);
    const { b, location } = await pageLogin(svc, email, PW.user);
    assert.equal(location, null, 'signed-in page');
    demoCookieJar = b.jar;
    assert.equal((await legacyLogin(svc, email, PW.user)).status, 200);
  });

  it('demo accounts cannot change their password or email, or be re-registered', async () => {
    const user = svc.config.demo.accounts.user;
    const b = browser(svc.base);
    const page = await b.get('/forgot-password');
    await b.post('/forgot-password', { csrf: csrfFrom(page.text), email: user.email });
    await new Promise(r => setTimeout(r, 50));
    assert.equal(mailCount(svc, user.email), 0, 'no reset link for a demo account');
    // Even a reset token made some other way is refused.
    const { rows: [u] } = await svc.pool.query('SELECT id FROM platform.users WHERE demo_key=$1', ['user']);
    const token = crypto.randomBytes(32).toString('base64url');
    await svc.pool.query("INSERT INTO platform.email_tokens(id,user_id,purpose,token_hash,expires_at) VALUES ($1,$2,'reset_password',$3,now()+interval '1 hour')",
      [crypto.randomUUID(), u.id, crypto.createHash('sha256').update(token).digest('hex')]);
    await assert.rejects(svc.app.accounts.resetPassword({ token, password: 'Another-Password-2026' }), e => e.code === 'DEMO_ACCOUNT_LOCKED');
    // Database backstop: email and password of a demo account change only inside demo-bootstrap/demo-reset.
    await assert.rejects(svc.pool.query("UPDATE platform.users SET email='x@example.cm' WHERE id=$1", [u.id]), /DEMO_ACCOUNT_LOCKED/);
    await assert.rejects(svc.pool.query("UPDATE platform.users SET password_hash=NULL WHERE id=$1", [u.id]), /DEMO_ACCOUNT_LOCKED/);
    await assert.rejects(svc.pool.query('UPDATE platform.users SET is_demo=false WHERE id=$1', [u.id]), /DEMO_ACCOUNT_LOCKED/);
    // Registration of a demo-domain address is refused (hosted page and legacy API).
    const reg = await b.get('/register');
    const r = await b.post('/register', { csrf: csrfFrom(reg.text), email: `someone@${DOMAIN}`, password: 'Ndole-et-Plantain-2026', confirm: 'Ndole-et-Plantain-2026' });
    assert.match(r.text, /This email address is reserved/);
    const api = await fetch(`${svc.base}/v1/identity/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `x@sub.${DOMAIN}`, password: 'Ndole-et-Plantain-2026' }) });
    assert.equal((await api.json()).error.code, 'EMAIL_RESERVED');
  });

  it('demo accounts cannot create organisations: onboard is off in demo, and the CLI refuses them as owners', async () => {
    const login = await legacyLogin(svc, svc.config.demo.accounts.user.email, PW.user);
    const onboard = await fetch(`${svc.base}/v1/identity/onboard`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${login.body.accessToken}` }, body: '{"organizationName":"Mine"}' });
    assert.equal(onboard.status, 404);
    const out = runCli(['create-organization', '--name', 'Demo Owned', '--owner', svc.config.demo.accounts.user.email], {});
    assert.equal(out.status, 1);
    assert.match(out.stderr, /demo accounts cannot own organisations/);
  });

  it('the same database in a non-demo environment refuses demo accounts everywhere', async () => {
    await svc.stop();
    svc = await startService({ keepDb: true, env: { ADS_ENV: 'staging' } });
    assert.equal(svc.config.demo.enabled, false);
    const email = svc.config.demo.accounts.user.email;
    const page = await pageLogin(svc, email, PW.user);
    assert.equal(page.status, 400);
    assert.match(page.text, /Demo accounts work only in the ADS demo environment/);
    const legacy = await legacyLogin(svc, email, PW.user);
    assert.equal(legacy.status, 403);
    assert.equal(legacy.body.error.code, 'DEMO_ACCOUNT_REFUSED');
    // Earlier sign-ins stop working: refresh token and SSO cookie.
    assert.equal((await refreshWith(svc, client.id, demoTokens.refresh_token)).status, 400);
    const b = browser(svc.base);
    for (const [k, v] of demoCookieJar) b.jar.set(k, v);
    const q = new URLSearchParams({ response_type: 'code', client_id: client.id, redirect_uri: client.redirect, state: 's', code_challenge: 'a'.repeat(43), code_challenge_method: 'S256' });
    assert.match((await b.get(`/authorize?${q}`)).location, /^\/login\?req=/, 'SSO cookie of a demo account is ignored');
    const audit = await svc.pool.query("SELECT 1 FROM platform.identity_audit WHERE reason='DEMO_ACCOUNT_REFUSED'");
    assert.ok(audit.rowCount >= 2);
  });

  it('demo commands are refused outside demo mode, and production refuses to start them at all', () => {
    for (const env of [{ ADS_ENV: 'staging', DEMO_MODE: '1' }, { ADS_ENV: 'demo' }, {}]) {
      const out = runCli(['demo-bootstrap'], { ...env, DEMO_USER_PASSWORD: PW.user, DEMO_USER2_PASSWORD: PW.user2, DEMO_ADMIN_PASSWORD: PW.admin });
      assert.equal(out.status, 2, JSON.stringify(env));
      assert.match(out.stderr, /refused: demo accounts and organisations exist only when ADS_ENV=demo and DEMO_MODE=1/);
    }
    const prod = runCli(['demo-reset'], { ADS_ENV: 'production', DEMO_MODE: '1' });
    assert.equal(prod.status, 2);
    assert.match(prod.stderr, /DEMO_MODE_NOT_ALLOWED_IN_PRODUCTION/);
  });

  it('the CLI does not grant roles to a demo account outside demo mode', async () => {
    const t = (await svc.pool.query('SELECT tenant_id FROM platform.memberships LIMIT 1')).rows[0]?.tenant_id ?? crypto.randomUUID();
    const out = runCli(['grant-role', '--email', svc.config.demo.accounts.user.email, '--client', 'commerce-web', '--tenant', t, '--roles', 'merchant_owner'], { ADS_ENV: 'staging' });
    assert.equal(out.status, 1);
    assert.match(out.stderr, /refused: demo accounts get roles only in demo mode/);
  });
});

describe('demo-bootstrap and demo-reset (CLI and nightly restore)', () => {
  let svc;
  const doc = {
    products: [{ slug: 'commerce', client_id: 'commerce-web', admin_roles: ['merchant_owner'], assignable_roles: ['commerce_cashier'], ads_only_roles: ['commerce_reviewer'],
      demo_orgs: [{ key: 'main', name: 'ADS Demo – Commerce shop', roles: ['commerce_cashier', 'commerce_buyer'] },
        { key: 'staff', name: 'ADS Staff – Commerce review team', staff: true, roles: ['commerce_reviewer'] }],
      tenant_settings: { COMMERCE_REVIEW_TENANT_IDS: ['staff'] } }],
  };
  before(async () => { svc = await startService({ env: DEMO_ENV }); });
  after(async () => { await svc.stop(); });

  it('demo-bootstrap runs from the CLI with passwords from files and never prints them', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const os = await import('node:os');
    const dir = mkdtempSync(path.join(os.tmpdir(), 'kitdemo-secrets-'));
    try {
      writeFileSync(path.join(dir, 'user'), `${PW.user}\n`, { mode: 0o600 });
      const out = runCli(['demo-bootstrap'], { ...DEMO_ENV, DEMO_USER_PASSWORD_FILE: path.join(dir, 'user'), DEMO_USER2_PASSWORD: PW.user2, DEMO_ADMIN_PASSWORD: PW.admin });
      assert.equal(out.status, 0, out.stderr);
      assert.match(out.stdout, /demo user {2}demo\.user@demo\.africadigitalsynergy\.com created \(password from DEMO_USER_PASSWORD, not shown\)/);
      for (const p of Object.values(PW)) assert.ok(!out.stdout.includes(p) && !out.stderr.includes(p), 'password printed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    const page = await pageLogin(svc, svc.config.demo.accounts.user.email, PW.user);
    assert.equal(page.status, 200, 'file password works (trailing newline dropped)');
  });

  it('demo-reset restores accounts, sign-ins, memberships and roles', async () => {
    await registerClient(svc.pool, { id: 'commerce-web', redirect: 'https://commerce.example.test/', selfRoles: ['commerce_buyer'] });
    const first = await resetDemo(svc.pool, svc.config.demo, PW, doc);
    const { main, staff } = first.tenants.commerce.tenants;
    assert.equal(first.tenants.commerce.settings.COMMERCE_REVIEW_TENANT_IDS, staff);
    const ids = Object.fromEntries((await svc.pool.query('SELECT demo_key, id FROM platform.users WHERE is_demo')).rows.map(r => [r.demo_key, r.id]));

    // A day of demo use: a stranger joins, the user is moved elsewhere, roles change, invitations pending, signed in.
    const stranger = await createActiveUser(svc.pool, 'stranger@example.cm', 'Stranger-Pass-2026');
    await svc.pool.query("INSERT INTO platform.memberships(user_id,tenant_id,role) VALUES ($1,$2,'member')", [stranger.id, main]);
    await svc.pool.query("INSERT INTO platform.product_roles(user_id,tenant_id,client_id,roles) VALUES ($1,$2,'commerce-web','{commerce_cashier}')", [stranger.id, main]);
    const otherOrg = crypto.randomUUID();
    const otherTenant = crypto.randomUUID();
    await svc.pool.query("INSERT INTO platform.organizations(id,name,slug) VALUES ($1,'Real shop',$2)", [otherOrg, `real-${otherOrg}`]);
    await svc.pool.query("INSERT INTO platform.tenants(id,organization_id,name) VALUES ($1,$2,'Real shop')", [otherTenant, otherOrg]);
    await svc.pool.query("INSERT INTO platform.memberships(user_id,tenant_id,role) VALUES ($1,$2,'admin')", [ids.user, otherTenant]);
    await svc.pool.query("UPDATE platform.product_roles SET roles='{}' WHERE user_id=$1 AND tenant_id=$2", [ids.user2, main]);
    await svc.pool.query("UPDATE platform.memberships SET status='disabled' WHERE user_id=$1 AND tenant_id=$2", [ids.user2, main]);
    await svc.pool.query(`INSERT INTO platform.invitations(id,tenant_id,client_id,email,roles,token_hash,invited_by,expires_at)
      VALUES ($1,$2,'commerce-web','friend@example.cm','{commerce_cashier}',$3,$4,now()+interval '1 day')`, [crypto.randomUUID(), main, crypto.randomUUID(), ids.admin]);
    await signInTokens(svc, { id: 'commerce-web', redirect: 'https://commerce.example.test/' }, { email: svc.config.demo.accounts.admin.email, password: PW.admin, extra: { tenant_hint: main } });

    const newPw = { ...PW, user: `Rotated-${crypto.randomBytes(6).toString('hex')}` };
    const result = await resetDemo(svc.pool, svc.config.demo, newPw, doc);
    assert.deepEqual(result.tenants.commerce.tenants, { main, staff }, 'same organisations, same ids');
    assert.equal(result.cleaned.outsiders, 1);
    assert.equal(result.cleaned.foreignMemberships, 1);
    assert.equal(result.cleaned.invitations, 1);
    assert.ok(result.cleaned.refreshTokens >= 1);

    const roles = async (u, t) => (await svc.pool.query("SELECT roles FROM platform.product_roles WHERE user_id=$1 AND tenant_id=$2 AND client_id='commerce-web'", [u, t])).rows[0]?.roles ?? null;
    assert.deepEqual(await roles(ids.user2, main), ['commerce_cashier', 'commerce_buyer']);
    assert.deepEqual(await roles(ids.user, staff), ['commerce_reviewer']);
    assert.deepEqual(await roles(ids.admin, main), ['merchant_owner']);
    assert.equal(await roles(stranger.id, main), null);
    const m = (await svc.pool.query('SELECT user_id, role, status FROM platform.memberships WHERE tenant_id=$1 ORDER BY role', [main])).rows;
    assert.deepEqual(m.map(r => [r.role, r.status]).sort(), [['member', 'active'], ['member', 'active'], ['owner', 'active']]);
    assert.equal((await svc.pool.query('SELECT 1 FROM platform.memberships WHERE user_id=$1 AND tenant_id=$2', [ids.user, otherTenant])).rowCount, 0);
    const orgs = (await svc.pool.query('SELECT o.is_demo, o.is_staff FROM platform.organizations o JOIN platform.tenants t ON t.organization_id=o.id WHERE t.id = ANY($1::uuid[]) ORDER BY o.is_staff', [[main, staff]])).rows;
    assert.deepEqual(orgs, [{ is_demo: true, is_staff: false }, { is_demo: true, is_staff: true }]);
    // The rotated password from the secret is the one that works now.
    assert.equal((await pageLogin(svc, svc.config.demo.accounts.user.email, PW.user)).status, 400);
    assert.equal((await pageLogin(svc, svc.config.demo.accounts.user.email, newPw.user)).status, 200);
  });
});

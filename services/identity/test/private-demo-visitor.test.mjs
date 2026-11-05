import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browser, csrfFrom, pkce, startService, DATABASE_URL } from './helpers.mjs';
import { hashPassword } from '../src/security.mjs';
import { loadConfig } from '../src/config.mjs';
import { createMailer } from '../src/mailer.mjs';
import { protectedCredentialsPath, provisionPrivateVisitor } from '../src/private-demo-visitor.mjs';

const password = 'Private-fixture-password-2026';
const secret = 'private-commerce-check-fixture-' + 'x'.repeat(32);
const privateEnv = { ADS_ENV: 'demo', DEMO_MODE: '1', DEMO_ACCESS_ENABLED: '0', DEMO_ACCESS_PRIVATE_ENABLED: '1', DEMO_ACCESS_CHECK_SECRET_COMMERCE: secret };
const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const clientId = 'commerce-web', redirect = 'https://commerce.demo.africadigitalsynergy.com/';

describe('private Demo Access configuration', () => {
  const config = env => loadConfig({ IDENTITY_PUBLIC_URL: 'http://127.0.0.1:18084', IDENTITY_DEV_MODE: '1', DATABASE_URL, MAIL_TRANSPORT: 'log', ...env });
  it('requires demo mode, exclusive private mode, hidden credentials and a server check secret', () => {
    for (const env of [
      { ...privateEnv, ADS_ENV: 'production', DEMO_MODE: '0' },
      { ...privateEnv, ADS_ENV: 'staging' }, { ...privateEnv, DEMO_MODE: '0' },
      { ...privateEnv, DEMO_ACCESS_ENABLED: '1' }, { ...privateEnv, DEMO_ACCESS_CHECK_SECRET_COMMERCE: '' },
    ]) assert.throws(() => config(env));
    const c = config(privateEnv);
    assert.equal(c.demoAccess.enabled, true); assert.equal(c.demoAccess.privateEnabled, true); assert.equal(c.demoAccess.publicEnabled, false);
    assert.deepEqual(c.demoAccess.adminEmails, []); assert.deepEqual(c.demoAccess.notifyTo, []);
    assert.equal(c.mail.transport, 'log');
  });
  it('suppresses even direct legacy mail and log transports in private mode', async () => {
    const logged = [];
    const mailer = createMailer(config(privateEnv), { info: message => logged.push(message) });
    await assert.rejects(mailer.send({ to: 'private@example.test', text: 'sensitive-invitation-token' }), /PRIVATE_MODE_EMAIL_DISABLED/);
    assert.deepEqual(logged, []); assert.deepEqual(mailer.outbox, []);
  });
});

describe('private visitor uses canonical ADS identity and grant activation', () => {
  let svc, first, second;
  before(async () => {
    svc = await startService({ env: privateEnv });
    await svc.pool.query(`INSERT INTO platform.oauth_clients(client_id,display_name,redirect_uris,post_logout_redirect_uris,self_service_roles,allow_personal_workspace,admin_roles,assignable_roles)
      VALUES ($1,'Commerce',$2,$2,'{commerce_buyer}',true,'{merchant_owner}',$3)`,
    [clientId, [redirect], ['merchant_owner','commerce_manager','commerce_cashier','commerce_accountant','bank_officer','bank_agent']]);
  });
  after(async () => { await svc?.stop(); });
  const provision = async email => svc.app.demoAccess.provisionPrivate({ email, passwordHash: await hashPassword(password), operatorRef: 'test-operator-ADS', locale: 'fr' });
  const check = async (sub, credential = secret) => {
    const r = await fetch(`${svc.base}/demo-access/v1/grants/check?platform=commerce&sub=${sub}`, { headers: { authorization: `Bearer ${credential}` } });
    return { status: r.status, body: await r.json() };
  };
  const login = async (b, email, pw = password) => {
    const page = await b.get('/login');
    return b.post('/login', { csrf: csrfFrom(page.text), email, password: pw });
  };
  const token = async (b, tenant, loginEmail) => {
    const { verifier, challenge } = pkce();
    let r = await b.get(`/authorize?${new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirect, state: 'state', code_challenge: challenge, code_challenge_method: 'S256', ...(tenant ? { tenant_hint: tenant } : {}) })}`);
    if (loginEmail && r.location?.startsWith('/login')) {
      const req = new URL(r.location, svc.base).searchParams.get('req');
      const page = await b.get(r.location);
      r = await b.post('/login', { csrf: csrfFrom(page.text), req, email: loginEmail, password });
    }
    assert.ok(r.location?.startsWith(redirect), 'existing SSO must not ask for a password to change workspace');
    const res = await fetch(`${svc.base}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: new URL(r.location).searchParams.get('code'), client_id: clientId, redirect_uri: redirect, code_verifier: verifier }) });
    assert.equal(res.status, 200);
    const body = await res.json();
    return { body, claims: JSON.parse(Buffer.from(body.access_token.split('.')[1], 'base64url')) };
  };
  const deniedAuthorization = b => b.get(`/authorize?${new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirect, state: 'denied', code_challenge: 'x'.repeat(43), code_challenge_method: 'S256' })}`);

  it('keeps public request/admin/register/reset endpoints disabled and produces zero emails', async () => {
    for (const url of ['/demo-access/v1/requests','/demo-admin','/demo-admin/audit','/register','/forgot-password','/v1/identity/register','/demo-access/v1/provision']) {
      for (const method of ['GET','POST']) {
        const r = await fetch(svc.base + url, { method, ...(method === 'POST' ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'blocked@example.test', password }) } : {}) });
        assert.equal(r.status, 404, `${method} ${url}`);
      }
    }
    const page = await browser(svc.base).get('/login?lang=fr');
    assert.doesNotMatch(page.text, /href="\/(register|forgot-password)/);
    assert.equal(await svc.app.demoAccess.processOutbox(), 0);
    const queued = crypto.randomUUID();
    await svc.pool.query("INSERT INTO platform.demo_outbox(id,kind,recipient,subject,text_body,html_body,dedupe_key) VALUES ($1::uuid,'test','queued@example.test','Test','Do not deliver','Test',$2)", [queued, queued]);
    assert.equal(await svc.app.demoAccess.processOutbox(), 0);
    assert.equal((await svc.pool.query('SELECT status FROM platform.demo_outbox WHERE id=$1', [queued])).rows[0].status, 'queued');
    await svc.pool.query('DELETE FROM platform.demo_outbox WHERE id=$1', [queued]);
    await assert.rejects(svc.app.accounts.googleUser({ subject: 'unregistered-private-google', email: 'new-google@example.test', emailVerified: true, name: 'Unregistered' }), /PRIVATE_REGISTRATION_DISABLED/);
    assert.equal(svc.mailer.outbox.length, 0);
    assert.equal((await check(crypto.randomUUID(), 'incorrect')).status, 401);
  });

  it('creates an ordinary account with unverified mailbox, seven personas and exactly thirty days', async () => {
    first = await provision('private.one@example.test');
    const row = (await svc.pool.query('SELECT * FROM platform.users WHERE id=$1', [first.userId])).rows[0];
    assert.equal(row.is_demo, false); assert.equal(row.email_verified_at, null); assert.equal(row.status, 'active');
    assert.notEqual(row.password_hash, password);
    const grant = (await svc.pool.query('SELECT *, expires_at-activated_at AS duration FROM platform.demo_access_grants WHERE id=$1', [first.grantId])).rows[0];
    assert.equal(grant.duration.days, 30); assert.equal(grant.invitation_id, null);
    const { body } = await check(first.userId);
    assert.equal(body.access, 'granted'); assert.equal(body.personas.length, 7);
    assert.deepEqual(body.personas.map(p => p.key).sort(), ['shopper','shop-owner','shop-manager','cashier','accountant','bank-agent','bank-officer'].sort());
    assert.ok(body.personas.every(p => !p.roles.some(r => ['commerce_reviewer','commerce_support'].includes(r))));
    const orgs = (await svc.pool.query('SELECT o.is_demo,o.is_staff,m.role FROM platform.memberships m JOIN platform.tenants t ON t.id=m.tenant_id JOIN platform.organizations o ON o.id=t.organization_id WHERE m.user_id=$1 AND o.kind=\'organization\'', [first.userId])).rows;
    assert.equal(orgs.length, 2); assert.ok(orgs.every(o => o.is_demo && !o.is_staff && o.role === 'member'));
    assert.equal((await svc.pool.query('SELECT count(*)::int AS n FROM platform.demo_outbox')).rows[0].n, 0);
    assert.equal(svc.mailer.outbox.length, 0);
  });

  it('grants the same seven personas as a public visitor (one shared registry list, internal personas refused)', async () => {
    const registry = svc.app.demoAccess.platformOf('commerce');
    assert.deepEqual(registry.personas.map(p => p.key), ['shopper', 'shop-owner', 'shop-manager', 'cashier', 'accountant', 'bank-agent', 'bank-officer']);
    const visitor = await provision('private.extended@example.test');
    assert.deepEqual((await check(visitor.userId)).body.personas.map(p => p.key), registry.personas.map(p => p.key));
    const assigned = (await svc.pool.query(
      'SELECT roles FROM platform.product_roles WHERE user_id=$1 AND client_id=$2', [visitor.userId, clientId],
    )).rows.flatMap(row => row.roles);
    assert.ok(!assigned.includes('commerce_investor') && !assigned.includes('commerce_auditor'), 'internal demo persona roles are never assigned to a visitor');
    assert.ok(assigned.includes('merchant_owner') && assigned.includes('bank_officer'));
  });

  it('uses normal failed-password handling and SSO across personal/shop/bank without admin authority', async () => {
    const b = browser(svc.base);
    assert.equal((await login(b, first.email, 'incorrect')).status, 400);
    const personas = (await check(first.userId)).body.personas;
    const initial = await token(b, undefined, first.email);
    assert.equal(initial.claims.tenant_id, personas.find(p => p.org === 'personal').tenantId, 'initial product login bypasses generic workspace chooser');
    for (const org of ['personal','main','bank']) {
      const persona = personas.find(p => p.org === org);
      const result = await token(b, persona.tenantId);
      assert.equal(result.claims.sub, first.userId); assert.equal(result.claims.email_verified, false);
      assert.equal(result.claims.tenant_id, persona.tenantId);
      if (org === 'personal') assert.deepEqual(result.claims.roles, ['commerce_buyer']);
      if (org === 'bank') assert.deepEqual([...result.claims.roles].sort(), ['bank_agent','bank_officer']);
    }
    assert.deepEqual(await svc.app.admin.adminWorkspaces(first.userId), []);
    assert.equal(await svc.app.demoAccess.adminOf({ user: { id: first.userId } }), null);
    assert.equal(svc.mailer.outbox.length, 0);
  });

  it('never overwrites a user or live grant and creates disjoint visitor workspaces', async () => {
    await assert.rejects(provision(first.email), /PRIVATE_VISITOR_ACCOUNT_EXISTS/);
    second = await provision('private.two@example.test');
    const a = (await check(first.userId)).body.personas.map(p => p.tenantId);
    const b = (await check(second.userId)).body.personas.map(p => p.tenantId);
    assert.ok(a.every(id => !b.includes(id)));
    assert.equal((await svc.pool.query('SELECT count(*)::int AS n FROM platform.users WHERE email=$1', [first.email])).rows[0].n, 1);
    await assert.rejects(svc.app.demoAccess.provisionPrivate({ email: 'rollback@example.test', passwordHash: await hashPassword(password), operatorRef: 'test-operator', beforeCommit() { throw new Error('CREDENTIAL_WRITE_FAILED'); } }), /CREDENTIAL_WRITE_FAILED/);
    assert.equal((await svc.pool.query("SELECT count(*)::int AS n FROM platform.users WHERE email='rollback@example.test'")).rows[0].n, 0);
  });

  it('revokes privately provisioned grants and expires them without deleting accounts or data', async () => {
    const b = browser(svc.base); await login(b, second.email);
    const p = (await check(second.userId)).body.personas.find(p => p.org === 'main');
    const tokens = (await token(b, p.tenantId)).body;
    assert.equal((await svc.app.demoAccess.revokePrivate({ grantId: second.grantId, operatorRef: 'test-operator' })).status, 'revoked');
    assert.equal((await check(second.userId)).body.reason, 'REVOKED');
    assert.equal((await deniedAuthorization(b)).status, 403, 'revoked visitor cannot receive a new product code');
    const renewal = await fetch(`${svc.base}/token`, { method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: clientId }) });
    assert.equal(renewal.status, 400);
    assert.equal((await svc.app.demoAccess.revokePrivate({ grantId: second.grantId, operatorRef: 'test-operator' })).duplicate, true);
    const expiredBrowser = browser(svc.base); await login(expiredBrowser, first.email);
    const stillActive = await svc.app.demoAccess.checkGrant('commerce', first.userId);
    const beforeExpiryTokens = (await token(expiredBrowser, stillActive.personas.find(p => p.org === 'main').tenantId)).body;
    const { verifier, challenge } = pkce();
    const pendingCode = await expiredBrowser.get(`/authorize?${new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirect, state: 'stale-code', code_challenge: challenge, code_challenge_method: 'S256' })}`);
    assert.ok(pendingCode.location?.startsWith(redirect));
    const oldCode = new URL(pendingCode.location).searchParams.get('code');
    await svc.pool.query("UPDATE platform.demo_access_grants SET expires_at=now()-interval '1 second' WHERE id=$1", [first.grantId]);
    assert.equal((await check(first.userId)).body.reason, 'EXPIRED');
    assert.equal((await deniedAuthorization(expiredBrowser)).status, 403, 'expired visitor cannot fall back to personal buyer scope');
    const expiredRefresh = await fetch(`${svc.base}/token`, { method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: beforeExpiryTokens.refresh_token, client_id: clientId }) });
    assert.equal(expiredRefresh.status, 400, 'clock expiry blocks refresh before housekeeping');
    const expiredCode = await fetch(`${svc.base}/token`, { method: 'POST', body: new URLSearchParams({ grant_type: 'authorization_code', code: oldCode, code_verifier: verifier, client_id: clientId, redirect_uri: redirect }) });
    assert.equal(expiredCode.status, 400, 'clock expiry blocks a correctly proved pre-issued code before housekeeping');
    assert.equal((await svc.pool.query("SELECT count(*)::int AS n FROM platform.identity_audit WHERE event_type='token' AND user_id=$1 AND reason='access_removed'", [first.userId])).rows[0].n, 1, 'stale code reached the token issuance grant check');
    await svc.app.demoAccess.housekeeping();
    assert.equal((await svc.pool.query('SELECT status FROM platform.users WHERE id=$1', [first.userId])).rows[0].status, 'active');
    assert.equal((await svc.pool.query('SELECT count(*)::int AS n FROM platform.demo_access_grants WHERE id=ANY($1::uuid[])', [[first.grantId, second.grantId]])).rows[0].n, 2);
  });

  it('requires explicit operator apply and never exposes a password on CLI stdout', async () => {
    await assert.rejects(provisionPrivateVisitor({ pool: svc.pool, config: svc.config, email: 'no-apply@example.test', operatorRef: 'test-operator', credentialsOut: '/tmp/not-written' }), /EXPLICIT_APPLY/);
    if (process.platform === 'win32') {
      await assert.rejects(protectedCredentialsPath(path.resolve('private.json')), /POSIX_SECRET_STORAGE/);
      return;
    }
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ads-private-'));
    const output = path.join(dir, 'credential.json');
    try {
      const env = { ...process.env, ...privateEnv, DATABASE_URL, IDENTITY_PUBLIC_URL: svc.base, IDENTITY_DEV_MODE: '1', MAIL_TRANSPORT: 'log' };
      const args = [cli, 'demo-visitor-provision', '--email', 'private.cli@example.test', '--operator-ref', 'test-operator', '--credentials-out', output, '--apply', 'yes'];
      const result = spawnSync(process.execPath, args, { encoding: 'utf8', env });
      assert.equal(result.status, 0, result.stderr);
      const credentials = JSON.parse(await readFile(output, 'utf8'));
      assert.ok(credentials.password.length >= 40); assert.equal((await stat(output)).mode & 0o777, 0o600);
      assert.ok(!result.stdout.includes(credentials.password) && !result.stderr.includes(credentials.password));
      const rerun = spawnSync(process.execPath, args, { encoding: 'utf8', env });
      assert.notEqual(rerun.status, 0); assert.equal((JSON.parse(await readFile(output, 'utf8'))).password, credentials.password);
      assert.equal((await login(browser(svc.base), credentials.email, credentials.password)).status, 200);
      const collisionOut = path.join(dir, 'collision.json');
      const collisionArgs = args.map(value => value === output ? collisionOut : value);
      assert.notEqual(spawnSync(process.execPath, collisionArgs, { encoding: 'utf8', env }).status, 0);
      await assert.rejects(stat(collisionOut), { code: 'ENOENT' }, 'refused account collision removes only the empty reserved output');
      const target = path.join(dir, 'retained.txt'), link = path.join(dir, 'symlink.json');
      await writeFile(target, 'retained test fixture'); await symlink(target, link);
      const linkArgs = args.map(value => value === output ? link : value);
      assert.notEqual(spawnSync(process.execPath, linkArgs, { encoding: 'utf8', env }).status, 0);
      assert.equal(await readFile(target, 'utf8'), 'retained test fixture');
      await chmod(dir, 0o755);
      await assert.rejects(protectedCredentialsPath(path.join(dir, 'insecure.json')), /OWNER_ONLY/);
      await chmod(dir, 0o700);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertAccessDenied, assertNoAccessPage, browser, createActiveUser, csrfFrom, pkce, startService, withDeniedRedirect } from './helpers.mjs';
import { hashPassword } from '../src/security.mjs';
import { PRIVATE_VISITOR_PLATFORMS } from '../src/demo-access.mjs';

// VentureWorks private operator provisioning (owner assignment 11 Nov 2026), following Fleet Guard.
// Registry key, client and product slug: `ventureworks` / `ventureworks-web` / `ventureworks`; host ventureworks.demo.
const secrets = { ventureworks: 'ventureworks-private-fixture-' + 'v'.repeat(40), commerce: 'commerce-private-fixture-' + 'c'.repeat(40) };
const password = 'Venture-private-fixture-2026';
const clients = JSON.parse(readFileSync(new URL('../../../config/clients.demo.json', import.meta.url))).products;
const REDIRECT = 'https://ventureworks.demo.africadigitalsynergy.com/';
const EXPECTED = [
  { key: 'founder', org: 'main', roles: ['founder'] },
  { key: 'venture-manager', org: 'main', roles: ['venture_manager'] },
  { key: 'contributor', org: 'main', roles: ['contributor'] },
  { key: 'evidence-reviewer', org: 'main', roles: ['evidence_reviewer'] },
  { key: 'regulatory-reviewer', org: 'main', roles: ['regulatory_reviewer'] },
];
const NOT_OFFERED = ['tenant_admin', 'adviser', 'investor', 'partner', 'employee', 'ads_support'];
const claimsOf = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));

describe('VentureWorks private operator visitors', () => {
  let svc;
  before(async () => {
    svc = await startService({ env: { ADS_ENV: 'demo', DEMO_MODE: '1', DEMO_ACCESS_ENABLED: '0', DEMO_ACCESS_PRIVATE_ENABLED: '1',
      DEMO_ACCESS_CHECK_SECRET_COMMERCE: secrets.commerce, DEMO_ACCESS_CHECK_SECRET_VENTUREWORKS: secrets.ventureworks } });
    for (const id of ['ventureworks-web', 'commerce-web']) {
      const c = clients.find(x => x.client_id === id);
      await svc.pool.query(`INSERT INTO platform.oauth_clients(client_id,display_name,redirect_uris,post_logout_redirect_uris,self_service_roles,allow_personal_workspace,admin_roles,assignable_roles,admin_scopes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [c.client_id, c.display_name, c.redirect_uris, c.post_logout_redirect_uris, c.self_service_roles, c.allow_personal_workspace, c.admin_roles ?? [], c.assignable_roles ?? [], c.admin_scopes ?? []]);
    }
  });
  after(async () => { await svc?.stop(); });

  const provision = async (email, platform = 'ventureworks') =>
    svc.app.demoAccess.provisionPrivate({ platform, email, passwordHash: await hashPassword(password), operatorRef: 'ventureworks-private-test' });
  const signIn = async email => {
    const b = browser(svc.base), page = await b.get('/login');
    await b.post('/login', { csrf: csrfFrom(page.text), email, password });
    return b;
  };
  async function code(b, tenant) {
    const proof = pkce();
    const r = await b.get(`/authorize?${new URLSearchParams({ response_type: 'code', client_id: 'ventureworks-web', redirect_uri: REDIRECT, state: 'vw-private',
      code_challenge: proof.challenge, code_challenge_method: 'S256', ...(tenant ? { tenant_hint: tenant } : {}) })}`);
    return { r, proof };
  }
  const exchange = pending => fetch(`${svc.base}/token`, { method: 'POST', body: new URLSearchParams({ grant_type: 'authorization_code', client_id: 'ventureworks-web',
    redirect_uri: REDIRECT, code: new URL(pending.r.location).searchParams.get('code'), code_verifier: pending.proof.verifier }) });
  const refresh = token => fetch(`${svc.base}/token`, { method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: token, client_id: 'ventureworks-web' }) });
  const httpCheck = async (sub, bearer, platform = 'ventureworks') => {
    const r = await fetch(`${svc.base}/demo-access/v1/grants/check?${new URLSearchParams({ platform, sub })}`, { headers: bearer ? { authorization: `Bearer ${bearer}` } : {} });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  it('is an explicit private platform fed by DEMO_ACCESS_CHECK_SECRET_VENTUREWORKS', () => {
    assert.ok(PRIVATE_VISITOR_PLATFORMS.has('ventureworks'));
    assert.equal(svc.config.demoAccess.checkSecrets.ventureworks, secrets.ventureworks);
  });

  it('provisions isolated single-organisation visitors with exactly the five registry personas', async () => {
    const one = await provision('vw.one@example.test'), two = await provision('vw.two@example.test');
    assert.equal(one.platform, 'ventureworks');
    assert.deepEqual(one.personas, EXPECTED.map(p => p.key));
    const a = await svc.app.demoAccess.checkGrant('ventureworks', one.userId), b = await svc.app.demoAccess.checkGrant('ventureworks', two.userId);
    assert.equal(a.access, 'granted');
    assert.deepEqual(a.personas.map(({ key, org, roles }) => ({ key, org, roles })), EXPECTED);
    assert.equal(new Set(a.personas.map(p => p.tenantId)).size, 1, 'one visitor main organisation');
    assert.notEqual(a.personas[0].tenantId, b.personas[0].tenantId, 'two visitors never share a venture studio');
    const org = (await svc.pool.query(`SELECT o.demo_key, o.is_demo, o.is_staff FROM platform.tenants t JOIN platform.organizations o ON o.id=t.organization_id WHERE t.id=$1`, [a.personas[0].tenantId])).rows[0];
    assert.match(org.demo_key, /^visit-[0-9a-f]{12}\/ventureworks:main$/);
    assert.equal(org.is_demo, true); assert.equal(org.is_staff, false);
    assert.equal((await svc.pool.query("SELECT count(*)::int AS n FROM platform.memberships m JOIN platform.tenants t ON t.id=m.tenant_id JOIN platform.organizations o ON o.id=t.organization_id WHERE m.user_id=$1 AND (o.kind='personal' OR o.is_staff)", [one.userId])).rows[0].n, 0);
    assert.deepEqual(await svc.app.admin.adminWorkspaces(one.userId), [], 'no Identity administration for a visitor');
    for (const p of a.personas) for (const r of NOT_OFFERED) assert.ok(!p.roles.includes(r), `${p.key} must not hold ${r}`);
  });

  it('refuses an existing account unchanged and never resets it', async () => {
    await createActiveUser(svc.pool, 'vw.existing@example.test', 'Existing-account-2026');
    const before = (await svc.pool.query("SELECT password_hash, status FROM platform.users WHERE email='vw.existing@example.test'")).rows[0];
    await assert.rejects(provision('vw.existing@example.test'), /PRIVATE_VISITOR_ACCOUNT_EXISTS/);
    assert.deepEqual((await svc.pool.query("SELECT password_hash, status FROM platform.users WHERE email='vw.existing@example.test'")).rows[0], before);
    assert.equal((await svc.pool.query("SELECT count(*)::int AS n FROM platform.demo_access_grants WHERE email='vw.existing@example.test'")).rows[0].n, 0);
    await provision('vw.twice@example.test');
    await assert.rejects(provision('vw.twice@example.test'), /PRIVATE_VISITOR_ACCOUNT_EXISTS/);
  });

  it('keeps public VentureWorks requests refused in private mode', async () => {
    for (const method of ['GET', 'POST']) {
      const r = await fetch(`${svc.base}/demo-access/v1/requests`, { method, ...(method === 'POST' ? { headers: { 'content-type': 'application/json', origin: 'https://ventureworks.demo.africadigitalsynergy.com' },
        body: JSON.stringify({ platform: 'ventureworks', email: 'vw.public@example.test', locale: 'en' }) } : {}) });
      assert.equal(r.status, 404, `${method} public request`);
    }
    await assert.rejects(svc.app.demoAccess.submitRequest({ platform: 'ventureworks', email: 'vw.public@example.test', locale: 'en' }), /NOT_FOUND/);
    assert.equal((await svc.pool.query("SELECT count(*)::int AS n FROM platform.demo_access_requests WHERE email='vw.public@example.test'")).rows[0].n, 0);
    assert.equal(svc.mailer.outbox.length, 0, 'private mode sends no mail');
  });

  it('grant check is secret-authenticated per platform and fails closed', async () => {
    const v = await provision('vw.check@example.test');
    assert.equal((await httpCheck(v.userId, secrets.ventureworks)).body.access, 'granted');
    assert.equal((await httpCheck(v.userId)).status, 401, 'no secret');
    assert.equal((await httpCheck(v.userId, secrets.commerce)).status, 401, 'Commerce secret cannot read VentureWorks grants');
    assert.equal((await httpCheck(v.userId, secrets.ventureworks, 'commerce')).status, 401, 'VentureWorks secret cannot read Commerce grants');
    assert.equal((await httpCheck(v.userId, secrets.commerce, 'commerce')).body.access, 'none', 'no cross-product grant');
  });

  it('SSO enters the own studio with grant-narrowed roles; foreign hints are ignored; expiry closes every path', async () => {
    const v = await provision('vw.sso@example.test'), other = await provision('vw.other@example.test');
    const grant = await svc.app.demoAccess.checkGrant('ventureworks', v.userId), foreign = (await svc.app.demoAccess.checkGrant('ventureworks', other.userId)).personas[0].tenantId;
    const tenant = grant.personas[0].tenantId, expected = [...new Set(EXPECTED.flatMap(p => p.roles))].sort();
    const b = await signIn(v.email);
    const first = await code(b);
    assert.ok(first.r.location?.startsWith(REDIRECT), 'no chooser, no password prompt');
    const res = await exchange(first); assert.equal(res.status, 200);
    const tokens = await res.json(), claims = claimsOf(tokens.access_token);
    assert.equal(claims.tenant_id, tenant); assert.equal(claims.demo, true); assert.equal(claims.email_verified, false);
    assert.deepEqual([...claims.roles].sort(), expected);
    await svc.pool.query("UPDATE platform.product_roles SET roles=array_append(roles,'investor') WHERE user_id=$1 AND tenant_id=$2 AND client_id='ventureworks-web'", [v.userId, tenant]);
    const again = await exchange(await code(b)); assert.equal(again.status, 200);
    assert.deepEqual([...claimsOf((await again.json()).access_token).roles].sort(), expected);
    const r1 = await refresh(tokens.refresh_token); assert.equal(r1.status, 200);
    const rotated = await r1.json();
    assert.deepEqual([...claimsOf(rotated.access_token).roles].sort(), expected);
    const hinted = await exchange(await code(b, foreign)); assert.equal(hinted.status, 200);
    assert.equal(claimsOf((await hinted.json()).access_token).tenant_id, tenant);
    const stale = await code(b);
    await svc.pool.query("UPDATE platform.demo_access_grants SET expires_at=now()-interval '1 second' WHERE id=$1", [v.grantId]);
    assert.equal((await exchange(stale)).status, 400);
    // ventureworks-web opted in (clients.demo.json): access_denied back to VentureWorks, no code.
    const denied = assertAccessDenied((await code(b)).r, REDIRECT, 'vw-private', 'DEMO_ACCESS_EXPIRED');
    assert.equal(denied.searchParams.get('iss'), svc.config.issuer);
    await withDeniedRedirect(svc, [], async () => assertNoAccessPage((await code(b)).r));
    assert.equal((await refresh(rotated.refresh_token)).status, 400);
    assert.equal((await svc.app.demoAccess.checkGrant('ventureworks', v.userId)).reason, 'EXPIRED');
  });

  it('operator revocation closes code, refresh and new authorization', async () => {
    const v = await provision('vw.revoke@example.test');
    const b = await signIn(v.email);
    const res = await exchange(await code(b)); assert.equal(res.status, 200);
    const tokens = await res.json(), pending = await code(b);
    assert.equal((await svc.app.demoAccess.revokePrivate({ grantId: v.grantId, operatorRef: 'ventureworks-private-test' })).status, 'revoked');
    assert.equal((await svc.app.demoAccess.checkGrant('ventureworks', v.userId)).reason, 'REVOKED');
    assert.equal((await exchange(pending)).status, 400);
    assert.equal((await refresh(tokens.refresh_token)).status, 400);
    assertAccessDenied((await code(b)).r, REDIRECT, 'vw-private', 'DEMO_ACCESS_REVOKED');
  });

  it('requires its own strong check secret before creating any account', async () => {
    const previous = svc.config.demoAccess.checkSecrets.ventureworks;
    try {
      svc.config.demoAccess.checkSecrets.ventureworks = 'too-short';
      await assert.rejects(provision('vw.nosecret@example.test'), /PRIVATE_VISITOR_PLATFORM_SECRET_REQUIRED/);
      assert.equal((await svc.pool.query("SELECT count(*)::int AS n FROM platform.users WHERE email='vw.nosecret@example.test'")).rows[0].n, 0);
    } finally { svc.config.demoAccess.checkSecrets.ventureworks = previous; }
  });

  it('keeps Commerce private visitors unchanged alongside VentureWorks', async () => {
    const c = await provision('commerce.next-to-vw@example.test', 'commerce');
    assert.deepEqual(c.personas, ['shopper', 'shop-owner', 'shop-manager', 'cashier', 'accountant', 'bank-agent', 'bank-officer']);
    assert.equal((await svc.app.demoAccess.checkGrant('ventureworks', c.userId)).access, 'none');
    assert.equal((await svc.app.demoAccess.checkGrant('commerce', c.userId)).access, 'granted');
    const denied = assertAccessDenied((await code(await signIn(c.email))).r, REDIRECT, 'vw-private', 'NO_DEMO_ACCESS');
    assert.equal(denied.searchParams.get('iss'), svc.config.issuer);
  });
});

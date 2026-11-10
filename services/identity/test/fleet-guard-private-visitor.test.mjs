import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertAccessDenied, assertNoAccessPage, browser, csrfFrom, pkce, startService, withDeniedRedirect } from './helpers.mjs';
import { hashPassword } from '../src/security.mjs';
import { PRIVATE_VISITOR_PLATFORMS } from '../src/demo-access.mjs';

// Fleet Guard private operator provisioning (owner assignment 7 Nov 2026: "registration alone is not enough").
// Registry key `fleet-guard`, client `fleet-guard-web`, product slug `fleetguard`, host fleetguard.demo.
const secrets = { fleet_guard: 'fleet-guard-private-fixture-' + 'f'.repeat(40), commerce: 'commerce-private-fixture-' + 'c'.repeat(40) };
const password = 'Fleet-private-fixture-2026';
const clients = JSON.parse(readFileSync(new URL('../../../config/clients.demo.json', import.meta.url))).products;
const REDIRECT = 'https://fleetguard.demo.africadigitalsynergy.com/';
const EXPECTED = [
  { key: 'fleet-owner', org: 'main', roles: ['owner_admin'] },
  { key: 'fleet-manager', org: 'main', roles: ['fleet_manager'] },
  { key: 'approver', org: 'main', roles: ['workshop_manager'] },
  { key: 'driver', org: 'main', roles: ['driver'] },
  { key: 'mechanic', org: 'main', roles: ['technician'] },
  { key: 'approver-colleague', org: 'main', roles: ['workshop_manager'] },
];
const claimsOf = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));

describe('Fleet Guard private operator visitors', () => {
  let svc;
  before(async () => {
    svc = await startService({ env: { ADS_ENV: 'demo', DEMO_MODE: '1', DEMO_ACCESS_ENABLED: '0', DEMO_ACCESS_PRIVATE_ENABLED: '1',
      DEMO_ACCESS_CHECK_SECRET_COMMERCE: secrets.commerce, DEMO_ACCESS_CHECK_SECRET_FLEET_GUARD: secrets.fleet_guard } });
    for (const id of ['fleet-guard-web', 'commerce-web']) {
      const c = clients.find(x => x.client_id === id);
      await svc.pool.query(`INSERT INTO platform.oauth_clients(client_id,display_name,redirect_uris,post_logout_redirect_uris,self_service_roles,allow_personal_workspace,admin_roles,assignable_roles,admin_scopes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [c.client_id, c.display_name, c.redirect_uris, c.post_logout_redirect_uris, c.self_service_roles, c.allow_personal_workspace, c.admin_roles ?? [], c.assignable_roles ?? [], c.admin_scopes ?? []]);
    }
  });
  after(async () => { await svc?.stop(); });

  const provision = async (email, platform = 'fleet-guard') =>
    svc.app.demoAccess.provisionPrivate({ platform, email, passwordHash: await hashPassword(password), operatorRef: 'fleet-private-test' });
  const signIn = async email => {
    const b = browser(svc.base), page = await b.get('/login');
    await b.post('/login', { csrf: csrfFrom(page.text), email, password });
    return b;
  };
  async function code(b, tenant) {
    const proof = pkce();
    const r = await b.get(`/authorize?${new URLSearchParams({ response_type: 'code', client_id: 'fleet-guard-web', redirect_uri: REDIRECT, state: 'fleet-private',
      code_challenge: proof.challenge, code_challenge_method: 'S256', ...(tenant ? { tenant_hint: tenant } : {}) })}`);
    return { r, proof };
  }
  const exchange = pending => fetch(`${svc.base}/token`, { method: 'POST', body: new URLSearchParams({ grant_type: 'authorization_code', client_id: 'fleet-guard-web',
    redirect_uri: REDIRECT, code: new URL(pending.r.location).searchParams.get('code'), code_verifier: pending.proof.verifier }) });
  const refresh = token => fetch(`${svc.base}/token`, { method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: token, client_id: 'fleet-guard-web' }) });
  const httpCheck = async (sub, bearer, platform = 'fleet-guard') => {
    const r = await fetch(`${svc.base}/demo-access/v1/grants/check?${new URLSearchParams({ platform, sub })}`, { headers: bearer ? { authorization: `Bearer ${bearer}` } : {} });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  it('is an explicit private platform, keyed by the registry key, not the product slug', () => {
    assert.ok(PRIVATE_VISITOR_PLATFORMS.has('fleet-guard'));
    assert.ok(!PRIVATE_VISITOR_PLATFORMS.has('fleetguard'));
    assert.equal(svc.config.demoAccess.checkSecrets.fleet_guard, secrets.fleet_guard, 'DEMO_ACCESS_CHECK_SECRET_FLEET_GUARD feeds the fleet-guard grant check');
  });

  it('provisions isolated single-organisation visitors with exactly the six registry personas', async () => {
    const one = await provision('fleet.one@example.test'), two = await provision('fleet.two@example.test');
    assert.equal(one.platform, 'fleet-guard');
    assert.deepEqual(one.personas, EXPECTED.map(p => p.key));
    const a = await svc.app.demoAccess.checkGrant('fleet-guard', one.userId), b = await svc.app.demoAccess.checkGrant('fleet-guard', two.userId);
    assert.equal(a.access, 'granted');
    assert.deepEqual(a.personas.map(({ key, org, roles }) => ({ key, org, roles })), EXPECTED);
    assert.equal(new Set(a.personas.map(p => p.tenantId)).size, 1, 'one visitor main organisation');
    assert.notEqual(a.personas[0].tenantId, b.personas[0].tenantId, 'two visitors never share a fleet');
    const org = (await svc.pool.query(`SELECT o.demo_key, o.is_demo, o.is_staff FROM platform.tenants t JOIN platform.organizations o ON o.id=t.organization_id WHERE t.id=$1`, [a.personas[0].tenantId])).rows[0];
    assert.match(org.demo_key, /^visit-[0-9a-f]{12}\/fleetguard:main$/);
    assert.equal(org.is_demo, true); assert.equal(org.is_staff, false);
    // No personal workspace, no staff organisation, no Identity administration (owner_admin is a product role only).
    assert.equal((await svc.pool.query("SELECT count(*)::int AS n FROM platform.memberships m JOIN platform.tenants t ON t.id=m.tenant_id JOIN platform.organizations o ON o.id=t.organization_id WHERE m.user_id=$1 AND (o.kind='personal' OR o.is_staff)", [one.userId])).rows[0].n, 0);
    assert.deepEqual(await svc.app.admin.adminWorkspaces(one.userId), []);
    assert.ok(a.personas.every(p => !p.roles.includes('ads_support')));
    // Existing account and duplicate grant are refused; nothing is reset.
    await assert.rejects(provision('fleet.one@example.test'), /PRIVATE_VISITOR_ACCOUNT_EXISTS/);
  });

  it('grant check is secret-authenticated per platform and fails closed', async () => {
    const v = await provision('fleet.check@example.test');
    assert.equal((await httpCheck(v.userId, secrets.fleet_guard)).body.access, 'granted');
    assert.equal((await httpCheck(v.userId)).status, 401, 'no secret');
    assert.equal((await httpCheck(v.userId, secrets.commerce)).status, 401, 'Commerce secret cannot read Fleet Guard grants');
    assert.equal((await httpCheck(v.userId, secrets.fleet_guard, 'commerce')).status, 401, 'Fleet Guard secret cannot read Commerce grants');
    assert.equal((await httpCheck(v.userId, secrets.commerce, 'commerce')).body.access, 'none', 'no cross-product grant');
  });

  it('SSO enters the own fleet with grant-narrowed roles; foreign hints are ignored; expiry closes every path', async () => {
    const v = await provision('fleet.sso@example.test'), other = await provision('fleet.other@example.test');
    const grant = await svc.app.demoAccess.checkGrant('fleet-guard', v.userId), foreign = (await svc.app.demoAccess.checkGrant('fleet-guard', other.userId)).personas[0].tenantId;
    const tenant = grant.personas[0].tenantId, expected = [...new Set(EXPECTED.flatMap(p => p.roles))].sort();
    const b = await signIn(v.email);
    const first = await code(b);
    assert.ok(first.r.location?.startsWith(REDIRECT), 'no chooser, no password prompt');
    const res = await exchange(first); assert.equal(res.status, 200);
    const tokens = await res.json(), claims = claimsOf(tokens.access_token);
    assert.equal(claims.tenant_id, tenant); assert.equal(claims.demo, true); assert.equal(claims.email_verified, false);
    assert.deepEqual([...claims.roles].sort(), expected);
    // Injected roles outside the grant never reach a token (code or refresh).
    await svc.pool.query("UPDATE platform.product_roles SET roles=array_append(roles,'ads_support') WHERE user_id=$1 AND tenant_id=$2 AND client_id='fleet-guard-web'", [v.userId, tenant]);
    const again = await exchange(await code(b)); assert.equal(again.status, 200);
    assert.deepEqual([...claimsOf((await again.json()).access_token).roles].sort(), expected);
    const r1 = await refresh(tokens.refresh_token); assert.equal(r1.status, 200);
    const rotated = await r1.json();
    assert.deepEqual([...claimsOf(rotated.access_token).roles].sort(), expected);
    // Cross-tenant refusal: another visitor's fleet as hint gives the visitor their own fleet.
    const hinted = await exchange(await code(b, foreign)); assert.equal(hinted.status, 200);
    assert.equal(claimsOf((await hinted.json()).access_token).tenant_id, tenant);
    // Expiry: pre-issued code, new authorization and refresh are refused, account kept.
    const stale = await code(b);
    await svc.pool.query("UPDATE platform.demo_access_grants SET expires_at=now()-interval '1 second' WHERE id=$1", [v.grantId]);
    assert.equal((await exchange(stale)).status, 400);
    assertNoAccessPage((await code(b)).r); // default (flag off): the Identity page, as on main
    await withDeniedRedirect(svc, ['fleet-guard-web'], async () => assertAccessDenied((await code(b)).r, REDIRECT, 'fleet-private', 'DEMO_ACCESS_EXPIRED'));
    assert.equal((await refresh(rotated.refresh_token)).status, 400);
    assert.equal((await svc.app.demoAccess.checkGrant('fleet-guard', v.userId)).reason, 'EXPIRED');
    assert.equal((await svc.pool.query('SELECT count(*)::int AS n FROM platform.users WHERE id=$1', [v.userId])).rows[0].n, 1);
  });

  it('operator revocation closes code, refresh and new authorization', async () => {
    const v = await provision('fleet.revoke@example.test');
    const b = await signIn(v.email);
    const res = await exchange(await code(b)); assert.equal(res.status, 200);
    const tokens = await res.json(), pending = await code(b);
    assert.equal((await svc.app.demoAccess.revokePrivate({ grantId: v.grantId, operatorRef: 'fleet-private-test' })).status, 'revoked');
    assert.equal((await svc.app.demoAccess.revokePrivate({ grantId: v.grantId, operatorRef: 'fleet-private-test' })).duplicate, true);
    assert.equal((await svc.app.demoAccess.checkGrant('fleet-guard', v.userId)).reason, 'REVOKED');
    assert.equal((await exchange(pending)).status, 400);
    assert.equal((await refresh(tokens.refresh_token)).status, 400);
    assertNoAccessPage((await code(b)).r); // default (flag off): the Identity page, as on main
    await withDeniedRedirect(svc, ['fleet-guard-web'], async () => assertAccessDenied((await code(b)).r, REDIRECT, 'fleet-private', 'DEMO_ACCESS_REVOKED'));
  });

  it('requires its own strong check secret before creating any account', async () => {
    const previous = svc.config.demoAccess.checkSecrets.fleet_guard;
    try {
      svc.config.demoAccess.checkSecrets.fleet_guard = 'too-short';
      await assert.rejects(provision('fleet.nosecret@example.test'), /PRIVATE_VISITOR_PLATFORM_SECRET_REQUIRED/);
      assert.equal((await svc.pool.query("SELECT count(*)::int AS n FROM platform.users WHERE email='fleet.nosecret@example.test'")).rows[0].n, 0);
    } finally { svc.config.demoAccess.checkSecrets.fleet_guard = previous; }
  });

  it('keeps Commerce private visitors unchanged alongside Fleet Guard', async () => {
    const c = await provision('commerce.next-to-fleet@example.test', 'commerce');
    assert.equal(c.platform, 'commerce');
    assert.deepEqual(c.personas, ['shopper', 'shop-owner', 'shop-manager', 'cashier', 'accountant', 'bank-agent', 'bank-officer']);
    assert.equal((await svc.app.demoAccess.checkGrant('fleet-guard', c.userId)).access, 'none');
    assert.equal((await svc.app.demoAccess.checkGrant('commerce', c.userId)).access, 'granted');
    assert.equal(svc.mailer.outbox.length, 0, 'private mode sends no mail');
  });
});

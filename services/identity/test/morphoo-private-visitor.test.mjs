// Morphoo private QA access: existing real ADS account, eight bounded visitor personas,
// and no ADS staff escalation. No live credentials or user identifiers appear in tests.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { browser, createActiveUser, csrfFrom, pkce, startService } from './helpers.mjs';
import { PRIVATE_VISITOR_PLATFORMS } from '../src/demo-access.mjs';

const clients = JSON.parse(readFileSync(new URL('../../../config/clients.demo.json', import.meta.url))).products;
const SECRET = 'morphoo-private-qa-fixture-' + 'm'.repeat(40);
const COMMERCE_SECRET = 'commerce-private-qa-fixture-' + 'c'.repeat(40);
const REDIRECT = 'https://morphoo.demo.africadigitalsynergy.com/auth';
const KEYS = ['member', 'mentor', 'ministry-lead', 'pastoral-care', 'church-admin', 'content-steward', 'pastor', 'child-safety-officer'];
const ROLES = ['church_admin', 'member', 'mentor', 'ministry_lead', 'pastoral_care'];
const claimsOf = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));

describe('Morphoo private QA visitor: existing-account assignment', () => {
  let svc;
  before(async () => {
    svc = await startService({ env: {
      ADS_ENV: 'demo', DEMO_MODE: '1',
      DEMO_ACCESS_ENABLED: '0', DEMO_ACCESS_PRIVATE_ENABLED: '1',
      DEMO_ACCESS_CHECK_SECRET_COMMERCE: COMMERCE_SECRET,
      DEMO_ACCESS_CHECK_SECRET_MORPHOO: SECRET,
    } });
    for (const clientId of ['morphoo-web', 'commerce-web']) {
      const c = clients.find(x => x.client_id === clientId);
      await svc.pool.query(`INSERT INTO platform.oauth_clients(client_id,display_name,redirect_uris,post_logout_redirect_uris,self_service_roles,allow_personal_workspace,admin_roles,assignable_roles,admin_scopes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [c.client_id, c.display_name, c.redirect_uris, c.post_logout_redirect_uris, c.self_service_roles, c.allow_personal_workspace, c.admin_roles ?? [], c.assignable_roles ?? [], c.admin_scopes ?? []]);
    }
  });
  after(async () => { await svc?.stop(); });

  const createExisting = async (email, password) => {
    const user = await createActiveUser(svc.pool, email, password);
    // A private QA account can be unverified. Granting access must never forge mailbox verification.
    await svc.pool.query('UPDATE platform.users SET email_verified_at=NULL WHERE id=$1', [user.id]);
    return user;
  };
  const assign = user => svc.app.demoAccess.assignPrivate({
    userId: user.id, email: user.email, platform: 'morphoo',
    operatorRef: 'MOR-QA-approved-change', apply: 'yes',
  });
  const auth = async user => {
    const b = browser(svc.base), login = await b.get('/login');
    await b.post('/login', { csrf: csrfFrom(login.text), email: user.email, password: user.password });
    const proof = pkce();
    const q = new URLSearchParams({
      response_type: 'code', client_id: 'morphoo-web', redirect_uri: REDIRECT,
      state: 'morphoo-qa', code_challenge: proof.challenge, code_challenge_method: 'S256',
    });
    const result = await b.get('/authorize?' + q.toString());
    assert.equal(result.status, 302);
    assert.ok(result.location.startsWith(REDIRECT), 'Morphoo /auth callback is the registered return address');
    const token = await fetch(svc.base + '/token', { method: 'POST', body: new URLSearchParams({
      grant_type: 'authorization_code', client_id: 'morphoo-web', redirect_uri: REDIRECT,
      code: new URL(result.location).searchParams.get('code'), code_verifier: proof.verifier,
    }) });
    assert.equal(token.status, 200, 'OAuth code exchange');
    return token.json();
  };

  it('is explicitly enabled only in the private allowlist with the correct secret', () => {
    assert.ok(PRIVATE_VISITOR_PLATFORMS.has('morphoo'));
    assert.equal(svc.config.demoAccess.checkSecrets.morphoo, SECRET);
    assert.equal(svc.config.demoAccess.privateEnabled, true);
    assert.equal(svc.config.demoAccess.publicEnabled, false);
  });

  it('assigns an existing non-demo account without resetting password or claiming email verification', async () => {
    const user = await createExisting('morphoo.qa.one@example.test', 'Fixture-private-QA-2026');
    const before = (await svc.pool.query('SELECT password_hash, email_verified_at, is_demo FROM platform.users WHERE id=$1', [user.id])).rows[0];
    assert.equal(before.email_verified_at, null);
    assert.equal(before.is_demo, false);
    const grant = await assign(user);
    assert.equal(grant.userId, user.id, 'same Identity account');
    assert.deepEqual(grant.personas, KEYS);
    const after = (await svc.pool.query('SELECT password_hash, email_verified_at, is_demo FROM platform.users WHERE id=$1', [user.id])).rows[0];
    assert.deepEqual(after, before, 'credential and verification state unchanged');
    const check = await svc.app.demoAccess.checkGrant('morphoo', user.id);
    assert.equal(check.access, 'granted');
    assert.deepEqual(check.personas.map(p => p.key), KEYS);
    assert.equal(new Set(check.personas.map(p => p.tenantId)).size, 1, 'one QA demo church');
    assert.ok(check.personas.every(p => p.org === 'main' && p.roles.includes('member')));
    assert.deepEqual([...new Set(check.personas.flatMap(p => p.roles))].sort(), ROLES);
    const tenant = check.personas[0].tenantId;
    const org = (await svc.pool.query(`SELECT o.is_demo, o.is_staff, o.demo_key FROM platform.tenants t
      JOIN platform.organizations o ON o.id=t.organization_id WHERE t.id=$1`, [tenant])).rows[0];
    assert.equal(org.is_demo, true);
    assert.equal(org.is_staff, false);
    assert.match(org.demo_key, /^visit-[a-f0-9]{12}\/morphoo:main$/);
    assert.deepEqual(await svc.app.admin.adminWorkspaces(user.id), [], 'no Identity admin authority');
    assert.equal((await svc.app.demoAccess.checkGrant('commerce', user.id)).access, 'none', 'no cross-platform grant');
    const held = (await svc.pool.query(`SELECT roles FROM platform.product_roles
      WHERE user_id=$1 AND tenant_id=$2 AND client_id='morphoo-web'`, [user.id, tenant])).rows[0].roles;
    assert.deepEqual([...held].sort(), ROLES);
    const tokens = await auth(user);
    const claims = claimsOf(tokens.access_token);
    assert.equal(claims.sub, user.id);
    assert.equal(claims.tenant_id, tenant);
    assert.equal(claims.email_verified, false);
    assert.deepEqual([...claims.roles].sort(), ROLES);
    assert.ok(!claims.roles.some(r => ['super_admin', 'pcc_admin', 'content_steward'].includes(r)), 'no ADS-only roles');
  });

  it('refuses mismatched identity, duplicate grant and unapproved operations', async () => {
    const one = await createExisting('morphoo.qa.two@example.test', 'Fixture-private-QA-2026');
    const other = await createExisting('morphoo.qa.three@example.test', 'Fixture-private-QA-2026');
    await assert.rejects(svc.app.demoAccess.assignPrivate({
      userId: one.id, email: other.email, platform: 'morphoo', operatorRef: 'MOR-QA-approved-change', apply: 'yes',
    }), /PRIVATE_VISITOR_ACCOUNT_NOT_ELIGIBLE/);
    await assert.rejects(svc.app.demoAccess.assignPrivate({
      userId: one.id, email: one.email, platform: 'morphoo', operatorRef: 'MOR-QA-approved-change', apply: 'no',
    }), /PRIVATE_VISITOR_EXPLICIT_APPLY_REQUIRED/);
    await assign(one);
    await assert.rejects(assign(one), /PRIVATE_VISITOR_GRANT_EXISTS/);
    const secondGrant = await assign(other);
    const a = await svc.app.demoAccess.checkGrant('morphoo', one.id);
    const b = await svc.app.demoAccess.checkGrant('morphoo', other.id);
    assert.notEqual(a.personas[0].tenantId, b.personas[0].tenantId, 'isolated churches');
    assert.equal(secondGrant.userId, other.id);
  });

  it('requires Morphoo secret and denies public request/foreign secret', async () => {
    const user = await createExisting('morphoo.qa.four@example.test', 'Fixture-private-QA-2026');
    const old = svc.config.demoAccess.checkSecrets.morphoo;
    try {
      svc.config.demoAccess.checkSecrets.morphoo = 'weak';
      await assert.rejects(assign(user), /PRIVATE_VISITOR_PLATFORM_SECRET_REQUIRED/);
    } finally { svc.config.demoAccess.checkSecrets.morphoo = old; }
    await assign(user);
    const check = async secret => fetch(svc.base + '/demo-access/v1/grants/check?platform=morphoo&sub=' + user.id,
      { headers: secret ? { authorization: 'Bearer ' + secret } : {} });
    assert.equal((await check(SECRET)).status, 200);
    assert.equal((await check(COMMERCE_SECRET)).status, 401);
    assert.equal((await check(null)).status, 401);
    assert.equal((await fetch(svc.base + '/demo-access/v1/requests')).status, 404);
    assert.equal(svc.mailer.outbox.length, 0);
  });

  it('revocation removes this product grant but retains the existing identity account', async () => {
    const user = await createExisting('morphoo.qa.five@example.test', 'Fixture-private-QA-2026');
    const grant = await assign(user);
    assert.equal((await svc.app.demoAccess.revokePrivate({ grantId: grant.grantId, operatorRef: 'MOR-QA-approved-change' })).status, 'revoked');
    assert.equal((await svc.app.demoAccess.checkGrant('morphoo', user.id)).reason, 'REVOKED');
    assert.equal((await svc.pool.query('SELECT count(*)::int AS n FROM platform.users WHERE id=$1', [user.id])).rows[0].n, 1);
    assert.equal((await svc.app.demoAccess.revokePrivate({ grantId: grant.grantId, operatorRef: 'MOR-QA-approved-change' })).duplicate, true);
  });
});

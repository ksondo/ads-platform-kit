import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { loadConfig } from '../src/config.mjs';
import { activate, browser, createActiveUser, csrfFrom, linkFrom, nextMail, registerClient, signInTokens, startService } from './helpers.mjs';

// ACC-03: the self-escalation probe from ACCOUNT_ACCESS_AUDIT.md §1.7.
//   1. register + activate as any customer   2. legacy login, then POST /v1/identity/onboard -> owner
//   3. on /admin grant yourself commerce_reviewer, and operator_admin,ads_support on a staff-only product
//   4. product sign-in returns those roles
const PASSWORD = 'Ndole-et-Plantain-2026';
const base = { IDENTITY_PUBLIC_URL: 'https://login.example.test', DATABASE_URL: 'postgres://x', IDENTITY_COOKIE_SECRET: 'c'.repeat(40) };
const decode = jwt => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));

describe('ACC-03 settings', () => {
  it('defaults to production, with onboard off and strict grants on', () => {
    const c = loadConfig(base);
    assert.equal(c.adsEnv, 'production');
    assert.equal(c.legacyOnboard, false);
    assert.equal(c.strictRoleGrants, true);
  });
  it('refuses to switch the onboard route on in production and demo', () => {
    assert.throws(() => loadConfig({ ...base, IDENTITY_LEGACY_ONBOARD_ENABLED: 'true' }), /IDENTITY_LEGACY_ONBOARD_NOT_ALLOWED_IN_PRODUCTION/);
    assert.throws(() => loadConfig({ ...base, ADS_ENV: 'production', IDENTITY_LEGACY_ONBOARD_ENABLED: '1' }), /NOT_ALLOWED_IN_PRODUCTION/);
    assert.throws(() => loadConfig({ ...base, ADS_ENV: 'demo', IDENTITY_LEGACY_ONBOARD_ENABLED: '1' }), /NOT_ALLOWED_IN_DEMO/);
    assert.equal(loadConfig({ ...base, ADS_ENV: 'staging', IDENTITY_LEGACY_ONBOARD_ENABLED: '1' }).legacyOnboard, true);
  });
  it('refuses to switch strict grants off in production', () => {
    assert.throws(() => loadConfig({ ...base, IDENTITY_STRICT_ROLE_GRANTS: 'false' }), /IDENTITY_STRICT_ROLE_GRANTS_REQUIRED_IN_PRODUCTION/);
    assert.equal(loadConfig({ ...base, ADS_ENV: 'demo' }).strictRoleGrants, true);
    assert.equal(loadConfig({ ...base, ADS_ENV: 'staging' }).strictRoleGrants, false);
    assert.equal(loadConfig({ ...base, IDENTITY_DEV_MODE: 'true', IDENTITY_PUBLIC_URL: 'http://localhost' }).adsEnv, 'development');
  });
  it('rejects unknown environments', () => {
    assert.throws(() => loadConfig({ ...base, ADS_ENV: 'prod' }), /ADS_ENV_INVALID/);
  });
});

async function probe(svc, email) {
  const call = (path, body, token) => fetch(`${svc.base}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
  }).then(async r => ({ status: r.status, body: await r.json() }));
  // 1. register + activate
  assert.equal((await call('/v1/identity/register', { email, password: PASSWORD })).status, 201);
  await activate(browser(svc.base), linkFrom(await nextMail(svc, email), '/verify-email'), PASSWORD);
  // 2. legacy login + onboard
  const login = await call('/v1/identity/login', { email, password: PASSWORD });
  assert.equal(login.status, 200);
  const onboard = await call('/v1/identity/onboard', { organizationName: 'My Own Org' }, login.body.accessToken);
  return { onboard, userId: login.body.user.id };
}

async function selfGrant(svc, email, tenant, product, roles) {
  const b = browser(svc.base);
  const page = await b.get('/login');
  await b.post('/login', { csrf: csrfFrom(page.text), email, password: PASSWORD, next: '/admin' });
  const adminPage = await b.get(`/admin?tenant=${tenant}&product=${product}`);
  const me = (await svc.pool.query('SELECT id FROM platform.users WHERE email=$1', [email])).rows[0].id;
  const r = await b.post('/admin', { csrf: csrfFrom(adminPage.text), tenant, product, lang: 'en', action: 'grant', user_id: me, roles });
  return new URL(r.location, svc.base).searchParams;
}

async function registerProducts(svc) {
  const commerce = await registerClient(svc.pool, { id: 'commerce-web', redirect: 'https://commerce.example.test/', selfRoles: ['commerce_buyer'] });
  await svc.pool.query("UPDATE platform.oauth_clients SET assignable_roles='{merchant_owner,commerce_cashier}' WHERE client_id='commerce-web'");
  const staffOnly = await registerClient(svc.pool, { id: 'logistics-web', redirect: 'https://logistics.example.test/', selfRoles: [], personal: false });
  return { commerce, staffOnly };
}

describe('§1.7 probe before the fix (onboard on, strict grants off: what the audit found)', () => {
  let svc;
  before(async () => { svc = await startService({ env: { IDENTITY_LEGACY_ONBOARD_ENABLED: 'true', IDENTITY_STRICT_ROLE_GRANTS: 'false' } }); });
  after(async () => { await svc.stop(); });

  it('lets a self-registered user become owner and grant themselves staff roles', async () => {
    const { staffOnly } = await registerProducts(svc);
    const { onboard } = await probe(svc, 'probe-before@example.cm');
    assert.equal(onboard.status, 201);
    assert.equal(onboard.body.role, 'owner');
    const done = await selfGrant(svc, 'probe-before@example.cm', onboard.body.tenant.id, 'logistics-web', 'operator_admin,ads_support');
    assert.equal(done.get('done'), 'granted');
    const tokens = await signInTokens(svc, staffOnly, { email: 'probe-before@example.cm', password: PASSWORD });
    assert.deepEqual(decode(tokens.access_token).roles.sort(), ['ads_support', 'operator_admin']);
  });
});

describe('§1.7 probe after the fix (production settings)', () => {
  let svc;
  before(async () => { svc = await startService({ env: { ADS_ENV: 'production' } }); });
  after(async () => { await svc.stop(); });

  it('answers 404 at /v1/identity/onboard and records the refusal', async () => {
    assert.equal(svc.config.strictRoleGrants, true);
    const { onboard, userId } = await probe(svc, 'probe-after@example.cm');
    assert.equal(onboard.status, 404);
    assert.equal(onboard.body.error.code, 'NOT_FOUND');
    const memberships = await svc.pool.query('SELECT 1 FROM platform.memberships WHERE user_id=$1', [userId]);
    assert.equal(memberships.rowCount, 0, 'no organisation was created');
    const audit = await svc.pool.query("SELECT 1 FROM platform.identity_audit WHERE event_type='workspace_onboard' AND outcome='denied' AND reason='ONBOARD_DISABLED'");
    assert.equal(audit.rowCount, 1);
  });

  it('refuses self-grants of non-assignable roles, and any grant on a product with no assignable_roles, even for an owner', async () => {
    const { staffOnly } = await registerProducts(svc);
    // Even an operator-made owner (the only way left to own an organisation) cannot escalate.
    const owner = await createActiveUser(svc.pool, 'owner-probe@example.cm', PASSWORD);
    const tenantId = crypto.randomUUID();
    const orgId = crypto.randomUUID();
    await svc.pool.query("INSERT INTO platform.organizations(id,name,slug) VALUES ($1,'Shop',$2)", [orgId, `shop-${orgId}`]);
    await svc.pool.query("INSERT INTO platform.tenants(id,organization_id,name) VALUES ($1,$2,'Shop')", [tenantId, orgId]);
    await svc.pool.query("INSERT INTO platform.memberships(user_id,tenant_id,role) VALUES ($1,$2,'owner')", [owner.id, tenantId]);

    assert.equal((await selfGrant(svc, owner.email, tenantId, 'commerce-web', 'commerce_reviewer')).get('error'), 'ROLE_NOT_ASSIGNABLE');
    assert.equal((await selfGrant(svc, owner.email, tenantId, 'logistics-web', 'operator_admin,ads_support')).get('error'), 'NO_ASSIGNABLE_ROLES');
    assert.equal((await selfGrant(svc, owner.email, tenantId, 'commerce-web', 'merchant_owner')).get('done'), 'granted', 'listed roles still work');
    const roles = (await svc.pool.query('SELECT client_id, roles FROM platform.product_roles WHERE user_id=$1 ORDER BY client_id', [owner.id])).rows;
    assert.deepEqual(roles, [{ client_id: 'commerce-web', roles: ['merchant_owner'] }]);
    // The staff-only product still gives this account nothing.
    await assert.rejects(signInTokens(svc, staffOnly, { email: owner.email, password: PASSWORD }), /not redirected back/);
  });
});

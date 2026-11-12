// Commerce demo personas: what an approved (public) or privately provisioned visitor gets, and what the
// internal demo accounts get. Owner rule (5 Nov 2026): every visitor, public or private, gets the SAME
// seven personas; investor, auditor and bank-loan-officer are internal demo personas only (ADS staff and
// the shared demo set) and no visitor route yields them: persona switch, invitation, token refresh or a
// role request.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import { loadPlatforms, visitorPersonaKeys } from '../src/demo-access.mjs';
import { validatePersonas } from '../src/demo.mjs';
import { hashPassword } from '../src/security.mjs';
import { DATABASE_URL, browser, createActiveUser, csrfFrom, pkce, refreshWith, signInTokens, startService } from './helpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const configDir = path.resolve(here, '../../../config');
const readConfig = name => JSON.parse(readFileSync(path.join(configDir, name), 'utf8'));
const cli = path.resolve(here, '../src/cli.mjs');
const applyScript = path.resolve(here, '../scripts/apply-clients.mjs');

const SEVEN = ['shopper', 'shop-owner', 'shop-manager', 'cashier', 'accountant', 'bank-agent', 'bank-officer'];
const INTERNAL_ONLY = ['investor', 'auditor', 'bank-loan-officer'];
const INTERNAL_ONLY_ROLES = ['commerce_investor', 'commerce_auditor'];
// The eleven Commerce personas of the internal demo set, each with exactly its intended organisation and roles.
const INTERNAL = {
  shopper: { org: 'personal', roles: ['commerce_buyer'] },
  'shop-owner': { org: 'main', roles: ['merchant_owner'] },
  'shop-manager': { org: 'main', roles: ['commerce_manager'] },
  cashier: { org: 'main', roles: ['commerce_cashier'] },
  accountant: { org: 'main', roles: ['commerce_accountant'] },
  investor: { org: 'main', roles: ['commerce_investor'] },
  auditor: { org: 'main', roles: ['commerce_auditor'] },
  'bank-agent': { org: 'bank', roles: ['bank_agent'] },
  'bank-officer': { org: 'bank', roles: ['bank_officer'] },
  'bank-loan-officer': { org: 'bank', roles: ['bank_officer'] },
  // Commerce #292 (12 Nov 2026): internal demo set only until the owner adds it to the visitors' list.
  processor: { org: 'main', roles: ['commerce_business_buyer'] },
};
// What a visitor's own organisations hold: exactly the roles of the seven personas.
const VISITOR_MAIN_ROLES = ['commerce_accountant', 'commerce_cashier', 'commerce_manager', 'merchant_owner'];
const VISITOR_BANK_ROLES = ['bank_agent', 'bank_officer'];

const PASSWORD = 'Correct-Horse-42';
const ORIGIN = 'https://commerce.demo.africadigitalsynergy.com';
const COMMERCE = { id: 'commerce-web', redirect: 'https://commerce.demo.africadigitalsynergy.com/' };
const SECRET = 'visitor-personas-check-secret-0123456789abcdef';
const ADMIN = 'persona.admin@ads.test';
const ALL_COMMERCE_ROLES = ['merchant_owner', 'commerce_manager', 'commerce_cashier', 'commerce_accountant', 'commerce_investor', 'commerce_auditor', 'bank_officer', 'bank_agent', 'commerce_business_buyer'];
const decode = jwt => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
const sorted = list => [...list].sort();

async function registerCommerce(pool) {
  await pool.query(`INSERT INTO platform.oauth_clients(client_id,display_name,redirect_uris,post_logout_redirect_uris,self_service_roles,allow_personal_workspace,admin_roles,assignable_roles)
    VALUES ($1,'ADS Commerce',$2,$2,'{commerce_buyer}',true,'{merchant_owner}',$3)`, [COMMERCE.id, [COMMERCE.redirect], ALL_COMMERCE_ROLES]);
}
const checkOf = svc => async sub => (await fetch(`${svc.base}/demo-access/v1/grants/check?platform=commerce&sub=${sub}`, { headers: { authorization: `Bearer ${SECRET}` } })).json();
const signIn = async (b, email, password = PASSWORD) => {
  const page = await b.get('/login');
  return b.post('/login', { csrf: csrfFrom(page.text), email, password });
};
// Authorises Commerce in an open ADS session (persona switch: tenant_hint, no password) and exchanges the code.
async function commerceTokens(svc, b, tenantHint) {
  const { verifier, challenge } = pkce();
  const q = new URLSearchParams({ response_type: 'code', client_id: COMMERCE.id, redirect_uri: COMMERCE.redirect, state: 's', code_challenge: challenge, code_challenge_method: 'S256', ...(tenantHint ? { tenant_hint: tenantHint } : {}) });
  const auth = await b.get(`/authorize?${q}`);
  assert.ok(auth.location?.startsWith(COMMERCE.redirect), `persona switch without a password (got ${auth.location})`);
  const res = await fetch(`${svc.base}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: new URL(auth.location).searchParams.get('code'), code_verifier: verifier, client_id: COMMERCE.id, redirect_uri: COMMERCE.redirect }) });
  assert.equal(res.status, 200);
  const body = await res.json();
  return { ...body, claims: decode(body.access_token) };
}
const noInternalRoles = (roles, label) => assert.ok(!roles.some(r => INTERNAL_ONLY_ROLES.includes(r)), `${label}: ${roles.join(',')}`);

describe('Commerce visitor persona registry: one list for public and private visitors', () => {
  it('lists exactly the seven visitor personas, in order, from the single shared source', () => {
    const p = loadPlatforms({}).get('commerce');
    assert.deepEqual(p.personas.map(x => x.key), SEVEN);
    assert.deepEqual(visitorPersonaKeys(p), SEVEN);
    assert.deepEqual(readConfig('demo-access-platforms.json').platforms.find(x => x.key === 'commerce').personas, SEVEN);
  });

  it('marks exactly investor, auditor and bank-loan-officer as internal demo personas', () => {
    const commerce = readConfig('demo-personas.json').products.commerce.personas;
    assert.deepEqual(commerce.filter(x => x.internal_only === true).map(x => x.key), INTERNAL_ONLY);
  });

  it('refuses to load a registry that offers an internal persona to visitors', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'kit-visitor-personas-'));
    try {
      const doc = readConfig('demo-access-platforms.json');
      for (const key of INTERNAL_ONLY) {
        const file = path.join(dir, `${key}.json`);
        writeFileSync(file, JSON.stringify({ ...doc, platforms: doc.platforms.map(x => (x.key === 'commerce' ? { ...x, personas: [...SEVEN, key] } : x)) }));
        assert.throws(() => loadPlatforms({ platformsFile: file }), new RegExp(`DEMO_ACCESS_PERSONA_INTERNAL_ONLY:commerce:${key}`));
      }
      const duplicate = path.join(dir, 'duplicate.json');
      writeFileSync(duplicate, JSON.stringify({ ...doc, platforms: doc.platforms.map(x => (x.key === 'commerce' ? { ...x, personas: [...SEVEN, 'cashier'] } : x)) }));
      assert.throws(() => loadPlatforms({ platformsFile: duplicate }), /DEMO_ACCESS_PERSONA_DUPLICATE:commerce/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('refuses a malformed internal_only marker', () => {
    const doc = readConfig('demo-personas.json');
    const bad = { ...doc, products: { commerce: { personas: doc.products.commerce.personas.map(x => (x.key === 'investor' ? { ...x, internal_only: 'yes' } : x)) } } };
    assert.throws(() => validatePersonas(bad, readConfig('clients.demo.json')), /internal_only must be true or false/);
  });
});

describe('public (administrator-approved) Commerce visitor', () => {
  let svc, adminUser, check;
  const request = body => fetch(`${svc.base}/demo-access/v1/requests`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ platform: 'commerce', locale: 'en', ...body }) });
  const requestRow = async email => (await svc.pool.query('SELECT * FROM platform.demo_access_requests WHERE email=$1 ORDER BY created_at DESC LIMIT 1', [email])).rows[0];
  const grantOf = async requestId => (await svc.pool.query('SELECT * FROM platform.demo_access_grants WHERE request_id=$1', [requestId])).rows[0];
  const inviteLink = email => svc.mailer.outbox.filter(m => m.to === email).at(-1).text.match(/https?:\/\/\S+\/invite\?token=[A-Za-z0-9_-]+/)[0];
  // Request (with a forged persona/role request in the body), approval, then acceptance by a signed-in account.
  async function approvedVisitor(email) {
    assert.equal((await request({ email, personas: INTERNAL_ONLY, roles: INTERNAL_ONLY_ROLES, persona: 'investor' })).status, 202);
    const req = await requestRow(email);
    await svc.app.demoAccess.approve(adminUser, req.id);
    const grant = await grantOf(req.id);
    const account = await createActiveUser(svc.pool, email, PASSWORD);
    const b = browser(svc.base);
    await signIn(b, email);
    const link = inviteLink(email);
    const page = await b.get(link);
    assert.equal((await b.post('/invite/accept', { csrf: csrfFrom(page.text), token: new URL(link).searchParams.get('token') })).status, 200);
    return { req, grant, account, b };
  }

  before(async () => {
    svc = await startService({ env: {
      ADS_ENV: 'demo', DEMO_MODE: '1', DEMO_ACCESS_ENABLED: '1', DEMO_ACCESS_ADMIN_EMAILS: ADMIN, DEMO_ACCESS_NOTIFY_TO: ADMIN,
      DEMO_ACCESS_CHECK_SECRET_COMMERCE: SECRET, DEMO_ACCESS_REQUESTS_PER_IP_HOUR: '100', DEMO_ACCESS_ADMIN_URL: 'https://admin.demo.africadigitalsynergy.com',
    } });
    await registerCommerce(svc.pool);
    adminUser = await createActiveUser(svc.pool, ADMIN, PASSWORD);
    check = checkOf(svc);
  });
  after(async () => { await svc?.stop(); });

  it('grants exactly the seven personas, in order, whatever the request asked for', async () => {
    const { req, grant, account } = await approvedVisitor('public.seven@example.com');
    assert.deepEqual(grant.personas, SEVEN, 'grant row');
    const granted = await check(account.id);
    assert.equal(granted.access, 'granted');
    assert.deepEqual(granted.personas.map(p => p.key), SEVEN, 'grant check (the persona page list)');
    for (const p of granted.personas) {
      const intended = INTERNAL[p.key];
      assert.equal(p.org, intended.org, p.key);
      assert.deepEqual(p.roles, intended.roles, p.key);
      assert.equal(p.tenantId, p.org === 'personal' ? p.tenantId : grant.tenants[p.org], p.key);
    }
    // Invitation route: the emailed invitation carries only the seven personas' shop roles.
    const inv = (await svc.pool.query('SELECT roles FROM platform.invitations WHERE id=$1', [grant.invitation_id])).rows[0];
    assert.deepEqual(sorted(inv.roles), VISITOR_MAIN_ROLES);
    // Assigned roles in the visitor's own organisations: exactly the seven personas' roles.
    const assigned = Object.fromEntries((await svc.pool.query('SELECT tenant_id, roles FROM platform.product_roles WHERE user_id=$1 AND client_id=$2', [account.id, COMMERCE.id])).rows.map(r => [r.tenant_id, sorted(r.roles)]));
    assert.deepEqual(assigned, { [grant.tenants.main]: VISITOR_MAIN_ROLES, [grant.tenants.bank]: VISITOR_BANK_ROLES });
    assert.deepEqual((await svc.app.demoAccess.detail(req.id)).grant.personas.map(p => p.key), SEVEN, 'administrator view');
  });

  it('a resent invitation carries no internal persona role either', async () => {
    const email = 'public.resend@example.com';
    await request({ email });
    const req = await requestRow(email);
    await svc.app.demoAccess.approve(adminUser, req.id);
    await svc.pool.query("UPDATE platform.invitations SET created_at=now()-interval '5 minutes' WHERE id=(SELECT invitation_id FROM platform.demo_access_grants WHERE request_id=$1)", [req.id]);
    await svc.app.demoAccess.resend(adminUser, req.id);
    const grant = await grantOf(req.id);
    assert.deepEqual(grant.personas, SEVEN);
    const inv = (await svc.pool.query('SELECT roles FROM platform.invitations WHERE id=$1', [grant.invitation_id])).rows[0];
    assert.deepEqual(sorted(inv.roles), VISITOR_MAIN_ROLES);
  });

  it('persona switch: every workspace of the grant opens without a password and never carries an internal role', async () => {
    const { grant, account, b } = await approvedVisitor('public.switch@example.com');
    const personas = (await check(account.id)).personas;
    const seen = {};
    for (const p of personas) {
      const t = await commerceTokens(svc, b, p.tenantId);
      assert.equal(t.claims.tenant_id, p.tenantId, p.key);
      assert.ok(p.roles.every(r => t.claims.roles.includes(r)), `${p.key} has its roles`);
      noInternalRoles(t.claims.roles, p.key);
      seen[p.org] = sorted(t.claims.roles);
    }
    assert.deepEqual(seen, { personal: ['commerce_buyer'], main: VISITOR_MAIN_ROLES, bank: VISITOR_BANK_ROLES });
    // A hint to an organisation outside the grant (e.g. the internal demo shop) opens the visitor's own start instead.
    const other = await svc.pool.query("INSERT INTO platform.organizations(id,name,slug,kind,is_demo) VALUES ($1,'Internal demo shop',$2,'organization',true) RETURNING id", [crypto.randomUUID(), `internal-${crypto.randomUUID()}`]);
    const otherTenant = crypto.randomUUID();
    await svc.pool.query('INSERT INTO platform.tenants(id,organization_id,name) VALUES ($1,$2,$3)', [otherTenant, other.rows[0].id, 'Internal demo shop']);
    await svc.pool.query("INSERT INTO platform.memberships(user_id,tenant_id,role,scopes) VALUES ($1,$2,'member','{}')", [account.id, otherTenant]);
    await svc.pool.query('INSERT INTO platform.product_roles(user_id,tenant_id,client_id,roles) VALUES ($1,$2,$3,$4)', [account.id, otherTenant, COMMERCE.id, ['commerce_investor']]);
    const elsewhere = await commerceTokens(svc, b, otherTenant);
    assert.equal(elsewhere.claims.tenant_id, personas.find(p => p.org === 'personal').tenantId);
    noInternalRoles(elsewhere.claims.roles, 'outside the grant');
    assert.ok(!Object.values(grant.tenants).includes(otherTenant));
  });

  it('token refresh: a grant from the older nine-persona list yields no investor or auditor role', async () => {
    const { grant, account, b } = await approvedVisitor('public.legacy@example.com');
    const main = (await check(account.id)).personas.find(p => p.org === 'main').tenantId;
    const first = await commerceTokens(svc, b, main);
    // What a grant approved under the older list held: investor and auditor personas and roles.
    await svc.pool.query("UPDATE platform.demo_access_grants SET personas=personas || '{investor,auditor,bank-loan-officer}' WHERE id=$1", [grant.id]);
    await svc.pool.query("UPDATE platform.product_roles SET roles=roles || '{commerce_investor,commerce_auditor}' WHERE user_id=$1 AND tenant_id=$2", [account.id, main]);
    const listed = (await check(account.id)).personas.map(p => p.key);
    assert.deepEqual(listed, SEVEN, 'the persona page still lists only the seven');
    const refreshed = await refreshWith(svc, COMMERCE.id, first.refresh_token);
    assert.equal(refreshed.status, 200);
    const claims = decode(refreshed.body.access_token);
    assert.equal(claims.tenant_id, main);
    assert.deepEqual(sorted(claims.roles), VISITOR_MAIN_ROLES, 'refresh');
    const again = await refreshWith(svc, COMMERCE.id, refreshed.body.refresh_token);
    assert.deepEqual(sorted(decode(again.body.access_token).roles), VISITOR_MAIN_ROLES, 'second refresh');
    const fresh = await commerceTokens(svc, b, main);
    assert.deepEqual(sorted(fresh.claims.roles), VISITOR_MAIN_ROLES, 'new code exchange');
  });

  it('role request and invitation by the visitor (as shop owner) are refused and change nothing', async () => {
    const { grant, account, b } = await approvedVisitor('public.request@example.com');
    const before = (await svc.pool.query('SELECT tenant_id, roles FROM platform.product_roles WHERE user_id=$1 ORDER BY tenant_id', [account.id])).rows;
    const invitationsBefore = (await svc.pool.query('SELECT count(*)::int AS n FROM platform.invitations')).rows[0].n;
    assert.deepEqual(await svc.app.admin.adminWorkspaces(account.id), [], 'the visitor administers nothing');
    for (const action of [
      { action: 'grant', user_id: account.id, roles: 'commerce_investor' },
      { action: 'grant', user_id: account.id, roles: 'commerce_auditor' },
      { action: 'invite', email: 'friend.investor@example.com', roles: 'commerce_investor' },
      { action: 'invite', email: 'own.second@example.com', roles: 'commerce_auditor' },
    ]) {
      const page = await b.get(`/admin?tenant=${grant.tenants.main}&product=${COMMERCE.id}`);
      const r = await b.post('/admin', { csrf: csrfFrom(page.text), tenant: grant.tenants.main, product: COMMERCE.id, lang: 'en', ...action });
      assert.equal(r.status, 302, action.action);
      assert.match(r.location, /error=FORBIDDEN/, `${action.action} ${action.roles} refused`);
    }
    assert.deepEqual((await svc.pool.query('SELECT tenant_id, roles FROM platform.product_roles WHERE user_id=$1 ORDER BY tenant_id', [account.id])).rows, before);
    assert.equal((await svc.pool.query('SELECT count(*)::int AS n FROM platform.invitations')).rows[0].n, invitationsBefore);
    // A second access request while the grant is live adds nothing.
    assert.equal((await request({ email: account.email, personas: INTERNAL_ONLY })).status, 202);
    assert.equal((await svc.pool.query("SELECT count(*)::int AS n FROM platform.demo_access_grants WHERE email=$1", [account.email])).rows[0].n, 1);
    assert.deepEqual((await check(account.id)).personas.map(p => p.key), SEVEN);
  });
});

describe('private (operator-provisioned) Commerce visitor', () => {
  let svc, check;
  before(async () => {
    svc = await startService({ env: { ADS_ENV: 'demo', DEMO_MODE: '1', DEMO_ACCESS_ENABLED: '0', DEMO_ACCESS_PRIVATE_ENABLED: '1', DEMO_ACCESS_CHECK_SECRET_COMMERCE: SECRET } });
    await registerCommerce(svc.pool);
    check = checkOf(svc);
  });
  after(async () => { await svc?.stop(); });

  it('grants exactly the seven personas, in order: the same list as a public visitor', async () => {
    const visitor = await svc.app.demoAccess.provisionPrivate({ email: 'private.seven@example.test', passwordHash: await hashPassword(PASSWORD), operatorRef: 'test-operator-ADS' });
    assert.deepEqual(visitor.personas, SEVEN);
    assert.deepEqual(visitor.personas, visitorPersonaKeys(loadPlatforms({}).get('commerce')), 'one source with public mode');
    const grant = (await svc.pool.query('SELECT * FROM platform.demo_access_grants WHERE id=$1', [visitor.grantId])).rows[0];
    assert.deepEqual(grant.personas, SEVEN);
    const granted = await check(visitor.userId);
    assert.deepEqual(granted.personas.map(p => p.key), SEVEN);
    for (const p of granted.personas) assert.deepEqual({ org: p.org, roles: p.roles }, INTERNAL[p.key], p.key);
    const assigned = Object.fromEntries((await svc.pool.query('SELECT tenant_id, roles FROM platform.product_roles WHERE user_id=$1', [visitor.userId])).rows.map(r => [r.tenant_id, sorted(r.roles)]));
    assert.deepEqual(assigned, { [grant.tenants.main]: VISITOR_MAIN_ROLES, [grant.tenants.bank]: VISITOR_BANK_ROLES });
    // Persona switch with the private account: no internal role in any workspace.
    const b = browser(svc.base);
    await signIn(b, visitor.email);
    for (const p of granted.personas) noInternalRoles((await commerceTokens(svc, b, p.tenantId)).claims.roles, `private ${p.key}`);
  });
});

describe('internal Commerce demo accounts keep all eleven personas', () => {
  let svc, dir, tenants;
  const hex = () => crypto.randomBytes(6).toString('hex');
  const PW = { user: `Demo-User-${hex()}`, user2: `Demo-Two-${hex()}`, admin: `Demo-Admin-${hex()}`, persona: `Demo-Persona-${hex()}` };
  const DEMO = { ADS_ENV: 'demo', DEMO_MODE: '1', DEMO_USER_PASSWORD: PW.user, DEMO_USER2_PASSWORD: PW.user2, DEMO_ADMIN_PASSWORD: PW.admin, DEMO_PERSONA_PASSWORD: PW.persona };
  const node = (script, args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, DATABASE_URL, ...DEMO }, timeout: 180_000 });
  before(async () => {
    // Public Demo Access on as well (as on the demo host): the visitor rules must not touch internal accounts.
    svc = await startService({ env: { ...DEMO, DEMO_ACCESS_ENABLED: '1', DEMO_ACCESS_ADMIN_EMAILS: ADMIN, DEMO_ACCESS_NOTIFY_TO: ADMIN, DEMO_ACCESS_CHECK_SECRET_COMMERCE: SECRET } });
    dir = mkdtempSync(path.join(os.tmpdir(), 'kit-internal-personas-'));
    for (const [script, args] of [[applyScript, ['--secrets-out', path.join(dir, 'secrets.json')]], [cli, ['demo-bootstrap']], [cli, ['demo-orgs', '--out', path.join(dir, 'tenants.json')]]]) {
      const r = node(script, args);
      assert.equal(r.status, 0, r.stderr);
      for (const p of Object.values(PW)) assert.ok(!(r.stdout + r.stderr).includes(p), 'no password printed');
    }
    tenants = JSON.parse(readFileSync(path.join(dir, 'tenants.json'), 'utf8')).products.commerce;
  });
  after(async () => { await svc?.stop(); rmSync(dir, { recursive: true, force: true }); });

  it('the internal demo set has exactly the eleven Commerce personas (plus the ADS staff reviewer and support)', () => {
    assert.deepEqual(Object.keys(tenants.personas).filter(k => !['reviewer', 'support'].includes(k)), Object.keys(INTERNAL));
    assert.deepEqual(Object.keys(tenants.personas).length, 13);
  });

  for (const [key, intended] of Object.entries(INTERNAL)) {
    it(`${key}: exactly ${intended.org} with ${intended.roles.join(', ')}, nothing extra, also in its token`, async () => {
      const entry = tenants.personas[key];
      assert.ok(entry?.sub, key);
      assert.deepEqual(entry.roles, intended.roles);
      const memberships = (await svc.pool.query(`SELECT m.tenant_id, m.role, o.kind FROM platform.memberships m JOIN platform.tenants t ON t.id=m.tenant_id
        JOIN platform.organizations o ON o.id=t.organization_id WHERE m.user_id=$1 AND m.status='active'`, [entry.sub])).rows;
      assert.equal(memberships.length, 1, 'one workspace');
      assert.equal(memberships[0].tenant_id, entry.tenant_id);
      const grants = (await svc.pool.query('SELECT tenant_id, client_id, roles FROM platform.product_roles WHERE user_id=$1', [entry.sub])).rows;
      if (intended.org === 'personal') {
        assert.equal(memberships[0].kind, 'personal');
        assert.deepEqual(grants, []);
      } else {
        assert.equal(entry.tenant_id, tenants.tenants[intended.org]);
        assert.equal(memberships[0].role, 'member');
        assert.deepEqual(grants, [{ tenant_id: entry.tenant_id, client_id: COMMERCE.id, roles: intended.roles }]);
      }
      // The shared demo accounts are internal for Demo Access and keep their roles in their tokens.
      assert.deepEqual(await svc.app.demoAccess.checkGrant('commerce', entry.sub, { recordActivity: false }), { access: 'internal' });
      const claims = decode((await signInTokens(svc, COMMERCE, { email: svc.config.demo.personaEmail('commerce', key), password: PW.persona })).access_token);
      assert.equal(claims.tenant_id, entry.tenant_id);
      assert.deepEqual(claims.roles, intended.roles);
      assert.equal(claims.demo, true);
    });
  }
});

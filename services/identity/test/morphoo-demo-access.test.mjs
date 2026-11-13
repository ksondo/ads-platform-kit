// MOR-9 (Morphoo PR #50, kit side): Morphoo in the Demo Access registry with the six visitor personas named in
// Morphoo's scripts/ops/demo-personas.mjs; content-steward is a visitor persona in the visitor's own main organisation
// (role member; Morphoo gives it the church appointment content_steward); platform-admin is an internal ADS staff
// persona that is never offered to a visitor; each approved visitor gets their own main organisation (demo church).
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadPlatforms, PRIVATE_VISITOR_PLATFORMS } from '../src/demo-access.mjs';
import { validateClientList, validatePersonas } from '../src/demo.mjs';
import { loadConfig } from '../src/config.mjs';
import { browser, createActiveUser, csrfFrom, startService } from './helpers.mjs';

const read = p => JSON.parse(readFileSync(new URL(`../../../config/${p}`, import.meta.url), 'utf8'));
const SIX = ['member', 'mentor', 'ministry-lead', 'pastoral-care', 'church-admin', 'content-steward'];
const HOST = 'https://morphoo.demo.africadigitalsynergy.com';

describe('MOR-9 Morphoo demo access: configuration', () => {
  const clients = read('clients.demo.json');
  const personas = read('demo-personas.json');
  const morphoo = clients.products.find(c => c.client_id === 'morphoo-web');
  const defs = personas.products.morphoo.personas;

  it('registry entry: morphoo-web, demo origin, persona page, the six visitor personas in the main organisation', () => {
    const p = loadPlatforms({}).get('morphoo');
    assert.equal(p.clientId, 'morphoo-web');
    assert.equal(p.slug, 'morphoo');
    assert.equal(p.prefix, 'MOR');
    assert.deepEqual(p.origins, [HOST]);
    assert.equal(p.entryUrl, `${HOST}/demo/personas`);
    assert.deepEqual(p.personas.map(x => x.key), SIX);
    assert.ok(p.personas.every(x => x.org === 'main'), 'every visitor persona is in the visitor\'s own main organisation');
    assert.equal(p.inviteOrg, 'main');
    assert.deepEqual(p.orgs.map(o => o.key), ['main']);
    assert.equal(p.deniedRedirect, false);
  });

  it('content-steward is a visitor persona holding member in main; the main organisation holds member and the other persona roles', () => {
    const steward = defs.find(x => x.key === 'content-steward');
    assert.equal(steward.org, 'main');
    assert.deepEqual(steward.roles, ['member']);
    assert.equal(steward.internal_only, undefined);
    const main = morphoo.demo_orgs.find(o => o.key === 'main');
    for (const role of ['member', 'mentor', 'ministry_lead', 'pastoral_care', 'church_admin']) assert.ok(main.roles.includes(role), role);
    for (const key of SIX) for (const role of defs.find(x => x.key === key).roles) assert.ok(main.roles.includes(role), `${key}:${role}`);
    assert.ok(!main.roles.some(r => morphoo.ads_only_roles.includes(r)), 'no ADS-only role in the visitor organisation');
  });

  it('each main-organisation persona carries member plus its own role, and nothing more (Morphoo intersects with the token)', () => {
    const own = { member: [], mentor: ['mentor'], 'ministry-lead': ['ministry_lead'], 'pastoral-care': ['pastoral_care'], 'church-admin': ['church_admin'], 'content-steward': [] };
    for (const key of SIX) {
      const def = defs.find(x => x.key === key);
      assert.deepEqual(def.roles, ['member', ...own[key]], key);
      assert.ok(def.roles.every(r => r === 'member' || own[key].includes(r)), `${key} gains no other role`);
    }
    // The registry offers visitors exactly these role lists.
    const registry = loadPlatforms({}).get('morphoo');
    for (const x of registry.personas) assert.deepEqual(x.roles, ['member', ...own[x.key]], `registry ${x.key}`);
    // No main-organisation persona holds an ADS-only role or another persona's job role.
    const jobRoles = Object.values(own).flat();
    for (const def of defs.filter(x => x.org === 'main')) {
      assert.ok(!def.roles.some(r => morphoo.ads_only_roles.includes(r)), def.key);
      assert.equal(def.roles.filter(r => jobRoles.includes(r)).length, own[def.key].length, `${def.key}: one job role at most`);
    }
  });

  it('super_admin and pcc_admin count only in the listed ADS staff organisation: MORPHOO_STAFF_TENANT_IDS is the staff tenant', () => {
    assert.deepEqual(morphoo.tenant_settings, { MORPHOO_STAFF_TENANT_IDS: ['staff'] });
    assert.equal(morphoo.demo_orgs.find(o => o.key === 'staff').staff, true);
    assert.match(morphoo.notes, /MORPHOO_STAFF_TENANT_IDS/);
    assert.doesNotMatch(morphoo.notes, /trusted by name regardless of organisation/);
  });

  it('platform-admin is an internal ADS staff persona (super_admin, pcc_admin) and is never listed for visitors', () => {
    const admin = defs.find(x => x.key === 'platform-admin');
    assert.deepEqual({ org: admin.org, roles: admin.roles, internal_only: admin.internal_only },
      { org: 'staff', roles: ['super_admin', 'pcc_admin'], internal_only: true });
    validatePersonas(personas, validateClientList(clients));
    assert.ok(!read('demo-access-platforms.json').platforms.find(x => x.key === 'morphoo').personas.includes('platform-admin'));
    assert.ok(![...loadPlatforms({}).get('morphoo').personas].some(x => x.key === 'platform-admin'));
  });

  it('refuses a registry that offers platform-admin (internal) or a staff-organisation persona to Morphoo visitors', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'kit-morphoo-registry-'));
    try {
      const doc = read('demo-access-platforms.json');
      const offer = (extra, name) => {
        const file = path.join(dir, `${name}.json`);
        writeFileSync(file, JSON.stringify({ ...doc, platforms: doc.platforms.map(x => (x.key === 'morphoo' ? { ...x, personas: [...SIX, extra] } : x)) }));
        return file;
      };
      assert.throws(() => loadPlatforms({ platformsFile: offer('platform-admin', 'internal') }), /DEMO_ACCESS_PERSONA_INTERNAL_ONLY:morphoo:platform-admin/);
      // Even without the internal marker, a staff-organisation persona with ADS-only roles is refused.
      const unmarked = structuredClone(personas);
      delete unmarked.products.morphoo.personas.find(x => x.key === 'platform-admin').internal_only;
      assert.throws(() => loadPlatforms({ platformsFile: offer('platform-admin', 'unmarked'), personasDoc: unmarked }), /DEMO_ACCESS_PERSONA_NOT_ALLOWED:morphoo:platform-admin/);
      // The previous content-steward (staff organisation, ADS-only content_steward) would be refused as well.
      const old = structuredClone(personas);
      Object.assign(old.products.morphoo.personas.find(x => x.key === 'content-steward'), { org: 'staff', roles: ['content_steward'] });
      assert.throws(() => loadPlatforms({ personasDoc: old }), /DEMO_ACCESS_PERSONA_NOT_ALLOWED:morphoo:content-steward/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('morphoo-web returns to /demo/personas, keeps its other addresses, and keeps the access_denied return off', () => {
    assert.ok(morphoo.redirect_uris.includes(`${HOST}/demo/personas`));
    for (const u of [`${HOST}/`, `${HOST}/auth`, 'https://morphoo.test.africadigitalsynergy.com/', 'https://morphoo.test.africadigitalsynergy.com/auth']) assert.ok(morphoo.redirect_uris.includes(u), u);
    assert.equal(morphoo.demo_access_denied_redirect, false);
  });

  it('reads DEMO_ACCESS_CHECK_SECRET_MORPHOO like the other platforms; private provisioning is not enabled for Morphoo here', () => {
    const env = { IDENTITY_PUBLIC_URL: 'http://127.0.0.1:1', IDENTITY_DEV_MODE: '1', DATABASE_URL: 'postgres://x@127.0.0.1/x', MAIL_TRANSPORT: 'memory' };
    const value = 'morphoo-name-only-fixture-' + 'z'.repeat(32);
    assert.equal(loadConfig({ ...env, DEMO_ACCESS_CHECK_SECRET_MORPHOO: value }).demoAccess.checkSecrets.morphoo, value);
    assert.match(readFileSync(new URL('../../../deploy/contabo-demo/identity.env.example', import.meta.url), 'utf8'), /^# DEMO_ACCESS_CHECK_SECRET_MORPHOO=/m);
    // Deferred (RUNBOOK §E3.3): Morphoo joins PRIVATE_VISITOR_PLATFORMS in its own reviewed Identity change.
    assert.equal(PRIVATE_VISITOR_PLATFORMS.has('morphoo'), false);
  });
});

describe('MOR-9 Morphoo demo access: an approved visitor gets their own demo church (main organisation)', () => {
  const PASSWORD = 'Correct-Horse-42';
  const ADMIN = 'admin.demo@ads.test';
  const SECRET = 'morphoo-check-secret-for-tests-0123456789';
  let svc, adminB;
  const signIn = async (b, email) => { const page = await b.get('/login'); return b.post('/login', { csrf: csrfFrom(page.text), email, password: PASSWORD }); };
  const request = email => fetch(`${svc.base}/demo-access/v1/requests`, { method: 'POST',
    headers: { 'content-type': 'application/json', origin: HOST }, body: JSON.stringify({ platform: 'morphoo', locale: 'en', email }) });
  const approve = async id => { const page = await adminB.get(`/demo-admin/requests/${id}`); return adminB.post(`/demo-admin/requests/${id}`, { csrf: csrfFrom(page.text), action: 'approve', lang: 'en' }); };
  const morphoo = read('clients.demo.json').products.find(c => c.client_id === 'morphoo-web');

  before(async () => {
    svc = await startService({ env: {
      ADS_ENV: 'demo', DEMO_MODE: '1', DEMO_ACCESS_ENABLED: '1', DEMO_ACCESS_ADMIN_EMAILS: ADMIN, DEMO_ACCESS_NOTIFY_TO: 'notify@ads.test',
      DEMO_ACCESS_CHECK_SECRET_MORPHOO: SECRET, DEMO_ACCESS_REQUESTS_PER_IP_HOUR: '100', DEMO_ACCESS_ADMIN_URL: 'https://admin.demo.africadigitalsynergy.com',
    } });
    await svc.pool.query(`INSERT INTO platform.oauth_clients(client_id,display_name,redirect_uris,post_logout_redirect_uris,self_service_roles,allow_personal_workspace,admin_roles,assignable_roles)
      VALUES ('morphoo-web','Morphoo',$1,$2,'{member}',true,'{}',$3)`, [morphoo.redirect_uris, morphoo.post_logout_redirect_uris, morphoo.assignable_roles]);
    await createActiveUser(svc.pool, ADMIN, PASSWORD);
    adminB = browser(svc.base);
    await signIn(adminB, ADMIN);
  });
  after(async () => { await svc?.stop(); });

  it('two approved visitors each get a separate main organisation; the grant lists the six personas there and never platform-admin', async () => {
    const mains = [];
    for (const email of ['morphoo.visitor.one@example.com', 'morphoo.visitor.two@example.com']) {
      const res = await request(email);
      assert.equal(res.status, 202);
      assert.equal(res.headers.get('access-control-allow-origin'), HOST);
      const req = (await svc.pool.query('SELECT * FROM platform.demo_access_requests WHERE email=$1', [email])).rows[0];
      assert.match(req.reference, /^MOR-\d{4}-[A-Z2-9]{6}$/);
      assert.match((await approve(req.id)).location, /done=approved/);
      const grant = (await svc.pool.query('SELECT * FROM platform.demo_access_grants WHERE request_id=$1', [req.id])).rows[0];
      assert.match(grant.demo_set, /^visit-[0-9a-f]{12}$/);
      assert.deepEqual(Object.keys(grant.tenants), ['main'], 'one organisation per visitor: their own demo church');
      assert.deepEqual(grant.personas.map(p => p.key ?? p), SIX);
      const org = (await svc.pool.query('SELECT o.name, o.is_demo, o.is_staff FROM platform.tenants t JOIN platform.organizations o ON o.id=t.organization_id WHERE t.id=$1', [grant.tenants.main])).rows[0];
      assert.equal(org.is_demo, true);
      assert.equal(org.is_staff, false);
      mains.push(grant.tenants.main);
      const invite = svc.mailer.outbox.find(m => m.to === email);
      assert.ok(invite, 'invitation sent');
      assert.match(invite.subject, /Morphoo/);
    }
    assert.notEqual(mains[0], mains[1], 'each visitor has their own main organisation');
  });
});

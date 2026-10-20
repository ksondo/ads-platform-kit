import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import { DATABASE_URL, browser, createActiveUser, csrfFrom, registerClient, signInTokens, startService } from './helpers.mjs';

// DE-04, ACC-04, ACC-06: demo organisations per product, ADS staff organisations and their token claims.
const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, '../src/cli.mjs');
const applyScript = path.resolve(here, '../scripts/apply-clients.mjs');
const doc = JSON.parse(readFileSync(path.resolve(here, '../../../config/clients.demo.json'), 'utf8'));
const bySlug = Object.fromEntries(doc.products.map(p => [p.slug, p]));
const PW = { user: `Demo-User-${crypto.randomBytes(6).toString('hex')}`, user2: `Demo-Two-${crypto.randomBytes(6).toString('hex')}`, admin: `Demo-Admin-${crypto.randomBytes(6).toString('hex')}` };
const DEMO = { ADS_ENV: 'demo', DEMO_MODE: '1', DEMO_USER_PASSWORD: PW.user, DEMO_USER2_PASSWORD: PW.user2, DEMO_ADMIN_PASSWORD: PW.admin };
const node = (script, args, env) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, DATABASE_URL, ...env }, timeout: 120_000 });
const decode = jwt => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
const clientOf = slug => ({ id: bySlug[slug].client_id, redirect: bySlug[slug].redirect_uris[0] });

describe('demo-orgs and demo-reset with the reviewed client list', () => {
  let svc;
  let dir;
  let map;
  const email = key => svc.config.demo.accounts[key].email;
  before(async () => {
    svc = await startService({ env: { ADS_ENV: 'demo', DEMO_MODE: '1' } });
    dir = mkdtempSync(path.join(os.tmpdir(), 'kitdemo-orgs-'));
    const applied = node(applyScript, ['--secrets-out', path.join(dir, 'secrets.json')], {});
    assert.equal(applied.status, 0, applied.stderr);
    const boot = node(cli, ['demo-bootstrap'], DEMO);
    assert.equal(boot.status, 0, boot.stderr);
  });
  after(async () => { await svc.stop(); rmSync(dir, { recursive: true, force: true }); });

  it('demo-orgs is refused before the accounts exist or outside demo mode', () => {
    const off = node(cli, ['demo-orgs', '--out', path.join(dir, 'x.json')], { ADS_ENV: 'staging', DEMO_MODE: '1' });
    assert.equal(off.status, 2);
  });

  it('creates one demo organisation per product plus staff and second-side ones, and writes the tenant map', async () => {
    const out = path.join(dir, 'demo-tenants.json');
    const r = node(cli, ['demo-orgs', '--out', out], DEMO);
    assert.equal(r.status, 0, r.stderr);
    for (const p of Object.values(PW)) assert.ok(!r.stdout.includes(p));
    map = JSON.parse(readFileSync(out, 'utf8')).products;
    assert.deepEqual(Object.keys(map).sort(), doc.products.map(p => p.slug).sort());
    const expected = doc.products.reduce((n, p) => n + p.demo_orgs.length, 0);
    const orgs = (await svc.pool.query('SELECT name, is_demo, is_staff FROM platform.organizations WHERE demo_key IS NOT NULL')).rows;
    assert.equal(orgs.length, expected);
    assert.ok(orgs.every(o => o.is_demo));
    assert.equal(orgs.filter(o => o.is_staff).length, doc.products.reduce((n, p) => n + p.demo_orgs.filter(o => o.staff).length, 0));
    // Settings products need (audit Table B), filled with tenant ids.
    const settings = Object.assign({}, ...Object.values(map).map(e => e.settings));
    for (const s of ['CAREER_STAFF_TENANT_IDS', 'PLFI_SUPPORT_TENANT_ID', 'EDU_PLATFORM_TENANT_ID', 'HEALTH_REVIEW_TENANT_ID', 'HOME_PUBLIC_TENANT_ID',
      'HUB_OPERATOR_TENANT_ID', 'TOUR_PLATFORM_TENANT_ID', 'BANKING_OPERATOR_TENANT_IDS']) {
      assert.match(settings[s] ?? '', /^[0-9a-f-]{36}(,[0-9a-f-]{36})*$/, s);
    }
    assert.equal(map.hub.settings.HUB_OPERATOR_TENANT_ID, map.hub.tenants.staff);
    assert.deepEqual(map.commerce.staff_tenants, [map.commerce.tenants.staff]);
    assert.ok(map['software-factory'].operator_setup[0].includes('register-staff-org'));
    // Running it again keeps the same organisations.
    const again = node(cli, ['demo-orgs', '--out', path.join(dir, 'again.json')], DEMO);
    assert.equal(again.status, 0, again.stderr);
    assert.deepEqual(JSON.parse(readFileSync(path.join(dir, 'again.json'), 'utf8')).products.commerce.tenants, map.commerce.tenants);
  });

  it('gives both demo users every listed role, and the demo admin the admin roles and ownership', async () => {
    const ids = Object.fromEntries((await svc.pool.query('SELECT demo_key, id FROM platform.users WHERE is_demo')).rows.map(r => [r.demo_key, r.id]));
    for (const p of doc.products) {
      for (const o of p.demo_orgs) {
        const t = map[p.slug].tenants[o.key];
        const roles = async u => (await svc.pool.query('SELECT roles FROM platform.product_roles WHERE user_id=$1 AND tenant_id=$2 AND client_id=$3', [u, t, p.client_id])).rows[0]?.roles ?? [];
        assert.deepEqual((await roles(ids.user)).sort(), [...o.roles].sort(), `${p.slug}/${o.key} user`);
        assert.deepEqual((await roles(ids.user2)).sort(), [...o.roles].sort(), `${p.slug}/${o.key} user2`);
        assert.deepEqual((await roles(ids.admin)).sort(), [...p.admin_roles].sort(), `${p.slug}/${o.key} admin`);
        const owner = (await svc.pool.query('SELECT role FROM platform.memberships WHERE user_id=$1 AND tenant_id=$2', [ids.admin, t])).rows[0].role;
        assert.equal(owner, 'owner');
      }
    }
  });

  it('carries the demo and ADS staff claims in product tokens', async () => {
    const staff = await signInTokens(svc, clientOf('commerce'), { email: email('user'), password: PW.user, extra: { tenant_hint: map.commerce.tenants.staff } });
    const s = decode(staff.access_token);
    assert.deepEqual(s.roles.sort(), ['commerce_reviewer', 'commerce_support']);
    assert.equal(s.ads_staff, true);
    assert.equal(s.demo, true);
    const shop = await signInTokens(svc, clientOf('commerce'), { email: email('user2'), password: PW.user2, extra: { tenant_hint: map.commerce.tenants.main } });
    const m = decode(shop.access_token);
    assert.ok(m.roles.includes('commerce_cashier'));
    assert.equal(m.ads_staff, undefined);
    // Staff-only product: the demo user gets in through the demo organisation.
    const tontine = await signInTokens(svc, clientOf('tontine'), { email: email('user'), password: PW.user });
    assert.ok(decode(tontine.access_token).roles.includes('payout_approver'));
    const admin = await signInTokens(svc, clientOf('fleetguard'), { email: email('admin'), password: PW.admin, extra: { tenant_hint: map.fleetguard.tenants.main } });
    assert.deepEqual(decode(admin.access_token).roles, ['owner_admin']);
  });

  it('the public demo user cannot administer organisations; the demo admin can, but cannot deactivate demo accounts', async () => {
    const t = map.tontine.tenants.main;
    const b = browser(svc.base);
    const login = await b.get('/login');
    await b.post('/login', { csrf: csrfFrom(login.text), email: email('user'), password: PW.user, next: '/admin' });
    assert.doesNotMatch((await b.get(`/admin?tenant=${t}&product=tontine-web`)).text, /ADS Demo – Savings Group/);
    const a = browser(svc.base);
    const al = await a.get('/login');
    await a.post('/login', { csrf: csrfFrom(al.text), email: email('admin'), password: PW.admin, next: '/admin' });
    const page = await a.get(`/admin?tenant=${t}&product=tontine-web`);
    assert.match(page.text, /ADS Demo – Savings Group/);
    const user2 = (await svc.pool.query("SELECT id FROM platform.users WHERE demo_key='user2'")).rows[0].id;
    const r = await a.post('/admin', { csrf: csrfFrom(page.text), tenant: t, product: 'tontine-web', lang: 'en', action: 'deactivate', user_id: user2 });
    assert.equal(new URL(r.location, svc.base).searchParams.get('error'), 'DEMO_ACCOUNT_LOCKED');
  });

  it('demo-reset (CLI) restores roles and memberships with the default list', async () => {
    const ids = Object.fromEntries((await svc.pool.query('SELECT demo_key, id FROM platform.users WHERE is_demo')).rows.map(r => [r.demo_key, r.id]));
    await svc.pool.query("UPDATE platform.product_roles SET roles='{member}' WHERE user_id=$1 AND tenant_id=$2", [ids.user, map.tontine.tenants.main]);
    const r = node(cli, ['demo-reset', '--out', path.join(dir, 'reset.json')], DEMO);
    assert.equal(r.status, 0, r.stderr);
    for (const p of Object.values(PW)) assert.ok(!r.stdout.includes(p));
    assert.match(r.stdout, /demo reset: accounts user, user2, admin restored/);
    const roles = (await svc.pool.query('SELECT roles FROM platform.product_roles WHERE user_id=$1 AND tenant_id=$2', [ids.user, map.tontine.tenants.main])).rows[0].roles;
    assert.deepEqual(roles.sort(), [...bySlug.tontine.demo_orgs[0].roles].sort());
  });
});

describe('ADS staff organisation flag outside demo (ACC-04)', () => {
  let svc;
  before(async () => { svc = await startService({ env: { ADS_ENV: 'staging' } }); });
  after(async () => { await svc.stop(); });

  it('mark-staff-org sets the ads_staff claim only for marked organisations', async () => {
    const client = await registerClient(svc.pool, { id: 'health-web', redirect: 'https://health.example.test/', selfRoles: [], personal: false });
    const u = await createActiveUser(svc.pool, 'reviewer@example.cm', 'Reviewer-Pass-2026');
    const out = node(cli, ['create-organization', '--name', 'ADS Health review', '--owner', u.email], { ADS_ENV: 'staging' });
    assert.equal(out.status, 0, out.stderr);
    const tenant = out.stdout.match(/tenant id ([0-9a-f-]{36})/)[1];
    assert.equal(node(cli, ['grant-role', '--email', u.email, '--client', 'health-web', '--tenant', tenant, '--roles', 'ads_reviewer'], { ADS_ENV: 'staging' }).status, 0);
    assert.equal(decode((await signInTokens(svc, client, { email: u.email, password: u.password })).access_token).ads_staff, undefined);
    const mark = node(cli, ['mark-staff-org', '--tenant', tenant], { ADS_ENV: 'staging' });
    assert.equal(mark.status, 0, mark.stderr);
    const claims = decode((await signInTokens(svc, client, { email: u.email, password: u.password })).access_token);
    assert.equal(claims.ads_staff, true);
    assert.equal(claims.demo, undefined);
    assert.equal(node(cli, ['mark-staff-org', '--tenant', tenant, '--staff', 'false'], { ADS_ENV: 'staging' }).status, 0);
    assert.equal(decode((await signInTokens(svc, client, { email: u.email, password: u.password })).access_token).ads_staff, undefined);
  });
});

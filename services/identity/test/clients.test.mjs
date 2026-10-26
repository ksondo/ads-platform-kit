import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import { validateClientList } from '../src/demo.mjs';
import { DATABASE_URL, browser, createActiveUser, csrfFrom, startService } from './helpers.mjs';

// ACC-02 / ACC-09: the reviewed client list (config/clients.demo.json) and its apply script.
const here = path.dirname(fileURLToPath(import.meta.url));
const listFile = path.resolve(here, '../../../config/clients.demo.json');
const applyScript = path.resolve(here, '../scripts/apply-clients.mjs');
const doc = JSON.parse(readFileSync(listFile, 'utf8'));
const bySlug = Object.fromEntries(doc.products.map(p => [p.slug, p]));
const apply = (args, env = {}) => spawnSync(process.execPath, [applyScript, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, DATABASE_URL, ...env }, timeout: 120_000 });

describe('client registration list (config/clients.demo.json)', () => {
  it('covers the 26 products: 25 sign-in clients plus the RAG gateway, which needs none', () => {
    validateClientList(doc);
    const slugs = ['software-factory', 'career-path', 'nutrition', 'personal-finance', 'education', 'morphoo', 'ventureworks', 'commerce', 'logistics', 'mamacare',
      'fleetguard', 'tontine', 'leisure-events', 'soulbridge', 'health', 'home-services', 'project-management', 'africover', 'agriculture', 'investment', 'hub',
      'hopebridge', 'tourism', 'banking', 'transport'];
    assert.deepEqual(doc.products.map(p => p.slug).sort(), [...slugs].sort());
    assert.deepEqual(doc.no_client.map(n => n.slug), ['rag-gateway']);
    assert.equal(new Set(doc.products.map(p => p.client_id)).size, 25);
  });

  it('uses reviewed HTTPS callback origins, including the approved public Commerce demo hostname', () => {
    const newDemoOrigins = {
      education: 'education', fleetguard: 'fleetguard', 'home-services': 'home-services',
      mamacare: 'mamacare', morphoo: 'morphoo', tontine: 'tontine', ventureworks: 'ventureworks'
    };
    for (const p of doc.products) {
      const original = p.slug === 'commerce' ? 'https://commerce.demo.africadigitalsynergy.com' : `https://${p.slug}.test.africadigitalsynergy.com`;
      const demo = newDemoOrigins[p.slug] ? `https://${newDemoOrigins[p.slug]}.demo.africadigitalsynergy.com` : null;
      const origins = demo ? [original, demo] : [original];
      assert.ok(p.redirect_uris.length && p.redirect_uris.every(u => origins.some(o => u.startsWith(`${o}/`))), p.slug);
      assert.ok(p.redirect_uris.some(u => u.startsWith(`${original}/`)), p.slug);
      assert.ok(p.post_logout_redirect_uris.includes(`${original}/`), p.slug);
      assert.ok(p.post_logout_redirect_uris.every(u => origins.some(o => u === `${o}/`)), p.slug);
      if (demo) {
        assert.ok(p.redirect_uris.some(u => u.startsWith(`${demo}/`)), p.slug);
        assert.ok(p.post_logout_redirect_uris.includes(`${demo}/`), p.slug);
      }
      assert.equal(typeof p.allow_personal_workspace, 'boolean');
    }
  });

  it('keeps ADS-only staff roles out of assignable_roles (audit section 2.3 and section 4 step 2)', () => {
    const adsOnly = {
      commerce: ['commerce_reviewer', 'commerce_support'], fleetguard: ['ads_support'], soulbridge: ['ads_support'], mamacare: ['ads_support', 'content_author', 'content_steward'],
      morphoo: ['super_admin', 'pcc_admin'], nutrition: ['food_data_admin'], health: ['ads_reviewer'], tourism: ['tour_admin'], education: ['platform_admin'],
    };
    for (const [slug, roles] of Object.entries(adsOnly)) {
      for (const r of roles) {
        assert.ok(bySlug[slug].ads_only_roles.includes(r), `${slug} lists ${r} as ADS-only`);
        assert.ok(!bySlug[slug].assignable_roles.includes(r), `${slug} must not make ${r} assignable`);
      }
    }
    for (const p of doc.products) {
      for (const o of p.demo_orgs) if (!o.staff) for (const r of o.roles) assert.ok(!p.ads_only_roles.includes(r), `${p.slug}: ${r} outside a staff organisation`);
    }
  });

  it('marks the products that call the kit admin API as needing a client secret (ACC-09)', () => {
    for (const slug of ['health', 'project-management', 'investment', 'logistics', 'agriculture', 'hopebridge']) {
      assert.equal(bySlug[slug].needs_client_secret, true, slug);
    }
    // Demo check 20 Oct 2026: these never read a client secret at run time.
    for (const slug of ['tourism', 'mamacare', 'software-factory']) {
      assert.equal(bySlug[slug].needs_client_secret, false, slug);
      assert.equal(bySlug[slug].client_secret_setting, null, slug);
    }
    assert.equal(bySlug.education.client_secret_setting, 'ADS_IDENTITY_CLIENT_SECRET');
    assert.ok(!JSON.stringify(doc).match(/"secret"\s*:/), 'no secret values in the list');
  });

  it('gives the demo admin a product admin role where the product has one (commerce, mamacare)', () => {
    assert.deepEqual(bySlug.commerce.admin_roles, ['merchant_owner']);
    assert.deepEqual(bySlug.mamacare.admin_roles, ['facility_admin']);
    assert.ok(bySlug.commerce.operator_setup.some(s => s.includes('--capability BANK_COLLECTION') && s.includes('--enabled true') && s.includes('<shop main tenant id>')));
    assert.ok(bySlug.africover.operator_setup[0].includes('platform_operators(tenant_id,name)'));
  });

  it('refuses a list that makes an ADS-only role assignable', () => {
    const bad = structuredClone(doc);
    bad.products.find(p => p.slug === 'commerce').assignable_roles.push('commerce_reviewer');
    assert.throws(() => validateClientList(bad), /ADS-only role commerce_reviewer must not be assignable/);
  });
});

describe('apply-clients', () => {
  let svc;
  let dir;
  before(async () => {
    svc = await startService({ env: { ADS_ENV: 'production' } });
    dir = mkdtempSync(path.join(os.tmpdir(), 'kitdemo-apply-'));
  });
  after(async () => { await svc.stop(); rmSync(dir, { recursive: true, force: true }); });

  it('refuses to write secrets inside a git work tree', () => {
    const r = apply(['--secrets-out', path.resolve(here, 'client-secrets.json')]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /inside a git work tree/);
    assert.ok(!existsSync(path.resolve(here, 'client-secrets.json')));
  });

  it('registers every product, writes new client secrets only to the secret file, and keeps them on a second run', async () => {
    const out = path.join(dir, 'client-secrets.json');
    const r = apply(['--secrets-out', out]);
    assert.equal(r.status, 0, r.stderr);
    const rows = (await svc.pool.query('SELECT * FROM platform.oauth_clients ORDER BY client_id')).rows;
    assert.equal(rows.length, 25);
    for (const p of doc.products) {
      const row = rows.find(x => x.client_id === p.client_id);
      assert.deepEqual(row.redirect_uris, p.redirect_uris);
      assert.deepEqual(row.self_service_roles, p.self_service_roles);
      assert.equal(row.allow_personal_workspace, p.allow_personal_workspace);
      assert.deepEqual(row.assignable_roles, p.assignable_roles);
      assert.deepEqual(row.admin_roles, p.admin_roles);
      assert.deepEqual(row.admin_scopes, p.admin_scopes);
      assert.equal(Boolean(row.client_secret_hash), p.needs_client_secret, p.client_id);
    }
    assert.equal((statSync(out).mode & 0o777).toString(8), '600');
    const secrets = JSON.parse(readFileSync(out, 'utf8')).clients;
    assert.equal(Object.keys(secrets).length, doc.products.filter(p => p.needs_client_secret).length);
    for (const [id, s] of Object.entries(secrets)) {
      assert.ok(!r.stdout.includes(s.secret) && !r.stderr.includes(s.secret), 'secret printed');
      assert.equal(rows.find(x => x.client_id === id).client_secret_hash, crypto.createHash('sha256').update(s.secret).digest('hex'));
    }
    assert.match(r.stdout, /no client for rag-gateway/);

    const again = apply(['--secrets-out', path.join(dir, 'second.json')]);
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /registered health-web \(client secret kept\)/);
    assert.ok(!existsSync(path.join(dir, 'second.json')), 'nothing new to write');
    const exists = apply(['--secrets-out', out, '--rotate-secrets']);
    assert.equal(exists.status, 2);
    assert.match(exists.stderr, /exists/);
  });

  it('with the list applied, a self-grant of an ADS-only role is refused and listed roles work (ACC-02 acceptance)', async () => {
    const owner = await createActiveUser(svc.pool, 'shop-owner@example.cm', 'Shop-Owner-Pass-2026');
    const orgId = crypto.randomUUID();
    const tenantId = crypto.randomUUID();
    await svc.pool.query("INSERT INTO platform.organizations(id,name,slug) VALUES ($1,'Boutique',$2)", [orgId, `b-${orgId}`]);
    await svc.pool.query("INSERT INTO platform.tenants(id,organization_id,name) VALUES ($1,$2,'Boutique')", [tenantId, orgId]);
    await svc.pool.query("INSERT INTO platform.memberships(user_id,tenant_id,role) VALUES ($1,$2,'owner')", [owner.id, tenantId]);
    const b = browser(svc.base);
    const login = await b.get('/login');
    await b.post('/login', { csrf: csrfFrom(login.text), email: owner.email, password: owner.password, next: '/admin' });
    const grant = async (product, roles) => {
      const page = await b.get(`/admin?tenant=${tenantId}&product=${product}`);
      const r = await b.post('/admin', { csrf: csrfFrom(page.text), tenant: tenantId, product, lang: 'en', action: 'grant', user_id: owner.id, roles });
      return new URL(r.location, svc.base).searchParams;
    };
    assert.equal((await grant('commerce-web', 'commerce_reviewer')).get('error'), 'ROLE_NOT_ASSIGNABLE');
    assert.equal((await grant('fleet-guard-web', 'ads_support')).get('error'), 'ROLE_NOT_ASSIGNABLE');
    assert.equal((await grant('mamacare-web', 'content_steward')).get('error'), 'ROLE_NOT_ASSIGNABLE');
    assert.equal((await grant('commerce-web', 'commerce_cashier')).get('done'), 'granted');
    // A product sign-in returns to its test address.
    const q = new URLSearchParams({ response_type: 'code', client_id: 'commerce-web', redirect_uri: 'https://commerce.demo.africadigitalsynergy.com/', state: 's', code_challenge: 'a'.repeat(43), code_challenge_method: 'S256', tenant_hint: tenantId });
    const auth = await b.get(`/authorize?${q}`);
    assert.ok(auth.location.startsWith('https://commerce.demo.africadigitalsynergy.com/?code='), auth.location);
  });
});

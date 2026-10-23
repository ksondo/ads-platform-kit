import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import { JSDOM } from 'jsdom';
import { demoSettings, loadConfig } from '../src/config.mjs';
import { bootstrapDemoAccounts, ensureDemoOrgs, ensurePersonaAccounts, personaAccounts, validatePersonas } from '../src/demo.mjs';
import { langOf } from '../src/pages.mjs';
import { DATABASE_URL, browser, createActiveUser, csrfFrom, reqFrom, signInTokens, startService } from './helpers.mjs';

// BRIEF16 demo personas: single-job demo accounts per product, the persona picker on the demo sign-in
// page, and the sign-in language that never sticks to a shared demo account.
const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, '../src/cli.mjs');
const applyScript = path.resolve(here, '../scripts/apply-clients.mjs');
const clients = JSON.parse(readFileSync(path.resolve(here, '../../../config/clients.demo.json'), 'utf8'));
const personasDoc = JSON.parse(readFileSync(path.resolve(here, '../../../config/demo-personas.json'), 'utf8'));
const bySlug = Object.fromEntries(clients.products.map(p => [p.slug, p]));
const hex = () => crypto.randomBytes(6).toString('hex');
const PW = { user: `Demo-User-${hex()}`, user2: `Demo-Two-${hex()}`, admin: `Demo-Admin-${hex()}`, persona: `Demo-Persona-${hex()}` };
const DEMO = { ADS_ENV: 'demo', DEMO_MODE: '1', DEMO_USER_PASSWORD: PW.user, DEMO_USER2_PASSWORD: PW.user2, DEMO_ADMIN_PASSWORD: PW.admin, DEMO_PERSONA_PASSWORD: PW.persona };
const SHOW = { ADS_ENV: 'demo', DEMO_MODE: '1', DEMO_SHOW_CREDENTIALS: '1', DEMO_USER_PASSWORD: PW.user, DEMO_PERSONA_PASSWORD: PW.persona };
const node = (script, args, env) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, DATABASE_URL, ...env }, timeout: 180_000 });
const decode = jwt => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
const clientOf = slug => ({ id: bySlug[slug].client_id, redirect: bySlug[slug].redirect_uris[0] });
const personasOf = slug => personasDoc.products[slug].personas;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const noSecrets = (out, label) => { for (const p of Object.values(PW)) assert.ok(!out.includes(p), `${label}: a password was printed`); };

// The hosted sign-in page as a product sends a tester there.
async function productLogin(svc, slug, extra = {}, b = browser(svc.base)) {
  const c = clientOf(slug);
  const q = new URLSearchParams({ response_type: 'code', client_id: c.id, redirect_uri: c.redirect, state: 's', code_challenge: 'a'.repeat(43), code_challenge_method: 'S256', ...extra });
  const auth = await b.get(`/authorize?${q}`);
  const page = await b.get(auth.location);
  return { b, page, location: auth.location };
}

describe('demo personas file (config/demo-personas.json)', () => {
  it('has personas for every product of the client list, each valid against it, labelled in English and French', () => {
    validatePersonas(personasDoc, clients);
    assert.deepEqual(Object.keys(personasDoc.products).sort(), clients.products.map(p => p.slug).sort());
    for (const [slug, e] of Object.entries(personasDoc.products)) {
      assert.ok(e.personas.length >= 2, slug);
      for (const p of e.personas) assert.ok(p.label.en && p.label.fr && p.hint.en && p.hint.fr, `${slug}/${p.key}`);
    }
    // The emails stay under the reserved demo domain.
    const accounts = personaAccounts(demoSettings({ ADS_ENV: 'demo', DEMO_MODE: '1' }), personasDoc, clients);
    assert.ok(accounts.every(a => a.email.endsWith('@demo.africadigitalsynergy.com')));
    assert.equal(new Set(accounts.map(a => a.email)).size, accounts.length);
  });

  it('covers the jobs the Commerce, Fleet Guard, Education and Tontine journeys need, one role each', () => {
    const roles = slug => Object.fromEntries(personasOf(slug).map(p => [p.key, `${p.org}:${p.roles.join('+')}`]));
    assert.deepEqual(roles('commerce'), {
      shopper: 'personal:commerce_buyer', 'shop-owner': 'main:merchant_owner', 'shop-manager': 'main:commerce_manager', cashier: 'main:commerce_cashier',
      accountant: 'main:commerce_accountant', 'bank-agent': 'bank:bank_agent', 'bank-officer': 'bank:bank_officer', reviewer: 'staff:commerce_reviewer', support: 'staff:commerce_support',
    });
    assert.deepEqual(roles('fleetguard'), {
      'fleet-owner': 'main:owner_admin', 'fleet-manager': 'main:fleet_manager', approver: 'main:workshop_manager', driver: 'main:driver', mechanic: 'main:technician', partner: 'main:partner',
    });
    for (const k of ['school-admin', 'teacher', 'parent', 'student', 'partner']) assert.ok(roles('education')[k], `education ${k}`);
    assert.equal(roles('education').partner, 'partner:partner_admin');
    for (const k of ['group-admin', 'treasurer', 'payout-approver', 'member', 'auditor', 'cooperative-admin', 'partner']) assert.ok(roles('tontine')[k], `tontine ${k}`);
  });

  it('refuses roles outside the persona organisation, ADS-only roles outside staff, and a wrong personal workspace', () => {
    const one = (slug, persona) => ({ products: { [slug]: { personas: [{ key: 'x', label: { en: 'X', fr: 'X' }, ...persona }] } } });
    assert.throws(() => validatePersonas(one('commerce', { org: 'main', roles: ['bank_agent'] }), clients), /not a role of commerce\/main/);
    assert.throws(() => validatePersonas(one('commerce', { org: 'bank', roles: ['commerce_reviewer'] }), clients), /not a role of commerce\/bank/);
    assert.throws(() => validatePersonas(one('commerce', { org: 'personal', roles: ['merchant_owner'] }), clients), /exactly commerce_buyer/);
    assert.throws(() => validatePersonas(one('tontine', { org: 'personal', roles: ['member'] }), clients), /no personal workspace/);
    assert.throws(() => validatePersonas(one('commerce', { org: 'nowhere', roles: ['commerce_buyer'] }), clients), /unknown demo organisation/);
    assert.throws(() => validatePersonas(one('nope', { org: 'main', roles: ['x'] }), clients), /unknown product/);
    assert.throws(() => validatePersonas(one('commerce', { org: 'main', roles: ['commerce_cashier'], label: { en: 'Only English' } }), clients), /label needs en and fr/);
    const withAdsOnly = structuredClone(clients);
    withAdsOnly.products.find(p => p.slug === 'commerce').demo_orgs.find(o => o.key === 'main').roles.push('x_staff');
    withAdsOnly.products.find(p => p.slug === 'commerce').ads_only_roles.push('x_staff');
    assert.throws(() => validatePersonas(one('commerce', { org: 'main', roles: ['x_staff'] }), withAdsOnly), /ADS-only role x_staff only in a staff organisation/);
  });

  it('reads the language from ui_locales lists and region tags', () => {
    assert.equal(langOf('fr-CM en'), 'fr');
    assert.equal(langOf('de-DE en-GB'), 'en');
    assert.equal(langOf('en_US'), 'en');
    assert.equal(langOf('de'), null);
  });

  it('refuses to show a persona password that opens the checker or the admin account', () => {
    const base = { IDENTITY_PUBLIC_URL: 'https://login.example.test', DATABASE_URL: 'postgres://x', IDENTITY_COOKIE_SECRET: 'c'.repeat(40), ...SHOW };
    assert.throws(() => loadConfig({ ...base, DEMO_ADMIN_PASSWORD: PW.persona }), /DEMO_PERSONA_PASSWORD_MUST_DIFFER_FROM_DEMO_ADMIN_PASSWORD/);
    assert.throws(() => loadConfig({ ...base, DEMO_USER2_PASSWORD: PW.persona }), /DEMO_PERSONA_PASSWORD_MUST_DIFFER_FROM_DEMO_USER2_PASSWORD/);
    assert.equal(loadConfig(base).demo.shownPersonaPassword, PW.persona);
    assert.equal(loadConfig({ ...base, DEMO_SHOW_CREDENTIALS: '0' }).demo.shownPersonaPassword, '');
  });
});

describe('demo personas: bootstrap, organisations, reset, sign-in page and language', () => {
  let svc;
  let dir;
  let tenantsFile;
  let tenants;
  const settings = () => svc.config.demo;
  const personaList = () => personaAccounts(settings(), personasDoc, clients);
  before(async () => {
    svc = await startService({ env: SHOW });
    dir = mkdtempSync(path.join(os.tmpdir(), 'kitdemo-personas-'));
    tenantsFile = path.join(dir, 'demo-tenants.json');
    const applied = node(applyScript, ['--secrets-out', path.join(dir, 'secrets.json')], {});
    assert.equal(applied.status, 0, applied.stderr);
  });
  after(async () => { await svc.stop(); rmSync(dir, { recursive: true, force: true }); });

  it('is refused outside demo mode (library and command line)', async () => {
    const off = demoSettings({ ADS_ENV: 'staging', DEMO_MODE: '1' });
    await assert.rejects(bootstrapDemoAccounts(svc.pool, off, PW, { personas: personaAccounts(off, personasDoc, clients) }), /refused/);
    await assert.rejects(ensureDemoOrgs(svc.pool, off, clients, { personas: [] }), /refused/);
    for (const cmd of ['demo-bootstrap', 'demo-orgs', 'demo-reset']) {
      const r = node(cli, [cmd, '--out', path.join(dir, 'x.json')], { ...DEMO, ADS_ENV: 'staging' });
      assert.equal(r.status, 2, cmd);
      noSecrets(r.stdout + r.stderr, cmd);
    }
    assert.equal((await svc.pool.query("SELECT count(*)::int AS n FROM platform.users WHERE demo_key LIKE 'persona:%'")).rows[0].n, 0);
  });

  it('refuses a persona password equal to the checker or admin password, and skips personas without one', async () => {
    const r = node(cli, ['demo-bootstrap'], { ...DEMO, DEMO_PERSONA_PASSWORD: PW.admin });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /DEMO_PERSONA_PASSWORD must differ/);
    noSecrets(r.stdout + r.stderr, 'equal password');
    const skipped = node(cli, ['demo-bootstrap'], { ...DEMO, DEMO_PERSONA_PASSWORD: '' });
    assert.equal(skipped.status, 0, skipped.stderr);
    assert.match(skipped.stderr, /demo personas skipped: DEMO_PERSONA_PASSWORD/);
    assert.equal((await svc.pool.query("SELECT count(*)::int AS n FROM platform.users WHERE demo_key LIKE 'persona:%'")).rows[0].n, 0);
  });

  it('demo-bootstrap creates every persona account (shared password from the server secret, never printed)', async () => {
    const r = node(cli, ['demo-bootstrap'], DEMO);
    assert.equal(r.status, 0, r.stderr);
    noSecrets(r.stdout + r.stderr, 'bootstrap');
    const expected = personaList();
    assert.match(r.stdout, new RegExp(`demo personas: ${expected.length} \\(${expected.length} created, 0 refreshed; password from DEMO_PERSONA_PASSWORD, not shown\\)`));
    const rows = (await svc.pool.query("SELECT email, demo_key, is_demo, status, locale, email_verified_at IS NOT NULL AS verified FROM platform.users WHERE demo_key LIKE 'persona:%'")).rows;
    assert.equal(rows.length, expected.length);
    assert.ok(rows.every(u => u.is_demo && u.status === 'active' && u.verified && u.locale === 'en'));
    assert.deepEqual(rows.map(u => u.email).sort(), expected.map(p => p.email).sort());
  });

  it('demo-orgs gives each persona exactly its roles in exactly one workspace, and writes the subs to the tenants file', async () => {
    const r = node(cli, ['demo-orgs', '--out', tenantsFile], DEMO);
    assert.equal(r.status, 0, r.stderr);
    noSecrets(r.stdout + r.stderr, 'demo-orgs');
    tenants = JSON.parse(readFileSync(tenantsFile, 'utf8'));
    assert.deepEqual(Object.keys(tenants).sort(), ['demo_accounts', 'generated_at', 'personas', 'products']);
    assert.deepEqual(Object.keys(tenants.demo_accounts), ['user', 'user2', 'admin']);
    const users = Object.fromEntries((await svc.pool.query("SELECT demo_key, id FROM platform.users WHERE is_demo")).rows.map(r2 => [r2.demo_key, r2.id]));
    assert.equal(tenants.demo_accounts.admin, users.admin);
    const list = personaList();
    assert.equal(Object.keys(tenants.personas).length, list.length);
    for (const p of list) {
      const entry = tenants.products[p.slug].personas[p.key];
      assert.ok(entry, `${p.slug}/${p.key}`);
      assert.equal(entry.sub, users[p.demoKey]);
      assert.equal(tenants.personas[`${p.slug}.${p.key}`], entry.sub);
      assert.deepEqual(entry.roles, p.roles);
      assert.equal(entry.email, p.email);
      assert.match(entry.tenant_id, UUID);
      const memberships = (await svc.pool.query(`SELECT m.tenant_id, m.role, o.kind, o.is_demo FROM platform.memberships m JOIN platform.tenants t ON t.id=m.tenant_id
        JOIN platform.organizations o ON o.id=t.organization_id WHERE m.user_id=$1 AND m.status='active'`, [entry.sub])).rows;
      assert.equal(memberships.length, 1, `${p.slug}/${p.key} memberships`);
      assert.equal(memberships[0].tenant_id, entry.tenant_id);
      const grants = (await svc.pool.query('SELECT tenant_id, client_id, roles FROM platform.product_roles WHERE user_id=$1', [entry.sub])).rows;
      if (p.org === 'personal') {
        assert.equal(memberships[0].kind, 'personal');
        assert.equal(memberships[0].role, 'owner');
        assert.deepEqual(grants, [], 'a personal workspace holds only the self-service roles');
      } else {
        assert.equal(entry.tenant_id, tenants.products[p.slug].tenants[p.org]);
        assert.equal(memberships[0].role, 'member', 'personas never administer the organisation');
        assert.deepEqual(grants, [{ tenant_id: entry.tenant_id, client_id: p.clientId, roles: p.roles }], `${p.slug}/${p.key} grants`);
      }
    }
    // The shared demo user keeps every role (unchanged behaviour).
    const userRoles = (await svc.pool.query('SELECT roles FROM platform.product_roles WHERE user_id=$1 AND tenant_id=$2', [users.user, tenants.products.commerce.tenants.bank])).rows[0].roles;
    assert.deepEqual(userRoles.sort(), ['bank_agent', 'bank_officer']);
  });

  it('persona tokens carry exactly the persona roles (bank agent, bank officer, driver, reviewer, shopper)', async () => {
    const as = async (slug, key) => decode((await signInTokens(svc, clientOf(slug), { email: settings().personaEmail(slug, key), password: PW.persona })).access_token);
    const agent = await as('commerce', 'bank-agent');
    assert.deepEqual(agent.roles, ['bank_agent']);
    assert.equal(agent.tenant_id, tenants.products.commerce.tenants.bank);
    assert.equal(agent.demo, true);
    assert.deepEqual((await as('commerce', 'bank-officer')).roles, ['bank_officer']);
    assert.deepEqual((await as('fleetguard', 'driver')).roles, ['driver']);
    const reviewer = await as('commerce', 'reviewer');
    assert.deepEqual(reviewer.roles, ['commerce_reviewer']);
    assert.equal(reviewer.ads_staff, true);
    const shopper = await as('commerce', 'shopper');
    assert.deepEqual(shopper.roles, ['commerce_buyer']);
    assert.equal(shopper.tenant_id, tenants.products.commerce.personas.shopper.tenant_id);
    assert.deepEqual((await as('education', 'partner')).roles, ['partner_admin']);
    assert.deepEqual((await as('tontine', 'cooperative-admin')).roles, ['cooperative_admin']);
    // A persona has nothing in another product's organisation.
    await assert.rejects(signInTokens(svc, clientOf('fleetguard'), { email: settings().personaEmail('commerce', 'cashier'), password: PW.persona }), /not redirected back/);
  });

  it('demo-reset restores persona passwords, memberships, roles and language, and ends their sign-ins; ids stay the same', async () => {
    const cashier = tenants.products.commerce.personas.cashier;
    const driver = tenants.products.fleetguard.personas.driver;
    const { refresh_token: refresh } = await signInTokens(svc, clientOf('commerce'), { email: cashier.email, password: PW.persona });
    await svc.pool.query("UPDATE platform.product_roles SET roles='{commerce_cashier,merchant_owner}' WHERE user_id=$1", [cashier.sub]);
    await svc.pool.query("INSERT INTO platform.memberships(user_id,tenant_id,role,scopes) VALUES ($1,$2,'admin','{}')", [cashier.sub, tenants.products.commerce.tenants.bank]);
    await svc.pool.query("INSERT INTO platform.product_roles(user_id,tenant_id,client_id,roles) VALUES ($1,$2,'commerce-web','{bank_officer}')", [cashier.sub, tenants.products.commerce.tenants.bank]);
    await svc.pool.query("DELETE FROM platform.memberships WHERE user_id=$1", [driver.sub]);
    await svc.pool.query("UPDATE platform.users SET locale='fr' WHERE id=$1", [cashier.sub]);
    assert.match(driver.sub, UUID);
    await svc.pool.query(`SET ads.demo_maintenance = 'on'; UPDATE platform.users SET password_hash='scrypt$00$00' WHERE id='${driver.sub}'; RESET ads.demo_maintenance`);

    const out = path.join(dir, 'reset.json');
    const r = node(cli, ['demo-reset', '--out', out], DEMO);
    assert.equal(r.status, 0, r.stderr);
    noSecrets(r.stdout + r.stderr, 'demo-reset');
    assert.match(r.stdout, new RegExp(`personas ${personaList().length} restored`));
    const again = JSON.parse(readFileSync(out, 'utf8'));
    assert.deepEqual(again.personas, tenants.personas, 'persona subs are stable across resets');
    assert.deepEqual(again.products.commerce.personas, tenants.products.commerce.personas);

    assert.deepEqual((await svc.pool.query('SELECT tenant_id, roles FROM platform.product_roles WHERE user_id=$1', [cashier.sub])).rows, [{ tenant_id: cashier.tenant_id, roles: ['commerce_cashier'] }]);
    assert.deepEqual((await svc.pool.query("SELECT tenant_id, role FROM platform.memberships WHERE user_id=$1", [cashier.sub])).rows, [{ tenant_id: cashier.tenant_id, role: 'member' }]);
    assert.equal((await svc.pool.query('SELECT locale FROM platform.users WHERE id=$1', [cashier.sub])).rows[0].locale, 'en');
    assert.deepEqual(decode((await signInTokens(svc, clientOf('fleetguard'), { email: driver.email, password: PW.persona })).access_token).roles, ['driver']);
    const reused = await fetch(`${svc.base}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh, client_id: 'commerce-web' }) });
    assert.equal(reused.status, 400, 'sign-ins from before the reset are ended');
  });

  it('a persona removed from the file is disabled and leaves every workspace at the next reset', async () => {
    const trimmed = structuredClone(personasDoc);
    trimmed.products.commerce.personas = trimmed.products.commerce.personas.filter(p => p.key !== 'accountant');
    const file = path.join(dir, 'personas-trimmed.json');
    writeFileSync(file, JSON.stringify(trimmed));
    const accountant = tenants.products.commerce.personas.accountant;
    const r = node(cli, ['demo-reset', '--personas', file, '--out', path.join(dir, 'trimmed.json')], DEMO);
    assert.equal(r.status, 0, r.stderr);
    assert.equal((await svc.pool.query('SELECT status FROM platform.users WHERE id=$1', [accountant.sub])).rows[0].status, 'disabled');
    assert.equal((await svc.pool.query('SELECT count(*)::int AS n FROM platform.memberships WHERE user_id=$1', [accountant.sub])).rows[0].n, 0);
    assert.equal(JSON.parse(readFileSync(path.join(dir, 'trimmed.json'), 'utf8')).products.commerce.personas.accountant, undefined);
    // Back to the reviewed file.
    const back = node(cli, ['demo-reset', '--out', path.join(dir, 'back.json')], DEMO);
    assert.equal(back.status, 0, back.stderr);
    assert.equal((await svc.pool.query('SELECT status FROM platform.users WHERE id=$1', [accountant.sub])).rows[0].status, 'active');
  });

  it('a named demo set (future per-tester sandbox) gets its own organisations and personas, untouched by the global reset', async () => {
    const set = 'sbx-test1';
    const tester = await createActiveUser(svc.pool, `tester-${hex()}@example.cm`, `Tester-Pass-${hex()}`);
    const doc = { ...clients, products: clients.products.filter(p => p.slug === 'commerce') };
    const mine = personaAccounts(settings(), { products: { commerce: personasDoc.products.commerce } }, doc, { set });
    assert.ok(mine.every(p => p.demoKey.startsWith(`persona:${set}/commerce:`) && p.email.startsWith(`demo.${set}.commerce.`)));
    await assert.rejects(ensureDemoOrgs(svc.pool, settings(), doc, { personas: mine }), /another demo set/);
    await assert.rejects(ensureDemoOrgs(svc.pool, settings(), doc, { personas: mine, set }), /needs ownerId/);
    await ensurePersonaAccounts(svc.pool, settings(), mine, PW.persona, { set });
    const map = await ensureDemoOrgs(svc.pool, settings(), doc, { personas: mine, set, ownerId: tester.id });
    assert.notEqual(map.commerce.tenants.main, tenants.products.commerce.tenants.main, 'its own organisations');
    const owner = (await svc.pool.query('SELECT role FROM platform.memberships WHERE user_id=$1 AND tenant_id=$2', [tester.id, map.commerce.tenants.main])).rows[0];
    assert.equal(owner.role, 'owner');
    const shared = (await svc.pool.query("SELECT count(*)::int AS n FROM platform.memberships m JOIN platform.users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND u.demo_key IN ('user','user2','admin')", [map.commerce.tenants.main])).rows[0].n;
    assert.equal(shared, 0, 'the shared demo accounts are not in a named set');
    const cashier = map.commerce.personas.cashier;
    assert.notEqual(cashier.sub, tenants.products.commerce.personas.cashier.sub);
    assert.deepEqual(decode((await signInTokens(svc, clientOf('commerce'), { email: cashier.email, password: PW.persona })).access_token).roles, ['commerce_cashier']);
    // The global nightly reset leaves the named set alone, and the global set keeps its personas.
    const r = node(cli, ['demo-reset', '--out', path.join(dir, 'after-set.json')], DEMO);
    assert.equal(r.status, 0, r.stderr);
    const stillOwner = (await svc.pool.query('SELECT role FROM platform.memberships WHERE user_id=$1 AND tenant_id=$2', [tester.id, map.commerce.tenants.main])).rows[0];
    assert.equal(stillOwner?.role, 'owner');
    assert.deepEqual((await svc.pool.query('SELECT tenant_id, roles FROM platform.product_roles WHERE user_id=$1', [cashier.sub])).rows, [{ tenant_id: map.commerce.tenants.main, roles: ['commerce_cashier'] }]);
    assert.equal((await svc.pool.query('SELECT status FROM platform.users WHERE id=$1', [cashier.sub])).rows[0].status, 'active');
    assert.deepEqual(JSON.parse(readFileSync(path.join(dir, 'after-set.json'), 'utf8')).personas, tenants.personas);
    // The global sign-in page never lists a named set's personas.
    const { page } = await productLogin(svc, 'commerce');
    assert.ok(!page.text.includes(cashier.email));
  });

  it('the sign-in page shows the personas of the product the tester came from, in English, with "Use this account"', async () => {
    const { page } = await productLogin(svc, 'commerce', { ui_locales: 'en' });
    const { res, text } = page;
    assert.equal(res.status, 200);
    assert.match(text, /<html lang="en">/);
    const doc = new JSDOM(text, { url: `${svc.base}/login`, runScripts: 'dangerously' }).window.document;
    const items = [...doc.querySelectorAll('li.persona')];
    assert.deepEqual(items.map(li => li.dataset.persona), personasOf('commerce').map(p => p.key));
    assert.deepEqual(items.map(li => li.querySelector('.persona-name').textContent), personasOf('commerce').map(p => p.label.en));
    assert.equal(doc.querySelector('ul.personas').getAttribute('aria-label'), 'Demo people');
    const cashier = doc.querySelector('li[data-persona="cashier"] button.persona-use');
    assert.equal(cashier.getAttribute('type'), 'button');
    assert.equal(cashier.textContent, 'Use this account');
    assert.equal(cashier.getAttribute('aria-label'), 'Use this account: Cashier');
    cashier.click();
    assert.equal(doc.getElementById('email').value, settings().personaEmail('commerce', 'cashier'));
    assert.equal(doc.getElementById('password').value, PW.persona);
    assert.equal(cashier.getAttribute('aria-pressed'), 'true');
    assert.match(doc.getElementById('demo-status').textContent, /Account "Cashier" filled in/);
    assert.equal(doc.activeElement.id, 'signin-submit');
    // The demo user (every role) stays available; the demo admin and the checker are never shown.
    assert.ok(doc.getElementById('demo-use'));
    for (const hidden of [PW.admin, PW.user2, settings().accounts.admin.email, settings().accounts.user2.email]) assert.ok(!text.includes(hidden));
    // No other product's personas.
    assert.ok(!text.includes(settings().personaEmail('fleetguard', 'driver')));
    // The script carries the page nonce; no inline handlers.
    const nonce = res.headers.get('content-security-policy').match(/script-src 'nonce-([^']+)'/)[1];
    assert.equal(doc.querySelectorAll(`script[nonce="${nonce}"]`).length, doc.querySelectorAll('script').length);
    assert.doesNotMatch(text, /\sonclick=/);
    // Touch targets and narrow-screen layout rules.
    assert.match(text, /\.demo \.persona-use\{[^}]*min-height:44px;min-width:44px/);
    assert.match(text, /\.persona\{display:flex;flex-wrap:wrap/);
  });

  it('the persona picker follows the product language (ui_locales) and the page switch, in French', async () => {
    const { b, page, location } = await productLogin(svc, 'fleetguard', { ui_locales: 'fr-CM en' });
    assert.match(page.text, /<html lang="fr">/);
    const doc = new JSDOM(page.text, { url: `${svc.base}/login`, runScripts: 'dangerously' }).window.document;
    assert.deepEqual([...doc.querySelectorAll('.persona-name')].map(n => n.textContent), personasOf('fleetguard').map(p => p.label.fr));
    const driver = doc.querySelector('li[data-persona="driver"] button.persona-use');
    assert.equal(driver.textContent, 'Utiliser ce compte');
    assert.equal(driver.getAttribute('aria-label'), 'Utiliser ce compte: Chauffeur');
    driver.click();
    assert.match(doc.getElementById('demo-status').textContent, /Compte « Chauffeur » saisi/);
    // The product asked for French but the browser is English: the product wins.
    const en = await b.get(location, { 'accept-language': 'en-US,en' });
    assert.match(en.text, /<html lang="fr">/);
    // The page switch wins over both.
    const switched = await b.get(`/login?req=${reqFrom(location)}&lang=en`);
    assert.match(switched.text, /Use this account/);
    assert.match(switched.text, /<html lang="en">/);
  });

  it('shows no personas without a product, outside demo mode, without DEMO_SHOW_CREDENTIALS, or without the persona password', async () => {
    const bare = await browser(svc.base).get('/login');
    assert.doesNotMatch(bare.text, /class="persona-use"|data-persona=/);
    assert.ok(!bare.text.includes(PW.persona));
    assert.match(bare.text, /Use demo account/, 'the demo user panel is unchanged');
    const config = svc.config;
    for (const env of [{ ...SHOW, DEMO_SHOW_CREDENTIALS: '0' }, { ...SHOW, DEMO_PERSONA_PASSWORD: '' }, { ...SHOW, ADS_ENV: 'staging' }]) {
      const other = await startService({ env, keepDb: true });
      try {
        const { page } = await productLogin(other, 'commerce');
        assert.doesNotMatch(page.text, /class="persona-use"|data-persona=|Use this account/);
        assert.ok(!page.text.includes(PW.persona));
        assert.ok(!page.text.includes(settings().personaEmail('commerce', 'cashier')));
      } finally {
        await other.stop();
      }
    }
    assert.equal(config.demo.showCredentials, true);
  });

  it('a persona cannot sign in outside demo mode', async () => {
    const other = await startService({ env: { ADS_ENV: 'staging' }, keepDb: true });
    try {
      const { b, page, location } = await productLogin(other, 'commerce');
      const r = await b.post('/login', { csrf: csrfFrom(page.text), req: reqFrom(location), email: settings().personaEmail('commerce', 'cashier'), password: PW.persona });
      assert.equal(r.status, 400);
      assert.match(r.text, /Demo accounts work only in the ADS demo environment/);
    } finally {
      await other.stop();
    }
  });

  it('the sign-in language goes to the product (locale claim) and never sticks to the shared demo account', async () => {
    const email = settings().personaEmail('commerce', 'shop-owner');
    const id = (await svc.pool.query('SELECT id FROM platform.users WHERE email=$1', [email])).rows[0].id;
    // Product asks for English; the tester switches the sign-in page to French and signs in there.
    const { b, location } = await productLogin(svc, 'commerce', { ui_locales: 'en' });
    const fr = await b.get(`/login?req=${reqFrom(location)}&lang=fr`);
    assert.match(fr.text, /Utiliser ce compte/);
    const done = await b.post('/login', { csrf: csrfFrom(fr.text), req: reqFrom(location), lang: 'fr', email, password: PW.persona });
    assert.ok(done.location?.startsWith(clientOf('commerce').redirect), done.text);
    assert.equal((await svc.pool.query('SELECT locale FROM platform.sso_sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1', [id])).rows[0].locale, 'fr', 'the page choice is the sign-in language');
    assert.equal((await svc.pool.query('SELECT locale FROM platform.users WHERE id=$1', [id])).rows[0].locale, 'en', 'nothing saved on the account');
    // The next tester's product asks for English: English, whatever the previous tester chose.
    const next = decode((await signInTokens(svc, clientOf('commerce'), { email, password: PW.persona, extra: { ui_locales: 'en' } })).access_token);
    assert.equal(next.locale, 'en');
    // And French when the product asks for it.
    const b2 = browser(svc.base);
    const french = decode((await signInTokens(svc, clientOf('commerce'), { email, password: PW.persona, b: b2, extra: { ui_locales: 'fr' } })).access_token);
    assert.equal(french.locale, 'fr');
    // Single sign-on: the product's new choice applies without a new password.
    const again = decode((await signInTokens(svc, clientOf('commerce'), { email, password: PW.persona, b: b2, extra: { ui_locales: 'en' } })).access_token);
    assert.equal(again.locale, 'en');
    assert.equal((await svc.pool.query('SELECT locale FROM platform.users WHERE id=$1', [id])).rows[0].locale, 'en');
  });
});

import { expect, test } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { freePort, startIdentity, startMocks } from '../src/index.mjs';
import { KIT_ROOT } from '../src/identity-runtime.mjs';

// BRIEF18 personal demo sandboxes, end to end in a real browser at phone width (360 px), English and
// French: "Try ADS free for 30 days" from a product's sign-in, the one-time code (email through the
// mocks' capture; SMS shown in test mode), "Preparing your demo…", back in the product with the data
// the product seeded through the REAL provisioning contract (the sample product's reference
// /internal/demo/sandboxes), then "Switch role" between the sandbox's personas, and finally deletion
// through the product's signed DELETE.
const DATABASE_URL = process.env.E2E_KIT_TEST_DATABASE_URL ?? 'postgres://ads_e2e:ads_e2e@127.0.0.1:5432/ads_kit_selftest';
const SECRET = crypto.randomBytes(32).toString('hex');
const SAMPLE = path.join(KIT_ROOT, 'examples/sample-product');

let mocks;
let identity;
let product;
let productUrl;
let dir;
let env;
const productLog = [];

const clientsDoc = url => ({
  products: [{
    slug: 'sample', client_id: 'sample-web', display_name: 'ADS Sample Product', redirect_uris: [`${url}/`],
    self_service_roles: [], allow_personal_workspace: false, admin_roles: ['notes_writer'], assignable_roles: ['notes_writer', 'notes_reader', 'cashier'],
    demo_orgs: [
      { key: 'main', name: 'Sample Demo Shop', roles: ['notes_writer', 'notes_reader', 'cashier'] },
      { key: 'branch', name: 'Sample Branch', roles: ['notes_reader'] },
    ],
  }],
});
const personasDoc = {
  version: 1,
  products: {
    sample: {
      personas: [
        { key: 'reader', label: { en: 'Note reader', fr: 'Lecteur de notes' }, hint: { en: 'Reads the shop notes', fr: 'Lit les notes de la boutique' }, org: 'main', roles: ['notes_reader'] },
        { key: 'cashier', label: { en: 'Cashier', fr: 'Caissier' }, hint: { en: 'Takes mobile money payments', fr: 'Encaisse les paiements mobile money' }, org: 'main', roles: ['cashier'] },
        { key: 'branch-reader', label: { en: 'Branch reader', fr: 'Lecteur de l’agence' }, org: 'branch', roles: ['notes_reader'] },
      ],
    },
  },
};

test.beforeAll(async () => {
  test.setTimeout(240_000);
  dir = mkdtempSync(path.join(os.tmpdir(), 'kit-sandbox-e2e-'));
  const port = await freePort();
  productUrl = `http://localhost:${port}`;
  writeFileSync(path.join(dir, 'clients.json'), JSON.stringify(clientsDoc(productUrl)));
  writeFileSync(path.join(dir, 'personas.json'), JSON.stringify(personasDoc));
  writeFileSync(path.join(dir, 'products.json'), JSON.stringify({ products: { sample: { base_url: `http://127.0.0.1:${port}` } } }));
  mocks = await startMocks();
  env = {
    ADS_ENV: 'demo', DEMO_MODE: '1', DEMO_SANDBOXES: '1', DEMO_PROVISIONING_SECRET: SECRET, DEMO_OTP_SHOW_SMS_CODE: '1',
    DEMO_CLIENTS_FILE: path.join(dir, 'clients.json'), DEMO_PERSONAS_FILE: path.join(dir, 'personas.json'), DEMO_PRODUCTS_FILE: path.join(dir, 'products.json'),
  };
  identity = await startIdentity({ databaseUrl: DATABASE_URL, resetDatabase: true, mocksUrl: mocks.url, env });
  await identity.registerClient({ clientId: 'sample-web', name: 'ADS Sample Product', redirectUris: [`${productUrl}/`], personal: false,
    adminRoles: ['notes_writer'], assignableRoles: ['notes_writer', 'notes_reader', 'cashier'] });

  // The sample product, in demo mode with the provisioning secret (its reference endpoint is on).
  const productEnv = { PATH: process.env.PATH, DATABASE_URL, PORT: String(port), HOST: '127.0.0.1', PUBLIC_URL: productUrl,
    OIDC_ISSUER: identity.issuer, OIDC_AUDIENCE: 'sample-web', OIDC_JWKS_URL: identity.jwksUrl, ADS_IDENTITY_URL: identity.url,
    PAYMENTS_MODE: 'mock', ADS_MOCKS_URL: mocks.url, ADS_MOCKS_WEBHOOK_SECRET: mocks.webhookSecret, ADS_ENV: 'demo', DEMO_MODE: '1', DEMO_PROVISIONING_SECRET: SECRET };
  const migrated = spawnSync(process.execPath, ['src/migrate.mjs'], { cwd: SAMPLE, env: productEnv, encoding: 'utf8' });
  if (migrated.status !== 0) throw new Error(`sample migrate: ${migrated.stderr}`);
  product = spawn(process.execPath, ['src/server.mjs'], { cwd: SAMPLE, env: productEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  product.stdout.on('data', d => productLog.push(String(d)));
  product.stderr.on('data', d => productLog.push(String(d)));
  for (let i = 0; i < 100; i += 1) {
    try { if ((await fetch(`${productUrl}/health`)).ok) break; } catch { /* starting */ }
    await new Promise(r => setTimeout(r, 100));
  }
});

test.afterAll(async () => {
  product?.kill('SIGTERM');
  await identity?.close();
  await mocks?.stop();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

async function noHorizontalScroll(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

// Product page -> its sign-in button -> the hosted ADS sign-in page -> "Try ADS free for 30 days".
async function startSignUp(page, lang) {
  await page.goto(`${productUrl}/`);
  await page.getByTestId('sign-in').click();
  await page.waitForURL(u => u.pathname === '/login');
  await page.goto(`${page.url()}&lang=${lang}`);
  await page.locator('#sandbox-signup').click();
  await page.waitForURL(u => u.pathname === '/demo/signup');
  await noHorizontalScroll(page);
}

async function finishCode(page, code, lang) {
  await page.locator('#code').fill(code);
  await page.locator('#verify-submit').click();
  // "Preparing your demo…" until the product has seeded, then back to the product.
  const cont = page.locator('#sbx-continue');
  await page.waitForURL(u => u.pathname === '/demo/preparing' || u.origin === productUrl, { timeout: 30_000 });
  if (new URL(page.url()).pathname === '/demo/preparing') {
    await expect(page.locator('h1')).toContainText(lang === 'fr' ? /démo/ : /demo/);
    await noHorizontalScroll(page);
    await expect(cont).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('li[data-product="sample"] .sbx-chip')).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
    await cont.click();
  }
  await page.waitForURL(u => u.origin === productUrl, { timeout: 30_000 });
}

const tokenClaims = page => page.evaluate(async () => {
  const at = await window.adsIdentity.getAccessToken();
  const part = at.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(part + '==='.slice((part.length + 3) % 4)));
});

async function switchTo(page, name) {
  await page.getByRole('button', { name: /Switch role|Changer de rôle/ }).click();
  const item = page.locator('#ads-demo-switch').locator('button.i', { hasText: name });
  await item.first().click();
  await page.waitForLoadState('load');
  await page.waitForFunction(() => window.adsIdentity && window.adsIdentity.getUser && window.adsIdentity.getUser());
}

test.describe('sign-up and Switch role at 360 px, English', () => {
  test.use({ viewport: { width: 360, height: 740 }, locale: 'en-US', isMobile: true, hasTouch: true });

  test('email sign-up from the product, seeded data, then switch roles', async ({ page }) => {
    const email = `sbx-${crypto.randomBytes(4).toString('hex')}@example.test`;
    await startSignUp(page, 'en');
    await expect(page.locator('h1')).toHaveText('Try ADS free for 30 days');
    await page.locator('#contact').fill(email);
    await page.locator('#signup-submit').click();
    await expect(page.getByRole('alert')).toContainText('confirm that you understand');
    await page.locator('#consent').check();
    await page.locator('#signup-submit').click();
    await expect(page.locator('h1')).toHaveText('Enter your code');
    await noHorizontalScroll(page);
    const mail = await mocks.client.waitForMessage({ channel: 'email', to: email, includes: 'demo code' });
    const code = mail.text.match(/\b(\d{6})\b/)[1];
    await finishCode(page, code, 'en');

    // Back in the product as the sandbox owner, with the notes the product seeded for this sandbox.
    const owner = await tokenClaims(page);
    expect(owner.demo_sandbox).toMatch(/^sb-[a-z0-9]{10}$/);
    expect(owner.demo_sandbox_owner).toBe(true);
    await expect(page.getByTestId('notes')).toContainText('Welcome to your private ADS demo');
    await page.getByTestId('note-text').fill('Owner note in my sandbox');
    await page.getByTestId('note-add').click();
    await expect(page.getByTestId('notes')).toContainText('Owner note in my sandbox');

    // Switch role: the reader sees the same shop's notes; the cashier gets payments.
    await expect(page.getByRole('button', { name: /Switch role/ })).toBeVisible();
    await switchTo(page, 'Note reader');
    const reader = await tokenClaims(page);
    expect(reader.sub).not.toBe(owner.sub);
    expect(reader.roles).toEqual(['notes_reader']);
    expect(reader.demo_sandbox).toBe(owner.demo_sandbox);
    expect(reader.tenant_id).toBe(owner.tenant_id);
    await expect(page.getByTestId('notes')).toContainText('Owner note in my sandbox');
    await switchTo(page, 'Cashier');
    expect((await tokenClaims(page)).roles).toEqual(['cashier']);
    await expect(page.getByTestId('pay-submit')).toBeVisible();
    // The branch reader is in another organisation of the same sandbox: it does not see the shop's notes.
    await switchTo(page, 'Branch reader');
    const branch = await tokenClaims(page);
    expect(branch.tenant_id).not.toBe(owner.tenant_id);
    await expect(page.getByTestId('notes')).not.toContainText('Owner note in my sandbox');
    // The list only ever holds this sandbox's personas.
    const listed = await page.evaluate(() => window.adsIdentity.demoPersonas());
    expect(listed.sandbox_id).toBe(owner.demo_sandbox);
    expect(listed.personas.map(p => p.key)).toEqual(['reader', 'cashier', 'branch-reader']);
    await switchTo(page, 'Me (sandbox owner)');
    expect((await tokenClaims(page)).sub).toBe(owner.sub);
  });
});

test.describe('sign-up and Switch role at 360 px, French', () => {
  test.use({ viewport: { width: 360, height: 740 }, locale: 'fr-FR', isMobile: true, hasTouch: true });

  test('phone sign-up (test-mode SMS code), switch roles, then deletion through the product', async ({ page }) => {
    const local = `6${crypto.randomInt(10_000_000, 99_999_999)}`;
    await startSignUp(page, 'fr');
    await expect(page.locator('h1')).toHaveText('Essayez ADS gratuitement pendant 30 jours');
    await expect(page.locator('label[for="consent"]')).toContainText('supprimés 30 jours après l’inscription');
    await page.locator('#contact').fill(local);
    await page.locator('#consent').check();
    await page.locator('#signup-submit').click();
    await expect(page.locator('h1')).toHaveText('Saisissez votre code');
    await expect(page.locator('[data-test-code]')).toContainText('Mode test');
    await noHorizontalScroll(page);
    const shown = (await page.locator('#test-code').textContent()).trim();
    const sms = await mocks.client.waitForMessage({ channel: 'sms', to: `+237${local}`, includes: shown });
    expect(sms.text).toContain('Votre code de démo ADS');
    await finishCode(page, shown, 'fr');

    const owner = await tokenClaims(page);
    expect(owner.demo_sandbox).toMatch(/^sb-/);
    await expect(page.getByRole('button', { name: /Changer de rôle/ })).toBeVisible();
    await switchTo(page, 'Caissier');
    expect((await tokenClaims(page)).roles).toEqual(['cashier']);
    await expect(page.getByTestId('pay-submit')).toBeVisible();
    // A persona key of nobody in this sandbox is refused.
    expect(await page.evaluate(() => window.adsIdentity.switchDemoPersona('nobody').then(() => 'ok', e => e.message))).toBe('PERSONA_UNKNOWN');

    // Deletion (as at expiry): the kit calls the product's signed DELETE, then removes its own records.
    const db = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
    try {
      const tenants = (await db.query('SELECT tenants FROM sample.demo_sandboxes WHERE id=$1', [owner.demo_sandbox])).rows[0].tenants;
      expect((await db.query('SELECT count(*)::int AS n FROM sample.notes WHERE tenant_id = ANY($1::uuid[])', [tenants])).rows[0].n).toBeGreaterThan(0);
      const r = spawnSync(process.execPath, [path.join(KIT_ROOT, 'services/identity/src/cli.mjs'), 'demo-sandboxes', 'delete', owner.demo_sandbox],
        { env: { PATH: process.env.PATH, DATABASE_URL, MAIL_TRANSPORT: 'log', ...env }, encoding: 'utf8' });
      expect(r.status, r.stderr).toBe(0);
      expect(`${r.stdout}${r.stderr}`).not.toContain(SECRET);
      expect((await db.query('SELECT count(*)::int AS n FROM sample.notes WHERE tenant_id = ANY($1::uuid[])', [tenants])).rows[0].n).toBe(0);
      expect((await db.query('SELECT count(*)::int AS n FROM sample.demo_sandboxes WHERE id=$1', [owner.demo_sandbox])).rows[0].n).toBe(0);
      expect((await db.query('SELECT count(*)::int AS n FROM platform.users WHERE demo_sandbox_id=$1', [owner.demo_sandbox])).rows[0].n).toBe(0);
      expect((await db.query('SELECT status FROM platform.demo_sandboxes WHERE id=$1', [owner.demo_sandbox])).rows[0].status).toBe('deleted');
    } finally {
      await db.end();
    }
    // The tester's sign-in ended with the sandbox.
    expect(await page.evaluate(() => window.adsIdentity.getAccessToken({ forceRefresh: true }))).toBeNull();
  });
});

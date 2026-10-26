import { expect, test } from '@playwright/test';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import pg from 'pg';
import { freePort, startIdentity } from '../src/index.mjs';
import { KIT_ROOT } from '../src/identity-runtime.mjs';
import { SignInError, expectSignedIn, signInAsPersona } from '../src/playwright.mjs';

// BRIEF16: the demo persona picker on the REAL hosted sign-in page (demo mode, DEMO_SHOW_CREDENTIALS=1),
// at phone, tablet and desktop widths in English and French, and signInAsPersona() going through it.
const DATABASE_URL = process.env.E2E_KIT_TEST_DATABASE_URL ?? 'postgres://ads_e2e:ads_e2e@127.0.0.1:5432/ads_kit_selftest';
const hex = () => crypto.randomBytes(6).toString('hex');
const PW = { user: `Demo-User-${hex()}`, user2: `Demo-Two-${hex()}`, admin: `Demo-Admin-${hex()}`, persona: `Demo-Persona-${hex()}` };
const SHOW = { ADS_ENV: 'demo', DEMO_MODE: '1', DEMO_SHOW_CREDENTIALS: '1', DEMO_USER_PASSWORD: PW.user, DEMO_PERSONA_PASSWORD: PW.persona };
const clientsDoc = JSON.parse(readFileSync(path.join(KIT_ROOT, 'config/clients.demo.json'), 'utf8'));
const personasDoc = JSON.parse(readFileSync(path.join(KIT_ROOT, 'config/demo-personas.json'), 'utf8'));
const SLUGS = ['commerce', 'fleetguard'];
const labels = (slug, lang) => personasDoc.products[slug].personas.map(p => p.label[lang]);
const decode = jwt => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));

let identity;
let product;
let productUrl;
const at = slug => `${productUrl}/${slug}/`;

test.beforeAll(async () => {
  // Starting the identity service (key generation, migrations) is slow on busy build machines.
  test.setTimeout(240_000);
  identity = await startIdentity({ databaseUrl: DATABASE_URL, resetDatabase: true, env: SHOW });
  const port = await freePort();
  productUrl = `http://localhost:${port}`;
  // A minimal product page per client: just the ADS browser library.
  product = http.createServer((req, res) => {
    const slug = SLUGS.find(s => req.url.startsWith(`/${s}/`));
    if (!slug) { res.writeHead(404); return res.end(); }
    const clientId = clientsDoc.products.find(p => p.slug === slug).client_id;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${slug}</title>
<script src="${identity.url}/sdk/ads-identity.js" data-issuer="${identity.issuer}" data-client-id="${clientId}" data-redirect-uri="${at(slug)}" data-post-logout-redirect-uri="${at(slug)}"></script></head>
<body><h1>${slug}</h1></body></html>`);
  });
  await new Promise(r => product.listen(port, '127.0.0.1', r));

  // Register the two products, then run the operator steps (demo-bootstrap, demo-orgs) with the reviewed files.
  const doc = { ...clientsDoc, products: clientsDoc.products.filter(p => SLUGS.includes(p.slug)) };
  for (const [i, p] of doc.products.entries()) {
    await identity.registerClient({ clientId: p.client_id, redirectUris: [at(p.slug)], name: p.display_name, selfRoles: p.self_service_roles,
      personal: p.allow_personal_workspace, adminRoles: p.admin_roles, waitForCorsReady: i === doc.products.length - 1 });
  }
  const { demoSettings } = await import(path.join(KIT_ROOT, 'services/identity/src/config.mjs'));
  const { bootstrapDemoAccounts, ensureDemoOrgs, personaAccounts } = await import(path.join(KIT_ROOT, 'services/identity/src/demo.mjs'));
  const settings = demoSettings(SHOW);
  const personas = personaAccounts(settings, { products: Object.fromEntries(SLUGS.map(s => [s, personasDoc.products[s]])) }, doc);
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  try {
    await bootstrapDemoAccounts(pool, settings, PW, { personas });
    await ensureDemoOrgs(pool, settings, doc, { personas });
  } finally {
    await pool.end();
  }
});

test.afterAll(async () => {
  product?.closeAllConnections?.();
  await new Promise(r => (product ? product.close(() => r()) : r()));
  await identity?.close();
});

// The demo page loads Google Fonts; keep the check offline and deterministic.
test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
});

async function openPicker(page, slug, lang) {
  await page.goto(at(slug));
  await page.waitForFunction(() => window.adsIdentity && window.adsIdentity.ready);
  await page.evaluate(l => { void window.adsIdentity.signIn({ lang: l, forceLogin: true }); }, lang);
  await page.waitForURL(u => u.pathname === '/login');
  await expect(page.locator('ul.personas')).toBeVisible();
}

async function expectFits(page, width) {
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll, `no horizontal scroll at ${width}px`).toBeLessThanOrEqual(client);
  for (const button of await page.locator('button.persona-use').all()) {
    const box = await button.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
  }
}

test.describe('persona picker at 360 px', () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });

  test('English: Commerce personas, "Use this account" fills the form, the cashier signs in with only the cashier role', async ({ page }, info) => {
    await openPicker(page, 'commerce', 'en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    const list = page.getByRole('list', { name: 'Demo people' });
    await expect(list.getByRole('listitem')).toHaveCount(labels('commerce', 'en').length);
    await expect(list.locator('.persona-name')).toHaveText(labels('commerce', 'en'));
    await expect(page.getByText('Demo Admin')).toHaveCount(0);
    await expectFits(page, 360);
    await page.screenshot({ path: info.outputPath('picker-360-en.png'), fullPage: true });

    const cashier = page.getByRole('button', { name: 'Use this account: Cashier' });
    await cashier.scrollIntoViewIfNeeded();
    await cashier.tap();
    await expect(cashier).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('status')).toHaveText('Account "Cashier" filled in. Select Continue to sign in.');
    await expect(page.locator('#signin-submit')).toBeFocused();
    await expect(page.locator('#email')).toHaveValue(/^demo\.commerce\.cashier@/);
    await page.locator('#signin-submit').tap();
    await page.waitForURL(u => u.href.startsWith(at('commerce')));
    const { user, accessToken } = await expectSignedIn(page);
    expect(user.roles).toEqual(['commerce_cashier']);
    expect(decode(accessToken).locale).toBe('en');
  });

  test('French: Fleet Guard personas in French; signInAsPersona(driver) goes through the page and keeps French', async ({ page }, info) => {
    await openPicker(page, 'fleetguard', 'fr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    const list = page.getByRole('list', { name: 'Personnes de démonstration' });
    await expect(list.locator('.persona-name')).toHaveText(labels('fleetguard', 'fr'));
    await expect(page.getByRole('button', { name: 'Utiliser ce compte: Chauffeur' })).toBeVisible();
    await expect(page.getByText('Mot de passe de toutes les personnes ci-dessous')).toBeVisible();
    await expectFits(page, 360);
    await page.screenshot({ path: info.outputPath('picker-360-fr.png'), fullPage: true });

    const { user, accessToken } = await signInAsPersona(page, 'driver', { startUrl: at('fleetguard'), lang: 'fr' });
    expect(user.roles).toEqual(['driver']);
    expect(user.email).toMatch(/^demo\.fleetguard\.driver@/);
    expect(decode(accessToken).locale).toBe('fr');
  });
});

for (const width of [768, 1280]) {
  test(`picker fits at ${width} px (English and French)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const lang of ['en', 'fr']) {
      await openPicker(page, 'commerce', lang);
      await expect(page.locator('.persona-name').first()).toHaveText(labels('commerce', lang)[0]);
      await expectFits(page, width);
    }
  });
}

test('two people in one browser: bank agent then bank officer, each with only their role', async ({ page }) => {
  const agent = await signInAsPersona(page, 'bank-agent', { startUrl: at('commerce') });
  expect(agent.user.roles).toEqual(['bank_agent']);
  const officer = await signInAsPersona(page, 'bank-officer', { startUrl: at('commerce') });
  expect(officer.user.roles).toEqual(['bank_officer']);
  expect(officer.user.tenantId).toBe(agent.user.tenantId);
  expect(officer.user.id).not.toBe(agent.user.id);
});

test('an unknown persona fails with NO_PERSONA and lists the offered ones', async ({ page }) => {
  const error = await signInAsPersona(page, 'astronaut', { startUrl: at('commerce') }).catch(e => e);
  expect(error).toBeInstanceOf(SignInError);
  expect(error.code).toBe('NO_PERSONA');
  expect(error.message).toContain('cashier');
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPlatforms, PRIVATE_VISITOR_PLATFORMS } from '../src/demo-access.mjs';
import { loadConfig } from '../src/config.mjs';

// Publication contract (owner assignment 7 Nov 2026) for the products published next to Commerce
// (VentureWorks added 11 Nov 2026).
// Pins the exact registry entry, OAuth callback/logout URLs, visitor personas and organisations, the
// check-secret variable name and private provisioning. Changing any of these needs a reviewed PR that
// also updates the product and docs/demo-access/DEMO_PUBLICATION_CONTRACT.md.
const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const registryDoc = read('../../../config/demo-access-platforms.json');
const clients = read('../../../config/clients.demo.json').products;
const registry = loadPlatforms({});

const PRODUCTS = {
  commerce: { client: 'commerce-web', slug: 'commerce', host: 'commerce.demo.africadigitalsynergy.com', entry: '/commerce/demo/personas', env: 'DEMO_ACCESS_CHECK_SECRET_COMMERCE',
    personas: { shopper: 'personal', 'shop-owner': 'main', 'shop-manager': 'main', cashier: 'main', accountant: 'main', 'bank-agent': 'bank', 'bank-officer': 'bank' } },
  education: { client: 'education-web', slug: 'education', host: 'education.demo.africadigitalsynergy.com', entry: '/demo/personas', env: 'DEMO_ACCESS_CHECK_SECRET_EDUCATION',
    personas: { 'school-admin': 'main', 'academic-admin': 'main', admissions: 'main', bursar: 'main', teacher: 'main', parent: 'main', student: 'main', applicant: 'main', partner: 'partner' } },
  agriculture: { client: 'agriculture-web', slug: 'agriculture', host: 'agriculture.demo.africadigitalsynergy.com', entry: '/demo/personas', env: 'DEMO_ACCESS_CHECK_SECRET_AGRICULTURE',
    personas: { farmer: 'main', buyer: 'main', 'coop-manager': 'main', 'extension-officer': 'main', agronomist: 'main', 'lender-officer': 'main', 'input-supplier': 'main',
      'farm-reviewer': 'main', 'help-desk': 'main', 'org-admin': 'main', processor: 'main', landowner: 'main', 'demo-colleague': 'main' } },
  tontine: { client: 'tontine-web', slug: 'tontine', host: 'tontine.demo.africadigitalsynergy.com', entry: '/demo/personas', env: 'DEMO_ACCESS_CHECK_SECRET_TONTINE',
    personas: { 'group-admin': 'main', treasurer: 'main', 'payout-approver': 'main', member: 'main', auditor: 'main', 'cooperative-admin': 'cooperative', partner: 'partner' } },
  'fleet-guard': { client: 'fleet-guard-web', slug: 'fleetguard', host: 'fleetguard.demo.africadigitalsynergy.com', entry: '/demo/personas', env: 'DEMO_ACCESS_CHECK_SECRET_FLEET_GUARD',
    personas: { 'fleet-owner': 'main', 'fleet-manager': 'main', approver: 'main', driver: 'main', mechanic: 'main', 'co-owner': 'main', 'lien-holder': 'main', finance: 'main', 'approver-colleague': 'main' } },
  ventureworks: { client: 'ventureworks-web', slug: 'ventureworks', host: 'ventureworks.demo.africadigitalsynergy.com', entry: '/demo/personas', env: 'DEMO_ACCESS_CHECK_SECRET_VENTUREWORKS',
    personas: { founder: 'main', 'venture-manager': 'main', contributor: 'main', 'evidence-reviewer': 'main', 'regulatory-reviewer': 'main' } },
};

describe('demo publication contract: Commerce, Education, Agriculture, Tontine, Fleet Guard, VentureWorks', () => {
  for (const [key, x] of Object.entries(PRODUCTS)) {
    it(`${key}: registry entry, exact origin and persona-page entry URL`, () => {
      const entries = registryDoc.platforms.filter(p => p.key === key);
      assert.equal(entries.length, 1);
      const [e] = entries;
      assert.equal(e.client_id, x.client); assert.equal(e.product_slug, x.slug);
      assert.deepEqual(e.origins, [`https://${x.host}`]);
      assert.equal(e.entry_url, `https://${x.host}${x.entry}`);
    });
    it(`${key}: exact OAuth callback and post-logout URLs for the demo host`, () => {
      const c = clients.filter(c => c.client_id === x.client);
      assert.equal(c.length, 1);
      const callback = `https://${x.host}/`;
      // Identity compares redirect_uri string-for-string (oauth.mjs); the product must send exactly this.
      assert.ok(c[0].redirect_uris.includes(callback), `${key} callback ${callback}`);
      assert.ok(c[0].post_logout_redirect_uris.includes(callback), `${key} logout ${callback}`);
      for (const u of [...c[0].redirect_uris, ...c[0].post_logout_redirect_uris]) {
        const url = new URL(u);
        assert.equal(url.protocol, 'https:'); assert.equal(url.pathname, '/'); assert.equal(url.search + url.hash, '');
        assert.match(url.hostname, /\.(demo|test)\.africadigitalsynergy\.com$/, 'only ADS demo/test hosts');
      }
    });
    it(`${key}: approved visitor personas, organisations and no staff or internal persona`, () => {
      const p = registry.get(key);
      assert.deepEqual(Object.fromEntries(p.personas.map(q => [q.key, q.org])), x.personas);
      const c = clients.find(c => c.client_id === x.client);
      const staffOrgs = new Set(c.demo_orgs.filter(o => o.staff).map(o => o.key));
      for (const q of p.personas) {
        assert.ok(!staffOrgs.has(q.org), `${key}:${q.key} in a staff organisation`);
        assert.ok(!q.roles.some(r => (c.ads_only_roles ?? []).includes(r)), `${key}:${q.key} holds an ADS-only role`);
      }
    });
    it(`${key}: private operator provisioning enabled and its check secret variable name`, () => {
      assert.ok(PRIVATE_VISITOR_PLATFORMS.has(key));
      const env = { IDENTITY_PUBLIC_URL: 'http://127.0.0.1:1', IDENTITY_DEV_MODE: '1', DATABASE_URL: 'postgres://x@127.0.0.1/x', MAIL_TRANSPORT: 'memory' };
      const value = `${key}-name-only-fixture-` + 'z'.repeat(32);
      assert.equal(loadConfig({ ...env, [x.env]: value }).demoAccess.checkSecrets[key.replace(/-/g, '_')], value);
    });
  }
  it('private provisioning covers exactly the published products (no silent extension)', () => {
    assert.deepEqual([...PRIVATE_VISITOR_PLATFORMS].sort(), Object.keys(PRODUCTS).sort());
  });
});

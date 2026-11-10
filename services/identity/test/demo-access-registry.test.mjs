// The demo-access platform registry (config/demo-access-platforms.json): every platform loads against the
// reviewed client and persona lists, and no ADS staff or administrator persona is ever offered to visitors.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPlatforms } from '../src/demo-access.mjs';

const clients = JSON.parse(readFileSync(new URL('../../../config/clients.demo.json', import.meta.url), 'utf8'));
const NEVER_FOR_VISITORS = ['platform-admin', 'tenant-admin', 'support', 'reviewer'];

describe('demo access platform registry', () => {
  const registry = loadPlatforms({});
  it('registers Commerce, Agriculture and the existing demo-access platforms', () => {
    assert.deepEqual([...registry.keys()].sort(), ['agriculture', 'commerce', 'education', 'fleet-guard', 'tontine', 'ventureworks']);
  });
  it('offers no staff or administrator persona, and no ADS-only role', () => {
    for (const p of registry.values()) {
      const client = clients.products.find(c => c.client_id === p.clientId);
      for (const persona of p.personas) {
        assert.ok(!NEVER_FOR_VISITORS.includes(persona.key), `${p.key}:${persona.key}`);
        assert.ok(!(client.ads_only_roles ?? []).some(r => persona.roles.includes(r)), `${p.key}:${persona.key}`);
      }
    }
  });
  // Organisation administrator roles (admin_roles) are not given to the shared demo users' organisations;
  // a visitor receives them only from their persona, inside their own demo organisation.
  it('every visitor persona role exists in its demo organisation or is the product administrator role', () => {
    for (const p of registry.values()) {
      const client = clients.products.find(c => c.client_id === p.clientId);
      for (const persona of p.personas.filter(x => x.org !== 'personal')) {
        const org = client.demo_orgs.find(o => o.key === persona.org);
        for (const role of persona.roles) assert.ok(org.roles.includes(role) || (client.admin_roles ?? []).includes(role), `${p.key}:${persona.key}:${role}`);
      }
    }
  });
  it('each platform lands visitors on its own https persona page', () => {
    for (const p of registry.values()) {
      const origin = new URL(p.entryUrl).origin;
      assert.ok(p.origins.includes(origin), p.key);
      assert.match(p.entryUrl, /^https:\/\/[a-z-]+\.demo\.africadigitalsynergy\.com\/.*demo\/personas$/);
    }
  });
  // Demo parity (10 Nov 2026): Agriculture's ADS staff personas are internal like Commerce's staff-only personas,
  // the visitor list is unchanged, and the product is shown under its owner-chosen name.
  it('Agriculture: reviewer and support are internal ADS staff personas; visitors keep the same ten personas', () => {
    const personas = JSON.parse(readFileSync(new URL('../../../config/demo-personas.json', import.meta.url), 'utf8')).products.agriculture.personas;
    for (const key of ['reviewer', 'support']) {
      const def = personas.find(x => x.key === key);
      assert.equal(def.internal_only, true, key);
      assert.equal(def.org, 'staff', key);
    }
    const agriculture = registry.get('agriculture');
    assert.deepEqual(agriculture.personas.map(x => x.key), ['farmer', 'buyer', 'coop-manager', 'extension-officer', 'lender-officer', 'input-supplier', 'farm-reviewer', 'help-desk', 'org-admin', 'demo-colleague']);
    assert.deepEqual(agriculture.name, { en: 'ADS Agriculture (AfriNourish)', fr: 'ADS Agriculture (AfriNourish)' });
  });
  it('Commerce shop manager card says how refunds are approved (PIN at the till)', () => {
    const def = JSON.parse(readFileSync(new URL('../../../config/demo-personas.json', import.meta.url), 'utf8')).products.commerce.personas.find(x => x.key === 'shop-manager');
    assert.deepEqual(def.hint, { en: 'Approves refunds with a PIN at the till', fr: 'Approuve les remboursements avec un code au point de vente' });
    assert.deepEqual(registry.get('commerce').personas.find(x => x.key === 'shop-manager').hint, def.hint);
  });
});

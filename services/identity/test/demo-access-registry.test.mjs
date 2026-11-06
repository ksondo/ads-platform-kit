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
    assert.deepEqual([...registry.keys()].sort(), ['agriculture', 'commerce', 'education', 'fleet-guard', 'morphoo', 'tontine', 'ventureworks']);
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
});

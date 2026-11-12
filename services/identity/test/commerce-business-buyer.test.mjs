// Commerce business buyers (Commerce #292, AG-W3-5 N1, 12 Nov 2026): the Commerce role commerce_business_buyer
// lets a business (a processor such as a miller or feed maker) buy farm lots at any farm shop once the ADS
// Commerce review team has verified its organisation's business profile. The kit makes the role assignable for
// commerce-web, gives it to the Commerce processor persona and keeps it apart from the reviewer, so the profile a
// processor asks for is always verified by another person. The verified demo profile itself is Commerce data and
// is seeded by Commerce's demo seed (scripts/demo-seed.mjs), not by the kit.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { loadPlatforms } from '../src/demo-access.mjs';
import { demoSettings } from '../src/config.mjs';
import { personaAccounts, validatePersonas } from '../src/demo.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const readConfig = name => JSON.parse(readFileSync(path.resolve(here, '../../../config', name), 'utf8'));
const clients = readConfig('clients.demo.json');
const personasDoc = readConfig('demo-personas.json');
const commerce = clients.products.find(p => p.client_id === 'commerce-web');
const ROLE = 'commerce_business_buyer';
const persona = key => personasDoc.products.commerce.personas.find(p => p.key === key);

describe('Commerce business buyer role (commerce_business_buyer)', () => {
  it('is an assignable commerce-web role, not ADS-only, not self-service and not an admin role', () => {
    assert.ok(commerce.assignable_roles.includes(ROLE));
    assert.ok(!(commerce.ads_only_roles ?? []).includes(ROLE));
    assert.ok(!(commerce.self_service_roles ?? []).includes(ROLE), 'nobody gives it to themselves');
    assert.ok(!(commerce.admin_roles ?? []).includes(ROLE));
  });

  it('is a role of the main demo organisation only, never of the bank or the ADS staff review organisation', () => {
    const orgs = Object.fromEntries(commerce.demo_orgs.map(o => [o.key, o.roles]));
    assert.ok(orgs.main.includes(ROLE));
    assert.ok(!orgs.bank.includes(ROLE));
    assert.ok(!orgs.staff.includes(ROLE));
  });

  it('is held by the processor persona alone, exactly, in the main organisation, with EN and FR labels', () => {
    const p = persona('processor');
    assert.deepEqual({ org: p.org, roles: p.roles }, { org: 'main', roles: [ROLE] });
    assert.equal(p.label.en, 'Processor (business buyer)');
    assert.equal(p.label.fr, 'Transformateur (acheteur professionnel)');
    assert.ok(p.hint.en && p.hint.fr);
    const holders = personasDoc.products.commerce.personas.filter(x => x.roles.includes(ROLE)).map(x => x.key);
    assert.deepEqual(holders, ['processor']);
    validatePersonas(personasDoc, clients);
    const account = personaAccounts(demoSettings({ ADS_ENV: 'demo', DEMO_MODE: '1' }), personasDoc, clients).find(a => a.slug === 'commerce' && a.key === 'processor');
    assert.equal(account.clientId, 'commerce-web');
    assert.deepEqual(account.roles, [ROLE]);
    assert.match(account.email, /^demo\.commerce\.processor@/);
  });

  it('keeps the processor and the reviewer apart: a different persona, organisation and account verifies the profile', () => {
    const buyer = persona('processor');
    const reviewer = persona('reviewer');
    assert.deepEqual({ org: reviewer.org, roles: reviewer.roles }, { org: 'staff', roles: ['commerce_reviewer'] });
    assert.ok(!buyer.roles.includes('commerce_reviewer'), 'the processor cannot verify its own profile');
    assert.ok(!reviewer.roles.includes(ROLE), 'the reviewer does not buy');
    assert.notEqual(buyer.org, reviewer.org);
    const accounts = personaAccounts(demoSettings({ ADS_ENV: 'demo', DEMO_MODE: '1' }), personasDoc, clients).filter(a => a.slug === 'commerce');
    const of = key => accounts.find(a => a.key === key);
    assert.notEqual(of('processor').demoKey, of('reviewer').demoKey);
    assert.notEqual(of('processor').email, of('reviewer').email);
    // No Commerce persona holds both roles.
    assert.ok(!personasDoc.products.commerce.personas.some(x => x.roles.includes(ROLE) && x.roles.includes('commerce_reviewer')));
  });

  it('is refused in the staff organisation and outside the roles of its organisation', () => {
    const withPersona = p => ({ ...personasDoc, products: { commerce: { personas: [...personasDoc.products.commerce.personas.filter(x => x.key !== 'processor'), p] } } });
    const base = persona('processor');
    assert.throws(() => validatePersonas(withPersona({ ...base, org: 'staff' }), clients), /role commerce_business_buyer is not a role of commerce\/staff/);
    assert.throws(() => validatePersonas(withPersona({ ...base, org: 'bank' }), clients), /role commerce_business_buyer is not a role of commerce\/bank/);
  });

  it('is not offered to Commerce visitors until the owner adds it to their persona list (owner rule of 5 Nov 2026: the same seven)', () => {
    const visitor = loadPlatforms({}).get('commerce').personas.map(x => x.key);
    assert.ok(!visitor.includes('processor'));
  });
});

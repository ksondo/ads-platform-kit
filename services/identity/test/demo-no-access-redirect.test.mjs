import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertAccessDenied, browser, createActiveUser, csrfFrom, pkce, registerClient, reqFrom, startService } from './helpers.mjs';

// Demo visitor products (config/demo-access-platforms.json): a signed-in person with no access to the product
// goes back to the product with error=access_denied (RFC 6749 §4.1.2.1) so the product shows its own
// "no access" card. Other products keep the Identity "No access yet" page. Never an open redirect.
const clients = JSON.parse(readFileSync(new URL('../../../config/clients.demo.json', import.meta.url))).products;
const FLEET = 'https://fleetguard.demo.africadigitalsynergy.com/';
const secrets = { commerce: 'commerce-private-fixture-' + 'c'.repeat(40), fleet_guard: 'fleet-guard-private-fixture-' + 'f'.repeat(40) };
const password = 'No-access-fixture-2026';

async function registerDemoClient(pool, id) {
  const c = clients.find(x => x.client_id === id);
  await pool.query(`INSERT INTO platform.oauth_clients(client_id,display_name,redirect_uris,post_logout_redirect_uris,self_service_roles,allow_personal_workspace,admin_roles,assignable_roles,admin_scopes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [c.client_id, c.display_name, c.redirect_uris, c.post_logout_redirect_uris, c.self_service_roles, c.allow_personal_workspace, c.admin_roles ?? [], c.assignable_roles ?? [], c.admin_scopes ?? []]);
  return c;
}
const authorizeQuery = (clientId, redirect, state, extra = {}) => `/authorize?${new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirect,
  state, code_challenge: pkce().challenge, code_challenge_method: 'S256', ...extra })}`;
async function signedIn(svc, email) {
  const b = browser(svc.base), page = await b.get('/login');
  const r = await b.post('/login', { csrf: csrfFrom(page.text), email, password });
  assert.ok([200, 302].includes(r.status), 'signed in');
  return b;
}

describe('demo visitor product: no access returns access_denied to the product', () => {
  let svc;
  before(async () => {
    svc = await startService({ env: { ADS_ENV: 'demo', DEMO_MODE: '1', DEMO_ACCESS_ENABLED: '0', DEMO_ACCESS_PRIVATE_ENABLED: '1',
      DEMO_ACCESS_CHECK_SECRET_COMMERCE: secrets.commerce, DEMO_ACCESS_CHECK_SECRET_FLEET_GUARD: secrets.fleet_guard } });
    for (const id of ['fleet-guard-web', 'commerce-web']) await registerDemoClient(svc.pool, id);
    await registerClient(svc.pool, { id: 'plain-web', redirect: 'https://plain.example.test/app/', selfRoles: [], personal: false });
    await createActiveUser(svc.pool, 'nobody@example.test', password);
  });
  after(async () => { await svc?.stop(); });

  it('Fleet Guard: a signed-in account without a grant is sent back with error=access_denied and the state', async () => {
    const b = await signedIn(svc, 'nobody@example.test');
    const r = await b.get(authorizeQuery('fleet-guard-web', FLEET, 'fg-state-1'));
    const url = assertAccessDenied(r, FLEET, 'fg-state-1', 'NO_DEMO_ACCESS');
    assert.equal(url.searchParams.get('iss'), svc.config.issuer, 'RFC 9207 issuer on the error response too');
    assert.doesNotMatch(r.text, /No access yet/);
    const audit = (await svc.pool.query("SELECT count(*)::int AS n FROM platform.identity_audit WHERE reason='NO_PRODUCT_ACCESS' AND client_id='fleet-guard-web'")).rows[0].n;
    assert.ok(audit >= 1, 'the refusal is still audited');
  });

  it('the refusal also applies at the end of the password sign-in (no SSO session yet)', async () => {
    const b = browser(svc.base);
    const start = await b.get(authorizeQuery('fleet-guard-web', FLEET, 'fg-state-2'));
    assert.ok(start.location.startsWith('/login'));
    const page = await b.get(start.location);
    const posted = await b.post('/login', { csrf: csrfFrom(page.text), req: reqFrom(start.location), email: 'nobody@example.test', password });
    assertAccessDenied(posted, FLEET, 'fg-state-2', 'NO_DEMO_ACCESS');
  });

  it('a visitor of another demo product (Commerce grant only) is refused by Fleet Guard the same way', async () => {
    const { hashPassword } = await import('../src/security.mjs');
    const v = await svc.app.demoAccess.provisionPrivate({ platform: 'commerce', email: 'commerce.only@example.test', passwordHash: await hashPassword(password), operatorRef: 'no-access-test' });
    assert.equal((await svc.app.demoAccess.checkGrant('fleet-guard', v.userId)).access, 'none');
    const b = await signedIn(svc, 'commerce.only@example.test');
    assertAccessDenied(await b.get(authorizeQuery('fleet-guard-web', FLEET, 'fg-state-3')), FLEET, 'fg-state-3', 'NO_DEMO_ACCESS');
  });

  it('a non-demo product keeps the Identity "No access yet" page (403)', async () => {
    const b = await signedIn(svc, 'nobody@example.test');
    const r = await b.get(authorizeQuery('plain-web', 'https://plain.example.test/app/', 'plain-state'));
    assert.equal(r.status, 403);
    assert.equal(r.location, null);
    assert.match(r.text, /No access yet/);
  });

  it('never redirects to an address that is not exactly a registered redirect URI', async () => {
    const b = await signedIn(svc, 'nobody@example.test');
    for (const bad of ['https://evil.example/', 'https://fleetguard.demo.africadigitalsynergy.com/evil', `${FLEET}?next=https://evil.example/`,
      'https://fleetguard.demo.africadigitalsynergy.com.evil.example/', 'http://fleetguard.demo.africadigitalsynergy.com/']) {
      const r = await b.get(authorizeQuery('fleet-guard-web', bad, 'bad-state'));
      assert.equal(r.status, 400, bad);
      assert.equal(r.location, null, 'no redirect for ' + bad);
    }
  });

  it('falls back to the Identity page if the redirect URI was unregistered after the sign-in started', async () => {
    const b = browser(svc.base);
    const start = await b.get(authorizeQuery('fleet-guard-web', FLEET, 'fg-state-4'));
    const page = await b.get(start.location);
    const original = (await svc.pool.query("SELECT redirect_uris FROM platform.oauth_clients WHERE client_id='fleet-guard-web'")).rows[0].redirect_uris;
    await svc.pool.query("UPDATE platform.oauth_clients SET redirect_uris=$1 WHERE client_id='fleet-guard-web'", [original.filter(u => u !== FLEET)]);
    try {
      const posted = await b.post('/login', { csrf: csrfFrom(page.text), req: reqFrom(start.location), email: 'nobody@example.test', password });
      assert.equal(posted.status, 403);
      assert.equal(posted.location, null);
      assert.match(posted.text, /No access yet/);
    } finally {
      await svc.pool.query("UPDATE platform.oauth_clients SET redirect_uris=$1 WHERE client_id='fleet-guard-web'", [original]);
    }
  });
});

describe('without Demo Access (production): the same client keeps the Identity page', () => {
  let svc;
  before(async () => {
    svc = await startService();
    await registerDemoClient(svc.pool, 'fleet-guard-web');
    await createActiveUser(svc.pool, 'nobody@example.test', password);
  });
  after(async () => { await svc?.stop(); });

  it('fleet-guard-web without a role gets the 403 "No access yet" page, not a redirect', async () => {
    const b = await signedIn(svc, 'nobody@example.test');
    const r = await b.get(authorizeQuery('fleet-guard-web', FLEET, 'prod-state'));
    assert.equal(r.status, 403);
    assert.equal(r.location, null);
    assert.match(r.text, /No access yet/);
  });
});

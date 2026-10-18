import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { JSDOM } from 'jsdom';
import { browser, csrfFrom, registerClient, reqFrom, startService } from './helpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sdkSource = await readFile(path.resolve(here, '../../../packages/identity-client/ads-identity.js'), 'utf8');
const PASSWORD = 'Ndole-et-Plantain-2026';

// Loads the browser library into a simulated product page, the way a product would include it.
function productPage(url, svc, clientId, sessionStorageState) {
  const assigned = [];
  const dom = new JSDOM(`<!doctype html><button id="b"></button>`, { url, runScripts: 'outside-only' });
  const { window } = dom;
  Object.defineProperty(window, 'crypto', { value: webcrypto });
  window.fetch = (u, init) => fetch(u, init);
  window.TextEncoder = TextEncoder;
  if (sessionStorageState) for (const [k, v] of Object.entries(sessionStorageState)) window.sessionStorage.setItem(k, v);
  window.adsIdentityConfig = { issuer: svc.base, clientId, redirectUri: 'https://health.example.test/app/' };
  // jsdom cannot navigate across origins; record where the library sends the browser.
  window.__go = u => assigned.push(u);
  window.eval(sdkSource.replaceAll('location.assign(issuer', 'window.__go(issuer'));
  return { window, assigned };
}

describe('browser library (window.adsIdentity)', () => {
  let svc;
  before(async () => {
    svc = await startService({ env: { IDENTITY_REQUIRE_EMAIL_VERIFICATION: 'false' } });
    await registerClient(svc.pool);
    const b = browser(svc.base);
    const reg = await b.get('/register');
    await b.post('/register', { csrf: csrfFrom(reg.text), email: 'nina@example.cm', password: PASSWORD, confirm: PASSWORD });
  });
  after(async () => { await svc.stop(); });

  it('signs in, returns a token the product can send, survives a reload and signs out', async () => {
    // 1. Product page: not signed in yet.
    const first = productPage('https://health.example.test/app/', svc, 'health-web');
    await first.window.adsIdentity.ready;
    assert.equal(await first.window.adsIdentity.getAccessToken(), null);
    await first.window.adsIdentity.signIn();
    const authorizeUrl = first.assigned.at(-1);
    assert.ok(authorizeUrl.startsWith(`${svc.base}/authorize?`));
    assert.equal(new URL(authorizeUrl).searchParams.get('code_challenge_method'), 'S256');

    // 2. The user signs in on the hosted page.
    const b = browser(svc.base);
    const toLogin = await b.get(authorizeUrl);
    const page = await b.get(toLogin.location);
    const done = await b.post('/login', { csrf: csrfFrom(page.text), req: reqFrom(toLogin.location), email: 'nina@example.cm', password: PASSWORD });
    assert.ok(done.location.startsWith('https://health.example.test/app/?code='));

    // 3. Back on the product page (same tab: sessionStorage carries the PKCE verifier).
    const saved = {};
    for (let i = 0; i < first.window.sessionStorage.length; i += 1) {
      const k = first.window.sessionStorage.key(i);
      saved[k] = first.window.sessionStorage.getItem(k);
    }
    const back = productPage(done.location, svc, 'health-web', saved);
    await back.window.adsIdentity.ready;
    const token = await back.window.adsIdentity.getAccessToken();
    assert.equal(typeof token, 'string');
    assert.equal(token.split('.').length, 3);
    assert.equal(back.window.location.search, '', 'code removed from the address bar');
    const user = back.window.adsIdentity.getUser();
    assert.equal(user.email, 'nina@example.cm');
    assert.deepEqual([...user.roles], ['patient']);
    assert.equal(back.window.localStorage.length, 0, 'nothing stored in localStorage');

    // 4. Reload: memory is gone but the tab's refresh token gets a new access token.
    const reloadState = {};
    for (let i = 0; i < back.window.sessionStorage.length; i += 1) {
      const k = back.window.sessionStorage.key(i);
      reloadState[k] = back.window.sessionStorage.getItem(k);
    }
    const reloaded = productPage('https://health.example.test/app/', svc, 'health-web', reloadState);
    await reloaded.window.adsIdentity.ready;
    const token2 = await reloaded.window.adsIdentity.getAccessToken();
    assert.equal(typeof token2, 'string');
    assert.notEqual(token2, token);

    // 5. Sign out revokes the refresh token and goes through the login domain's logout.
    await reloaded.window.adsIdentity.signOut();
    assert.ok(reloaded.assigned.at(-1).startsWith(`${svc.base}/logout?client_id=health-web`));
    assert.equal(await reloaded.window.adsIdentity.getAccessToken(), null);
    const revoked = await fetch(`${svc.base}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: reloadState['ads-identity:health-web:refresh'], client_id: 'health-web' }) });
    assert.equal(revoked.status, 400);
  });

  it('matches what existing ADS product screens expect', async () => {
    const page = productPage('https://health.example.test/app/', svc, 'health-web');
    // Same check as src/public/workspace.js in the template repos.
    assert.equal(typeof page.window.adsIdentity?.getAccessToken, 'function');
  });
});

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
function productPage(url, svc, clientId, sessionStorageState, extraConfig = {}) {
  const assigned = [];
  const dom = new JSDOM(`<!doctype html><button id="b"></button>`, { url, runScripts: 'outside-only' });
  const { window } = dom;
  Object.defineProperty(window, 'crypto', { value: webcrypto });
  window.fetch = (u, init) => fetch(u, init);
  window.TextEncoder = TextEncoder;
  if (sessionStorageState) for (const [k, v] of Object.entries(sessionStorageState)) window.sessionStorage.setItem(k, v);
  window.adsIdentityConfig = { issuer: svc.base, clientId, redirectUri: 'https://health.example.test/app/', ...extraConfig };
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

  // Demo visitor products: Identity answers a sign-in without access with error=access_denied (RFC 6749 4.1.2.1).
  describe('a refused sign-in (error=access_denied)', () => {
    const KEY = 'ads-identity:health-web';
    const started = (state, returnTo = '/app/demo/personas?lang=fr') => ({ [`${KEY}:pkce:${state}`]: JSON.stringify({ verifier: 'v'.repeat(64), returnTo }) });
    const back = (q, svcBase) => `https://health.example.test/app/?${new URLSearchParams({ error: 'access_denied', state: 'S1', iss: svcBase, ...q })}`;

    it('exposes the error, cleans the address, keeps the return path and does not sign in again (autoSignIn)', async () => {
      const page = productPage(back({ error_description: 'NO_DEMO_ACCESS' }, svc.base), svc, 'health-web', started('S1'), { autoSignIn: true });
      await page.window.adsIdentity.ready;
      assert.deepEqual({ ...page.window.adsIdentity.getLastError() }, { error: 'access_denied', description: 'NO_DEMO_ACCESS' });
      assert.equal(page.assigned.length, 0, 'no new sign-in: a refusal never loops back to Identity');
      assert.equal(page.window.location.pathname + page.window.location.search, '/app/demo/personas?lang=fr', 'return path kept, error removed');
      assert.equal(page.window.adsIdentity.isSignedIn(), false);
      assert.equal(await page.window.adsIdentity.getAccessToken(), null);
      // Survives a reload of the same tab; signIn() starts afresh and forgets it.
      const saved = { [`${KEY}:error`]: page.window.sessionStorage.getItem(`${KEY}:error`) };
      const reloaded = productPage('https://health.example.test/app/demo/personas', svc, 'health-web', saved, { autoSignIn: true });
      await reloaded.window.adsIdentity.ready;
      assert.equal(reloaded.assigned.length, 0);
      assert.equal(reloaded.window.adsIdentity.getLastError().error, 'access_denied');
      await reloaded.window.adsIdentity.signIn();
      assert.equal(reloaded.window.adsIdentity.getLastError(), null);
      assert.equal(reloaded.assigned.length, 1);
    });

    it('clearLastError() and signOut() forget it', async () => {
      const page = productPage(back({ error_description: 'DEMO_ACCESS_EXPIRED' }, svc.base), svc, 'health-web', started('S1'));
      await page.window.adsIdentity.ready;
      assert.equal(page.window.adsIdentity.getLastError().description, 'DEMO_ACCESS_EXPIRED');
      page.window.adsIdentity.clearLastError();
      assert.equal(page.window.adsIdentity.getLastError(), null);
      const again = productPage(back({}, svc.base), svc, 'health-web', started('S1'));
      await again.window.adsIdentity.ready;
      assert.deepEqual({ ...again.window.adsIdentity.getLastError() }, { error: 'access_denied', description: null });
      await again.window.adsIdentity.signOut();
      assert.equal(again.window.adsIdentity.getLastError(), null);
    });

    it('ignores an error for a sign-in this tab did not start, from another issuer, or with an unexpected shape', async () => {
      for (const [url, storage] of [
        [back({ error_description: 'NO_DEMO_ACCESS' }, svc.base), {}],
        [back({ error_description: 'NO_DEMO_ACCESS' }, 'https://evil.example'), started('S1')],
        [back({ error: '<b>x</b>' }, svc.base), started('S1')],
      ]) {
        const page = productPage(url, svc, 'health-web', storage);
        await page.window.adsIdentity.ready;
        assert.equal(page.window.adsIdentity.getLastError(), null, url);
        assert.equal(page.window.location.search.includes('error'), false, 'error removed from the address');
      }
      const odd = productPage(back({ error_description: '<script>alert(1)</script>' }, svc.base), svc, 'health-web', started('S1'));
      await odd.window.adsIdentity.ready;
      assert.deepEqual({ ...odd.window.adsIdentity.getLastError() }, { error: 'access_denied', description: null }, 'free text is never kept');
    });
  });
});

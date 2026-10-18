import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { JSDOM } from 'jsdom';
import { createActiveUser, refreshWith, registerClient, signInTokens, startService } from './helpers.mjs';

// Regression for the Fleet Guard E2E finding: reloading a product page twice quickly while
// ads-identity.js renews its tokens made the identity service treat the renewal as refresh-token
// theft and sign the user out. Fix: idempotent rotation within a short grace window on the server,
// single-flight refresh shared across tabs in the client. Theft detection must stay intact.

const here = path.dirname(fileURLToPath(import.meta.url));
const sdkSource = await readFile(path.resolve(here, '../../../packages/identity-client/ads-identity.js'), 'utf8');
const PASSWORD = 'Ndole-et-Plantain-2026';
const KEY = 'ads-identity:health-web:refresh';
const auditCount = async (svc, reason) => (await svc.pool.query('SELECT count(*)::int AS n FROM platform.identity_audit WHERE reason=$1', [reason])).rows[0].n;

describe('refresh token rotation: grace window (server)', () => {
  let svc;
  let client;
  let n = 0;
  const tokens = async () => {
    n += 1;
    const u = await createActiveUser(svc.pool, `rot-${n}@example.cm`, PASSWORD);
    return signInTokens(svc, client, { email: u.email, password: PASSWORD });
  };
  before(async () => {
    svc = await startService();
    client = await registerClient(svc.pool);
  });
  after(async () => { await svc.stop(); });

  it('the previous token presented again right away returns the SAME successor (reload race)', async () => {
    const first = await tokens();
    const second = await refreshWith(svc, client.id, first.refresh_token);
    assert.equal(second.status, 200);
    const replay = await refreshWith(svc, client.id, first.refresh_token);
    assert.equal(replay.status, 200, 'not treated as theft');
    assert.equal(replay.body.refresh_token, second.body.refresh_token, 'idempotent: same successor');
    assert.equal(replay.body.access_token.split('.').length, 3);
    const third = await refreshWith(svc, client.id, second.body.refresh_token);
    assert.equal(third.status, 200, 'the family is still alive');
    assert.ok(await auditCount(svc, 'refresh_token_grace_replay') >= 1, 'the replay is audited');
  });

  it('two simultaneous renewals with the same token both succeed with one successor', async () => {
    const first = await tokens();
    const results = await Promise.all([1, 2, 3].map(() => refreshWith(svc, client.id, first.refresh_token)));
    assert.deepEqual(results.map(r => r.status), [200, 200, 200]);
    assert.equal(new Set(results.map(r => r.body.refresh_token)).size, 1);
  });

  it('reuse AFTER the grace window still revokes the whole family', async () => {
    const first = await tokens();
    const second = await refreshWith(svc, client.id, first.refresh_token);
    await svc.pool.query("UPDATE platform.refresh_tokens SET rotated_at=now()-interval '31 seconds' WHERE token_hash=encode(sha256($1::bytea),'hex')", [first.refresh_token]);
    const before = await auditCount(svc, 'refresh_reuse_detected');
    assert.equal((await refreshWith(svc, client.id, first.refresh_token)).status, 400);
    assert.equal((await refreshWith(svc, client.id, second.body.refresh_token)).status, 400, 'family revoked');
    assert.equal(await auditCount(svc, 'refresh_reuse_detected'), before + 1);
  });

  it('reuse of an older token, or of the previous one once its successor was used, revokes the family', async () => {
    const first = await tokens();
    const second = await refreshWith(svc, client.id, first.refresh_token);
    const third = await refreshWith(svc, client.id, second.body.refresh_token);
    assert.equal(third.status, 200);
    // Within the window, but `second` (first's successor) was already rotated: someone else has it.
    assert.equal((await refreshWith(svc, client.id, first.refresh_token)).status, 400);
    assert.equal((await refreshWith(svc, client.id, third.body.refresh_token)).status, 400, 'family revoked');

    const a = await tokens();
    const b = await refreshWith(svc, client.id, a.refresh_token);
    const c = await refreshWith(svc, client.id, b.body.refresh_token);
    assert.equal((await refreshWith(svc, client.id, b.body.refresh_token)).status, 200, 'b is c\'s predecessor, in its window');
    await refreshWith(svc, client.id, c.body.refresh_token); // c -> d
    assert.equal((await refreshWith(svc, client.id, a.refresh_token)).status, 400, 'two generations old');
  });

  it('a revoked (signed-out) family gets nothing in the grace window', async () => {
    const first = await tokens();
    await refreshWith(svc, client.id, first.refresh_token);
    await fetch(`${svc.base}/revoke`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: first.refresh_token, client_id: client.id }) });
    assert.equal((await refreshWith(svc, client.id, first.refresh_token)).status, 400);
  });

  it('stores the successor sealed, never in clear', async () => {
    const first = await tokens();
    const second = await refreshWith(svc, client.id, first.refresh_token);
    const row = (await svc.pool.query("SELECT successor_sealed FROM platform.refresh_tokens WHERE token_hash=encode(sha256($1::bytea),'hex')", [first.refresh_token])).rows[0];
    assert.ok(row.successor_sealed);
    assert.ok(!row.successor_sealed.includes(second.body.refresh_token));
    await svc.pool.query("UPDATE platform.refresh_tokens SET rotated_at=now()-interval '10 minutes' WHERE token_hash=encode(sha256($1::bytea),'hex')", [first.refresh_token]);
    await svc.app.purgeExpired();
    const wiped = (await svc.pool.query("SELECT successor_sealed FROM platform.refresh_tokens WHERE token_hash=encode(sha256($1::bytea),'hex')", [first.refresh_token])).rows[0];
    assert.equal(wiped.successor_sealed, null, 'wiped after the grace window');
  });

  it('IDENTITY_REFRESH_REUSE_GRACE_SECONDS=0 turns the window off (strict rotation)', async () => {
    const strict = await startService({ env: { IDENTITY_REFRESH_REUSE_GRACE_SECONDS: '0' } });
    try {
      const c2 = await registerClient(strict.pool);
      await createActiveUser(strict.pool, 'strict@example.cm', PASSWORD);
      const first = await signInTokens(strict, c2, { email: 'strict@example.cm', password: PASSWORD });
      await refreshWith(strict, c2.id, first.refresh_token);
      assert.equal((await refreshWith(strict, c2.id, first.refresh_token)).status, 400);
    } finally {
      await strict.stop();
    }
  });
});

// ---- browser library ----

// A lock manager shared by "tabs" (the Web Locks API, which jsdom does not have).
function sharedLocks() {
  const tails = new Map();
  return {
    request(name, _opts, fn) {
      const prev = tails.get(name) ?? Promise.resolve();
      const run = prev.then(() => fn());
      tails.set(name, run.catch(() => {}));
      return run;
    },
  };
}
// Node's BroadcastChannel delivers between jsdom windows in this process; unref so tests can exit.
class TestChannel extends BroadcastChannel {
  constructor(name) { super(name); this.unref?.(); }
}

function productTab(svc, storage, { fetchImpl, locks, channel = true } = {}) {
  const dom = new JSDOM('<!doctype html>', { url: 'https://health.example.test/app/', runScripts: 'outside-only' });
  const { window } = dom;
  Object.defineProperty(window, 'crypto', { value: webcrypto });
  window.TextEncoder = TextEncoder;
  window.fetch = fetchImpl ?? ((u, init) => fetch(u, init));
  if (channel) window.BroadcastChannel = TestChannel;
  if (locks) Object.defineProperty(window.navigator, 'locks', { value: locks });
  for (const [k, v] of Object.entries(storage)) window.sessionStorage.setItem(k, v);
  window.adsIdentityConfig = { issuer: svc.base, clientId: 'health-web', redirectUri: 'https://health.example.test/app/' };
  window.eval(sdkSource);
  return window;
}

describe('browser library: renewal during reloads and across tabs', () => {
  let svc;
  let client;
  let n = 0;
  const start = async s => {
    n += 1;
    await createActiveUser(s.pool, `tab-${n}@example.cm`, PASSWORD);
    return signInTokens(s, client, { email: `tab-${n}@example.cm`, password: PASSWORD });
  };
  before(async () => {
    svc = await startService();
    client = await registerClient(svc.pool);
  });
  after(async () => { await svc.stop(); });

  it('rapid double reload: the first page is gone before its renewal answer arrives, the next page stays signed in', async () => {
    const t = await start(svc);
    // Page 1 starts renewing; the server rotates the token, but the page is reloaded before the
    // response reaches it (the answer is lost), so sessionStorage still holds the old token.
    let reachedServer;
    const rotatedOnServer = new Promise(r => { reachedServer = r; });
    productTab(svc, { [KEY]: t.refresh_token }, { fetchImpl: (u, init) => { fetch(u, init).then(r => r.text()).then(reachedServer); return new Promise(() => {}); } });
    await rotatedOnServer;

    // Page 2 (the second reload) renews with the same old token from sessionStorage.
    const page2 = productTab(svc, { [KEY]: t.refresh_token });
    await page2.adsIdentity.ready;
    const token = await page2.adsIdentity.getAccessToken();
    assert.equal(typeof token, 'string', 'still signed in after the double reload');
    assert.equal(page2.adsIdentity.getUser().email, `tab-${n}@example.cm`);
    // And the session keeps working afterwards (the family was not revoked).
    assert.equal(typeof await page2.adsIdentity.getAccessToken({ forceRefresh: true }), 'string');
    assert.equal(await auditCount(svc, 'refresh_reuse_detected'), 0);
  });

  it('a network failure during renewal keeps the session for the next try', async () => {
    const t = await start(svc);
    let fail = true;
    const page = productTab(svc, { [KEY]: t.refresh_token }, { fetchImpl: (u, init) => (fail ? Promise.reject(new TypeError('Failed to fetch')) : fetch(u, init)) });
    await page.adsIdentity.ready;
    assert.equal(await page.adsIdentity.getAccessToken(), null);
    assert.equal(page.sessionStorage.getItem(KEY), t.refresh_token, 'refresh token kept');
    fail = false;
    assert.equal(typeof await page.adsIdentity.getAccessToken(), 'string');
  });

  it('a definite refusal from the identity service still signs the page out', async () => {
    const t = await start(svc);
    await fetch(`${svc.base}/revoke`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: t.refresh_token, client_id: 'health-web' }) });
    const page = productTab(svc, { [KEY]: t.refresh_token });
    await page.adsIdentity.ready;
    assert.equal(await page.adsIdentity.getAccessToken(), null);
    assert.equal(page.sessionStorage.getItem(KEY), null);
  });

  // With the server grace window OFF, only the client's cross-tab coordination prevents a
  // duplicated tab from presenting a token its twin already rotated.
  it('duplicated tabs share one renewal (lock + broadcast), even with the server grace window off', async () => {
    const strict = await startService({ env: { IDENTITY_REFRESH_REUSE_GRACE_SECONDS: '0' } });
    try {
      await registerClient(strict.pool);
      const t = await start(strict);
      const locks = sharedLocks();
      let calls = 0;
      const counting = (u, init) => { calls += 1; return fetch(u, init); };
      // "Duplicate tab": both tabs start with a copy of the same sessionStorage and load at once.
      const a = productTab(strict, { [KEY]: t.refresh_token }, { locks, fetchImpl: counting });
      const b = productTab(strict, { [KEY]: t.refresh_token }, { locks, fetchImpl: counting });
      await Promise.all([a.adsIdentity.ready, b.adsIdentity.ready]);
      assert.equal(typeof await a.adsIdentity.getAccessToken(), 'string');
      assert.equal(typeof await b.adsIdentity.getAccessToken(), 'string');
      assert.equal(calls, 1, 'one renewal for both tabs');
      assert.equal(a.sessionStorage.getItem(KEY), b.sessionStorage.getItem(KEY), 'both hold the successor');

      // Later renewals in either tab keep both in step.
      assert.equal(typeof await a.adsIdentity.getAccessToken({ forceRefresh: true }), 'string');
      await new Promise(r => setTimeout(r, 50));
      assert.equal(typeof await b.adsIdentity.getAccessToken({ forceRefresh: true }), 'string');
      await new Promise(r => setTimeout(r, 50));
      assert.equal(a.sessionStorage.getItem(KEY), b.sessionStorage.getItem(KEY));
      assert.equal((await strict.pool.query("SELECT count(*)::int AS n FROM platform.identity_audit WHERE reason='refresh_reuse_detected'")).rows[0].n, 0);
    } finally {
      await strict.stop();
    }
  });
});

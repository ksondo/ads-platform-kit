import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { activate, browser, csrfFrom, linkFrom, mailCount, nextMail, pkce, registerClient, reqFrom, startService } from './helpers.mjs';
import { RateLimiter } from '../src/security.mjs';

// Regression tests for the findings of the independent security review (18 Oct 2026).
const PASSWORD = 'Ndole-et-Plantain-2026';

async function register(svc, email, password) {
  const b = browser(svc.base);
  const page = await b.get('/register');
  return b.post('/register', { csrf: csrfFrom(page.text), email, password, confirm: password });
}
async function authorize(b, client, extra = {}) {
  const { verifier, challenge } = pkce();
  const auth = await b.get(`/authorize?${new URLSearchParams({ response_type: 'code', client_id: client.id, redirect_uri: client.redirect, state: 'st', code_challenge: challenge, code_challenge_method: 'S256', ...extra })}`);
  return { auth, verifier };
}
async function login(b, location, email, password) {
  const page = await b.get(location);
  return b.post('/login', { csrf: csrfFrom(page.text), req: reqFrom(location) ?? '', email, password });
}
async function tokenFor(svc, client, location, verifier) {
  const code = new URL(location).searchParams.get('code');
  const res = await fetch(`${svc.base}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: client.id, redirect_uri: client.redirect }) });
  return res.json();
}
const claims = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));

describe('security review regressions', () => {
  let svc;
  let client;
  before(async () => {
    svc = await startService();
    client = await registerClient(svc.pool);
  });
  after(async () => { await svc.stop(); });

  it('H1: a pre-registration with an attacker password cannot become the owner account', async () => {
    const victim = 'victim@corp.test';
    await register(svc, victim, 'attacker-password-77');
    const attackerMail = await nextMail(svc, victim);
    await register(svc, victim, PASSWORD);
    const ownerMail = await nextMail(svc, victim, 1);
    // The owner opens the attacker-triggered link but types their own password: refused.
    const wrongLink = await activate(browser(svc.base), linkFrom(attackerMail, '/verify-email'), PASSWORD);
    assert.match(wrongLink.text, /incorrect/);
    // The owner's own link with their own password works.
    const ok = await activate(browser(svc.base), linkFrom(ownerMail, '/verify-email'), PASSWORD);
    assert.match(ok.text, /You are signed in/);
    const b = browser(svc.base);
    const { auth } = await authorize(b, client);
    const attacker = await login(b, auth.location, victim, 'attacker-password-77');
    assert.match(attacker.text, /incorrect/, 'attacker password does not work');
    const { auth: auth2 } = await authorize(b, client);
    const owner = await login(b, auth2.location, victim, PASSWORD);
    assert.ok(owner.location?.startsWith(client.redirect));
  });

  it('H1: right password before confirming sends a fresh link for that registration', async () => {
    await register(svc, 'late@corp.test', PASSWORD);
    const before = mailCount(svc, 'late@corp.test');
    const b = browser(svc.base);
    const { auth } = await authorize(b, client);
    const res = await login(b, auth.location, 'late@corp.test', PASSWORD);
    assert.match(res.text, /We just sent you a new link/);
    const fresh = await nextMail(svc, 'late@corp.test', before);
    const ok = await activate(b, linkFrom(fresh, '/verify-email'), PASSWORD);
    assert.ok(ok.location?.startsWith(client.redirect), 'activation continues to the product');
  });

  it('H2: self-service roles do not apply in organisation workspaces', async () => {
    await register(svc, 'teacher@school.test', PASSWORD);
    await activate(browser(svc.base), linkFrom(await nextMail(svc, 'teacher@school.test'), '/verify-email'), PASSWORD);
    const uid = (await svc.pool.query("SELECT id FROM platform.users WHERE email='teacher@school.test'")).rows[0].id;
    const org = crypto.randomUUID();
    const tenant = crypto.randomUUID();
    await svc.pool.query("INSERT INTO platform.organizations(id,name,slug) VALUES ($1,'School','school-x')", [org]);
    await svc.pool.query("INSERT INTO platform.tenants(id,organization_id,name) VALUES ($1,$2,'School')", [tenant, org]);
    await svc.pool.query("INSERT INTO platform.memberships(user_id,tenant_id,role) VALUES ($1,$2,'member')", [uid, tenant]);
    const b = browser(svc.base);
    const { auth, verifier } = await authorize(b, client, { tenant_hint: tenant });
    const done = await login(b, auth.location, 'teacher@school.test', PASSWORD);
    const tokens = await tokenFor(svc, client, done.location, verifier);
    const c = claims(tokens.access_token);
    assert.notEqual(c.tenant_id, tenant, 'no token for the school workspace without a grant');
    const kind = (await svc.pool.query('SELECT o.kind FROM platform.tenants t JOIN platform.organizations o ON o.id=t.organization_id WHERE t.id=$1', [c.tenant_id])).rows[0].kind;
    assert.equal(kind, 'personal');
  });

  it('M6: email addresses with display names or lists are rejected', async () => {
    const res = await register(svc, 'x<attacker@evil.com>', PASSWORD);
    assert.match(res.text, /valid email/);
  });

  it('M8: a sign-in request started in another browser does not continue to the product', async () => {
    const attacker = browser(svc.base);
    const { auth } = await authorize(attacker, client);
    const victim = browser(svc.base);
    const res = await login(victim, auth.location, 'victim@corp.test', PASSWORD);
    assert.equal(res.status, 200);
    assert.match(res.text, /You are signed in/, 'signed in on the login site only; no code sent anywhere');
  });

  it('L9: the language link only points to known pages', async () => {
    const res = await fetch(`${svc.base}/.//evil.com/x`, { headers: { accept: 'text/html' } });
    const html = await res.text();
    assert.doesNotMatch(html, /href="\/\/evil\.com/);
  });

  it('L10: a bare sign-out link asks for confirmation instead of signing out', async () => {
    const b = browser(svc.base);
    const { auth } = await authorize(b, client);
    await login(b, auth.location, 'victim@corp.test', PASSWORD);
    const page = await b.get('/logout');
    assert.match(page.text, /Sign out\?/);
    const { auth: again } = await authorize(b, client);
    assert.ok(again.location.startsWith(client.redirect), 'still signed in');
    await b.post('/logout', { csrf: csrfFrom(page.text) });
    const { auth: third } = await authorize(b, client);
    assert.ok(third.location.startsWith('/login'), 'signed out after confirming');
  });

  it('L12: a malformed cookie does not break the site', async () => {
    const res = await fetch(`${svc.base}/login`, { headers: { cookie: 'ads_csrf=%E0%A4%A' } });
    assert.equal(res.status, 200);
  });

  it('L15: signing in again ends the previous session in that browser', async () => {
    const b = browser(svc.base);
    const { auth } = await authorize(b, client);
    await login(b, auth.location, 'victim@corp.test', PASSWORD);
    const first = b.jar.get('ads_sso');
    const { auth: forced } = await authorize(b, client, { prompt: 'login' });
    await login(b, forced.location, 'victim@corp.test', PASSWORD);
    b.jar.set('ads_sso', first);
    const { auth: replay } = await authorize(b, client);
    assert.ok(replay.location.startsWith('/login'), 'old session cookie no longer works');
  });
});

describe('H3: proxy address handling', () => {
  let svc;
  before(async () => { svc = await startService({ env: { IDENTITY_TRUST_PROXY: 'true', IDENTITY_LIMIT_REGISTER_PER_IP: '3' } }); });
  after(async () => { await svc.stop(); });

  it('ignores client-supplied X-Forwarded-For entries when rate limiting', async () => {
    const statuses = [];
    for (let i = 0; i < 6; i += 1) {
      const res = await fetch(`${svc.base}/v1/identity/register`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${i}, 203.0.113.9` },
        body: JSON.stringify({ email: `p${i}@corp.test`, password: PASSWORD }),
      });
      statuses.push(res.status);
    }
    assert.ok(statuses.includes(429), `expected a 429 once the real (right-most) address hit the limit, got ${statuses}`);
  });
});

describe('M4: rate limiter memory', () => {
  it('stays bounded under a flood of distinct keys', () => {
    const limiter = new RateLimiter(() => 0, 1000);
    for (let i = 0; i < 20000; i += 1) limiter.hit(`k${i}`, 5, 60000);
    assert.ok(limiter.buckets.size <= 1000, `size ${limiter.buckets.size}`);
  });
});

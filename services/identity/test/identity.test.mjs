import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { hashPassword } from '../src/security.mjs';
import { activate, browser, csrfFrom, linkFrom, mailCount, nextMail, pkce, productVerifiedClaims, registerClient, reqFrom, startService } from './helpers.mjs';

const PASSWORD = 'Ndole-et-Plantain-2026';

// Drives the hosted pages like a browser: authorize -> login -> back to the product with a code.
async function signInFlow(svc, b, client, { email, password = PASSWORD, extra = {} } = {}) {
  const { verifier, challenge } = pkce();
  const q = new URLSearchParams({ response_type: 'code', client_id: client.id, redirect_uri: client.redirect, state: 'st-1', code_challenge: challenge, code_challenge_method: 'S256', ...extra });
  const auth = await b.get(`/authorize?${q}`);
  let location = auth.location;
  if (location.startsWith('/login')) {
    const page = await b.get(location);
    const posted = await b.post('/login', { csrf: csrfFrom(page.text), req: reqFrom(location), email, password });
    return { posted, verifier, location: posted.location };
  }
  return { posted: auth, verifier, location };
}
async function exchange(svc, client, location, verifier) {
  const code = new URL(location).searchParams.get('code');
  const res = await fetch(`${svc.base}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: client.id, redirect_uri: client.redirect }) });
  return { status: res.status, body: await res.json(), code };
}
async function registerAndActivate(svc, email, password = PASSWORD) {
  const b = browser(svc.base);
  const before = mailCount(svc, email);
  const page = await b.get('/register');
  const done = await b.post('/register', { csrf: csrfFrom(page.text), email, password, confirm: password, name: 'Test User' });
  assert.equal(done.status, 200);
  const mail = await nextMail(svc, email, before);
  const verify = await activate(b, linkFrom(mail, '/verify-email'), password);
  assert.equal(verify.status, 200);
}

describe('ADS identity service', () => {
  let svc;
  let client;
  before(async () => {
    svc = await startService();
    client = await registerClient(svc.pool);
  });
  after(async () => { await svc.stop(); });

  it('registers, blocks sign-in until the email is confirmed, then activates', async () => {
    const b = browser(svc.base);
    const reg = await b.get('/register');
    assert.match(reg.text, /Create your account/);
    const done = await b.post('/register', { csrf: csrfFrom(reg.text), email: 'Amina@Example.cm', password: PASSWORD, confirm: PASSWORD });
    assert.equal(done.status, 200);
    assert.match(done.text, /Check your email/);
    const mail = await nextMail(svc, 'amina@example.cm');
    assert.match(mail.subject, /Activate your account \/ Activez votre compte/);

    const login = await b.get('/login');
    const blocked = await b.post('/login', { csrf: csrfFrom(login.text), email: 'amina@example.cm', password: PASSWORD });
    assert.match(blocked.text, /confirm your email first/);

    const opened = await b.get(linkFrom(mail, '/verify-email'));
    assert.match(opened.text, /Confirm your email/, 'opening the link alone does not activate (mail scanners)');
    assert.equal((await svc.pool.query("SELECT status FROM platform.users WHERE email='amina@example.cm'")).rows[0].status, 'pending');
    const wrong = await activate(b, linkFrom(mail, '/verify-email'), 'not-the-password-1');
    assert.match(wrong.text, /incorrect/);
    const verified = await activate(b, linkFrom(mail, '/verify-email'), PASSWORD);
    assert.match(verified.text, /You are signed in/);
    const reused = await b.get(linkFrom(mail, '/verify-email'));
    assert.equal(reused.status, 400, 'activation link works once');
    const status = (await svc.pool.query("SELECT status, email_verified_at FROM platform.users WHERE email='amina@example.cm'")).rows[0];
    assert.equal(status.status, 'active');
    assert.ok(status.email_verified_at);
  });

  it('does not reveal whether an email already has an account', async () => {
    const b = browser(svc.base);
    const reg = await b.get('/register');
    const again = await b.post('/register', { csrf: csrfFrom(reg.text), email: 'amina@example.cm', password: PASSWORD, confirm: PASSWORD });
    assert.equal(again.status, 200);
    assert.match(again.text, /Check your email/);
    assert.match((await nextMail(svc, 'amina@example.cm', 1)).subject, /Reset your password/, 'existing active account gets a reset link instead');
  });

  it('rejects forms without the CSRF token and weak or mismatched passwords', async () => {
    const b = browser(svc.base);
    await b.get('/register');
    const noCsrf = await b.post('/register', { email: 'x@example.cm', password: PASSWORD, confirm: PASSWORD });
    assert.match(noCsrf.text, /This form expired/);
    const page = await b.get('/register');
    const short = await b.post('/register', { csrf: csrfFrom(page.text), email: 'x@example.cm', password: 'short', confirm: 'short' });
    assert.match(short.text, /too short/);
    const mismatch = await b.post('/register', { csrf: csrfFrom(page.text), email: 'x@example.cm', password: PASSWORD, confirm: PASSWORD + 'x' });
    assert.match(mismatch.text, /do not match/);
  });

  it('signs a user into a product and issues a token the product repos accept', async () => {
    const b = browser(svc.base);
    const { location, verifier } = await signInFlow(svc, b, client, { email: 'amina@example.cm' });
    assert.ok(location.startsWith(client.redirect), `redirected back to the product, got ${location}`);
    const back = new URL(location);
    assert.equal(back.searchParams.get('state'), 'st-1');
    assert.equal(back.searchParams.get('iss'), svc.base);

    const { status, body, code } = await exchange(svc, client, location, verifier);
    assert.equal(status, 200);
    assert.equal(body.token_type, 'Bearer');
    const jwks = createRemoteJWKSet(new URL(`${svc.base}/.well-known/jwks.json`));
    const { payload, protectedHeader } = await jwtVerify(body.access_token, jwks, { issuer: svc.base, audience: client.id, algorithms: ['RS256', 'ES256'] });
    assert.equal(protectedHeader.alg, 'RS256');
    const claims = productVerifiedClaims(payload);
    assert.deepEqual(claims.roles, ['patient'], 'self-service role from the client registration');
    assert.equal(payload.email, 'amina@example.cm');

    const replay = await exchange(svc, client, `${client.redirect}?code=${code}`, verifier);
    assert.equal(replay.status, 400, 'a code works once');
  });

  it('rejects a wrong PKCE verifier, an unregistered return address and an unknown product', async () => {
    const b = browser(svc.base);
    const { location } = await signInFlow(svc, b, client, { email: 'amina@example.cm' });
    const wrong = await exchange(svc, client, location, pkce().verifier);
    assert.equal(wrong.status, 400);
    const { challenge } = pkce();
    const bad = await b.get(`/authorize?${new URLSearchParams({ response_type: 'code', client_id: client.id, redirect_uri: 'https://evil.example/', state: 's', code_challenge: challenge, code_challenge_method: 'S256' })}`);
    assert.equal(bad.status, 400);
    assert.match(bad.text, /invalid return address/);
    const unknown = await b.get(`/authorize?${new URLSearchParams({ response_type: 'code', client_id: 'nope-app', redirect_uri: client.redirect, state: 's', code_challenge: challenge, code_challenge_method: 'S256' })}`);
    assert.match(unknown.text, /not registered/);
  });

  it('gives single sign-on: a second product sign-in needs no password', async () => {
    const other = await registerClient(svc.pool, { id: 'nutrition-web', redirect: 'https://nutrition.example.test/', selfRoles: ['household_owner'] });
    const b = browser(svc.base);
    await signInFlow(svc, b, client, { email: 'amina@example.cm' });
    const second = await signInFlow(svc, b, other, { email: 'ignored' });
    assert.ok(second.location.startsWith(other.redirect), 'went straight back with a code');
    const { body } = await exchange(svc, other, second.location, second.verifier);
    const payload = JSON.parse(Buffer.from(body.access_token.split('.')[1], 'base64url'));
    assert.deepEqual(payload.roles, ['household_owner']);
    assert.equal(payload.aud, 'nutrition-web');
  });

  it('rotates refresh tokens and shuts down the sign-in when an old one is reused', async () => {
    const b = browser(svc.base);
    const flow = await signInFlow(svc, b, client, { email: 'amina@example.cm' });
    const { body: first } = await exchange(svc, client, flow.location, flow.verifier);
    const refresh = async token => {
      const res = await fetch(`${svc.base}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: token, client_id: client.id }) });
      return { status: res.status, body: await res.json() };
    };
    const second = await refresh(first.refresh_token);
    assert.equal(second.status, 200);
    assert.notEqual(second.body.refresh_token, first.refresh_token);
    const third = await refresh(second.body.refresh_token);
    assert.equal(third.status, 200);
    // The first token is two generations old: no grace window applies to it.
    const stolen = await refresh(first.refresh_token);
    assert.equal(stolen.status, 400, 'old refresh token rejected');
    const afterTheft = await refresh(third.body.refresh_token);
    assert.equal(afterTheft.status, 400, 'whole family revoked after reuse');
    const audit = (await svc.pool.query("SELECT count(*)::int AS n FROM platform.identity_audit WHERE reason='refresh_reuse_detected'")).rows[0].n;
    assert.ok(audit >= 1, 'reuse is audited even though the request failed');
  });

  it('asks which workspace to use when the user has roles in several, and refuses users with none', async () => {
    const staff = await registerClient(svc.pool, { id: 'commerce-web', redirect: 'https://commerce.example.test/', selfRoles: [], personal: false });
    await registerAndActivate(svc, 'cashier@example.cm');
    const uid = (await svc.pool.query("SELECT id FROM platform.users WHERE email='cashier@example.cm'")).rows[0].id;

    const b0 = browser(svc.base);
    const none = await signInFlow(svc, b0, staff, { email: 'cashier@example.cm' });
    assert.equal(none.posted.status, 403);
    assert.match(none.posted.text, /No access yet/);

    const tenants = [];
    for (const name of ['Boutique Mvog-Mbi', 'Superette Bastos']) {
      const org = crypto.randomUUID();
      const tenant = crypto.randomUUID();
      await svc.pool.query('INSERT INTO platform.organizations(id,name,slug) VALUES ($1,$2,$3)', [org, name, `s-${org}`]);
      await svc.pool.query('INSERT INTO platform.tenants(id,organization_id,name) VALUES ($1,$2,$3)', [tenant, org, name]);
      await svc.pool.query("INSERT INTO platform.memberships(user_id,tenant_id,role) VALUES ($1,$2,'member')", [uid, tenant]);
      await svc.pool.query("INSERT INTO platform.product_roles(user_id,tenant_id,client_id,roles) VALUES ($1,$2,'commerce-web',$3)", [uid, tenant, ['cashier']]);
      tenants.push(tenant);
    }
    const b = browser(svc.base);
    const flow = await signInFlow(svc, b, staff, { email: 'cashier@example.cm' });
    assert.equal(flow.posted.status, 200);
    assert.match(flow.posted.text, /Choose a workspace/);
    assert.match(flow.posted.text, /Superette Bastos/);
    const chosen = await b.post('/choose-workspace', { csrf: csrfFrom(flow.posted.text), req: flow.posted.text.match(/name="req" value="([^"]+)"/)[1], tenant: tenants[1] });
    assert.ok(chosen.location.startsWith(staff.redirect));
    const { body } = await exchange(svc, staff, chosen.location, flow.verifier);
    const payload = JSON.parse(Buffer.from(body.access_token.split('.')[1], 'base64url'));
    assert.equal(payload.tenant_id, tenants[1]);
    assert.deepEqual(payload.roles, ['cashier']);
  });

  it('resets a forgotten password and signs the user out everywhere', async () => {
    const b = browser(svc.base);
    const flow = await signInFlow(svc, b, client, { email: 'amina@example.cm' });
    const { body: tokens } = await exchange(svc, client, flow.location, flow.verifier);

    const forgot = await b.get('/forgot-password');
    const before = mailCount(svc, 'amina@example.cm');
    const sent = await b.post('/forgot-password', { csrf: csrfFrom(forgot.text), email: 'amina@example.cm' });
    assert.match(sent.text, /Check your email/);
    const link = linkFrom(await nextMail(svc, 'amina@example.cm', before), '/reset-password');
    const form = await b.get(link);
    assert.match(form.text, /Choose a new password/);
    const token = new URL(link).searchParams.get('token');
    const NEW = 'Poulet-DG-Bonapriso-77';
    const done = await b.post('/reset-password', { csrf: csrfFrom(form.text), token, password: NEW, confirm: NEW });
    assert.match(done.text, /Password changed/);
    assert.match((await nextMail(svc, 'amina@example.cm', before + 1)).subject, /Your password was changed/);

    const res = await fetch(`${svc.base}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: client.id }) });
    assert.equal(res.status, 400, 'old sign-ins are revoked');
    const b2 = browser(svc.base);
    const oldPw = await signInFlow(svc, b2, client, { email: 'amina@example.cm', password: PASSWORD });
    assert.match(oldPw.posted.text, /incorrect/);
    const newPw = await signInFlow(svc, b2, client, { email: 'amina@example.cm', password: NEW });
    assert.ok(newPw.location.startsWith(client.redirect));
  });

  it('limits repeated failed sign-ins for one email', async () => {
    const b = browser(svc.base);
    const page = await b.get('/login');
    let last;
    for (let i = 0; i < 11; i += 1) last = await b.post('/login', { csrf: csrfFrom(page.text), email: 'target@example.cm', password: 'wrong-password-1' });
    assert.equal(last.status, 429);
    assert.match(last.text, /Too many attempts/);
  });

  it('keeps the audit log append-only and records the client IP', async () => {
    const row = (await svc.pool.query('SELECT id, ip FROM platform.identity_audit ORDER BY id DESC LIMIT 1')).rows[0];
    assert.ok(row.ip);
    await assert.rejects(svc.pool.query('UPDATE platform.identity_audit SET outcome=$1 WHERE id=$2', ['x', row.id]), /append-only/);
    await assert.rejects(svc.pool.query('DELETE FROM platform.identity_audit WHERE id=$1', [row.id]), /append-only/);
  });

  it('serves security headers, discovery and the browser library', async () => {
    const res = await fetch(`${svc.base}/login`);
    assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    const disc = await (await fetch(`${svc.base}/.well-known/openid-configuration`)).json();
    assert.equal(disc.issuer, svc.base);
    assert.deepEqual(disc.code_challenge_methods_supported, ['S256']);
    const sdk = await fetch(`${svc.base}/sdk/ads-identity.js`);
    assert.match(await sdk.text(), /window\.adsIdentity = api/);
    const fr = await (await fetch(`${svc.base}/login?lang=fr`)).text();
    assert.match(fr, /Se connecter/);
  });

  it('signs out of the login domain and back to the product', async () => {
    const b = browser(svc.base);
    await signInFlow(svc, b, client, { email: 'amina@example.cm', password: 'Poulet-DG-Bonapriso-77' });
    const stolenCookie = b.jar.get('ads_sso');
    assert.ok(stolenCookie);
    const out = await b.get(`/logout?client_id=${client.id}&post_logout_redirect_uri=${encodeURIComponent('https://health.example.test/')}`);
    assert.equal(out.location, 'https://health.example.test/');
    // Replaying the old session cookie (e.g. copied before sign-out) must not work: it is revoked on the server.
    b.jar.set('ads_sso', stolenCookie);
    const { challenge } = pkce();
    const again = await b.get(`/authorize?${new URLSearchParams({ response_type: 'code', client_id: client.id, redirect_uri: client.redirect, state: 's2', code_challenge: challenge, code_challenge_method: 'S256' })}`);
    assert.ok(again.location.startsWith('/login'), `after sign-out the password is needed again, got ${again.location}`);
    const silent = await b.get(`/authorize?${new URLSearchParams({ response_type: 'code', client_id: client.id, redirect_uri: client.redirect, state: 's3', code_challenge: challenge, code_challenge_method: 'S256', prompt: 'none' })}`);
    assert.match(silent.location, /error=login_required/);
  });
});

describe('legacy API used by Software Factory', () => {
  let svc;
  before(async () => { svc = await startService(); });
  after(async () => { await svc.stop(); });
  const call = (method, path, body, token, extra = {}) => fetch(`${svc.base}${path}`, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined,
  }).then(async r => ({ status: r.status, body: await r.json() }));

  it('keeps register, login, onboard, session, verify and logout working', async () => {
    const reg = await call('POST', '/v1/identity/register', { email: 'dev@example.cm', password: PASSWORD });
    assert.equal(reg.status, 201);
    assert.equal(reg.body.status, 'pending');
    const dup = await call('POST', '/v1/identity/register', { email: 'dev@example.cm', password: PASSWORD });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, 'EMAIL_ALREADY_REGISTERED');
    const early = await call('POST', '/v1/identity/login', { email: 'dev@example.cm', password: PASSWORD });
    assert.equal(early.status, 403);
    assert.equal(early.body.error.code, 'EMAIL_NOT_VERIFIED');

    await activate(browser(svc.base), linkFrom(await nextMail(svc, 'dev@example.cm'), '/verify-email'), PASSWORD);
    const login = await call('POST', '/v1/identity/login', { email: 'dev@example.cm', password: PASSWORD });
    assert.equal(login.status, 200);
    assert.deepEqual(login.body.memberships, []);
    const token = login.body.accessToken;

    const onboard = await call('POST', '/v1/identity/onboard', { organizationName: 'Kribi Labs', projectName: 'POS' }, token);
    assert.equal(onboard.status, 201);
    const session = await call('POST', '/internal/session', null, token, { 'x-tenant-id': onboard.body.tenant.id });
    assert.equal(session.body.membership.role, 'owner');
    const verify = await call('POST', '/internal/verify', null, token, { 'x-project-id': onboard.body.project.id });
    assert.equal(verify.status, 200);
    assert.ok(verify.body.scopes.includes('rag:query'));
    const out = await call('POST', '/v1/identity/logout', null, token);
    assert.equal(out.body.revoked, true);
    const afterOut = await call('GET', '/v1/identity/session', null, token);
    assert.equal(afterOut.status, 401);
  });

  it('accepts passwords created by the old RAG-repo identity service', async () => {
    const id = crypto.randomUUID();
    await svc.pool.query("INSERT INTO platform.users(id,email,password_hash,status) VALUES ($1,'legacy@example.cm',$2,'active')", [id, await hashPassword('an-old-password-123')]);
    const login = await call('POST', '/v1/identity/login', { email: 'legacy@example.cm', password: 'an-old-password-123' });
    assert.equal(login.status, 200);
  });

  it('is not blocked by personal workspaces created by consumer apps', async () => {
    const client = await registerClient(svc.pool, { id: 'nutrition-web', redirect: 'https://n.example.test/' });
    const b = browser(svc.base);
    const flow = await signInFlow(svc, b, client, { email: 'legacy@example.cm', password: 'an-old-password-123' });
    assert.ok(flow.location.startsWith(client.redirect), 'personal workspace created');
    const login = await call('POST', '/v1/identity/login', { email: 'legacy@example.cm', password: 'an-old-password-123' });
    assert.deepEqual(login.body.memberships, [], 'personal workspace hidden from Software Factory');
    const onboard = await call('POST', '/v1/identity/onboard', { organizationName: 'Legacy Org' }, login.body.accessToken);
    assert.equal(onboard.status, 201);
  });
});

describe('Google sign-in', () => {
  let svc;
  let client;
  const profiles = [];
  const google = {
    authorizationUrl: ({ state }) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
    exchange: async () => profiles.shift(),
  };
  before(async () => {
    svc = await startService({ google });
    client = await registerClient(svc.pool);
  });
  after(async () => { await svc.stop(); });

  async function googleRound(b, profile) {
    const { challenge, verifier } = pkce();
    const auth = await b.get(`/authorize?${new URLSearchParams({ response_type: 'code', client_id: client.id, redirect_uri: client.redirect, state: 'g', code_challenge: challenge, code_challenge_method: 'S256' })}`);
    const login = await b.get(auth.location);
    assert.match(login.text, /Continue with Google/);
    const start = await b.get(`/google/start?req=${reqFrom(auth.location)}`);
    const state = new URL(start.location).searchParams.get('state');
    profiles.push(profile);
    const cb = await b.get(`/google/callback?state=${state}&code=abc`);
    return { cb, verifier };
  }

  it('creates an account from a verified Google profile and returns to the product', async () => {
    const b = browser(svc.base);
    const { cb } = await googleRound(b, { subject: 'g-1', email: 'paul@gmail.com', emailVerified: true, name: 'Paul' });
    assert.ok(cb.location.startsWith(client.redirect));
    const user = (await svc.pool.query("SELECT status, password_hash, email_verified_at FROM platform.users WHERE email='paul@gmail.com'")).rows[0];
    assert.equal(user.status, 'active');
    assert.equal(user.password_hash, null);
  });

  it('discards unconfirmed pre-registrations when the real owner signs in with Google', async () => {
    const b = browser(svc.base);
    const reg = await b.get('/register');
    await b.post('/register', { csrf: csrfFrom(reg.text), email: 'victim@gmail.com', password: 'attacker-password-1', confirm: 'attacker-password-1' });
    const { cb } = await googleRound(browser(svc.base), { subject: 'g-2', email: 'victim@gmail.com', emailVerified: true, name: 'Victim' });
    assert.ok(cb.location.startsWith(client.redirect));
    const user = (await svc.pool.query("SELECT status, password_hash FROM platform.users WHERE email='victim@gmail.com'")).rows[0];
    assert.equal(user.status, 'active');
    assert.equal(user.password_hash, null, 'attacker password removed');
  });

  it('refuses a Google account whose email is not verified, and a forged state', async () => {
    const { cb } = await googleRound(browser(svc.base), { subject: 'g-3', email: 'unverified@gmail.com', emailVerified: false });
    assert.equal(cb.status, 400);
    assert.match(cb.text, /Google email is not verified/);
    const forged = await browser(svc.base).get('/google/callback?state=forged&code=abc');
    assert.equal(forged.status, 400);
  });
});

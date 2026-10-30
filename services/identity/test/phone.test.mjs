import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { browser, createActiveUser, csrfFrom, nextMail, pkce, registerClient, reqFrom, startService } from './helpers.mjs';

const codeFrom = text => text.match(/name="challenge" value="([^"]+)"/)?.[1];
describe('SH-0 real identity phone journeys', () => {
  let svc, sms, client;
  let rejectSms = false;
  const outbox = [];
  before(async () => {
    sms = http.createServer(async (req, res) => {
      let raw = ''; for await (const chunk of req) raw += chunk;
      if (rejectSms) { res.writeHead(503); res.end(); return; }
      outbox.push(JSON.parse(raw)); res.writeHead(201, { 'content-type': 'application/json' }); res.end('{}');
    });
    await new Promise(resolve => sms.listen(0, '127.0.0.1', resolve));
    svc = await startService({ env: { IDENTITY_PHONE_REQUESTS_PER_IP: '200', IDENTITY_SMS_URL: `http://127.0.0.1:${sms.address().port}/sms/v1/messages` } });
    client = await registerClient(svc.pool);
  });
  after(async () => { if (svc) await svc.stop(); if (sms) await new Promise(r => sms.close(r)); });
  const latestCode = () => outbox.at(-1).text.match(/\b([0-9]{6})\b/)[1];
  async function issue(b, phone, extra = {}) {
    const page = await b.get('/phone');
    const csrf = csrfFrom(page.text);
    const response = await b.post('/phone/request', { csrf, phone, ...extra });
    assert.equal(response.status, 200, response.text);
    return { csrf, phone, challenge: codeFrom(response.text), ...extra };
  }
  it('new phone user receives existing OIDC claims and later returns to the same account', async () => {
    const b = browser(svc.base);
    const { verifier, challenge } = pkce();
    const auth = await b.get(`/authorize?${new URLSearchParams({ response_type: 'code', client_id: client.id, redirect_uri: client.redirect, state: 'state', code_challenge: challenge, code_challenge_method: 'S256', ui_locales: 'fr' })}`);
    const fields = await issue(b, '699100001', { req: reqFrom(auth.location), lang: 'fr' });
    assert.ok(fields.challenge); assert.match(outbox.at(-1).text, /Votre code ADS/);
    const signed = await b.post('/phone/verify', { ...fields, code: latestCode() });
    assert.ok(signed.location?.startsWith(client.redirect), signed.text);
    const tokenResponse = await fetch(`${svc.base}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: new URL(signed.location).searchParams.get('code'), code_verifier: verifier, client_id: client.id, redirect_uri: client.redirect }) });
    assert.equal(tokenResponse.status, 200);
    const token = await tokenResponse.json(); const claims = JSON.parse(Buffer.from(token.access_token.split('.')[1], 'base64url'));
    assert.ok(claims.sub); assert.ok(claims.tenant_id); assert.deepEqual(claims.roles, ['patient']); assert.equal(claims.locale, 'fr');
    const user = (await svc.pool.query('SELECT * FROM platform.users WHERE id=$1', [claims.sub])).rows[0];
    assert.equal(user.email, null); assert.equal(user.phone_number, '+237699100001');
    const logout = await b.get('/logout'); await b.post('/logout', { csrf: csrfFrom(logout.text) });
    await svc.pool.query("UPDATE platform.phone_challenges SET created_at=now()-interval '2 minutes' WHERE phone_number=$1", [user.phone_number]);
    const again = await issue(b, user.phone_number); const done = await b.post('/phone/verify', { ...again, code: latestCode() });
    assert.equal(done.status, 200); assert.match(done.text, /You are signed in/);
    assert.equal((await svc.pool.query('SELECT count(*)::int AS n FROM platform.users WHERE phone_number=$1', [user.phone_number])).rows[0].n, 1);
  });
  it('codes are browser-bound, limited, expiring and single-use including concurrent verification', async () => {
    const b = browser(svc.base), other = browser(svc.base);
    const fields = await issue(b, '699100002'), correct = latestCode();
    const otherPage = await other.get('/phone');
    assert.equal((await other.post('/phone/verify', { ...fields, csrf: csrfFrom(otherPage.text), code: correct })).status, 400);
    assert.equal((await b.post('/phone/verify', { ...fields, code: correct === '000000' ? '111111' : '000000' })).status, 400);
    const results = await Promise.all([b.post('/phone/verify', { ...fields, code: correct }), b.post('/phone/verify', { ...fields, code: correct })]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
    const limit = await issue(b, '699100003'), valid = latestCode();
    for (let n = 0; n < 5; n++) await b.post('/phone/verify', { ...limit, code: valid === '000000' ? '111111' : '000000' });
    assert.equal((await b.post('/phone/verify', { ...limit, code: valid })).status, 400);
    const expired = await issue(b, '699100004');
    await svc.pool.query("UPDATE platform.phone_challenges SET expires_at=now()-interval '1 second' WHERE id=$1", [expired.challenge]);
    assert.equal((await b.post('/phone/verify', { ...expired, code: latestCode() })).status, 400);
  });
  it('resend waits and invalidates old codes, without storing plaintext', async () => {
    const b = browser(svc.base), fields = await issue(b, '699100005'), old = latestCode();
    assert.equal((await b.post('/phone/request', fields)).status, 429);
    await svc.pool.query("UPDATE platform.phone_challenges SET created_at=now()-interval '2 minutes' WHERE id=$1", [fields.challenge]);
    const fresh = await issue(b, '699100005');
    assert.equal((await b.post('/phone/verify', { ...fields, code: old })).status, 400);
    assert.equal((await b.post('/phone/verify', { ...fresh, code: latestCode() })).status, 200);
    const stored = (await svc.pool.query('SELECT code_hash FROM platform.phone_challenges WHERE id=$1', [fresh.challenge])).rows[0];
    assert.equal(stored.code_hash.length, 64); assert.notEqual(stored.code_hash, latestCode());
  });
  it('phone-first users add proven email and Google to the same id without merging another account', async () => {
    const b = browser(svc.base), fields = await issue(b, '699100007');
    await b.post('/phone/verify', { ...fields, code: latestCode() });
    const user = (await svc.pool.query("SELECT id FROM platform.users WHERE phone_number='+237699100007'")).rows[0];
    const page = await b.get('/phone/email');
    const email = 'phone-first@example.test', password = 'Phone-first-password-2026';
    assert.equal((await b.post('/phone/email/request', { csrf: csrfFrom(page.text), email, password, confirm: password })).status, 200);
    const mail = await nextMail(svc, email); const link = mail.text.match(/https?:\/\/[^\s]+\/phone\/email\/verify\?[^\s]+/)[0];
    const token = new URL(link).searchParams.get('token');
    const activation = await b.get(link);
    assert.equal((await b.post('/phone/email/verify', { csrf: csrfFrom(activation.text), token, password: 'wrong-password' })).status, 400);
    assert.equal((await b.post('/phone/email/verify', { csrf: csrfFrom(activation.text), token, password })).status, 200);
    const linked = await svc.app.accounts.authenticate({ email, password }); assert.equal(linked.id, user.id);
    const google = await svc.app.accounts.googleUser({ subject: 'phone-first-google-subject', email, emailVerified: true, name: 'Same person' });
    assert.equal(google.id, user.id);
    assert.equal((await b.get('/phone/email')).status, 403, 'linking revokes old sessions');
    await assert.rejects(svc.app.accounts.completeEmailLink({ userId: user.id, token, password }), /LINK_INVALID/);
    const other = browser(svc.base), next = await issue(other, '699100008');
    await other.post('/phone/verify', { ...next, code: latestCode() });
    const before = svc.mailer.outbox.filter(m => m.to === email).length;
    const op = await other.get('/phone/email');
    assert.equal((await other.post('/phone/email/request', { csrf: csrfFrom(op.text), email, password, confirm: password })).status, 200);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(svc.mailer.outbox.filter(m => m.to === email).length, before, 'existing email ownership is never overwritten');
    assert.equal((await svc.pool.query("SELECT email FROM platform.users WHERE phone_number='+237699100008'")).rows[0].email, null);
  });
  it('phone-only staff have visible admin labels and can receive roles and be deactivated', async () => {
    const owner = await createActiveUser(svc.pool, 'phone-admin@example.test', 'Phone-admin-password-2026');
    const staff = (await svc.pool.query("SELECT id FROM platform.users WHERE phone_number='+237699100002'")).rows[0];
    const org = crypto.randomUUID(), tenant = crypto.randomUUID();
    await svc.pool.query("INSERT INTO platform.organizations(id,name,slug) VALUES ($1,'Phone staff',$2)", [org, `phone-staff-${org}`]);
    await svc.pool.query("INSERT INTO platform.tenants(id,organization_id,name) VALUES ($1,$2,'Phone staff')", [tenant, org]);
    await svc.pool.query("INSERT INTO platform.memberships(user_id,tenant_id,role) VALUES ($1,$3,'owner'),($2,$3,'member')", [owner.id, staff.id, tenant]);
    const ctx = { actorId: owner.id, tenantId: tenant, clientId: client.id, via: 'page' };
    assert.equal((await svc.app.admin.listMembers(ctx)).find(r => r.userId === staff.id).phoneNumber, '+237699100002');
    const b = browser(svc.base), login = await b.get('/login');
    await b.post('/login', { csrf: csrfFrom(login.text), email: owner.email, password: owner.password });
    const page = await b.get(`/admin?tenant=${tenant}&product=${client.id}`);
    assert.match(page.text, /data-member="\+237699100002"/);
    await svc.app.admin.grantRoles(ctx, staff.id, ['patient']);
    assert.deepEqual((await svc.app.admin.listMembers(ctx)).find(r => r.userId === staff.id).roles, ['patient']);
    await svc.app.admin.setActive(ctx, staff.id, false);
    assert.equal((await svc.pool.query('SELECT status FROM platform.memberships WHERE user_id=$1 AND tenant_id=$2', [staff.id, tenant])).rows[0].status, 'disabled');
  });
  it('SMS failure and invalid CSRF do not create a signed-in account', async () => {
    const b = browser(svc.base), page = await b.get('/phone');
    assert.equal((await b.post('/phone/request', { csrf: 'wrong', phone: '699100009' })).status, 400);
    rejectSms = true;
    try {
      assert.equal((await b.post('/phone/request', { csrf: csrfFrom(page.text), phone: '699100009' })).status, 503);
      assert.equal((await svc.pool.query("SELECT count(*)::int AS n FROM platform.users WHERE phone_number='+237699100009'")).rows[0].n, 0);
      const row = (await svc.pool.query("SELECT used_at FROM platform.phone_challenges WHERE phone_number='+237699100009'")).rows[0];
      assert.ok(row.used_at, 'undelivered challenge is unusable');
    } finally { rejectSms = false; }
  });
  it('linking requires an existing authenticated account and never transfers another owner phone', async () => {
    const b = browser(svc.base), page = await b.get('/phone/link'); assert.equal(page.status, 403);
    const existing = await createActiveUser(svc.pool, 'phone-owner@example.test', 'Owner-password-2026');
    const login = await b.get('/login'); await b.post('/login', { csrf: csrfFrom(login.text), email: existing.email, password: existing.password });
    const fields = await issue(b, '699100006', { purpose: 'link' });
    assert.equal((await b.post('/phone/verify', { ...fields, code: latestCode() })).status, 200);
    assert.equal((await svc.pool.query('SELECT phone_number FROM platform.users WHERE id=$1', [existing.id])).rows[0].phone_number, '+237699100006');
    const stranger = await createActiveUser(svc.pool, 'phone-stranger@example.test', 'Stranger-password-2026');
    const c = browser(svc.base), lp = await c.get('/login'); await c.post('/login', { csrf: csrfFrom(lp.text), email: stranger.email, password: stranger.password });
    await svc.pool.query("UPDATE platform.phone_challenges SET created_at=now()-interval '2 minutes' WHERE phone_number='+237699100006'");
    const stolen = await issue(c, '699100006', { purpose: 'link' });
    assert.equal((await c.post('/phone/verify', { ...stolen, code: latestCode() })).status, 400);
    assert.equal((await svc.pool.query('SELECT phone_number FROM platform.users WHERE id=$1', [stranger.id])).rows[0].phone_number, null);
  });
});

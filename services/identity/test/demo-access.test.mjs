// ADS Demo Access: request -> administrator notification -> review -> approval -> invitation ->
// activation -> personas without a second password -> revocation / expiry. Also rejection, duplicate and
// failed-email handling. See docs/demo-access/INTEGRATION_CONTRACT.md.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { browser, createActiveUser, csrfFrom, pkce, startService } from './helpers.mjs';

const PASSWORD = 'Correct-Horse-42';
const ORIGIN = 'https://commerce.demo.africadigitalsynergy.com';
const COMMERCE = { id: 'commerce-web', redirect: 'https://commerce.demo.africadigitalsynergy.com/' };
const SECRET = 'check-secret-for-tests-0123456789';
const ADMIN = 'admin.demo@ads.test';
const NOTIFY = ['kengjisehs@ads.test', 'kengjisehs.copy@ads.test'];

describe('ADS Demo Access (Commerce pilot)', () => {
  let svc;
  let adminB;
  const mails = to => svc.mailer.outbox.filter(m => m.to === to);
  const request = (body, origin = ORIGIN) => fetch(`${svc.base}/demo-access/v1/requests`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify({ platform: 'commerce', locale: 'en', ...body }),
  });
  const check = (sub, secret = SECRET) => fetch(`${svc.base}/demo-access/v1/grants/check?platform=commerce&sub=${sub}`, { headers: { authorization: `Bearer ${secret}` } });
  const requestRow = async email => (await svc.pool.query('SELECT * FROM platform.demo_access_requests WHERE email=$1 ORDER BY created_at DESC LIMIT 1', [email])).rows[0];
  const signIn = async (b, email, password = PASSWORD) => {
    const page = await b.get('/login');
    return b.post('/login', { csrf: csrfFrom(page.text), email, password });
  };
  const act = async (b, id, action, extra = {}) => {
    const page = await b.get(`/demo-admin/requests/${id}`);
    return b.post(`/demo-admin/requests/${id}`, { csrf: csrfFrom(page.text), action, lang: 'en', ...extra });
  };
  // Authorises the Commerce client in an open browser session; returns the token claims.
  const commerceToken = async (b, tenantHint) => {
    const { verifier, challenge } = pkce();
    const q = new URLSearchParams({ response_type: 'code', client_id: COMMERCE.id, redirect_uri: COMMERCE.redirect, state: 's', code_challenge: challenge, code_challenge_method: 'S256', ...(tenantHint ? { tenant_hint: tenantHint } : {}) });
    const auth = await b.get(`/authorize?${q}`);
    assert.ok(auth.location?.startsWith(COMMERCE.redirect), `signed in without a password prompt (got ${auth.location})`);
    const res = await fetch(`${svc.base}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: new URL(auth.location).searchParams.get('code'), code_verifier: verifier, client_id: COMMERCE.id, redirect_uri: COMMERCE.redirect }) });
    const body = await res.json();
    return JSON.parse(Buffer.from(body.access_token.split('.')[1], 'base64url').toString());
  };

  before(async () => {
    svc = await startService({ env: {
      ADS_ENV: 'demo', DEMO_MODE: '1', DEMO_ACCESS_ENABLED: '1', DEMO_ACCESS_ADMIN_EMAILS: ADMIN, DEMO_ACCESS_NOTIFY_TO: NOTIFY.join(','),
      DEMO_ACCESS_CHECK_SECRET_COMMERCE: SECRET, DEMO_ACCESS_REQUESTS_PER_IP_HOUR: '100', DEMO_ACCESS_ADMIN_URL: 'https://admin.demo.africadigitalsynergy.com',
    } });
    await svc.pool.query(`INSERT INTO platform.oauth_clients(client_id,display_name,redirect_uris,post_logout_redirect_uris,self_service_roles,allow_personal_workspace,admin_roles,assignable_roles)
      VALUES ($1,'ADS Commerce',$2,$2,'{commerce_buyer}',true,'{merchant_owner}',$3)`,
    [COMMERCE.id, [COMMERCE.redirect], ['merchant_owner', 'commerce_manager', 'commerce_cashier', 'commerce_accountant', 'commerce_investor', 'commerce_auditor', 'bank_officer', 'bank_agent', 'commerce_business_buyer']]);
    await createActiveUser(svc.pool, ADMIN, PASSWORD);
    adminB = browser(svc.base);
    await signIn(adminB, ADMIN);
  });
  after(async () => { await svc?.stop(); });

  it('full journey: request, both administrators notified, review, approve, invitation, activation, personas, revoke', async () => {
    const visitor = 'visitor.one@example.com';
    const res = await request({ email: visitor });
    assert.equal(res.status, 202);
    assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
    assert.deepEqual(await res.json(), { status: 'received', notified: true });
    const req = await requestRow(visitor);
    assert.equal(req.status, 'pending');
    assert.match(req.reference, /^COM-\d{4}-[A-Z2-9]{6}$/);

    // One separate message per administrator, with platform, email, reference and the review link.
    for (const to of NOTIFY) {
      const [mail] = mails(to);
      assert.ok(mail, `notified ${to}`);
      assert.match(mail.subject, new RegExp(req.reference));
      assert.match(mail.text, /ADS Commerce/);
      assert.match(mail.text, /visitor\.one@example\.com/);
      assert.ok(mail.text.includes(`https://admin.demo.africadigitalsynergy.com/demo-admin/requests/${req.id}`));
    }
    assert.equal(mails(NOTIFY[0])[0].to, NOTIFY[0]);
    assert.equal((await svc.pool.query("SELECT count(*)::int AS n FROM platform.demo_outbox WHERE request_id=$1 AND kind='admin_notification' AND status='sent'", [req.id])).rows[0].n, 2);

    // The review link only opens the request: signed out -> sign in first; a non-admin is refused.
    const anon = await browser(svc.base).get(`/demo-admin/requests/${req.id}`);
    assert.equal(anon.status, 302);
    assert.equal(anon.location, `/login?next=${encodeURIComponent(`/demo-admin/requests/${req.id}`)}`);
    const stranger = await createActiveUser(svc.pool, 'not.admin@example.com', PASSWORD);
    const sb = browser(svc.base);
    await signIn(sb, stranger.email);
    assert.equal((await sb.get(`/demo-admin/requests/${req.id}`)).status, 403);
    const forged = await sb.post(`/demo-admin/requests/${req.id}`, { csrf: csrfFrom((await sb.get('/demo-admin')).text), action: 'approve' });
    assert.equal(forged.status, 403);
    assert.equal((await requestRow(visitor)).status, 'pending', 'a non-admin cannot approve');

    // The administrator sees it and approves; a second click creates nothing more.
    const overview = await adminB.get('/demo-admin');
    assert.equal(overview.status, 200);
    assert.ok(overview.text.includes(req.reference));
    const approved = await act(adminB, req.id, 'approve');
    assert.match(approved.location, /done=approved/);
    const again = await act(adminB, req.id, 'approve');
    assert.match(again.location, /error=REQUEST_NOT_PENDING/);
    assert.equal(mails(visitor).length, 1, 'exactly one invitation');
    const grant = (await svc.pool.query('SELECT * FROM platform.demo_access_grants WHERE request_id=$1', [req.id])).rows[0];
    assert.equal(grant.status, 'awaiting_activation');
    assert.match(grant.demo_set, /^visit-[0-9a-f]{12}$/);
    assert.deepEqual(Object.keys(grant.tenants).sort(), ['bank', 'main']);

    // The visitor creates the account from the invitation: no second activation email.
    const invite = mails(visitor)[0];
    assert.match(invite.subject, /ADS Commerce/);
    const link = invite.text.match(/https?:\/\/\S+\/invite\?token=[A-Za-z0-9_-]+/)[0];
    const next = new URL(link).pathname + new URL(link).search;
    const vb = browser(svc.base);
    const reg = await vb.get(`/register?next=${encodeURIComponent(next)}`);
    const created = await vb.post('/register', { csrf: csrfFrom(reg.text), email: visitor, password: PASSWORD, confirm: PASSWORD, next });
    assert.equal(created.location, next);
    assert.equal(mails(visitor).length, 1, 'no activation email');
    const page = await vb.get(next);
    const accepted = await vb.post('/invite/accept', { csrf: csrfFrom(page.text), token: new URL(link).searchParams.get('token') });
    assert.equal(accepted.status, 200);
    assert.ok(accepted.text.includes('/commerce/demo/personas'), 'sent to the persona page');

    const active = (await svc.pool.query('SELECT * FROM platform.demo_access_grants WHERE id=$1', [grant.id])).rows[0];
    assert.equal(active.status, 'active');
    const days = (new Date(active.expires_at) - new Date(active.activated_at)) / 86400000;
    assert.ok(Math.abs(days - 30) < 0.01, '30 days from activation');

    // Grant check: secret required; personas in the visitor's own workspaces; no staff personas.
    assert.equal((await check(active.user_id, 'wrong')).status, 401);
    const granted = await (await check(active.user_id)).json();
    assert.equal(granted.access, 'granted');
    assert.deepEqual(granted.personas.map(p => p.key), ['shopper', 'shop-owner', 'shop-manager', 'cashier', 'accountant', 'bank-agent', 'bank-officer', 'processor']);
    assert.ok(!granted.personas.some(p => ['investor', 'auditor', 'bank-loan-officer'].includes(p.key)), 'internal demo personas are never offered to visitors');
    assert.ok(!granted.personas.some(p => ['reviewer', 'support'].includes(p.key)));
    const main = granted.personas.find(p => p.key === 'shop-owner');
    const bank = granted.personas.find(p => p.key === 'bank-officer');
    const personal = granted.personas.find(p => p.key === 'shopper');
    assert.equal(main.tenantId, grant.tenants.main);
    assert.equal(bank.tenantId, grant.tenants.bank);
    assert.ok(personal.tenantId);
    assert.ok((await svc.pool.query('SELECT first_login_at FROM platform.demo_access_grants WHERE id=$1', [grant.id])).rows[0].first_login_at);

    // Signed in once: each persona workspace opens without typing a password again.
    const shop = await commerceToken(vb, main.tenantId);
    assert.equal(shop.tenant_id, main.tenantId);
    assert.deepEqual([...shop.roles].sort(), ['commerce_accountant', 'commerce_business_buyer', 'commerce_cashier', 'commerce_manager', 'merchant_owner']);
    const bankToken = await commerceToken(vb, bank.tenantId);
    assert.deepEqual(bankToken.roles.sort(), ['bank_agent', 'bank_officer']);
    const buyer = await commerceToken(vb, personal.tenantId);
    assert.ok(buyer.roles.includes('commerce_buyer'));

    // The visitor's demo shop gives no administrator rights in ADS Identity.
    const adminPage = await vb.get('/admin');
    assert.match(adminPage.text, /not an administrator/);

    // Dashboard shows acceptance and activation separately from email sending.
    const detail = await adminB.get(`/demo-admin/requests/${req.id}`);
    assert.equal(detail.status, 200);
    assert.ok((await svc.app.demoAccess.detail(req.id)).history.every(h => h.at), 'history shows times');
    assert.ok((await svc.app.demoAccess.auditLog()).events.every(e => e.at), 'audit shows times');

    // Revocation: grant check refuses at once; roles and sign-ins for the platform are gone.
    assert.match((await act(adminB, req.id, 'revoke')).location, /done=revoked/);
    assert.deepEqual(await (await check(active.user_id)).json(), { access: 'none', reason: 'REVOKED' });
    assert.equal((await svc.pool.query('SELECT count(*)::int AS n FROM platform.product_roles WHERE user_id=$1 AND tenant_id = ANY($2::uuid[])', [active.user_id, Object.values(grant.tenants)])).rows[0].n, 0);
    assert.equal((await svc.pool.query("SELECT count(*)::int AS n FROM platform.refresh_tokens WHERE user_id=$1 AND client_id='commerce-web' AND revoked_at IS NULL", [active.user_id])).rows[0].n, 0);
    const events = (await svc.pool.query("SELECT event_type FROM platform.identity_audit WHERE metadata->>'request_id'=$1 ORDER BY ts", [req.id])).rows.map(r => r.event_type);
    assert.deepEqual(events, ['demo_access_requested', 'demo_access_approved', 'demo_access_activated', 'demo_access_revoked']);
  });

  it('an existing ADS account signs in to accept; access expires after its 30 days', async () => {
    const existing = await createActiveUser(svc.pool, 'already.member@example.com', PASSWORD);
    await request({ email: existing.email });
    const req = await requestRow(existing.email);
    await act(adminB, req.id, 'approve');
    const link = mails(existing.email)[0].text.match(/https?:\/\/\S+\/invite\?token=[A-Za-z0-9_-]+/)[0];
    const b = browser(svc.base);
    await signIn(b, existing.email);
    const page = await b.get(link);
    assert.equal((await b.post('/invite/accept', { csrf: csrfFrom(page.text), token: new URL(link).searchParams.get('token') })).status, 200);
    assert.equal((await (await check(existing.id)).json()).access, 'granted');

    await svc.pool.query("UPDATE platform.demo_access_grants SET expires_at=now()-interval '1 second' WHERE user_id=$1", [existing.id]);
    assert.deepEqual(await (await check(existing.id)).json(), { access: 'none', reason: 'EXPIRED' }, 'refused before housekeeping runs');
    await svc.app.purgeExpired();
    assert.equal((await svc.pool.query('SELECT status FROM platform.demo_access_grants WHERE user_id=$1', [existing.id])).rows[0].status, 'expired');
  });

  it('one effective approval per visitor and platform; revocation permits clean reapplication', async () => {
    const email = 'one.grant@example.com';
    const existing = await createActiveUser(svc.pool, email, PASSWORD);
    await request({ email });
    const first = await requestRow(email);
    await act(adminB, first.id, 'approve');
    const beforeAccept = NOTIFY.map(to => mails(to).length);
    const beforeRequestCount = (await svc.pool.query(
      'SELECT count(*)::int AS n FROM platform.demo_access_requests WHERE platform=$1 AND email=$2',
      ['commerce', email])).rows[0].n;
    const pendingRepeat = await request({ email });
    assert.deepEqual(await pendingRepeat.json(), { status: 'received', notified: false },
      'repeating while an invitation awaits acceptance must not create another approval');
    assert.deepEqual(NOTIFY.map(to => mails(to).length), beforeAccept);
    assert.equal((await svc.pool.query(
      'SELECT count(*)::int AS n FROM platform.demo_access_requests WHERE platform=$1 AND email=$2',
      ['commerce', email])).rows[0].n, beforeRequestCount);

    const b = browser(svc.base);
    await signIn(b, email);
    const link = mails(email)[0].text.match(/https?:\/\/\S+\/invite\?token=[A-Za-z0-9_-]+/)[0];
    const token = new URL(link).searchParams.get('token');
    const invitePage = await b.get(link);
    assert.equal((await b.post('/invite/accept', { csrf: csrfFrom(invitePage.text), token })).status, 200);
    assert.equal((await (await check(existing.id)).json()).access, 'granted');

    const activeRepeat = await request({ email });
    assert.deepEqual(await activeRepeat.json(), { status: 'received', notified: false });
    assert.equal((await svc.pool.query(
      "SELECT count(*)::int AS n FROM platform.demo_access_grants WHERE platform='commerce' AND email=$1 AND status IN ('active','awaiting_activation')",
      [email])).rows[0].n, 1, 'exactly one live grant is retained');

    assert.match((await act(adminB, first.id, 'revoke')).location, /done=revoked/);
    assert.deepEqual(await (await check(existing.id)).json(), { access: 'none', reason: 'REVOKED' });
    const reapply = await request({ email });
    assert.deepEqual(await reapply.json(), { status: 'received', notified: true },
      'after revocation, a new request can proceed normally');
    const second = await requestRow(email);
    assert.notEqual(second.id, first.id);
    assert.equal(second.status, 'pending');
    assert.match((await act(adminB, second.id, 'approve')).location, /done=approved/);
    assert.equal((await svc.pool.query(
      "SELECT count(*)::int AS n FROM platform.demo_access_grants WHERE platform='commerce' AND email=$1 AND status IN ('active','awaiting_activation')",
      [email])).rows[0].n, 1, 'a replacement grant cannot coexist with the revoked grant');
  });

  it('an expired, unaccepted invitation allows a new request rather than blocking the visitor', async () => {
    const email = 'expired.invitation@example.com';
    await request({ email });
    const first = await requestRow(email);
    await act(adminB, first.id, 'approve');
    const repeat = await request({ email });
    assert.deepEqual(await repeat.json(), { status: 'received', notified: false });
    await svc.pool.query("UPDATE platform.invitations SET expires_at=now()-interval '1 second' WHERE email=$1", [email]);
    const renewed = await request({ email });
    assert.deepEqual(await renewed.json(), { status: 'received', notified: true });
    const second = await requestRow(email);
    assert.notEqual(first.id, second.id);
    assert.equal((await svc.pool.query(
      'SELECT status FROM platform.demo_access_grants WHERE request_id=$1', [first.id])).rows[0].status, 'expired');
    assert.match((await act(adminB, second.id, 'approve')).location, /done=approved/);
  });

  it('duplicate, honeypot, unknown platform, bad email and foreign origin', async () => {
    const email = 'repeat.visitor@example.com';
    await request({ email });
    const before = NOTIFY.map(to => mails(to).length);
    const dup = await request({ email });
    assert.equal(dup.status, 202);
    assert.deepEqual(await dup.json(), { status: 'received', notified: false });
    assert.deepEqual(NOTIFY.map(to => mails(to).length), before, 'administrators not notified twice');
    assert.equal((await svc.pool.query("SELECT count(*)::int AS n FROM platform.demo_access_requests WHERE email=$1", [email])).rows[0].n, 1);
    // Simultaneous submissions (a double-clicked form) both get the neutral answer; one request is stored.
    const twin = 'twin.click@example.com';
    const both = await Promise.all([request({ email: twin }), request({ email: twin })]);
    assert.deepEqual(both.map(r => r.status), [202, 202]);
    assert.equal((await svc.pool.query("SELECT count(*)::int AS n FROM platform.demo_access_requests WHERE email=$1", [twin])).rows[0].n, 1);

    assert.equal((await request({ email: 'bot@example.com', website: 'http://spam' })).status, 202);
    assert.equal(await requestRow('bot@example.com'), undefined, 'honeypot stores nothing');
    assert.equal((await request({ email: 'x@example.com', platform: 'banking' })).status, 400);
    assert.equal((await request({ email: 'not-an-email' })).status, 400);
    assert.equal((await request({ email: 'x@example.com' }, 'https://evil.example')).status, 403);
    const pre = await fetch(`${svc.base}/demo-access/v1/requests`, { method: 'OPTIONS', headers: { origin: ORIGIN, 'access-control-request-method': 'POST' } });
    assert.equal(pre.status, 204);
  });

  it('rejection sends a neutral notice without the internal reason; a repeat request is flagged, not re-notified', async () => {
    const email = 'declined@example.com';
    await request({ email });
    const req = await requestRow(email);
    assert.match((await act(adminB, req.id, 'reject', { note: 'competitor research' })).location, /done=rejected/);
    const [notice] = mails(email);
    assert.match(notice.text, /unable to offer demonstration access/);
    assert.ok(!notice.text.includes('competitor'), 'internal reason never emailed');
    const before = NOTIFY.map(to => mails(to).length);
    await request({ email });
    const repeat = await requestRow(email);
    assert.equal(repeat.prior_rejection, true);
    assert.deepEqual(NOTIFY.map(to => mails(to).length), before);
    assert.equal(mails(email).length, 1, 'no second notice');
  });

  it('a failed email is kept and retried once, without duplicates; resend replaces the invitation', async () => {
    const realSend = svc.mailer.send;
    svc.mailer.send = async () => { throw Object.assign(new Error('relay down'), { code: 'ECONNREFUSED' }); };
    const email = 'during.outage@example.com';
    const res = await request({ email });
    assert.deepEqual(await res.json(), { status: 'received', notified: false }, 'truthful answer');
    const req = await requestRow(email);
    const rows = (await svc.pool.query('SELECT * FROM platform.demo_outbox WHERE request_id=$1', [req.id])).rows;
    assert.equal(rows.length, 2);
    assert.ok(rows.every(r => r.status === 'queued' && r.attempts === 1 && r.last_error === 'ECONNREFUSED'));

    svc.mailer.send = realSend;
    await svc.pool.query('UPDATE platform.demo_outbox SET next_attempt_at=now() WHERE request_id=$1', [req.id]);
    assert.equal(await svc.app.demoAccess.processOutbox(), 2);
    assert.equal(await svc.app.demoAccess.processOutbox(), 0, 'nothing sent twice');
    for (const to of NOTIFY) assert.equal(mails(to).filter(m => m.subject.includes(req.reference)).length, 1);

    await act(adminB, req.id, 'approve');
    const first = mails(email)[0].text.match(/\/invite\?token=([A-Za-z0-9_-]+)/)[1];
    assert.match((await act(adminB, req.id, 'resend')).location, /error=RESENT_RECENTLY/, 'a double click does not cancel the fresh link');
    await svc.pool.query("UPDATE platform.invitations SET created_at=now()-interval '2 minutes' WHERE email=$1", [email]);
    assert.match((await act(adminB, req.id, 'resend')).location, /done=resent/);
    const second = mails(email)[1].text.match(/\/invite\?token=([A-Za-z0-9_-]+)/)[1];
    assert.notEqual(first, second);
    assert.equal((await browser(svc.base).get(`/invite?token=${first}`)).status, 400, 'old link no longer works');
    assert.equal((await browser(svc.base).get(`/invite?token=${second}`)).status, 200);
  });

  it('pending requests expire after 30 days; the dashboard needs a valid form token', async () => {
    const email = 'too.late@example.com';
    await request({ email });
    const req = await requestRow(email);
    await svc.pool.query("UPDATE platform.demo_access_requests SET expires_at=now()-interval '1 second' WHERE id=$1", [req.id]);
    await svc.app.demoAccess.housekeeping();
    assert.equal((await requestRow(email)).status, 'expired');
    assert.match((await act(adminB, req.id, 'approve')).location, /error=REQUEST_NOT_PENDING/);
    const noCsrf = await adminB.post(`/demo-admin/requests/${crypto.randomUUID()}`, { action: 'approve' });
    assert.match(noCsrf.location ?? '', /error=FORM_EXPIRED/);
  });
});

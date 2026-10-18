import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import { activate, browser, createActiveUser, csrfFrom, linkFrom, listenForTest, nextMail, mailCount, refreshWith, registerClient, signInTokens, startService } from './helpers.mjs';

// PLAT-ROLE-001 admin service and organisation invitations.
const PASSWORD = 'Ndole-et-Plantain-2026';
const TX = 'urn:ietf:params:oauth:grant-type:token-exchange';
const AT = 'urn:ietf:params:oauth:token-type:access_token';
const sha = v => crypto.createHash('sha256').update(v).digest('hex');

describe('organisation admin API and invitations', () => {
  let svc;
  let health;
  let sms;
  const smsInbox = [];
  const secret = 'health-server-secret-' + crypto.randomBytes(8).toString('hex');
  const otherSecret = 'other-server-secret-' + crypto.randomBytes(8).toString('hex');
  let n = 0;

  before(async () => {
    sms = http.createServer((req, res) => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => { smsInbox.push(JSON.parse(b)); res.writeHead(201); res.end('{}'); }); });
    await listenForTest(sms);
    svc = await startService({ env: { IDENTITY_SMS_URL: `http://127.0.0.1:${sms.address().port}/sms/v1/messages` } });
    health = await registerClient(svc.pool, { selfRoles: [], personal: false });
    await svc.pool.query(`UPDATE platform.oauth_clients SET client_secret_hash=$2, admin_scopes=$3, admin_roles=$4, assignable_roles=$5 WHERE client_id=$1`,
      ['health-web', sha(secret), ['members:read', 'roles:write', 'members:write', 'invitations:write'], ['facility_admin'], ['facility_admin', 'nurse', 'receptionist']]);
    await registerClient(svc.pool, { id: 'other-web', redirect: 'https://other.example.test/', selfRoles: [], personal: false });
    await svc.pool.query("UPDATE platform.oauth_clients SET client_secret_hash=$2, admin_scopes='{members:read}' WHERE client_id=$1", ['other-web', sha(otherSecret)]);
  });
  after(async () => { await svc.stop(); await new Promise(r => sms.close(r)); });

  // ---- setup helpers (direct SQL = what an ADS operator would do) ----
  const user = async (prefix = 'u') => { n += 1; return createActiveUser(svc.pool, `${prefix}-${n}@example.cm`, PASSWORD); };
  async function org(owner, name = `Clinique ${n}`) {
    const orgId = crypto.randomUUID();
    const tenantId = crypto.randomUUID();
    await svc.pool.query('INSERT INTO platform.organizations(id,name,slug) VALUES ($1,$2,$3)', [orgId, name, `o-${orgId}`]);
    await svc.pool.query('INSERT INTO platform.tenants(id,organization_id,name) VALUES ($1,$2,$3)', [tenantId, orgId, name]);
    await svc.pool.query("INSERT INTO platform.memberships(user_id,tenant_id,role) VALUES ($1,$2,'owner')", [owner.id, tenantId]);
    return tenantId;
  }
  const member = async (u, tenantId, roles = [], role = 'member', client = 'health-web') => {
    await svc.pool.query('INSERT INTO platform.memberships(user_id,tenant_id,role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [u.id, tenantId, role]);
    if (roles.length) await svc.pool.query('INSERT INTO platform.product_roles(user_id,tenant_id,client_id,roles) VALUES ($1,$2,$3,$4)', [u.id, tenantId, client, roles]);
  };
  // A product access token as the product's browser would hold it (signed by the service key).
  const productToken = (u, tenantId, client = 'health-web', roles = ['facility_admin']) => svc.keys.sign(
    { tenant_id: tenantId, roles, client_id: client }, { audience: client, issuer: svc.config.issuer, subject: u.id, expiresIn: 900 });
  const exchange = async ({ subject, client = 'health-web', clientSecret = secret, scope, basic = true }) => {
    const form = { grant_type: TX, subject_token: subject, subject_token_type: AT, ...(scope ? { scope } : {}), ...(basic ? {} : { client_id: client, client_secret: clientSecret }) };
    const res = await fetch(`${svc.base}/token`, {
      method: 'POST', body: new URLSearchParams(form),
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...(basic ? { authorization: `Basic ${Buffer.from(`${client}:${clientSecret}`).toString('base64')}` } : {}) },
    });
    return { status: res.status, body: await res.json() };
  };
  const adminTokenFor = async (u, tenantId, opts = {}) => {
    const r = await exchange({ subject: await productToken(u, tenantId), ...opts });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body.access_token;
  };
  const api = async (token, method, path, body) => {
    const res = await fetch(`${svc.base}/admin/v1${path}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() };
  };
  const audits = async (event, tenantId) => (await svc.pool.query('SELECT * FROM platform.identity_audit WHERE event_type=$1 AND tenant_id=$2 ORDER BY id', [event, tenantId])).rows;

  it('token exchange: needs the product server secret, a token for that product and a real admin', async () => {
    const owner = await user('owner');
    const t = await org(owner);
    const nurse = await user('nurse');
    await member(nurse, t, ['nurse']);
    const subject = await productToken(owner, t);

    assert.equal((await exchange({ subject, clientSecret: 'wrong' })).status, 401, 'wrong secret');
    assert.equal((await exchange({ subject, clientSecret: 'wrong', basic: false })).status, 401);
    const forOther = await exchange({ subject, client: 'other-web', clientSecret: otherSecret });
    assert.equal(forOther.status, 400, 'a health-web token cannot be exchanged by another product');
    assert.equal(forOther.body.error, 'invalid_grant');
    const notAdmin = await exchange({ subject: await productToken(nurse, t, 'health-web', ['nurse']) });
    assert.equal(notAdmin.body.error, 'access_denied', 'a nurse is not an admin');
    assert.equal((await exchange({ subject, scope: 'members:read superpowers' })).body.error, 'access_denied');
    const expired = await svc.keys.sign({ tenant_id: t, roles: ['x'], client_id: 'health-web' }, { audience: 'health-web', issuer: svc.config.issuer, subject: owner.id, expiresIn: -10 });
    assert.equal((await exchange({ subject: expired })).body.error, 'invalid_grant');

    const ok = await exchange({ subject, basic: false });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.issued_token_type, AT);
    assert.equal(ok.body.scope, 'members:read roles:write members:write invitations:write');
    assert.ok(ok.body.expires_in <= 300);
    const claims = JSON.parse(Buffer.from(ok.body.access_token.split('.')[1], 'base64url'));
    assert.equal(claims.aud, `${svc.base}/admin`, 'admin tokens are never valid for a product');
    assert.deepEqual([claims.sub, claims.tenant_id, claims.client_id], [owner.id, t, 'health-web']);
    // The admin token cannot be presented to a product, nor exchanged again.
    assert.equal((await exchange({ subject: ok.body.access_token })).body.error, 'invalid_grant');
    assert.ok((await audits('admin_token', t)).some(a => a.outcome === 'allowed'));
    assert.ok((await audits('admin_token', t)).some(a => a.outcome === 'denied' && a.reason === 'NOT_AN_ADMIN'));
  });

  it('client credentials alone, or a product token alone, cannot call the admin API', async () => {
    const owner = await user('owner');
    const t = await org(owner);
    const basic = await fetch(`${svc.base}/admin/v1/members`, { headers: { authorization: `Basic ${Buffer.from(`health-web:${secret}`).toString('base64')}` } });
    assert.equal(basic.status, 401);
    assert.equal((await api(await productToken(owner, t), 'GET', '/members')).status, 401, 'product token is not an admin token');
    assert.equal((await api('garbage', 'GET', '/members')).status, 401);
  });

  it('lists members of my organisation with their roles in this product', async () => {
    const owner = await user('owner');
    const t = await org(owner);
    const nurse = await user('nurse');
    await member(nurse, t, ['nurse']);
    await svc.pool.query("INSERT INTO platform.product_roles(user_id,tenant_id,client_id,roles) VALUES ($1,$2,'other-web','{clerk}')", [nurse.id, t]);
    const elsewhere = await user('else');
    await org(elsewhere);
    const token = await adminTokenFor(owner, t);
    const me = await api(token, 'GET', '/me');
    assert.deepEqual([me.body.orgAdmin, me.body.product], [true, 'health-web']);
    const list = await api(token, 'GET', '/members');
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.items.map(m => m.email).sort(), [owner.email, nurse.email].sort(), 'only this organisation');
    const row = list.body.items.find(m => m.email === nurse.email);
    assert.deepEqual([row.orgRole, row.status, row.roles], ['member', 'active', ['nurse']], 'roles of THIS product only');
  });

  it('grants and revokes product roles; the next token carries them; everything is audited', async () => {
    const owner = await user('owner');
    const t = await org(owner);
    const nurse = await user('nurse');
    await member(nurse, t, ['nurse']);
    const token = await adminTokenFor(owner, t);

    const granted = await api(token, 'POST', `/members/${nurse.id}/roles/grant`, { roles: ['receptionist'] });
    assert.equal(granted.status, 200);
    assert.deepEqual(granted.body.roles, ['nurse', 'receptionist']);
    const tokens = await signInTokens(svc, health, { email: nurse.email, password: PASSWORD });
    assert.deepEqual(JSON.parse(Buffer.from(tokens.access_token.split('.')[1], 'base64url')).roles.sort(), ['nurse', 'receptionist']);

    assert.equal((await api(token, 'POST', `/members/${nurse.id}/roles/grant`, { roles: ['surgeon'] })).body.error.code, 'ROLE_NOT_ASSIGNABLE');
    assert.equal((await api(token, 'POST', `/members/${nurse.id}/roles/grant`, { roles: ['Bad Role!'] })).body.error.code, 'ROLES_INVALID');

    const revoked = await api(token, 'POST', `/members/${nurse.id}/roles/revoke`, { roles: ['receptionist'] });
    assert.deepEqual(revoked.body.roles, ['nurse']);
    assert.equal((await refreshWith(svc, 'health-web', tokens.refresh_token)).status, 400, 'sign-ins holding the removed role cannot be renewed');

    const g = (await audits('admin_roles_granted', t)).at(-1);
    assert.equal(g.user_id, owner.id);
    assert.equal(g.client_id, 'health-web');
    assert.deepEqual(g.metadata.after, ['nurse', 'receptionist']);
    assert.equal(g.metadata.target_user_id, nurse.id);
    assert.deepEqual((await audits('admin_roles_revoked', t)).at(-1).metadata.after, ['nurse']);
    await assert.rejects(svc.pool.query('DELETE FROM platform.identity_audit WHERE id=$1', [g.id]), /append-only/);
  });

  it('grants access to a signed-in requester who is not a member yet (access requests)', async () => {
    const owner = await user('owner');
    const t = await org(owner);
    const requester = await user('req');
    const token = await adminTokenFor(owner, t);
    const r = await api(token, 'POST', `/members/${requester.id}/roles/grant`, { roles: ['nurse'] });
    assert.equal(r.status, 200);
    const m = (await svc.pool.query('SELECT role,status FROM platform.memberships WHERE user_id=$1 AND tenant_id=$2', [requester.id, t])).rows[0];
    assert.deepEqual(m, { role: 'member', status: 'active' });
    assert.equal((await audits('admin_roles_granted', t)).at(-1).metadata.member_added, true);
    assert.equal((await api(token, 'POST', `/members/${crypto.randomUUID()}/roles/grant`, { roles: ['nurse'] })).status, 404);
  });

  it('an admin of one organisation cannot touch another organisation', async () => {
    const a = await user('ownerA');
    const ta = await org(a, 'Clinique A');
    const b = await user('ownerB');
    const tb = await org(b, 'Clinique B');
    const nurseB = await user('nurseB');
    await member(nurseB, tb, ['nurse']);
    const tokenA = await adminTokenFor(a, ta);
    assert.equal((await api(tokenA, 'POST', `/members/${nurseB.id}/deactivate`)).status, 404);
    assert.equal((await api(tokenA, 'POST', `/members/${nurseB.id}/roles/revoke`, { roles: ['nurse'] })).status, 404);
    assert.equal((await svc.pool.query('SELECT status FROM platform.memberships WHERE user_id=$1 AND tenant_id=$2', [nurseB.id, tb])).rows[0].status, 'active');
    // A product token for organisation B held by A (not a member there) gives no admin token.
    assert.equal((await exchange({ subject: await productToken(a, tb) })).body.error, 'access_denied');
  });

  it('scopes limit the admin token, and admin rights are re-checked on every call', async () => {
    const owner = await user('owner');
    const t = await org(owner);
    const co = await user('coadmin');
    await member(co, t, ['facility_admin'], 'admin');
    const nurse = await user('nurse');
    await member(nurse, t, ['nurse']);
    const readOnly = await adminTokenFor(co, t, { scope: 'members:read' });
    assert.equal((await api(readOnly, 'GET', '/members')).status, 200);
    assert.equal((await api(readOnly, 'POST', `/members/${nurse.id}/roles/grant`, { roles: ['receptionist'] })).status, 403);
    assert.equal((await audits('admin_denied', t)).at(-1).reason, 'SCOPE_NOT_GRANTED');
    // other-web is registered for members:read only.
    await svc.pool.query("INSERT INTO platform.product_roles(user_id,tenant_id,client_id,roles) VALUES ($1,$2,'other-web','{clerk}')", [co.id, t]);
    const other = await exchange({ subject: await productToken(co, t, 'other-web', ['clerk']), client: 'other-web', clientSecret: otherSecret });
    assert.equal(other.body.scope, 'members:read');
    assert.equal((await exchange({ subject: await productToken(co, t, 'other-web', ['clerk']), client: 'other-web', clientSecret: otherSecret, scope: 'roles:write' })).body.error, 'access_denied');

    const full = await adminTokenFor(co, t);
    await svc.pool.query("UPDATE platform.memberships SET role='member' WHERE user_id=$1 AND tenant_id=$2", [co.id, t]);
    await svc.pool.query("UPDATE platform.product_roles SET roles='{nurse}' WHERE user_id=$1 AND tenant_id=$2 AND client_id='health-web'", [co.id, t]);
    assert.equal((await api(full, 'GET', '/members')).status, 403, 'demoted admin: still-valid token no longer works');
    assert.equal((await audits('admin_denied', t)).at(-1).reason, 'NOT_AN_ADMIN');
  });

  it('product admins (admin_roles) manage that product\'s roles but not membership or admin roles', async () => {
    const owner = await user('owner');
    const t = await org(owner);
    const fa = await user('facility');
    await member(fa, t, ['facility_admin']);
    const nurse = await user('nurse');
    await member(nurse, t, ['nurse']);
    const ex = await exchange({ subject: await productToken(fa, t) });
    assert.equal(ex.body.scope, 'members:read roles:write invitations:write', 'no members:write for product admins');
    const token = ex.body.access_token;
    assert.equal((await api(token, 'POST', `/members/${nurse.id}/roles/grant`, { roles: ['receptionist'] })).status, 200);
    assert.equal((await api(token, 'POST', `/members/${nurse.id}/roles/grant`, { roles: ['facility_admin'] })).status, 403, 'cannot create more admins');
    assert.equal((await api(token, 'POST', `/members/${nurse.id}/deactivate`)).status, 403);
  });

  it('deactivating a member ends their sign-ins for that organisation; reactivating restores access', async () => {
    const owner = await user('owner');
    const t = await org(owner);
    const nurse = await user('nurse');
    await member(nurse, t, ['nurse']);
    const tokens = await signInTokens(svc, health, { email: nurse.email, password: PASSWORD });
    const token = await adminTokenFor(owner, t);

    assert.equal((await api(token, 'POST', `/members/${owner.id}/deactivate`)).body.error.code, 'CANNOT_CHANGE_YOURSELF');
    const off = await api(token, 'POST', `/members/${nurse.id}/deactivate`);
    assert.deepEqual(off.body, { userId: nurse.id, status: 'deactivated' });
    assert.equal((await refreshWith(svc, 'health-web', tokens.refresh_token)).status, 400, 'refresh tokens revoked');
    await assert.rejects(signInTokens(svc, health, { email: nurse.email, password: PASSWORD }), /not redirected back/, 'cannot sign in to this organisation');
    assert.equal((await api(token, 'GET', '/members')).body.items.find(m => m.userId === nurse.id).status, 'deactivated');
    assert.equal((await api(token, 'POST', `/members/${nurse.id}/roles/grant`, { roles: ['receptionist'] })).body.error.code, 'MEMBER_DEACTIVATED');
    assert.equal((await audits('admin_member_deactivated', t)).at(-1).metadata.refresh_tokens_revoked, 1);

    assert.equal((await api(token, 'POST', `/members/${nurse.id}/reactivate`)).body.status, 'active');
    assert.ok((await signInTokens(svc, health, { email: nurse.email, password: PASSWORD })).access_token);

    // Organisation admins: owners promote and demote; admins cannot touch the owner or other admins' status.
    assert.equal((await api(token, 'POST', `/members/${nurse.id}/org-admin`, { admin: true })).body.orgRole, 'admin');
    const asAdmin = await adminTokenFor(nurse, t);
    assert.equal((await api(asAdmin, 'POST', `/members/${owner.id}/deactivate`)).status, 403);
    assert.ok((await audits('admin_org_role_changed', t)).length >= 1);
  });

  it('invites a NEW person by email: register, activate, accept, then sign in with the roles', async () => {
    const owner = await user('owner');
    const t = await org(owner, 'Tontine Mvog-Ada');
    const token = await adminTokenFor(owner, t);
    const email = `new-${n}@example.cm`;
    const inv = await api(token, 'POST', '/invitations', { email, roles: ['nurse'], phone: '+237670001122', locale: 'fr' });
    assert.equal(inv.status, 201);
    assert.equal(inv.body.status, 'pending');
    const days = (new Date(inv.body.expiresAt) - Date.now()) / 86400000;
    assert.ok(days > 6.9 && days <= 7, 'expires in 7 days by default');
    const mail = await nextMail(svc, email);
    assert.match(mail.subject, /Tontine Mvog-Ada invited you to ADS health-web/);
    assert.match(mail.text, /Accepter l'invitation/);
    const link = linkFrom(mail, '/invite');
    for (let i = 0; i < 50 && !smsInbox.some(m => m.to === '+237670001122'); i += 1) await new Promise(r => setTimeout(r, 10));
    assert.ok(smsInbox.find(m => m.to === '+237670001122').text.includes('/invite?token='), 'SMS hook received the invitation');

    const b = browser(svc.base);
    const landing = await b.get(link);
    assert.equal(landing.status, 200);
    assert.match(landing.text, /Tontine Mvog-Ada/);
    assert.match(landing.text, /Créer mon compte ADS/, 'invitation language');
    const regHref = landing.text.match(/href="(\/register\?next=[^"]+)"/)[1].replace(/&amp;/g, '&');
    const reg = await b.get(regHref);
    assert.match(reg.text, new RegExp(`value="${email}"`), 'email prefilled');
    await b.post('/register', { csrf: csrfFrom(reg.text), email, password: PASSWORD, confirm: PASSWORD, next: new URL(regHref, svc.base).searchParams.get('next') });
    const activation = linkFrom(await nextMail(svc, email, 1), '/verify-email');
    assert.match(activation, /next=%2Finvite/);
    const activated = await activate(b, activation, PASSWORD);
    assert.equal(activated.status, 302);
    assert.match(activated.location, /^\/invite\?token=/);
    const page = await b.get(activated.location);
    assert.match(page.text, /Accepter et rejoindre/);
    const accepted = await b.post('/invite/accept', { csrf: csrfFrom(page.text), token: new URL(link).searchParams.get('token'), lang: 'en' });
    assert.equal(accepted.status, 200);
    assert.match(accepted.text, /Welcome to Tontine Mvog-Ada/);
    assert.match(accepted.text, /href="https:\/\/health\.example\.test\/app\/"/);

    const tokens = await signInTokens(svc, health, { email, password: PASSWORD });
    const claims = JSON.parse(Buffer.from(tokens.access_token.split('.')[1], 'base64url'));
    assert.deepEqual([claims.tenant_id, claims.roles], [t, ['nurse']]);
    assert.equal((await b.get(link)).status, 400, 'single use');
    assert.equal((await api(token, 'GET', '/invitations')).body.items[0].status, 'accepted');
    const acc = (await audits('invitation_accepted', t)).at(-1);
    assert.equal(acc.metadata.invited_by, owner.id);
    assert.equal((await audits('admin_invitation_created', t)).at(-1).metadata.email, email);
  });

  it('invites an EXISTING account: sign in, accept; a different account cannot use the link', async () => {
    const owner = await user('owner');
    const t = await org(owner, 'Home Services Bastos');
    const staff = await user('staff');
    const stranger = await user('stranger');
    const token = await adminTokenFor(owner, t);
    await api(token, 'POST', '/invitations', { email: staff.email, roles: ['receptionist'] });
    const link = linkFrom(await nextMail(svc, staff.email), '/invite');
    const invToken = new URL(link).searchParams.get('token');

    // The stranger (signed in) sees whose invitation it is and cannot accept it.
    const sb = browser(svc.base);
    const loginS = await sb.get('/login');
    await sb.post('/login', { csrf: csrfFrom(loginS.text), email: stranger.email, password: PASSWORD });
    const seen = await sb.get(link);
    assert.match(seen.text, /This invitation is for/);
    const forced = await sb.post('/invite/accept', { csrf: csrfFrom(seen.text), token: invToken });
    assert.equal(forced.status, 403);
    assert.match(forced.text, /sent to another email address/);
    assert.equal((await audits('invitation_accept', t)).at(-1).reason, 'EMAIL_MISMATCH');

    const b = browser(svc.base);
    const landing = await b.get(link);
    const loginHref = landing.text.match(/href="(\/login\?next=[^"]+)"/)[1].replace(/&amp;/g, '&');
    const login = await b.get(loginHref);
    const signed = await b.post('/login', { csrf: csrfFrom(login.text), email: staff.email, password: PASSWORD, next: new URL(loginHref, svc.base).searchParams.get('next') });
    assert.match(signed.location, /^\/invite\?token=/);
    const page = await b.get(signed.location);
    const done = await b.post('/invite/accept', { csrf: csrfFrom(page.text), token: invToken });
    assert.equal(done.status, 200);
    assert.ok((await signInTokens(svc, health, { email: staff.email, password: PASSWORD })).access_token);
  });

  it('invitations are listable, revocable, replaced on resend, and expire', async () => {
    const owner = await user('owner');
    const t = await org(owner);
    const token = await adminTokenFor(owner, t);
    const email = `list-${n}@example.cm`;
    const first = await api(token, 'POST', '/invitations', { email, roles: ['nurse'] });
    const firstLink = linkFrom(await nextMail(svc, email), '/invite');
    const second = await api(token, 'POST', '/invitations', { email, roles: ['nurse', 'receptionist'] });
    assert.equal((await browser(svc.base).get(firstLink)).status, 400, 'resend replaces the earlier link');
    const items = (await api(token, 'GET', '/invitations')).body.items;
    assert.deepEqual(items.filter(i => i.email === email).map(i => [i.id, i.status]), [[second.body.id, 'pending'], [first.body.id, 'revoked']]);

    const secondLink = linkFrom(await nextMail(svc, email, 1), '/invite');
    const revoked = await api(token, 'POST', `/invitations/${second.body.id}/revoke`);
    assert.equal(revoked.body.status, 'revoked');
    assert.equal((await browser(svc.base).get(secondLink)).status, 400);
    assert.ok((await audits('admin_invitation_revoked', t)).length >= 1);

    await api(token, 'POST', '/invitations', { email, roles: ['nurse'] });
    const third = linkFrom(await nextMail(svc, email, 2), '/invite');
    await svc.pool.query("UPDATE platform.invitations SET expires_at=now()-interval '1 second' WHERE token_hash=$1", [sha(new URL(third).searchParams.get('token'))]);
    const exp = await browser(svc.base).get(third);
    assert.equal(exp.status, 400);
    assert.match(exp.text, /invalid or has expired/);
    assert.equal((await api(token, 'GET', '/invitations')).body.items[0].status, 'expired');

    assert.equal((await api(token, 'POST', '/invitations', { email: 'not-an-email', roles: ['nurse'] })).body.error.code, 'EMAIL_INVALID');
    assert.equal((await api(token, 'POST', '/invitations', { email, roles: [] })).body.error.code, 'ROLES_INVALID');
    assert.equal((await api(token, 'POST', '/invitations', { email, roles: ['nurse'], phone: 'call me' })).body.error.code, 'PHONE_INVALID');
    const nurseOnly = await user('nurse');
    await member(nurseOnly, t, ['nurse']);
    assert.equal((await exchange({ subject: await productToken(nurseOnly, t, 'health-web', ['nurse']) })).body.error, 'access_denied', 'members cannot invite');
  });

  it('hosted admin page: bilingual, signs in first, manages roles, members and invitations with CSRF', async () => {
    const owner = await user('owner');
    const t = await org(owner, 'Clinique de la Cité');
    const nurse = await user('nurse');
    await member(nurse, t, ['nurse']);
    const b = browser(svc.base);
    const gate = await b.get(`/admin?tenant=${t}`);
    assert.equal(gate.status, 302);
    assert.match(gate.location, /^\/login\?next=%2Fadmin/);
    const login = await b.get(gate.location);
    const signed = await b.post('/login', { csrf: csrfFrom(login.text), email: owner.email, password: PASSWORD, next: new URL(gate.location, svc.base).searchParams.get('next') });
    assert.match(signed.location, /^\/admin\?tenant=/);
    const en = await b.get(`/admin?tenant=${t}&product=health-web&lang=en`);
    assert.equal(en.status, 200);
    assert.match(en.text, /Organisation administration/);
    assert.match(en.text, /Clinique de la Cité/);
    assert.match(en.text, new RegExp(nurse.email));
    assert.match(en.res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    const fr = await b.get(`/admin?tenant=${t}&product=health-web&lang=fr`);
    assert.match(fr.text, /Administration de l&#39;organisation/);
    assert.match(fr.text, /Envoyer l&#39;invitation/);

    const csrf = csrfFrom(en.text);
    const base = { csrf, tenant: t, product: 'health-web', lang: 'en' };
    const noCsrf = await b.post('/admin', { ...base, csrf: '', action: 'grant', user_id: nurse.id, roles: 'receptionist' });
    assert.equal(noCsrf.status, 400);
    const g = await b.post('/admin', { ...base, action: 'grant', user_id: nurse.id, roles: 'receptionist, nurse' });
    assert.match(g.location, /done=granted/);
    assert.match((await b.get(g.location)).text, /Roles granted/);
    const bad = await b.post('/admin', { ...base, action: 'grant', user_id: nurse.id, roles: 'surgeon' });
    assert.match(bad.location, /error=ROLE_NOT_ASSIGNABLE/);
    assert.match((await b.get(bad.location)).text, /That role does not exist in this product/);
    await b.post('/admin', { ...base, action: 'revoke', user_id: nurse.id, roles: 'nurse' });
    assert.deepEqual((await svc.pool.query("SELECT roles FROM platform.product_roles WHERE user_id=$1 AND tenant_id=$2 AND client_id='health-web'", [nurse.id, t])).rows[0].roles, ['receptionist']);
    await b.post('/admin', { ...base, action: 'deactivate', user_id: nurse.id });
    assert.equal((await svc.pool.query('SELECT status FROM platform.memberships WHERE user_id=$1 AND tenant_id=$2', [nurse.id, t])).rows[0].status, 'disabled');
    await b.post('/admin', { ...base, action: 'reactivate', user_id: nurse.id });
    const before = mailCount(svc, `page-${n}@example.cm`);
    const inv = await b.post('/admin', { ...base, action: 'invite', email: `page-${n}@example.cm`, roles: 'nurse', locale: 'en' });
    assert.match(inv.location, /done=invited/);
    await nextMail(svc, `page-${n}@example.cm`, before);
    const withInv = await b.get(inv.location);
    assert.match(withInv.text, /data-invitation="page-/);
    const invId = (await svc.pool.query('SELECT id FROM platform.invitations WHERE tenant_id=$1', [t])).rows[0].id;
    assert.match((await b.post('/admin', { ...base, action: 'revoke_invitation', invitation_id: invId })).location, /done=invite_revoked/);
    assert.ok((await svc.pool.query("SELECT 1 FROM platform.identity_audit WHERE tenant_id=$1 AND reason='page' AND event_type='admin_roles_granted'", [t])).rowCount);

    // A member who administers nothing sees no organisation and cannot post actions.
    const nb = browser(svc.base);
    const nl = await nb.get('/login?next=%2Fadmin');
    await nb.post('/login', { csrf: csrfFrom(nl.text), email: nurse.email, password: PASSWORD, next: '/admin' });
    const nurseView = await nb.get('/admin');
    assert.match(nurseView.text, /not an administrator of any organisation/);
    const attempt = await nb.post('/admin', { csrf: csrfFrom(nurseView.text), tenant: t, product: 'health-web', action: 'deactivate', user_id: owner.id });
    assert.match(attempt.location, /error=FORBIDDEN/);
    // Only our own pages are accepted as `next` (no open redirect).
    const evil = await nb.get('/login?next=https%3A%2F%2Fevil.example%2F');
    assert.doesNotMatch(evil.text, /evil\.example/);
  });
});

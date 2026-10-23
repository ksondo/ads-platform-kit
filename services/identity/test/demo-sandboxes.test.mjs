import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { loadConfig } from '../src/config.mjs';
import { openDemoPool } from '../src/sandboxes.mjs';
import { verifyRequest } from '../src/sandbox-provisioning.mjs';
import { DATABASE_URL, browser, csrfFrom, listenForTest, pkce, reqFrom, startService } from './helpers.mjs';

// BRIEF18 personal demo sandboxes: sign-up with a one-time code and daily limits, provisioning to
// products (signed, retried), isolation between sandboxes, "Switch role", expiry and deletion, and
// refusal outside the demo environment.
const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, '../src/cli.mjs');
const clientsDoc = JSON.parse(readFileSync(path.resolve(here, '../../../config/clients.demo.json'), 'utf8'));
const personasDoc = JSON.parse(readFileSync(path.resolve(here, '../../../config/demo-personas.json'), 'utf8'));
const bySlug = Object.fromEntries(clientsDoc.products.map(p => [p.slug, p]));
const SECRET = crypto.randomBytes(32).toString('hex');
const decode = jwt => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
const node = (args, env) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, DATABASE_URL, ...env }, timeout: 120_000 });
const form = (o) => new URLSearchParams(o).toString();

// A fake set of product servers (one http server, a path prefix per product) that records every
// provisioning call and checks its signature like a product must.
function fakeProducts() {
  const calls = [];
  const plan = { commerce: { post: [503, 503, 201] }, fleetguard: { post: [201] }, education: { post: [404] }, tontine: { post: [400] } };
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const [, product, ...rest] = req.url.split('/');
      const p = `/${rest.join('/')}`;
      const signed = verifyRequest({ secret: SECRET, method: req.method, path: p, body: raw, header: req.headers['ads-demo-signature'] });
      calls.push({ product, method: req.method, path: p, signed, body: raw ? JSON.parse(raw) : null, idem: req.headers['idempotency-key'] });
      const queue = plan[product]?.[req.method === 'POST' ? 'post' : 'delete'] ?? [req.method === 'POST' ? 201 : 200];
      const status = !signed ? 401 : queue.length > 1 ? queue.shift() : queue[0];
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(status < 300 ? { status: req.method === 'POST' ? 'ready' : 'deleted' } : { error: `E${status}` }));
    });
  });
  return { server, calls, plan };
}

// The tester's journey on the hosted pages: sign-up form -> code -> signed in.
async function signUp(svc, b, contact, { req = null, codeOf } = {}) {
  const page = await b.get(`/demo/signup${req ? `?req=${req}` : ''}`);
  assert.equal(page.status, 200);
  const sent = await b.post('/demo/signup', { csrf: csrfFrom(page.text), contact, consent: 'yes', req: req ?? '' });
  assert.equal(sent.status, 200, sent.text.slice(0, 400));
  const code = await codeOf(sent.text);
  return b.post('/demo/verify', { csrf: csrfFrom(sent.text), code, req: req ?? '' });
}

describe('personal demo sandboxes', () => {
  let svc;
  let dir;
  let fake;
  let fakeBase;
  let sms;
  let smsBox;
  let demoPool;
  let A; // { b, sandboxId, ownerId, email }
  let B;
  const sbOf = async ownerEmailOrContact => (await svc.pool.query('SELECT * FROM platform.demo_sandboxes WHERE contact=$1', [ownerEmailOrContact])).rows[0];
  const emailCode = async to => {
    for (let i = 0; i < 100; i += 1) {
      const m = svc.mailer.outbox.filter(x => x.to === to).at(-1);
      if (m) return m.text.match(/\b(\d{6})\b/)[1];
      await new Promise(r => setTimeout(r, 10));
    }
    throw new Error(`no code mail to ${to}`);
  };

  before(async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'kit-sandboxes-'));
    fake = fakeProducts();
    await listenForTest(fake.server);
    fakeBase = `http://127.0.0.1:${fake.server.address().port}`;
    smsBox = [];
    sms = http.createServer((req, res) => { let raw = ''; req.on('data', c => { raw += c; }); req.on('end', () => { smsBox.push(JSON.parse(raw)); res.writeHead(201); res.end('{}'); }); });
    await listenForTest(sms);
    const products = { products: Object.fromEntries(clientsDoc.products.map(p => [p.slug, { base_url: ['commerce', 'fleetguard', 'education', 'tontine'].includes(p.slug) ? `${fakeBase}/${p.slug}` : null }])) };
    writeFileSync(path.join(dir, 'products.json'), JSON.stringify(products));
    svc = await startService({ env: {
      ADS_ENV: 'demo', DEMO_MODE: '1', DEMO_SANDBOXES: '1', DEMO_PROVISIONING_SECRET: SECRET, DEMO_PRODUCTS_FILE: path.join(dir, 'products.json'),
      DEMO_OTP_SMS_URL: `http://127.0.0.1:${sms.address().port}/sms/v1/messages`, DEMO_OTP_SHOW_SMS_CODE: '1',
      DEMO_PROVISIONING_BACKOFF_MS: '5', DEMO_PROVISIONING_ATTEMPTS: '3', DEMO_SIGNUP_CODES_PER_CONTACT_PER_DAY: '4',
      DEMO_SIGNUP_CODES_PER_IP_PER_DAY: '50', DEMO_SIGNUP_SANDBOXES_PER_IP_PER_DAY: '10',
    } });
    // The reviewed client list, registered as apply-clients does (without client secrets, not needed here).
    for (const p of clientsDoc.products) {
      await svc.pool.query(`INSERT INTO platform.oauth_clients(client_id,display_name,redirect_uris,post_logout_redirect_uris,self_service_roles,allow_personal_workspace,admin_roles,assignable_roles)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [p.client_id, p.display_name, p.redirect_uris, p.post_logout_redirect_uris ?? [], p.self_service_roles ?? [], p.allow_personal_workspace !== false, p.admin_roles ?? [], p.assignable_roles ?? []]);
    }
    demoPool = openDemoPool(DATABASE_URL, 2);
  });
  after(async () => {
    await svc.app.close();
    await demoPool.end();
    await svc.stop();
    fake.server.close();
    sms.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('sign-up page: EN and FR, consent required, the secret never shows', async () => {
    const b = browser(svc.base);
    const en = await b.get('/demo/signup');
    assert.match(en.text, /Try ADS free for 30 days/);
    assert.match(en.text, /deleted 30 days after sign-up/);
    const fr = await b.get('/demo/signup?lang=fr');
    assert.match(fr.text, /Essayez ADS gratuitement pendant 30 jours/);
    assert.match(fr.text, /supprimés 30 jours après l’inscription/);
    const login = await b.get('/login');
    assert.match(login.text, /href="\/demo\/signup"/);
    const noConsent = await b.post('/demo/signup', { csrf: csrfFrom(en.text), contact: 'nc@example.test' });
    assert.equal(noConsent.status, 400);
    assert.match(noConsent.text, /confirm that you understand/);
    const bad = await b.post('/demo/signup', { csrf: csrfFrom(en.text), contact: '12', consent: 'yes' });
    assert.equal(bad.status, 400);
    const reserved = await b.post('/demo/signup', { csrf: csrfFrom(en.text), contact: 'x@demo.africadigitalsynergy.com', consent: 'yes' });
    assert.equal(reserved.status, 400);
    for (const r of [en, fr, login]) assert.ok(!r.text.includes(SECRET));
    assert.ok(!JSON.stringify(svc.config).includes(SECRET));
  });

  it('email sign-up: wrong code refused, right code creates the sandbox, signs in and provisions every product', async () => {
    const b = browser(svc.base);
    const email = `tester-a-${crypto.randomBytes(3).toString('hex')}@example.test`;
    const page = await b.get('/demo/signup');
    const sent = await b.post('/demo/signup', { csrf: csrfFrom(page.text), contact: email, consent: 'yes' });
    assert.equal(sent.status, 200);
    assert.match(sent.text, /t\*\*\*@example\.test/);
    assert.ok(!sent.text.includes('data-test-code'), 'email codes are never shown on the page');
    const code = await emailCode(email);
    const wrong = await b.post('/demo/verify', { csrf: csrfFrom(sent.text), code: code === '000000' ? '111111' : '000000' });
    assert.equal(wrong.status, 400);
    assert.match(wrong.text, /not right/);
    const ok = await b.post('/demo/verify', { csrf: csrfFrom(sent.text), code });
    assert.equal(ok.status, 302);
    assert.equal(ok.location, '/demo/preparing');
    const sb = await sbOf(email);
    assert.match(sb.id, /^sb-[a-z0-9]{10}$/);
    assert.equal(sb.contact_kind, 'email');
    const days = (new Date(sb.expires_at) - new Date(sb.created_at)) / 86_400_000;
    assert.ok(Math.abs(days - 30) < 0.01);
    const owner = (await svc.pool.query('SELECT * FROM platform.users WHERE id=$1', [sb.owner_user_id])).rows[0];
    assert.equal(owner.is_demo, true);
    assert.equal(owner.demo_sandbox_id, sb.id);
    assert.equal(owner.password_hash, null);
    assert.notEqual(owner.email, email, 'the tester\'s email is not an account email');
    // "Preparing your demo…" polls this.
    const preparing = await b.get('/demo/preparing');
    assert.equal(preparing.status, 200);
    assert.match(preparing.text, /Preparing your demo|Your demo is ready/);
    await svc.app.sandboxes.idle();
    const status = JSON.parse((await b.get('/demo/v1/sandbox/status', { accept: 'application/json' })).text);
    assert.equal(status.settled, true);
    const st = Object.fromEntries(status.products.map(p => [p.product, p.status]));
    assert.equal(st.commerce, 'ready');
    assert.equal(st.fleetguard, 'ready');
    assert.equal(st.education, 'not_available');
    assert.equal(st.tontine, 'failed');
    assert.equal(st.health, 'not_available');
    assert.equal((await svc.pool.query("SELECT attempts FROM platform.demo_sandbox_products WHERE sandbox_id=$1 AND product='commerce'", [sb.id])).rows[0].attempts, 3, 'retried twice after 503');
    assert.equal((await svc.pool.query('SELECT status FROM platform.demo_sandboxes WHERE id=$1', [sb.id])).rows[0].status, 'partial');
    A = { b, sandboxId: sb.id, ownerId: sb.owner_user_id, email };
  });

  it('products get signed, complete payloads: their tenants and persona subs, tagged with the sandbox', async () => {
    const posts = fake.calls.filter(c => c.method === 'POST' && c.body?.sandbox_id === A.sandboxId);
    assert.ok(posts.every(c => c.signed));
    assert.ok(posts.every(c => c.idem === `${A.sandboxId}:create`));
    const commerce = posts.filter(c => c.product === 'commerce');
    assert.equal(commerce.length, 3);
    const body = commerce.at(-1).body;
    assert.deepEqual(Object.keys(body.tenants).sort(), bySlug.commerce.demo_orgs.map(o => o.key).sort());
    assert.deepEqual(Object.keys(body.personas).sort(), personasDoc.products.commerce.personas.map(p => p.key).sort());
    assert.equal(body.owner.sub, A.ownerId);
    for (const tenant of Object.values(body.tenants)) {
      const org = (await svc.pool.query('SELECT o.* FROM platform.tenants t JOIN platform.organizations o ON o.id=t.organization_id WHERE t.id=$1', [tenant])).rows[0];
      assert.equal(org.demo_sandbox_id, A.sandboxId);
      assert.equal(org.is_demo, true);
    }
    for (const sub of Object.values(body.personas)) {
      const u = (await svc.pool.query('SELECT is_demo, demo_sandbox_id, password_hash IS NOT NULL AS has_pw FROM platform.users WHERE id=$1', [sub])).rows[0];
      assert.deepEqual([u.is_demo, u.demo_sandbox_id], [true, A.sandboxId]);
    }
    const memberships = (await svc.pool.query('SELECT count(*)::int AS n, count(*) FILTER (WHERE m.demo_sandbox_id=$1)::int AS tagged FROM platform.memberships m JOIN platform.users u ON u.id=m.user_id WHERE u.demo_sandbox_id=$1', [A.sandboxId])).rows[0];
    assert.ok(memberships.n > 0);
    assert.equal(memberships.tagged, memberships.n, 'every membership of the sandbox is tagged');
    // A product that answered 404 was asked once; a 400 is not retried.
    assert.equal(posts.filter(c => c.product === 'education').length, 1);
    assert.equal(posts.filter(c => c.product === 'tontine').length, 1);
  });

  it('phone sign-up: the code goes by SMS (kit mocks) and, in test mode, is shown on the code page', async () => {
    const b = browser(svc.base);
    const phone = `+2376${crypto.randomInt(10_000_000, 99_999_999)}`;
    const res = await signUp(svc, b, phone.replace('+237', '').replace(/^/, ''), {
      codeOf: html => {
        const shown = html.match(/id="test-code">(\d{6})</)[1];
        const sent = smsBox.filter(m => m.to === phone).at(-1);
        assert.match(sent.text, new RegExp(`\\b${shown}\\b`));
        assert.match(sent.text, /Votre code de démo ADS/);
        return shown;
      },
    });
    assert.equal(res.status, 302);
    const sb = await sbOf(phone);
    assert.equal(sb.contact_kind, 'phone');
    await svc.app.sandboxes.idle();
    B = { b, sandboxId: sb.id, ownerId: sb.owner_user_id, phone };
  });

  it('the same email signs in to the same sandbox again (no second sandbox)', async () => {
    const b = browser(svc.base);
    const res = await signUp(svc, b, A.email, { codeOf: () => emailCode(A.email) });
    assert.equal(res.status, 302);
    assert.equal((await svc.pool.query('SELECT count(*)::int AS n FROM platform.demo_sandboxes WHERE contact=$1', [A.email])).rows[0].n, 1);
    const status = JSON.parse((await b.get('/demo/v1/sandbox/status', { accept: 'application/json' })).text);
    assert.equal(status.sandbox_id, A.sandboxId);
  });

  it('daily limit per email or phone for codes; a burnt code stays burnt', async () => {
    const b = browser(svc.base);
    const email = `limit-${crypto.randomBytes(3).toString('hex')}@example.test`;
    const page = await b.get('/demo/signup');
    let last;
    for (let i = 0; i < 4; i += 1) last = await b.post('/demo/signup', { csrf: csrfFrom(page.text), contact: email, consent: 'yes' });
    assert.equal(last.status, 200);
    const over = await b.post('/demo/signup', { csrf: csrfFrom(page.text), contact: email.toUpperCase(), consent: 'yes' });
    assert.equal(over.status, 429);
    assert.match(over.text, /Too many demo sign-ups today/);
    // Five wrong tries burn the code: the right one no longer works.
    const code = await emailCode(email);
    for (let i = 0; i < 5; i += 1) await b.post('/demo/verify', { csrf: csrfFrom(page.text), code: String((Number(code) + 1 + i) % 1_000_000).padStart(6, '0') });
    const late = await b.post('/demo/verify', { csrf: csrfFrom(page.text), code });
    assert.equal(late.status, 400);
    assert.match(late.text, /expired or was used too many times/);
    assert.equal((await svc.pool.query('SELECT count(*)::int AS n FROM platform.demo_sandboxes WHERE contact=$1', [email])).rows[0].n, 0);
  });

  it('isolation: the database refuses memberships across sandboxes and from outside', async () => {
    const tenantOf = async (sb, key) => (await svc.pool.query("SELECT t.id FROM platform.tenants t JOIN platform.organizations o ON o.id=t.organization_id WHERE o.demo_key=$1", [`${sb}/commerce:${key}`])).rows[0].id;
    const aMain = await tenantOf(A.sandboxId, 'main');
    const bMain = await tenantOf(B.sandboxId, 'main');
    const aCashier = (await svc.pool.query("SELECT user_id FROM platform.demo_personas WHERE demo_set=$1 AND client_id='commerce-web' AND persona_key='cashier'", [A.sandboxId])).rows[0].user_id;
    await assert.rejects(svc.pool.query("INSERT INTO platform.memberships(user_id,tenant_id,role) VALUES ($1,$2,'member')", [aCashier, bMain]), /DEMO_SANDBOX_ISOLATION/);
    await assert.rejects(svc.pool.query("UPDATE platform.memberships SET tenant_id=$2 WHERE user_id=$1", [aCashier, bMain]), /DEMO_SANDBOX_ISOLATION/);
    const outsider = crypto.randomUUID();
    await svc.pool.query("INSERT INTO platform.users(id,email,password_hash,status) VALUES ($1,$2,'x','active')", [outsider, `out-${outsider}@example.test`]);
    await assert.rejects(svc.pool.query("INSERT INTO platform.memberships(user_id,tenant_id,role) VALUES ($1,$2,'member')", [outsider, aMain]), /DEMO_SANDBOX_ISOLATION/);
    // A non-demo connection cannot create sandboxes or tag rows.
    await assert.rejects(svc.pool.query("INSERT INTO platform.demo_sandboxes(id,expires_at) VALUES ('sb-zzzzzzzzzz', now())"), /DEMO_SANDBOXES_DEMO_ONLY/);
    await assert.rejects(svc.pool.query("UPDATE platform.users SET demo_sandbox_id=$2 WHERE id=$1", [outsider, A.sandboxId]), /DEMO_SANDBOXES_DEMO_ONLY|DEMO_SANDBOX_ROWS_MUST_BE_DEMO/);
    // A sandbox account's tag follows its demo_key and cannot be moved to another sandbox.
    await demoPool.query("UPDATE platform.users SET demo_sandbox_id=$2 WHERE id=$1", [aCashier, B.sandboxId]);
    assert.equal((await svc.pool.query('SELECT demo_sandbox_id FROM platform.users WHERE id=$1', [aCashier])).rows[0].demo_sandbox_id, A.sandboxId);
    await assert.rejects(demoPool.query("UPDATE platform.organizations SET demo_sandbox_id=NULL, demo_key=NULL WHERE demo_sandbox_id=$1", [A.sandboxId]), /DEMO_SANDBOX_TAG_IS_PERMANENT/);
  });

  // Signs the tester (already signed in to ADS in browser b) in to a product through /authorize.
  async function productTokens(b, slug, extra = {}) {
    const p = bySlug[slug];
    const { verifier, challenge } = pkce();
    const q = new URLSearchParams({ response_type: 'code', client_id: p.client_id, redirect_uri: p.redirect_uris[0], state: 'st', code_challenge: challenge, code_challenge_method: 'S256', ...extra });
    const res = await b.get(`/authorize?${q}`);
    assert.ok(res.location?.startsWith(p.redirect_uris[0]), `not back in ${slug}: ${res.status} ${res.location} ${res.text?.slice(0, 200)}`);
    const tok = await fetch(`${svc.base}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form({ grant_type: 'authorization_code', code: new URL(res.location).searchParams.get('code'), code_verifier: verifier, client_id: p.client_id, redirect_uri: p.redirect_uris[0] }) });
    assert.equal(tok.status, 200);
    return tok.json();
  }

  it('from a product: sign-up returns the tester to it, as the owner (or the first persona where the owner holds no role)', async () => {
    // Commerce: the owner holds merchant_owner in the sandbox's main organisation.
    const b = browser(svc.base);
    const p = bySlug.commerce;
    const { challenge } = pkce();
    const q = new URLSearchParams({ response_type: 'code', client_id: p.client_id, redirect_uri: p.redirect_uris[0], state: 'st', code_challenge: challenge, code_challenge_method: 'S256', ui_locales: 'fr' });
    const auth = await b.get(`/authorize?${q}`);
    const req = reqFrom(auth.location);
    const login = await b.get(auth.location);
    assert.match(login.text, /Essayez ADS gratuitement pendant 30 jours/);
    const email = `tester-c-${crypto.randomBytes(3).toString('hex')}@example.test`;
    const verified = await signUp(svc, b, email, { req, codeOf: () => emailCode(email) });
    assert.equal(verified.status, 302);
    assert.equal(verified.location, `/demo/preparing?req=${req}`);
    await svc.app.sandboxes.idle();
    const cont = await b.get(`/demo/continue?req=${req}`);
    assert.equal(cont.status, 302);
    assert.ok(cont.location.startsWith(p.redirect_uris[0]), cont.location);
    // Software Factory: no admin role for the owner -> its first persona.
    const sf = await productTokens(b, 'software-factory');
    const sfClaims = decode(sf.access_token);
    const sb = await sbOf(email);
    const first = personasDoc.products['software-factory'].personas[0];
    const persona = (await svc.pool.query("SELECT user_id FROM platform.demo_personas WHERE demo_set=$1 AND client_id=$2 AND persona_key=$3", [sb.id, bySlug['software-factory'].client_id, first.key])).rows[0];
    assert.equal(sfClaims.sub, persona.user_id);
    assert.equal(sfClaims.demo_sandbox, sb.id);
  });

  it('Switch role: owner -> persona -> owner inside one sandbox, audited; refresh works; never across sandboxes', async () => {
    const owner = await productTokens(A.b, 'commerce');
    const oc = decode(owner.access_token);
    assert.equal(oc.sub, A.ownerId);
    assert.equal(oc.demo_sandbox, A.sandboxId);
    assert.equal(oc.demo_sandbox_owner, true);
    assert.ok(oc.roles.includes('merchant_owner'));
    const list = await fetch(`${svc.base}/demo/v1/personas?client_id=commerce-web`, { headers: { authorization: `Bearer ${owner.access_token}` } });
    assert.equal(list.status, 200);
    const personas = await list.json();
    assert.equal(personas.current, 'owner');
    assert.deepEqual(personas.personas.map(p => p.key), personasDoc.products.commerce.personas.map(p => p.key));
    const swap = async (token, persona, clientId = 'commerce-web') => fetch(`${svc.base}/demo/v1/switch`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form({ grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange', subject_token_type: 'urn:ietf:params:oauth:token-type:access_token', subject_token: token, client_id: clientId, persona }) });
    const cashierRes = await swap(owner.access_token, 'cashier');
    assert.equal(cashierRes.status, 200);
    const cashier = await cashierRes.json();
    const cc = decode(cashier.access_token);
    const cashierUser = (await svc.pool.query("SELECT user_id, tenant_id FROM platform.demo_personas WHERE demo_set=$1 AND client_id='commerce-web' AND persona_key='cashier'", [A.sandboxId])).rows[0];
    assert.equal(cc.sub, cashierUser.user_id);
    assert.equal(cc.tenant_id, cashierUser.tenant_id);
    assert.deepEqual(cc.roles, ['commerce_cashier']);
    assert.equal(cc.demo_sandbox, A.sandboxId);
    assert.equal(cc.sid, oc.sid, 'same ADS sign-in');
    // Maker-checker in one click: the bank officer, then back to the owner.
    const officer = await (await swap(cashier.access_token, 'bank-officer')).json();
    assert.deepEqual(decode(officer.access_token).roles, ['bank_officer']);
    const back = await (await swap(officer.access_token, 'owner')).json();
    assert.equal(decode(back.access_token).sub, A.ownerId);
    // The persona's refresh token works like any other.
    const refreshed = await fetch(`${svc.base}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ grant_type: 'refresh_token', refresh_token: cashier.refresh_token, client_id: 'commerce-web' }) });
    assert.equal(refreshed.status, 200);
    // Unknown persona, a persona of another product, and a token for another product: refused.
    assert.equal((await swap(owner.access_token, 'nobody')).status, 403);
    assert.equal((await swap(owner.access_token, 'driver')).status, 403);
    assert.equal((await swap(owner.access_token, 'cashier', 'fleet-guard-web')).status, 401);
    // Never across sandboxes, even if the persona table were wrong: point A's "reviewer" at B's account.
    const bReviewer = (await svc.pool.query("SELECT user_id FROM platform.demo_personas WHERE demo_set=$1 AND client_id='commerce-web' AND persona_key='reviewer'", [B.sandboxId])).rows[0].user_id;
    const aReviewer = (await svc.pool.query("SELECT user_id FROM platform.demo_personas WHERE demo_set=$1 AND client_id='commerce-web' AND persona_key='reviewer'", [A.sandboxId])).rows[0].user_id;
    await svc.pool.query('DELETE FROM platform.demo_personas WHERE user_id=$1', [aReviewer]);
    const bRow = (await svc.pool.query('SELECT * FROM platform.demo_personas WHERE user_id=$1', [bReviewer])).rows[0];
    await svc.pool.query('UPDATE platform.demo_personas SET demo_set=$2 WHERE user_id=$1', [bReviewer, A.sandboxId]);
    const cross = await swap(owner.access_token, 'reviewer');
    assert.equal(cross.status, 403);
    assert.equal((await cross.json()).error, 'PERSONA_UNKNOWN');
    await svc.pool.query('UPDATE platform.demo_personas SET demo_set=$2 WHERE user_id=$1', [bReviewer, bRow.demo_set]);
    // B's own token cannot reach A's personas: it only ever sees B.
    const bOwner = await productTokens(B.b, 'commerce');
    const bList = await (await fetch(`${svc.base}/demo/v1/personas?client_id=commerce-web`, { headers: { authorization: `Bearer ${bOwner.access_token}` } })).json();
    assert.equal(bList.sandbox_id, B.sandboxId);
    const bCashier = decode((await (await swap(bOwner.access_token, 'cashier')).json()).access_token);
    assert.equal(bCashier.demo_sandbox, B.sandboxId);
    assert.notEqual(bCashier.sub, cc.sub);
    const audits = (await svc.pool.query("SELECT outcome, reason, metadata FROM platform.identity_audit WHERE event_type='demo_role_switch' AND user_id=$1 ORDER BY id", [A.ownerId])).rows;
    assert.ok(audits.some(a => a.outcome === 'allowed' && a.metadata.to === 'cashier' && a.metadata.sandbox === A.sandboxId));
    assert.ok(audits.some(a => a.outcome === 'denied'));
    // Signing out of ADS ends the persona sessions of that sign-in too.
    const csrfPage = await A.b.get('/logout');
    await A.b.post('/logout', { csrf: csrfFrom(csrfPage.text) });
    const afterLogout = await fetch(`${svc.base}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ grant_type: 'refresh_token', refresh_token: officer.refresh_token, client_id: 'commerce-web' }) });
    assert.equal(afterLogout.status, 400);
    // Shared demo / normal accounts are not sandbox accounts.
    assert.equal((await swap('not-a-token', 'cashier')).status, 401);
  });

  it('expiry: warning at T-7 and T-1 once each, then products DELETE (retried), then everything is deleted; extend', async () => {
    const setExpiry = (id, sql) => demoPool.query(`UPDATE platform.demo_sandboxes SET expires_at=${sql} WHERE id=$1`, [id]);
    const warnings = () => svc.mailer.outbox.filter(m => m.to === A.email && /ends soon/.test(m.subject));
    await setExpiry(A.sandboxId, "now() + interval '6 days'");
    let r = await svc.app.sandboxes.expire();
    assert.equal(r.warned7, 1);
    assert.equal(warnings().length, 1);
    assert.match(warnings()[0].text, /deleted in 7 days/);
    assert.match(warnings()[0].text, /supprimé dans 7 jours/);
    r = await svc.app.sandboxes.expire();
    assert.equal(r.warned7, 0, 'sent once');
    await setExpiry(A.sandboxId, "now() + interval '12 hours'");
    r = await svc.app.sandboxes.expire();
    assert.equal(r.warned1, 1);
    assert.match(warnings().at(-1).text, /deleted in 1 day/);
    // B (phone) gets its warning by SMS.
    await setExpiry(B.sandboxId, "now() + interval '5 days'");
    await svc.app.sandboxes.expire();
    assert.ok(smsBox.some(m => m.to === B.phone && /will be deleted in 7 days/.test(m.text)));

    // ADS staff extend B by 10 days (CLI): later expiry, warnings reset.
    const env = { ADS_ENV: 'demo', DEMO_MODE: '1', DEMO_SANDBOXES: '1', DEMO_PROVISIONING_SECRET: SECRET, DEMO_PRODUCTS_FILE: path.join(dir, 'products.json'), MAIL_TRANSPORT: 'log' };
    const before = (await svc.pool.query('SELECT expires_at FROM platform.demo_sandboxes WHERE id=$1', [B.sandboxId])).rows[0].expires_at;
    const ext = node(['demo-sandboxes', 'extend', B.sandboxId, '10'], env);
    assert.equal(ext.status, 0, ext.stderr);
    const extended = (await svc.pool.query('SELECT expires_at, warned_7_at, extended_days FROM platform.demo_sandboxes WHERE id=$1', [B.sandboxId])).rows[0];
    assert.ok(extended.expires_at - before >= 10 * 86_400_000 - 1000);
    assert.equal(extended.warned_7_at, null);
    assert.equal(extended.extended_days, 10);
    const listed = node(['demo-sandboxes', 'list'], env);
    assert.equal(listed.status, 0, listed.stderr);
    assert.ok(listed.stdout.includes(B.sandboxId));
    assert.ok(!listed.stdout.includes(B.phone) && !listed.stdout.includes(A.email), 'no personal data');
    for (const out of [ext, listed]) assert.ok(!`${out.stdout}${out.stderr}`.includes(SECRET));

    // At T: commerce's DELETE fails once -> the sandbox waits, sign-in already ended, contact erased.
    fake.plan.commerce.delete = [500, 500, 500, 200];
    const users = (await svc.pool.query('SELECT id FROM platform.users WHERE demo_sandbox_id=$1', [A.sandboxId])).rows.map(u => u.id);
    const orgs = (await svc.pool.query('SELECT id FROM platform.organizations WHERE demo_sandbox_id=$1', [A.sandboxId])).rows.map(o => o.id);
    assert.ok(users.length > 50 && orgs.length > 20);
    await setExpiry(A.sandboxId, "now() - interval '1 minute'");
    r = await svc.app.sandboxes.expire();
    assert.equal(r.waiting, 1);
    let sb = (await svc.pool.query('SELECT * FROM platform.demo_sandboxes WHERE id=$1', [A.sandboxId])).rows[0];
    assert.equal(sb.status, 'deleting');
    assert.equal(sb.contact, null);
    assert.equal(sb.contact_hash, null);
    assert.equal((await svc.pool.query("SELECT count(*)::int AS n FROM platform.users WHERE demo_sandbox_id=$1 AND status='active'", [A.sandboxId])).rows[0].n, 0);
    const deletes = fake.calls.filter(c => c.method === 'DELETE' && c.path === `/internal/demo/sandboxes/${A.sandboxId}`);
    assert.ok(deletes.every(c => c.signed && c.idem === `${A.sandboxId}:delete`));
    assert.deepEqual([...new Set(deletes.map(c => c.product))].sort(), ['commerce', 'fleetguard', 'tontine'], 'not_available products are not called');
    // Next run: commerce answers, everything goes.
    r = await svc.app.sandboxes.expire();
    assert.equal(r.deleted, 1);
    sb = (await svc.pool.query('SELECT * FROM platform.demo_sandboxes WHERE id=$1', [A.sandboxId])).rows[0];
    assert.equal(sb.status, 'deleted');
    assert.equal(sb.owner_user_id, null);
    assert.equal((await svc.pool.query('SELECT count(*)::int AS n FROM platform.users WHERE id = ANY($1::uuid[])', [users])).rows[0].n, 0);
    assert.equal((await svc.pool.query('SELECT count(*)::int AS n FROM platform.organizations WHERE id = ANY($1::uuid[])', [orgs])).rows[0].n, 0);
    assert.equal((await svc.pool.query('SELECT count(*)::int AS n FROM platform.memberships WHERE user_id = ANY($1::uuid[]) OR demo_sandbox_id=$2', [users, A.sandboxId])).rows[0].n, 0);
    assert.equal((await svc.pool.query('SELECT count(*)::int AS n FROM platform.demo_personas WHERE demo_set=$1', [A.sandboxId])).rows[0].n, 0);
    const audit = (await svc.pool.query("SELECT metadata FROM platform.identity_audit WHERE event_type='demo_sandbox_deleted' AND metadata->>'sandbox'=$1", [A.sandboxId])).rows[0].metadata;
    assert.equal(audit.accounts, users.length);
    assert.ok(!JSON.stringify(audit).includes('@'));
    // Signing in with the old email now starts a new sandbox.
    const again = await svc.pool.query('SELECT count(*)::int AS n FROM platform.demo_sandboxes WHERE contact=$1', [A.email]);
    assert.equal(again.rows[0].n, 0);
  });
});

describe('personal demo sandboxes: daily limit of new sandboxes per IP address', () => {
  it('a second new sandbox from the same address on the same day is refused', async () => {
    const svc = await startService({ env: { ADS_ENV: 'demo', DEMO_MODE: '1', DEMO_SANDBOXES: '1', DEMO_PROVISIONING_SECRET: SECRET, DEMO_SIGNUP_SANDBOXES_PER_IP_PER_DAY: '1' } });
    try {
      const codeOf = to => async () => svc.mailer.outbox.filter(m => m.to === to).at(-1).text.match(/\b(\d{6})\b/)[1];
      const first = await signUp(svc, browser(svc.base), 'one@example.test', { codeOf: codeOf('one@example.test') });
      assert.equal(first.status, 302);
      const second = await signUp(svc, browser(svc.base), 'two@example.test', { codeOf: codeOf('two@example.test') });
      assert.equal(second.status, 429);
      assert.match(second.text, /Too many demo sign-ups today/);
      assert.equal((await svc.pool.query('SELECT count(*)::int AS n FROM platform.demo_sandboxes')).rows[0].n, 1);
      const counters = (await svc.pool.query("SELECT kind, key_hash FROM platform.demo_signup_counters")).rows;
      assert.ok(counters.every(c => /^[0-9a-f]{64}$/.test(c.key_hash)), 'only keyed hashes are stored');
    } finally {
      await svc.app.close();
      await svc.stop();
    }
  });
});

describe('personal demo sandboxes outside the demo environment', () => {
  it('are refused: no routes, no CLI, no start in production, no DEMO_SANDBOXES without the secret', async () => {
    assert.throws(() => loadConfig({ IDENTITY_PUBLIC_URL: 'https://login.example', DATABASE_URL, IDENTITY_COOKIE_SECRET: 'x'.repeat(40), ADS_ENV: 'production', DEMO_SANDBOXES: '1' }), /DEMO_SANDBOXES_NOT_ALLOWED_IN_PRODUCTION/);
    assert.throws(() => loadConfig({ IDENTITY_PUBLIC_URL: 'http://x', IDENTITY_DEV_MODE: 'true', DATABASE_URL, ADS_ENV: 'demo', DEMO_MODE: '1', DEMO_SANDBOXES: '1' }), /DEMO_PROVISIONING_SECRET_REQUIRED/);
    const svc = await startService({ env: { ADS_ENV: 'staging', DEMO_MODE: '1', DEMO_SANDBOXES: '1', DEMO_PROVISIONING_SECRET: SECRET } });
    try {
      assert.equal(svc.config.sandbox.enabled, false);
      const b = browser(svc.base);
      for (const p of ['/demo/signup', '/demo/preparing', '/demo/v1/sandbox/status', '/sdk/ads-demo-switch.js']) assert.equal((await b.get(p)).status, 404, p);
      assert.equal((await b.post('/demo/signup', { contact: 'a@example.test', consent: 'yes' })).status, 404);
      assert.ok(!(await b.get('/login')).text.includes('/demo/signup'));
      const r = node(['demo-sandboxes', 'expire'], { ADS_ENV: 'staging', DEMO_MODE: '1', DEMO_SANDBOXES: '1', DEMO_PROVISIONING_SECRET: SECRET });
      assert.equal(r.status, 2);
      assert.ok(!`${r.stdout}${r.stderr}`.includes(SECRET));
      // The database itself refuses sandbox rows from a normal connection.
      const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
      try {
        await assert.rejects(pool.query("INSERT INTO platform.demo_sandboxes(id,expires_at) VALUES ('sb-aaaaaaaaaa', now())"), /DEMO_SANDBOXES_DEMO_ONLY/);
        await assert.rejects(pool.query("INSERT INTO platform.users(id,email,status,is_demo,demo_key) VALUES ($1,'o@x.test','active',true,'sandbox-owner:sb-aaaaaaaaaa')", [crypto.randomUUID()]), /DEMO_SANDBOXES_DEMO_ONLY|foreign key/);
      } finally {
        await pool.end();
      }
    } finally {
      await svc.app.close();
      await svc.stop();
    }
  });
});

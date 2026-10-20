import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { JSDOM } from 'jsdom';
import { bootstrapDemoAccounts } from '../src/demo.mjs';
import { browser, csrfFrom, registerClient, startService } from './helpers.mjs';

// DE-03: demo credentials on the hosted sign-in page, with a "Use demo account" button.
const PW = { user: `Demo-User-${crypto.randomBytes(6).toString('hex')}`, user2: `Demo-Two-${crypto.randomBytes(6).toString('hex')}`, admin: `Demo-Admin-${crypto.randomBytes(6).toString('hex')}` };
const SHOW = { ADS_ENV: 'demo', DEMO_MODE: '1', DEMO_SHOW_CREDENTIALS: '1', DEMO_USER_PASSWORD: PW.user };

describe('demo sign-in panel', () => {
  let svc;
  before(async () => {
    svc = await startService({ env: SHOW });
    await bootstrapDemoAccounts(svc.pool, svc.config.demo, PW);
  });
  after(async () => { await svc.stop(); });

  it('shows the demo user (never the demo admin) and fills the form with the button, in English', async () => {
    const { res, text } = await browser(svc.base).get('/login?lang=en');
    assert.equal(res.status, 200);
    assert.match(text, /Try the ADS demo/);
    assert.match(text, /Use demo account/);
    assert.ok(text.includes(svc.config.demo.accounts.user.email));
    assert.ok(text.includes(PW.user));
    for (const hidden of [svc.config.demo.accounts.admin.email, PW.admin, svc.config.demo.accounts.user2.email, PW.user2]) assert.ok(!text.includes(hidden), 'only the demo user is shown');
    // Look and accessibility: navy/gold, Fraunces headings, Manrope body, 44 px button, live status.
    assert.match(text, /#0B1F33/);
    assert.match(text, /#C9A227/);
    assert.match(text, /font-family:Fraunces/);
    assert.match(text, /font-family:Manrope/);
    assert.match(text, /\.demo-use\{min-height:44px;min-width:44px/);
    assert.match(text, /role="status" aria-live="polite"/);
    const csp = res.headers.get('content-security-policy');
    const nonce = csp.match(/script-src 'nonce-([^']+)'/)[1];
    assert.ok(text.includes(`<script nonce="${nonce}">`), 'the only script carries the page nonce');
    assert.match(csp, /font-src https:\/\/fonts\.gstatic\.com/);

    const dom = new JSDOM(text, { url: `${svc.base}/login`, runScripts: 'dangerously' });
    const doc = dom.window.document;
    assert.equal(doc.getElementById('email').value, '');
    const button = doc.getElementById('demo-use');
    assert.equal(button.getAttribute('type'), 'button', 'does not submit by itself');
    button.click();
    assert.equal(doc.getElementById('email').value, svc.config.demo.accounts.user.email);
    assert.equal(doc.getElementById('password').value, PW.user);
    assert.match(doc.getElementById('demo-status').textContent, /Demo account filled in/);
    assert.equal(doc.activeElement.id, 'signin-submit');
    dom.window.close();
  });

  it('is translated in French', async () => {
    const { text } = await browser(svc.base).get('/login?lang=fr');
    assert.match(text, /Essayer la démo ADS/);
    assert.match(text, /Utiliser le compte démo/);
    assert.match(text, /Environnement de démonstration/);
    const dom = new JSDOM(text, { url: `${svc.base}/login`, runScripts: 'dangerously' });
    dom.window.document.getElementById('demo-use').click();
    assert.match(dom.window.document.getElementById('demo-status').textContent, /Compte de démonstration saisi/);
    dom.window.close();
  });

  it('signs in with the shown credentials, and shows the panel only on the sign-in page', async () => {
    const b = browser(svc.base);
    const page = await b.get('/login');
    const done = await b.post('/login', { csrf: csrfFrom(page.text), email: svc.config.demo.accounts.user.email, password: PW.user });
    assert.equal(done.status, 200);
    assert.match(done.text, /You are signed in/);
    assert.ok(!done.text.includes(PW.user));
    const register = await browser(svc.base).get('/register');
    assert.ok(!register.text.includes(PW.user));
    assert.doesNotMatch(register.res.headers.get('content-security-policy'), /script-src/);
  });

  it('shows on a product sign-in too', async () => {
    const client = await registerClient(svc.pool, { id: 'tontine-web', redirect: 'https://tontine.example.test/', selfRoles: [], personal: false });
    const b = browser(svc.base);
    const q = new URLSearchParams({ response_type: 'code', client_id: client.id, redirect_uri: client.redirect, state: 's', code_challenge: 'a'.repeat(43), code_challenge_method: 'S256' });
    const login = await b.get((await b.get(`/authorize?${q}`)).location);
    assert.match(login.text, /Use demo account/);
  });
});

describe('no demo panel outside demo mode, or without DEMO_SHOW_CREDENTIALS=1', () => {
  for (const env of [{ ADS_ENV: 'demo', DEMO_MODE: '1', DEMO_USER_PASSWORD: PW.user }, { ADS_ENV: 'staging', DEMO_MODE: '1', DEMO_SHOW_CREDENTIALS: '1', DEMO_USER_PASSWORD: PW.user }]) {
    it(JSON.stringify({ ...env, DEMO_USER_PASSWORD: '***' }), async () => {
      const svc = await startService({ env });
      try {
        const { res, text } = await browser(svc.base).get('/login');
        assert.doesNotMatch(text, /Use demo account|Try the ADS demo/);
        assert.ok(!text.includes(PW.user));
        assert.doesNotMatch(res.headers.get('content-security-policy'), /script-src/);
      } finally {
        await svc.stop();
      }
    });
  }
});

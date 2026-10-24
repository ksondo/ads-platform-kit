// Playwright helpers that sign in through the REAL shared ADS sign-in: the product page calls
// window.adsIdentity.signIn(), the browser goes to the hosted login page, the helper types the
// email and password, and the identity service redirects back with a code that ads-identity.js
// exchanges for tokens. Nothing is stubbed.
//
// These helpers take Playwright's `page` and do not import @playwright/test themselves, so they
// work with whichever Playwright version the product installs.

import { connectIdentity } from './index.mjs';

// Adds an `ads` fixture to the product's own Playwright `test`: a harness connected to the
// environment from `ads-e2e up`. Everything a test creates through it is deleted after the test.
//   import { test as base } from '@playwright/test';
//   export const test = withAds(base);
export function withAds(base, { stateFile } = {}) {
  return base.extend({
    // eslint-disable-next-line no-empty-pattern
    ads: async ({}, use) => {
      const harness = connectIdentity(stateFile ? { stateFile } : {});
      try {
        await use(harness);
      } finally {
        await harness.cleanup();
        await harness.close();
      }
    },
  });
}

export class SignInError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const originOf = u => { try { return new URL(u).origin; } catch { return null; } };

// Waits until adsIdentity.ready has settled. Polls a flag with waitForFunction instead of awaiting the
// promise in one page.evaluate: on the return from the hosted sign-in, `ready` spans the code exchange
// and the address-bar clean-up, and a single evaluate held across that occasionally fails with
// "Execution context was destroyed" (Playwright rewrites any CDP error during awaitPromise to that),
// failing a sign-in that actually succeeded. waitForFunction is re-run by Playwright when a context
// goes away, so the wait is navigation-safe.
async function waitForAdsIdentity(page, timeout) {
  await page.waitForFunction(() => {
    const id = window.adsIdentity;
    if (!id || !id.ready) return false;
    if (window.__adsE2eReady !== id.ready) {
      window.__adsE2eReady = id.ready;
      window.__adsE2eReadySettled = false;
      window.__adsE2eReadyError = null;
      const settle = err => {
        if (window.__adsE2eReady !== id.ready) return;
        window.__adsE2eReadyError = err;
        window.__adsE2eReadySettled = true;
      };
      id.ready.then(() => settle(null), e => settle(String((e && e.message) || e || 'rejected')));
    }
    // A rejected ready (e.g. a failed code exchange) fails the wait with its reason, as before.
    if (window.__adsE2eReadySettled && window.__adsE2eReadyError !== null) {
      throw new Error(`adsIdentity.ready rejected: ${window.__adsE2eReadyError}`);
    }
    return window.__adsE2eReadySettled === true;
  }, null, { timeout, polling: 50 });
}

async function textOf(page, selector) {
  return (await page.locator(selector).first().textContent({ timeout: 1000 }).catch(() => '')).trim();
}

// Signs in on the hosted ADS pages. Options:
//   startUrl  open this product page first (otherwise the current page is used)
//   button    selector or Locator of the product's own sign-in button (default: calls adsIdentity.signIn())
//   tenantId  workspace to pick when the user belongs to several
//   lang      'en' | 'fr': the product asks for this language (ui_locales; only without `button`)
// Returns { accessToken, user }. Throws SignInError (code NO_ACCESS | LOGIN_FAILED | TIMEOUT).
export async function signIn(page, { email, password, startUrl, button, tenantId, lang, timeout = 20_000 } = {}) {
  if (!email || !password) throw new Error('signIn: email and password are required');
  return hostedSignIn(page, {
    startUrl, button, tenantId, lang, timeout, who: email,
    async fill() {
      await page.locator('input[name="email"]').fill(email);
      await page.locator('input[name="password"]').fill(password);
    },
  });
}

// Signs in as a demo persona (config/demo-personas.json) the way a tester does: opens the hosted ADS
// sign-in page from the product, presses "Use this account" on the persona, then Continue. Nothing is
// typed and no password is known to the test. Needs the demo sign-in page (ADS_ENV=demo, DEMO_MODE=1,
// DEMO_SHOW_CREDENTIALS=1, DEMO_PERSONA_PASSWORD set) and demo-orgs run with the personas file.
// Without `button`, the sign-in always shows the page (prompt=login), so switching personas in one
// browser works; with the product's own `button`, sign out first.
// Options as signIn (startUrl, button, tenantId, lang, timeout). Returns { accessToken, user }.
// Throws SignInError (code NO_PERSONA | NO_ACCESS | LOGIN_FAILED | TIMEOUT).
export async function signInAsPersona(page, key, { startUrl, button, tenantId, lang, timeout = 20_000 } = {}) {
  if (!key || !/^[a-z][a-z0-9-]{0,39}$/.test(String(key))) throw new Error('signInAsPersona: a persona key such as "cashier" is required');
  return hostedSignIn(page, {
    startUrl, button, tenantId, lang, timeout, who: `persona ${key}`, forceLogin: true,
    async fill() {
      const use = page.locator(`li.persona[data-persona="${key}"] button.persona-use`);
      if (!(await use.count())) {
        const offered = await page.locator('li.persona[data-persona]').evaluateAll(els => els.map(e => e.getAttribute('data-persona'))).catch(() => []);
        throw new SignInError('NO_PERSONA', `signInAsPersona: persona ${key} is not offered on the sign-in page (offered: ${offered.join(', ') || 'none'})`);
      }
      await use.click();
      if (!(await page.locator('input[name="email"]').inputValue())) throw new SignInError('LOGIN_FAILED', `signInAsPersona: "Use this account" did not fill the form for ${key}`);
    },
  });
}

async function hostedSignIn(page, { startUrl, button, tenantId, lang, timeout, who, fill, forceLogin = false }) {
  if (startUrl) await page.goto(startUrl);
  const productOrigin = originOf(page.url());
  await waitForAdsIdentity(page, timeout);
  let navigations = 0;
  const onNavigate = frame => { if (frame === page.mainFrame()) navigations += 1; };
  page.on('framenavigated', onNavigate);
  try {
    if (button) await (typeof button === 'string' ? page.locator(button) : button).click();
    else await page.evaluate(options => { void window.adsIdentity.signIn(options); }, { ...(lang ? { lang } : {}), ...(forceLogin ? { forceLogin: true } : {}) });

    // Either the hosted login page, or (already signed in to ADS: single sign-on) straight back to
    // the product or to an identity page such as "choose a workspace" / "no access".
    const until = Date.now() + timeout;
    for (;;) {
      const at = new URL(page.url());
      if (navigations > 0 && at.origin !== productOrigin && (at.pathname === '/login' || at.pathname === '/register')) {
        if (at.pathname === '/register') await page.goto(page.url().replace('/register', '/login'));
        await page.locator('input[name="email"]').waitFor({ timeout });
        await fill();
        await page.locator('form[action="/login"] button[type="submit"]').click();
        break;
      }
      if (navigations > 0 && (at.origin === productOrigin || await page.locator('form[action="/choose-workspace"], main h1').count().catch(() => 0))) {
        if (forceLogin) throw new SignInError('LOGIN_FAILED', `signIn as ${who}: the sign-in page was skipped (already signed in to ADS); sign out first`);
        break;
      }
      if (Date.now() > until) throw new SignInError('TIMEOUT', `signIn: the hosted sign-in did not open (at ${page.url()})`);
      await sleep(100);
    }
  } finally {
    page.off('framenavigated', onNavigate);
  }

  // After the form post the identity service either redirects back to the product or shows a page.
  const end = Date.now() + timeout;
  let choseWorkspace = false;
  for (;;) {
    if (originOf(page.url()) === productOrigin) break;
    if (!choseWorkspace && await page.locator('form[action="/choose-workspace"]').count()) {
      const radio = tenantId ? page.locator(`input[name="tenant"][value="${tenantId}"]`) : page.locator('input[name="tenant"]').first();
      if (!(await radio.count())) throw new SignInError('NO_ACCESS', `signIn: workspace ${tenantId} is not offered to ${who}`);
      await radio.check();
      await page.locator('form[action="/choose-workspace"] button[type="submit"]').click();
      choseWorkspace = true;
    } else if (await page.locator('form[action="/login"] .error, .card > .error, [role="alert"]').count()) {
      throw new SignInError('LOGIN_FAILED', `signIn failed for ${who}: ${await textOf(page, '[role="alert"]')}`);
    } else if (await page.locator('h1').count() && !(await page.locator('form').count())) {
      // A page with no form and still on the identity origin: "No access yet" and similar.
      throw new SignInError('NO_ACCESS', `signIn: ${await textOf(page, 'h1')} - ${await textOf(page, 'p')}`);
    }
    if (Date.now() > end) throw new SignInError('TIMEOUT', `signIn: did not return to ${productOrigin} (at ${page.url()})`);
    await sleep(100);
  }

  await waitForAdsIdentity(page, timeout);
  const result = await page.evaluate(async () => ({ accessToken: await window.adsIdentity.getAccessToken(), user: window.adsIdentity.getUser() }));
  if (!result.accessToken) throw new SignInError('LOGIN_FAILED', 'signIn: returned to the product but adsIdentity has no token');
  return result;
}

// Accepts an organisation invitation on the hosted ADS pages (PLAT-ROLE-001), the way the invitee does:
// opens the emailed link, then either signs in with the existing account, or (newAccount: true)
// creates the account, opens the activation email and types the password, and finally clicks Accept.
// `ads` (the harness) is needed for newAccount, to read the activation email.
// Returns { organization } from the welcome page. Throws SignInError (INVITATION_INVALID | LOGIN_FAILED | WRONG_ACCOUNT | TIMEOUT).
export async function acceptInvitation(page, { link, email, password, newAccount = false, name, ads, timeout = 20_000 } = {}) {
  if (!link || !email || !password) throw new Error('acceptInvitation: link, email and password are required');
  if (newAccount && !ads) throw new Error('acceptInvitation: pass { ads } to read the activation email');
  await page.goto(link);
  const accept = page.locator('form[action="/invite/accept"] button[type="submit"]');
  if (await page.locator('a[href^="/login?next="]').count()) {
    if (newAccount) {
      ads.trackEmail?.(email);
      await page.locator('a[href^="/register?next="]').click();
      await page.waitForURL(u => u.pathname === '/register', { timeout });
      if (name) await page.locator('input[name="name"]').fill(name);
      await page.locator('input[name="email"]').fill(email);
      await page.locator('input[name="password"]').fill(password);
      await page.locator('input[name="confirm"]').fill(password);
      await page.locator('form[action="/register"] button[type="submit"]').click();
      if (await page.locator('[role="alert"]').count()) throw new SignInError('LOGIN_FAILED', `acceptInvitation: registration refused: ${await textOf(page, '[role="alert"]')}`);
      const mail = await ads.waitForEmail({ to: String(email).toLowerCase(), subject: 'Activate', timeoutMs: timeout });
      const activation = String(mail.text).match(/https?:\/\/\S+\/verify-email\?\S+/)?.[0];
      if (!activation) throw new SignInError('LOGIN_FAILED', 'acceptInvitation: no activation link');
      await page.goto(activation);
      await page.locator('input[name="password"]').fill(password);
      await page.locator('form[action="/verify-email"] button[type="submit"]').click();
    } else {
      await page.locator('a[href^="/login?next="]').click();
      await page.waitForURL(u => u.pathname === '/login', { timeout });
      await page.locator('input[name="email"]').fill(email);
      await page.locator('input[name="password"]').fill(password);
      await page.locator('form[action="/login"] button[type="submit"]').click();
    }
    await page.waitForURL(u => u.pathname === '/invite' || u.pathname === '/login' || u.pathname === '/verify-email', { timeout });
    if (new URL(page.url()).pathname !== '/invite') throw new SignInError('LOGIN_FAILED', `acceptInvitation: ${await textOf(page, '[role="alert"]')}`);
  } else if (!(await accept.count())) {
    if (await page.locator('form[action="/logout"]').count()) throw new SignInError('WRONG_ACCOUNT', `acceptInvitation: ${await textOf(page, '[role="alert"]')}`);
    throw new SignInError('INVITATION_INVALID', `acceptInvitation: ${await textOf(page, 'h1')}`);
  }
  if (!(await accept.count())) throw new SignInError('WRONG_ACCOUNT', `acceptInvitation: ${await textOf(page, '[role="alert"]')}`);
  await accept.click();
  await page.waitForLoadState('load');
  if (await page.locator('[role="alert"]').count()) throw new SignInError('WRONG_ACCOUNT', `acceptInvitation: ${await textOf(page, '[role="alert"]')}`);
  return { organization: await textOf(page, 'h1') };
}

// Asserts the page holds a valid ADS session; optionally checks email, tenant and roles.
export async function expectSignedIn(page, { email, tenantId, roles, timeout = 10_000 } = {}) {
  await waitForAdsIdentity(page, timeout);
  const { accessToken, user } = await page.evaluate(async () => ({ accessToken: await window.adsIdentity.getAccessToken(), user: window.adsIdentity.getUser() }));
  if (!accessToken || !user) throw new Error('expectSignedIn: page is not signed in');
  if (email && user.email !== String(email).toLowerCase()) throw new Error(`expectSignedIn: signed in as ${user.email}, expected ${email}`);
  if (tenantId && user.tenantId !== tenantId) throw new Error(`expectSignedIn: tenant ${user.tenantId}, expected ${tenantId}`);
  for (const r of roles ?? []) if (!user.roles.includes(r)) throw new Error(`expectSignedIn: missing role ${r} (has ${user.roles.join(', ')})`);
  return { accessToken, user };
}

export async function expectSignedOut(page, { timeout = 10_000 } = {}) {
  await waitForAdsIdentity(page, timeout);
  const token = await page.evaluate(() => window.adsIdentity.getAccessToken());
  if (token) throw new Error('expectSignedOut: page still has a token');
}

// Signs out through adsIdentity.signOut() (revokes the refresh token and ends the ADS session).
export async function signOut(page, { timeout = 20_000 } = {}) {
  const productOrigin = originOf(page.url());
  await waitForAdsIdentity(page, timeout);
  // signOut() revokes, then navigates to the identity /logout, which redirects back here.
  const navigated = page.waitForEvent('framenavigated', { predicate: f => f === page.mainFrame(), timeout });
  await page.evaluate(() => { void window.adsIdentity.signOut(); });
  await navigated;
  await page.waitForLoadState('load');
  const end = Date.now() + timeout;
  for (;;) {
    const here = originOf(page.url());
    if (here === productOrigin && !(await page.evaluate(() => Boolean(window.adsIdentity) && window.adsIdentity.isSignedIn()).catch(() => true))) break;
    // Identity asks for confirmation when the return address is not registered.
    if (here !== productOrigin && await page.locator('form[action="/logout"] button[type="submit"]').count()) {
      await page.locator('form[action="/logout"] button[type="submit"]').click();
      break;
    }
    if (Date.now() > end) throw new Error(`signOut: did not finish (at ${page.url()})`);
    await sleep(100);
  }
}

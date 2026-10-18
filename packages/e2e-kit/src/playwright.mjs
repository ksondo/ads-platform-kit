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

async function waitForAdsIdentity(page, timeout) {
  await page.waitForFunction(() => Boolean(window.adsIdentity && window.adsIdentity.ready), null, { timeout });
  await page.evaluate(() => window.adsIdentity.ready);
}

async function textOf(page, selector) {
  return (await page.locator(selector).first().textContent({ timeout: 1000 }).catch(() => '')).trim();
}

// Signs in on the hosted ADS pages. Options:
//   startUrl  open this product page first (otherwise the current page is used)
//   button    selector or Locator of the product's own sign-in button (default: calls adsIdentity.signIn())
//   tenantId  workspace to pick when the user belongs to several
// Returns { accessToken, user }. Throws SignInError (code NO_ACCESS | LOGIN_FAILED | TIMEOUT).
export async function signIn(page, { email, password, startUrl, button, tenantId, timeout = 20_000 } = {}) {
  if (!email || !password) throw new Error('signIn: email and password are required');
  if (startUrl) await page.goto(startUrl);
  const productOrigin = originOf(page.url());
  await waitForAdsIdentity(page, timeout);
  if (button) await (typeof button === 'string' ? page.locator(button) : button).click();
  else await page.evaluate(() => { void window.adsIdentity.signIn(); });

  await page.waitForURL(u => u.origin !== productOrigin && (u.pathname === '/login' || u.pathname === '/register'), { timeout });
  if (new URL(page.url()).pathname === '/register') await page.goto(page.url().replace('/register', '/login'));
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('form[action="/login"] button[type="submit"]').click();

  // After the form post the identity service either redirects back to the product or shows a page.
  const end = Date.now() + timeout;
  let choseWorkspace = false;
  for (;;) {
    if (originOf(page.url()) === productOrigin) break;
    if (!choseWorkspace && await page.locator('form[action="/choose-workspace"]').count()) {
      const radio = tenantId ? page.locator(`input[name="tenant"][value="${tenantId}"]`) : page.locator('input[name="tenant"]').first();
      if (!(await radio.count())) throw new SignInError('NO_ACCESS', `signIn: workspace ${tenantId} is not offered to ${email}`);
      await radio.check();
      await page.locator('form[action="/choose-workspace"] button[type="submit"]').click();
      choseWorkspace = true;
    } else if (await page.locator('form[action="/login"] .error, .card > .error, [role="alert"]').count()) {
      throw new SignInError('LOGIN_FAILED', `signIn failed for ${email}: ${await textOf(page, '[role="alert"]')}`);
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

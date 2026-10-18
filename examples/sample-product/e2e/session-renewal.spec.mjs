import { expectSignedIn, expectSignedOut, signIn } from '@ads/e2e-kit/playwright';
import { CLIENT_ID, expect, test } from './fixtures.mjs';

// Regression (found by Fleet Guard's E2E): reloading a product page twice quickly while
// ads-identity.js renews its tokens made the identity service see "refresh token reuse" and sign the
// user out. These tests use the real identity service and the real product; nothing is faked.
// page.route is used ONLY to control timing (hold the identity's real answer until the page has
// been reloaded), so the "answer lost because of a reload" case happens every run, not by luck.

const KEY = `ads-identity:${CLIENT_ID}:refresh`;
const refreshOf = page => page.evaluate(k => sessionStorage.getItem(k), KEY);
const reuseAudits = async (ads, userId) => (await ads.pool.query(
  "SELECT count(*)::int AS n FROM platform.identity_audit WHERE user_id=$1 AND reason='refresh_reuse_detected'", [userId])).rows[0].n;
const isRefreshRequest = request => request.method() === 'POST' && /grant_type=refresh_token/.test(request.postData() ?? '');

test('reloading twice while the token renewal is in flight keeps the user signed in', async ({ page, ads }) => {
  const a = await ads.seedTenant({ product: CLIENT_ID, roles: ['notes_writer'] });
  await page.goto('/');
  await signIn(page, { email: a.email, password: a.password });
  const before = await refreshOf(page);

  // Reload 1 starts a renewal. The identity service really receives and rotates it, but the page is
  // reloaded again before the answer arrives, so the tab still holds the old refresh token.
  let release;
  const rotatedOnServer = new Promise(r => { release = r; });
  let held = 0;
  await page.route(`${ads.url}/token`, async route => {
    if (held === 0 && isRefreshRequest(route.request())) {
      held += 1;
      const answer = await route.fetch();          // reaches the real identity service: rotation done
      release();
      await new Promise(r => setTimeout(r, 1500)); // the page has been reloaded by now
      await route.fulfill({ response: answer }).catch(() => {});
      return;
    }
    await route.continue();
  });
  await page.reload();
  await rotatedOnServer;
  await page.reload();                            // reload 2: renews with the same (old) token

  await expectSignedIn(page, { email: a.email, tenantId: a.tenantId, roles: ['notes_writer'] });
  await expect(page.getByTestId('notes-empty')).toBeVisible(); // the product API answered with this token
  expect(await refreshOf(page)).not.toBe(before);
  await page.unroute(`${ads.url}/token`);

  // The sign-in is still alive afterwards, and nothing was flagged as theft.
  await page.reload();
  await expectSignedIn(page, { email: a.email });
  expect(await reuseAudits(ads, a.user.id)).toBe(0);
});

test('a burst of quick reloads keeps the user signed in', async ({ page, ads }) => {
  const a = await ads.seedTenant({ product: CLIENT_ID, roles: ['notes_writer'] });
  await page.goto('/');
  await signIn(page, { email: a.email, password: a.password });
  for (let i = 0; i < 4; i += 1) await page.reload({ waitUntil: 'commit' });
  await page.reload();
  await expectSignedIn(page, { email: a.email, tenantId: a.tenantId });
  await expect(page.getByTestId('notes-empty')).toBeVisible(); // the product API answered with this token
  expect(await reuseAudits(ads, a.user.id)).toBe(0);
});

test('a duplicated tab and the original stay in step (one renewal shared across tabs)', async ({ page, ads }) => {
  const a = await ads.seedTenant({ product: CLIENT_ID, roles: ['notes_writer'] });
  await page.goto('/');
  await signIn(page, { email: a.email, password: a.password });

  // window.open copies sessionStorage: the new tab starts with the same refresh token and renews it.
  const [twin] = await Promise.all([page.waitForEvent('popup'), page.evaluate(() => { window.open(location.href); })]);
  await expectSignedIn(twin, { email: a.email });
  // The original tab was handed the successor (BroadcastChannel), so it never presents the old one.
  await expect.poll(async () => (await refreshOf(page)) === (await refreshOf(twin))).toBe(true);

  // Close the server's grace window, so only the client coordination keeps the session alive.
  await ads.pool.query("UPDATE platform.refresh_tokens SET rotated_at=rotated_at-interval '10 minutes' WHERE user_id=$1 AND rotated_at IS NOT NULL", [a.user.id]);
  expect(await page.evaluate(() => window.adsIdentity.getAccessToken({ forceRefresh: true }))).toBeTruthy();
  await expect.poll(async () => (await refreshOf(page)) === (await refreshOf(twin))).toBe(true);
  await ads.pool.query("UPDATE platform.refresh_tokens SET rotated_at=rotated_at-interval '10 minutes' WHERE user_id=$1 AND rotated_at IS NOT NULL", [a.user.id]);
  await twin.reload();
  await expectSignedIn(twin, { email: a.email });
  await page.reload();
  await expectSignedIn(page, { email: a.email });
  expect(await reuseAudits(ads, a.user.id)).toBe(0);
});

test('theft detection still works: a copied refresh token used after the grace window ends the sign-in', async ({ page, ads, request }) => {
  const a = await ads.seedTenant({ product: CLIENT_ID, roles: ['notes_writer'] });
  await page.goto('/');
  await signIn(page, { email: a.email, password: a.password });
  const copied = await refreshOf(page);

  // Someone with a copy of the token renews first; the real tab comes back with it later.
  const stolen = await request.post(`${ads.url}/token`, { form: { grant_type: 'refresh_token', refresh_token: copied, client_id: CLIENT_ID } });
  expect(stolen.status()).toBe(200);
  const thief = await stolen.json();
  await ads.pool.query("UPDATE platform.refresh_tokens SET rotated_at=now()-interval '5 minutes' WHERE user_id=$1 AND rotated_at IS NOT NULL", [a.user.id]);

  await page.reload();
  await expectSignedOut(page);
  const again = await request.post(`${ads.url}/token`, { form: { grant_type: 'refresh_token', refresh_token: thief.refresh_token, client_id: CLIENT_ID } });
  expect(again.status(), 'the thief\'s successor is revoked too').toBe(400);
  expect(await reuseAudits(ads, a.user.id)).toBe(1);
});

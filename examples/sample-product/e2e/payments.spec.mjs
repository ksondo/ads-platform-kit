import crypto from 'node:crypto';
import { signPayload } from '@ads/e2e-kit';
import { signIn } from '@ads/e2e-kit/playwright';
import { CLIENT_ID, expect, test } from './fixtures.mjs';

// Journey: a cashier asks a customer to pay by mobile money. The provider is the shared mock
// (PLAT-EXT-001), so paid, failed, timeout and duplicate-callback cases all run before any partner
// is contracted. Each test uses its own tenant and phone number, so tests never share mock state.

const phone = (suffix = '7777') => `2376${crypto.randomInt(1000, 9999)}${suffix}`; // last 4 digits pick the mock outcome
const cashier = ads => ads.seedTenant({ product: CLIENT_ID, roles: ['cashier'] });
const tokenFor = (ads, t) => ads.mintAccessToken({ sub: t.user.id, tenant_id: t.tenantId, roles: ['cashier'], audience: CLIENT_ID });
const auth = token => ({ authorization: `Bearer ${token}` });

async function payInUi(page, t, msisdn) {
  await page.goto('/');
  await signIn(page, { email: t.email, password: t.password });
  await page.getByTestId('pay-msisdn').fill(msisdn);
  await page.getByTestId('pay-amount').fill('5000');
  await page.getByTestId('pay-submit').click();
}

test('paid: the screen shows Paid, PostgreSQL has PAID, and "Test mode" is on screen', async ({ page, ads, db }, testInfo) => {
  const t = await cashier(ads);
  const msisdn = phone();
  await payInUi(page, t, msisdn);
  await expect(page.getByTestId('test-mode')).toHaveText(testInfo.project.name.endsWith('-fr') ? /MODE TEST/ : /TEST MODE/);
  await expect(page.getByTestId('pay-status')).toHaveAttribute('data-status', 'PAID');

  const row = (await db.query('SELECT status, tenant_id, test_mode, provider_ref FROM sample.payments WHERE msisdn=$1', [msisdn])).rows[0];
  expect(row).toMatchObject({ status: 'PAID', tenant_id: t.tenantId, test_mode: true });
  const hooks = await ads.mocks.webhooks({ operation: row.provider_ref });
  expect(hooks).toHaveLength(1);
  expect(hooks[0].attempts[0].status).toBe(200);
});

test('failed: the payer has no funds and the screen says so', async ({ page, ads, db }) => {
  const t = await cashier(ads);
  const msisdn = phone('0001');
  await payInUi(page, t, msisdn);
  await expect(page.getByTestId('pay-status')).toHaveAttribute('data-status', 'FAILED');
  await expect(page.getByTestId('pay-status')).toContainText('NOT_ENOUGH_FUNDS');
  expect((await db.query('SELECT status, failure_reason FROM sample.payments WHERE msisdn=$1', [msisdn])).rows[0]).toEqual({ status: 'FAILED', failure_reason: 'NOT_ENOUGH_FUNDS' });
});

test('timeout: no callback ever arrives and the product expires the request', async ({ ads, request }) => {
  const t = await cashier(ads);
  const token = await tokenFor(ads, t);
  const created = await (await request.post('/api/payments', { headers: auth(token), data: { msisdn: phone('0002'), amount: 1500 } })).json();
  expect(created.status).toBe('PENDING');
  await new Promise(r => setTimeout(r, 3500)); // PAYMENT_TIMEOUT_SECONDS=3 for the test server
  const later = await (await request.get(`/api/payments/${created.id}`, { headers: auth(token) })).json();
  expect(later).toMatchObject({ status: 'EXPIRED', failureReason: 'TIMEOUT' });
  const [op] = await ads.mocks.operations({ provider: 'momo', reference: created.id });
  expect(op.status).toBe('PENDING');
  expect(await ads.mocks.webhooks({ operation: op.id })).toHaveLength(0);
});

test('duplicate webhook: delivered twice, applied once', async ({ ads, db, request }) => {
  const t = await cashier(ads);
  const token = await tokenFor(ads, t);
  const created = await (await request.post('/api/payments', { headers: auth(token), data: { msisdn: phone('0003'), amount: 2500 } })).json();
  const [op] = await ads.mocks.operations({ provider: 'momo', reference: created.id });
  const hooks = await ads.mocks.waitFor(async () => { const h = await ads.mocks.webhooks({ operation: op.id }); return h.length === 2 && h; });
  expect(hooks[0].event_id).toBe(hooks[1].event_id);
  expect(hooks.map(h => h.attempts[0].status)).toEqual([200, 200]);

  // A later replay of the same event is acknowledged but changes nothing.
  const replay = await ads.mocks.replayWebhook(hooks[0].id);
  expect(replay.attempts.at(-1).status).toBe(200);
  expect((await db.query('SELECT count(*)::int AS n FROM sample.payment_events WHERE payment_id=$1', [created.id])).rows[0].n).toBe(1);
  expect((await (await request.get(`/api/payments/${created.id}`, { headers: auth(token) })).json()).status).toBe('PAID');
});

test('scripted outcomes: a declined payer, then the provider is down', async ({ ads, request }) => {
  const t = await cashier(ads);
  const token = await tokenFor(ads, t);
  const declined = phone();
  await ads.mocks.script({ provider: 'momo', outcome: 'failed', reason: 'PAYER_DECLINED', match: { msisdn: declined } });
  const p1 = await (await request.post('/api/payments', { headers: auth(token), data: { msisdn: declined, amount: 100 } })).json();
  await expect.poll(async () => (await (await request.get(`/api/payments/${p1.id}`, { headers: auth(token) })).json()).failureReason).toBe('PAYER_DECLINED');

  const down = phone();
  await ads.mocks.script({ provider: 'momo', outcome: 'unavailable', match: { msisdn: down } });
  const p2 = await (await request.post('/api/payments', { headers: auth(token), data: { msisdn: down, amount: 100 } })).json();
  expect(p2).toMatchObject({ status: 'FAILED', failureReason: 'PROVIDER_UNAVAILABLE' });
});

test('a forged webhook is rejected and changes nothing', async ({ ads, request }) => {
  const t = await cashier(ads);
  const token = await tokenFor(ads, t);
  const msisdn = phone();
  await ads.mocks.script({ provider: 'momo', outcome: 'paid', settle: 'manual', match: { msisdn } });
  const created = await (await request.post('/api/payments', { headers: auth(token), data: { msisdn, amount: 900 } })).json();
  const body = JSON.stringify({ event_id: 'evt-forged', type: 'payment.successful', data: { reference: created.id, status: 'SUCCESSFUL' } });
  const forged = await request.post('/webhooks/momo', { headers: { 'content-type': 'application/json', 'ads-mock-signature': signPayload(body, 'not-the-secret') }, data: body });
  expect(forged.status()).toBe(401);
  expect((await (await request.get(`/api/payments/${created.id}`, { headers: auth(token) })).json()).status).toBe('PENDING');
  // The genuine provider event (released by the test) still works.
  const [op] = await ads.mocks.operations({ provider: 'momo', reference: created.id });
  await ads.mocks.advance(op.id);
  expect((await (await request.get(`/api/payments/${created.id}`, { headers: auth(token) })).json()).status).toBe('PAID');
});

import { SignInError, expectSignedIn, expectSignedOut, signIn, signOut } from '@ads/e2e-kit/playwright';
import { CLIENT_ID, asTenant, expect, test } from './fixtures.mjs';

// Journey: a staff member signs in with their ADS account, writes a note, and finds it again.
// Screen -> product API -> PostgreSQL (RLS) -> back, with the real shared sign-in.

test('signed-in user creates a note and reads it back from PostgreSQL', async ({ page, ads, db }) => {
  const a = await ads.seedTenant({ product: CLIENT_ID, roles: ['notes_writer'] });

  await page.goto('/');
  await signIn(page, { email: a.email, password: a.password, button: page.getByTestId('sign-in') });
  await expectSignedIn(page, { email: a.email, tenantId: a.tenantId, roles: ['notes_writer'] });
  await expect(page.getByTestId('who')).toContainText(a.email);
  await expect(page.getByTestId('notes-empty')).toBeVisible();

  const text = `Stock check ${Date.now()}`;
  await page.getByTestId('note-text').fill(text);
  await page.getByTestId('note-add').click();
  await expect(page.getByTestId('notes').getByText(text)).toBeVisible();

  // Stored in the product database, under tenant A, by the signed-in user.
  const rows = await db.query('SELECT tenant_id, author_id FROM sample.notes WHERE body=$1', [text]);
  expect(rows.rows).toEqual([{ tenant_id: a.tenantId, author_id: a.user.id }]);

  // A reload reads it back through the API (the page keeps nothing but the tab's refresh token).
  await page.reload();
  await expect(page.getByTestId('notes').getByText(text)).toBeVisible();
});

test('another tenant cannot see or fetch the note', async ({ browser, ads, db, request }) => {
  const a = await ads.seedTenant({ product: CLIENT_ID, roles: ['notes_writer'] });
  const b = await ads.seedTenant({ product: CLIENT_ID, roles: ['notes_writer'] });
  const text = `Tenant A only ${Date.now()}`;

  const pageA = await (await browser.newContext()).newPage();
  await pageA.goto('/');
  await signIn(pageA, { email: a.email, password: a.password });
  await pageA.getByTestId('note-text').fill(text);
  await pageA.getByTestId('note-add').click();
  await expect(pageA.getByTestId('notes').getByText(text)).toBeVisible();
  const noteId = await pageA.getByTestId('notes').getByText(text).getAttribute('data-id');

  // Tenant B, signed in for real in a separate browser, sees an empty list.
  const pageB = await (await browser.newContext()).newPage();
  await pageB.goto('/');
  const { accessToken: tokenB } = await signIn(pageB, { email: b.email, password: b.password });
  await expect(pageB.getByTestId('notes-empty')).toBeVisible();
  await expect(pageB.getByText(text)).toHaveCount(0);

  // Tenant B's real token cannot fetch tenant A's note by id.
  const direct = await request.get(`/api/notes/${noteId}`, { headers: { authorization: `Bearer ${tokenB}` } });
  expect(direct.status()).toBe(404);

  // And the database itself refuses: the runtime role with tenant B's context sees no row.
  expect(await asTenant(db, b.tenantId, 'SELECT id FROM sample.notes WHERE id=$1', [noteId])).toEqual([]);
  expect(await asTenant(db, a.tenantId, 'SELECT id FROM sample.notes WHERE id=$1', [noteId])).toHaveLength(1);
});

test('API checks issuer, audience and roles on every request (minted tokens)', async ({ ads, request }) => {
  const a = await ads.seedTenant({ product: CLIENT_ID, roles: ['notes_writer'] });
  const ok = await ads.mintAccessToken({ sub: a.user.id, tenant_id: a.tenantId, roles: ['notes_writer'], audience: CLIENT_ID });
  const created = await request.post('/api/notes', { headers: { authorization: `Bearer ${ok}` }, data: { body: 'via API' } });
  expect(created.status()).toBe(201);

  const otherProduct = await ads.mintAccessToken({ sub: a.user.id, tenant_id: a.tenantId, roles: ['notes_writer'], audience: 'some-other-product' });
  expect((await request.get('/api/notes', { headers: { authorization: `Bearer ${otherProduct}` } })).status()).toBe(401);
  const readerOnly = await ads.mintAccessToken({ sub: a.user.id, tenant_id: a.tenantId, roles: ['notes_reader'], audience: CLIENT_ID });
  expect((await request.post('/api/notes', { headers: { authorization: `Bearer ${readerOnly}` }, data: { body: 'x' } })).status()).toBe(403);
  expect((await request.get('/api/notes')).status()).toBe(401);
  expect((await request.get('/api/notes', { headers: { authorization: 'Bearer a.b.c' } })).status()).toBe(401);
});

test('a user with no role in the product is told they have no access', async ({ page, ads }) => {
  const u = await ads.createUser();
  await page.goto('/');
  const error = await signIn(page, { email: u.email, password: u.password }).catch(e => e);
  expect(error).toBeInstanceOf(SignInError);
  expect(error.code).toBe('NO_ACCESS');
});

test('wrong password stays on the sign-in page with an error', async ({ page, ads }) => {
  const a = await ads.seedTenant({ product: CLIENT_ID, roles: ['notes_writer'] });
  await page.goto('/');
  const error = await signIn(page, { email: a.email, password: 'Not-The-Password-1' }).catch(e => e);
  expect(error.code).toBe('LOGIN_FAILED');
  await expect(page.getByRole('alert')).toBeVisible();
});

test('sign out ends the session', async ({ page, ads }) => {
  const a = await ads.seedTenant({ product: CLIENT_ID, roles: ['notes_writer'] });
  await page.goto('/');
  await signIn(page, { email: a.email, password: a.password });
  await signOut(page);
  await expectSignedOut(page);
  await page.reload();
  await expectSignedOut(page);
  await expect(page.getByTestId('notes-section')).toBeHidden();
});

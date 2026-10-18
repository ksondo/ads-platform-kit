import { uniquePassword } from '@ads/e2e-kit';
import { acceptInvitation, expectSignedIn, expectSignedOut, signIn } from '@ads/e2e-kit/playwright';
import { ADMIN_SECRET, CLIENT_ID, expect, test } from './fixtures.mjs';

// PLAT-ROLE-001 journeys on the real identity service: an organisation admin invites staff, grants
// and removes roles, and deactivates people; the product only ever sees the result in its tokens.
const adminOf = (ads, owner) => ({ admin: owner.user, org: owner.org, product: CLIENT_ID, clientSecret: ADMIN_SECRET });

test('invited new staff member creates an account, accepts and works in the right organisation', async ({ page, ads, db }, testInfo) => {
  const owner = await ads.seedTenant({ product: CLIENT_ID, roles: ['notes_writer'] });
  const fr = testInfo.project.name.endsWith('-fr');
  const { link, email } = await ads.inviteViaApi({ ...adminOf(ads, owner), role: 'notes_writer', locale: fr ? 'fr' : 'en' });
  const password = uniquePassword();

  await acceptInvitation(page, { link, email, password, newAccount: true, ads });
  await expect(page.locator('h1')).toContainText(fr ? 'Bienvenue' : 'Welcome');

  // Already signed in to ADS: the product signs in without a password and gets the invited role.
  await page.goto('/');
  await signIn(page, { email, password });
  await expectSignedIn(page, { email, tenantId: owner.tenantId, roles: ['notes_writer'] });
  const text = `Invited staff note ${Date.now()}`;
  await page.getByTestId('note-text').fill(text);
  await page.getByTestId('note-add').click();
  await expect(page.getByTestId('notes').getByText(text)).toBeVisible();
  expect((await db.query('SELECT tenant_id FROM sample.notes WHERE body=$1', [text])).rows).toEqual([{ tenant_id: owner.tenantId }]);

  // Single use: the link cannot be used again.
  await page.goto(link);
  await expect(page.locator('h1')).toContainText(fr ? 'invalide' : 'invalid');
});

test('an existing ADS account accepts with its own sign-in; the invitation shows as accepted', async ({ page, ads }) => {
  const owner = await ads.seedTenant({ product: CLIENT_ID, roles: ['notes_writer'] });
  const staff = await ads.createUser();
  const { link } = await ads.inviteViaApi({ ...adminOf(ads, owner), email: staff.email, role: 'notes_reader' });
  await acceptInvitation(page, { link, email: staff.email, password: staff.password });
  const api = await ads.adminApi(adminOf(ads, owner));
  expect((await api.invitations())[0]).toMatchObject({ email: staff.email, status: 'accepted', roles: ['notes_reader'] });
  expect((await api.members()).find(m => m.email === staff.email)).toMatchObject({ status: 'active', roles: ['notes_reader'] });
});

test('a forwarded invitation cannot be used by another account', async ({ page, ads }) => {
  const owner = await ads.seedTenant({ product: CLIENT_ID, roles: ['notes_writer'] });
  const intruder = await ads.seedTenant({ product: CLIENT_ID, roles: ['notes_writer'] });
  const { link } = await ads.inviteViaApi({ ...adminOf(ads, owner), role: 'notes_writer' });
  await page.goto('/');
  await signIn(page, { email: intruder.email, password: intruder.password });   // the intruder's own ADS session
  const error = await acceptInvitation(page, { link, email: intruder.email, password: intruder.password }).catch(e => e);
  expect(error.code).toBe('WRONG_ACCOUNT');
  await expect(page.getByRole('alert')).toBeVisible();
});

test('roles granted and removed through the admin API reach the product; deactivation signs the member out', async ({ browser, ads }) => {
  const owner = await ads.seedTenant({ product: CLIENT_ID, roles: ['notes_writer'] });
  const staff = await ads.createUser();
  await ads.grantRoleViaApi({ ...adminOf(ads, owner), user: staff, role: 'notes_writer' });

  const page = await (await browser.newContext()).newPage();
  await page.goto('/');
  await signIn(page, { email: staff.email, password: staff.password });
  await expectSignedIn(page, { tenantId: owner.tenantId, roles: ['notes_writer'] });

  const api = await ads.adminApi(adminOf(ads, owner));
  await api.grant(staff, ['notes_reader']);
  const fresh = await page.evaluate(async () => { await window.adsIdentity.getAccessToken({ forceRefresh: true }); return window.adsIdentity.getUser().roles; });
  expect(fresh.sort()).toEqual(['notes_reader', 'notes_writer']);

  await api.deactivate(staff);
  await page.reload();
  await expectSignedOut(page);
  const again = await signIn(page, { email: staff.email, password: staff.password }).catch(e => e);
  expect(again.code).toBe('NO_ACCESS');
  await api.reactivate(staff);
});

test('hosted admin page: the org admin grants a role and deactivates a member (EN/FR)', async ({ page, ads }, testInfo) => {
  const fr = testInfo.project.name.endsWith('-fr');
  const owner = await ads.seedTenant({ product: CLIENT_ID, roles: ['notes_writer'], orgName: `Boutique ${Date.now()}` });
  const staff = await ads.createUser();
  await ads.grantRoleViaApi({ ...adminOf(ads, owner), user: staff, role: 'notes_reader' });

  await page.goto(`${ads.url}/admin?tenant=${owner.tenantId}&product=${CLIENT_ID}&lang=${fr ? 'fr' : 'en'}`);
  await page.locator('input[name="email"]').fill(owner.email);
  await page.locator('input[name="password"]').fill(owner.password);
  await page.locator('form[action="/login"] button[type="submit"]').click();
  await expect(page.locator('h1')).toHaveText(fr ? "Administration de l'organisation" : 'Organisation administration');

  const row = page.locator(`tr[data-member="${staff.email}"]`);
  await expect(row).toContainText('notes_reader');
  await row.locator('input[name="roles"][type="text"]').fill('notes_writer');
  await row.getByRole('button', { name: fr ? 'Attribuer' : 'Grant', exact: true }).click();
  await expect(page.getByRole('status').last()).toContainText(fr ? 'Rôles attribués' : 'Roles granted');
  await expect(page.locator(`tr[data-member="${staff.email}"]`)).toContainText('notes_writer');

  await page.locator(`tr[data-member="${staff.email}"]`).getByRole('button', { name: fr ? 'Désactiver' : 'Deactivate' }).click();
  await expect(page.locator(`tr[data-member="${staff.email}"]`)).toContainText(fr ? 'Désactivé' : 'Deactivated');
  const audited = await ads.pool.query("SELECT event_type FROM platform.identity_audit WHERE tenant_id=$1 AND reason='page' ORDER BY id", [owner.tenantId]);
  expect(audited.rows.map(r => r.event_type)).toEqual(['admin_roles_granted', 'admin_member_deactivated']);
});

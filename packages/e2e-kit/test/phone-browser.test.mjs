import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { startIdentity, startMocks } from '../src/index.mjs';

// Exclusive throwaway DB, never the running product or another suite's identity database.
const databaseUrl = process.env.E2E_PHONE_BROWSER_DB_URL;
describe('SH-0 real Chromium phone journeys', { skip: !databaseUrl }, () => {
  let identity, mocks, browser;
  before(async () => {
    mocks = await startMocks();
    identity = await startIdentity({ databaseUrl, resetDatabase: true, mocksUrl: mocks.url, webhookSecret: mocks.webhookSecret });
    browser = await chromium.launch({ headless: true });
  });
  after(async () => {
    await browser?.close();
    await identity?.close();
    await mocks?.stop();
  });
  for (const [lang, width, number] of [['en', 1366, '699200001'], ['fr', 360, '699200002']]) {
    it(`${lang} ${width}px: real hosted phone signup, wrong-code refusal, signout and same-account signin`, async () => {
      const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'en-GB' });
      try {
        const page = await context.newPage();
        await page.goto(`${identity.url}/login?lang=${lang}`);
        await page.getByRole('link', { name: lang === 'fr' ? 'Connexion par téléphone' : 'Sign in by phone' }).click();
        assert.equal(await page.locator('html').getAttribute('lang'), lang, 'page choice survives link even with an English browser');
        await page.getByLabel(lang === 'fr' ? 'Numéro de téléphone au Cameroun' : 'Cameroon phone number').fill(number);
        await page.getByRole('button', { name: lang === 'fr' ? 'Envoyer un code SMS' : 'Send SMS code' }).click();
        await page.getByLabel(lang === 'fr' ? 'Code SMS à 6 chiffres' : '6-digit SMS code').waitFor();
        assert.match(await page.textContent('body'), lang === 'fr' ? /Mode test/ : /Test mode/);
        const message = await identity.mocks.waitForMessage({ channel: 'sms', to: `+237${number}` });
        const code = message.text.match(/\b([0-9]{6})\b/)[1];
        const field = page.getByLabel(lang === 'fr' ? 'Code SMS à 6 chiffres' : '6-digit SMS code');
        await field.fill(code === '000000' ? '111111' : '000000');
        await page.getByRole('button', { name: lang === 'fr' ? 'Continuer' : 'Continue', exact: true }).click();
        await page.getByRole('alert').waitFor();
        assert.match(await page.getByRole('alert').textContent(), lang === 'fr' ? /incorrect ou expiré/ : /Incorrect or expired/);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no horizontal overflow');
        for (const input of await page.locator('input:not([type=hidden])').all()) {
          assert.ok(await input.getAttribute('id'));
          assert.ok((await input.boundingBox()).height >= 44, 'phone/code touch target is at least 44px');
          assert.ok(await page.locator(`label[for="${await input.getAttribute('id')}"]`).count());
        }
        if (process.env.SH0_SCREENSHOT_DIR) {
          await mkdir(process.env.SH0_SCREENSHOT_DIR, { recursive: true });
          await page.screenshot({ path: path.join(process.env.SH0_SCREENSHOT_DIR, `sh0-phone-${lang}-${width}.png`), fullPage: true });
        }
        await field.fill(code);
        await page.getByRole('button', { name: lang === 'fr' ? 'Continuer' : 'Continue', exact: true }).click();
        await page.getByRole('heading', { name: lang === 'fr' ? 'Vous êtes connecté' : 'You are signed in' }).waitFor();
        const row = (await identity.pool.query('SELECT id FROM platform.users WHERE phone_number=$1', [`+237${number}`])).rows[0];
        assert.ok(row?.id);
        await page.goto(`${identity.url}/logout?lang=${lang}`);
        await page.getByRole('button', { name: lang === 'fr' ? 'Se déconnecter' : 'Sign out', exact: true }).click();
        // Advance only test fixture timestamps; production cooldown is separately tested on real PostgreSQL.
        await identity.pool.query("UPDATE platform.phone_challenges SET created_at=now()-interval '2 minutes' WHERE phone_number=$1", [`+237${number}`]);
        await page.goto(`${identity.url}/phone?lang=${lang}`);
        await page.locator('#phone').fill(number);
        await page.getByRole('button', { name: lang === 'fr' ? 'Envoyer un code SMS' : 'Send SMS code' }).click();
        const latest = (await identity.mocks.messages({ channel: 'sms', to: `+237${number}` })).at(-1).text.match(/\b([0-9]{6})\b/)[1];
        await page.locator('#code').fill(latest);
        await page.getByRole('button', { name: lang === 'fr' ? 'Continuer' : 'Continue', exact: true }).click();
        await page.getByRole('heading', { name: lang === 'fr' ? 'Vous êtes connecté' : 'You are signed in' }).waitFor();
        assert.equal((await identity.pool.query('SELECT id FROM platform.users WHERE phone_number=$1', [`+237${number}`])).rows[0].id, row.id);
      } finally { await context.close(); }
    });
  }
});

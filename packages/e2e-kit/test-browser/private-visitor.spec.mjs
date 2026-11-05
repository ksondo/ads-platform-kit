import { test, expect } from '@playwright/test';
import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import pg from 'pg';
import { freePort } from '../src/index.mjs';
import { generateSigningKey, runIdentityInProcess } from '../src/identity-runtime.mjs';
import { hashPassword } from '../../../services/identity/src/security.mjs';

// The configured URL must point to an exclusive disposable Identity browser DB.
// This tests real hosted Identity/OIDC. Commerce UI/data tests belong to Commerce.
let svc, callback, redirect, jwks;
const password = crypto.randomBytes(32).toString('base64url');
const checkSecret = crypto.randomBytes(32).toString('hex');
test.beforeAll(async () => {
  const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.E2E_KIT_TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error('TEST_DATABASE_URL or E2E_KIT_TEST_DATABASE_URL must be an exclusive disposable browser database');
  const admin = new pg.Pool({ connectionString: databaseUrl });
  try { await admin.query('DROP SCHEMA IF EXISTS platform CASCADE; DROP TABLE IF EXISTS public.ads_identity_migrations'); } finally { await admin.end(); }
  svc = await runIdentityInProcess({ databaseUrl, port: await freePort(), signingKeyPem: generateSigningKey(), env: { ADS_ENV: 'demo', DEMO_MODE: '1', DEMO_ACCESS_ENABLED: '0', DEMO_ACCESS_PRIVATE_ENABLED: '1', DEMO_ACCESS_CHECK_SECRET_COMMERCE: checkSecret } });
  callback = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<h1>Commerce persona handoff</h1>'); });
  await new Promise(r => callback.listen(0, '127.0.0.1', r));
  redirect = `http://127.0.0.1:${callback.address().port}/`;
  await svc.pool.query(`INSERT INTO platform.oauth_clients(client_id,display_name,redirect_uris,self_service_roles,allow_personal_workspace,admin_roles,assignable_roles)
    VALUES ('commerce-web','Commerce',$1,'{commerce_buyer}',true,'{merchant_owner}','{merchant_owner,commerce_manager,commerce_cashier,commerce_accountant,bank_officer,bank_agent}')`, [[redirect]]);
  jwks = createRemoteJWKSet(new URL(`${svc.url}/.well-known/jwks.json`));
});
test.afterAll(async () => { if (callback) await new Promise(r => callback.close(r)); await svc?.stop(); });

for (const lang of ['en', 'fr']) for (const width of [360, 768, 1280]) {
  test(`${lang} ${width}px individual login and seven authorized persona workspace handoffs`, async ({ browser }) => {
    const email = `private-${lang}-${width}@example.test`;
    const grant = await svc.app.demoAccess.provisionPrivate({ email, passwordHash: await hashPassword(password), operatorRef: 'browser-test-operator', locale: lang });
    const permitted = await svc.app.demoAccess.checkGrant('commerce', grant.userId);
    expect(permitted.personas).toHaveLength(7);
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: lang === 'fr' ? 'fr-CM' : 'en-GB' });
    const page = await context.newPage();
    try {
      const begin = async tenant => {
        const verifier = crypto.randomBytes(48).toString('base64url');
        const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
        await page.goto(`${svc.url}/authorize?${new URLSearchParams({ response_type: 'code', client_id: 'commerce-web', redirect_uri: redirect, state: 'visitor-state', code_challenge: challenge, code_challenge_method: 'S256', ui_locales: lang, ...(tenant ? { tenant_hint: tenant } : {}) })}`);
        return verifier;
      };
      const exchange = async verifier => {
        await expect(page).toHaveURL(new RegExp('^' + redirect.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        const code = new URL(page.url()).searchParams.get('code');
        const result = await fetch(`${svc.url}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: 'commerce-web', redirect_uri: redirect }) });
        expect(result.status).toBe(200);
        const tokens = await result.json();
        return (await jwtVerify(tokens.access_token, jwks, { issuer: svc.url, audience: 'commerce-web', algorithms: ['RS256'] })).payload;
      };
      const verifier = await begin();
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.locator('a[href^="/register"],a[href^="/forgot-password"]')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (process.env.PRIVATE_VISITOR_SCREENSHOTS) {
        await mkdir(process.env.PRIVATE_VISITOR_SCREENSHOTS, { recursive: true });
        await page.screenshot({ path: path.join(process.env.PRIVATE_VISITOR_SCREENSHOTS, `private-visitor-login-${lang}-${width}.png`), fullPage: true });
      }
      await page.locator('#email').fill(email); await page.locator('#password').fill('incorrect');
      await page.locator('#signin-submit').click(); await expect(page.getByRole('alert')).toBeVisible();
      await page.locator('#password').fill(password); await page.locator('#signin-submit').click();
      const initial = await exchange(verifier);
      expect(initial.sub).toBe(grant.userId); expect(initial.email_verified).toBe(false);
      expect(initial.tenant_id).toBe(permitted.personas.find(p => p.org === 'personal').tenantId);
      for (const persona of permitted.personas) {
        const v = await begin(persona.tenantId);
        const claims = await exchange(v);
        expect(claims.sub).toBe(grant.userId); expect(claims.tenant_id).toBe(persona.tenantId);
        expect(persona.roles.every(role => claims.roles.includes(role))).toBe(true);
        expect(claims.roles).not.toContain('commerce_reviewer'); expect(claims.roles).not.toContain('commerce_support');
      }
      const secretless = await fetch(`${svc.url}/demo-access/v1/grants/check?platform=commerce&sub=${grant.userId}`);
      expect(secretless.status).toBe(401);
      await svc.app.demoAccess.revokePrivate({ grantId: grant.grantId, operatorRef: 'browser-test-operator' });
      const denied = await page.goto(`${svc.url}/authorize?${new URLSearchParams({ response_type: 'code', client_id: 'commerce-web', redirect_uri: redirect, state: 'revoked', code_challenge: 'x'.repeat(43), code_challenge_method: 'S256' })}`);
      expect(denied.status()).toBe(403);
      expect(svc.outbox).toHaveLength(0);
    } finally { await context.close(); }
  });
}

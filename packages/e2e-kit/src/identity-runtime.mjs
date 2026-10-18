import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// Runs the REAL ADS identity service (services/identity) in this Node process: same migrations,
// same hosted pages, same token issuance. Only the edges differ for testing: http on 127.0.0.1
// (dev mode), a throwaway signing key, high rate limits, and email delivered to the mock
// email capture instead of SMTP.
const here = path.dirname(fileURLToPath(import.meta.url));
export const KIT_ROOT = path.resolve(here, '../../..');
const identitySrc = path.join(KIT_ROOT, 'services/identity/src');
const quiet = { info() {}, warn() {}, error: m => console.error(m) };

export function generateSigningKey() {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  return privateKey.export({ type: 'pkcs8', format: 'pem' });
}

export const E2E_LIMITS = {
  IDENTITY_LIMIT_LOGIN_PER_IP: '100000',
  IDENTITY_LIMIT_LOGIN_PER_EMAIL: '1000',
  IDENTITY_LIMIT_REGISTER_PER_IP: '100000',
  IDENTITY_LIMIT_EMAIL_PER_ADDRESS: '100',
  IDENTITY_LIMIT_TOKEN_PER_IP: '100000',
};

export async function runIdentityInProcess({ databaseUrl, host = '127.0.0.1', port, issuer, signingKeyPem, kid = 'ads-e2e', mocksUrl = null, env = {}, log = quiet }) {
  if (!databaseUrl) throw new Error('startIdentity: databaseUrl is required');
  if (!port) throw new Error('runIdentityInProcess: port is required');
  const [{ loadConfig }, { migrate }, { loadSigningKey }, { createApp }] = await Promise.all([
    import(path.join(identitySrc, 'config.mjs')), import(path.join(identitySrc, 'db.mjs')),
    import(path.join(identitySrc, 'keys.mjs')), import(path.join(identitySrc, 'server.mjs')),
  ]);
  const publicUrl = (issuer ?? `http://${host}:${port}`).replace(/\/$/, '');
  const config = loadConfig({
    IDENTITY_PUBLIC_URL: publicUrl, IDENTITY_DEV_MODE: 'true', DATABASE_URL: databaseUrl, MAIL_TRANSPORT: 'memory',
    IDENTITY_SIGNING_KEY_PEM: signingKeyPem, IDENTITY_SIGNING_KEY_ID: kid,
    IDENTITY_COOKIE_SECRET: crypto.randomBytes(32).toString('hex'), IDENTITY_DB_POOL_MAX: '5',
    ...E2E_LIMITS, ...env,
  });
  const pool = new pg.Pool({ connectionString: databaseUrl, max: config.dbPoolMax });
  await migrate(pool, log);
  const keys = await loadSigningKey(config, log);

  // Emails go to the mock email capture (inspectable by tests) and an in-memory outbox.
  const outbox = [];
  const mailer = {
    outbox,
    async send(message) {
      outbox.push({ ...message, at: new Date().toISOString() });
      if (!mocksUrl) return;
      await fetch(`${mocksUrl}/email/v1/messages`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ from: config.mail.from, to: message.to, subject: message.subject, text: message.text, html: message.html }),
      }).catch(error => log.warn?.(`e2e mail capture failed: ${error.message}`));
    },
  };
  const app = createApp({ config, pool, keys, mailer, google: null, log, sdkPath: path.join(KIT_ROOT, 'packages/identity-client/ads-identity.js') });
  await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(port, host, resolve); });
  return {
    url: publicUrl, issuer: config.issuer, outbox, pool, app,
    async stop() {
      await new Promise(r => { app.server.close(() => r()); app.server.closeAllConnections?.(); });
      await pool.end();
    },
  };
}

// BRIEF18 personal demo sandboxes: settings. Sandboxes exist only in the demo environment
// (ADS_ENV=demo AND DEMO_MODE=1) and only when DEMO_SANDBOXES=1. DEMO_SANDBOXES=1 in production stops
// the start. The provisioning secret signs the kit's calls to products; it is read from the
// environment (or a *_FILE secret) and never logged, printed or returned.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSecret } from './config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const KIT_CONFIG_DIR = path.resolve(here, '../../../config');

const int = (env, name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name}_INVALID`);
  return n;
};

// demo: the result of demoSettings(env).
export function sandboxSettings(env = process.env, demo = { enabled: false, adsEnv: 'production' }) {
  const asked = String(env.DEMO_SANDBOXES ?? '').trim() === '1';
  if (asked && demo.adsEnv === 'production') throw new Error('DEMO_SANDBOXES_NOT_ALLOWED_IN_PRODUCTION');
  const enabled = asked && Boolean(demo.enabled);
  const secret = enabled ? readSecret(env, 'DEMO_PROVISIONING_SECRET') : '';
  if (enabled && secret.length < 32) throw new Error('DEMO_PROVISIONING_SECRET_REQUIRED (at least 32 characters, from the server secrets)');
  const file = (name, fallback) => String(env[name] ?? '').trim() || path.join(KIT_CONFIG_DIR, fallback);
  const out = {
    enabled,
    days: int(env, 'DEMO_SANDBOX_DAYS', 30, { min: 1, max: 365 }),
    maxActive: int(env, 'DEMO_SANDBOX_MAX_ACTIVE', 500, { min: 1 }),
    files: {
      clients: file('DEMO_CLIENTS_FILE', 'clients.demo.json'),
      personas: file('DEMO_PERSONAS_FILE', 'demo-personas.json'),
      products: file('DEMO_PRODUCTS_FILE', 'demo-products.json'),
    },
    otp: {
      ttlSeconds: int(env, 'DEMO_OTP_TTL_SECONDS', 600, { min: 60, max: 3600 }),
      maxAttempts: int(env, 'DEMO_OTP_MAX_ATTEMPTS', 5, { min: 1, max: 20 }),
      smsUrl: String(env.DEMO_OTP_SMS_URL ?? env.IDENTITY_SMS_URL ?? '').trim(),
      // Optional: send email codes to the mocks' email capture instead of the mailer.
      emailUrl: String(env.DEMO_OTP_EMAIL_URL ?? '').trim(),
      // Demo only: SMS go to the mocks (no real phone receives them), so the code page may show the
      // code it just sent by SMS, labelled "Test mode". Email codes are never shown.
      showSmsCode: enabled && String(env.DEMO_OTP_SHOW_SMS_CODE ?? '').trim() === '1',
    },
    // Per UTC day.
    limits: {
      codesPerIp: int(env, 'DEMO_SIGNUP_CODES_PER_IP_PER_DAY', 10, { min: 1 }),
      codesPerContact: int(env, 'DEMO_SIGNUP_CODES_PER_CONTACT_PER_DAY', 5, { min: 1 }),
      sandboxesPerIp: int(env, 'DEMO_SIGNUP_SANDBOXES_PER_IP_PER_DAY', 3, { min: 1 }),
      sandboxesPerContact: int(env, 'DEMO_SIGNUP_SANDBOXES_PER_CONTACT_PER_DAY', 1, { min: 1 }),
    },
    provisioning: {
      attempts: int(env, 'DEMO_PROVISIONING_ATTEMPTS', 4, { min: 1, max: 10 }),
      backoffMs: int(env, 'DEMO_PROVISIONING_BACKOFF_MS', 500, { min: 0, max: 60_000 }),
      timeoutMs: int(env, 'DEMO_PROVISIONING_TIMEOUT_MS', 15_000, { min: 100, max: 120_000 }),
      concurrency: int(env, 'DEMO_PROVISIONING_CONCURRENCY', 5, { min: 1, max: 25 }),
    },
  };
  // Not enumerable: a settings dump (or JSON.stringify) never shows it.
  Object.defineProperty(out, 'secret', { value: secret, enumerable: false });
  return out;
}

export const readJsonFile = file => JSON.parse(readFileSync(file, 'utf8'));

// Mail settings for the operator CLI (the expiry job sends its warnings like the server would).
export function mailSettingsFromEnv(env = process.env) {
  const devMode = ['1', 'true', 'yes'].includes(String(env.IDENTITY_DEV_MODE ?? '').toLowerCase());
  return {
    transport: env.MAIL_TRANSPORT ?? (devMode ? 'log' : 'smtp'),
    from: env.MAIL_FROM ?? 'Africa Digital Synergy <admin@africadigitalsynergy.com>',
    replyTo: env.MAIL_REPLY_TO ?? '',
    smtpHost: env.SMTP_HOST ?? '',
    smtpPort: Number(env.SMTP_PORT || 587),
    smtpSecure: ['1', 'true', 'yes'].includes(String(env.SMTP_SECURE ?? '').toLowerCase()),
    smtpUser: env.SMTP_USER ?? '',
    smtpPassword: env.SMTP_PASSWORD ?? '',
  };
}

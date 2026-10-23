// All settings come from environment variables (twelve-factor). See deploy/.env.example.
import { readFileSync } from 'node:fs';

const num = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`CONFIG_NOT_A_NUMBER:${value}`);
  return n;
};
const bool = (value, fallback) => (value === undefined || value === '' ? fallback : ['1', 'true', 'yes'].includes(String(value).toLowerCase()));

// A secret from NAME, or from the file named by NAME_FILE (Docker/Kubernetes secrets). Never logged.
export function readSecret(env, name) {
  if (env[name]) return String(env[name]);
  const file = env[`${name}_FILE`];
  if (!file) return '';
  return readFileSync(String(file), 'utf8').replace(/\r?\n$/, '');
}

export const DEMO_ACCOUNTS = ['user', 'user2', 'admin'];

// DE-03 demo accounts. Demo mode is on ONLY when ADS_ENV=demo AND DEMO_MODE=1. Everywhere else demo
// accounts are refused at sign-in and cannot be created. DEMO_MODE=1 in production stops the start.
// Shared by the server (loadConfig) and the operator CLI (which has no IDENTITY_PUBLIC_URL).
export function demoSettings(env = process.env) {
  const devMode = bool(env.IDENTITY_DEV_MODE, false);
  const adsEnv = String(env.ADS_ENV ?? '').trim().toLowerCase() || (devMode ? 'development' : 'production');
  const asked = String(env.DEMO_MODE ?? '').trim() === '1';
  if (asked && adsEnv === 'production') throw new Error('DEMO_MODE_NOT_ALLOWED_IN_PRODUCTION');
  const enabled = asked && adsEnv === 'demo';
  const domain = String(env.DEMO_EMAIL_DOMAIN ?? 'demo.africadigitalsynergy.com').trim().toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) throw new Error('DEMO_EMAIL_DOMAIN_INVALID');
  const defaults = { user: 'demo.user', user2: 'demo.checker', admin: 'demo.admin' };
  const names = { user: 'Demo User', user2: 'Demo Checker', admin: 'Demo Admin' };
  const vars = { user: 'DEMO_USER', user2: 'DEMO_USER2', admin: 'DEMO_ADMIN' };
  const accounts = {};
  for (const key of DEMO_ACCOUNTS) {
    const email = String(env[`${vars[key]}_EMAIL`] ?? `${defaults[key]}@${domain}`).trim().toLowerCase();
    if (!email.endsWith(`@${domain}`)) throw new Error(`${vars[key]}_EMAIL_MUST_BE_UNDER_${domain.toUpperCase()}`);
    accounts[key] = { key, email, name: names[key], passwordVar: `${vars[key]}_PASSWORD` };
  }
  const showCredentials = enabled && String(env.DEMO_SHOW_CREDENTIALS ?? '').trim() === '1';
  return {
    enabled, adsEnv, domain, accounts, showCredentials,
    // Only the demo USER's password is ever shown on the sign-in page; never the admin's.
    shownPassword: showCredentials ? readSecret(env, 'DEMO_USER_PASSWORD') : '',
    // BRIEF16 demo personas (config/demo-personas.json): one shared persona password, shown with the
    // persona picker under the same rule as the demo user's. Never the admin's or the checker's.
    personaPasswordVar: 'DEMO_PERSONA_PASSWORD',
    shownPersonaPassword: showCredentials ? readSecret(env, 'DEMO_PERSONA_PASSWORD') : '',
    personaEmail: (slug, key) => `demo.${slug}.${key}@${domain}`,
  };
}

// The persona password is shown on the sign-in page, so it must not open any other demo account.
export function assertPersonaPasswordSeparate(env, personaPassword) {
  if (!personaPassword) return;
  for (const name of ['DEMO_USER2_PASSWORD', 'DEMO_ADMIN_PASSWORD']) {
    let other = '';
    try { other = readSecret(env, name); } catch { other = ''; }
    if (other && other === personaPassword) throw new Error(`DEMO_PERSONA_PASSWORD_MUST_DIFFER_FROM_${name}`);
  }
}

// True for an address under the reserved demo domain (or one of its subdomains).
export const isDemoDomain = (email, domain) => {
  const at = String(email ?? '').toLowerCase().split('@')[1] ?? '';
  return at === domain || at.endsWith(`.${domain}`);
};

export const ENVIRONMENTS = ['production', 'demo', 'staging', 'test', 'development'];

// Same rule as loadConfig: ADS_ENV unset means production unless IDENTITY_DEV_MODE is on.
export function isProductionEnv(env = process.env) {
  const adsEnv = String(env.ADS_ENV ?? '').trim().toLowerCase() || (bool(env.IDENTITY_DEV_MODE, false) ? 'development' : 'production');
  return adsEnv === 'production';
}

// Client redirect / post-logout URIs. https always; plain http only for localhost, and, outside
// production, also for the loopback address 127.0.0.1 (RFC 8252 §7.3). Production stays as strict as before.
export function redirectAllowed(url, { production = true } = {}) {
  const u = url instanceof URL ? url : new URL(url);
  if (u.protocol === 'https:') return true;
  if (u.protocol !== 'http:') return false;
  if (u.hostname === 'localhost') return true;
  return !production && u.hostname === '127.0.0.1';
}

export function loadConfig(env = process.env) {
  const publicUrl = String(env.IDENTITY_PUBLIC_URL ?? '').replace(/\/$/, '');
  if (!publicUrl) throw new Error('IDENTITY_PUBLIC_URL_REQUIRED');
  const url = new URL(publicUrl);
  const devMode = bool(env.IDENTITY_DEV_MODE, false);
  if (url.protocol !== 'https:' && !devMode) throw new Error('IDENTITY_PUBLIC_URL_MUST_BE_HTTPS');
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
  const cookieSecret = env.IDENTITY_COOKIE_SECRET ?? '';
  if (cookieSecret.length < 32 && !devMode) throw new Error('IDENTITY_COOKIE_SECRET_TOO_SHORT');

  // Which environment this instance is. Unset means production, unless IDENTITY_DEV_MODE is on.
  const adsEnv = String(env.ADS_ENV ?? '').trim().toLowerCase() || (devMode ? 'development' : 'production');
  if (!ENVIRONMENTS.includes(adsEnv)) throw new Error(`ADS_ENV_INVALID:${adsEnv}`);
  const production = adsEnv === 'production';

  // ACC-03. The old self-service "create organisation" JSON route (POST /v1/identity/onboard) is the
  // audit's self-escalation path. It is off unless switched on, and can never be on in production or demo.
  const legacyOnboard = bool(env.IDENTITY_LEGACY_ONBOARD_ENABLED, false);
  if (legacyOnboard && (production || adsEnv === 'demo')) throw new Error(`IDENTITY_LEGACY_ONBOARD_NOT_ALLOWED_IN_${adsEnv.toUpperCase()}`);

  // ACC-03. Strict grants: only roles listed in a product's assignable_roles may be granted or
  // invited on /admin and /admin/v1, and products with an empty list allow no grants at all.
  // Always on in production; on by default in demo; off by default elsewhere (tests, development).
  const strictRaw = env.IDENTITY_STRICT_ROLE_GRANTS;
  if (production && strictRaw !== undefined && strictRaw !== '' && !bool(strictRaw, true)) throw new Error('IDENTITY_STRICT_ROLE_GRANTS_REQUIRED_IN_PRODUCTION');
  const strictRoleGrants = production ? true : bool(strictRaw, adsEnv === 'demo');
  const demo = demoSettings(env);
  if (demo.showCredentials && !demo.shownPassword) throw new Error('DEMO_USER_PASSWORD_REQUIRED_TO_SHOW_CREDENTIALS');
  if (demo.showCredentials) assertPersonaPasswordSeparate(env, demo.shownPersonaPassword);

  return {
    host: env.HOST ?? '0.0.0.0',
    port: num(env.PORT, 8084),
    devMode,
    adsEnv,
    production,
    legacyOnboard,
    strictRoleGrants,
    demo,
    publicUrl,
    issuer: env.IDENTITY_ISSUER ? String(env.IDENTITY_ISSUER).replace(/\/$/, '') : publicUrl,
    databaseUrl: env.DATABASE_URL,
    dbPoolMax: num(env.IDENTITY_DB_POOL_MAX, 10),
    cookieSecret: cookieSecret || 'dev-only-cookie-secret-change-me-0000',
    secureCookies: url.protocol === 'https:',
    trustProxy: bool(env.IDENTITY_TRUST_PROXY, false),
    // Number of our own proxies in front of the service; their addresses are appended right-most.
    trustedProxyHops: Math.max(1, num(env.IDENTITY_TRUSTED_PROXY_HOPS, 1)),

    // Signing key for product tokens (RS256 private key in PEM). Dev mode generates one in memory.
    signingKeyPem: env.IDENTITY_SIGNING_KEY_PEM ?? '',
    signingKeyId: env.IDENTITY_SIGNING_KEY_ID ?? 'ads-1',

    requireEmailVerification: bool(env.IDENTITY_REQUIRE_EMAIL_VERIFICATION, true),
    passwordMinLength: num(env.IDENTITY_PASSWORD_MIN_LENGTH, 10),

    // Lifetimes in seconds.
    legacySessionTtl: num(env.IDENTITY_SESSION_TTL_SECONDS, 28800),
    accessTokenTtl: num(env.IDENTITY_ACCESS_TOKEN_TTL_SECONDS, 900),
    refreshTokenTtl: num(env.IDENTITY_REFRESH_TOKEN_TTL_SECONDS, 1209600),
    ssoSessionTtl: num(env.IDENTITY_SSO_SESSION_TTL_SECONDS, 43200),
    verifyEmailTtl: num(env.IDENTITY_VERIFY_EMAIL_TTL_SECONDS, 86400),
    resetPasswordTtl: num(env.IDENTITY_RESET_PASSWORD_TTL_SECONDS, 3600),
    authRequestTtl: num(env.IDENTITY_AUTH_REQUEST_TTL_SECONDS, 1800),
    authCodeTtl: num(env.IDENTITY_AUTH_CODE_TTL_SECONDS, 60),
    // A refresh token presented again within this many seconds of its rotation returns the same
    // successor (a reload cut off the first response). Later reuse, or reuse of an older token,
    // is treated as theft and ends the sign-in. 0 turns the grace window off.
    refreshReuseGrace: Math.min(120, Math.max(0, num(env.IDENTITY_REFRESH_REUSE_GRACE_SECONDS, 30))),
    // Short-lived admin tokens a product server gets for an organisation admin (token exchange).
    adminTokenTtl: num(env.IDENTITY_ADMIN_TOKEN_TTL_SECONDS, 300),
    invitationTtl: num(env.IDENTITY_INVITATION_TTL_SECONDS, 7 * 86400),
    // Optional SMS hook for invitations: POST {to, text} (the shared mocks' /sms/v1/messages in tests).
    smsUrl: env.IDENTITY_SMS_URL ?? '',

    mail: {
      transport: env.MAIL_TRANSPORT ?? (devMode ? 'log' : 'smtp'),
      from: env.MAIL_FROM ?? 'Africa Digital Synergy <admin@africadigitalsynergy.com>',
      replyTo: env.MAIL_REPLY_TO ?? '',
      smtpHost: env.SMTP_HOST ?? '',
      smtpPort: num(env.SMTP_PORT, 587),
      smtpSecure: bool(env.SMTP_SECURE, false),
      smtpUser: env.SMTP_USER ?? '',
      smtpPassword: env.SMTP_PASSWORD ?? '',
    },

    google: {
      clientId: env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
      enabled: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    },

    // Limits per window (simple in-memory limiter; one instance per deployment for the MVP).
    limits: {
      loginPerIp: num(env.IDENTITY_LIMIT_LOGIN_PER_IP, 50),
      loginPerEmail: num(env.IDENTITY_LIMIT_LOGIN_PER_EMAIL, 10),
      registerPerIp: num(env.IDENTITY_LIMIT_REGISTER_PER_IP, 10),
      emailPerAddress: num(env.IDENTITY_LIMIT_EMAIL_PER_ADDRESS, 5),
      tokenPerIp: num(env.IDENTITY_LIMIT_TOKEN_PER_IP, 120),
    },
  };
}

// All settings come from environment variables (twelve-factor). See deploy/.env.example.

const num = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`CONFIG_NOT_A_NUMBER:${value}`);
  return n;
};
const bool = (value, fallback) => (value === undefined || value === '' ? fallback : ['1', 'true', 'yes'].includes(String(value).toLowerCase()));

export const ENVIRONMENTS = ['production', 'demo', 'staging', 'test', 'development'];

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

  return {
    host: env.HOST ?? '0.0.0.0',
    port: num(env.PORT, 8084),
    devMode,
    adsEnv,
    production,
    legacyOnboard,
    strictRoleGrants,
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

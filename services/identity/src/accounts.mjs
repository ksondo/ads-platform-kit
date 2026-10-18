import crypto from 'node:crypto';
import { withTransaction } from './db.mjs';
import { renderEmail } from './mailer.mjs';
import { DUMMY_HASH, checkPasswordStrength, fail, hashPassword, isEmail, normalizeEmail, randomToken, sha256, verifyPassword } from './security.mjs';

// Account rules shared by the hosted pages and the legacy JSON API.
//
// Activation design (prevents pre-registration takeover): a new registration does NOT put a
// password on the account. The chosen password's hash travels with the activation token. The
// account gets a password only when someone opens the emailed link (proving the mailbox) AND
// types the password chosen at that registration. Several pending registrations can coexist;
// only the one whose password the mailbox owner knows can be activated.
export function createAccounts({ pool, config, mailer, audit, log = console }) {
  const link = (pathname, params) => `${config.publicUrl}${pathname}?${new URLSearchParams(params).toString()}`;

  async function issueEmailToken(client, userId, purpose, ttlSeconds, passwordHash = null) {
    const token = randomToken(32);
    if (purpose === 'reset_password') {
      await client.query("UPDATE platform.email_tokens SET used_at=now() WHERE user_id=$1 AND purpose='reset_password' AND used_at IS NULL", [userId]);
    }
    await client.query('INSERT INTO platform.email_tokens(id,user_id,purpose,token_hash,password_hash,expires_at) VALUES ($1,$2,$3,$4,$5,now()+make_interval(secs => $6))',
      [crypto.randomUUID(), userId, purpose, sha256(token), passwordHash, ttlSeconds]);
    return token;
  }

  // Sending happens after the response, so response time never depends on whether an account exists.
  function send(to, kind, data) {
    const message = renderEmail(kind, data);
    setImmediate(() => {
      Promise.resolve()
        .then(() => mailer.send({ to, ...message }))
        .catch(error => log.error?.(`mail send failed kind=${kind}: ${error.message}`));
    });
  }

  async function sendVerification(user, { req, product, passwordHash } = {}) {
    const token = await withTransaction(pool, c => issueEmailToken(c, user.id, 'verify_email', config.verifyEmailTtl, passwordHash ?? null));
    send(user.email, 'verify_email', { link: link('/verify-email', { token, ...(req ? { req } : {}) }), hours: Math.round(config.verifyEmailTtl / 3600), product });
  }

  async function sendReset(user, { req } = {}) {
    const token = await withTransaction(pool, c => issueEmailToken(c, user.id, 'reset_password', config.resetPasswordTtl));
    send(user.email, 'reset_password', { link: link('/reset-password', { token, ...(req ? { req } : {}) }), minutes: Math.round(config.resetPasswordTtl / 60) });
  }

  async function findByEmail(email) {
    const normalized = normalizeEmail(email);
    if (!isEmail(normalized)) return null;
    return (await pool.query('SELECT id,email,password_hash,status,email_verified_at,display_name,locale FROM platform.users WHERE email=$1', [normalized])).rows[0] ?? null;
  }

  // Returns { user, created }. Existing accounts are never overwritten.
  async function register({ email, password, name, locale = 'en', product, req, ip, clientId, revealExisting = false }) {
    const normalized = normalizeEmail(email);
    if (!isEmail(normalized)) fail(400, 'EMAIL_INVALID');
    const weak = checkPasswordStrength(password, config.passwordMinLength);
    if (weak) fail(400, weak);
    // Always hash, so timing is the same whether or not the email exists.
    const passwordHash = await hashPassword(String(password));
    const existing = await findByEmail(normalized);
    if (existing) {
      await audit('register', { userId: existing.id, outcome: 'denied', reason: 'EMAIL_ALREADY_REGISTERED', ip, clientId });
      if (existing.status === 'pending') {
        // Another registration for an unconfirmed email: give it its own activation link.
        await sendVerification(existing, { req, product, passwordHash });
        if (revealExisting) fail(409, 'EMAIL_ALREADY_REGISTERED');
        return { user: existing, created: false };
      }
      if (revealExisting) fail(409, 'EMAIL_ALREADY_REGISTERED');
      // Hosted pages do not reveal which emails have accounts: send a reset link instead.
      if (existing.status === 'active') await sendReset(existing, { req });
      return { user: existing, created: false };
    }
    const id = crypto.randomUUID();
    const requireVerify = config.requireEmailVerification;
    try {
      await pool.query('INSERT INTO platform.users(id,email,password_hash,status,display_name,locale) VALUES ($1,$2,$3,$4,$5,$6)',
        [id, normalized, requireVerify ? null : passwordHash, requireVerify ? 'pending' : 'active', name ? String(name).trim().slice(0, 120) || null : null, locale]);
    } catch (error) {
      if (error?.code === '23505') {
        if (revealExisting) fail(409, 'EMAIL_ALREADY_REGISTERED');
        return { user: await findByEmail(normalized), created: false };
      }
      throw error;
    }
    const user = { id, email: normalized, status: requireVerify ? 'pending' : 'active' };
    await audit('register', { userId: id, outcome: 'allowed', ip, clientId });
    if (requireVerify) await sendVerification(user, { req, product, passwordHash });
    return { user, created: true };
  }

  async function checkVerifyToken(token) {
    if (typeof token !== 'string' || !token) return false;
    return (await pool.query("SELECT 1 FROM platform.email_tokens WHERE token_hash=$1 AND purpose='verify_email' AND used_at IS NULL AND expires_at>now()", [sha256(token)])).rowCount > 0;
  }

  // Opening the link proves the mailbox; typing the password proves who registered.
  async function activate({ token, password, ip }) {
    if (typeof token !== 'string' || !token) fail(400, 'LINK_INVALID');
    const row = (await pool.query(`SELECT t.id,t.user_id,t.password_hash,u.email,u.status,u.password_hash AS current_hash FROM platform.email_tokens t
      JOIN platform.users u ON u.id=t.user_id WHERE t.token_hash=$1 AND t.purpose='verify_email' AND t.used_at IS NULL AND t.expires_at>now()`, [sha256(token)])).rows[0];
    if (!row) fail(400, 'LINK_INVALID');
    if (row.status === 'disabled') fail(403, 'ACCOUNT_DISABLED');
    // Already-active accounts (e.g. legacy users confirming their email) prove it with their current password.
    const expected = row.status === 'pending' ? row.password_hash : row.current_hash;
    const ok = await verifyPassword(String(password ?? ''), expected ?? DUMMY_HASH);
    if (!expected || !ok) {
      await audit('verify_email', { userId: row.user_id, outcome: 'denied', reason: 'INVALID_CREDENTIALS', ip });
      fail(401, 'INVALID_CREDENTIALS');
    }
    return withTransaction(pool, async c => {
      const locked = (await c.query('SELECT used_at FROM platform.email_tokens WHERE id=$1 FOR UPDATE', [row.id])).rows[0];
      if (!locked || locked.used_at) fail(400, 'LINK_INVALID');
      await c.query("UPDATE platform.email_tokens SET used_at=now() WHERE user_id=$1 AND purpose='verify_email' AND used_at IS NULL", [row.user_id]);
      if (row.status === 'pending') {
        await c.query("UPDATE platform.users SET password_hash=$2, status='active', email_verified_at=now(), updated_at=now() WHERE id=$1", [row.user_id, row.password_hash]);
      } else {
        await c.query('UPDATE platform.users SET email_verified_at=coalesce(email_verified_at,now()), updated_at=now() WHERE id=$1', [row.user_id]);
      }
      await audit('verify_email', { userId: row.user_id, outcome: 'allowed', ip }, c);
      return { id: row.user_id, email: row.email, status: 'active' };
    });
  }

  // Checks email + password. Error codes: INVALID_CREDENTIALS, EMAIL_NOT_VERIFIED, ACCOUNT_DISABLED.
  async function authenticate({ email, password, ip, clientId }) {
    const user = await findByEmail(email);
    if (user?.status === 'pending') {
      // Say "confirm your email" only to someone who knows a pending registration's password.
      const hashes = (await pool.query("SELECT password_hash FROM platform.email_tokens WHERE user_id=$1 AND purpose='verify_email' AND used_at IS NULL AND expires_at>now() AND password_hash IS NOT NULL ORDER BY created_at DESC LIMIT 5", [user.id])).rows;
      let matched = null;
      for (const h of hashes) if (await verifyPassword(String(password ?? ''), h.password_hash)) { matched = h.password_hash; break; }
      if (!hashes.length) await verifyPassword(String(password ?? ''), DUMMY_HASH);
      await audit('login', { userId: user.id, outcome: 'denied', reason: matched ? 'EMAIL_NOT_VERIFIED' : 'INVALID_CREDENTIALS', ip, clientId });
      if (matched) fail(403, 'EMAIL_NOT_VERIFIED', { user: { id: user.id, email: user.email }, passwordHash: matched });
      fail(401, 'INVALID_CREDENTIALS');
    }
    const ok = await verifyPassword(String(password ?? ''), user?.password_hash ?? DUMMY_HASH);
    if (!user || !user.password_hash || !ok) {
      await audit('login', { userId: user?.id ?? null, outcome: 'denied', reason: 'INVALID_CREDENTIALS', ip, clientId });
      fail(401, 'INVALID_CREDENTIALS');
    }
    if (user.status !== 'active') {
      await audit('login', { userId: user.id, outcome: 'denied', reason: 'ACCOUNT_DISABLED', ip, clientId });
      fail(403, 'ACCOUNT_DISABLED');
    }
    return user;
  }

  async function requestPasswordReset({ email, req, ip }) {
    const user = await findByEmail(email);
    await audit('password_reset_request', { userId: user?.id ?? null, outcome: user ? 'allowed' : 'ignored', ip });
    if (user && user.status !== 'disabled') await sendReset(user, { req });
  }

  async function checkResetToken(token) {
    if (typeof token !== 'string' || !token) return false;
    return (await pool.query("SELECT 1 FROM platform.email_tokens WHERE token_hash=$1 AND purpose='reset_password' AND used_at IS NULL AND expires_at>now()", [sha256(token)])).rowCount > 0;
  }

  async function revokeAllSessions(c, userId) {
    await c.query('UPDATE platform.sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [userId]);
    await c.query('UPDATE platform.sso_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [userId]);
    await c.query('UPDATE platform.refresh_tokens SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [userId]);
  }

  async function resetPassword({ token, password, ip }) {
    const weak = checkPasswordStrength(password, config.passwordMinLength);
    if (weak) fail(400, weak);
    const passwordHash = await hashPassword(String(password));
    const user = await withTransaction(pool, async c => {
      const row = (await c.query(`SELECT t.id,t.user_id,u.email,u.status FROM platform.email_tokens t JOIN platform.users u ON u.id=t.user_id
        WHERE t.token_hash=$1 AND t.purpose='reset_password' AND t.used_at IS NULL AND t.expires_at>now() FOR UPDATE OF t`, [sha256(token)])).rows[0];
      if (!row) fail(400, 'LINK_INVALID');
      if (row.status === 'disabled') fail(403, 'ACCOUNT_DISABLED');
      await c.query('UPDATE platform.email_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL', [row.user_id]);
      // The reset link proves the person controls the mailbox, so a pending account becomes active.
      await c.query("UPDATE platform.users SET password_hash=$2, status='active', email_verified_at=coalesce(email_verified_at,now()), updated_at=now() WHERE id=$1", [row.user_id, passwordHash]);
      await revokeAllSessions(c, row.user_id);
      await audit('password_reset', { userId: row.user_id, outcome: 'allowed', ip }, c);
      return { id: row.user_id, email: row.email };
    });
    send(user.email, 'password_changed', {});
    return user;
  }

  // Finds or creates the ADS user for a verified Google account.
  async function googleUser({ subject, email, emailVerified, name, ip, locale = 'en' }) {
    if (!emailVerified) fail(403, 'GOOGLE_EMAIL_NOT_VERIFIED');
    const normalized = normalizeEmail(email);
    if (!isEmail(normalized)) fail(403, 'GOOGLE_SIGN_IN_FAILED');
    return withTransaction(pool, async c => {
      const linked = (await c.query(`SELECT u.id,u.email,u.status FROM platform.external_identities e JOIN platform.users u ON u.id=e.user_id
        WHERE e.provider='google' AND e.subject=$1`, [subject])).rows[0];
      if (linked) {
        if (linked.status === 'disabled') fail(403, 'ACCOUNT_DISABLED');
        await audit('login', { userId: linked.id, outcome: 'allowed', reason: 'google', ip }, c);
        return linked;
      }
      const existing = (await c.query('SELECT id,email,status FROM platform.users WHERE email=$1 FOR UPDATE', [normalized])).rows[0];
      let userId;
      if (existing) {
        if (existing.status === 'disabled') fail(403, 'ACCOUNT_DISABLED');
        userId = existing.id;
        if (existing.status === 'pending') {
          // Unconfirmed registrations for this email may not be the owner's: discard them all.
          await c.query("UPDATE platform.email_tokens SET used_at=now() WHERE user_id=$1 AND purpose='verify_email' AND used_at IS NULL", [userId]);
          await c.query("UPDATE platform.users SET password_hash=NULL, status='active', email_verified_at=now(), updated_at=now() WHERE id=$1", [userId]);
        } else {
          await c.query('UPDATE platform.users SET email_verified_at=coalesce(email_verified_at,now()), updated_at=now() WHERE id=$1', [userId]);
        }
        await audit('google_link', { userId, outcome: 'allowed', reason: existing.status === 'pending' ? 'pending_registrations_discarded' : 'existing_account', ip }, c);
      } else {
        userId = crypto.randomUUID();
        await c.query("INSERT INTO platform.users(id,email,password_hash,status,display_name,locale,email_verified_at) VALUES ($1,$2,NULL,'active',$3,$4,now())", [userId, normalized, name, locale]);
        await audit('register', { userId, outcome: 'allowed', reason: 'google', ip }, c);
      }
      await c.query("INSERT INTO platform.external_identities(provider,subject,user_id,email) VALUES ('google',$1,$2,$3)", [subject, userId, normalized]);
      await audit('login', { userId, outcome: 'allowed', reason: 'google', ip }, c);
      return { id: userId, email: normalized, status: 'active' };
    });
  }

  return { register, checkVerifyToken, activate, authenticate, requestPasswordReset, checkResetToken, resetPassword, googleUser, sendVerification, findByEmail };
}

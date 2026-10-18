import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, code, details) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const fail = (status, code, details) => { throw new HttpError(status, code, details); };

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');
export const normalizeEmail = email => String(email ?? '').trim().toLowerCase();
// Plain addresses only: no display names, comments, quotes or lists that mail libraries could reinterpret.
export const isEmail = email => typeof email === 'string' && email.length <= 254
  && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/.test(email);

// Same scrypt format as the original RAG-repo identity service, so existing passwords keep working.
export const hashPassword = password => new Promise((resolve, reject) => {
  const salt = crypto.randomBytes(16);
  crypto.scrypt(password, salt, 64, (error, key) => (error ? reject(error) : resolve(`scrypt$${salt.toString('hex')}$${key.toString('hex')}`)));
});
export const verifyPassword = (password, stored) => new Promise((resolve, reject) => {
  const [scheme, saltHex, keyHex] = String(stored ?? '').split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return resolve(false);
  crypto.scrypt(String(password), Buffer.from(saltHex, 'hex'), 64, (error, key) => {
    if (error) return reject(error);
    const expected = Buffer.from(keyHex, 'hex');
    resolve(expected.length === key.length && crypto.timingSafeEqual(expected, key));
  });
});
// Burns comparable time when the user does not exist, so response time does not reveal accounts.
export const DUMMY_HASH = 'scrypt$00000000000000000000000000000000$' + '0'.repeat(128);

export function checkPasswordStrength(password, minLength) {
  const value = String(password ?? '');
  if (value.length < minLength) return 'PASSWORD_TOO_SHORT';
  if (value.length > 256) return 'PASSWORD_TOO_LONG';
  if (/^(.)\1+$/.test(value)) return 'PASSWORD_TOO_WEAK';
  if (['password', 'motdepasse', '1234567890', 'azertyuiop', 'qwertyuiop'].some(w => value.toLowerCase().startsWith(w))) return 'PASSWORD_TOO_WEAK';
  return null;
}

export const pkceChallenge = verifier => crypto.createHash('sha256').update(verifier).digest('base64url');
export const isPkceVerifier = v => typeof v === 'string' && /^[A-Za-z0-9\-._~]{43,128}$/.test(v);
export const isPkceChallenge = v => typeof v === 'string' && /^[A-Za-z0-9\-_]{43}$/.test(v);

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Fixed-window in-memory rate limiter. Good enough for one instance; swap for Redis when scaled out.
export class RateLimiter {
  constructor(now = () => Date.now(), maxKeys = 50000) {
    this.now = now;
    this.maxKeys = maxKeys;
    this.buckets = new Map();
  }
  hit(key, limit, windowMs) {
    const t = this.now();
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= t) {
      bucket = { count: 0, resetAt: t + windowMs };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (this.buckets.size > this.maxKeys) this.sweep();
    return { allowed: bucket.count <= limit, retryAfter: Math.ceil((bucket.resetAt - t) / 1000) };
  }
  enforce(key, limit, windowMs) {
    const result = this.hit(key, limit, windowMs);
    if (!result.allowed) fail(429, 'TOO_MANY_ATTEMPTS', { retryAfter: result.retryAfter });
  }
  reset(key) { this.buckets.delete(key); }
  // Drops expired entries, then the oldest ones, so memory stays bounded under a flood of new keys.
  sweep() {
    const t = this.now();
    for (const [key, bucket] of this.buckets) if (bucket.resetAt <= t) this.buckets.delete(key);
    for (const key of this.buckets.keys()) {
      if (this.buckets.size <= this.maxKeys * 0.9) break;
      this.buckets.delete(key);
    }
  }
}

// Cookies are signed with HMAC so they cannot be forged.
export function signValue(value, secret) {
  const mac = crypto.createHmac('sha256', secret).update(value).digest('base64url');
  return `${value}.${mac}`;
}
export function unsignValue(signed, secret) {
  const s = String(signed ?? '');
  const i = s.lastIndexOf('.');
  if (i <= 0) return null;
  const value = s.slice(0, i);
  return safeEqual(signValue(value, secret), s) ? value : null;
}
export function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      // Ignore malformed cookies instead of failing every request from that browser.
    }
  }
  return out;
}
export function cookie(name, value, { maxAge, secure, httpOnly = true, sameSite = 'Lax', path = '/' } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  if (maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  return parts.join('; ');
}

// Seals a value with AES-256-GCM under a key derived from a secret the caller holds (for example
// a refresh token): only someone presenting that secret again can open it.
const sealKey = secret => crypto.createHmac('sha256', String(secret)).update('ads-identity-seal-v1').digest();
export function seal(value, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', sealKey(secret), iv);
  const body = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}
export function unseal(sealed, secret) {
  try {
    const raw = Buffer.from(String(sealed ?? ''), 'base64url');
    if (raw.length < 29) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', sealKey(secret), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

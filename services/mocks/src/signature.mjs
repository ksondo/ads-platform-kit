import crypto from 'node:crypto';

// Webhooks from the mocks are signed like real providers sign theirs, so product adapters
// exercise the same verification path in test mode as in production.
//
//   ADS-Mock-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, `${t}.${rawBody}`)>
//
// Verify against the raw request body (before JSON parsing) and reject old timestamps.
export const SIGNATURE_HEADER = 'ads-mock-signature';

export function signPayload(rawBody, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const v1 = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

export function verifySignature(rawBody, header, secret, { toleranceSeconds = 300, now = Date.now() } = {}) {
  if (typeof header !== 'string' || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map(p => p.trim().split('=')).filter(p => p.length === 2));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || typeof parts.v1 !== 'string' || !/^[0-9a-f]{64}$/.test(parts.v1)) return false;
  if (Math.abs(now / 1000 - t) > toleranceSeconds) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest();
  const given = Buffer.from(parts.v1, 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

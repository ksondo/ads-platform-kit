import crypto from 'node:crypto';

// Product-side check of a provider webhook signature (format used by the ADS mocks:
// "t=<unix>,v1=<hex HMAC-SHA256(secret, `${t}.${rawBody}`)>"). Production code owns this; it must
// not import the test kit. The live provider's adapter swaps in that provider's own scheme.
export function verifyWebhookSignature(rawBody, header, secret, toleranceSeconds = 300) {
  if (typeof header !== 'string' || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map(p => p.trim().split('=')).filter(p => p.length === 2));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !/^[0-9a-f]{64}$/.test(parts.v1 ?? '') || Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest();
  const given = Buffer.from(parts.v1, 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

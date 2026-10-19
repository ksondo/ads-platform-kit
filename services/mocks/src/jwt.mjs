import crypto from 'node:crypto';

// Minimal RS256 JWT verification with node:crypto (the mocks package has no dependencies).
// Used by the AI gateway facade to check E2E-kit ADS sign-in tokens against a JWKS: signature,
// alg RS256 only, issuer, audience, exp/nbf. Test mode only; production verification lives in
// the gateway (ksondo/RAG-Intelligence-AI-Platform gateway/src/auth/ads-token.ts, using jose).

const b64json = part => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

export class JwtError extends Error {}

export function createJwksResolver({ jwks, jwksUrl, fetchImpl = fetch }) {
  let cached = jwks ?? null;
  let fetchedAt = 0;
  return async function keyFor(kid) {
    if (!cached || (jwksUrl && Date.now() - fetchedAt > 60_000)) {
      if (!jwksUrl) throw new JwtError('JWKS_UNCONFIGURED');
      const res = await fetchImpl(jwksUrl);
      if (!res.ok) throw new JwtError('JWKS_UNAVAILABLE');
      cached = await res.json();
      fetchedAt = Date.now();
    }
    const keys = Array.isArray(cached?.keys) ? cached.keys : [];
    const jwk = keys.find(k => k.kid === kid) ?? (keys.length === 1 && !kid ? keys[0] : null);
    if (!jwk || jwk.kty !== 'RSA') throw new JwtError('KEY_NOT_FOUND');
    return crypto.createPublicKey({ key: jwk, format: 'jwk' });
  };
}

export async function verifyJwt(token, { keyFor, issuer, audience, clockToleranceSec = 5 }) {
  if (typeof token !== 'string') throw new JwtError('MALFORMED');
  const parts = token.split('.');
  if (parts.length !== 3) throw new JwtError('MALFORMED');
  let header, payload;
  try { header = b64json(parts[0]); payload = b64json(parts[1]); } catch { throw new JwtError('MALFORMED'); }
  if (header.alg !== 'RS256') throw new JwtError('ALG_NOT_ALLOWED');
  const key = await keyFor(header.kid);
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'));
  if (!ok) throw new JwtError('BAD_SIGNATURE');
  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== issuer) throw new JwtError('ISSUER');
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  const wanted = Array.isArray(audience) ? audience : [audience];
  if (!aud.some(a => wanted.includes(a))) throw new JwtError('AUDIENCE');
  if (typeof payload.exp !== 'number' || payload.exp + clockToleranceSec < now) throw new JwtError('EXPIRED');
  if (typeof payload.nbf === 'number' && payload.nbf - clockToleranceSec > now) throw new JwtError('NOT_YET_VALID');
  return payload;
}

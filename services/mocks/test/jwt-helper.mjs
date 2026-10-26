import crypto from 'node:crypto';

// Test-only RS256 signer (node:crypto), standing in for the E2E kit identity's tokens.
export function createSigner(kid = 'test-kid') {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };
  const enc = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const sign = (payload, key = privateKey) => {
    const head = enc({ alg: 'RS256', kid, typ: 'JWT' });
    const body = enc(payload);
    return `${head}.${body}.${crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), key).toString('base64url')}`;
  };
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const now = () => Math.floor(Date.now() / 1000);
  return {
    jwks: { keys: [jwk] },
    user: ({ issuer, audience, tenantId, roles, sub = crypto.randomUUID(), exp = 600 }) => sign({ iss: issuer, aud: audience, sub, tenant_id: tenantId, roles, client_id: audience, iat: now(), exp: now() + exp }),
    service: ({ issuer, clientId, audience = 'ads-ai-gateway' }) => sign({ iss: issuer, aud: audience, sub: `client:${clientId}`, client_id: clientId, iat: now(), exp: now() + 300 }),
    forged: ({ issuer, audience, tenantId, roles }) => sign({ iss: issuer, aud: audience, sub: 'x', tenant_id: tenantId, roles, iat: now(), exp: now() + 600 }, other),
  };
}

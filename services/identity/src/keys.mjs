import crypto from 'node:crypto';
import { SignJWT, exportJWK, importPKCS8 } from 'jose';

// Loads the RS256 key that signs product tokens and exposes its public half as a JWKS.
export async function loadSigningKey(config, log = console) {
  let privateKey;
  let publicKey;
  if (config.signingKeyPem) {
    const pem = config.signingKeyPem.includes('\\n') ? config.signingKeyPem.replace(/\\n/g, '\n') : config.signingKeyPem;
    privateKey = await importPKCS8(pem, 'RS256', { extractable: true });
    publicKey = crypto.createPublicKey(crypto.createPrivateKey(pem));
  } else {
    if (!config.devMode) throw new Error('IDENTITY_SIGNING_KEY_PEM_REQUIRED');
    log.warn?.('IDENTITY_SIGNING_KEY_PEM not set: using a temporary key (dev mode only). Tokens stop working after restart.');
    const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;
  }
  const jwk = await exportJWK(publicKey);
  const publicJwk = { ...jwk, kid: config.signingKeyId, alg: 'RS256', use: 'sig' };
  return {
    kid: config.signingKeyId,
    jwks: { keys: [publicJwk] },
    async sign(claims, { audience, expiresIn, issuer, subject }) {
      return new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: config.signingKeyId, typ: 'JWT' })
        .setIssuer(issuer)
        .setAudience(audience)
        .setSubject(subject)
        .setIssuedAt()
        .setJti(crypto.randomUUID())
        .setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
        .sign(privateKey);
    },
  };
}

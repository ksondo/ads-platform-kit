import { createRemoteJWKSet, jwtVerify } from 'jose';
import { pkceChallenge } from './security.mjs';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

// Google sign-in using the standard OpenID Connect code flow with PKCE and a nonce.
export function createGoogleClient(config, { fetchImpl = fetch, jwks } = {}) {
  const { clientId, clientSecret } = config.google;
  const redirectUri = `${config.publicUrl}/google/callback`;
  const keySet = jwks ?? createRemoteJWKSet(new URL(JWKS_URL), { timeoutDuration: 5000 });
  return {
    redirectUri,
    authorizationUrl({ state, nonce, codeVerifier, locale }) {
      const url = new URL(AUTH_URL);
      url.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        nonce,
        code_challenge: pkceChallenge(codeVerifier),
        code_challenge_method: 'S256',
        prompt: 'select_account',
        hl: locale,
      }).toString();
      return url.toString();
    },
    async exchange({ code, codeVerifier, nonce }) {
      const response = await fetchImpl(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: codeVerifier }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || typeof body.id_token !== 'string') throw new Error('GOOGLE_TOKEN_EXCHANGE_FAILED');
      const { payload } = await jwtVerify(body.id_token, keySet, { issuer: ISSUERS, audience: clientId, clockTolerance: 5 });
      if (payload.nonce !== nonce) throw new Error('GOOGLE_NONCE_MISMATCH');
      if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') throw new Error('GOOGLE_CLAIMS_INVALID');
      return {
        subject: payload.sub,
        email: payload.email.toLowerCase(),
        emailVerified: payload.email_verified === true,
        name: typeof payload.name === 'string' ? payload.name.slice(0, 120) : null,
      };
    },
  };
}

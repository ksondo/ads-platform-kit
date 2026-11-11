import { jwtVerify } from 'jose';
import { ACCESS_TOKEN_TYPE, authenticateClientSecret } from './admin.mjs';
import { HttpError } from './security.mjs';
import { AUDIENCE, parseScope } from './service-clients.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const oauthError = (code, status = 400) => new HttpError(status, code);

// Server-to-server tokens.
//
// 1. client_credentials (RFC 6749 §4.4), service clients only (oauth_clients.kind = 'service'):
//    a product SERVER authenticates with its own client secret (client_secret_basic, or client_secret_post)
//    and gets a short-lived token for one of its allowed audiences with some of its allowed service scopes.
//    The token is about the client, not a person: sub = client id, no tenant_id, no roles, no refresh token.
//
// 2. Delegated token exchange (RFC 8693), sign-in clients with a token_exchange allow list: the product
//    server presents a signed-in user's access token for ITS product (aud = its client id) with `audience`
//    and `scope`, and gets a short-lived token for that audience that keeps the user's sub and tenant_id
//    and names the product server in `act`. Only audiences and scopes listed for that client are allowed;
//    everything else is refused. (Without `audience`, the token endpoint keeps the admin API exchange.)
//
// Every issuance and every refusal after client authentication is written to platform.identity_audit.
export function createServiceTokens({ pool, config, keys, jwks, audit }) {
  const anyClient = async clientId => {
    if (typeof clientId !== 'string' || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(clientId)) return null;
    return (await pool.query("SELECT * FROM platform.oauth_clients WHERE client_id=$1 AND status='active'", [clientId])).rows[0] ?? null;
  };

  async function clientCredentials(req, body, ip) {
    const client = await authenticateClientSecret(req, body, anyClient);
    const denied = async (reason, error, metadata = {}) => {
      await audit('service_token', { outcome: 'denied', reason, ip, clientId: client.client_id, metadata });
      throw oauthError(error);
    };
    // RFC 6749 §5.2: an authenticated client not allowed to use this grant.
    if (client.kind !== 'service') return denied('NOT_A_SERVICE_CLIENT', 'unauthorized_client');
    const requested = parseScope(body.scope) ?? client.service_scopes;
    const badScope = requested.find(s => !client.service_scopes.includes(s));
    if (badScope !== undefined || !requested.length) return denied('SCOPE_NOT_ALLOWED', 'invalid_scope', { scope: requested.slice(0, 10).map(s => String(s).slice(0, 80)) });
    let audience = body.audience;
    if (audience === undefined || audience === '') {
      if (client.service_audiences.length !== 1) return denied('AUDIENCE_REQUIRED', 'invalid_request');
      [audience] = client.service_audiences;
    }
    if (typeof audience !== 'string' || !AUDIENCE.test(audience) || !client.service_audiences.includes(audience)) {
      return denied('AUDIENCE_NOT_ALLOWED', 'invalid_target', { audience: String(audience).slice(0, 80) });
    }
    const expiresIn = config.serviceTokenTtl;
    const scope = requested.join(' ');
    const token = await keys.sign(
      { token_use: 'service', client_id: client.client_id, scope },
      { audience, issuer: config.issuer, subject: client.client_id, expiresIn },
    );
    await audit('service_token', { outcome: 'allowed', reason: 'client_credentials', ip, clientId: client.client_id, metadata: { audience, scope: requested } });
    return { access_token: token, token_type: 'Bearer', expires_in: expiresIn, scope };
  }

  async function exchange(req, body, ip) {
    const client = await authenticateClientSecret(req, body, anyClient);
    const audience = String(body.audience);
    const denied = async (reason, error, userId = null, tenantId = null) => {
      await audit('token_exchange', { userId, tenantId, outcome: 'denied', reason, ip, clientId: client.client_id, metadata: { audience: audience.slice(0, 80) } });
      throw oauthError(error);
    };
    if (client.kind !== 'web') return denied('NOT_A_SIGN_IN_CLIENT', 'unauthorized_client');
    if (body.subject_token_type !== ACCESS_TOKEN_TYPE || typeof body.subject_token !== 'string') return denied('INVALID_REQUEST', 'invalid_request');
    if (body.requested_token_type !== undefined && body.requested_token_type !== ACCESS_TOKEN_TYPE) return denied('INVALID_REQUEST', 'invalid_request');
    if (body.actor_token !== undefined || body.resource !== undefined) return denied('INVALID_REQUEST', 'invalid_request');
    const rule = (client.token_exchange ?? []).find(e => e.audience === audience);
    if (!AUDIENCE.test(audience) || !rule) return denied('AUDIENCE_NOT_ALLOWED', 'invalid_target');
    const requested = parseScope(body.scope) ?? rule.scopes;
    if (!requested.length || requested.some(s => !rule.scopes.includes(s))) return denied('SCOPE_NOT_ALLOWED', 'invalid_scope');

    let claims;
    try {
      // The user's token for THIS product only (aud = its client id), signed by us with RS256.
      ({ payload: claims } = await jwtVerify(body.subject_token, jwks, { issuer: config.issuer, audience: client.client_id, algorithms: ['RS256'] }));
    } catch {
      return denied('SUBJECT_TOKEN_INVALID', 'invalid_grant');
    }
    // Only a person's sign-in token: never an admin, service or already-exchanged token.
    if (claims.token_use !== undefined || claims.act !== undefined || !UUID.test(String(claims.sub)) || !UUID.test(String(claims.tenant_id))) {
      return denied('SUBJECT_TOKEN_INVALID', 'invalid_grant');
    }
    const userId = claims.sub;
    const tenantId = claims.tenant_id;
    // Re-check, live, that the sign-in, the account and the workspace membership still hold.
    if (claims.sid && !(await pool.query('SELECT 1 FROM platform.sso_sessions WHERE id=$1 AND revoked_at IS NULL', [claims.sid])).rowCount) {
      return denied('SIGNED_OUT', 'invalid_grant', userId, tenantId);
    }
    const live = (await pool.query(`SELECT u.is_demo FROM platform.users u
      JOIN platform.memberships m ON m.user_id=u.id AND m.tenant_id=$2 AND m.status='active'
      JOIN platform.tenants t ON t.id=m.tenant_id AND t.status='active'
      JOIN platform.organizations o ON o.id=t.organization_id AND o.status='active'
      WHERE u.id=$1 AND u.status='active'`, [userId, tenantId])).rows[0];
    if (!live || (live.is_demo && !config.demo.enabled)) return denied('ACCESS_REMOVED', 'invalid_grant', userId, tenantId);

    const expiresIn = Math.max(1, Math.min(config.serviceTokenTtl, Number(claims.exp) - Math.floor(Date.now() / 1000)));
    const scope = requested.join(' ');
    const token = await keys.sign(
      { token_use: 'exchange', tenant_id: tenantId, client_id: client.client_id, scope, act: { sub: client.client_id }, sid: claims.sid ?? undefined, demo: claims.demo === true ? true : undefined },
      { audience, issuer: config.issuer, subject: userId, expiresIn },
    );
    await audit('token_exchange', { userId, tenantId, outcome: 'allowed', reason: 'token_exchange', ip, clientId: client.client_id, metadata: { audience, scope: requested } });
    return { access_token: token, issued_token_type: ACCESS_TOKEN_TYPE, token_type: 'Bearer', expires_in: expiresIn, scope };
  }

  return { clientCredentials, exchange };
}

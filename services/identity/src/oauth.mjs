import crypto from 'node:crypto';
import { withTransaction } from './db.mjs';
import { HttpError, fail, isPkceChallenge, isPkceVerifier, pkceChallenge, randomToken, safeEqual, seal, sha256, unseal } from './security.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Products sign users in with the OAuth 2.0 authorization code flow + PKCE (RFC 6749, RFC 7636).
// Tokens are JWTs with the claims every ADS product already checks: sub, tenant_id, roles.
export function createOAuth({ pool, config, keys, audit }) {
  async function getClient(clientId) {
    if (typeof clientId !== 'string' || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(clientId)) return null;
    return (await pool.query("SELECT * FROM platform.oauth_clients WHERE client_id=$1 AND status='active'", [clientId])).rows[0] ?? null;
  }

  async function createAuthRequest(query, locale) {
    const client = await getClient(query.client_id);
    if (!client) fail(400, 'UNKNOWN_CLIENT');
    const redirectUri = String(query.redirect_uri ?? '');
    if (!client.redirect_uris.includes(redirectUri)) fail(400, 'INVALID_REDIRECT_URI');
    const state = String(query.state ?? '');
    if (query.response_type !== 'code' || query.code_challenge_method !== 'S256' || !isPkceChallenge(query.code_challenge) || !state || state.length > 512) {
      fail(400, 'INVALID_REQUEST');
    }
    const nonce = query.nonce ? String(query.nonce).slice(0, 256) : null;
    const tenantHint = UUID.test(String(query.tenant_hint ?? '')) ? query.tenant_hint : null;
    const id = randomToken(18);
    await pool.query(`INSERT INTO platform.auth_requests(id,client_id,redirect_uri,state,code_challenge,nonce,tenant_hint,locale,expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now()+make_interval(secs => $9))`, [id, client.client_id, redirectUri, state, query.code_challenge, nonce, tenantHint, locale, config.authRequestTtl]);
    return { id, client, prompt: query.prompt };
  }

  async function loadAuthRequest(id) {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{10,64}$/.test(id)) return null;
    const row = (await pool.query('SELECT * FROM platform.auth_requests WHERE id=$1 AND expires_at>now()', [id])).rows[0];
    if (!row) return null;
    return { ...row, client: await getClient(row.client_id) };
  }

  async function workspacesFor(userId) {
    return (await pool.query(`SELECT m.tenant_id,m.role,t.name AS tenant_name,o.name AS organization_name,o.kind
      FROM platform.memberships m JOIN platform.tenants t ON t.id=m.tenant_id AND t.status='active'
      JOIN platform.organizations o ON o.id=t.organization_id AND o.status='active'
      WHERE m.user_id=$1 AND m.status='active' ORDER BY o.kind DESC, m.created_at`, [userId])).rows
      .map(r => ({ tenantId: r.tenant_id, role: r.role, tenantName: r.tenant_name, organizationName: r.organization_name, kind: r.kind }));
  }

  // Self-service roles (e.g. 'patient') apply only in the user's own personal workspace.
  // In an organisation workspace a user has only the roles an admin explicitly granted.
  async function rolesFor(userId, tenantId, client, db = pool) {
    const kind = (await db.query('SELECT o.kind FROM platform.tenants t JOIN platform.organizations o ON o.id=t.organization_id WHERE t.id=$1', [tenantId])).rows[0]?.kind;
    const granted = (await db.query('SELECT roles FROM platform.product_roles WHERE user_id=$1 AND tenant_id=$2 AND client_id=$3', [userId, tenantId, client.client_id])).rows[0]?.roles ?? [];
    return [...new Set([...granted, ...(kind === 'personal' ? client.self_service_roles : [])])];
  }

  async function ensurePersonalWorkspace(user) {
    return withTransaction(pool, async c => {
      // Serialise per user so two simultaneous sign-ins cannot create two personal workspaces.
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`personal:${user.id}`]);
      const existing = (await c.query(`SELECT m.tenant_id FROM platform.memberships m JOIN platform.tenants t ON t.id=m.tenant_id
        JOIN platform.organizations o ON o.id=t.organization_id WHERE m.user_id=$1 AND o.kind='personal' LIMIT 1`, [user.id])).rows[0];
      if (existing) return existing.tenant_id;
      const orgId = crypto.randomUUID();
      const tenantId = crypto.randomUUID();
      const label = `Personal · ${user.email}`;
      await c.query("INSERT INTO platform.organizations(id,name,slug,kind) VALUES ($1,$2,$3,'personal')", [orgId, label, `personal-${orgId}`]);
      await c.query('INSERT INTO platform.tenants(id,organization_id,name) VALUES ($1,$2,$3)', [tenantId, orgId, 'Personal']);
      await c.query("INSERT INTO platform.memberships(user_id,tenant_id,role,scopes) VALUES ($1,$2,'owner','{}')", [user.id, tenantId]);
      await audit('personal_workspace_created', { userId: user.id, tenantId, outcome: 'allowed' }, c);
      return tenantId;
    });
  }

  // Decides which workspace the token is for. Returns { tenantId } | { choose: [...] } | { noAccess: true }.
  async function resolveWorkspace(user, authRequest, chosenTenant) {
    const client = authRequest.client;
    const all = await workspacesFor(user.id);
    const usable = [];
    for (const w of all) {
      if ((await rolesFor(user.id, w.tenantId, client)).length) usable.push(w);
    }
    const pick = chosenTenant ?? authRequest.tenant_hint;
    if (pick) {
      const match = usable.find(w => w.tenantId === pick);
      if (match) return { tenantId: match.tenantId };
      if (chosenTenant) fail(403, 'TENANT_NOT_AUTHORIZED');
    }
    if (usable.length === 1) return { tenantId: usable[0].tenantId };
    if (usable.length > 1) return { choose: usable };
    if (client.allow_personal_workspace && client.self_service_roles.length) {
      return { tenantId: await ensurePersonalWorkspace(user) };
    }
    return { noAccess: true };
  }

  async function issueCode(authRequest, user, tenantId, ssoSessionId) {
    const code = randomToken(32);
    await pool.query(`INSERT INTO platform.auth_codes(code_hash,client_id,redirect_uri,code_challenge,nonce,user_id,tenant_id,sso_session_id,expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now()+make_interval(secs => $9))`,
    [sha256(code), authRequest.client_id, authRequest.redirect_uri, authRequest.code_challenge, authRequest.nonce, user.id, tenantId, ssoSessionId, config.authCodeTtl]);
    await pool.query('DELETE FROM platform.auth_requests WHERE id=$1', [authRequest.id]);
    await audit('authorize', { userId: user.id, tenantId, outcome: 'allowed', clientId: authRequest.client_id });
    const url = new URL(authRequest.redirect_uri);
    url.searchParams.set('code', code);
    url.searchParams.set('state', authRequest.state);
    url.searchParams.set('iss', config.issuer);
    return url.toString();
  }

  // A signed access token for this user, workspace and product, after re-checking that access still holds.
  async function accessTokenFor(client, userId, tenantId, ssoSessionId, db = pool) {
    const user = (await db.query('SELECT id,email,display_name,status,email_verified_at FROM platform.users WHERE id=$1', [userId])).rows[0];
    if (!user || user.status !== 'active') fail(400, 'invalid_grant');
    const member = (await db.query(`SELECT 1 FROM platform.memberships m JOIN platform.tenants t ON t.id=m.tenant_id AND t.status='active'
      WHERE m.user_id=$1 AND m.tenant_id=$2 AND m.status='active'`, [userId, tenantId])).rowCount;
    if (!member) fail(400, 'invalid_grant');
    const roles = await rolesFor(userId, tenantId, client, db);
    if (!roles.length) fail(400, 'invalid_grant');
    return keys.sign(
      { tenant_id: tenantId, roles, email: user.email, email_verified: Boolean(user.email_verified_at), name: user.display_name ?? undefined, client_id: client.client_id, sid: ssoSessionId ?? undefined },
      { audience: client.client_id, issuer: config.issuer, subject: userId, expiresIn: config.accessTokenTtl },
    );
  }
  const tokenResponse = (accessToken, refreshToken) => ({ access_token: accessToken, token_type: 'Bearer', expires_in: config.accessTokenTtl, refresh_token: refreshToken, scope: 'openid' });

  async function tokensFor(client, userId, tenantId, ssoSessionId, familyId = crypto.randomUUID(), db = pool) {
    const accessToken = await accessTokenFor(client, userId, tenantId, ssoSessionId, db);
    const refreshToken = randomToken(32);
    const id = crypto.randomUUID();
    await db.query(`INSERT INTO platform.refresh_tokens(id,family_id,token_hash,client_id,user_id,tenant_id,sso_session_id,expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,now()+make_interval(secs => $8))`,
    [id, familyId, sha256(refreshToken), client.client_id, userId, tenantId, ssoSessionId, config.refreshTokenTtl]);
    return { ...tokenResponse(accessToken, refreshToken), id };
  }

  async function exchangeCode({ code, code_verifier: verifier, client_id: clientId, redirect_uri: redirectUri }, ip) {
    const client = await getClient(clientId);
    if (!client) fail(400, 'invalid_client');
    if (typeof code !== 'string' || !isPkceVerifier(verifier)) fail(400, 'invalid_request');
    const result = await withTransaction(pool, async c => {
      const row = (await c.query('SELECT * FROM platform.auth_codes WHERE code_hash=$1 FOR UPDATE', [sha256(code)])).rows[0];
      if (!row || row.used_at || row.expires_at <= new Date() || row.client_id !== client.client_id || row.redirect_uri !== redirectUri
        || !safeEqual(pkceChallenge(verifier), row.code_challenge)) {
        return { denied: true, row };
      }
      await c.query('UPDATE platform.auth_codes SET used_at=now() WHERE code_hash=$1', [row.code_hash]);
      try {
        const { id: _id, ...tokens } = await tokensFor(client, row.user_id, row.tenant_id, row.sso_session_id, undefined, c);
        await audit('token', { userId: row.user_id, tenantId: row.tenant_id, outcome: 'allowed', reason: 'authorization_code', ip, clientId }, c);
        return { tokens };
      } catch (error) {
        if (!(error instanceof HttpError)) throw error;
        // e.g. membership removed meanwhile: keep the code burnt and record the denial below.
        return { denied: true, row, reason: 'access_removed' };
      }
    });
    if (result.tokens) return result.tokens;
    const { row } = result;
    if (result.reason) {
      await audit('token', { userId: row.user_id, tenantId: row.tenant_id, outcome: 'denied', reason: result.reason, ip, clientId });
      throw new HttpError(400, 'invalid_grant');
    }
    if (row?.used_at) {
      // A code used twice means it leaked: revoke everything issued from that sign-in (committed on its own).
      await pool.query('UPDATE platform.refresh_tokens SET revoked_at=now() WHERE sso_session_id IS NOT DISTINCT FROM $1 AND user_id=$2 AND client_id=$3 AND revoked_at IS NULL', [row.sso_session_id, row.user_id, row.client_id]);
    }
    await audit('token', { userId: row?.user_id ?? null, outcome: 'denied', reason: row?.used_at ? 'code_reuse_detected' : 'invalid_grant', ip, clientId });
    throw new HttpError(400, 'invalid_grant');
  }

  // Rotating refresh (RFC 6749 §10.4, OAuth 2.0 Security BCP §4.14). Each use returns a new
  // refresh token; presenting a rotated one again means it was copied, so the whole family (that
  // sign-in) is revoked. One exception keeps reloads from looking like theft: within a short grace
  // window, the IMMEDIATELY previous token of a family whose successor has not been used yet returns
  // that same successor (idempotent rotation). Older tokens, reuse after the window, or reuse once the
  // successor has itself been rotated still revoke the family.
  async function refresh({ refresh_token: token, client_id: clientId }, ip) {
    const client = await getClient(clientId);
    if (!client) fail(400, 'invalid_client');
    if (typeof token !== 'string' || !token) fail(400, 'invalid_request');
    const result = await withTransaction(pool, async c => {
      const row = (await c.query(`SELECT *, (rotated_at IS NOT NULL AND rotated_at > now() - make_interval(secs => $2)) AS in_grace
        FROM platform.refresh_tokens WHERE token_hash=$1 FOR UPDATE`, [sha256(token), config.refreshReuseGrace])).rows[0];
      if (!row || row.client_id !== client.client_id) return { denied: 'invalid_grant', row: null };
      if (row.revoked_at) return { denied: 'refresh_revoked', row };
      if (row.rotated_at) {
        const replay = row.in_grace && row.successor_id && row.successor_sealed ? await graceReplay(c, client, row, token) : null;
        if (replay?.tokens) {
          await audit('token', { userId: row.user_id, tenantId: row.tenant_id, outcome: 'allowed', reason: 'refresh_token_grace_replay', ip, clientId }, c);
          return replay;
        }
        if (replay?.denied) return replay;
        return { denied: 'refresh_reuse_detected', row };
      }
      if (row.expires_at <= new Date()) return { denied: 'refresh_expired', row: null };
      if (!(await ssoActive(c, row.sso_session_id))) return { denied: 'signed_out', row: null };
      const { id: successorId, ...tokens } = await tokensFor(client, row.user_id, row.tenant_id, row.sso_session_id, row.family_id, c);
      await c.query('UPDATE platform.refresh_tokens SET rotated_at=now(), successor_id=$2, successor_sealed=$3 WHERE id=$1',
        [row.id, successorId, config.refreshReuseGrace > 0 ? seal(tokens.refresh_token, token) : null]);
      await audit('token', { userId: row.user_id, tenantId: row.tenant_id, outcome: 'allowed', reason: 'refresh_token', ip, clientId }, c);
      return { tokens };
    });
    if (result.tokens) return result.tokens;
    if (result.row) {
      // Reuse of an old refresh token: assume theft and end that whole sign-in (committed on its own).
      await pool.query('UPDATE platform.refresh_tokens SET revoked_at=now() WHERE family_id=$1 AND revoked_at IS NULL', [result.row.family_id]);
    }
    await audit('token', { userId: result.row?.user_id ?? null, outcome: 'denied', reason: result.denied, ip, clientId });
    throw new HttpError(400, 'invalid_grant');
  }

  async function ssoActive(db, ssoSessionId) {
    if (!ssoSessionId) return true;
    return (await db.query('SELECT 1 FROM platform.sso_sessions WHERE id=$1 AND revoked_at IS NULL', [ssoSessionId])).rowCount > 0;
  }

  // The previous token came back within the grace window: hand out the same successor if it is
  // still the live head of the family. Returns { tokens } | { denied } | null (treat as reuse).
  async function graceReplay(c, client, row, token) {
    const next = (await c.query('SELECT * FROM platform.refresh_tokens WHERE id=$1 AND family_id=$2 FOR UPDATE', [row.successor_id, row.family_id])).rows[0];
    if (!next || next.rotated_at || next.revoked_at) return null;
    if (next.expires_at <= new Date()) return { denied: 'refresh_expired', row: null };
    const successor = unseal(row.successor_sealed, token);
    if (!successor || sha256(successor) !== next.token_hash) return null;
    if (!(await ssoActive(c, next.sso_session_id))) return { denied: 'signed_out', row: null };
    try {
      return { tokens: tokenResponse(await accessTokenFor(client, next.user_id, next.tenant_id, next.sso_session_id, c), successor) };
    } catch (error) {
      if (error instanceof HttpError) return { denied: 'access_removed', row: null };
      throw error;
    }
  }

  async function revokeRefresh(token) {
    if (typeof token !== 'string' || !token) return;
    const row = (await pool.query('SELECT family_id FROM platform.refresh_tokens WHERE token_hash=$1', [sha256(token)])).rows[0];
    if (row) await pool.query('UPDATE platform.refresh_tokens SET revoked_at=now() WHERE family_id=$1 AND revoked_at IS NULL', [row.family_id]);
  }

  return { getClient, createAuthRequest, loadAuthRequest, resolveWorkspace, issueCode, exchangeCode, refresh, revokeRefresh, workspacesFor, rolesFor };
}

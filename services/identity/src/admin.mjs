import crypto from 'node:crypto';
import { jwtVerify } from 'jose';
import { withTransaction } from './db.mjs';
import { renderEmail } from './mailer.mjs';
import { HttpError, fail, isEmail, normalizeEmail, randomToken, safeEqual, sha256 } from './security.mjs';

// Organisation administration (PLAT-ROLE-001) and invitations.
//
// Who may do what is decided HERE, from the database, on every call. Nothing a caller sends
// (token claims, form fields, a product server's say-so) is taken as proof of admin rights.
//
//   Organisation admin: active membership with role 'owner' or 'admin' in an active organisation
//     workspace (not a personal one). May manage every product's roles there, deactivate and
//     reactivate members, make members admins, and invite people.
//   Product admin: holds one of the product's `admin_roles` in that workspace. May list members,
//     grant/revoke that product's roles (except its admin roles) and invite for that product.
//
// Two ways in, both acting AS the signed-in admin:
//   1. The hosted admin page (/admin): the admin's own ADS session cookie + CSRF.
//   2. The admin API (/admin/v1/*) for product servers: the product server exchanges the admin's
//      access token for ITS product (aud = client_id) plus its own client secret for a short-lived
//      admin token (RFC 8693 token exchange). The admin token is limited to: that user, that
//      workspace (tenant_id of the user's token), that product, and the scopes both the client is
//      registered for and the user is entitled to. Client credentials alone grant nothing.
export const ADMIN_SCOPES = ['members:read', 'roles:write', 'members:write', 'invitations:write'];
export const TOKEN_EXCHANGE = 'urn:ietf:params:oauth:grant-type:token-exchange';
export const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLE = /^[a-z][a-z0-9_.:-]{0,79}$/;
const ORG_ADMIN_ROLES = ['owner', 'admin'];

export function createAdmin({ pool, config, keys, jwks, audit, mailer, log = console }) {
  // Audience of admin tokens: never accepted by products (their audience is their client id).
  const adminAudience = () => `${config.issuer}/admin`;

  const getClient = async clientId => {
    if (typeof clientId !== 'string' || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(clientId)) return null;
    return (await pool.query("SELECT * FROM platform.oauth_clients WHERE client_id=$1 AND status='active'", [clientId])).rows[0] ?? null;
  };

  // ---------- authority ----------
  // { orgAdmin, owner, productAdmin: Set<client_id>, workspace } or null when the user has none here.
  async function authority(userId, tenantId, db = pool) {
    if (!UUID.test(String(userId)) || !UUID.test(String(tenantId))) return null;
    const row = (await db.query(`SELECT m.role, t.name AS tenant_name, o.id AS organization_id, o.name AS organization_name
      FROM platform.memberships m JOIN platform.users u ON u.id=m.user_id AND u.status='active'
      JOIN platform.tenants t ON t.id=m.tenant_id AND t.status='active'
      JOIN platform.organizations o ON o.id=t.organization_id AND o.status='active' AND o.kind='organization'
      WHERE m.user_id=$1 AND m.tenant_id=$2 AND m.status='active'`, [userId, tenantId])).rows[0];
    if (!row) return null;
    const products = (await db.query(`SELECT p.client_id FROM platform.product_roles p JOIN platform.oauth_clients c ON c.client_id=p.client_id AND c.status='active'
      WHERE p.user_id=$1 AND p.tenant_id=$2 AND p.roles && c.admin_roles`, [userId, tenantId])).rows.map(r => r.client_id);
    const orgAdmin = ORG_ADMIN_ROLES.includes(row.role);
    if (!orgAdmin && !products.length) return null;
    return {
      orgAdmin, owner: row.role === 'owner', productAdmin: new Set(products),
      workspace: { tenantId, tenantName: row.tenant_name, organizationId: row.organization_id, organizationName: row.organization_name, role: row.role },
    };
  }
  const canManageProduct = (auth, clientId) => Boolean(auth && (auth.orgAdmin || auth.productAdmin.has(clientId)));
  // Scopes the user is entitled to for this product.
  const entitledScopes = (auth, clientId) => (!canManageProduct(auth, clientId) ? [] : auth.orgAdmin ? ADMIN_SCOPES : ADMIN_SCOPES.filter(s => s !== 'members:write'));

  // Workspaces where the user can administer something (for the hosted page).
  async function adminWorkspaces(userId) {
    const rows = (await pool.query(`SELECT m.tenant_id FROM platform.memberships m JOIN platform.tenants t ON t.id=m.tenant_id AND t.status='active'
      JOIN platform.organizations o ON o.id=t.organization_id AND o.status='active' AND o.kind='organization'
      WHERE m.user_id=$1 AND m.status='active' ORDER BY o.name`, [userId])).rows;
    const out = [];
    for (const r of rows) {
      const auth = await authority(userId, r.tenant_id);
      if (auth) out.push({ ...auth.workspace, orgAdmin: auth.orgAdmin, productAdmin: [...auth.productAdmin] });
    }
    return out;
  }

  // Re-checks, live, that ctx.actorId may use `permission` for ctx.clientId in ctx.tenantId.
  // ctx: { actorId, tenantId, clientId, scopes?: Set (API only), via: 'api'|'page', ip, callerClientId }
  async function authorize(ctx, permission, db = pool) {
    const deny = async reason => {
      await audit('admin_denied', { userId: ctx.actorId, tenantId: UUID.test(String(ctx.tenantId)) ? ctx.tenantId : null, outcome: 'denied', reason, ip: ctx.ip, clientId: ctx.callerClientId ?? null,
        metadata: { permission, product: ctx.clientId, via: ctx.via } });
      fail(403, 'FORBIDDEN');
    };
    if (ctx.scopes && !ctx.scopes.has(permission)) return deny('SCOPE_NOT_GRANTED');
    const client = await getClient(ctx.clientId);
    if (!client) fail(404, 'PRODUCT_NOT_FOUND');
    const auth = await authority(ctx.actorId, ctx.tenantId, db);
    if (!entitledScopes(auth, client.client_id).includes(permission)) return deny('NOT_AN_ADMIN');
    return { auth, client };
  }

  // `grant` is false for revocations: any held role may be taken away.
  const cleanRoles = (roles, client, auth, grant = true) => {
    const list = [...new Set((Array.isArray(roles) ? roles : String(roles ?? '').split(/[\s,]+/)).map(r => String(r).trim()).filter(Boolean))];
    if (!list.length || list.length > 20) fail(400, 'ROLES_INVALID');
    // ACC-03 (strict grants, always on in production): a product with no assignable_roles allows no grants.
    if (grant && config.strictRoleGrants && !client.assignable_roles.length) fail(403, 'NO_ASSIGNABLE_ROLES');
    for (const r of list) {
      if (!ROLE.test(r)) fail(400, 'ROLES_INVALID', { role: r });
      if (grant && client.assignable_roles.length && !client.assignable_roles.includes(r)) fail(400, 'ROLE_NOT_ASSIGNABLE', { role: r });
      if (client.admin_roles.includes(r) && !auth.orgAdmin) fail(403, 'FORBIDDEN');
    }
    return list;
  };

  // ---------- token exchange (product server -> short-lived admin token) ----------
  async function authenticateClient(req, body) {
    let id = body.client_id;
    let secret = body.client_secret;
    const header = String(req.headers.authorization ?? '');
    if (header.startsWith('Basic ')) {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      const i = decoded.indexOf(':');
      if (i > 0) { id = decodeURIComponent(decoded.slice(0, i)); secret = decodeURIComponent(decoded.slice(i + 1)); }
    }
    const client = await getClient(id);
    // Always hash, so timing does not reveal which client ids exist.
    const presented = sha256(String(secret ?? ''));
    if (!client || !client.client_secret_hash || typeof secret !== 'string' || !safeEqual(presented, client.client_secret_hash)) fail(401, 'invalid_client');
    return client;
  }

  async function exchange(req, body, ip) {
    const client = await authenticateClient(req, body);
    const denied = async (reason, userId = null, tenantId = null) => {
      await audit('admin_token', { userId, tenantId, outcome: 'denied', reason, ip, clientId: client.client_id });
      fail(400, reason === 'NOT_AN_ADMIN' || reason === 'SCOPE_NOT_ALLOWED' ? 'access_denied' : 'invalid_grant');
    };
    if (body.subject_token_type !== ACCESS_TOKEN_TYPE || typeof body.subject_token !== 'string') fail(400, 'invalid_request');
    let claims;
    try {
      ({ payload: claims } = await jwtVerify(body.subject_token, jwks, { issuer: config.issuer, audience: client.client_id, algorithms: ['RS256'] }));
    } catch {
      return denied('SUBJECT_TOKEN_INVALID');
    }
    if (claims.token_use === 'admin') return denied('SUBJECT_TOKEN_INVALID');
    if (claims.sid) {
      const live = (await pool.query('SELECT 1 FROM platform.sso_sessions WHERE id=$1 AND revoked_at IS NULL', [claims.sid])).rowCount;
      if (!live) return denied('SIGNED_OUT', claims.sub);
    }
    const auth = await authority(claims.sub, claims.tenant_id);
    const requested = body.scope ? String(body.scope).split(/\s+/).filter(Boolean) : client.admin_scopes;
    if (!requested.length || requested.some(s => !ADMIN_SCOPES.includes(s) || !client.admin_scopes.includes(s))) return denied('SCOPE_NOT_ALLOWED', claims.sub, claims.tenant_id);
    const entitled = entitledScopes(auth, client.client_id);
    const scopes = requested.filter(s => entitled.includes(s));
    if (!scopes.length) return denied('NOT_AN_ADMIN', claims.sub, UUID.test(String(claims.tenant_id)) ? claims.tenant_id : null);
    const expiresIn = Math.max(1, Math.min(config.adminTokenTtl, Number(claims.exp) - Math.floor(Date.now() / 1000)));
    const token = await keys.sign(
      { token_use: 'admin', tenant_id: claims.tenant_id, client_id: client.client_id, scope: scopes.join(' '), act: { sub: `client:${client.client_id}` }, sid: claims.sid ?? undefined },
      { audience: adminAudience(), issuer: config.issuer, subject: claims.sub, expiresIn },
    );
    await audit('admin_token', { userId: claims.sub, tenantId: claims.tenant_id, outcome: 'allowed', reason: 'token_exchange', ip, clientId: client.client_id, metadata: { scope: scopes } });
    return { access_token: token, issued_token_type: ACCESS_TOKEN_TYPE, token_type: 'Bearer', expires_in: expiresIn, scope: scopes.join(' ') };
  }

  // Admin API caller context from an admin token.
  async function apiContext(req, ip) {
    const raw = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
    let claims;
    try {
      ({ payload: claims } = await jwtVerify(raw, jwks, { issuer: config.issuer, audience: adminAudience(), algorithms: ['RS256'] }));
    } catch {
      fail(401, 'UNAUTHENTICATED');
    }
    if (claims.token_use !== 'admin' || !UUID.test(String(claims.tenant_id)) || typeof claims.client_id !== 'string') fail(401, 'UNAUTHENTICATED');
    if (claims.sid && !(await pool.query('SELECT 1 FROM platform.sso_sessions WHERE id=$1 AND revoked_at IS NULL', [claims.sid])).rowCount) fail(401, 'UNAUTHENTICATED');
    return { actorId: claims.sub, tenantId: claims.tenant_id, clientId: claims.client_id, scopes: new Set(String(claims.scope ?? '').split(' ')), via: 'api', ip, callerClientId: claims.client_id };
  }

  const auditAdmin = (event, ctx, extra, db) => audit(event, {
    userId: ctx.actorId, tenantId: ctx.tenantId, outcome: 'allowed', reason: ctx.via, ip: ctx.ip, clientId: ctx.callerClientId ?? null,
    metadata: { product: ctx.clientId, ...extra },
  }, db);

  // ---------- members and roles ----------
  async function listMembers(ctx) {
    const { client } = await authorize(ctx, 'members:read');
    const rows = (await pool.query(`SELECT m.user_id, u.email, u.display_name, u.status AS account_status, m.role, m.status, m.created_at,
        coalesce(p.roles, '{}') AS roles
      FROM platform.memberships m JOIN platform.users u ON u.id=m.user_id
      LEFT JOIN platform.product_roles p ON p.user_id=m.user_id AND p.tenant_id=m.tenant_id AND p.client_id=$2
      WHERE m.tenant_id=$1 ORDER BY lower(u.email)`, [ctx.tenantId, client.client_id])).rows;
    return rows.map(r => ({
      userId: r.user_id, email: r.email, name: r.display_name, orgRole: r.role, status: r.status === 'active' && r.account_status === 'active' ? 'active' : 'deactivated',
      roles: r.roles, joinedAt: r.created_at,
    }));
  }

  async function memberRow(db, tenantId, userId, lock = false) {
    if (!UUID.test(String(userId))) fail(404, 'MEMBER_NOT_FOUND');
    return (await db.query(`SELECT m.user_id, m.role, m.status FROM platform.memberships m WHERE m.tenant_id=$1 AND m.user_id=$2${lock ? ' FOR UPDATE' : ''}`, [tenantId, userId])).rows[0] ?? null;
  }
  const currentRoles = async (db, tenantId, userId, clientId) => (await db.query('SELECT roles FROM platform.product_roles WHERE user_id=$1 AND tenant_id=$2 AND client_id=$3 FOR UPDATE', [userId, tenantId, clientId])).rows[0]?.roles ?? [];

  // Grants roles for ctx.clientId. A user who is not a member yet (for example an access request the
  // product received from that signed-in user) becomes a member; use invitations to add by email.
  async function grantRoles(ctx, userId, roles) {
    return withTransaction(pool, async c => {
      const { auth, client } = await authorize(ctx, 'roles:write', c);
      const list = cleanRoles(roles, client, auth);
      const user = UUID.test(String(userId)) ? (await c.query('SELECT id, status FROM platform.users WHERE id=$1', [userId])).rows[0] : null;
      if (!user || user.status !== 'active') fail(404, 'USER_NOT_FOUND');
      const member = await memberRow(c, ctx.tenantId, userId, true);
      if (member?.status === 'disabled') fail(409, 'MEMBER_DEACTIVATED');
      if (!member) await c.query("INSERT INTO platform.memberships(user_id,tenant_id,role,scopes) VALUES ($1,$2,'member','{}')", [userId, ctx.tenantId]);
      const before = await currentRoles(c, ctx.tenantId, userId, client.client_id);
      const after = [...new Set([...before, ...list])];
      await c.query(`INSERT INTO platform.product_roles(user_id,tenant_id,client_id,roles,granted_by) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (user_id,tenant_id,client_id) DO UPDATE SET roles=EXCLUDED.roles, granted_by=EXCLUDED.granted_by, updated_at=now()`, [userId, ctx.tenantId, client.client_id, after, ctx.actorId]);
      await auditAdmin('admin_roles_granted', ctx, { target_user_id: userId, granted: list, before, after, member_added: !member }, c);
      return { userId, product: client.client_id, roles: after };
    });
  }

  async function revokeRoles(ctx, userId, roles) {
    return withTransaction(pool, async c => {
      const { auth, client } = await authorize(ctx, 'roles:write', c);
      const list = cleanRoles(roles, client, auth, false);
      const member = await memberRow(c, ctx.tenantId, userId, true);
      if (!member) fail(404, 'MEMBER_NOT_FOUND');
      const before = await currentRoles(c, ctx.tenantId, userId, client.client_id);
      const after = before.filter(r => !list.includes(r));
      await c.query('UPDATE platform.product_roles SET roles=$4, granted_by=$5, updated_at=now() WHERE user_id=$1 AND tenant_id=$2 AND client_id=$3', [userId, ctx.tenantId, client.client_id, after, ctx.actorId]);
      // Tokens issued with the old roles stop being renewed with them: end this product's sign-ins in this workspace.
      if (after.length < before.length) {
        await c.query('UPDATE platform.refresh_tokens SET revoked_at=now() WHERE user_id=$1 AND tenant_id=$2 AND client_id=$3 AND revoked_at IS NULL', [userId, ctx.tenantId, client.client_id]);
      }
      await auditAdmin('admin_roles_revoked', ctx, { target_user_id: userId, revoked: list, before, after }, c);
      return { userId, product: client.client_id, roles: after };
    });
  }

  // Deactivation is per organisation: the person keeps their ADS account (other organisations,
  // personal workspace) but loses this workspace at once. Their sign-ins for it cannot be renewed,
  // and access tokens already issued expire within the access token lifetime (15 minutes).
  async function setActive(ctx, userId, active) {
    return withTransaction(pool, async c => {
      const { auth } = await authorize(ctx, 'members:write', c);
      if (userId === ctx.actorId) fail(409, 'CANNOT_CHANGE_YOURSELF');
      const member = await memberRow(c, ctx.tenantId, userId, true);
      if (!member) fail(404, 'MEMBER_NOT_FOUND');
      if (member.role === 'owner') fail(403, 'FORBIDDEN');
      if (member.role === 'admin' && !auth.owner) fail(403, 'FORBIDDEN');
      await c.query('UPDATE platform.memberships SET status=$3 WHERE user_id=$1 AND tenant_id=$2', [userId, ctx.tenantId, active ? 'active' : 'disabled']);
      let revoked = 0;
      if (!active) {
        revoked = (await c.query('UPDATE platform.refresh_tokens SET revoked_at=now() WHERE user_id=$1 AND tenant_id=$2 AND revoked_at IS NULL', [userId, ctx.tenantId])).rowCount;
      }
      await auditAdmin(active ? 'admin_member_reactivated' : 'admin_member_deactivated', ctx, { target_user_id: userId, refresh_tokens_revoked: revoked }, c);
      return { userId, status: active ? 'active' : 'deactivated' };
    });
  }

  // Makes a member an organisation admin, or back to member. Owners only change admins.
  async function setOrgAdmin(ctx, userId, admin) {
    return withTransaction(pool, async c => {
      const { auth } = await authorize(ctx, 'members:write', c);
      if (userId === ctx.actorId) fail(409, 'CANNOT_CHANGE_YOURSELF');
      const member = await memberRow(c, ctx.tenantId, userId, true);
      if (!member) fail(404, 'MEMBER_NOT_FOUND');
      if (member.role === 'owner' || (!admin && member.role === 'admin' && !auth.owner)) fail(403, 'FORBIDDEN');
      if (member.status !== 'active') fail(409, 'MEMBER_DEACTIVATED');
      const role = admin ? 'admin' : 'member';
      await c.query('UPDATE platform.memberships SET role=$3 WHERE user_id=$1 AND tenant_id=$2', [userId, ctx.tenantId, role]);
      await auditAdmin('admin_org_role_changed', ctx, { target_user_id: userId, before: member.role, after: role }, c);
      return { userId, orgRole: role };
    });
  }

  // ---------- invitations ----------
  const invitationView = r => ({
    id: r.id, email: r.email, phone: r.phone, product: r.client_id, roles: r.roles, orgAdmin: r.org_admin, locale: r.locale,
    status: r.accepted_at ? 'accepted' : r.revoked_at ? 'revoked' : new Date(r.expires_at) <= new Date() ? 'expired' : 'pending',
    expiresAt: r.expires_at, createdAt: r.created_at, invitedBy: r.invited_by, acceptedBy: r.accepted_by, acceptedAt: r.accepted_at,
  });

  function sendLater(fn, what) {
    setImmediate(() => { Promise.resolve().then(fn).catch(error => log.error?.(`${what} failed: ${error.message}`)); });
  }

  async function createInvitation(ctx, { email, roles, phone, locale, orgAdmin = false, ttlSeconds }) {
    const normalized = normalizeEmail(email);
    if (!isEmail(normalized)) fail(400, 'EMAIL_INVALID');
    const tel = phone === undefined || phone === null || phone === '' ? null : String(phone).replace(/[\s-]/g, '');
    if (tel !== null && !/^\+?\d{8,15}$/.test(tel)) fail(400, 'PHONE_INVALID');
    const ttl = Math.round(Number(ttlSeconds ?? config.invitationTtl));
    if (!Number.isFinite(ttl) || ttl < 300 || ttl > 30 * 86400) fail(400, 'TTL_INVALID');
    const token = randomToken(32);
    const result = await withTransaction(pool, async c => {
      const { auth, client } = await authorize(ctx, 'invitations:write', c);
      const list = cleanRoles(roles, client, auth);
      if (orgAdmin === true && !auth.orgAdmin) fail(403, 'FORBIDDEN');
      // A new invitation for the same person and product replaces any pending one (resend).
      await c.query(`UPDATE platform.invitations SET revoked_at=now(), revoked_by=$4 WHERE tenant_id=$1 AND client_id=$2 AND email=$3
        AND accepted_at IS NULL AND revoked_at IS NULL`, [ctx.tenantId, client.client_id, normalized, ctx.actorId]);
      const id = crypto.randomUUID();
      const row = (await c.query(`INSERT INTO platform.invitations(id,tenant_id,client_id,email,phone,roles,org_admin,locale,token_hash,invited_by,expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()+make_interval(secs => $11)) RETURNING *`,
      [id, ctx.tenantId, client.client_id, normalized, tel, list, orgAdmin === true, locale === 'fr' ? 'fr' : 'en', sha256(token), ctx.actorId, ttl])).rows[0];
      await auditAdmin('admin_invitation_created', ctx, { invitation_id: id, email: normalized, roles: list, org_admin: orgAdmin === true, sms: Boolean(tel) }, c);
      const inviter = (await c.query('SELECT email, display_name FROM platform.users WHERE id=$1', [ctx.actorId])).rows[0];
      return { row, client, workspace: auth.workspace, inviter };
    });
    const link = `${config.publicUrl}/invite?token=${token}`;
    const days = Math.max(1, Math.round(ttl / 86400));
    const message = renderEmail('invitation', {
      link, days, product: result.client.display_name, organization: result.workspace.organizationName,
      inviter: result.inviter?.display_name || result.inviter?.email, roles: result.row.roles,
    });
    sendLater(() => mailer.send({ to: normalized, ...message }), 'invitation email');
    if (tel) {
      // SMS hook (PLAT-NOT-001 later). Today: the shared mocks' SMS capture in tests, or nothing.
      if (config.smsUrl) {
        const text = `${result.workspace.organizationName} invited you to ${result.client.display_name}. Open the link sent to ${normalized} / Invitation envoyée à ${normalized}: ${link}`;
        sendLater(async () => {
          const res = await fetch(config.smsUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: tel, text, from: 'ADS' }), signal: AbortSignal.timeout(5000) });
          if (!res.ok) throw new Error(`sms hook http ${res.status}`);
        }, 'invitation sms');
      } else {
        log.info?.('invitation sms skipped: IDENTITY_SMS_URL not set');
      }
    }
    return invitationView(result.row);
  }

  async function listInvitations(ctx) {
    const { client } = await authorize(ctx, 'members:read');
    const rows = (await pool.query('SELECT * FROM platform.invitations WHERE tenant_id=$1 AND client_id=$2 ORDER BY created_at DESC LIMIT 200', [ctx.tenantId, client.client_id])).rows;
    return rows.map(invitationView);
  }

  async function revokeInvitation(ctx, id) {
    return withTransaction(pool, async c => {
      const { client } = await authorize(ctx, 'invitations:write', c);
      if (!UUID.test(String(id))) fail(404, 'INVITATION_NOT_FOUND');
      const row = (await c.query('SELECT * FROM platform.invitations WHERE id=$1 AND tenant_id=$2 AND client_id=$3 FOR UPDATE', [id, ctx.tenantId, client.client_id])).rows[0];
      if (!row) fail(404, 'INVITATION_NOT_FOUND');
      if (row.accepted_at) fail(409, 'INVITATION_ALREADY_ACCEPTED');
      const updated = row.revoked_at ? row : (await c.query('UPDATE platform.invitations SET revoked_at=now(), revoked_by=$2 WHERE id=$1 RETURNING *', [id, ctx.actorId])).rows[0];
      if (!row.revoked_at) await auditAdmin('admin_invitation_revoked', ctx, { invitation_id: id, email: row.email }, c);
      return invitationView(updated);
    });
  }

  // For the hosted invitation page: the pending invitation behind a link, with display names.
  async function findInvitation(token, db = pool, lock = false) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
    const row = (await db.query(`SELECT i.*, c.display_name AS product_name, c.redirect_uris, o.name AS organization_name, t.status AS tenant_status, o.status AS org_status, c.status AS client_status
      FROM platform.invitations i JOIN platform.oauth_clients c ON c.client_id=i.client_id
      JOIN platform.tenants t ON t.id=i.tenant_id JOIN platform.organizations o ON o.id=t.organization_id
      WHERE i.token_hash=$1${lock ? ' FOR UPDATE OF i' : ''}`, [sha256(token)])).rows[0];
    if (!row || row.accepted_at || row.revoked_at || new Date(row.expires_at) <= new Date()) return null;
    if (row.tenant_status !== 'active' || row.org_status !== 'active' || row.client_status !== 'active') return null;
    return row;
  }

  // Accepting needs the ADS account whose email the invitation was sent to: the link proves the
  // mailbox, the signed-in session proves the account. A forwarded link cannot be used by someone else.
  async function acceptInvitation(token, user, ip) {
    const result = await withTransaction(pool, async c => {
      const inv = await findInvitation(token, c, true);
      if (!inv) fail(400, 'INVITATION_INVALID');
      const account = (await c.query('SELECT id, email, status FROM platform.users WHERE id=$1 FOR UPDATE', [user.id])).rows[0];
      if (!account || account.status !== 'active') fail(403, 'ACCOUNT_DISABLED');
      if (normalizeEmail(account.email) !== inv.email) return { mismatch: { userId: account.id, tenantId: inv.tenant_id, clientId: inv.client_id, invitationId: inv.id } };
      const existing = await memberRow(c, inv.tenant_id, account.id, true);
      const orgRole = existing && ORG_ADMIN_ROLES.includes(existing.role) ? existing.role : inv.org_admin ? 'admin' : 'member';
      await c.query(`INSERT INTO platform.memberships(user_id,tenant_id,role,scopes) VALUES ($1,$2,$3,'{}')
        ON CONFLICT (user_id,tenant_id) DO UPDATE SET status='active', role=$3`, [account.id, inv.tenant_id, orgRole]);
      const before = await currentRoles(c, inv.tenant_id, account.id, inv.client_id);
      const after = [...new Set([...before, ...inv.roles])];
      await c.query(`INSERT INTO platform.product_roles(user_id,tenant_id,client_id,roles,granted_by) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (user_id,tenant_id,client_id) DO UPDATE SET roles=EXCLUDED.roles, granted_by=EXCLUDED.granted_by, updated_at=now()`, [account.id, inv.tenant_id, inv.client_id, after, inv.invited_by]);
      await c.query('UPDATE platform.users SET email_verified_at=coalesce(email_verified_at, now()) WHERE id=$1', [account.id]);
      await c.query('UPDATE platform.invitations SET accepted_at=now(), accepted_by=$2 WHERE id=$1', [inv.id, account.id]);
      await audit('invitation_accepted', { userId: account.id, tenantId: inv.tenant_id, outcome: 'allowed', ip, clientId: inv.client_id,
        metadata: { invitation_id: inv.id, invited_by: inv.invited_by, roles: inv.roles, before, after, org_role: orgRole, reactivated: existing?.status === 'disabled' } }, c);
      return { tenantId: inv.tenant_id, product: inv.client_id, productName: inv.product_name, organizationName: inv.organization_name, roles: after, productUrl: inv.redirect_uris[0] ?? null };
    });
    if (result.mismatch) {
      const m = result.mismatch;
      await audit('invitation_accept', { userId: m.userId, tenantId: m.tenantId, outcome: 'denied', reason: 'EMAIL_MISMATCH', ip, clientId: m.clientId, metadata: { invitation_id: m.invitationId } });
      fail(403, 'INVITATION_EMAIL_MISMATCH');
    }
    return result;
  }

  return {
    authority, adminWorkspaces, exchange, apiContext, listMembers, grantRoles, revokeRoles, setActive, setOrgAdmin,
    createInvitation, listInvitations, revokeInvitation, findInvitation, acceptInvitation, getClient, entitledScopes, HttpError,
  };
}

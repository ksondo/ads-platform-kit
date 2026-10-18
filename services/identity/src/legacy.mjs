import crypto from 'node:crypto';
import { withTransaction } from './db.mjs';
import { fail, randomToken, sha256 } from './security.mjs';

// The JSON API Software Factory already calls (/v1/identity/* and /internal/*), moved from
// ksondo/RAG-Intelligence-AI-Platform services/identity-service with the same request and
// response shapes. Changes: new accounts must confirm their email first (EMAIL_NOT_VERIFIED),
// and auto-created personal workspaces are ignored here.
const defaultScopes = ['developer:use', 'rag:query', 'capability:resolve', 'repository:analyse', 'extensions:design', 'extensions:compose', 'extensions:generate', 'extensions:install', 'extensions:publish'];

export function createLegacyApi({ pool, config, accounts, audit }) {
  const bearer = req => { const v = String(req.headers.authorization ?? ''); return v.startsWith('Bearer ') ? v.slice(7) : ''; };

  async function sessionUser(req, client = pool) {
    const token = bearer(req);
    if (!token) fail(401, 'UNAUTHENTICATED');
    const row = (await client.query(`SELECT s.id AS session_id,s.user_id,u.email,u.status,s.expires_at
      FROM platform.sessions s JOIN platform.users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()`, [sha256(token)])).rows[0];
    if (!row || row.status !== 'active') fail(401, 'UNAUTHENTICATED');
    return row;
  }

  async function memberships(userId, client = pool) {
    const result = await client.query(`SELECT m.tenant_id,m.role,m.scopes,m.quota_per_minute,t.name AS tenant_name,o.id AS organization_id,o.name AS organization_name
      FROM platform.memberships m
      JOIN platform.tenants t ON t.id=m.tenant_id AND t.status='active'
      JOIN platform.organizations o ON o.id=t.organization_id AND o.status='active' AND o.kind='organization'
      WHERE m.user_id=$1 AND m.status='active' ORDER BY m.created_at`, [userId]);
    return result.rows.map(row => ({ tenantId: row.tenant_id, tenantName: row.tenant_name, organizationId: row.organization_id, organizationName: row.organization_name, role: row.role, scopes: row.scopes ?? [], quotaPerMinute: Number(row.quota_per_minute) }));
  }

  async function register(body, ip) {
    const { user } = await accounts.register({ email: body.email, password: body.password, locale: body.locale === 'fr' ? 'fr' : 'en', ip, revealExisting: true });
    return { userId: user.id, email: user.email, status: user.status };
  }

  async function login(body, ip) {
    const user = await accounts.authenticate({ email: body.email, password: body.password, ip });
    const token = randomToken(32);
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + config.legacySessionTtl * 1000);
    await pool.query('INSERT INTO platform.sessions(id,user_id,token_hash,expires_at) VALUES ($1,$2,$3,$4)', [sessionId, user.id, sha256(token), expiresAt]);
    await audit('login', { userId: user.id, outcome: 'allowed', reason: 'legacy_api', ip });
    return { accessToken: token, tokenType: 'Bearer', expiresAt: expiresAt.toISOString(), user: { id: user.id, email: user.email }, memberships: await memberships(user.id) };
  }

  async function onboard(req, body) {
    const organizationName = String(body.organizationName ?? '').trim();
    const tenantName = String(body.tenantName ?? organizationName).trim();
    const projectName = String(body.projectName ?? 'Primary Project').trim();
    if (organizationName.length < 2 || tenantName.length < 2 || projectName.length < 2 || organizationName.length > 120) fail(400, 'ONBOARDING_VALIDATION_FAILED');
    return withTransaction(pool, async client => {
      const user = await sessionUser(req, client);
      if ((await memberships(user.user_id, client)).length) fail(409, 'WORKSPACE_ALREADY_ONBOARDED');
      const organizationId = crypto.randomUUID();
      const tenantId = crypto.randomUUID();
      const projectId = `prj_${crypto.randomBytes(10).toString('hex')}`;
      const slugBase = organizationName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'organization';
      const slug = `${slugBase}-${crypto.randomBytes(3).toString('hex')}`;
      await client.query('INSERT INTO platform.organizations(id,name,slug) VALUES ($1,$2,$3)', [organizationId, organizationName, slug]);
      await client.query('INSERT INTO platform.tenants(id,organization_id,name) VALUES ($1,$2,$3)', [tenantId, organizationId, tenantName]);
      await client.query('INSERT INTO platform.projects(id,tenant_id,name) VALUES ($1,$2,$3)', [projectId, tenantId, projectName]);
      await client.query("INSERT INTO platform.memberships(user_id,tenant_id,role,scopes,quota_per_minute) VALUES ($1,$2,'owner',$3,60)", [user.user_id, tenantId, defaultScopes]);
      await audit('workspace_onboard', { userId: user.user_id, tenantId, projectId, outcome: 'allowed' }, client);
      return { organization: { id: organizationId, name: organizationName, slug }, tenant: { id: tenantId, name: tenantName }, project: { id: projectId, name: projectName }, role: 'owner', scopes: defaultScopes };
    });
  }

  async function sessionContext(req) {
    const user = await sessionUser(req);
    const available = await memberships(user.user_id);
    const requestedTenant = String(req.headers['x-tenant-id'] ?? '').trim();
    const membership = requestedTenant ? available.find(item => item.tenantId === requestedTenant) : available[0];
    if (requestedTenant && !membership) {
      await audit('session_context', { userId: user.user_id, tenantId: /^[0-9a-f-]{36}$/i.test(requestedTenant) ? requestedTenant : null, outcome: 'denied', reason: 'TENANT_NOT_AUTHORIZED' });
      fail(403, 'TENANT_NOT_AUTHORIZED');
    }
    await pool.query('UPDATE platform.sessions SET last_seen_at=now() WHERE id=$1', [user.session_id]);
    return { user: { id: user.user_id, email: user.email }, session: { expiresAt: user.expires_at }, membership: membership ?? null, memberships: available };
  }

  async function verify(req) {
    const projectId = String(req.headers['x-project-id'] ?? '');
    if (!projectId) fail(401, 'UNAUTHENTICATED');
    const user = await sessionUser(req);
    const access = await pool.query(`SELECT m.tenant_id,m.scopes,m.quota_per_minute FROM platform.memberships m JOIN platform.projects p ON p.tenant_id=m.tenant_id
      WHERE m.user_id=$1 AND m.status='active' AND p.id=$2 AND p.status='active'`, [user.user_id, projectId]);
    if (!access.rowCount) {
      await audit('verify', { userId: user.user_id, projectId, outcome: 'denied', reason: 'PROJECT_NOT_AUTHORIZED' });
      fail(403, 'PROJECT_NOT_AUTHORIZED');
    }
    const tenantIds = [...new Set(access.rows.map(row => row.tenant_id))];
    const scopes = [...new Set(access.rows.flatMap(row => row.scopes ?? []))];
    const quotaPerMinute = Math.min(...access.rows.map(row => Number(row.quota_per_minute) || 60));
    await pool.query('UPDATE platform.sessions SET last_seen_at=now() WHERE id=$1', [user.session_id]);
    await audit('verify', { userId: user.user_id, projectId, outcome: 'allowed' });
    return { principalId: `user:${user.user_id}`, projectId, tenantIds, scopes, quotaPerMinute };
  }

  async function revoke(req) {
    const token = bearer(req);
    if (!token) fail(401, 'UNAUTHENTICATED');
    const result = await pool.query('UPDATE platform.sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL RETURNING user_id', [sha256(token)]);
    if (result.rowCount) await audit('logout', { userId: result.rows[0].user_id, outcome: 'allowed' });
    return { revoked: true };
  }

  return { register, login, onboard, sessionContext, verify, revoke };
}

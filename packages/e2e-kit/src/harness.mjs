import crypto from 'node:crypto';
import path from 'node:path';
import { SignJWT, importPKCS8 } from 'jose';
import pg from 'pg';
import { KIT_ROOT } from './identity-runtime.mjs';
import { createMocksClient } from './mocks-client.mjs';

// Test-data helpers that act on the identity database the way an operator would (the same SQL as
// services/identity/src/cli.mjs), plus token minting with the running service's signing key.
// They exist for TEST SETUP ONLY. Product code must never call them or accept anything they make
// except through its normal token verification (issuer, audience, JWKS).
const { hashPassword } = await import(path.join(KIT_ROOT, 'services/identity/src/security.mjs'));

const rand = (n = 6) => crypto.randomBytes(n).toString('hex');
export const uniqueEmail = (prefix = 'e2e') => `${prefix}-${Date.now().toString(36)}-${rand(4)}@example.test`;
export const uniquePassword = () => `E2e-${rand(6)}-Pass!`;

export function createHarness({ url, issuer, databaseUrl, signingKeyPem, kid = 'ads-e2e', mocksUrl = null, webhookSecret = null, outbox = null, stop = null }) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 3 });
  const created = { users: new Set(), organizations: new Set(), tenants: new Set() };
  let privateKey;
  const key = async () => (privateKey ??= await importPKCS8(signingKeyPem, 'RS256'));
  const mocks = mocksUrl ? createMocksClient(mocksUrl, { webhookSecret }) : null;

  const userIdOf = async user => {
    if (user && typeof user === 'object' && user.id) return user.id;
    const value = String(user ?? '');
    if (/^[0-9a-f-]{36}$/i.test(value)) return value;
    const row = (await pool.query('SELECT id FROM platform.users WHERE email=$1', [value.toLowerCase()])).rows[0];
    if (!row) throw new Error(`e2e-kit: no user ${value}`);
    return row.id;
  };
  const tenantIdOf = org => (org && typeof org === 'object' ? org.tenantId : String(org ?? ''));

  // CORS on /token is allowed for origins of registered redirect URIs, cached for up to 60 s by
  // the identity service. Wait until the origin is accepted so the first sign-in cannot race it.
  async function waitForCors(origin, timeoutMs = 65_000) {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const res = await fetch(`${url}/token`, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST' } });
      if (res.headers.get('access-control-allow-origin') === origin) return;
      if (Date.now() > end) throw new Error(`e2e-kit: identity does not accept CORS from ${origin}`);
      await new Promise(r => setTimeout(r, 500));
    }
  }

  const harness = {
    url, issuer, databaseUrl, jwksUrl: `${url}/.well-known/jwks.json`, mocks, mocksUrl, webhookSecret, outbox, pool,

    // Registers (or updates) a product as a sign-in client. origins: extra browser origins allowed to call /token.
    async registerClient({ clientId, redirectUris, origins = [], postLogoutRedirectUris, name, selfRoles = [], personal = true, logoUrl = null, accent = null, waitForCorsReady = true }) {
      if (!clientId || !Array.isArray(redirectUris) || !redirectUris.length) throw new Error('registerClient: clientId and redirectUris are required');
      const redirects = [...redirectUris];
      for (const o of origins) if (!redirects.some(u => new URL(u).origin === new URL(o).origin)) redirects.push(`${new URL(o).origin}/`);
      const logout = postLogoutRedirectUris ?? [...new Set(redirects.map(u => `${new URL(u).origin}/`))];
      await pool.query(`INSERT INTO platform.oauth_clients(client_id,display_name,logo_url,accent_color,redirect_uris,post_logout_redirect_uris,self_service_roles,allow_personal_workspace)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (client_id) DO UPDATE SET display_name=EXCLUDED.display_name, logo_url=EXCLUDED.logo_url, accent_color=EXCLUDED.accent_color,
          redirect_uris=EXCLUDED.redirect_uris, post_logout_redirect_uris=EXCLUDED.post_logout_redirect_uris,
          self_service_roles=EXCLUDED.self_service_roles, allow_personal_workspace=EXCLUDED.allow_personal_workspace, status='active'`,
      [clientId, name ?? clientId, logoUrl, accent, redirects, logout, selfRoles, personal]);
      if (waitForCorsReady) for (const origin of new Set(redirects.map(u => new URL(u).origin))) await waitForCors(origin);
      return { clientId, redirectUris: redirects, postLogoutRedirectUris: logout };
    },

    // An active account with a known password, ready to sign in on the real hosted pages.
    async createUser({ email = uniqueEmail(), password = uniquePassword(), verified = true, name = null, locale = 'en' } = {}) {
      const id = crypto.randomUUID();
      const normalized = String(email).trim().toLowerCase();
      await pool.query(`INSERT INTO platform.users(id,email,password_hash,status,email_verified_at,display_name,locale)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, normalized, verified ? await hashPassword(password) : null, verified ? 'active' : 'pending', verified ? new Date() : null, name, locale]);
      created.users.add(id);
      return { id, email: normalized, password, name };
    },

    async createOrganization({ name = `E2E Org ${rand(3)}`, owner } = {}) {
      const organizationId = crypto.randomUUID();
      const tenantId = crypto.randomUUID();
      const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}-${rand(3)}`;
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query('INSERT INTO platform.organizations(id,name,slug) VALUES ($1,$2,$3)', [organizationId, name, slug]);
        await c.query('INSERT INTO platform.tenants(id,organization_id,name) VALUES ($1,$2,$3)', [tenantId, organizationId, name]);
        if (owner) await c.query("INSERT INTO platform.memberships(user_id,tenant_id,role,scopes) VALUES ($1,$2,'owner','{}')", [await userIdOf(owner), tenantId]);
        await c.query('COMMIT');
      } catch (error) {
        await c.query('ROLLBACK');
        throw error;
      } finally {
        c.release();
      }
      created.organizations.add(organizationId);
      created.tenants.add(tenantId);
      return { organizationId, tenantId, name };
    },

    // Adds product roles for a user in an organisation workspace (keeps roles granted earlier).
    async grantRole({ user, org, tenant, product, role, roles }) {
      const uid = await userIdOf(user);
      const tenantId = tenantIdOf(org ?? tenant);
      const list = [...(roles ?? []), ...(role ? [role] : [])];
      if (!tenantId || !product || !list.length) throw new Error('grantRole: user, org (or tenant), product and role(s) are required');
      await pool.query("INSERT INTO platform.memberships(user_id,tenant_id,role,scopes) VALUES ($1,$2,'member','{}') ON CONFLICT DO NOTHING", [uid, tenantId]);
      await pool.query(`INSERT INTO platform.product_roles(user_id,tenant_id,client_id,roles) VALUES ($1,$2,$3,$4)
        ON CONFLICT (user_id,tenant_id,client_id) DO UPDATE SET roles=(SELECT array_agg(DISTINCT r) FROM unnest(platform.product_roles.roles || EXCLUDED.roles) r), updated_at=now()`,
      [uid, tenantId, product, list]);
      return { userId: uid, tenantId, product, roles: list };
    },

    // The usual per-test setup: a fresh organisation (unique tenant) with one user holding roles in a product.
    async seedTenant({ product, roles, email, password, name, orgName } = {}) {
      const user = await harness.createUser({ email, password, name });
      const org = await harness.createOrganization({ name: orgName, owner: user });
      if (roles?.length) await harness.grantRole({ user, org, product, roles });
      return { user, org, tenantId: org.tenantId, email: user.email, password: user.password, roles: roles ?? [] };
    },

    // A real RS256 token signed with the running service's key, for API-level tests.
    async mintAccessToken({ sub, tenant_id: tenantId, roles = [], audience, email, name, expiresIn = 900, ...extra }) {
      if (!sub || !tenantId || !audience) throw new Error('mintAccessToken: sub, tenant_id and audience are required');
      return new SignJWT({ tenant_id: tenantId, roles, email, email_verified: email ? true : undefined, name, client_id: audience, ...extra })
        .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
        .setIssuer(issuer).setAudience(audience).setSubject(String(sub))
        .setIssuedAt().setJti(crypto.randomUUID()).setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
        .sign(await key());
    },

    // Emails the identity service sent (activation, reset), read from the mock email capture.
    async waitForEmail({ to, subject, timeoutMs = 10_000 }) {
      const end = Date.now() + timeoutMs;
      for (;;) {
        const items = mocks ? await mocks.messages({ channel: 'email', to }) : (outbox ?? []).filter(m => m.to === to);
        const hit = items.filter(m => !subject || String(m.subject).includes(subject)).at(-1);
        if (hit) return hit;
        if (Date.now() > end) throw new Error(`e2e-kit: no email to ${to}`);
        await new Promise(r => setTimeout(r, 100));
      }
    },

    // Tenants created by this harness, so a product fixture can delete its own rows for them.
    createdTenantIds: () => [...created.tenants],

    // Environment a product server needs to trust this identity service.
    envFor(clientId) {
      return {
        OIDC_ISSUER: issuer, OIDC_AUDIENCE: clientId ?? '', OIDC_JWKS_URL: `${url}/.well-known/jwks.json`,
        ADS_IDENTITY_URL: url, ADS_IDENTITY_CLIENT_ID: clientId ?? '',
        ...(mocksUrl ? { ADS_MOCKS_URL: mocksUrl, ADS_MOCKS_WEBHOOK_SECRET: webhookSecret ?? '' } : {}),
      };
    },

    // Deletes users and organisations this harness created (and personal workspaces made at sign-in).
    async cleanup() {
      const users = [...created.users];
      const orgs = [...created.organizations];
      if (users.length) {
        const personal = await pool.query(`SELECT DISTINCT t.organization_id FROM platform.memberships m JOIN platform.tenants t ON t.id=m.tenant_id
          JOIN platform.organizations o ON o.id=t.organization_id WHERE o.kind='personal' AND m.user_id = ANY($1::uuid[])`, [users]);
        orgs.push(...personal.rows.map(r => r.organization_id));
      }
      if (orgs.length) {
        await pool.query('DELETE FROM platform.tenants WHERE organization_id = ANY($1::uuid[])', [orgs]);
        await pool.query('DELETE FROM platform.organizations WHERE id = ANY($1::uuid[])', [orgs]);
      }
      if (users.length) await pool.query('DELETE FROM platform.users WHERE id = ANY($1::uuid[])', [users]);
      created.users.clear();
      created.organizations.clear();
      created.tenants.clear();
    },

    async close() {
      await pool.end();
      if (stop) await stop();
    },
  };
  return harness;
}

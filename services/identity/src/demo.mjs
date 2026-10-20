import crypto from 'node:crypto';
import { DEMO_ACCOUNTS } from './config.mjs';
import { withTransaction } from './db.mjs';
import { checkPasswordStrength, hashPassword } from './security.mjs';

// DE-03/DE-04: the shared demo accounts and demo organisations of the ADS demo environment.
// Operator-only (cli.mjs demo-bootstrap, demo-orgs, demo-reset). Every entry point refuses to run
// unless demo mode is on (ADS_ENV=demo AND DEMO_MODE=1). Passwords are never logged or returned.

export class DemoError extends Error {}
const refuse = message => { throw new DemoError(message); };

export function assertDemoMode(settings) {
  if (!settings?.enabled) refuse('refused: demo accounts and organisations exist only when ADS_ENV=demo and DEMO_MODE=1');
}

const audit = (db, event, { userId = null, tenantId = null, metadata = {} } = {}) => db.query(
  "INSERT INTO platform.identity_audit(event_type,user_id,tenant_id,outcome,reason,metadata) VALUES ($1,$2,$3,'allowed','cli',$4::jsonb)",
  [event, userId, tenantId, JSON.stringify(metadata)]);

// Creates or refreshes the three demo accounts: active, email confirmed, marked demo, password from
// the given secrets. passwords: { user, user2, admin } (plain text, from env or secret files).
export async function bootstrapDemoAccounts(pool, settings, passwords, { minPasswordLength = 10 } = {}) {
  assertDemoMode(settings);
  const prepared = [];
  for (const key of DEMO_ACCOUNTS) {
    const account = settings.accounts[key];
    const password = passwords?.[key];
    if (!password) refuse(`missing ${account.passwordVar} (or ${account.passwordVar}_FILE)`);
    const weak = checkPasswordStrength(password, minPasswordLength);
    if (weak) refuse(`${account.passwordVar} is not accepted (${weak})`);
    prepared.push({ ...account, hash: await hashPassword(password) });
  }
  if (new Set(prepared.map(a => a.email)).size !== prepared.length) refuse('the three demo accounts need three different emails');
  return withTransaction(pool, async c => {
    await c.query("SET LOCAL ads.demo_maintenance = 'on'");
    const out = [];
    for (const a of prepared) {
      let row = (await c.query('SELECT id FROM platform.users WHERE demo_key=$1 FOR UPDATE', [a.key])).rows[0];
      const byEmail = (await c.query('SELECT id, is_demo, demo_key FROM platform.users WHERE email=$1 FOR UPDATE', [a.email])).rows[0];
      if (byEmail && !byEmail.is_demo) refuse(`${a.email} belongs to a real account; demo accounts never take over real ones`);
      if (byEmail && row && byEmail.id !== row.id) refuse(`${a.email} is already used by another demo account`);
      row ??= byEmail;
      let created = false;
      if (row) {
        await c.query(`UPDATE platform.users SET email=$2, password_hash=$3, status='active', email_verified_at=coalesce(email_verified_at, now()),
          display_name=$4, is_demo=true, demo_key=$5, updated_at=now() WHERE id=$1`, [row.id, a.email, a.hash, a.name, a.key]);
      } else {
        row = { id: crypto.randomUUID() };
        created = true;
        await c.query(`INSERT INTO platform.users(id,email,password_hash,status,email_verified_at,display_name,locale,is_demo,demo_key)
          VALUES ($1,$2,$3,'active',now(),$4,'en',true,$5)`, [row.id, a.email, a.hash, a.name, a.key]);
      }
      // No activation or reset links stay open for a demo account.
      await c.query('UPDATE platform.email_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL', [row.id]);
      await audit(c, 'demo_account_bootstrap', { userId: row.id, metadata: { demo_key: a.key, created } });
      out.push({ key: a.key, email: a.email, userId: row.id, created });
    }
    return out;
  });
}

async function demoAccountIds(db) {
  const rows = (await db.query('SELECT id, demo_key FROM platform.users WHERE is_demo AND demo_key IS NOT NULL')).rows;
  const ids = Object.fromEntries(rows.map(r => [r.demo_key, r.id]));
  for (const key of DEMO_ACCOUNTS) if (!ids[key]) refuse('demo accounts missing: run demo-bootstrap first');
  return ids;
}

// Checks the reviewed client list (config/clients.demo.json) enough to use it safely.
export function validateClientList(doc) {
  if (!doc || !Array.isArray(doc.products) || !doc.products.length) refuse('client list has no products');
  const seen = new Set();
  for (const p of doc.products) {
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(String(p.client_id))) refuse(`bad client_id ${p.client_id}`);
    if (seen.has(p.client_id)) refuse(`duplicate client_id ${p.client_id}`);
    seen.add(p.client_id);
    const adsOnly = new Set(p.ads_only_roles ?? []);
    for (const r of p.assignable_roles ?? []) if (adsOnly.has(r)) refuse(`${p.client_id}: ADS-only role ${r} must not be assignable`);
    const orgKeys = new Set();
    for (const o of p.demo_orgs ?? []) {
      if (!/^[a-z][a-z0-9-]{0,30}$/.test(String(o.key)) || orgKeys.has(o.key)) refuse(`${p.client_id}: bad demo org key ${o.key}`);
      orgKeys.add(o.key);
      for (const r of o.roles ?? []) if (adsOnly.has(r) && !o.staff) refuse(`${p.client_id}: ADS-only role ${r} only in a staff organisation`);
    }
    for (const [setting, keys] of Object.entries(p.tenant_settings ?? {})) {
      for (const k of keys) if (!orgKeys.has(k)) refuse(`${p.client_id}: ${setting} names unknown demo org ${k}`);
    }
  }
  return doc;
}

// Creates or restores, per product, its demo organisations (flagged demo; staff ones flagged staff),
// with the demo admin as owner and product admin, and the demo user and second demo user holding
// every listed role. Returns the product -> tenant ids map for the products' settings.
export async function ensureDemoOrgs(pool, settings, doc) {
  assertDemoMode(settings);
  validateClientList(doc);
  return withTransaction(pool, async c => {
    const ids = await demoAccountIds(c);
    const registered = new Set((await c.query('SELECT client_id FROM platform.oauth_clients')).rows.map(r => r.client_id));
    const missing = doc.products.filter(p => !registered.has(p.client_id)).map(p => p.client_id);
    if (missing.length) refuse(`clients not registered (run apply-clients first): ${missing.join(', ')}`);
    const map = {};
    for (const p of doc.products) {
      const entry = { client_id: p.client_id, tenants: {}, staff_tenants: [], settings: {}, operator_setup: p.operator_setup ?? [] };
      for (const o of p.demo_orgs) {
        const key = `${p.slug ?? p.client_id}:${o.key}`;
        let org = (await c.query('SELECT id FROM platform.organizations WHERE demo_key=$1 FOR UPDATE', [key])).rows[0];
        let tenantId;
        if (org) {
          await c.query("UPDATE platform.organizations SET name=$2, is_demo=true, is_staff=$3, status='active' WHERE id=$1", [org.id, o.name, Boolean(o.staff)]);
          tenantId = (await c.query('SELECT id FROM platform.tenants WHERE organization_id=$1 ORDER BY created_at LIMIT 1', [org.id])).rows[0]?.id;
          if (tenantId) await c.query("UPDATE platform.tenants SET status='active', name=$2 WHERE id=$1", [tenantId, o.name]);
        } else {
          org = { id: crypto.randomUUID() };
          await c.query("INSERT INTO platform.organizations(id,name,slug,kind,is_demo,is_staff,demo_key) VALUES ($1,$2,$3,'organization',true,$4,$5)",
            [org.id, o.name, `demo-${key.replace(/[^a-z0-9]+/g, '-')}`, Boolean(o.staff), key]);
        }
        if (!tenantId) {
          tenantId = crypto.randomUUID();
          await c.query('INSERT INTO platform.tenants(id,organization_id,name) VALUES ($1,$2,$3)', [tenantId, org.id, o.name]);
        }
        const upsertMember = (userId, role) => c.query(`INSERT INTO platform.memberships(user_id,tenant_id,role,scopes) VALUES ($1,$2,$3,'{}')
          ON CONFLICT (user_id,tenant_id) DO UPDATE SET role=EXCLUDED.role, status='active'`, [userId, tenantId, role]);
        const setRoles = async (userId, roles) => {
          if (!roles.length) return c.query('DELETE FROM platform.product_roles WHERE user_id=$1 AND tenant_id=$2 AND client_id=$3', [userId, tenantId, p.client_id]);
          return c.query(`INSERT INTO platform.product_roles(user_id,tenant_id,client_id,roles,granted_by) VALUES ($1,$2,$3,$4,$5)
            ON CONFLICT (user_id,tenant_id,client_id) DO UPDATE SET roles=EXCLUDED.roles, granted_by=EXCLUDED.granted_by, updated_at=now()`,
          [userId, tenantId, p.client_id, roles, ids.admin]);
        };
        await upsertMember(ids.admin, 'owner');
        await upsertMember(ids.user, 'member');
        await upsertMember(ids.user2, 'member');
        await setRoles(ids.admin, [...new Set(p.admin_roles ?? [])]);
        await setRoles(ids.user, [...new Set(o.roles)]);
        await setRoles(ids.user2, [...new Set(o.roles)]);
        // A demo organisation serves one product: the demo accounts hold no other product's roles there.
        await c.query('DELETE FROM platform.product_roles WHERE tenant_id=$1 AND client_id<>$2 AND user_id = ANY($3::uuid[])', [tenantId, p.client_id, Object.values(ids)]);
        entry.tenants[o.key] = tenantId;
        if (o.staff) entry.staff_tenants.push(tenantId);
      }
      for (const [setting, keys] of Object.entries(p.tenant_settings ?? {})) entry.settings[setting] = keys.map(k => entry.tenants[k]).join(',');
      map[p.slug ?? p.client_id] = entry;
    }
    await audit(c, 'demo_orgs_ensured', { metadata: { products: Object.keys(map).length } });
    return map;
  });
}

// Nightly restore: accounts back to their shared passwords, every sign-in ended, memberships and roles
// back to the reviewed list, outsiders and pending invitations removed from demo organisations.
export async function resetDemo(pool, settings, passwords, doc, opts = {}) {
  assertDemoMode(settings);
  validateClientList(doc);
  const accounts = await bootstrapDemoAccounts(pool, settings, passwords, opts);
  const cleaned = await withTransaction(pool, async c => {
    const ids = Object.values(await demoAccountIds(c));
    const n = {};
    n.ssoSessions = (await c.query('UPDATE platform.sso_sessions SET revoked_at=now() WHERE user_id = ANY($1::uuid[]) AND revoked_at IS NULL', [ids])).rowCount;
    n.refreshTokens = (await c.query('UPDATE platform.refresh_tokens SET revoked_at=now() WHERE user_id = ANY($1::uuid[]) AND revoked_at IS NULL', [ids])).rowCount;
    await c.query('UPDATE platform.sessions SET revoked_at=now() WHERE user_id = ANY($1::uuid[]) AND revoked_at IS NULL', [ids]);
    // Demo accounts belong only to demo organisations (and their own personal workspace).
    const foreign = `SELECT t.id FROM platform.tenants t JOIN platform.organizations o ON o.id=t.organization_id WHERE NOT o.is_demo AND o.kind<>'personal'`;
    await c.query(`DELETE FROM platform.product_roles WHERE user_id = ANY($1::uuid[]) AND tenant_id IN (${foreign})`, [ids]);
    n.foreignMemberships = (await c.query(`DELETE FROM platform.memberships WHERE user_id = ANY($1::uuid[]) AND tenant_id IN (${foreign})`, [ids])).rowCount;
    // Demo organisations hold only the demo accounts.
    const demoTenants = "SELECT t.id FROM platform.tenants t JOIN platform.organizations o ON o.id=t.organization_id WHERE o.is_demo";
    await c.query(`DELETE FROM platform.product_roles WHERE NOT (user_id = ANY($1::uuid[])) AND tenant_id IN (${demoTenants})`, [ids]);
    n.outsiders = (await c.query(`DELETE FROM platform.memberships WHERE NOT (user_id = ANY($1::uuid[])) AND tenant_id IN (${demoTenants})`, [ids])).rowCount;
    n.invitations = (await c.query(`UPDATE platform.invitations SET revoked_at=now() WHERE accepted_at IS NULL AND revoked_at IS NULL AND tenant_id IN (${demoTenants})`)).rowCount;
    await audit(c, 'demo_reset', { metadata: n });
    return n;
  });
  const tenants = await ensureDemoOrgs(pool, settings, doc);
  return { accounts, cleaned, tenants };
}

import crypto from 'node:crypto';
import { DEMO_ACCOUNTS } from './config.mjs';
import { withTransaction } from './db.mjs';
import { checkPasswordStrength, hashPassword } from './security.mjs';

// DE-03/DE-04: the shared demo accounts and demo organisations of the ADS demo environment.
// Operator-only (cli.mjs demo-bootstrap, demo-orgs, demo-reset). Every entry point refuses to run
// unless demo mode is on (ADS_ENV=demo AND DEMO_MODE=1). Passwords are never logged or returned.

export class DemoError extends Error {}
const refuse = message => { throw new DemoError(message); };

// Demo sets. The global demo set (null) is the shared one run by demo-bootstrap/demo-orgs/demo-reset.
// A named set (e.g. a future per-tester sandbox id) gets its own organisations and personas, namespaced so
// the global commands never touch it: organisation demo_key '<set>/<slug>:<org>', persona demo_key
// 'persona:<set>/<slug>:<key>', persona email 'demo.<set>.<slug>.<key>@<domain>'.
const SET_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
export function checkDemoSet(set) {
  if (set !== null && set !== undefined && !SET_ID.test(String(set))) refuse(`bad demo set id ${set}`);
  return set ?? null;
}
const setPrefix = set => (set ? `${set}/` : '');
// Postgres regex matching the persona demo_keys of one set (and only that set).
const personaKeyPattern = set => (set ? `^persona:${set}/[a-z0-9-]+:[a-z0-9-]+$` : '^persona:[a-z0-9-]+:[a-z0-9-]+$');

export function assertDemoMode(settings) {
  if (!settings?.enabled) refuse('refused: demo accounts and organisations exist only when ADS_ENV=demo and DEMO_MODE=1');
}

const audit = (db, event, { userId = null, tenantId = null, metadata = {} } = {}) => db.query(
  "INSERT INTO platform.identity_audit(event_type,user_id,tenant_id,outcome,reason,metadata) VALUES ($1,$2,$3,'allowed','cli',$4::jsonb)",
  [event, userId, tenantId, JSON.stringify(metadata)]);

// Creates or refreshes the three demo accounts: active, email confirmed, marked demo, password from
// the given secrets. passwords: { user, user2, admin, persona? } (plain text, from env or secret files).
// personas (from personaAccounts()): the single-job demo persona accounts, all with passwords.persona.
// Persona accounts no longer in the list are disabled and signed out.
export async function bootstrapDemoAccounts(pool, settings, passwords, { minPasswordLength = 10, personas = null } = {}) {
  assertDemoMode(settings);
  const prepared = [];
  let personaHash = null;
  if (personas?.length) {
    // It is shown on the sign-in page: it must not open the checker or the admin account.
    if (passwords?.persona && (passwords.persona === passwords?.user2 || passwords.persona === passwords?.admin)) {
      refuse(`${settings.personaPasswordVar} must differ from DEMO_USER2_PASSWORD and DEMO_ADMIN_PASSWORD`);
    }
    personaHash = await personaPasswordHash(settings, passwords?.persona, minPasswordLength);
  }
  for (const key of DEMO_ACCOUNTS) {
    const account = settings.accounts[key];
    const password = passwords?.[key];
    if (!password) refuse(`missing ${account.passwordVar} (or ${account.passwordVar}_FILE)`);
    const weak = checkPasswordStrength(password, minPasswordLength);
    if (weak) refuse(`${account.passwordVar} is not accepted (${weak})`);
    prepared.push({ ...account, hash: await hashPassword(password) });
  }
  if (new Set(prepared.map(a => a.email)).size !== prepared.length) refuse('the three demo accounts need three different emails');
  for (const p of personaHash ? personas : []) {
    if (p.set) refuse('demo-bootstrap handles the global demo set only; use ensurePersonaAccounts for a named set');
    prepared.push({ key: p.demoKey, email: p.email, name: p.name, hash: personaHash, persona: true });
  }
  if (new Set(prepared.map(a => a.email)).size !== prepared.length) refuse('every demo account needs its own email');
  return withTransaction(pool, async c => {
    await c.query("SET LOCAL ads.demo_maintenance = 'on'");
    const out = [];
    for (const a of prepared) out.push(await upsertDemoAccount(c, a));
    if (personaHash) await disableStalePersonas(c, personas.map(p => p.demoKey), null);
    return out;
  });
}

// One shared (shown) persona password: one hash serves every persona account of a set.
async function personaPasswordHash(settings, password, minPasswordLength) {
  if (!password) refuse(`missing ${settings.personaPasswordVar} (or ${settings.personaPasswordVar}_FILE)`);
  const weak = checkPasswordStrength(password, minPasswordLength);
  if (weak) refuse(`${settings.personaPasswordVar} is not accepted (${weak})`);
  return hashPassword(password);
}

// Creates or refreshes one demo account (inside a transaction with ads.demo_maintenance on).
// a: { key (demo_key), email, name, hash, persona? }.
async function upsertDemoAccount(c, a) {
  let row = (await c.query('SELECT id FROM platform.users WHERE demo_key=$1 FOR UPDATE', [a.key])).rows[0];
  const byEmail = (await c.query('SELECT id, is_demo, demo_key FROM platform.users WHERE email=$1 FOR UPDATE', [a.email])).rows[0];
  if (byEmail && !byEmail.is_demo) refuse(`${a.email} belongs to a real account; demo accounts never take over real ones`);
  if (byEmail && row && byEmail.id !== row.id) refuse(`${a.email} is already used by another demo account`);
  row ??= byEmail;
  let created = false;
  if (row) {
    // locale back to 'en': a shared demo account keeps no language between testers.
    await c.query(`UPDATE platform.users SET email=$2, password_hash=$3, status='active', email_verified_at=coalesce(email_verified_at, now()),
      display_name=$4, is_demo=true, demo_key=$5, locale='en', updated_at=now() WHERE id=$1`, [row.id, a.email, a.hash, a.name, a.key]);
  } else {
    row = { id: crypto.randomUUID() };
    created = true;
    await c.query(`INSERT INTO platform.users(id,email,password_hash,status,email_verified_at,display_name,locale,is_demo,demo_key)
      VALUES ($1,$2,$3,'active',now(),$4,'en',true,$5)`, [row.id, a.email, a.hash, a.name, a.key]);
  }
  // No activation or reset links stay open for a demo account.
  await c.query('UPDATE platform.email_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL', [row.id]);
  await audit(c, 'demo_account_bootstrap', { userId: row.id, metadata: { demo_key: a.key, created } });
  return { key: a.key, email: a.email, userId: row.id, created, persona: Boolean(a.persona) };
}

// Personas of one set no longer in its list: disabled and signed out (their rows stay for the audit trail).
async function disableStalePersonas(c, keep, set) {
  const gone = (await c.query(`UPDATE platform.users SET status='disabled', updated_at=now()
    WHERE is_demo AND demo_key ~ $2 AND NOT (demo_key = ANY($1::text[])) AND status<>'disabled' RETURNING id`, [keep, personaKeyPattern(set)])).rows.map(r => r.id);
  if (gone.length) {
    await c.query('UPDATE platform.sso_sessions SET revoked_at=now() WHERE user_id = ANY($1::uuid[]) AND revoked_at IS NULL', [gone]);
    await c.query('UPDATE platform.refresh_tokens SET revoked_at=now() WHERE user_id = ANY($1::uuid[]) AND revoked_at IS NULL', [gone]);
    await c.query('DELETE FROM platform.demo_personas WHERE user_id = ANY($1::uuid[])', [gone]);
  }
  return gone;
}

// Creates or refreshes the persona accounts of one demo set (from personaAccounts(..., { set })), all
// with one password, and disables that set's personas no longer listed. Reusable building block for a
// named set (a per-tester sandbox); the global set goes through bootstrapDemoAccounts.
export async function ensurePersonaAccounts(pool, settings, personas, password, { set = null, minPasswordLength = 10 } = {}) {
  assertDemoMode(settings);
  set = checkDemoSet(set);
  if (personas.some(p => (p.set ?? null) !== set)) refuse('personas belong to another demo set');
  const hash = await personaPasswordHash(settings, password, minPasswordLength);
  return withTransaction(pool, async c => {
    await c.query("SET LOCAL ads.demo_maintenance = 'on'");
    const out = [];
    for (const p of personas) out.push(await upsertDemoAccount(c, { key: p.demoKey, email: p.email, name: p.name, hash, persona: true }));
    await disableStalePersonas(c, personas.map(p => p.demoKey), set);
    return out;
  });
}

// ---------- demo personas (BRIEF16) ----------
const PERSONA_KEY = /^[a-z][a-z0-9-]{0,39}$/;
const text = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 120;

// Checks config/demo-personas.json against the reviewed client list. Every persona holds exactly its
// roles in one demo organisation of its product (or its personal workspace, which holds exactly the
// product's self-service roles); ADS-only roles only in a staff organisation.
export function validatePersonas(personasDoc, clientsDoc) {
  if (!personasDoc) return personasDoc;
  if (typeof personasDoc !== 'object' || typeof personasDoc.products !== 'object' || !personasDoc.products) refuse('personas file has no products');
  const bySlug = new Map(clientsDoc.products.map(p => [p.slug ?? p.client_id, p]));
  for (const [slug, entry] of Object.entries(personasDoc.products)) {
    const product = bySlug.get(slug);
    if (!product) refuse(`personas: unknown product ${slug} (not in the client list)`);
    if (!Array.isArray(entry?.personas)) refuse(`personas: ${slug} has no personas list`);
    const keys = new Set();
    const adsOnly = new Set(product.ads_only_roles ?? []);
    for (const p of entry.personas) {
      if (!PERSONA_KEY.test(String(p?.key)) || keys.has(p.key)) refuse(`personas: ${slug}: bad or duplicate key ${p?.key}`);
      keys.add(p.key);
      const where = `personas: ${slug}/${p.key}`;
      if (!text(p.label?.en) || !text(p.label?.fr)) refuse(`${where}: label needs en and fr`);
      if (p.hint !== undefined && (!text(p.hint?.en) || !text(p.hint?.fr))) refuse(`${where}: hint needs en and fr`);
      if (!Array.isArray(p.roles) || !p.roles.length || p.roles.some(r => typeof r !== 'string' || !r) || new Set(p.roles).size !== p.roles.length) refuse(`${where}: roles must be a list of distinct roles`);
      if (p.org === 'personal') {
        const self = [...(product.self_service_roles ?? [])].sort();
        if (!product.allow_personal_workspace || !self.length) refuse(`${where}: ${slug} has no personal workspace`);
        if (JSON.stringify([...p.roles].sort()) !== JSON.stringify(self)) refuse(`${where}: a personal workspace holds exactly ${self.join(', ')}`);
        continue;
      }
      const org = (product.demo_orgs ?? []).find(o => o.key === p.org);
      if (!org) refuse(`${where}: unknown demo organisation ${p.org}`);
      const allowed = new Set([...(org.roles ?? []), ...(org.staff ? [] : product.admin_roles ?? [])]);
      for (const r of p.roles) {
        if (!allowed.has(r)) refuse(`${where}: role ${r} is not a role of ${slug}/${p.org}`);
        if (adsOnly.has(r) && !org.staff) refuse(`${where}: ADS-only role ${r} only in a staff organisation`);
      }
    }
  }
  return personasDoc;
}

// The persona accounts to create, in file order: { set, slug, clientId, key, demoKey, email, name, label, hint, org, roles, position }.
// opts.set: a named demo set (sandbox id); null is the global demo set.
export function personaAccounts(settings, personasDoc, clientsDoc, { set = null } = {}) {
  set = checkDemoSet(set);
  if (!personasDoc) return [];
  validateClientList(clientsDoc);
  validatePersonas(personasDoc, clientsDoc);
  const bySlug = new Map(clientsDoc.products.map(p => [p.slug ?? p.client_id, p]));
  const out = [];
  for (const [slug, entry] of Object.entries(personasDoc.products)) {
    entry.personas.forEach((p, position) => out.push({
      set, slug, clientId: bySlug.get(slug).client_id, key: p.key, demoKey: `persona:${setPrefix(set)}${slug}:${p.key}`,
      email: settings.personaEmail(set ? `${set}.${slug}` : slug, p.key),
      name: `${p.label.en} (demo)`, label: { en: p.label.en, fr: p.label.fr }, hint: p.hint ? { en: p.hint.en, fr: p.hint.fr } : {}, org: p.org, roles: [...p.roles], position,
    }));
  }
  return out;
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
// every listed role. Each demo persona (opts.personas, from personaAccounts()) whose account exists
// becomes a member of exactly its one organisation (or keeps only its personal workspace) with exactly
// its roles. Returns the product -> tenant ids (and persona) map for the products' settings and seeds.
//
// opts.set: a named demo set (e.g. a per-tester sandbox id) gets its own organisations ('<set>/<slug>:<org>',
// names suffixed with the set id) owned by opts.ownerId (that tester), and only that set's personas; the
// shared demo user, checker and admin are not added. Null (default) is the global demo set.
export async function ensureDemoOrgs(pool, settings, doc, { personas = [], set = null, ownerId = null } = {}) {
  assertDemoMode(settings);
  validateClientList(doc);
  set = checkDemoSet(set);
  if (personas.some(p => (p.set ?? null) !== set)) refuse('personas belong to another demo set');
  if (set && !ownerId) refuse('a named demo set needs ownerId');
  return withTransaction(pool, async c => {
    // Global set: the three shared accounts (owner = demo admin). Named set: only its owner.
    const ids = set ? { admin: ownerId } : await demoAccountIds(c);
    const shared = set ? [] : ['user', 'user2'];
    const personaIds = Object.fromEntries((await c.query("SELECT id, demo_key FROM platform.users WHERE is_demo AND status='active' AND demo_key ~ $1", [personaKeyPattern(set)])).rows.map(r => [r.demo_key, r.id]));
    const registered = new Set((await c.query('SELECT client_id FROM platform.oauth_clients')).rows.map(r => r.client_id));
    const missing = doc.products.filter(p => !registered.has(p.client_id)).map(p => p.client_id);
    if (missing.length) refuse(`clients not registered (run apply-clients first): ${missing.join(', ')}`);
    const map = {};
    for (const p of doc.products) {
      const entry = { client_id: p.client_id, tenants: {}, staff_tenants: [], settings: {}, operator_setup: p.operator_setup ?? [] };
      for (const o of p.demo_orgs) {
        const key = `${setPrefix(set)}${p.slug ?? p.client_id}:${o.key}`;
        const name = set ? `${o.name} [${set}]` : o.name;
        let org = (await c.query('SELECT id FROM platform.organizations WHERE demo_key=$1 FOR UPDATE', [key])).rows[0];
        let tenantId;
        if (org) {
          await c.query("UPDATE platform.organizations SET name=$2, is_demo=true, is_staff=$3, status='active' WHERE id=$1", [org.id, name, Boolean(o.staff)]);
          tenantId = (await c.query('SELECT id FROM platform.tenants WHERE organization_id=$1 ORDER BY created_at LIMIT 1', [org.id])).rows[0]?.id;
          if (tenantId) await c.query("UPDATE platform.tenants SET status='active', name=$2 WHERE id=$1", [tenantId, name]);
        } else {
          org = { id: crypto.randomUUID() };
          await c.query("INSERT INTO platform.organizations(id,name,slug,kind,is_demo,is_staff,demo_key) VALUES ($1,$2,$3,'organization',true,$4,$5)",
            [org.id, name, `demo-${key.replace(/[^a-z0-9]+/g, '-')}`, Boolean(o.staff), key]);
        }
        if (!tenantId) {
          tenantId = crypto.randomUUID();
          await c.query('INSERT INTO platform.tenants(id,organization_id,name) VALUES ($1,$2,$3)', [tenantId, org.id, name]);
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
        await setRoles(ids.admin, [...new Set(p.admin_roles ?? [])]);
        for (const k of shared) {
          await upsertMember(ids[k], 'member');
          await setRoles(ids[k], [...new Set(o.roles)]);
        }
        // A demo organisation serves one product: the demo accounts hold no other product's roles there.
        await c.query('DELETE FROM platform.product_roles WHERE tenant_id=$1 AND client_id<>$2 AND user_id = ANY($3::uuid[])', [tenantId, p.client_id, [...Object.values(ids), ...Object.values(personaIds)]]);
        entry.tenants[o.key] = tenantId;
        if (o.staff) entry.staff_tenants.push(tenantId);
      }
      for (const [setting, keys] of Object.entries(p.tenant_settings ?? {})) entry.settings[setting] = keys.map(k => entry.tenants[k]).join(',');
      entry.personas = {};
      map[p.slug ?? p.client_id] = entry;
    }

    const placed = await placePersonas(c, personas, map, { set, personaIds, grantedBy: ids.admin });
    await audit(c, 'demo_orgs_ensured', { metadata: { set, products: Object.keys(map).length, personas: placed.length } });
    return map;
  });
}

// Places the personas of one demo set: each becomes a member of exactly its one organisation of that set
// (map: product slug -> { tenants: { <org key>: tenant id }, personas: {} }, as ensureDemoOrgs builds it)
// or keeps only its personal workspace, with exactly its roles; records them for the sign-in page; and
// strips every workspace from that set's persona accounts not placed now. Fills map[slug].personas.
// Returns the placed user ids. Runs inside the caller's transaction (c).
export async function placePersonas(c, personas, map, { set = null, personaIds = null, grantedBy = null } = {}) {
  set = checkDemoSet(set);
  personaIds ??= Object.fromEntries((await c.query("SELECT id, demo_key FROM platform.users WHERE is_demo AND status='active' AND demo_key ~ $1", [personaKeyPattern(set)])).rows.map(r => [r.demo_key, r.id]));
  const demoSet = set ?? '';
  // Personas: exactly one workspace each, exactly their roles there.
  const placed = [];
  for (const persona of personas) {
    const entry = map[persona.slug];
    const userId = personaIds[persona.demoKey];
    if (!entry || !userId) continue;
    let tenantId;
    if (persona.org === 'personal') {
      tenantId = await ensurePersonalWorkspace(c, userId, persona.email);
      await c.query('DELETE FROM platform.product_roles WHERE user_id=$1 AND tenant_id=$2', [userId, tenantId]);
    } else {
      tenantId = entry.tenants[persona.org];
      await c.query(`INSERT INTO platform.memberships(user_id,tenant_id,role,scopes) VALUES ($1,$2,'member','{}')
        ON CONFLICT (user_id,tenant_id) DO UPDATE SET role='member', scopes='{}', status='active'`, [userId, tenantId]);
      await c.query(`INSERT INTO platform.product_roles(user_id,tenant_id,client_id,roles,granted_by) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (user_id,tenant_id,client_id) DO UPDATE SET roles=EXCLUDED.roles, granted_by=EXCLUDED.granted_by, updated_at=now()`,
      [userId, tenantId, persona.clientId, persona.roles, grantedBy]);
      await c.query('DELETE FROM platform.product_roles WHERE user_id=$1 AND tenant_id=$2 AND client_id<>$3', [userId, tenantId, persona.clientId]);
    }
    // Nothing anywhere else (other demo organisations, organisations joined by invitation).
    await c.query('DELETE FROM platform.product_roles WHERE user_id=$1 AND tenant_id<>$2', [userId, tenantId]);
    await c.query('DELETE FROM platform.memberships WHERE user_id=$1 AND tenant_id<>$2', [userId, tenantId]);
    await c.query(`INSERT INTO platform.demo_personas(user_id,demo_set,client_id,product_slug,persona_key,org_key,tenant_id,roles,label,hint,position)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11)
      ON CONFLICT (user_id) DO UPDATE SET demo_set=EXCLUDED.demo_set, client_id=EXCLUDED.client_id, product_slug=EXCLUDED.product_slug, persona_key=EXCLUDED.persona_key, org_key=EXCLUDED.org_key,
        tenant_id=EXCLUDED.tenant_id, roles=EXCLUDED.roles, label=EXCLUDED.label, hint=EXCLUDED.hint, position=EXCLUDED.position`,
    [userId, demoSet, persona.clientId, persona.slug, persona.key, persona.org, tenantId, persona.roles, JSON.stringify(persona.label), JSON.stringify(persona.hint), persona.position]);
    placed.push(userId);
    entry.personas[persona.key] = { sub: userId, email: persona.email, org: persona.org, tenant_id: tenantId, roles: persona.roles, label: persona.label };
  }
  // The sign-in page lists only personas placed now; persona accounts not placed now (removed from
  // the file, or disabled) hold no workspace at all.
  await c.query('DELETE FROM platform.demo_personas WHERE demo_set=$2 AND NOT (user_id = ANY($1::uuid[]))', [placed, demoSet]);
  const unplaced = 'SELECT id FROM platform.users WHERE is_demo AND demo_key ~ $2 AND NOT (id = ANY($1::uuid[]))';
  await c.query(`DELETE FROM platform.product_roles WHERE user_id IN (${unplaced})`, [placed, personaKeyPattern(set)]);
  await c.query(`DELETE FROM platform.memberships WHERE user_id IN (${unplaced})`, [placed, personaKeyPattern(set)]);
  return placed;
}

// A persona's own personal workspace (same shape as the one oauth creates at first sign-in), so seeds
// know its tenant id before anyone signs in.
async function ensurePersonalWorkspace(c, userId, email) {
  const existing = (await c.query(`SELECT m.tenant_id FROM platform.memberships m JOIN platform.tenants t ON t.id=m.tenant_id
    JOIN platform.organizations o ON o.id=t.organization_id WHERE m.user_id=$1 AND o.kind='personal' ORDER BY m.created_at LIMIT 1`, [userId])).rows[0];
  if (existing) {
    await c.query("UPDATE platform.memberships SET role='owner', status='active' WHERE user_id=$1 AND tenant_id=$2", [userId, existing.tenant_id]);
    return existing.tenant_id;
  }
  const orgId = crypto.randomUUID();
  const tenantId = crypto.randomUUID();
  await c.query("INSERT INTO platform.organizations(id,name,slug,kind) VALUES ($1,$2,$3,'personal')", [orgId, `Personal · ${email}`, `personal-${orgId}`]);
  await c.query('INSERT INTO platform.tenants(id,organization_id,name) VALUES ($1,$2,$3)', [tenantId, orgId, 'Personal']);
  await c.query("INSERT INTO platform.memberships(user_id,tenant_id,role,scopes) VALUES ($1,$2,'owner','{}')", [userId, tenantId]);
  return tenantId;
}

// The demo-tenants.json document seeds read (see README "Demo personas").
export function tenantsDocument(map, accounts = {}) {
  const personas = {};
  for (const [slug, e] of Object.entries(map)) for (const [key, p] of Object.entries(e.personas ?? {})) personas[`${slug}.${key}`] = p.sub;
  return { generated_at: new Date().toISOString(), demo_accounts: accounts, products: map, personas };
}

// Subs of the three shared demo accounts (for the tenants file).
export async function demoAccountSubs(pool) {
  const rows = (await pool.query("SELECT id, demo_key FROM platform.users WHERE is_demo AND demo_key IN ('user','user2','admin')")).rows;
  return Object.fromEntries(DEMO_ACCOUNTS.filter(k => rows.some(r => r.demo_key === k)).map(k => [k, rows.find(r => r.demo_key === k).id]));
}

// Nightly restore: accounts back to their shared passwords, every sign-in ended, memberships and roles
// back to the reviewed list, outsiders and pending invitations removed from demo organisations.
// opts.personas (from personaAccounts()): persona accounts get the same treatment.
export async function resetDemo(pool, settings, passwords, doc, opts = {}) {
  assertDemoMode(settings);
  validateClientList(doc);
  const accounts = await bootstrapDemoAccounts(pool, settings, passwords, opts);
  const cleaned = await withTransaction(pool, async c => {
    await demoAccountIds(c);
    // Every account of the global demo set, personas included (also disabled ones: their sign-ins end
    // too). Named sets (sandboxes) are left alone.
    const ids = (await c.query("SELECT id FROM platform.users WHERE is_demo AND (demo_key IN ('user','user2','admin') OR demo_key ~ $1)", [personaKeyPattern(null)])).rows.map(r => r.id);
    const n = {};
    n.ssoSessions = (await c.query('UPDATE platform.sso_sessions SET revoked_at=now() WHERE user_id = ANY($1::uuid[]) AND revoked_at IS NULL', [ids])).rowCount;
    n.refreshTokens = (await c.query('UPDATE platform.refresh_tokens SET revoked_at=now() WHERE user_id = ANY($1::uuid[]) AND revoked_at IS NULL', [ids])).rowCount;
    await c.query('UPDATE platform.sessions SET revoked_at=now() WHERE user_id = ANY($1::uuid[]) AND revoked_at IS NULL', [ids]);
    // Demo accounts belong only to demo organisations (and their own personal workspace).
    const foreign = `SELECT t.id FROM platform.tenants t JOIN platform.organizations o ON o.id=t.organization_id WHERE NOT o.is_demo AND o.kind<>'personal'`;
    await c.query(`DELETE FROM platform.product_roles WHERE user_id = ANY($1::uuid[]) AND tenant_id IN (${foreign})`, [ids]);
    n.foreignMemberships = (await c.query(`DELETE FROM platform.memberships WHERE user_id = ANY($1::uuid[]) AND tenant_id IN (${foreign})`, [ids])).rowCount;
    // Demo organisations hold only the demo accounts.
    const demoTenants = "SELECT t.id FROM platform.tenants t JOIN platform.organizations o ON o.id=t.organization_id WHERE o.is_demo AND o.demo_key NOT LIKE '%/%'";
    await c.query(`DELETE FROM platform.product_roles WHERE NOT (user_id = ANY($1::uuid[])) AND tenant_id IN (${demoTenants})`, [ids]);
    n.outsiders = (await c.query(`DELETE FROM platform.memberships WHERE NOT (user_id = ANY($1::uuid[])) AND tenant_id IN (${demoTenants})`, [ids])).rowCount;
    n.invitations = (await c.query(`UPDATE platform.invitations SET revoked_at=now() WHERE accepted_at IS NULL AND revoked_at IS NULL AND tenant_id IN (${demoTenants})`)).rowCount;
    await audit(c, 'demo_reset', { metadata: n });
    return n;
  });
  const tenants = await ensureDemoOrgs(pool, settings, doc, { personas: opts.personas ?? [] });
  return { accounts, cleaned, tenants };
}

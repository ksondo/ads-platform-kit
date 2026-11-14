import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTransaction } from './db.mjs';
import { isDemoDomain } from './config.mjs';
import { demoAccessDeniedRedirect, ensurePersonalWorkspace } from './demo.mjs';
import { renderEmail } from './mailer.mjs';
import { fail, isEmail, normalizeEmail, randomToken, safeEqual, sha256 } from './security.mjs';

// ADS Demo Access: administrator-approved demonstrations (docs/demo-access/INTEGRATION_CONTRACT.md).
//
//   request (pending, 30 days) --approve--> grant (awaiting_activation) + single-use invitation (7 days)
//                              --reject---> neutral notice to the visitor
//   invitation accepted --> grant active for 30 days --> expired | revoked
//
// Each approved visitor gets their own demo organisations (a demo set "visit-<id>"), so the platform's
// own organisation scoping keeps one visitor's records away from another's. Every email goes through
// platform.demo_outbox: one row per message and recipient, retried with backoff, never queued twice.

const here = path.dirname(fileURLToPath(import.meta.url));
const configDir = path.resolve(here, '../../../config');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY = 86400;
const MAX_ATTEMPTS = 6;
export const VISITOR_SET_PREFIX = 'visit-';

const readJson = file => JSON.parse(readFileSync(file, 'utf8'));

// Loads and checks the platform registry against the persona and client lists.
export function loadPlatforms({ platformsFile, personasDoc, clientsDoc }) {
  const doc = readJson(platformsFile ?? path.join(configDir, 'demo-access-platforms.json'));
  const personas = personasDoc ?? readJson(path.join(configDir, 'demo-personas.json'));
  const clients = clientsDoc ?? readJson(path.join(configDir, 'clients.demo.json'));
  const out = new Map();
  for (const p of doc.platforms ?? []) {
    if (!/^[a-z][a-z0-9-]{1,39}$/.test(p.key ?? '')) throw new Error(`DEMO_ACCESS_PLATFORM_KEY_INVALID:${p.key}`);
    const client = clients.products.find(c => c.client_id === p.client_id);
    if (!client) throw new Error(`DEMO_ACCESS_CLIENT_UNKNOWN:${p.client_id}`);
    let deniedRedirect;
    try { deniedRedirect = demoAccessDeniedRedirect(client); } catch { throw new Error(`DEMO_ACCESS_DENIED_REDIRECT_INVALID:${p.client_id}`); }
    const defs = personas.products?.[p.product_slug]?.personas ?? [];
    const orgs = new Map((client.demo_orgs ?? []).map(o => [o.key, o]));
    const list = (p.personas ?? []).map(key => {
      const def = defs.find(d => d.key === key);
      if (!def) throw new Error(`DEMO_ACCESS_PERSONA_UNKNOWN:${p.key}:${key}`);
      // Internal demo personas (ADS staff and the shared demo set only) are never offered to a visitor.
      if (def.internal_only === true && p.key !== 'restaurant') throw new Error(`DEMO_ACCESS_PERSONA_INTERNAL_ONLY:${p.key}:${key}`);
      if (def.org !== 'personal' && (!orgs.has(def.org) || orgs.get(def.org).staff)) throw new Error(`DEMO_ACCESS_PERSONA_NOT_ALLOWED:${p.key}:${key}`);
      if ((client.ads_only_roles ?? []).some(r => def.roles.includes(r))) throw new Error(`DEMO_ACCESS_PERSONA_NOT_ALLOWED:${p.key}:${key}`);
      return { key: def.key, label: def.label, hint: def.hint ?? {}, org: def.org, roles: def.roles };
    });
    if (new Set(list.map(x => x.key)).size !== list.length) throw new Error(`DEMO_ACCESS_PERSONA_DUPLICATE:${p.key}`);
    if (!list.length) throw new Error(`DEMO_ACCESS_NO_PERSONAS:${p.key}`);
    const orgKeys = [...new Set(list.map(x => x.org).filter(o => o !== 'personal'))];
    if (!orgKeys.length) throw new Error(`DEMO_ACCESS_NO_ORGANISATION:${p.key}`);
    out.set(p.key, {
      key: p.key, prefix: String(p.reference_prefix ?? p.key.slice(0, 3)).toUpperCase(), name: p.name, clientId: p.client_id,
      slug: p.product_slug, origins: p.origins ?? [], entryUrl: p.entry_url, personas: list, deniedRedirect,
      orgs: orgKeys.map(k => ({ key: k, name: orgs.get(k).name })), inviteOrg: orgKeys.includes('main') ? 'main' : orgKeys[0],
    });
  }
  return out;
}

// The personas every visitor of a platform receives, in registry order. The ONE list shared by public
// (administrator-approved) and private (operator-provisioned) visitors, so the two cannot drift apart.
export const visitorPersonaKeys = p => p.personas.map(x => x.key);

// Explicit release scope. Registry presence alone does not certify a product for
// private operator provisioning. Other products need their own integration review.
// Fleet Guard (7 Nov 2026): explicit addition after its own review (single main organisation,
// owner_admin without Identity admin authority in visitor organisations, demo colleague persona).
// VentureWorks (11 Nov 2026): explicit addition after its own review (single main organisation, five
// visitor personas; tenant_admin, adviser, investor, partner and employee are not offered to visitors).
export const PRIVATE_VISITOR_PLATFORMS = new Set(['commerce', 'education', 'agriculture', 'tontine', 'fleet-guard', 'ventureworks', 'tourism', 'logistics', 'restaurant']);

export function createDemoAccess({ pool, config, mailer, audit, log = console, platforms }) {
  const settings = config.demoAccess;
  const registry = platforms ?? loadPlatforms({ platformsFile: settings.platformsFile });
  const platformOf = key => registry.get(key) ?? null;
  const nameOf = (p, locale = 'en') => p?.name?.[locale] ?? p?.name?.en ?? p?.key ?? '';

  const reference = p => {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const bytes = crypto.randomBytes(6);
    return `${p.prefix}-${new Date().getUTCFullYear()}-${[...bytes].map(b => alphabet[b % alphabet.length]).join('')}`;
  };
  const when = date => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: settings.timeZone }).format(date) + ` (${settings.timeZone})`;
  const reviewLink = id => `${settings.adminUrl}/demo-admin/requests/${id}`;

  // ---------- outbox ----------
  async function enqueue(db, { kind, requestId, recipient, template, data, dedupeKey }) {
    const message = renderEmail(template, data);
    const row = (await db.query(`INSERT INTO platform.demo_outbox(id,kind,request_id,recipient,subject,text_body,html_body,dedupe_key)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
    [crypto.randomUUID(), kind, requestId, recipient, message.subject, message.text, message.html, dedupeKey])).rows[0];
    return row?.id ?? null;
  }

  // Claims due messages (or the given ids) so two workers never send the same one.
  async function claim(ids = null) {
    await pool.query("UPDATE platform.demo_outbox SET status='queued' WHERE status='sending' AND next_attempt_at < now() - interval '10 minutes'");
    return (await pool.query(`UPDATE platform.demo_outbox SET status='sending', attempts=attempts+1, next_attempt_at=now()
      WHERE id IN (SELECT id FROM platform.demo_outbox WHERE status='queued' AND next_attempt_at<=now() ${ids ? 'AND id = ANY($1::uuid[])' : ''}
        ORDER BY created_at LIMIT 25 FOR UPDATE SKIP LOCKED) RETURNING *`, ids ? [ids] : [])).rows;
  }

  async function deliver(row) {
    try {
      await mailer.send({ to: row.recipient, subject: row.subject, text: row.text_body, html: row.html_body });
      await pool.query("UPDATE platform.demo_outbox SET status='sent', sent_at=now(), last_error=NULL WHERE id=$1", [row.id]);
      return true;
    } catch (error) {
      const gaveUp = row.attempts >= MAX_ATTEMPTS;
      const detail = String(error?.code ?? error?.responseCode ?? error?.message ?? 'SEND_FAILED').slice(0, 200);
      await pool.query(`UPDATE platform.demo_outbox SET status=$2, last_error=$3, next_attempt_at=now()+make_interval(mins => $4) WHERE id=$1`,
        [row.id, gaveUp ? 'failed' : 'queued', detail, 2 ** row.attempts]);
      log.warn?.(`demo email ${row.kind} to recipient ${sha256(row.recipient).slice(0, 8)} attempt ${row.attempts} failed: ${detail}`);
      return false;
    }
  }

  // Sends the given messages now; true only when every one was accepted by the mail provider in time.
  async function deliverNow(ids, timeoutMs = 8000) {
    const list = ids.filter(Boolean);
    if (!list.length) return false;
    const rows = await claim(list);
    if (rows.length !== list.length) return false;
    const all = Promise.all(rows.map(deliver)).then(r => r.every(Boolean));
    const timer = new Promise(resolve => setTimeout(() => resolve(false), timeoutMs).unref?.());
    return Promise.race([all, timer]);
  }

  async function processOutbox() {
    if (!settings.publicEnabled) return 0;
    let sent = 0;
    for (let round = 0; round < 4; round += 1) {
      const rows = await claim();
      if (!rows.length) break;
      for (const row of rows) if (await deliver(row)) sent += 1;
    }
    return sent;
  }

  // ---------- requests ----------
  async function submitRequest({ platform: key, email, locale, website, ip }) {
    if (!settings.publicEnabled) fail(404, 'NOT_FOUND');
    // Expired active grants must lose access before a subsequent application is considered.
    // The normal hourly expiry worker also performs this, but applications must not depend
    // on when the worker last ran.
    await housekeeping();
    const p = platformOf(String(key ?? ''));
    if (!p || p.key === 'restaurant') fail(400, 'PLATFORM_UNKNOWN');
    const normalized = normalizeEmail(email);
    if (!isEmail(normalized)) fail(400, 'EMAIL_INVALID');
    const lang = locale === 'fr' ? 'fr' : 'en';
    // Honeypot: answer as if accepted, store nothing.
    if (website) {
      await audit('demo_access_requested', { outcome: 'denied', reason: 'HONEYPOT', ip, clientId: p.clientId, metadata: { platform: p.key } });
      return { status: 'received', notified: false };
    }
    const result = await withTransaction(pool, async c => {
      // Serialise submissions for the same person and platform (a double-clicked form).
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`demo-request:${p.key}:${normalized}`]);
      const pending = (await c.query("SELECT id FROM platform.demo_access_requests WHERE platform=$1 AND email=$2 AND status='pending' AND expires_at>now() FOR UPDATE",
        [p.key, normalized])).rows[0];
      if (pending) return { duplicate: true, id: pending.id };
      // A pending request past its 30 days frees the slot for a new one.
      await c.query("UPDATE platform.demo_access_requests SET status='expired' WHERE platform=$1 AND email=$2 AND status='pending'", [p.key, normalized]);
      // An unaccepted, expired/revoked invitation cannot block this person indefinitely.
      await c.query(`UPDATE platform.demo_access_grants g SET status='expired'
        WHERE g.platform=$1 AND g.email=$2 AND g.status='awaiting_activation'
        AND EXISTS (SELECT 1 FROM platform.invitations i WHERE i.id=g.invitation_id
          AND (i.expires_at<=now() OR i.revoked_at IS NOT NULL))`, [p.key, normalized]);
      // Return the same neutral acknowledgement for an already-approved visitor.
      // Never issue parallel grants for one email and platform; a fresh request is
      // allowed after expiry or explicit revocation.
      const live = (await c.query(`SELECT id FROM platform.demo_access_grants
        WHERE platform=$1 AND email=$2 AND status IN ('awaiting_activation','active')
        LIMIT 1 FOR UPDATE`, [p.key, normalized])).rows[0];
      if (live) return { duplicate: true };
      const prior = (await c.query(`SELECT 1 FROM platform.demo_access_requests WHERE platform=$1 AND email=$2 AND status='rejected'
        AND decided_at > now() - interval '30 days' LIMIT 1`, [p.key, normalized])).rowCount > 0;
      const id = crypto.randomUUID();
      const ref = reference(p);
      const row = (await c.query(`INSERT INTO platform.demo_access_requests(id,reference,platform,email,locale,prior_rejection,expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,now()+make_interval(days => $7)) RETURNING *`, [id, ref, p.key, normalized, lang, prior, settings.requestTtlDays])).rows[0];
      const ids = [];
      if (!prior) {
        for (const recipient of settings.notifyTo) {
          ids.push(await enqueue(c, {
            kind: 'admin_notification', requestId: id, recipient, template: 'demo_request_admin', dedupeKey: `admin:${id}:${recipient}`,
            data: { platform: nameOf(p), email: normalized, reference: ref, when: when(row.created_at), link: reviewLink(id) },
          }));
        }
      }
      await audit('demo_access_requested', { outcome: 'allowed', reason: prior ? 'prior_rejection' : null, ip, clientId: p.clientId,
        metadata: { request_id: id, reference: ref, platform: p.key } }, c);
      return { id, ids };
    });
    if (result.duplicate) return { status: 'received', notified: false };
    const notified = result.ids.length ? await deliverNow(result.ids) : false;
    return { status: 'received', notified };
  }

  // ---------- administrators ----------
  // Only the accounts named in DEMO_ACCESS_ADMIN_EMAILS, active, real (not demo) and email-confirmed.
  async function adminOf(sso) {
    if (!settings.publicEnabled || !sso?.user?.id) return null;
    const u = (await pool.query("SELECT id, email FROM platform.users WHERE id=$1 AND status='active' AND NOT is_demo AND email_verified_at IS NOT NULL",
      [sso.user.id])).rows[0];
    return u && settings.adminEmails.includes(normalizeEmail(u.email)) ? { id: u.id, email: u.email } : null;
  }

  const requestRow = async (db, id, lock = false) => {
    if (!UUID.test(String(id))) fail(404, 'NOT_FOUND');
    const row = (await db.query(`SELECT * FROM platform.demo_access_requests WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [id])).rows[0];
    if (!row) fail(404, 'NOT_FOUND');
    return row;
  };
  const grantOf = async (db, requestId, lock = false) => (await db.query(`SELECT * FROM platform.demo_access_grants WHERE request_id=$1${lock ? ' FOR UPDATE' : ''}`, [requestId])).rows[0] ?? null;
  const adminAudit = (event, adminUser, req, extra, db) => audit(event, {
    userId: adminUser.id, outcome: 'allowed', reason: 'demo_admin', clientId: platformOf(req.platform)?.clientId ?? null,
    metadata: { request_id: req.id, reference: req.reference, platform: req.platform, ...extra },
  }, db);

  // Creates the visitor's own demo organisations for the platform (inside the caller's transaction).
  async function createVisitorOrgs(c, p, set) {
    const tenants = {};
    for (const org of p.orgs) {
      const orgId = crypto.randomUUID();
      const tenantId = crypto.randomUUID();
      const key = `${set}/${p.slug}:${org.key}`;
      const name = `${org.name} [${set}]`;
      await c.query("INSERT INTO platform.organizations(id,name,slug,kind,is_demo,is_staff,demo_key) VALUES ($1,$2,$3,'organization',true,false,$4)",
        [orgId, name, `demo-${key.replace(/[^a-z0-9]+/g, '-')}`, key]);
      await c.query('INSERT INTO platform.tenants(id,organization_id,name) VALUES ($1,$2,$3)', [tenantId, orgId, name]);
      tenants[org.key] = tenantId;
    }
    return tenants;
  }

  async function newInvitation(c, grant, p, adminUser, locale) {
    const token = randomToken(32);
    const id = crypto.randomUUID();
    const allowed = new Set(grant.personas ?? []);
    const roles = [...new Set(p.personas.filter(x => allowed.has(x.key) && x.org === p.inviteOrg).flatMap(x => x.roles))];
    await c.query(`INSERT INTO platform.invitations(id,tenant_id,client_id,email,roles,org_admin,locale,token_hash,invited_by,expires_at)
      VALUES ($1,$2,$3,$4,$5,false,$6,$7,$8,now()+make_interval(days => $9))`,
    [id, grant.tenants[p.inviteOrg], p.clientId, grant.email, roles, locale, sha256(token), adminUser.id, settings.invitationTtlDays]);
    await c.query('UPDATE platform.demo_access_grants SET invitation_id=$2 WHERE id=$1', [grant.id, id]);
    const outboxId = await enqueue(c, {
      kind: 'invitation', requestId: grant.request_id, recipient: grant.email, template: 'demo_invitation', dedupeKey: `invite:${id}`,
      data: { platform: nameOf(p), link: `${config.publicUrl}/invite?token=${token}`, days: settings.invitationTtlDays, grantDays: settings.grantDays },
    });
    return { invitationId: id, outboxId };
  }

  async function approve(adminUser, id) {
    if (!settings.publicEnabled) fail(404, 'NOT_FOUND');
    const result = await withTransaction(pool, async c => {
      const req = await requestRow(c, id, true);
      if (req.status !== 'pending' || new Date(req.expires_at) <= new Date()) fail(409, 'REQUEST_NOT_PENDING');
      const p = platformOf(req.platform);
      if (!p) fail(409, 'PLATFORM_UNKNOWN');
      const grantId = crypto.randomUUID();
      const set = `${VISITOR_SET_PREFIX}${grantId.replace(/-/g, '').slice(0, 12)}`;
      const tenants = await createVisitorOrgs(c, p, set);
      const grant = (await c.query(`INSERT INTO platform.demo_access_grants(id,request_id,platform,email,client_id,demo_set,personas,tenants)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *`, [grantId, req.id, p.key, req.email, p.clientId, set, visitorPersonaKeys(p), JSON.stringify(tenants)])).rows[0];
      await c.query("UPDATE platform.demo_access_requests SET status='approved', decided_at=now(), decided_by=$2 WHERE id=$1", [req.id, adminUser.id]);
      const inv = await newInvitation(c, grant, p, adminUser, req.locale);
      await adminAudit('demo_access_approved', adminUser, req, { grant_id: grantId, demo_set: set, invitation_id: inv.invitationId }, c);
      return inv;
    });
    await deliverNow([result.outboxId]);
    return { done: 'approved' };
  }

  async function reject(adminUser, id, note) {
    if (!settings.publicEnabled) fail(404, 'NOT_FOUND');
    const outboxId = await withTransaction(pool, async c => {
      const req = await requestRow(c, id, true);
      if (req.status !== 'pending') fail(409, 'REQUEST_NOT_PENDING');
      const clean = String(note ?? '').trim().slice(0, 500) || null;
      await c.query("UPDATE platform.demo_access_requests SET status='rejected', decided_at=now(), decided_by=$2, internal_note=$3 WHERE id=$1", [req.id, adminUser.id, clean]);
      await adminAudit('demo_access_rejected', adminUser, req, {}, c);
      return enqueue(c, { kind: 'rejection', requestId: req.id, recipient: req.email, template: 'demo_rejected', dedupeKey: `reject:${req.id}`,
        data: { platform: nameOf(platformOf(req.platform)) } });
    });
    await deliverNow([outboxId]);
    return { done: 'rejected' };
  }

  async function resend(adminUser, id) {
    if (!settings.publicEnabled) fail(404, 'NOT_FOUND');
    const outboxId = await withTransaction(pool, async c => {
      const req = await requestRow(c, id, true);
      const grant = await grantOf(c, req.id, true);
      if (!grant || grant.status !== 'awaiting_activation') fail(409, 'NOTHING_TO_RESEND');
      // A double-clicked Resend must not cancel the link that was emailed a moment ago.
      const recent = grant.invitation_id && (await c.query("SELECT 1 FROM platform.invitations WHERE id=$1 AND created_at > now() - interval '60 seconds'", [grant.invitation_id])).rowCount;
      if (recent) fail(409, 'RESENT_RECENTLY');
      const p = platformOf(req.platform);
      if (grant.invitation_id) await c.query('UPDATE platform.invitations SET revoked_at=now(), revoked_by=$2 WHERE id=$1 AND accepted_at IS NULL AND revoked_at IS NULL', [grant.invitation_id, adminUser.id]);
      const inv = await newInvitation(c, grant, p, adminUser, req.locale);
      await adminAudit('demo_access_invitation_resent', adminUser, req, { invitation_id: inv.invitationId }, c);
      return inv.outboxId;
    });
    await deliverNow([outboxId]);
    return { done: 'resent' };
  }

  // Takes the visitor's access to the platform away: roles in their demo set, its sign-ins, the invitation.
  // Refresh tokens are ended for the whole platform client: on the demo host a visitor holds no other access to it.
  async function closeAccess(c, grant) {
    const tenantIds = Object.values(grant.tenants ?? {});
    if (grant.invitation_id) await c.query('UPDATE platform.invitations SET revoked_at=now() WHERE id=$1 AND accepted_at IS NULL AND revoked_at IS NULL', [grant.invitation_id]);
    if (!grant.user_id) return;
    await c.query('DELETE FROM platform.product_roles WHERE user_id=$1 AND client_id=$2 AND tenant_id = ANY($3::uuid[])', [grant.user_id, grant.client_id, tenantIds]);
    await c.query("UPDATE platform.memberships SET status='disabled' WHERE user_id=$1 AND tenant_id = ANY($2::uuid[])", [grant.user_id, tenantIds]);
    await c.query('UPDATE platform.refresh_tokens SET revoked_at=now() WHERE user_id=$1 AND client_id=$2 AND revoked_at IS NULL', [grant.user_id, grant.client_id]);
  }

  async function revoke(adminUser, id) {
    await withTransaction(pool, async c => {
      const req = await requestRow(c, id, true);
      // Lock in the same order as invitation acceptance (invitation, then grant) so the two never deadlock.
      const pre = await grantOf(c, req.id);
      if (pre?.invitation_id) await c.query('SELECT 1 FROM platform.invitations WHERE id=$1 FOR UPDATE', [pre.invitation_id]);
      const grant = await grantOf(c, req.id, true);
      if (!grant || !['awaiting_activation', 'active'].includes(grant.status)) fail(409, 'GRANT_NOT_ACTIVE');
      await c.query("UPDATE platform.demo_access_grants SET status='revoked', revoked_at=now(), revoked_by=$2 WHERE id=$1", [grant.id, adminUser.id]);
      await closeAccess(c, grant);
      await adminAudit('demo_access_revoked', adminUser, req, { grant_id: grant.id }, c);
    });
    return { done: 'revoked' };
  }

  // Canonical activation used by invitation acceptance and the private operator command.
  // Identity authentication remains in accounts/OAuth; this only assigns the approved grant.
  async function activateGrant(c, grant, p, account, { grantedBy = null, days = settings.grantDays } = {}) {
    if (grant.status !== 'awaiting_activation') fail(400, 'INVITATION_INVALID');
    const tenants = grant.tenants ?? {};
    const allowed = new Set(grant.personas ?? []);
    for (const org of p.orgs) {
      const roles = [...new Set(p.personas.filter(x => allowed.has(x.key) && x.org === org.key).flatMap(x => x.roles))];
      if (!roles.length) continue;
      await c.query(`INSERT INTO platform.memberships(user_id,tenant_id,role,scopes) VALUES ($1,$2,'member','{}')
        ON CONFLICT (user_id,tenant_id) DO UPDATE SET status='active'`, [account.id, tenants[org.key]]);
      await c.query(`INSERT INTO platform.product_roles(user_id,tenant_id,client_id,roles,granted_by) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (user_id,tenant_id,client_id) DO UPDATE SET roles=EXCLUDED.roles, updated_at=now()`, [account.id, tenants[org.key], p.clientId, roles, grantedBy]);
    }
    if (p.personas.some(x => allowed.has(x.key) && x.org === 'personal')) await ensurePersonalWorkspace(c, account.id, account.email);
    await c.query(`UPDATE platform.demo_access_grants SET user_id=$2, status='active', activated_at=now(), expires_at=now()+make_interval(days => $3) WHERE id=$1`,
      [grant.id, account.id, days]);
    await audit('demo_access_activated', { userId: account.id, outcome: 'allowed', clientId: p.clientId,
      metadata: { grant_id: grant.id, request_id: grant.request_id, platform: p.key } }, c);
    return { productUrl: p.entryUrl };
  }

  // Called by acceptInvitation inside its transaction. Ordinary invitations are unchanged.
  async function onInvitationAccepted(c, inv, account) {
    const grant = (await c.query('SELECT * FROM platform.demo_access_grants WHERE invitation_id=$1 FOR UPDATE', [inv.id])).rows[0];
    if (!grant) return null;
    const p = platformOf(grant.platform);
    if (!p) fail(400, 'INVITATION_INVALID');
    return activateGrant(c, grant, p, account, { grantedBy: inv.invited_by });
  }

  // Operator-only service method, deliberately absent from every HTTP router.
  // The separate existing-account command requires an exact account ID as well as its email.
  async function provisionPrivate({ email, passwordHash, operatorRef, locale = 'en', beforeCommit, platform = 'commerce' }, existingUserId = null) {
    if (!config.demo.enabled || !settings.privateEnabled || settings.publicEnabled) fail(403, 'PRIVATE_VISITOR_MODE_REQUIRED');
    const normalized = normalizeEmail(email);
    if (!isEmail(normalized) || isDemoDomain(normalized, config.demo.domain)) fail(400, 'EMAIL_INVALID');
    if (typeof operatorRef !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 ._:@/-]{2,119}$/.test(operatorRef)) fail(400, 'OPERATOR_REFERENCE_REQUIRED');
    if (!existingUserId && !/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(String(passwordHash))) fail(400, 'PASSWORD_HASH_REQUIRED');
    if (!PRIVATE_VISITOR_PLATFORMS.has(platform)) fail(400, 'PRIVATE_VISITOR_PLATFORM_NOT_SUPPORTED');
    const p = platformOf(platform);
    if (!p) fail(409, 'PRIVATE_VISITOR_PERSONA_REGISTRY_INVALID');
    if (String(settings.checkSecrets[p.key.replace(/-/g, '_')] ?? '').length < 32) fail(409, 'PRIVATE_VISITOR_PLATFORM_SECRET_REQUIRED');
    // Same visitor persona list as an administrator-approved (public) visitor: config/demo-access-platforms.json.
    const required = visitorPersonaKeys(p);
    return withTransaction(pool, async c => {
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`demo-request:${p.key}:${normalized}`]);
      const account = (await c.query('SELECT id,status,is_demo FROM platform.users WHERE email=$1 FOR UPDATE', [normalized])).rows[0];
      if (existingUserId) {
        if (account?.id !== existingUserId || account.status !== 'active' || account.is_demo) fail(409, 'PRIVATE_VISITOR_ACCOUNT_NOT_ELIGIBLE');
      } else if (account) fail(409, 'PRIVATE_VISITOR_ACCOUNT_EXISTS');
      if ((await c.query("SELECT 1 FROM platform.demo_access_grants WHERE platform=$1 AND email=$2 AND status IN ('active','awaiting_activation')", [p.key, normalized])).rowCount) fail(409, 'PRIVATE_VISITOR_GRANT_EXISTS');
      const client = (await c.query("SELECT * FROM platform.oauth_clients WHERE client_id=$1 AND status='active'", [p.clientId])).rows[0];
      const personalRoles = p.personas.filter(x => x.org === 'personal').flatMap(x => x.roles);
      // Organisation roles are the validated non-staff registry roles, exactly
      // as in ordinary invitation activation. They need not be self-service or
      // delegated staff-invitation roles (Education's partner_admin, for example).
      if (!client || (personalRoles.length && (!client.allow_personal_workspace ||
        personalRoles.some(role => !client.self_service_roles.includes(role))))) fail(409, 'PRIVATE_VISITOR_CLIENT_NOT_READY');
      const userId = existingUserId ?? crypto.randomUUID(), requestId = crypto.randomUUID(), grantId = crypto.randomUUID();
      // The operator confirms the private test contact, NOT ownership of its mailbox.
      if (!existingUserId) await c.query("INSERT INTO platform.users(id,email,password_hash,status,locale,is_demo) VALUES ($1,$2,$3,'active',$4,false)", [userId, normalized, passwordHash, locale === 'fr' ? 'fr' : 'en']);
      const ref = reference(p), set = `${VISITOR_SET_PREFIX}${grantId.replace(/-/g, '').slice(0, 12)}`;
      await c.query(`INSERT INTO platform.demo_access_requests(id,reference,platform,email,locale,status,expires_at,decided_at,internal_note)
        VALUES ($1,$2,$3,$4,$5,'approved',now()+interval '30 days',now(),$6)`,
      [requestId, ref, p.key, normalized, locale === 'fr' ? 'fr' : 'en', `Private operator provisioning: ${operatorRef}; mailbox not verified`]);
      const tenants = await createVisitorOrgs(c, p, set);
      const grant = (await c.query(`INSERT INTO platform.demo_access_grants(id,request_id,platform,email,client_id,demo_set,personas,tenants)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *`, [grantId, requestId, p.key, normalized, p.clientId, set, required, JSON.stringify(tenants)])).rows[0];
      await activateGrant(c, grant, p, { id: userId, email: normalized }, { days: 30 });
      await audit('demo_access_private_provisioned', { userId, outcome: 'allowed', reason: 'operator_cli', clientId: p.clientId,
        metadata: { request_id: requestId, grant_id: grantId, reference: ref, platform: p.key, operator_ref: operatorRef, contact_confirmation: 'operator_private_contact', ...(existingUserId ? { existing_account: true } : { mailbox_verified: false }) } }, c);
      const active = (await c.query('SELECT expires_at FROM platform.demo_access_grants WHERE id=$1', [grantId])).rows[0];
      const result = { userId, grantId, reference: ref, email: normalized, expiresAt: new Date(active.expires_at).toISOString(), personas: required, platform: p.key };
      // The operator persists the generated credential before COMMIT. Failure rolls back provisioning.
      if (beforeCommit) await beforeCommit(result);
      return result;
    });
  }

  async function assignPrivate({ userId, email, operatorRef, platform, apply }) {
    if (apply !== 'yes') fail(400, 'PRIVATE_VISITOR_EXPLICIT_APPLY_REQUIRED');
    if (!UUID.test(String(userId))) fail(400, 'PRIVATE_VISITOR_INPUT_INVALID');
    if (!['tourism', 'logistics', 'restaurant'].includes(platform)) fail(400, 'PRIVATE_VISITOR_PLATFORM_NOT_SUPPORTED');
    return provisionPrivate({ email, operatorRef, platform }, userId);
  }

  async function revokePrivate({ grantId, operatorRef }) {
    if (!config.demo.enabled || !settings.privateEnabled || settings.publicEnabled) fail(403, 'PRIVATE_VISITOR_MODE_REQUIRED');
    if (!UUID.test(String(grantId)) || !/^[A-Za-z0-9][A-Za-z0-9 ._:@/-]{2,119}$/.test(String(operatorRef))) fail(400, 'PRIVATE_VISITOR_INPUT_INVALID');
    return withTransaction(pool, async c => {
      const grant = (await c.query('SELECT * FROM platform.demo_access_grants WHERE id=$1 FOR UPDATE', [grantId])).rows[0];
      if (!grant || !PRIVATE_VISITOR_PLATFORMS.has(grant.platform) || !platformOf(grant.platform) || grant.invitation_id) fail(404, 'PRIVATE_VISITOR_GRANT_NOT_FOUND');
      const provenance = (await c.query("SELECT 1 FROM platform.identity_audit WHERE event_type='demo_access_private_provisioned' AND metadata->>'grant_id'=$1", [grantId])).rowCount;
      if (!provenance) fail(404, 'PRIVATE_VISITOR_GRANT_NOT_FOUND');
      if (!['active','revoked'].includes(grant.status)) fail(409, 'GRANT_NOT_ACTIVE');
      if (grant.status === 'revoked') return { grantId, status: 'revoked', duplicate: true };
      await c.query("UPDATE platform.demo_access_grants SET status='revoked',revoked_at=now() WHERE id=$1", [grantId]);
      await closeAccess(c, grant);
      await audit('demo_access_private_revoked', { userId: grant.user_id, outcome: 'allowed', reason: 'operator_cli', clientId: grant.client_id,
        metadata: { grant_id: grantId, request_id: grant.request_id, operator_ref: operatorRef, platform: grant.platform } }, c);
      return { grantId, status: 'revoked', duplicate: false };
    });
  }

  // ---------- grant check (platform server) ----------
  function checkSecret(platformKey, presented) {
    const expected = settings.checkSecrets[String(platformKey).replace(/-/g, '_')];
    if (!expected || typeof presented !== 'string' || !safeEqual(sha256(presented), sha256(expected))) fail(401, 'UNAUTHENTICATED');
  }

  async function checkGrant(platformKey, sub, { db = pool, recordActivity = true } = {}) {
    const p = platformOf(String(platformKey ?? ''));
    if (!p) fail(404, 'PLATFORM_UNKNOWN');
    if (!UUID.test(String(sub ?? ''))) fail(400, 'SUB_INVALID');
    const user = (await db.query("SELECT id, is_demo, status FROM platform.users WHERE id=$1", [sub])).rows[0];
    if (!user || user.status !== 'active') return { access: 'none', reason: 'NO_GRANT' };
    if (user.is_demo) return { access: 'internal' };
    const grant = (await db.query(`SELECT * FROM platform.demo_access_grants WHERE user_id=$1 AND client_id=$2
      ORDER BY (status='active') DESC, activated_at DESC NULLS LAST LIMIT 1`, [sub, p.clientId])).rows[0];
    if (!grant) return { access: 'none', reason: 'NO_GRANT' };
    if (grant.status === 'revoked') return { access: 'none', reason: 'REVOKED' };
    if (grant.status !== 'active' || !grant.expires_at || new Date(grant.expires_at) <= new Date()) return { access: 'none', reason: 'EXPIRED' };
    if (recordActivity) await db.query(`UPDATE platform.demo_access_grants SET first_login_at=coalesce(first_login_at, now()), last_activity_at=now()
      WHERE id=$1 AND (last_activity_at IS NULL OR last_activity_at < now() - interval '5 minutes')`, [grant.id]);
    const personal = (await db.query(`SELECT m.tenant_id FROM platform.memberships m JOIN platform.tenants t ON t.id=m.tenant_id
      JOIN platform.organizations o ON o.id=t.organization_id WHERE m.user_id=$1 AND o.kind='personal' AND m.status='active' ORDER BY m.created_at LIMIT 1`, [sub])).rows[0];
    const tenants = { ...(grant.tenants ?? {}), personal: personal?.tenant_id ?? null };
    return {
      access: 'granted', grantId: grant.id, expiresAt: new Date(grant.expires_at).toISOString(),
      personas: p.personas.filter(x => grant.personas.includes(x.key) && tenants[x.org])
        .map(x => ({ key: x.key, label: x.label, hint: x.hint, org: x.org, tenantId: tenants[x.org], roles: x.roles })),
    };
  }

  // ---------- housekeeping (hourly, and before dashboard reads) ----------
  async function housekeeping() {
    await pool.query("UPDATE platform.demo_access_requests SET status='expired' WHERE status='pending' AND expires_at <= now()");
    const due = (await pool.query("SELECT id FROM platform.demo_access_grants WHERE status='active' AND expires_at <= now()")).rows;
    for (const { id } of due) {
      await withTransaction(pool, async c => {
        const grant = (await c.query("SELECT * FROM platform.demo_access_grants WHERE id=$1 AND status='active' FOR UPDATE", [id])).rows[0];
        if (!grant) return;
        await c.query("UPDATE platform.demo_access_grants SET status='expired' WHERE id=$1", [id]);
        await closeAccess(c, grant);
        await audit('demo_access_expired', { userId: grant.user_id, outcome: 'allowed', clientId: grant.client_id,
          metadata: { grant_id: grant.id, request_id: grant.request_id, platform: grant.platform } }, c);
      });
    }
    return due.length;
  }

  // ---------- dashboard data ----------
  const notificationState = rows => {
    const admins = rows.filter(r => r.kind === 'admin_notification');
    if (!admins.length) return 'none';
    if (admins.every(r => r.status === 'sent')) return 'sent';
    if (admins.some(r => r.status === 'failed')) return 'failed';
    return 'queued';
  };

  async function overview({ status, platform, q } = {}) {
    await housekeeping();
    const filters = { status: ['pending', 'approved', 'rejected', 'expired', 'cancelled'].includes(status) ? status : '', platform: registry.has(platform) ? platform : '', q: String(q ?? '').trim().slice(0, 100) };
    const counts = (await pool.query(`SELECT
      (SELECT count(*) FROM platform.demo_access_requests WHERE status='pending')::int AS pending,
      (SELECT count(*) FROM platform.demo_access_grants WHERE status='awaiting_activation')::int AS awaiting,
      (SELECT count(*) FROM platform.demo_access_grants WHERE status='active')::int AS active,
      (SELECT count(*) FROM platform.demo_access_grants WHERE status='active' AND expires_at < now()+interval '7 days')::int AS soon`)).rows[0];
    const rows = (await pool.query(`SELECT r.*, g.status AS grant_status, g.expires_at AS grant_expires,
        coalesce((SELECT json_agg(json_build_object('kind',o.kind,'status',o.status)) FROM platform.demo_outbox o WHERE o.request_id=r.id), '[]') AS emails
      FROM platform.demo_access_requests r LEFT JOIN platform.demo_access_grants g ON g.request_id=r.id
      WHERE ($1='' OR r.status=$1) AND ($2='' OR r.platform=$2) AND ($3='' OR r.email ILIKE '%'||$3||'%' OR r.reference ILIKE '%'||$3||'%')
      ORDER BY r.created_at DESC LIMIT 200`, [filters.status, filters.platform, filters.q.replace(/[%_\\]/g, '')])).rows;
    return {
      counts: { pending: counts.pending, awaitingActivation: counts.awaiting, active: counts.active, expiringSoon: counts.soon },
      filters, platforms: [...registry.values()].map(p => ({ key: p.key, name: nameOf(p) })),
      requests: rows.map(r => ({
        id: r.id, reference: r.reference, platform: r.platform, platformName: nameOf(platformOf(r.platform)) || r.platform, email: r.email, status: r.status,
        createdAt: iso(r.created_at), priorRejection: r.prior_rejection, notification: notificationState(r.emails), grantStatus: r.grant_status ?? null, expiresAt: iso(r.grant_expires),
      })),
    };
  }

  async function detail(id) {
    await housekeeping();
    const req = await requestRow(pool, id);
    const p = platformOf(req.platform);
    const grant = await grantOf(pool, req.id);
    const decidedBy = req.decided_by ? (await pool.query('SELECT email FROM platform.users WHERE id=$1', [req.decided_by])).rows[0]?.email ?? null : null;
    const inv = grant?.invitation_id ? (await pool.query('SELECT * FROM platform.invitations WHERE id=$1', [grant.invitation_id])).rows[0] : null;
    const invStatus = !inv ? null : inv.accepted_at ? 'accepted' : inv.revoked_at ? 'revoked' : new Date(inv.expires_at) <= new Date() ? 'expired' : 'pending';
    const emails = (await pool.query('SELECT * FROM platform.demo_outbox WHERE request_id=$1 ORDER BY created_at', [req.id])).rows;
    const history = (await pool.query(`SELECT a.event_type, a.ts, u.email AS actor, a.metadata FROM platform.identity_audit a
      LEFT JOIN platform.users u ON u.id=a.user_id WHERE a.event_type LIKE 'demo_access_%' AND a.metadata->>'request_id'=$1 ORDER BY a.ts`, [req.id])).rows;
    return {
      request: { id: req.id, reference: req.reference, platform: req.platform, platformName: nameOf(p) || req.platform, email: req.email, locale: req.locale, status: req.status,
        createdAt: iso(req.created_at), expiresAt: iso(req.expires_at), decidedAt: iso(req.decided_at), decidedBy, internalNote: req.internal_note, priorRejection: req.prior_rejection },
      grant: grant && {
        status: grant.status, personas: (p?.personas ?? []).filter(x => grant.personas.includes(x.key)).map(x => ({ key: x.key, label: x.label })),
        invitation: { status: invStatus, expiresAt: iso(inv?.expires_at) }, activatedAt: iso(grant.activated_at), expiresAt: iso(grant.expires_at),
        firstLoginAt: iso(grant.first_login_at), lastActivityAt: iso(grant.last_activity_at), revokedAt: iso(grant.revoked_at),
      },
      emails: emails.map(e => ({ kind: e.kind, recipient: e.recipient, status: e.status, attempts: e.attempts, lastError: e.last_error, sentAt: iso(e.sent_at), createdAt: iso(e.created_at) })),
      history: history.map(h => ({ at: iso(h.ts), event: h.event_type, actor: h.actor ?? '', detail: h.metadata?.reason ?? '' })),
      actions: {
        approve: req.status === 'pending', reject: req.status === 'pending',
        resend: grant?.status === 'awaiting_activation', revoke: ['awaiting_activation', 'active'].includes(grant?.status),
      },
    };
  }

  async function auditLog() {
    const rows = (await pool.query(`SELECT a.event_type, a.ts, u.email AS actor, a.metadata, a.outcome, a.reason FROM platform.identity_audit a
      LEFT JOIN platform.users u ON u.id=a.user_id WHERE a.event_type LIKE 'demo_access_%' ORDER BY a.ts DESC LIMIT 300`)).rows;
    return { events: rows.map(r => ({ at: iso(r.ts), event: r.event_type, actor: r.actor ?? '', reference: r.metadata?.reference ?? '', platform: r.metadata?.platform ?? '',
      detail: r.outcome === 'denied' ? `denied: ${r.reason ?? ''}` : (r.reason ?? '') })) };
  }

  const allowedOrigin = (origin, key) => {
    const list = key ? platformOf(key)?.origins ?? [] : [...registry.values()].flatMap(p => p.origins);
    return typeof origin === 'string' && list.includes(origin) ? origin : null;
  };

  const isDemoInvitation = async id => UUID.test(String(id)) && (await pool.query("SELECT 1 FROM platform.demo_access_grants WHERE invitation_id=$1 AND status='awaiting_activation'", [id])).rowCount > 0;

  return {
    enabled: settings.enabled, isDemoInvitation, registry, platformOf, submitRequest, adminOf, approve, reject, resend, revoke, onInvitationAccepted,
    checkSecret, checkGrant, housekeeping, processOutbox, overview, detail, auditLog, allowedOrigin, provisionPrivate, assignPrivate, revokePrivate,
  };
}

const iso = v => (v ? new Date(v).toISOString() : null);

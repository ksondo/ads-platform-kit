// BRIEF18 personal demo sandboxes (kit side): registry, sign-up with a one-time code and daily
// limits, provisioning (identity organisations + personas, then each product's
// POST /internal/demo/sandboxes), "Switch role" inside one's own sandbox, expiry warnings and deletion.
//
// Demo environment only (ADS_ENV=demo AND DEMO_MODE=1 AND DEMO_SANDBOXES=1). Every write to sandbox
// rows goes through `demoPool`, a connection pool opened with ads.demo_mode=on; the database refuses
// sandbox rows from any other connection (migrations/007_demo_sandboxes.sql).
import crypto from 'node:crypto';
import { jwtVerify } from 'jose';
import pg from 'pg';
import * as demoModule from './demo.mjs';
import { withTransaction } from './db.mjs';
import { readJsonFile } from './sandbox-config.mjs';
import { callProduct, mapLimit } from './sandbox-provisioning.mjs';
import { HttpError, fail, isEmail, normalizeEmail, randomToken, safeEqual } from './security.mjs';

const DAY_MS = 86_400_000;
const SANDBOX_ID = /^sb-[a-z0-9]{10}$/;
const PERSONA_KEY = /^[a-z][a-z0-9-]{0,39}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const LIVE = ['provisioning', 'ready', 'partial'];
export const TOKEN_EXCHANGE = 'urn:ietf:params:oauth:grant-type:token-exchange';
export const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';

export class SandboxError extends HttpError {}
const refuse = (status, code) => { throw new SandboxError(status, code); };

export const newSandboxId = () => {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = 'sb-';
  for (let i = 0; i < 10; i += 1) s += alphabet[crypto.randomInt(alphabet.length)];
  return s;
};

// Email or mobile number typed on the sign-up page -> { kind, value, channel }.
// Phones: international format (+237 6xx xx xx xx); a 9-digit Cameroon mobile number (6xxxxxxxx) gets +237.
export function normalizeContact(raw, { demoDomain } = {}) {
  const text = String(raw ?? '').trim();
  if (!text || text.length > 254) refuse(400, 'CONTACT_INVALID');
  if (text.includes('@')) {
    const email = normalizeEmail(text);
    if (!isEmail(email)) refuse(400, 'EMAIL_INVALID');
    if (demoDomain) {
      const at = email.split('@')[1];
      if (at === demoDomain || at.endsWith(`.${demoDomain}`)) refuse(400, 'EMAIL_RESERVED');
    }
    return { kind: 'email', value: email, channel: 'email' };
  }
  let phone = text.replace(/[\s().-]/g, '');
  if (/^00[1-9]/.test(phone)) phone = `+${phone.slice(2)}`;
  if (/^6\d{8}$/.test(phone)) phone = `+237${phone}`;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) refuse(400, 'PHONE_INVALID');
  return { kind: 'phone', value: phone, channel: 'sms' };
}

// "k***@example.com", "+237 ••• •• 34".
export const maskContact = (kind, value) => (kind === 'email'
  ? value.replace(/^(.)[^@]*(@.*)$/, (_, a, b) => `${a}***${b}`)
  : `${value.slice(0, 4)} ••• ${value.slice(-2)}`);

// Messages (sign-up code, expiry warnings): bilingual, the tester's language first.
const MESSAGES = {
  code: {
    en: ({ code, minutes }) => `Your ADS demo code is ${code}. It expires in ${minutes} minutes. If you did not ask for it, ignore this message.`,
    fr: ({ code, minutes }) => `Votre code de démo ADS est ${code}. Il expire dans ${minutes} minutes. Si vous ne l'avez pas demandé, ignorez ce message.`,
    subject: { en: 'Your ADS demo code', fr: 'Votre code de démo ADS' },
  },
  warning: {
    en: ({ days, date }) => `Your ADS demo sandbox will be deleted in ${days === 1 ? '1 day' : `${days} days`} (${date}), with all its test data and your demo account. To keep it longer, reply to ask ADS for an extension.`,
    fr: ({ days, date }) => `Votre espace de démo ADS sera supprimé dans ${days === 1 ? '1 jour' : `${days} jours`} (${date}), avec toutes ses données de test et votre compte de démo. Pour le garder plus longtemps, répondez pour demander une prolongation à ADS.`,
    subject: { en: 'Your ADS demo ends soon', fr: 'Votre démo ADS se termine bientôt' },
  },
};
const bilingual = (kind, locale, vars) => {
  const order = locale === 'fr' ? ['fr', 'en'] : ['en', 'fr'];
  return { subject: `${MESSAGES[kind].subject[order[0]]} / ${MESSAGES[kind].subject[order[1]]}`, text: order.map(l => MESSAGES[kind][l](vars)).join('\n\n') };
};

export function openDemoPool(databaseUrl, max = 4) {
  // Only ever opened in demo mode: the database accepts sandbox rows only from such a connection.
  return new pg.Pool({ connectionString: databaseUrl, max, options: '-c ads.demo_mode=on', idleTimeoutMillis: 5000, allowExitOnIdle: true });
}

// sandbox: sandboxSettings(); demo: demoSettings(); hashKey: server secret used to key the hashes of
// IP addresses and contacts (the cookie secret).
export function createSandboxes({ pool, demoPool, demo, sandbox, hashKey, mailer = null, oauth = null, jwks = null, issuer = null, log = console,
  fetchImpl = fetch, wait, docs = null, now = () => new Date(), minPasswordLength = 10 }) {
  const enabled = Boolean(demo?.enabled && sandbox?.enabled);
  const assertEnabled = () => { if (!enabled) refuse(404, 'NOT_FOUND'); };
  const keyed = (kind, value) => crypto.createHmac('sha256', String(hashKey || 'ads-demo-sandboxes')).update(`${kind}:${value}`).digest('hex');
  const background = new Set();

  async function audit(db, event, { userId = null, tenantId = null, outcome = 'allowed', reason = null, ip = null, clientId = null, metadata = {} } = {}) {
    await db.query(`INSERT INTO platform.identity_audit(event_type,user_id,tenant_id,outcome,reason,metadata,ip,client_id)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`, [event, userId, tenantId, outcome, reason, JSON.stringify(metadata), ip, clientId]);
  }

  // ---------- configuration files ----------
  let cachedDocs = null;
  function loadDocs() {
    if (docs) return docs;
    cachedDocs ??= {
      clients: readJsonFile(sandbox.files.clients),
      personas: readJsonFile(sandbox.files.personas),
      products: readJsonFile(sandbox.files.products),
    };
    return cachedDocs;
  }
  const productBaseUrl = slug => {
    const entry = loadDocs().products?.products?.[slug];
    const url = typeof entry === 'string' ? entry : entry?.base_url;
    return typeof url === 'string' && /^https?:\/\//.test(url) ? url : null;
  };
  // Only products registered as sign-in clients here (so a partly configured environment still works).
  async function clientsInUse(db = pool) {
    const doc = loadDocs().clients;
    const registered = new Set((await db.query("SELECT client_id FROM platform.oauth_clients WHERE status='active'")).rows.map(r => r.client_id));
    return { ...doc, products: doc.products.filter(p => registered.has(p.client_id)) };
  }
  const displayName = clientId => (loadDocs().clients.products.find(p => p.client_id === clientId)?.display_name ?? clientId);

  // ---------- daily limits (PostgreSQL, so they hold across restarts and instances) ----------
  async function bump(kind, key, limit) {
    const count = (await pool.query(`INSERT INTO platform.demo_signup_counters(kind,key_hash,day,count) VALUES ($1,$2,(now() AT TIME ZONE 'utc')::date,1)
      ON CONFLICT (kind,key_hash,day) DO UPDATE SET count=platform.demo_signup_counters.count+1 RETURNING count`, [kind, keyed(kind, key)])).rows[0].count;
    if (count > limit) refuse(429, 'DAILY_LIMIT_REACHED');
  }

  // ---------- sending (kit mocks / notification path) ----------
  async function postJson(url, body) {
    const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`HTTP_${res.status}`);
  }
  async function deliver(kind, value, message) {
    if (kind === 'phone') {
      if (!sandbox.otp.smsUrl) throw new Error('SMS_NOT_CONFIGURED');
      return postJson(sandbox.otp.smsUrl, { to: value, text: message.text, from: 'ADS' });
    }
    if (sandbox.otp.emailUrl) return postJson(sandbox.otp.emailUrl, { to: value, subject: message.subject, text: message.text });
    if (!mailer) throw new Error('MAIL_NOT_CONFIGURED');
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#102B43">${message.text.split('\n\n').map(p => `<p>${p.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)}</p>`).join('')}<p style="color:#888;font-size:12px">Africa Digital Synergy Ltd · Yaoundé</p></div>`;
    return mailer.send({ to: value, subject: message.subject, text: message.text, html });
  }

  // ---------- sign-up: one-time code ----------
  // Returns { challengeId, channel, masked, testCode? }. testCode only for SMS when DEMO_OTP_SHOW_SMS_CODE=1.
  async function startChallenge({ contact, ip, locale = 'en', clientId = null }) {
    assertEnabled();
    const c = normalizeContact(contact, { demoDomain: demo.domain });
    await bump('code-ip', ip, sandbox.limits.codesPerIp);
    await bump('code-contact', c.value, sandbox.limits.codesPerContact);
    const id = randomToken(18);
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    await pool.query(`INSERT INTO platform.demo_otp_challenges(id,channel,contact,contact_hash,code_hash,locale,client_id,expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,now()+make_interval(secs => $8))`,
    [id, c.channel, c.value, keyed('contact', c.value), keyed('otp', `${id}:${code}`), locale === 'fr' ? 'fr' : 'en', clientId, sandbox.otp.ttlSeconds]);
    try {
      await deliver(c.kind, c.value, bilingual('code', locale, { code, minutes: Math.round(sandbox.otp.ttlSeconds / 60) }));
    } catch (error) {
      log.warn?.(`demo sign-up code not delivered (${c.channel}): ${error.message}`);
      refuse(502, 'CODE_NOT_SENT');
    }
    await audit(pool, 'demo_signup_code_sent', { ip, clientId, metadata: { channel: c.channel } });
    return { challengeId: id, channel: c.channel, masked: maskContact(c.kind, c.value), ...(c.channel === 'sms' && sandbox.otp.showSmsCode ? { testCode: code } : {}) };
  }

  // Checks the code. Returns { sandboxId, ownerId, created }: the tester's live sandbox (found again by
  // email/phone), or a new one. Creates the owner account; provisioning is started by the caller.
  async function verifyChallenge({ challengeId, code, ip }) {
    assertEnabled();
    if (typeof challengeId !== 'string' || !/^[A-Za-z0-9_-]{10,64}$/.test(challengeId)) refuse(400, 'CODE_EXPIRED');
    const digits = String(code ?? '').replace(/\s/g, '');
    const row = (await pool.query(`UPDATE platform.demo_otp_challenges SET attempts=attempts+1
      WHERE id=$1 AND used_at IS NULL AND expires_at>now() RETURNING *`, [challengeId])).rows[0];
    if (!row) refuse(400, 'CODE_EXPIRED');
    if (row.attempts > sandbox.otp.maxAttempts) {
      await pool.query('UPDATE platform.demo_otp_challenges SET used_at=now() WHERE id=$1', [challengeId]);
      refuse(400, 'CODE_EXPIRED');
    }
    if (!/^\d{6}$/.test(digits) || !safeEqual(keyed('otp', `${challengeId}:${digits}`), row.code_hash)) {
      await audit(pool, 'demo_signup', { outcome: 'denied', reason: 'CODE_WRONG', ip, clientId: row.client_id });
      refuse(400, row.attempts >= sandbox.otp.maxAttempts ? 'CODE_EXPIRED' : 'CODE_WRONG');
    }
    const used = await pool.query('UPDATE platform.demo_otp_challenges SET used_at=now() WHERE id=$1 AND used_at IS NULL', [challengeId]);
    if (!used.rowCount) refuse(400, 'CODE_EXPIRED');

    const existing = await liveSandboxOfContact(row.contact_hash);
    if (existing) {
      await audit(pool, 'demo_sandbox_signin', { userId: existing.owner_user_id, ip, clientId: row.client_id, metadata: { sandbox: existing.id } });
      return { sandboxId: existing.id, ownerId: existing.owner_user_id, created: false };
    }
    await bump('sandbox-ip', ip, sandbox.limits.sandboxesPerIp);
    await bump('sandbox-contact', row.contact, sandbox.limits.sandboxesPerContact);
    const active = Number((await pool.query(`SELECT count(*) AS n FROM platform.demo_sandboxes WHERE status = ANY($1)`, [LIVE])).rows[0].n);
    if (active >= sandbox.maxActive) refuse(503, 'SANDBOXES_FULL');
    try {
      return { ...(await createSandbox({ contactKind: row.channel === 'sms' ? 'phone' : 'email', contact: row.contact, contactHash: row.contact_hash, locale: row.locale, clientId: row.client_id, ip })), created: true };
    } catch (error) {
      // Two sign-ups with the same contact at once: the unique index keeps one; use it.
      if (error.code === '23505') {
        const again = await liveSandboxOfContact(row.contact_hash);
        if (again) return { sandboxId: again.id, ownerId: again.owner_user_id, created: false };
      }
      throw error;
    }
  }

  async function liveSandboxOfContact(contactHash) {
    return (await pool.query(`SELECT s.* FROM platform.demo_sandboxes s JOIN platform.users u ON u.id=s.owner_user_id AND u.status='active'
      WHERE s.contact_hash=$1 AND s.status = ANY($2) AND s.expires_at>now()`, [contactHash, LIVE])).rows[0] ?? null;
  }

  // Registry row + owner account + one status row per product. Exported for tests and operators.
  async function createSandbox({ contactKind = null, contact = null, contactHash = null, locale = 'en', clientId = null, ip = null, days = sandbox.days }) {
    assertEnabled();
    const id = newSandboxId();
    const ownerId = crypto.randomUUID();
    const clients = await clientsInUse();
    await withTransaction(demoPool, async c => {
      await c.query(`INSERT INTO platform.demo_sandboxes(id,expires_at,status,contact_kind,contact,contact_hash,locale,client_id)
        VALUES ($1,now()+make_interval(days => $2),'provisioning',$3,$4,$5,$6,$7)`, [id, days, contactKind, contact, contactHash, locale === 'fr' ? 'fr' : 'en', clientId]);
      // The sandbox owner (demo_sandbox_owner): no password; signs in with a one-time code.
      await c.query(`INSERT INTO platform.users(id,email,password_hash,status,email_verified_at,display_name,locale,is_demo,demo_key)
        VALUES ($1,$2,NULL,'active',now(),$3,$4,true,$5)`, [ownerId, `demo.${id}.owner@${demo.domain}`, locale === 'fr' ? 'Testeur (démo)' : 'Tester (demo)', locale === 'fr' ? 'fr' : 'en', `sandbox-owner:${id}`]);
      await c.query('UPDATE platform.demo_sandboxes SET owner_user_id=$2 WHERE id=$1', [id, ownerId]);
      for (const p of clients.products) {
        const slug = p.slug ?? p.client_id;
        await c.query(`INSERT INTO platform.demo_sandbox_products(sandbox_id,product,client_id,status) VALUES ($1,$2,$3,$4)`,
          [id, slug, p.client_id, productBaseUrl(slug) ? 'pending' : 'not_available']);
      }
      await audit(c, 'demo_sandbox_created', { userId: ownerId, ip, clientId, metadata: { sandbox: id, channel: contactKind, products: clients.products.length } });
    });
    return { sandboxId: id, ownerId };
  }

  // ---------- provisioning ----------
  const needDemoFunctions = () => {
    for (const fn of ['personaAccounts', 'ensurePersonaAccounts', 'ensureDemoOrgs']) {
      if (typeof demoModule[fn] !== 'function') throw new Error(`demo personas support missing (${fn}); sandboxes need BRIEF16 personas`);
    }
  };

  // Organisations (one set per product, as demo-orgs) and persona accounts of one sandbox, owned by
  // its owner. Idempotent. Returns the product -> { tenants, personas } map.
  async function provisionIdentity(sandboxId) {
    needDemoFunctions();
    const sb = await getSandbox(sandboxId);
    if (!sb || !LIVE.includes(sb.status) || !sb.owner_user_id) refuse(404, 'SANDBOX_NOT_FOUND');
    const clients = await clientsInUse();
    const slugs = new Set(clients.products.map(p => p.slug ?? p.client_id));
    const personasDoc = loadDocs().personas;
    const filtered = { ...personasDoc, products: Object.fromEntries(Object.entries(personasDoc.products ?? {}).filter(([slug]) => slugs.has(slug))) };
    const personas = demoModule.personaAccounts(demo, filtered, clients, { set: sandboxId });
    // Persona accounts of a sandbox never sign in with a password (only "Switch role"): a random one, never kept.
    await demoModule.ensurePersonaAccounts(demoPool, demo, personas, `Sbx-${randomToken(24)}`, { set: sandboxId, minPasswordLength });
    const map = await demoModule.ensureDemoOrgs(demoPool, demo, clients, { personas, set: sandboxId, ownerId: sb.owner_user_id });
    await demoPool.query('UPDATE platform.demo_sandboxes SET identity_ready_at=coalesce(identity_ready_at, now()), updated_at=now() WHERE id=$1', [sandboxId]);
    return map;
  }

  async function productPayload(sb, entry, slug) {
    return {
      sandbox_id: sb.id, product: slug, client_id: entry.client_id,
      expires_at: new Date(sb.expires_at).toISOString(), locale: sb.locale,
      owner: { sub: sb.owner_user_id },
      tenants: entry.tenants, staff_tenants: entry.staff_tenants ?? [], settings: entry.settings ?? {},
      personas: Object.fromEntries(Object.entries(entry.personas ?? {}).map(([k, p]) => [k, p.sub])),
      persona_tenants: Object.fromEntries(Object.entries(entry.personas ?? {}).map(([k, p]) => [k, p.tenant_id])),
    };
  }

  const setProduct = (sandboxId, product, fields) => demoPool.query(`UPDATE platform.demo_sandbox_products SET status=$3, attempts=attempts+$4, last_error=$5, updated_at=now()
    WHERE sandbox_id=$1 AND product=$2`, [sandboxId, product, fields.status, fields.attempts ?? 0, fields.error ?? null]);

  // Full provisioning: identity, then every product that has an endpoint (in parallel, retried with
  // backoff). A product that does not implement the endpoint is "not available"; others carry on.
  async function provision(sandboxId, { only = null } = {}) {
    assertEnabled();
    let map;
    try {
      map = await provisionIdentity(sandboxId);
    } catch (error) {
      log.error?.(`demo sandbox ${sandboxId}: identity provisioning failed: ${error.message}`);
      await demoPool.query("UPDATE platform.demo_sandbox_products SET status='failed', last_error='IDENTITY_PROVISIONING_FAILED', updated_at=now() WHERE sandbox_id=$1 AND status IN ('pending','provisioning')", [sandboxId]);
      await settle(sandboxId);
      throw error;
    }
    const sb = await getSandbox(sandboxId);
    const rows = (await pool.query(`SELECT * FROM platform.demo_sandbox_products WHERE sandbox_id=$1 AND status IN ('pending','provisioning','failed') ORDER BY product`, [sandboxId])).rows
      .filter(r => !only || only.includes(r.product));
    await mapLimit(rows, sandbox.provisioning.concurrency, async row => {
      const baseUrl = productBaseUrl(row.product);
      const entry = map[row.product];
      if (!baseUrl || !entry) return setProduct(sandboxId, row.product, { status: 'not_available' });
      await setProduct(sandboxId, row.product, { status: 'provisioning' });
      const result = await callProduct({ baseUrl, method: 'POST', sandboxId, payload: await productPayload(sb, entry, row.product), secret: sandbox.secret,
        attempts: sandbox.provisioning.attempts, backoffMs: sandbox.provisioning.backoffMs, timeoutMs: sandbox.provisioning.timeoutMs, fetchImpl, wait });
      return setProduct(sandboxId, row.product, { status: result.outcome, attempts: result.attempts, error: result.error });
    });
    return settle(sandboxId);
  }

  // Sandbox status from its products: ready (all ready or not available), partial (some failed).
  async function settle(sandboxId) {
    const rows = (await pool.query('SELECT status FROM platform.demo_sandbox_products WHERE sandbox_id=$1', [sandboxId])).rows.map(r => r.status);
    const counts = rows.reduce((n, s) => ({ ...n, [s]: (n[s] ?? 0) + 1 }), {});
    const sb = await getSandbox(sandboxId);
    if (sb && LIVE.includes(sb.status)) {
      const busy = (counts.pending ?? 0) + (counts.provisioning ?? 0);
      const status = busy || !sb.identity_ready_at ? 'provisioning' : counts.failed ? 'partial' : 'ready';
      await demoPool.query('UPDATE platform.demo_sandboxes SET status=$2, updated_at=now() WHERE id=$1 AND status = ANY($3)', [sandboxId, status, LIVE]);
      if (status !== 'provisioning') await audit(pool, 'demo_sandbox_provisioned', { metadata: { sandbox: sandboxId, ...counts } });
    }
    return counts;
  }

  // Server: runs provisioning without holding the request. idle() waits for it (tests, shutdown).
  function provisionInBackground(sandboxId) {
    const job = provision(sandboxId).catch(error => log.error?.(`demo sandbox ${sandboxId}: ${error.message}`)).finally(() => background.delete(job));
    background.add(job);
    return job;
  }
  const idle = () => Promise.all([...background]);

  // ---------- status ----------
  const getSandbox = async id => (SANDBOX_ID.test(String(id)) ? (await pool.query('SELECT * FROM platform.demo_sandboxes WHERE id=$1', [id])).rows[0] ?? null : null);
  async function sandboxOfUser(userId) {
    if (!UUID.test(String(userId))) return null;
    return (await pool.query(`SELECT s.*, u.demo_key FROM platform.users u JOIN platform.demo_sandboxes s ON s.id=u.demo_sandbox_id
      WHERE u.id=$1 AND u.status='active'`, [userId])).rows[0] ?? null;
  }
  const isLive = sb => Boolean(sb && LIVE.includes(sb.status) && new Date(sb.expires_at) > now());

  async function status(sandboxId, { clientId = null } = {}) {
    const sb = await getSandbox(sandboxId);
    if (!sb) return null;
    const products = (await pool.query('SELECT product, client_id, status FROM platform.demo_sandbox_products WHERE sandbox_id=$1 ORDER BY product', [sandboxId])).rows
      .map(r => ({ product: r.product, client_id: r.client_id, name: displayName(r.client_id), status: r.status }));
    const settled = s => ['ready', 'not_available', 'failed'].includes(s);
    const mine = clientId ? products.find(p => p.client_id === clientId) : null;
    return {
      sandbox_id: sb.id, status: sb.status, expires_at: new Date(sb.expires_at).toISOString(), identity_ready: Boolean(sb.identity_ready_at),
      products, settled: Boolean(sb.identity_ready_at) && products.every(p => settled(p.status)),
      // The tester may go back to the product they came from once its own part is settled.
      can_continue: Boolean(sb.identity_ready_at) && (!mine || settled(mine.status)),
    };
  }

  // ---------- personas and "Switch role" ----------
  // Who the tester lands as in a product: the owner where the owner holds roles there, otherwise the
  // product's first persona. Returns { userId, tenantId } or null.
  async function landingIdentity(sandboxId, clientId, preferTenant = null) {
    const sb = await getSandbox(sandboxId);
    if (!isLive(sb)) return null;
    const owner = await ownerTenant(sb, clientId, preferTenant);
    if (owner) return { userId: sb.owner_user_id, tenantId: owner, persona: null };
    const first = (await personaRows(sandboxId, clientId))[0];
    return first ? { userId: first.user_id, tenantId: first.tenant_id, persona: first.persona_key } : null;
  }

  async function ownerTenant(sb, clientId, preferTenant) {
    const rows = (await pool.query(`SELECT m.tenant_id, o.demo_key FROM platform.memberships m
      JOIN platform.tenants t ON t.id=m.tenant_id AND t.status='active' JOIN platform.organizations o ON o.id=t.organization_id AND o.status='active'
      JOIN platform.product_roles r ON r.user_id=m.user_id AND r.tenant_id=m.tenant_id AND r.client_id=$2 AND cardinality(r.roles) > 0
      WHERE m.user_id=$1 AND m.status='active' AND o.demo_sandbox_id=$3 ORDER BY (o.demo_key LIKE '%:main') DESC, o.demo_key`, [sb.owner_user_id, clientId, sb.id])).rows;
    return (rows.find(r => r.tenant_id === preferTenant) ?? rows[0])?.tenant_id ?? null;
  }

  async function personaRows(sandboxId, clientId) {
    return (await pool.query(`SELECT p.user_id, p.persona_key, p.label, p.hint, p.roles, p.tenant_id, p.org_key FROM platform.demo_personas p
      JOIN platform.users u ON u.id=p.user_id AND u.status='active' AND u.demo_sandbox_id=$1
      WHERE p.demo_set=$1 AND p.client_id=$2 AND p.tenant_id IS NOT NULL ORDER BY p.position`, [sandboxId, clientId])).rows;
  }

  // Verifies a product access token (issuer, audience = client, live sign-in) and returns its claims.
  async function verifySubject(subjectToken, clientId) {
    if (!jwks || typeof subjectToken !== 'string' || !subjectToken) refuse(401, 'invalid_token');
    let claims;
    try {
      ({ payload: claims } = await jwtVerify(subjectToken, jwks, { issuer, audience: clientId, algorithms: ['RS256'] }));
    } catch {
      refuse(401, 'invalid_token');
    }
    if (claims.token_use === 'admin' || !claims.sid) refuse(401, 'invalid_token');
    const live = (await pool.query('SELECT 1 FROM platform.sso_sessions WHERE id=$1 AND revoked_at IS NULL AND expires_at>now()', [claims.sid])).rowCount;
    if (!live) refuse(401, 'invalid_token');
    return claims;
  }

  // The personas of the caller's own sandbox for this product (for the "Switch role" control).
  async function listPersonas({ subjectToken, clientId }) {
    assertEnabled();
    const claims = await verifySubject(subjectToken, clientId);
    const sb = await sandboxOfUser(claims.sub);
    if (!isLive(sb)) refuse(403, 'NOT_A_SANDBOX_ACCOUNT');
    const rows = await personaRows(sb.id, clientId);
    const ownerTenantId = await ownerTenant(sb, clientId, claims.tenant_id);
    return {
      sandbox_id: sb.id, expires_at: new Date(sb.expires_at).toISOString(), current: claims.sub === sb.owner_user_id ? 'owner' : rows.find(r => r.user_id === claims.sub)?.persona_key ?? null,
      owner: ownerTenantId ? { key: 'owner', label: { en: 'Me (sandbox owner)', fr: 'Moi (propriétaire de l’espace)' } } : null,
      personas: rows.map(r => ({ key: r.persona_key, label: r.label, hint: r.hint, roles: r.roles })),
    };
  }

  // Token exchange inside one sandbox: the caller's product token (owner or persona) -> tokens for
  // another persona (or the owner) of the SAME sandbox, same product, same ADS sign-in (sid).
  async function switchRole({ subjectToken, clientId, persona, ip }) {
    assertEnabled();
    if (!oauth) throw new Error('switchRole needs oauth');
    const client = await oauth.getClient(clientId);
    if (!client) refuse(400, 'invalid_client');
    const claims = await verifySubject(subjectToken, client.client_id);
    const deny = async (reason, extra = {}) => {
      await audit(pool, 'demo_role_switch', { userId: claims.sub, outcome: 'denied', reason, ip, clientId: client.client_id, metadata: { persona: String(persona ?? '').slice(0, 40), ...extra } });
      refuse(403, reason);
    };
    const sb = await sandboxOfUser(claims.sub);
    if (!isLive(sb)) return deny('NOT_A_SANDBOX_ACCOUNT');
    const key = String(persona ?? '');
    let target;
    if (key === 'owner') {
      const tenantId = await ownerTenant(sb, client.client_id, claims.tenant_id);
      if (!tenantId) return deny('OWNER_HAS_NO_ACCESS', { sandbox: sb.id });
      target = { userId: sb.owner_user_id, tenantId };
    } else {
      if (!PERSONA_KEY.test(key)) return deny('PERSONA_UNKNOWN', { sandbox: sb.id });
      const row = (await personaRows(sb.id, client.client_id)).find(r => r.persona_key === key);
      if (!row) return deny('PERSONA_UNKNOWN', { sandbox: sb.id });
      target = { userId: row.user_id, tenantId: row.tenant_id };
    }
    // Backstop: never across sandboxes, whatever the tables above say.
    const targetSb = (await pool.query("SELECT demo_sandbox_id FROM platform.users WHERE id=$1 AND status='active'", [target.userId])).rows[0]?.demo_sandbox_id;
    if (targetSb !== sb.id) return deny('SANDBOX_MISMATCH', { sandbox: sb.id });
    let tokens;
    try {
      tokens = await oauth.issueTokens(client, target.userId, target.tenantId, claims.sid);
    } catch (error) {
      if (error instanceof HttpError) return deny('PERSONA_HAS_NO_ACCESS', { sandbox: sb.id });
      throw error;
    }
    await audit(pool, 'demo_role_switch', { userId: claims.sub, tenantId: target.tenantId, ip, clientId: client.client_id,
      metadata: { sandbox: sb.id, to: key, to_user: target.userId } });
    return tokens;
  }

  // ---------- expiry ----------
  async function notify(sb, days) {
    if (!sb.contact) return false;
    const date = new Date(sb.expires_at).toISOString().slice(0, 10);
    try {
      await deliver(sb.contact_kind, sb.contact, bilingual('warning', sb.locale, { days, date }));
      return true;
    } catch (error) {
      log.warn?.(`demo sandbox ${sb.id}: expiry warning not delivered: ${error.message}`);
      return false;
    }
  }

  // Daily job. Warnings at T-7 and T-1; at T: sign-in ends and contact details are erased at once, then
  // each product deletes its data (DELETE), then personas, organisations, memberships and the owner
  // account are deleted. A product that cannot delete yet is retried on the next run.
  async function expire({ at = now() } = {}) {
    if (!demo?.enabled) refuse(404, 'NOT_FOUND');
    const report = { warned7: 0, warned1: 0, expired: 0, deleted: 0, waiting: 0 };
    const t = at.getTime();
    const live = (await pool.query("SELECT * FROM platform.demo_sandboxes WHERE status <> 'deleted' ORDER BY expires_at")).rows;
    for (const sb of live) {
      const left = new Date(sb.expires_at).getTime() - t;
      if (left > 0 && LIVE.includes(sb.status)) {
        if (left <= DAY_MS && !sb.warned_1_at) {
          if (await notify(sb, 1)) {
            await demoPool.query('UPDATE platform.demo_sandboxes SET warned_1_at=now(), warned_7_at=coalesce(warned_7_at, now()) WHERE id=$1', [sb.id]);
            await audit(pool, 'demo_sandbox_warning', { metadata: { sandbox: sb.id, days: 1 } });
            report.warned1 += 1;
          }
        } else if (left <= 7 * DAY_MS && left > DAY_MS && !sb.warned_7_at) {
          if (await notify(sb, 7)) {
            await demoPool.query('UPDATE platform.demo_sandboxes SET warned_7_at=now() WHERE id=$1', [sb.id]);
            await audit(pool, 'demo_sandbox_warning', { metadata: { sandbox: sb.id, days: 7 } });
            report.warned7 += 1;
          }
        }
        continue;
      }
      if (left > 0) continue;
      if (sb.status !== 'deleting') report.expired += 1;
      const done = await deleteSandbox(sb.id);
      if (done) report.deleted += 1; else report.waiting += 1;
    }
    // Housekeeping: old codes and counters.
    await pool.query("DELETE FROM platform.demo_otp_challenges WHERE created_at < now() - interval '1 day'");
    await pool.query("DELETE FROM platform.demo_signup_counters WHERE day < (now() AT TIME ZONE 'utc')::date - 3");
    return report;
  }

  // Deletes one sandbox (also used by operators). Returns true once everything is gone.
  async function deleteSandbox(sandboxId) {
    const sb = await getSandbox(sandboxId);
    if (!sb) refuse(404, 'SANDBOX_NOT_FOUND');
    if (sb.status === 'deleted') return true;
    // 1. Nobody can use it any more, and the tester's contact details are gone.
    await withTransaction(demoPool, async c => {
      await c.query("UPDATE platform.demo_sandboxes SET status='deleting', contact=NULL, contact_hash=NULL, updated_at=now() WHERE id=$1", [sandboxId]);
      const users = (await c.query("UPDATE platform.users SET status='disabled', updated_at=now() WHERE demo_sandbox_id=$1 RETURNING id", [sandboxId])).rows.map(r => r.id);
      await c.query('UPDATE platform.sso_sessions SET revoked_at=now() WHERE user_id = ANY($1::uuid[]) AND revoked_at IS NULL', [users]);
      await c.query('UPDATE platform.refresh_tokens SET revoked_at=now() WHERE user_id = ANY($1::uuid[]) AND revoked_at IS NULL', [users]);
      await c.query('UPDATE platform.sessions SET revoked_at=now() WHERE user_id = ANY($1::uuid[]) AND revoked_at IS NULL', [users]);
    });
    // 2. Each product deletes the sandbox's tenant data.
    const rows = (await pool.query("SELECT * FROM platform.demo_sandbox_products WHERE sandbox_id=$1 AND status NOT IN ('deleted','not_available')", [sandboxId])).rows;
    await mapLimit(rows, sandbox.provisioning.concurrency, async row => {
      const baseUrl = productBaseUrl(row.product);
      if (!baseUrl) return setProduct(sandboxId, row.product, { status: row.status === 'pending' ? 'not_available' : 'deleted' });
      const result = await callProduct({ baseUrl, method: 'DELETE', sandboxId, secret: sandbox.secret,
        attempts: sandbox.provisioning.attempts, backoffMs: sandbox.provisioning.backoffMs, timeoutMs: sandbox.provisioning.timeoutMs, fetchImpl, wait });
      return setProduct(sandboxId, row.product, { status: result.outcome === 'deleted' ? 'deleted' : 'deleting', attempts: result.attempts, error: result.error });
    });
    const waiting = Number((await pool.query("SELECT count(*) AS n FROM platform.demo_sandbox_products WHERE sandbox_id=$1 AND status NOT IN ('deleted','not_available')", [sandboxId])).rows[0].n);
    if (waiting) {
      await audit(pool, 'demo_sandbox_delete_waiting', { outcome: 'denied', reason: 'PRODUCT_DELETE_PENDING', metadata: { sandbox: sandboxId, products: waiting } });
      return false;
    }
    // 3. Identity data: personas, owner, their personal workspaces, the sandbox organisations.
    const counts = await withTransaction(demoPool, async c => {
      const users = (await c.query('SELECT id FROM platform.users WHERE demo_sandbox_id=$1', [sandboxId])).rows.map(r => r.id);
      const orgs = (await c.query(`SELECT id FROM platform.organizations WHERE demo_sandbox_id=$1
        UNION SELECT o.id FROM platform.memberships m JOIN platform.tenants t ON t.id=m.tenant_id JOIN platform.organizations o ON o.id=t.organization_id
          WHERE m.user_id = ANY($2::uuid[]) AND o.kind='personal' AND o.demo_sandbox_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM platform.memberships x JOIN platform.tenants xt ON xt.id=x.tenant_id WHERE xt.organization_id=o.id AND NOT (x.user_id = ANY($2::uuid[])))`,
      [sandboxId, users])).rows.map(r => r.id);
      const tenants = (await c.query('SELECT id FROM platform.tenants WHERE organization_id = ANY($1::uuid[])', [orgs])).rows.map(r => r.id);
      const memberships = Number((await c.query('SELECT count(*) AS n FROM platform.memberships WHERE user_id = ANY($1::uuid[]) OR tenant_id = ANY($2::uuid[])', [users, tenants])).rows[0].n);
      await c.query('DELETE FROM platform.projects WHERE tenant_id = ANY($1::uuid[])', [tenants]);
      await c.query('DELETE FROM platform.users WHERE id = ANY($1::uuid[])', [users]);
      await c.query('DELETE FROM platform.tenants WHERE id = ANY($1::uuid[])', [tenants]);
      await c.query('DELETE FROM platform.organizations WHERE id = ANY($1::uuid[])', [orgs]);
      await c.query("UPDATE platform.demo_sandboxes SET status='deleted', deleted_at=now(), owner_user_id=NULL, contact=NULL, contact_hash=NULL, updated_at=now() WHERE id=$1", [sandboxId]);
      // Non-personal counts only.
      const n = { sandbox: sandboxId, accounts: users.length, organizations: orgs.length, memberships, products: rows.length };
      await audit(c, 'demo_sandbox_deleted', { metadata: n });
      return n;
    });
    return Boolean(counts);
  }

  // ADS staff: more days for a sandbox (on the tester's request). Warnings are sent again as needed.
  async function extend(sandboxId, days) {
    if (!demo?.enabled) refuse(404, 'NOT_FOUND');
    const n = Number(days);
    if (!Number.isInteger(n) || n < 1 || n > 365) refuse(400, 'DAYS_INVALID');
    const sb = await getSandbox(sandboxId);
    if (!sb) refuse(404, 'SANDBOX_NOT_FOUND');
    if (!LIVE.includes(sb.status)) refuse(409, 'SANDBOX_NOT_LIVE');
    const row = (await demoPool.query(`UPDATE platform.demo_sandboxes SET expires_at=greatest(expires_at, now())+make_interval(days => $2), extended_days=extended_days+$2,
      warned_7_at=NULL, warned_1_at=NULL, updated_at=now() WHERE id=$1 RETURNING expires_at`, [sandboxId, n])).rows[0];
    await audit(pool, 'demo_sandbox_extended', { metadata: { sandbox: sandboxId, days: n } });
    return { sandbox_id: sandboxId, expires_at: new Date(row.expires_at).toISOString() };
  }

  async function list() {
    return (await pool.query(`SELECT s.id, s.status, s.created_at, s.expires_at, s.extended_days, s.client_id,
      (SELECT json_object_agg(p.product, p.status) FROM platform.demo_sandbox_products p WHERE p.sandbox_id=s.id) AS products
      FROM platform.demo_sandboxes s ORDER BY s.created_at DESC LIMIT 500`)).rows;
  }

  // Operators: provision again whatever is not ready (identity, then pending/failed products).
  async function retry(sandboxId = null) {
    assertEnabled();
    const ids = sandboxId ? [sandboxId] : (await pool.query(`SELECT DISTINCT s.id FROM platform.demo_sandboxes s JOIN platform.demo_sandbox_products p ON p.sandbox_id=s.id
      WHERE s.status = ANY($1) AND (s.identity_ready_at IS NULL OR p.status IN ('pending','provisioning','failed'))`, [LIVE])).rows.map(r => r.id);
    const out = {};
    for (const id of ids) out[id] = await provision(id);
    return out;
  }

  return {
    enabled, startChallenge, verifyChallenge, createSandbox, provision, provisionIdentity, provisionInBackground, idle, settle,
    status, getSandbox, sandboxOfUser, landingIdentity, listPersonas, switchRole, expire, deleteSandbox, extend, list, retry,
  };
}

import crypto from 'node:crypto';
import { withTransaction } from './db.mjs';
import { fail, safeEqual, sha256 } from './security.mjs';

// Cameroon mobile numbers: spaces, dots, hyphens and the international 00 prefix are accepted.
export function normalizeCameroonPhone(value) {
  const input = String(value ?? '').trim();
  if (input.length > 40 || !/^[+0-9 .()-]+$/.test(input)) return null;
  let number = input.replace(/[ .()-]/g, '');
  if (number.startsWith('00')) number = '+' + number.slice(2);
  if (/^6[0-9]{8}$/.test(number)) number = '+237' + number;
  return /^\+2376[0-9]{8}$/.test(number) ? number : null;
}
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value));

export function createPhone({ pool, config, audit }) {
  // A keyed hash protects short numeric codes from offline enumeration of a database dump.
  const digest = (id, code) => crypto.createHmac('sha256', config.cookieSecret).update(`${id}:${code}`).digest('hex');
  async function request({ phone, browser, userId = null, locale = 'en', ip }) {
    const number = normalizeCameroonPhone(phone);
    if (!number) fail(400, 'PHONE_INVALID');
    if (!config.smsUrl) fail(503, 'PHONE_UNAVAILABLE');
    const id = crypto.randomUUID();
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    await withTransaction(pool, async c => {
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`phone:${number}`]);
      const recent = (await c.query(`SELECT count(*)::int AS total,
        bool_or(created_at > now()-make_interval(secs => $2)) AS cooling
        FROM platform.phone_challenges WHERE phone_number=$1 AND created_at>now()-interval '1 hour'`, [number, config.phoneResendWait])).rows[0];
      if (recent.cooling || recent.total >= config.phoneRequestsPerHour) fail(429, 'TOO_MANY_ATTEMPTS');
      await c.query('UPDATE platform.phone_challenges SET used_at=now() WHERE phone_number=$1 AND used_at IS NULL', [number]);
      await c.query(`INSERT INTO platform.phone_challenges(id,phone_number,code_hash,browser_hash,user_id,purpose,expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,now()+make_interval(secs => $7))`,
      [id, number, digest(id, code), sha256(browser), userId, userId ? 'link' : 'signin', config.phoneCodeTtl]);
      await audit('phone_code_requested', { userId, outcome: 'allowed', ip }, c);
    });
    try {
      const text = locale === 'fr' ? `Votre code ADS : ${code}. Ne le partagez pas.` : `Your ADS code: ${code}. Do not share it.`;
      const result = await fetch(config.smsUrl, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to: number, text, from: 'ADS' }), signal: AbortSignal.timeout(5000) });
      if (!result.ok) throw new Error('SMS_FAILED');
    } catch {
      await pool.query('UPDATE platform.phone_challenges SET used_at=now() WHERE id=$1', [id]);
      await audit('phone_code_delivery', { userId, outcome: 'denied', reason: 'SMS_UNAVAILABLE', ip });
      fail(503, 'PHONE_UNAVAILABLE');
    }
    return id;
  }
  async function verify({ id, code, browser, userId = null, ip }) {
    if (!uuid(id)) fail(400, 'PHONE_CODE_INVALID');
    // Return failures rather than throwing inside the transaction so attempt consumption commits.
    const result = await withTransaction(pool, async c => {
      const target = (await c.query('SELECT phone_number FROM platform.phone_challenges WHERE id=$1', [id])).rows[0];
      if (!target) return null;
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`phone:${target.phone_number}`]);
      const row = (await c.query('SELECT *, expires_at>now() AS valid FROM platform.phone_challenges WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!row || row.used_at || !row.valid || row.attempts >= config.phoneMaxAttempts
        || !safeEqual(row.browser_hash, sha256(browser)) || row.user_id !== userId) return null;
      await c.query('UPDATE platform.phone_challenges SET attempts=attempts+1 WHERE id=$1', [id]);
      if (!/^[0-9]{6}$/.test(String(code)) || !safeEqual(row.code_hash, digest(id, code))) return null;
      await c.query('UPDATE platform.phone_challenges SET used_at=now() WHERE id=$1', [id]);
      const owner = (await c.query('SELECT id,email,phone_number,status,is_demo FROM platform.users WHERE phone_number=$1 FOR UPDATE', [row.phone_number])).rows[0];
      if (owner && (owner.status !== 'active' || owner.is_demo)) return null;
      let user = owner;
      if (row.purpose === 'link') {
        // Only an already authenticated user can link; an existing owner's phone is never transferred.
        if (owner && owner.id !== userId) return null;
        user = (await c.query("SELECT id,email,phone_number,status,is_demo FROM platform.users WHERE id=$1 AND status='active' AND NOT is_demo FOR UPDATE", [userId])).rows[0];
        if (!user || (user.phone_number && user.phone_number !== row.phone_number)) return null;
        await c.query('UPDATE platform.users SET phone_number=$2,phone_verified_at=now(),updated_at=now() WHERE id=$1', [userId, row.phone_number]);
      } else if (!owner) {
        user = { id: crypto.randomUUID(), email: null, phone_number: row.phone_number };
        await c.query("INSERT INTO platform.users(id,email,password_hash,phone_number,phone_verified_at,status) VALUES ($1,NULL,NULL,$2,now(),'active')", [user.id, row.phone_number]);
      }
      await audit(row.purpose === 'link' ? 'phone_linked' : 'login', { userId: user.id, outcome: 'allowed', reason: 'phone', ip }, c);
      return { ...user, phone_number: row.phone_number };
    });
    if (!result) {
      await audit('phone_verification', { userId, outcome: 'denied', reason: 'PHONE_CODE_INVALID', ip });
      fail(400, 'PHONE_CODE_INVALID');
    }
    return result;
  }
  return { request, verify };
}

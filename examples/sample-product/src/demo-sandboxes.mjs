// BRIEF18 reference implementation of the kit's demo sandbox provisioning contract
// (docs/contracts/DEMO_SANDBOX_PROVISIONING.md), for the sample product:
//   POST   /internal/demo/sandboxes        seed sample data for the sandbox's tenants (idempotent)
//   DELETE /internal/demo/sandboxes/{id}   delete exactly that sandbox's data (idempotent)
// Only when ADS_ENV=demo AND DEMO_MODE=1 AND DEMO_PROVISIONING_SECRET is set; otherwise 404, so the kit
// shows this product as "not available" in a sandbox. Requests must carry the kit's HMAC signature.
// Production code owns this check; it must not import the test kit.
import crypto from 'node:crypto';

const SANDBOX_ID = /^sb-[a-z0-9]{10}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const PATH = '/internal/demo/sandboxes';

// "t=<unix>,v1=<hex HMAC-SHA256(secret, `${t}.${METHOD}.${path}.${rawBody}`)>", within 5 minutes.
export function verifyDemoSignature({ secret, method, path, rawBody, header, toleranceSeconds = 300 }) {
  if (!secret || typeof header !== 'string') return false;
  const parts = Object.fromEntries(header.split(',').map(p => p.trim().split('=')).filter(p => p.length === 2));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !/^[0-9a-f]{64}$/.test(parts.v1 ?? '') || Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${method}.${path}.${rawBody}`).digest();
  const given = Buffer.from(parts.v1, 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

const WELCOME = [
  'Welcome to your private ADS demo. Everything here is test data / Bienvenue dans votre démo ADS privée. Tout ici est fictif.',
  'Try a mobile money payment in test mode / Essayez un paiement mobile money en mode test.',
];

// env: process.env; pool: the product's pool (migration role); asTenant(tenantId, fn): the product's
// tenant-scoped transaction (RLS), so seeded rows go through the same rules as user requests.
export function createDemoSandboxEndpoint({ env, pool, asTenant }) {
  const enabled = env.ADS_ENV === 'demo' && env.DEMO_MODE === '1' && Boolean(env.DEMO_PROVISIONING_SECRET);
  const secret = env.DEMO_PROVISIONING_SECRET ?? '';

  // Returns { status, body } or null when the request is not for this endpoint.
  return async function handle({ method, path, rawBody, signature }) {
    if (path !== PATH && !path.startsWith(`${PATH}/`)) return null;
    if (!enabled) return { status: 404, body: { error: 'NOT_FOUND' } };
    if (!verifyDemoSignature({ secret, method, path, rawBody, header: signature })) return { status: 401, body: { error: 'SIGNATURE_INVALID' } };

    if (method === 'POST' && path === PATH) {
      let input;
      try { input = JSON.parse(rawBody); } catch { return { status: 400, body: { error: 'INVALID_JSON' } }; }
      const tenants = Object.values(input?.tenants ?? {});
      if (!SANDBOX_ID.test(String(input?.sandbox_id)) || !tenants.length || tenants.some(t => !UUID.test(String(t)))) return { status: 400, body: { error: 'INVALID_REQUEST' } };
      const personas = Object.fromEntries(Object.entries(input.personas ?? {}).filter(([k, v]) => /^[a-z][a-z0-9-]{0,39}$/.test(k) && UUID.test(String(v))));
      // Idempotent: the first call records the sandbox and seeds; repeats return the same answer.
      const inserted = (await pool.query(`INSERT INTO sample.demo_sandboxes(id,tenants,personas,expires_at) VALUES ($1,$2,$3::jsonb,$4)
        ON CONFLICT (id) DO NOTHING RETURNING id`, [input.sandbox_id, tenants, JSON.stringify(personas), input.expires_at ?? null])).rowCount === 1;
      const row = (await pool.query('SELECT * FROM sample.demo_sandboxes WHERE id=$1', [input.sandbox_id])).rows[0];
      if (JSON.stringify([...row.tenants].sort()) !== JSON.stringify([...tenants].sort())) return { status: 409, body: { error: 'SANDBOX_TENANTS_DIFFER' } };
      if (inserted || row.seeded_notes === 0) {
        let n = 0;
        for (const tenantId of tenants) {
          await asTenant(tenantId, async c => {
            for (const body of WELCOME) { await c.query('INSERT INTO sample.notes(tenant_id,author_id,body) VALUES ($1,$2,$3)', [tenantId, input.owner?.sub ?? 'ads-demo', body]); n += 1; }
          });
        }
        await pool.query('UPDATE sample.demo_sandboxes SET seeded_notes=$2 WHERE id=$1', [input.sandbox_id, n]);
        return { status: 201, body: { status: 'ready', sandbox_id: input.sandbox_id, seeded: { notes: n } } };
      }
      return { status: 200, body: { status: 'ready', sandbox_id: input.sandbox_id, seeded: { notes: row.seeded_notes } } };
    }

    const m = new RegExp(`^${PATH}/(sb-[a-z0-9]{10})$`).exec(path);
    if (method === 'DELETE' && m) {
      const row = (await pool.query('SELECT * FROM sample.demo_sandboxes WHERE id=$1', [m[1]])).rows[0];
      if (!row) return { status: 404, body: { error: 'SANDBOX_NOT_FOUND' } };
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const t = row.tenants;
        await client.query('DELETE FROM sample.payment_events e USING sample.payments p WHERE e.payment_id=p.id AND p.tenant_id = ANY($1::uuid[])', [t]);
        const payments = (await client.query('DELETE FROM sample.payments WHERE tenant_id = ANY($1::uuid[])', [t])).rowCount;
        const notes = (await client.query('DELETE FROM sample.notes WHERE tenant_id = ANY($1::uuid[])', [t])).rowCount;
        await client.query('DELETE FROM sample.demo_sandboxes WHERE id=$1', [m[1]]);
        await client.query('COMMIT');
        return { status: 200, body: { status: 'deleted', sandbox_id: m[1], deleted: { notes, payments } } };
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    }
    return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
  };
}

import { test as base, expect } from '@playwright/test';
import { withAds } from '@ads/e2e-kit/playwright';
import pg from 'pg';

// `ads`: the shared test harness (seed users/tenants, mint tokens, script mocks); cleaned up per test.
// `db`:  a direct connection to the product database, used only to ASSERT what the journey stored.
//        After EVERY test (auto fixture) it deletes the product rows of the tenants the test created.
export const test = withAds(base).extend({
  db: [async ({ ads }, use) => {
    const pool = new pg.Pool({ connectionString: process.env.PRODUCT_DATABASE_URL, max: 2 });
    try {
      await use(pool);
    } finally {
      const tenants = ads.createdTenantIds();
      if (tenants.length) {
        await pool.query('DELETE FROM sample.payment_events e USING sample.payments p WHERE e.payment_id=p.id AND p.tenant_id = ANY($1::uuid[])', [tenants]);
        await pool.query('DELETE FROM sample.payments WHERE tenant_id = ANY($1::uuid[])', [tenants]);
        await pool.query('DELETE FROM sample.notes WHERE tenant_id = ANY($1::uuid[])', [tenants]);
      }
      await pool.end();
    }
  }, { auto: true }],
});
export { expect };

export const CLIENT_ID = 'sample-web';

// Reads a table as the restricted runtime role for one tenant, the way the product server does.
export async function asTenant(db, tenantId, sql, params = []) {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    await c.query('SET LOCAL ROLE sample_app');
    await c.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const r = await c.query(sql, params);
    await c.query('ROLLBACK');
    return r.rows;
  } finally {
    c.release();
  }
}

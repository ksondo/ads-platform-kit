import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export function createPool(config) {
  return new pg.Pool({ connectionString: config.databaseUrl, max: config.dbPoolMax });
}

// Applies migrations/NNN_*.sql in order, once each, inside a transaction per file.
export async function migrate(pool, log = console) {
  await pool.query('CREATE TABLE IF NOT EXISTS public.ads_identity_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const files = (await readdir(migrationsDir)).filter(f => /^\d{3}_.+\.sql$/.test(f)).sort();
  const done = new Set((await pool.query('SELECT name FROM public.ads_identity_migrations')).rows.map(r => r.name));
  const applied = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(path.join(migrationsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO public.ads_identity_migrations(name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      applied.push(file);
      log.info?.(`migration applied: ${file}`);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw new Error(`MIGRATION_FAILED:${file}:${error.message}`);
    } finally {
      client.release();
    }
  }
  return applied;
}

export async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

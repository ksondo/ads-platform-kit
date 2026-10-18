import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// Applies migrations/NNN_*.sql once each. Run: DATABASE_URL=... node src/migrate.mjs
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL required'); process.exit(2); }
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('SELECT pg_advisory_lock(hashtext($1))', ['sample-product-migrate']);
  await client.query('CREATE TABLE IF NOT EXISTS public.sample_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const done = new Set((await client.query('SELECT name FROM public.sample_migrations')).rows.map(r => r.name));
  for (const file of (await readdir(dir)).filter(f => /^\d{3}_.+\.sql$/.test(f)).sort()) {
    if (done.has(file)) continue;
    await client.query('BEGIN');
    await client.query(await readFile(path.join(dir, file), 'utf8'));
    await client.query('INSERT INTO public.sample_migrations(name) VALUES ($1)', [file]);
    await client.query('COMMIT');
    console.log(`migration applied: ${file}`);
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}

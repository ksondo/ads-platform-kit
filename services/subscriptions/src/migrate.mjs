import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import pg from 'pg';
export async function migrate(pool){
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  await db.query("SELECT pg_advisory_xact_lock(hashtext('ads-subscriptions-migration'))");
  await db.query('CREATE TABLE IF NOT EXISTS public.ads_subscription_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  const name='001_plans_tariffs.sql';
  const sql=await readFile(new URL('../migrations/'+name,import.meta.url),'utf8');
  const checksum=createHash('sha256').update(sql).digest('hex');
  const prior=(await db.query('SELECT checksum FROM public.ads_subscription_migrations WHERE name=$1',[name])).rows[0];
  if(prior&&prior.checksum!==checksum)throw Error('MIGRATION_CHECKSUM_MISMATCH:'+name);
  if(!prior){
   await db.query(sql);
   await db.query('INSERT INTO public.ads_subscription_migrations(name,checksum) VALUES($1,$2)',[name,checksum]);
  }
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e}finally{db.release()}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const pool=new pg.Pool({connectionString:process.env.SUBSCRIPTIONS_MIGRATION_DATABASE_URL});
 try{if(!process.env.SUBSCRIPTIONS_MIGRATION_DATABASE_URL)throw Error('SUBSCRIPTIONS_MIGRATION_DATABASE_URL required');await migrate(pool)}finally{await pool.end()}
}

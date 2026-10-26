// Forward-only, explicit operator seed for two discovery families.
// Runs after 001 and 002. Never resets existing data and does not run on API startup.
import {Pool} from 'pg';
import {readFileSync} from 'node:fs';
const d=JSON.parse(readFileSync(new URL('./seed/discovery.v1.json',import.meta.url),'utf8'));
if(d.categories.length!==21||d.solutions.length!==121)throw Error('Expected 21 discovery categories, 122 bundles');
if(new Set(d.solutions.map(x=>x.id)).size!==121)throw Error('Duplicate solution IDs');
if(process.argv.includes('--validate-only')){console.log('ADS_DISCOVERY_SOURCE_VALID=PASS 21/121');process.exit(0)}
const url=process.env.OPPORTUNITIES_MIGRATION_DATABASE_URL;
if(!url)throw Error('Dedicated OPPORTUNITIES_MIGRATION_DATABASE_URL required');
const pool=new Pool({connectionString:url,max:1,connectionTimeoutMillis:10000});
const client=await pool.connect();
try{
 await client.query('BEGIN');
 await client.query("SELECT pg_advisory_xact_lock(hashtext('ads-opportunities-discovery-v1'))");
 for(let i=0;i<d.categories.length;i++){
  const c=d.categories[i];
  await client.query('INSERT INTO opportunities.discovery_categories(id,family,name_en,sort_order) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',
   [c.id,c.family,c.name_en,i]);
 }
 for(let i=0;i<d.solutions.length;i++){
  const x=d.solutions[i];
  await client.query("INSERT INTO opportunities.discovery_solutions(id,family,category_id,sector_id,title_en,summary_en,tools,examples,readiness,source_kind,required_permission_summary,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12) ON CONFLICT(id) DO NOTHING",
   [x.id,x.family,x.categoryId,x.sectorId,x.title,x.summary,JSON.stringify(x.tools||[]),JSON.stringify(x.examples||[]),x.stage,x.format,x.gate||null,i]);
 }
 const checks=await client.query('SELECT (SELECT count(*)::int FROM opportunities.discovery_categories) AS categories, (SELECT count(*)::int FROM opportunities.discovery_solutions) AS solutions');
 if(checks.rows[0].categories!==21||checks.rows[0].solutions!==121)throw Error('Unexpected discovery DB rows: '+JSON.stringify(checks.rows[0]));
 await client.query('COMMIT');
 console.log('ADS_DISCOVERY_DB_SEED=PASS families=2 categories=21 solutions=121');
}catch(e){await client.query('ROLLBACK');console.error(e.message);process.exitCode=1}
finally{client.release();await pool.end()}

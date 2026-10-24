// Explicit, idempotent operator-controlled import into a dedicated PostgreSQL database.
// No implicit startup writes. Never use Commerce/Identity DB URLs.
import {Pool} from 'pg';
import {loadAndValidate} from './validate-seed.mjs';
const data=loadAndValidate();
if(process.argv.includes('--validate-only')){
 console.log('ADS_OPPORTUNITY_SOURCE=PASS '+data.opportunities.length);
 process.exit(0);
}
if(!process.env.OPPORTUNITIES_MIGRATION_DATABASE_URL)throw Error('OPPORTUNITIES_MIGRATION_DATABASE_URL is required (dedicated database)');
const pool=new Pool({connectionString:process.env.OPPORTUNITIES_MIGRATION_DATABASE_URL,max:2,connectionTimeoutMillis:10000});
const client=await pool.connect();
try{
 await client.query('BEGIN');
 await client.query("SELECT pg_advisory_xact_lock(hashtext('ads-opportunities-seed-v1'))");
 const count=await client.query('SELECT COUNT(*)::int AS n FROM opportunities.sector_opportunities');
 if(count.rows[0].n>333)throw Error('Existing catalogue contains more records than this seed; refusing unexpected rewrite');
 for(const s of data.sectors)await client.query(
  'INSERT INTO opportunities.sectors(id,name_en,business_examples,source_repos,evidence) VALUES($1,$2,$3::jsonb,$4::jsonb,$5) ON CONFLICT(id) DO NOTHING',
  [s.id,s.name,JSON.stringify(s.examples||[]),JSON.stringify(s.sourceRepos||[]),s.evidence||null]
 );
 for(const c of data.capabilities)await client.query(
  'INSERT INTO opportunities.capabilities(id,name_en,description_en,evidence_status) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',
  [c.id,c.name,c.description,c.evidence_status]
 );
 for(const o of data.opportunities)await client.query(
  'INSERT INTO opportunities.sector_opportunities(id,sector_id,capability_id,title_en,summary_en,model_en,business_examples,source_repos,source_evidence,readiness,published) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11) ON CONFLICT(id) DO NOTHING',
  [o.id,o.sectorId,o.capabilityId,o.title,o.summaryEn,o.modelEn,JSON.stringify(o.businessExamples||[]),JSON.stringify(o.sourceRepos||[]),o.evidence||null,o.status,o.published]
 );
 for(const b of data.businesses)await client.query(
  'INSERT INTO opportunities.business_types(id,display_name,sector_id,sector_name,recommended_tools,visitor_pathway,readiness) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7) ON CONFLICT(id) DO NOTHING',
  [b.id,b.name,b.sectorId,b.sectorName,JSON.stringify(b.toolBundle||[]),b.pathway||null,b.status||'discovery_only']
 );
 const after=await client.query('SELECT COUNT(*)::int AS n FROM opportunities.sector_opportunities');
 if(after.rows[0].n!==333)throw Error('Unexpected row count after import: '+after.rows[0].n);
 await client.query('COMMIT');
 console.log('ADS_OPPORTUNITIES_DATABASE_SEED=PASS sectors=50 opportunities=333 businesses=52 (no reset)');
}catch(error){await client.query('ROLLBACK');console.error('Catalogue seed refused: '+error.message);process.exitCode=1}
finally{client.release();await pool.end()}

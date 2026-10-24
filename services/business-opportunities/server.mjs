// Public, read-only, database-backed discovery API. Separate from ADS Identity.
// Provision OPPORTUNITIES_DATABASE_URL with SELECT-only privilege.
// This service NEVER seeds or migrates on startup.
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {Pool} from 'pg';
import {handleDiscovery} from './discovery.mjs';
const BASE='/api/opportunities/v1';
const send=(res,code,payload)=>{
 res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=30','x-content-type-options':'nosniff'});
 res.end(JSON.stringify(payload));
};
const positive=(v,fallback,max)=>{const n=Number(v);return Number.isSafeInteger(n)&&n>=1?Math.min(n,max):fallback};
const queryText=v=>String(v||'').trim().slice(0,100);
const like=v=>'%'+v.replace(/[\\%_]/g,m=>'\\'+m)+'%';
const rowFields='o.id, o.title_en AS title, o.summary_en AS summary, o.summary_fr, o.model_en AS business_model, o.model_fr, o.readiness, s.id AS sector_id, s.name_en AS sector_name, o.business_examples, o.source_repos';
export function createHandler(pool){
 return async (req,res)=>{
  try{
   if(req.method!=='GET')return send(res,405,{error:'Method not allowed'});
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/health')return send(res,200,{status:'ok',service:'opportunities'});
   if(!url.pathname.startsWith(BASE+'/'))return send(res,404,{error:'Not found'});
   const route=url.pathname.slice(BASE.length);
   if(route.startsWith('/discovery/'))return await handleDiscovery(pool,url,res,send);
   if(route==='/sectors'){
    const r=await pool.query(
      'SELECT s.id,s.name_en AS name,s.business_examples,COUNT(o.id)::int AS opportunity_count FROM opportunities.sectors s LEFT JOIN opportunities.sector_opportunities o ON o.sector_id=s.id AND o.published=true WHERE s.published=true GROUP BY s.id ORDER BY s.name_en');
    return send(res,200,{data:r.rows,total:r.rows.length});
   }
   // Public directory of existing, approved discovery profiles; no private contact data.
   // This exposes the catalogue's 52 business types to the actual UI, not only to
   // API callers who already know what to search for.
   if(route==='/businesses'){
    const q=queryText(url.searchParams.get('q'));
    const sector=queryText(url.searchParams.get('sector'));
    const page=positive(url.searchParams.get('page'),1,10000);
    const limit=positive(url.searchParams.get('limit'),52,100);
    const params=[q?like(q):null,sector||null];
    const where="published=true AND ($1::text IS NULL OR display_name ILIKE $1 ESCAPE '\\\\' OR sector_name ILIKE $1 ESCAPE '\\\\') AND ($2::text IS NULL OR sector_id=$2)";
    const count=await pool.query('SELECT count(*)::int AS total FROM opportunities.business_types WHERE '+where,params);
    const rows=await pool.query('SELECT id,display_name AS name,sector_id,sector_name,recommended_tools,visitor_pathway,readiness FROM opportunities.business_types WHERE '+where+' ORDER BY display_name LIMIT $3 OFFSET $4',
      [...params,limit,(page-1)*limit]);
    return send(res,200,{data:rows.rows,total:count.rows[0].total,page,limit});
   }
   if(route==='/businesses/suggest'){
    const q=queryText(url.searchParams.get('q'));
    if(q.length<2)return send(res,200,{data:[],total:0});
    const r=await pool.query(
      "SELECT id,display_name AS name,sector_id,sector_name,recommended_tools,visitor_pathway FROM opportunities.business_types WHERE published=true AND (display_name ILIKE $1 ESCAPE '\\' OR sector_name ILIKE $1 ESCAPE '\\') ORDER BY CASE WHEN lower(display_name)=lower($2) THEN 0 ELSE 1 END,display_name LIMIT 20",
      [like(q),q]);
    return send(res,200,{data:r.rows,total:r.rows.length});
   }
   if(route.startsWith('/businesses/')){
    const id=route.slice('/businesses/'.length);
    if(!/^[a-z0-9-]{1,125}$/.test(id))return send(res,400,{error:'Invalid business ID'});
    const profile=await pool.query('SELECT id,display_name AS name,sector_id,sector_name,recommended_tools,visitor_pathway FROM opportunities.business_types WHERE id=$1 AND published=true',[id]);
    if(!profile.rows.length)return send(res,404,{error:'Business not found'});
    const b=profile.rows[0];
    const entries=await pool.query(
      'SELECT '+rowFields+' FROM opportunities.sector_opportunities o JOIN opportunities.sectors s ON s.id=o.sector_id WHERE o.published=true AND s.published=true AND s.id=$1 ORDER BY o.title_en LIMIT 80',[b.sector_id]);
    return send(res,200,{business:b,opportunities:entries.rows});
   }
   if(route.startsWith('/opportunities/')){
    const id=route.slice('/opportunities/'.length);
    if(!/^[a-z0-9-]{1,160}$/.test(id))return send(res,400,{error:'Invalid opportunity ID'});
    const r=await pool.query('SELECT '+rowFields+' FROM opportunities.sector_opportunities o JOIN opportunities.sectors s ON s.id=o.sector_id WHERE o.id=$1 AND o.published=true AND s.published=true',[id]);
    return r.rows.length?send(res,200,{data:r.rows[0]}):send(res,404,{error:'Opportunity not found'});
   }
   if(route==='/opportunities'){
    const sector=queryText(url.searchParams.get('sector')),q=queryText(url.searchParams.get('q'));
    const page=positive(url.searchParams.get('page'),1,10000),limit=positive(url.searchParams.get('limit'),24,48);
    const category=queryText(url.searchParams.get('category'));
    const params=[sector||null,q?like(q):null,category||null];
    const where="o.published=true AND s.published=true AND ($1::text IS NULL OR s.id=$1) AND ($2::text IS NULL OR o.title_en ILIKE $2 ESCAPE '\\' OR o.summary_en ILIKE $2 ESCAPE '\\' OR s.name_en ILIKE $2 ESCAPE '\\') AND ($3::text IS NULL OR EXISTS (SELECT 1 FROM opportunities.discovery_solutions d WHERE d.source_kind='sector-bundle' AND d.sector_id=s.id AND d.category_id=$3 AND d.published=true))";
    const count=await pool.query('SELECT COUNT(*)::int AS total FROM opportunities.sector_opportunities o JOIN opportunities.sectors s ON s.id=o.sector_id WHERE '+where,params);
    const rows=await pool.query('SELECT '+rowFields+' FROM opportunities.sector_opportunities o JOIN opportunities.sectors s ON s.id=o.sector_id WHERE '+where+' ORDER BY s.name_en,o.title_en LIMIT $4 OFFSET $5',[...params,limit,(page-1)*limit]);
    return send(res,200,{data:rows.rows,total:count.rows[0].total,page,limit});
   }
   return send(res,404,{error:'Not found'});
  }catch(err){
   console.error('ADS opportunities read error',err.code||err.name||'unknown');
   return send(res,503,{error:'Business opportunities are temporarily unavailable'});
  }
 };
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(!process.env.OPPORTUNITIES_DATABASE_URL)throw Error('OPPORTUNITIES_DATABASE_URL must be set to a catalogue SELECT-only PostgreSQL account');
 const pool=new Pool({connectionString:process.env.OPPORTUNITIES_DATABASE_URL,max:5,connectionTimeoutMillis:6000,statement_timeout:6000,query_timeout:7000});
 const port=positive(process.env.PORT,31090,65535);
 http.createServer(createHandler(pool)).listen(port,'0.0.0.0',()=>console.log('ADS opportunity read API listening on '+port));
}

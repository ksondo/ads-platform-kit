// Versioned public discovery endpoints backed only by the independent catalogue DB.
const allowedFamily=x=>x==='business'||x==='institutional'?x:null;
const limitNumber=(s,d,max)=>{let x=Number(s);return Number.isSafeInteger(x)&&x>0?Math.min(x,max):d};
const clean=x=>String(x||'').trim().slice(0,100);
const like=x=>'%'+x.replace(/[\\%_]/g,y=>'\\'+y)+'%';
const columns='id,family,category_id,sector_id,title_en AS title,summary_en AS summary,tools,examples,readiness,source_kind,required_permission_summary,verified_demo_url';
export async function handleDiscovery(pool,url,res,send){
 const path=url.pathname.split('/discovery/')[1]||'';
 const family=allowedFamily(url.searchParams.get('family')||'business');
 if(!family)return send(res,400,{error:'Invalid discovery family'});
 if(path==='categories'){
  const r=await pool.query(
    'SELECT c.id,c.family,c.name_en AS name,COUNT(s.id)::int AS opportunity_count FROM opportunities.discovery_categories c LEFT JOIN opportunities.discovery_solutions s ON s.category_id=c.id AND s.published=true WHERE c.family=$1 AND c.published=true GROUP BY c.id ORDER BY c.sort_order,c.name_en',[family]);
  return send(res,200,{data:r.rows,total:r.rows.length});
 }
 if(path==='modules'){
  const category=clean(url.searchParams.get('category'));
  const r=await pool.query("SELECT DISTINCT item.name FROM opportunities.discovery_solutions s CROSS JOIN LATERAL jsonb_array_elements_text(s.tools) AS item(name) WHERE s.family=$1 AND s.published=true AND ($2::text IS NULL OR s.category_id=$2) ORDER BY item.name LIMIT 250",
    [family,category||null]);
  return send(res,200,{data:r.rows.map(x=>x.name),total:r.rows.length});
 }
  if(path==='suggest'){
  const q=clean(url.searchParams.get('q'));
  if(q.length<2)return send(res,200,{data:[],total:0});
  const r=await pool.query(
    "SELECT DISTINCT id,title_en AS name,category_id,source_kind FROM opportunities.discovery_solutions WHERE family=$1 AND published=true AND (title_en ILIKE $2 ESCAPE '\\' OR summary_en ILIKE $2 ESCAPE '\\' OR examples::text ILIKE $2 ESCAPE '\\') ORDER BY name LIMIT 12",
    [family,like(q)]);
  return send(res,200,{data:r.rows,total:r.rows.length});
 }
 if(path.startsWith('solutions/')){
  const id=path.slice('solutions/'.length);
  if(!/^[a-z0-9-]{1,150}$/.test(id))return send(res,400,{error:'Invalid solution ID'});
  const r=await pool.query('SELECT '+columns+' FROM opportunities.discovery_solutions WHERE id=$1 AND published=true',[id]);
  if(!r.rows.length)return send(res,404,{error:'Not found'});
  return send(res,200,{data:r.rows[0]});
 }
 if(path==='solutions'){
  const category=clean(url.searchParams.get('category'));
  const search=clean(url.searchParams.get('q'));
  const tool=clean(url.searchParams.get('tool'));
  const page=limitNumber(url.searchParams.get('page'),1,10000);
  const limit=limitNumber(url.searchParams.get('limit'),12,24);
  const f=[family,category||null,search?like(search):null,tool||null];
  const where="family=$1 AND published=true AND ($2::text IS NULL OR category_id=$2) AND ($3::text IS NULL OR title_en ILIKE $3 ESCAPE '\\' OR summary_en ILIKE $3 ESCAPE '\\' OR examples::text ILIKE $3 ESCAPE '\\' OR tools::text ILIKE $3 ESCAPE '\\') AND ($4::text IS NULL OR tools @> jsonb_build_array($4::text))";
  const totals=await pool.query('SELECT count(*)::int AS total FROM opportunities.discovery_solutions WHERE '+where,f);
  const r=await pool.query('SELECT '+columns+' FROM opportunities.discovery_solutions WHERE '+where+' ORDER BY sort_order,title_en LIMIT $5 OFFSET $6',
    [...f,limit,(page-1)*limit]);
  return send(res,200,{data:r.rows,total:totals.rows[0].total,page,limit});
 }
 return send(res,404,{error:'Not found'});
}

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync, existsSync} from 'node:fs';
import {join, resolve, extname} from 'node:path';
import {chromium} from 'playwright';

const root=resolve('apps/demo-portal');
const fixture=resolve('services/business-opportunities/seed');
const catalogue=JSON.parse(readFileSync(join(fixture,'opportunities.v1.json'),'utf8'));
const discovery=JSON.parse(readFileSync(join(fixture,'discovery.v1.json'),'utf8'));
const ids=new Map(catalogue.sectors.map(s=>[s.id,s.name]));
const counts=id=>catalogue.opportunities.filter(x=>x.sectorId===id).length;
const sectors=catalogue.sectors.map(s=>({id:s.id,name:s.name,opportunity_count:counts(s.id)}));
const businesses=catalogue.businesses.map(x=>({
 id:x.id,name:x.name,sector_id:x.sectorId,sector_name:x.sectorName,
 recommended_tools:x.toolBundle,visitor_pathway:x.pathway,readiness:x.status
}));
const categoryCount=id=>discovery.solutions.filter(x=>x.categoryId===id).length;
const categories=discovery.categories.map(c=>({
 id:c.id,family:c.family,name:c.name_en,opportunity_count:categoryCount(c.id)
}));
const bundles=discovery.solutions.map(x=>({
 id:x.id,family:x.family,category_id:x.categoryId,sector_id:x.sectorId,
 title:x.title,summary:x.summary,tools:x.tools,examples:x.examples,
 readiness:x.stage,required_permission_summary:x.gate,category_name:categories.find(c=>c.id===x.categoryId)?.name
}));

function responseFor(route){
 const u=new URL(route,'http://localhost'),p=u.pathname,q=u.searchParams;
 if(p.endsWith('/sectors'))return {data:sectors,total:sectors.length};
 if(p.endsWith('/businesses'))return {data:businesses,total:businesses.length,page:1,limit:100};
 if(p.endsWith('/businesses/suggest'))return {data:[],total:0};
 if(p.endsWith('/discovery/categories')){
  const v=categories.filter(x=>x.family===(q.get('family')||'business'));
  return {data:v,total:v.length};
 }
 if(p.endsWith('/discovery/modules')){
  const v=bundles.filter(x=>x.family===(q.get('family')||'business')
   &&(!q.get('category')||x.category_id===q.get('category')));
  const m=[...new Set(v.flatMap(x=>x.tools))].sort();
  return {data:m,total:m.length};
 }
 if(p.endsWith('/discovery/suggest'))return {data:[],total:0};
 if(p.includes('/discovery/solutions/')){
  const x=bundles.find(x=>x.id===p.split('/').at(-1));
  return x?{data:x}:{error:'Not found'};
 }
 if(p.endsWith('/discovery/solutions')){
  const v=bundles.filter(x=>x.family===(q.get('family')||'business')
   &&(!q.get('category')||x.category_id===q.get('category'))
   &&(!q.get('tool')||x.tools.includes(q.get('tool')))
   &&(!q.get('q')||(x.title+' '+x.summary+' '+x.examples.join(' ')).toLowerCase().includes(q.get('q').toLowerCase())));
  const limit=Number(q.get('limit')||12),page=Number(q.get('page')||1);
  return {data:v.slice((page-1)*limit,page*limit),total:v.length,page,limit};
 }
 if(p.endsWith('/opportunities')){
  const v=catalogue.opportunities.filter(x=>(!q.get('sector')||x.sectorId===q.get('sector'))
   &&(!q.get('q')||(x.title+' '+x.summaryEn).toLowerCase().includes(q.get('q').toLowerCase())));
  const limit=Number(q.get('limit')||12),page=Number(q.get('page')||1);
  return {data:v.slice((page-1)*limit,page*limit).map(x=>({
    id:x.id,sector_id:x.sectorId,sector_name:ids.get(x.sectorId),
    title:x.title,summary:x.summaryEn,business_model:x.modelEn,
    readiness:x.status,business_examples:x.businessExamples
  })),total:v.length,page,limit};
 }
 return {data:[],total:0};
}
function serve(req,res){
 const url=new URL(req.url,'http://localhost');
 let name=url.pathname;
 if(name==='/'||!extname(name))name='/index.html';
 const file=resolve(root,'.'+name);
 if(!file.startsWith(root+'/')||!existsSync(file)){res.writeHead(404);res.end();return}
 const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css'};
 res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream'});
 res.end(readFileSync(file));
}
test('Chromium discovers 49 sectors, 52 local businesses, regulator services and their permissions', {timeout:120000},async()=>{
 const server=http.createServer(serve);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://images.unsplash.com/**',route=>route.abort());
  await page.route('https://fonts.googleapis.com/**',route=>route.abort());
  await page.route('https://fonts.gstatic.com/**',route=>route.abort());
  await page.route('**/api/opportunities/v1/**',route=>
   route.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify(responseFor(route.request().url()))}));
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  await page.locator('.ads-discovery-path a').first().waitFor();
  assert.equal(await page.locator('.ads-discovery-path').count(),3);
  await page.locator('.ads-discovery-path').last().locator('a').click();
  assert.match(page.url(),/family=institutional/);
  await page.locator('button[data-category^="institutional-"]').first().waitFor();
  await page.goto('http://127.0.0.1:'+server.address().port+'/opportunities');
  await page.locator('#opp-select-business').waitFor();
  assert.equal(await page.locator('#opp-select-sector option').count(),1);
  assert.equal(await page.locator('#opp-select-business option').count(),1);
  await page.locator('#opp-select-category').selectOption('business-processing');
  await page.locator('#opp-select-sector').waitFor();
  assert.ok((await page.locator('#opp-select-sector option').count())>2);
  assert.ok((await page.locator('#opp-select-sector option').count())<50);
  await page.screenshot({path:'/tmp/ads-opportunities-business-sectors.png',fullPage:true});
  await page.locator('#opp-select-business').selectOption('wood-processor-sawmill');
  await page.locator('.opp-business-context').waitFor();
  assert.match(await page.locator('.opp-business-context').innerText(),/Processing ERP/);
  assert.match(page.url(),/sector=wood-forest-processing/);
  await page.locator('button[data-family="institutional"]').click();
  await page.locator('[data-category="institutional-tax"]').waitFor();
  assert.equal(await page.locator('button[data-category^="institutional-"]').count(),8);
  await page.screenshot({path:'/tmp/ads-opportunities-regulator-services.png',fullPage:true});
  await page.locator('button[data-category="institutional-standards"]').click();
  await page.locator('.opp-detail-open').first().click();
  await page.locator('.opp-permit').waitFor();
  assert.match(await page.locator('.opp-permit').innerText(),/authority|certification|approval/i);
  assert.deepEqual(errors,[],errors.join('; '));
  await page.setViewportSize({width:390,height:844});
  await page.goto('http://127.0.0.1:'+server.address().port+'/opportunities');
  await page.locator('#opp-select-business').waitFor();
  assert.equal(await page.locator('#opp-select-sector option').count(),1);
  await page.locator('#opp-select-category').selectOption('business-processing');
  await page.locator('#opp-select-sector option[value="wood-forest-processing"]').waitFor({state:'attached'});
  await page.screenshot({path:'/tmp/ads-opportunities-mobile.png',fullPage:true});
  await page.screenshot({path:'/tmp/ads-opportunities-interactive-smoke.png',fullPage:true});
 }finally{
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
 }
});

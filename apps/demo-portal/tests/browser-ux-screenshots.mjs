import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync, existsSync, mkdirSync} from 'node:fs';
import {join, resolve, extname} from 'node:path';
import {chromium} from 'playwright';

const root=resolve('apps/demo-portal');
const sourceNginx=readFileSync(join(root,'nginx.conf'),'utf8');
const csp=sourceNginx.match(/add_header Content-Security-Policy "([^"]+)" always;/)?.[1];
assert.ok(csp&&csp.includes("style-src 'self'")&&!csp.includes("'unsafe-inline'"),
 'browser screenshots must enforce the existing strict production CSP');
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
function serve(req,res,assetRoot=root){
 const url=new URL(req.url,'http://localhost');
 let name=url.pathname;
 if(name==='/'||!extname(name))name='/index.html';
 const file=resolve(assetRoot,'.'+name);
 if(!file.startsWith(assetRoot+'/')||!existsSync(file)){res.writeHead(404);res.end();return}
 const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css'};
 res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream',
  'content-security-policy':csp});
 res.end(readFileSync(file));
}

test('P1–P4 before-and-after screenshots: five pages, EN/FR, 360/768/1280', {timeout:240000},async()=>{
 const baselineRoot=resolve('baseline-demo/apps/demo-portal');
 assert.ok(existsSync(join(baselineRoot,'index.html')),'missing baseline main checkout');
 const shots=resolve(process.env.UX_SHOT_DIR||'ux-screenshots');
 mkdirSync(shots,{recursive:true});
 const beforeServer=http.createServer((req,res)=>serve(req,res,baselineRoot));
 const afterServer=http.createServer((req,res)=>serve(req,res,root));
 await Promise.all([beforeServer,afterServer].map(server=>new Promise(done=>server.listen(0,'127.0.0.1',done))));
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const pages=[['home','/'],['platforms','/platforms'],['commerce','/platforms/commerce'],
   ['opportunities','/opportunities'],['demo-access','/demo-access']];
  for(const [phase,server] of [['before',beforeServer],['after',afterServer]]){
   for(const width of [360,768,1280]){
    for(const lang of ['en','fr']){
     const context=await browser.newContext({viewport:{width,height:860},locale:lang==='en'?'en-US':'fr-CM',colorScheme:'light'});
     await context.addInitScript(language=>{
       window.localStorage.setItem('ads-portal-lang',language);
     },lang);
     const page=await context.newPage();
     const errors=[],cspErrors=[];
     page.on('pageerror',e=>errors.push(e.message));
     page.on('console',message=>{
      if(/content security policy|violates.*style-src|refused to apply inline style/i.test(message.text()))cspErrors.push(message.text());
     });
     // Stable screenshots without unrelated third-party photo/font fetches.
     await page.route('https://images.unsplash.com/**',route=>route.abort());
     await page.route('https://fonts.googleapis.com/**',route=>route.abort());
     await page.route('https://fonts.gstatic.com/**',route=>route.abort());
     await page.route('**/api/opportunities/v1/**',route=>
       route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(responseFor(route.request().url()))}));
     for(const [name,path] of pages){
      await page.goto('http://127.0.0.1:'+server.address().port+path,{waitUntil:'domcontentloaded'});
      if(name==='opportunities')await page.locator('.opp-results-bar').waitFor({timeout:10000});
      else await page.locator('main h1').first().waitFor({timeout:10000});
      if(phase==='after'){
       assert.deepEqual(cspErrors,[],name+' '+width+' '+lang+' CSP violations: '+cspErrors.join('; '));
       if(lang==='fr'){
        const pageText=await page.locator('body').innerText();
        for(const english of ['Learning and school management solutions','Online stores, product catalogues',
          'Buy Now, Pay Later','Inventory Management','White-label Storefronts',
          'Skip to content','ADS PARTNERSHIPS']){
         assert.ok(!pageText.includes(english),name+' '+width+' untranslated: '+english);
        }
       }
      }
      await page.screenshot({path:join(shots,phase+'-'+name+'-'+width+'-'+lang+'.png'),fullPage:true,animations:'disabled'});
     }
     if(errors.length)console.error(phase,width,lang,'browser errors:',errors.slice(0,4));
     await context.close();
    }
   }
  }
  assert.equal(existsSync(join(shots,'after-opportunities-360-fr.png')),true);
  assert.equal(existsSync(join(shots,'before-home-1280-en.png')),true);
  console.log('ADS_UX_SCREENSHOTS=PASS 60 before/after page-viewport-language captures');
 }finally{
  await browser?.close();
  await Promise.all([beforeServer,afterServer].map(server=>new Promise(done=>server.close(done))));
 }
});

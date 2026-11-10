// Local UI evidence only: static portal + real Commerce production assets. Hosted auth/API acceptance is separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,relative,isAbsolute,extname,join} from 'node:path';
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const portal=resolve('apps/demo-portal');
const csp=readFileSync(join(portal,'nginx.conf'),'utf8').match(/add_header Content-Security-Policy "([^"]+)" always;/)?.[1];
function staticServer(root,policy){
 return http.createServer((req,res)=>{
  const path=new URL(req.url,'http://local.invalid').pathname;
  if(path.startsWith('/api/')){res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"LOCAL_STATIC_UI_ONLY"}');return}
  const asset=resolve(root,'.'+(path==='/'||!extname(path)?'/index.html':path)),rel=relative(root,asset);
  if(rel.startsWith('..')||isAbsolute(rel)||!existsSync(asset)){res.writeHead(404);res.end();return}
  res.writeHead(200,{'content-type':({'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml'}[extname(asset)]||'application/octet-stream'),...(policy?{'content-security-policy':policy}:{})});
  res.end(readFileSync(asset));
 });
}
test('private-first portal and Commerce introduction: EN/FR at 360/768/1280 with no request POST', {timeout:240000},async()=>{
 assert.ok(process.env.ADS_UI_SCREENSHOT_DIR,'Set ADS_UI_SCREENSHOT_DIR to the approved screenshot output directory');
 assert.ok(process.env.COMMERCE_UI_DIST,'Set COMMERCE_UI_DIST to the private-mode Commerce production build');
 const shots=resolve(process.env.ADS_UI_SCREENSHOT_DIR);mkdirSync(shots,{recursive:true});
 const servers=[staticServer(portal,csp),staticServer(resolve(process.env.COMMERCE_UI_DIST))];
 await Promise.all(servers.map(s=>new Promise(done=>s.listen(0,'127.0.0.1',done))));
 let browser;
 try{
  browser=await chromium.launch({headless:true});
  for(const width of [360,768,1280])for(const lang of ['en','fr']){
   const context=await browser.newContext({viewport:{width,height:900},locale:lang==='fr'?'fr-CM':'en-US',reducedMotion:'reduce'});
   await context.addInitScript(l=>localStorage.setItem('ads-portal-lang',l),lang);
   const page=await context.newPage(),posts=[],errors=[],cspErrors=[];
   page.on('request',r=>{if(r.method()==='POST')posts.push(r.url())});
   page.on('pageerror',e=>errors.push(e.message));
   page.on('console',m=>{if(/content security policy|violates.*style-src/i.test(m.text()))cspErrors.push(m.text())});
   // Keep external image/font variability out of local layout evidence.
   await page.route('https://**/*',route=>route.abort());
   for(const [name,path,server] of [['portal-commerce','/platforms/commerce',servers[0]],['portal-access','/demo-access',servers[0]],['commerce-intro','/commerce/demo?lang='+lang,servers[1]]]){
    await page.goto('http://127.0.0.1:'+server.address().port+path,{waitUntil:'domcontentloaded'});
    await page.locator('main h1').first().waitFor();
    if(name==='commerce-intro'){
     await page.getByTestId('demo-requests-unavailable').waitFor();
     assert.equal(await page.getByTestId('demo-email').count(),0);
     assert.equal(await page.getByTestId('demo-request').count(),0);
     assert.equal(await page.locator('form').count(),0);
     assert.equal(await page.getByTestId('demo-sign-in').isEnabled(),true);
    }else{
     await page.getByTestId('public-demo-unavailable').waitFor();
     if(name==='portal-commerce'){
      const label=lang==='fr'?'Ouvrir la démo privée':'Open private demo';
      const launch=page.getByRole('link',{name:new RegExp(label)}).first();
      assert.equal(await launch.getAttribute('href'),'https://commerce.demo.africadigitalsynergy.com/commerce/demo?lang='+lang);
      assert.equal(await launch.getAttribute('rel'),'noopener noreferrer');
     }
    }
    const text=await page.locator('main').innerText();
    assert.ok(text.includes(lang==='fr'?'temporairement indisponibles':'temporarily unavailable'));
    assert.doesNotMatch(text,/you receive an email invitation|vous recevez une invitation|demo\.user@|DEMO_PASSWORD|password:/i);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' horizontal overflow at '+width+' '+lang);
    await page.screenshot({path:join(shots,name+'-'+width+'-'+lang+'.png'),fullPage:true,animations:'disabled'});
    // External fonts are intentionally blocked in this local fixture. Do not ask axe to fetch their
    // cross-origin CSS through connect-src; all WCAG rules still run against rendered computed styles.
    const a11y=await new AxeBuilder({page}).options({preload:false}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
    assert.deepEqual(a11y.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)})),[],name+' '+width+' '+lang+' accessibility violations');
   }
   assert.deepEqual(posts,[],'private UI must send no POST');assert.deepEqual(errors,[]);assert.deepEqual(cspErrors,[]);
   await context.close();
  }
 }finally{await browser?.close();await Promise.all(servers.map(s=>new Promise(done=>s.close(done))))}
});

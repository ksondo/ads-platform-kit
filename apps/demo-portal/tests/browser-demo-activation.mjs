// Local UI evidence for per-product demo activation (owner assignment 7 Nov 2026).
// Static portal only, external requests blocked; no product, Identity, account or secret is used.
// Run: PLAYWRIGHT_BROWSERS_PATH=... ADS_UI_SCREENSHOT_DIR=/abs/dir node --test apps/demo-portal/tests/browser-demo-activation.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,relative,isAbsolute,extname,join} from 'node:path';
import {chromium} from 'playwright';

const portal=resolve('apps/demo-portal');
const csp=readFileSync(join(portal,'nginx.conf'),'utf8').match(/add_header Content-Security-Policy "([^"]+)" always;/)?.[1];
const catalogue=JSON.parse(readFileSync(join(portal,'catalogue.json'),'utf8'));
const COMMERCE='https://commerce.demo.africadigitalsynergy.com/commerce/demo';
// activation: undefined = shipped file, null = 404, string = raw body, object = JSON body.
function server(activation){
 return http.createServer((req,res)=>{
  const path=new URL(req.url,'http://local.invalid').pathname;
  if(path.startsWith('/api/')){res.writeHead(503,{'content-type':'application/json'});res.end('{}');return}
  if(path==='/demo-activation.json'&&activation!==undefined){
   if(activation===null){res.writeHead(404);res.end();return}
   res.writeHead(200,{'content-type':'application/json'});res.end(typeof activation==='string'?activation:JSON.stringify(activation));return;
  }
  const asset=resolve(portal,'.'+(path==='/'||!extname(path)?'/index.html':path)),rel=relative(portal,asset);
  if(rel.startsWith('..')||isAbsolute(rel)||!existsSync(asset)){res.writeHead(404);res.end();return}
  res.writeHead(200,{'content-type':({'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css'}[extname(asset)]||'application/octet-stream'),'content-security-policy':csp});
  res.end(readFileSync(asset));
 });
}
const MIXED={schemaVersion:1,products:{education:'open','fleet-guard':'open',agriculture:'unavailable','digital-tontine':'bogus',ventureworks:'open'}};
const ALL_PREPARING={education:'preparing',agriculture:'preparing','digital-tontine':'preparing','fleet-guard':'preparing',ventureworks:'preparing'};
const SCENARIOS=[
 ['default',undefined,ALL_PREPARING],
 ['mixed',MIXED,{education:'open',agriculture:'unavailable','digital-tontine':'preparing','fleet-guard':'open',ventureworks:'open'}],
 ['missing',null,ALL_PREPARING],
 ['invalid','{not json',ALL_PREPARING],
 ['ventureworks-unavailable',{schemaVersion:1,products:{ventureworks:'unavailable'}},{...ALL_PREPARING,ventureworks:'unavailable'}],
];
test('demo activation: preparing by default, open/unavailable on operator switch, fail closed; EN/FR 360/768/1280',{timeout:300000},async()=>{
 const shots=process.env.ADS_UI_SCREENSHOT_DIR?resolve(process.env.ADS_UI_SCREENSHOT_DIR):null;
 if(shots)mkdirSync(shots,{recursive:true});
 const browser=await chromium.launch({headless:true});
 try{
  for(const [name,activation,expected] of SCENARIOS){
   const srv=server(activation);await new Promise(done=>srv.listen(0,'127.0.0.1',done));
   const base='http://127.0.0.1:'+srv.address().port;
   try{
    const widths=name==='default'||name==='mixed'?[360,768,1280]:[1280];
    for(const width of widths)for(const lang of ['en','fr']){
     const context=await browser.newContext({viewport:{width,height:900},locale:lang==='fr'?'fr-CM':'en-US',reducedMotion:'reduce'});
     await context.addInitScript(l=>localStorage.setItem('ads-portal-lang',l),lang);
     const page=await context.newPage(),errors=[],posts=[];
     page.on('pageerror',e=>errors.push(e.message));
     page.on('request',r=>{if(r.method()!=='GET')posts.push(r.url())});
     await page.route('https://**/*',route=>route.abort());
     await page.goto(base+'/platforms',{waitUntil:'domcontentloaded'});
     await page.locator('.platform-card').first().waitFor();
     for(const [id,state] of Object.entries(expected)){
      const p=catalogue.platforms.find(x=>x.id===id);
      const card=page.locator('.platform-card[href="/platforms/'+id+'"], .platform-card[href^="'+p.demoDestination+'"]');
      assert.equal(await card.count(),1,name+' card '+id);
      assert.equal(await card.getAttribute('data-demo-state'),state,name+' '+id+' card state');
      const href=await card.getAttribute('href');
      if(state==='open'){
       assert.equal(href,p.demoDestination+'?lang='+lang);
       assert.equal(await card.getAttribute('target'),'_blank');assert.equal(await card.getAttribute('rel'),'noopener noreferrer');
       assert.match(await card.innerText(),lang==='fr'?/Ouvrir la démo/:/Open demo/);
      }else{
       assert.equal(href,'/platforms/'+id,'not opened: stays inside the portal');
       assert.match(await card.innerText(),state==='unavailable'?(lang==='fr'?/Momentanément indisponible/:/Temporarily unavailable/):(lang==='fr'?/Démo en préparation/:/Demo being prepared/));
      }
     }
     // Commerce keeps its existing link whatever the activation file says, with the portal language added.
     const commerce=page.locator('.platform-card[data-demo-state="live"]');
     assert.equal(await commerce.count(),1);assert.equal(await commerce.getAttribute('href'),COMMERCE+'?lang='+lang);
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow /platforms '+width+' '+lang);
     if(shots)await page.screenshot({path:join(shots,`portal-${name}-platforms-${width}-${lang}.png`),fullPage:true,animations:'disabled'});
     // Detail pages: open = one launch link; unavailable/preparing = clear state, no link to the product host.
     for(const [id,state] of Object.entries(expected)){
      if(name!=='mixed'&&id!=='education'&&id!=='ventureworks')continue;
      const p=catalogue.platforms.find(x=>x.id===id),host=new URL(p.demoDestination).host;
      await page.goto(base+'/platforms/'+id,{waitUntil:'domcontentloaded'});
      await page.getByTestId('demo-state-'+state).waitFor();
      const links=page.locator('main a[href*="'+host+'"]');
      if(state==='open'){
       assert.equal(await links.count(),1);assert.equal(await links.first().getAttribute('href'),p.demoDestination+'?lang='+lang);
       // Keyboard: the launch link is focusable with Tab.
       let reached=false;for(let i=0;i<40&&!reached;i++){await page.keyboard.press('Tab');reached=await page.evaluate(h=>document.activeElement?.getAttribute('href')===h,p.demoDestination+'?lang='+lang);}
       assert.ok(reached,'open demo link reachable by keyboard');
      }else{
       assert.equal(await links.count(),0,name+' '+id+' must not link to the product');
       if(state==='unavailable'){await page.getByTestId('demo-unavailable').waitFor();assert.equal(await page.getByRole('alert').count(),1);}
      }
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow '+id+' '+width+' '+lang);
      if(shots&&(name==='mixed'||name==='default'))await page.screenshot({path:join(shots,`portal-${name}-${id}-${state}-${width}-${lang}.png`),fullPage:false,animations:'disabled'});
     }
     const text=await page.locator('body').innerText();
     assert.doesNotMatch(text,/password:|mot de passe :|DEMO_PASSWORD|CHECK_SECRET/i);
     assert.deepEqual(errors,[]);assert.deepEqual(posts,[]);
     await context.close();
    }
   }finally{await new Promise(done=>srv.close(done))}
  }
 }finally{await browser.close()}
});

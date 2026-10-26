import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('ADS company and portal landing remain the same',()=>{
 const js=read('../main.js');
 assert.ok(js.includes('function landing(){'));
 assert.ok(js.includes('function hero(){'));
 assert.ok(js.includes('function platformDirectory(){'));
 assert.ok(js.includes('function platformDetail(p){'));
 assert.ok(js.includes('function cloud(){'));
 assert.ok(js.includes('function demoAccessGuide()'));
 assert.ok(js.includes('function header()'));
 assert.ok(js.includes('function footer()'));
});
test('only Business Opportunities route is delegated to dynamic module',()=>{
 const js=read('../main.js');
 assert.ok(js.includes('else if(path==="/opportunities") main=ADSOpportunities.directoryShell()'));
 assert.ok(js.includes('legacy?toolDetail(legacy):ADSOpportunities.detailShell()'));
 assert.ok(js.includes('ADSOpportunities.hydrate(path,lang)'));
 assert.ok(js.includes('path==="/cloud") main=cloud()'));
 assert.ok(js.includes('path==="/platforms") main=platformDirectory()'));
});
test('already published Commerce and POS detail routes still work',()=>{
 const catalogue=JSON.parse(read('../catalogue.json'));
 assert.ok(catalogue.tools.some(t=>t.id==='ecommerce'));
 assert.ok(catalogue.tools.some(t=>t.id==='pos'));
 assert.ok(catalogue.tools.some(t=>t.id==='bnpl'));
});
test('no new login provider or unverified demo links were added',()=>{
 const js=read('../opportunities-page.js');
 assert.ok(js.includes('/api/opportunities/v1'));
 assert.ok(js.includes('https://wa.me/237654035075'));
 assert.ok(!js.includes('window.open('));
 assert.ok(!js.includes('localStorage.setItem('));
 assert.ok(!js.includes('demoUrl'));
});

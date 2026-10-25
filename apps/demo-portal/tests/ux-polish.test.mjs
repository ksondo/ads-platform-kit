import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const script=load('main.js'),ux=load('opportunities-v2.js');
const catalogue=JSON.parse(load('catalogue.json'));
const groups=JSON.parse(load('sector-groups.json'));
const html=load('index.html');
const translations=load('opportunities-fr.js');
test('P1 and P2: HTML render templates do not emit inline styles and CSP remains strict',()=>{
 for(const [name,src] of [['main',script],['opportunities-v2',ux],['index',html]]) {
   assert.ok(!src.includes('style='),name+' emits blocked inline CSS');
 }
 const nginx=load('nginx.conf');
 assert.ok(nginx.includes('Content-Security-Policy'));
 assert.ok(!nginx.includes("'unsafe-inline'"));
});
test('P2-3: all public platform and tool catalogue entries have curated French content',()=>{
 assert.equal(catalogue.platforms.length,25);
 for(const p of catalogue.platforms){
  assert.ok(p.fr&&p.summary_fr,p.id);
  assert.ok(['coming_soon','verified_demo'].includes(p.availability),p.id);
  if(p.availability==='coming_soon')assert.equal(p.demoUrl,null,p.id);
 }
 for(const t of catalogue.tools)assert.ok(t.fr&&t.summary_fr&&t.model_fr,t.id);
 for(const key of ['sectorFr','businessFr','categoryFr'])assert.ok(translations.includes(key));
 assert.equal(Object.keys(groups.groups).length,13);
});
test('P2-4: correct count singular/plural for zero, one and two',()=>{
 const stub={document:{getElementById:()=>({innerHTML:''})},localStorage:{getItem:()=>null},navigator:{language:'fr-CM'}};
 const source=script.replace(/^import \* as ADSOpportunities[^\n]*\n/m,'').replace(/start\(\);\s*$/,'globalThis.__count=countLabel;');
 vm.runInNewContext(source,stub);
 assert.equal(stub.__count(0,'tools'),'0 outils');
 assert.equal(stub.__count(1,'tools'),'1 outil');
 assert.equal(stub.__count(2,'tools'),'2 outils');
});
test('P3-11 and P3-12: route titles and static fallback for crawlers',()=>{
 assert.ok(script.includes('document.title=sectionTitle'));
 assert.ok(script.includes('opportunityCounts.sectors'));
 for(const path of ['/platforms','/opportunities','/demo-access']) assert.ok(html.includes(path));
 for(const field of ['og:title','og:description','og:url','twitter:card'])assert.ok(html.includes(field));
 assert.ok(!html.includes('Loading ADS Digital Ecosystem'));
});
test('P3-6: locally maintained group map is 13 categories and UI supports activity typeahead',()=>{
 assert.ok(ux.includes('opp-activity-search'));
 assert.ok(ux.includes("/sector-groups.json"));
 assert.ok(ux.includes("groups[state.category].includes(v.id)"));
 const ids=Object.values(groups.groups).flat();
 assert.equal(ids.length,49);
 assert.equal(new Set(ids).size,49);
});
test('P1-3 and P2-2: contact email is primary and WhatsApp remains secondary',()=>{
 assert.ok(script.includes('mailto:admin@africadigitalsynergy.com'));
 assert.ok(ux.includes('mailto:admin@africadigitalsynergy.com'));
 assert.ok(script.includes('https://wa.me/237654035075'));
});

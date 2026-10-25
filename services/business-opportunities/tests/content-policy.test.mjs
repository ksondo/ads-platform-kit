import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=(name)=>JSON.parse(readFileSync(new URL('../seed/'+name,import.meta.url),'utf8'));
const catalogue=load('opportunities.v1.json');
const discovery=load('discovery.v1.json');
const excluded=(['match','making'].join('')+'|'+['dat','ing'].join(''));
test('no withdrawn sectors, activities, tools, operator roles or repository tags re-enter public data',()=>{
 const text=JSON.stringify({catalogue,discovery});
 assert.doesNotMatch(text,new RegExp(excluded,'i'));
 assert.equal(catalogue.sectors.length,49);
 assert.equal(catalogue.opportunities.length,328);
 assert.equal(catalogue.businesses.length,52);
 assert.equal(discovery.solutions.length,121);
 assert.equal(discovery.solutions.filter(s=>s.family==='business').length,101);
 assert.equal(discovery.solutions.filter(s=>s.family==='institutional').length,20);
});
test('public catalogue rejects sports wagering and gambling terms',()=>{
 const forbidden=['football betting','sports betting','betting','gambling','lottery','casino','paris sportifs'];
 for(const term of forbidden) assert.ok(!JSON.stringify({catalogue,discovery}).toLowerCase().includes(term),term);
});
test('every discovery category points only to approved sectors',()=>{
 const ids=new Set(catalogue.sectors.map(s=>s.id));
 for(const c of discovery.categories)for(const id of (c.sectorIds||[]))
   assert.ok(ids.has(id),c.id+': '+id);
 for(const s of discovery.solutions)if(s.sectorId)assert.ok(ids.has(s.sectorId),s.id);
});

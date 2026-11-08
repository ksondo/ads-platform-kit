import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = p => JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const catalogue=read('../catalogue.json');
const activation=read('../demo-activation.json');
const FOUR=['education','agriculture','digital-tontine','fleet-guard'];

test('home discovery features exactly the four source release candidates',()=>{
 assert.deepEqual(catalogue.platforms.filter(p=>p.featured).map(p=>p.id),FOUR);
 for(const id of FOUR){
  const p=catalogue.platforms.find(x=>x.id===id);
  assert.ok(p, id);
  assert.ok(p.summary.length>=45&&p.summary_fr.length>=45, 'EN/FR product description: '+id);
  assert.ok(!/production.ready|deploy(ed|ment) complete|en production|déployée/i.test(p.summary+' '+p.summary_fr),
   'no unverified hosting claims: '+id);
 }
});
test('source-ready cards never publish an unverified Contabo demo link',()=>{
 assert.deepEqual(Object.keys(activation.products).sort(),[...FOUR].sort());
 for(const id of FOUR){
  const p=catalogue.platforms.find(x=>x.id===id);
  assert.equal(p.availability,'coming_soon');
  assert.equal(p.demoUrl,null);
  assert.equal(activation.products[id],'preparing');
  assert.match(p.demoDestination,/^https:\/\/[a-z0-9-]+\.demo\.africadigitalsynergy\.com\/demo$/);
 }
 const commerce=catalogue.platforms.find(x=>x.id==='commerce');
 assert.equal(commerce.demoUrl,'https://commerce.demo.africadigitalsynergy.com/commerce/demo');
 assert.equal(catalogue.publicDemoRequestsEnabled,true,'keep existing request-entry behavior');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 opportunityImage, solutionPhotoKeys, opportunityCredits, mappedOpportunityCount
} from '../opportunity-image-library.js';

const source=JSON.parse(readFileSync(
 new URL('../../../services/business-opportunities/seed/discovery.v1.json',import.meta.url),'utf8'));
const categories=new Map(source.categories.map(x=>[x.id,x]));

test('all 121 public solutions have stable individual photo assignments',()=>{
 assert.equal(source.solutions.length,121);
 assert.equal(mappedOpportunityCount,121);
 assert.deepEqual(Object.keys(solutionPhotoKeys).sort(),source.solutions.map(x=>x.id).sort());
 for(const solution of source.solutions){
  const url=opportunityImage({id:solution.id,category_id:solution.categoryId});
  assert.match(url,/^https:\/\/(commons.wikimedia.org|images.unsplash.com)\//,solution.id);
 }
});
test('the whole category has no repeated image within any of 21 sector groups',()=>{
 const categoriesById=Object.groupBy(source.solutions,x=>x.categoryId);
 assert.equal(Object.keys(categoriesById).length,21);
 for(const [cat,items] of Object.entries(categoriesById)){
  assert.ok(categories.has(cat),'unknown category '+cat);
  const images=items.map(item=>opportunityImage({id:item.id,category_id:cat}));
  assert.equal(new Set(images).size,items.length,cat+' repeats a card photo');
 }
 const retail=categoriesById['business-commerce'];
 assert.equal(retail.length,13);
 const processing=categoriesById['business-processing'];
 assert.equal(processing.length,11);
});
test('unknown solution uses category pool/fallback and never an invented external domain',()=>{
 const example=opportunityImage({id:'not-in-catalogue',category_id:'business-commerce'},740,4);
 assert.match(example,/^https:\/\/(commons.wikimedia.org|images.unsplash.com)\//);
 assert.ok(example!==opportunityImage({id:'not-in-catalogue',category_id:'business-commerce'},740,5));
 assert.equal(opportunityImage({id:'not-in-catalogue',category_id:'unknown-category'}),'');
});
test('all researched Commons photographs have source, author and correct licence',()=>{
 assert.ok(opportunityCredits.length>=15);
 for(const p of opportunityCredits){
  assert.ok(p.file&&p.author&&p.en&&p.fr&&p.source.startsWith('https://commons.wikimedia.org/wiki/File:'),p.id);
  assert.match(p.license,/^https:\/\/creativecommons.org\/licenses\/by(?:-sa)?\/(?:2\.0|4\.0)\/$/);
 }
 assert.ok(opportunityCredits.some(p=>p.license.endsWith('/by/2.0/')),
  'keep original photo specific CC BY licence rather than relabelling it');
});
test('UI, modal and built nginx image use opportunity-specific lookup',()=>{
 const js=readFileSync(new URL('../opportunities-v2.js',import.meta.url),'utf8');
 const main=readFileSync(new URL('../main.js',import.meta.url),'utf8');
 const docker=readFileSync(new URL('../Dockerfile',import.meta.url),'utf8');
 assert.ok(js.includes('solutionCard(x,t,state.view,index)'));
 assert.ok(js.includes('opportunityImage(x,740,index)'));
 assert.ok(js.includes('opportunityImage(data,960,0)'));
 assert.ok(main.includes('[...credits,...opportunityCredits]'));
 assert.ok(docker.includes('COPY apps/demo-portal/opportunity-image-library.js'));
});

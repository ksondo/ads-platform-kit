import test from 'node:test';
import assert from 'node:assert/strict';
import {loadAndValidate} from '../validate-seed.mjs';
import {createHandler} from '../server.mjs';
const data=loadAndValidate();
test('all 333 entries have a distinct sector mapping, summary and evidence scope',()=>{
 assert.equal(data.sectors.length,50);
 assert.equal(data.opportunities.length,333);
 assert.equal(data.businesses.length,52);
 assert.equal(new Set(data.opportunities.map(x=>x.id)).size,333);
 for(const x of data.opportunities){
   assert.ok(x.summaryEn.includes('digital tool helps'),x.id);
   assert.ok(x.modelEn.length>80,x.id);
   assert.equal(x.status,'discovery_only');
   assert.ok(x.sourceRepos.length>0);
 }
});
test('tool reuse is represented separately from sector opportunities',()=>{
 assert.ok(data.capabilities.length<data.opportunities.length);
 assert.equal(new Set(data.opportunities.map(x=>x.capabilityId)).size,data.capabilities.length);
});
const invoke=async(url,method='GET',query=async()=>({rows:[]}))=>{
 let response,code;
 const res={writeHead(status){code=status},end(body){response=JSON.parse(body)}};
 await createHandler({query})({url,method},res);
 return {code,response};
};
test('API rejects unknown routes and writes without touching the DB',async()=>{
 const reject=()=>{throw Error('db should not be invoked')};
 assert.equal((await invoke('/api/opportunities/v1/sectors','POST',reject)).code,405);
 assert.equal((await invoke('/elsewhere','GET',reject)).code,404);
 assert.equal((await invoke('/api/opportunities/v1/opportunities/%22bad','GET',reject)).code,400);
});
test('business suggestions require at least two characters and use parameterized query',async()=>{
 const nope=()=>{throw Error('short query should not access DB')};
 assert.equal((await invoke('/api/opportunities/v1/businesses/suggest?q=a','GET',nope)).response.total,0);
 let seen;
 await invoke('/api/opportunities/v1/businesses/suggest?q=%27%20OR%201%3D1','GET',async(sql,params)=>{seen={sql,params};return{rows:[]}});
 assert.ok(seen.sql.includes('$1'));
 assert.ok(!seen.sql.includes("' OR 1=1"));
 assert.ok(seen.params[0].startsWith('%'));
});
test('opportunities pagination caps limit at 48 and reports DB totals',async()=>{
 let calls=[];
 const r=await invoke('/api/opportunities/v1/opportunities?limit=999&page=2&sector=wood-forest-processing',
 'GET',async(sql,params)=>{
  calls.push({sql,params});
  return sql.includes('COUNT(*)')?{rows:[{total:333}]}:{rows:[]};
 });
 assert.equal(r.code,200);assert.equal(r.response.total,333);
 assert.equal(r.response.limit,48);assert.equal(calls[1].params.at(-1),48);
});
test('database errors fail closed without exposing credentials',async()=>{
 const r=await invoke('/api/opportunities/v1/sectors','GET',async()=>{throw Error('private-password-secret')});
 assert.equal(r.code,503);
 assert.ok(!JSON.stringify(r.response).includes('private-password-secret'));
});

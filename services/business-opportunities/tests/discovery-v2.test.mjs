import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handleDiscovery} from '../discovery.mjs';
const d=JSON.parse(readFileSync(new URL('../seed/discovery.v1.json',import.meta.url),'utf8'));
test('discovery data reuses 49 sectors and supplies 20 institutional proposals',()=>{
 assert.equal(d.families.length,2);
 assert.equal(d.categories.length,21);
 assert.equal(d.solutions.length,121);
 assert.equal(d.solutions.filter(x=>x.family==='business').length,101);
 assert.equal(d.solutions.filter(x=>x.family==='institutional').length,20);
 assert.equal(new Set(d.solutions.map(x=>x.id)).size,121);
 assert.ok(d.categories.every(c=>d.solutions.some(s=>s.categoryId===c.id)));
 assert.ok(d.solutions.every(s=>s.tools.length>=1&&s.summary.length>=60));
 assert.ok(d.solutions.every(s=>['concept','proposal'].includes(s.stage)));
 assert.ok(d.solutions.every(s=>!s.verified_demo_url));
});
test('wood processing solution combines production, stock and selling components',()=>{
 const x=d.solutions.find(s=>s.id==='business-wood-processor-sawmill');
 assert.ok(x);
 assert.equal(x.categoryId,'business-processing');
 assert.ok(x.tools.some(s=>/processing/i.test(s)));
 assert.ok(x.tools.some(s=>/stock/i.test(s)));
 assert.ok(x.tools.some(s=>/e-commerce/i.test(s)));
 assert.ok(x.tools.some(s=>/POS/i.test(s)));
});
const invoke=async path=>{
 let captured=[];
 const pool={query:async(sql,params)=>{captured.push({sql,params});return{rows:sql.includes('count(*)')?[{total:121}]:[]}}};
 let response,code;
 const send=(res,c,p)=>{code=c;response=p;return p};
 await handleDiscovery(pool,new URL('http://localhost/api/opportunities/v1/discovery/'+path),{},send);
 return {response,code,captured};
};
test('filter queries remain parameterized, use family and limit safely',async()=>{
 const v=await invoke("solutions?family=institutional&q=%27%20OR%201%3D1&category=institutional-trade&tool=Policy&page=2&limit=1000");
 assert.equal(v.response.total,121);
 assert.equal(v.response.limit,24);
 assert.equal(v.response.page,2);
 assert.equal(v.captured.length,2);
 assert.equal(v.captured[0].params[0],'institutional');
 assert.equal(v.captured[1].params.at(-2),24);
 assert.equal(v.captured[1].params.at(-1),24);
 assert.ok(v.captured[0].sql.includes('jsonb_build_array'));
 assert.ok(!v.captured[0].sql.includes("' OR 1=1"));
});
test('invalid institution family and unsafe IDs are rejected',async()=>{
 assert.equal((await invoke('categories?family=illegal')).code,400);
 assert.equal((await invoke('solutions/%22unsafe?family=business')).code,400);
});
test('module filters originate from database rows',async()=>{
 const r=await invoke('modules?family=institutional&category=institutional-trade');
 assert.ok(r.captured[0].sql.includes('jsonb_array_elements_text'));
 assert.deepEqual(r.captured[0].params,['institutional','institutional-trade']);
});

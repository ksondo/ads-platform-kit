import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const data = JSON.parse(readFileSync(new URL("../catalogue.json", import.meta.url), "utf8"));
test("unique platforms and valid tool relationships", () => {
  assert.ok(data.platforms.length >= 6);
  assert.ok(data.tools.length >= 4);
  const ids=data.platforms.map(p=>p.id);
  assert.equal(new Set(ids).size,ids.length);
  assert.equal(new Set(data.tools.map(t=>t.id)).size,data.tools.length);
  for(const t of data.tools) assert.ok(ids.includes(t.platformId),"unknown platform for "+t.id);
});
test("Commerce has separate POS and E-commerce demos",()=>{
  for(const id of ["pos","ecommerce"]){
    const tool=data.tools.find(t=>t.id===id);
    assert.ok(tool,id+" missing");
    assert.equal(tool.platformId,"commerce");
    assert.equal(tool.independentDemo,true);
  }
});
test("live links are configured only with HTTPS",()=>{
  for(const x of [...data.platforms,...data.tools]){
    assert.ok(x.id&&x.name&&x.summary);
    assert.ok(x.demoUrl===null||/^https:\/\/[^ ]+$/.test(x.demoUrl),"invalid demo URL for "+x.id);
  }
});
test("company site is a separate destination",()=>{
  assert.equal(data.publicSite,"https://africadigitalsynergy.com");
});

test("Commerce, E-commerce and POS share the integrated Commerce deployment",()=> {
  const commerce=data.platforms.find(x=>x.id==="commerce");
  const ecommerce=data.tools.find(x=>x.id==="ecommerce");
  const pos=data.tools.find(x=>x.id==="pos");
  assert.equal(commerce.demoUrl,"https://commerce.demo.africadigitalsynergy.com/commerce");
  assert.equal(ecommerce.demoUrl,commerce.demoUrl);
  assert.equal(pos.demoUrl,"https://commerce.demo.africadigitalsynergy.com/commerce/merchant/pos");
  assert.equal(data.tools.find(x=>x.id==="bnpl").demoUrl,null,
    "Digital financing demos remain disabled until verified");
});
test("Demo launches stay in the current browser tab and let ADS Identity handle sign-in",()=>{
  const code=readFileSync(new URL("../main.js",import.meta.url),"utf8");
  const start=code.indexOf("function launch(");
  const end=code.indexOf("function header(",start);
  assert.ok(start!==-1&&end>start);
  const launch=code.slice(start,end);
  assert.ok(!launch.includes('target="_blank"'));
  assert.ok(launch.includes("const url = safeDemo(target)"));
});

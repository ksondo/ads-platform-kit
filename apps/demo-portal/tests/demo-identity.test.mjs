import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const mapping=read("../identity-mapping.json");
const catalogue=read("../catalogue.json");
const clients=read("../../../config/clients.demo.json");

test("every portal mapping exists in the original ADS demo client configuration",()=>{
  for(const row of mapping.platformClients) {
    assert.ok(catalogue.platforms.some(p=>p.id===row.portal),row.portal+" platform unknown");
    const product=clients.products.find(p=>p.slug===row.product);
    assert.ok(product,row.product+" source product missing");
    assert.equal(product.client_id,row.clientId,row.portal+" OIDC client differs from source");
    for(const id of row.toolIds||[]) {
      const tool=catalogue.tools.find(x=>x.id===id);
      assert.ok(tool,row.portal+": tool "+id+" missing");
      assert.equal(tool.platformId,row.portal,id+" linked to wrong platform");
    }
  }
});
test("POS and E-commerce use existing Commerce sign-in, not duplicate identity clients",()=>{
  const commerce=mapping.platformClients.find(p=>p.portal==="commerce");
  assert.equal(commerce.clientId,"commerce-web");
  assert.deepEqual([...commerce.toolIds].sort(),["ecommerce","pos"]);
});
test("public portal does not expose passwords or claim unverified deployments",()=>{
  const allowed = new Map([
    ["commerce", "https://commerce.demo.africadigitalsynergy.com/commerce"],
    ["ecommerce", "https://commerce.demo.africadigitalsynergy.com/commerce"],
    ["pos", "https://commerce.demo.africadigitalsynergy.com/commerce/merchant/pos"]
  ]);
  for(const record of [...catalogue.platforms,...catalogue.tools]) {
    assert.equal(record.demoUrl,allowed.get(record.id) ?? null,
      "Only the hosted Commerce demo and its two tool journeys may be linked: "+record.id);
  }
  const text=readFileSync(new URL("../main.js",import.meta.url),"utf8");
  assert.ok(text.includes('function demoAccessGuide()'));
  assert.ok(text.includes('path==="/demo-access"'));
  assert.ok(!text.includes("DEMO_USER_PASSWORD")&&!text.includes("DEMO_ADMIN_PASSWORD"));
});
test("demo sign-in guide never creates a duplicate login form",()=>{
  const js=readFileSync(new URL("../main.js",import.meta.url),"utf8")
    .replace(/^import[^\n]*\n/gm, ""); // VM tests legacy guide without loading other modules
  const fake={
    imageUrl:()=>"", platformImage:()=>"", credits:[],
    document:{getElementById:()=>({innerHTML:""}),documentElement:{},addEventListener:()=>{}},
    localStorage:{getItem:()=>null},
    navigator:{language:"en-US"},
    location:{pathname:"/demo-access",search:""},
    URLSearchParams,
    window:{location:{pathname:"/demo-access",search:""},addEventListener:()=>{}}
  };
  vm.runInNewContext(js.replace(/start\(\);\s*$/,"globalThis.__guide = demoAccessGuide();"),fake);
  const html=String(fake.__guide);
  assert.ok(html.includes("/platforms"));
  assert.ok(html.includes("Use demo account"));
  assert.doesNotMatch(html, /<input\b|<form\b|type="password"/i);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Guard the complete landing -> platform directory -> approved demo handoff.
// Mapping an OIDC client does NOT approve a deployed URL or provide demo credentials.
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const mapping=read("../identity-mapping.json");
const catalogue=read("../catalogue.json");
const clients=read("../../../config/clients.demo.json");
const EXPECTED=[
  ["fleet-guard","fleetguard","fleet-guard-web"],
  ["home-services","home-services","home-services"],
  ["education","education","education-web"],
  ["morphoo","morphoo","morphoo-web"],
  ["mama-care","mamacare","mamacare-web"]
];
test("five demo candidates are discoverable from the landing and mapped to exactly one existing ADS OIDC client",()=>{
  for(const [portal,slug,clientId] of EXPECTED){
    assert.equal(catalogue.platforms.filter(p=>p.id===portal).length,1,"missing or duplicate platform "+portal);
    const record=mapping.platformClients.filter(p=>p.portal===portal);
    assert.equal(record.length,1,"missing or duplicate identity mapping "+portal);
    assert.equal(record[0].product,slug);
    assert.equal(record[0].clientId,clientId);
    const registered=clients.products.filter(p=>p.slug===slug);
    assert.equal(registered.length,1,"missing or duplicate identity registration "+slug);
    assert.equal(registered[0].client_id,clientId);
    assert.ok(registered[0].redirect_uris?.every(uri=>uri.startsWith("https://")),
      slug+" must have explicit HTTPS OAuth callback allowlist");
  }
});
test("no unverified product becomes clickable before hosted HTTPS, role isolation and demo entitlement are certified",()=>{
  for(const [portal] of EXPECTED){
    const entry=catalogue.platforms.find(p=>p.id===portal);
    assert.equal(entry.demoUrl,null,portal+" must remain non-launchable until post-deployment smoke approval");
    assert.equal(entry.availability,"coming_soon",portal+" is not yet a verified hosted demo");
  }
});
test("landing cards retain safe in-portal detail paths and launch URLs open in new tabs only when verified",()=>{
  const s=readFileSync(new URL("../main.js",import.meta.url),"utf8");
  assert.match(s,/const platformUrl = p =>/);
  assert.match(s,/const demo=safeDemo\(p\.demoUrl\),url=demo\|\|platformUrl\(p\)/);
  assert.match(s,/target=\\"_blank\\" rel=\\"noopener noreferrer\\"/);
  assert.match(s,/const safeDemo = url =>/);
  assert.ok(!s.includes("DEMO_USER_PASSWORD"));
});

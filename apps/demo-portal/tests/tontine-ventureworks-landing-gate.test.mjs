import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),"utf8"));
const map=read("../identity-mapping.json"), catalogue=read("../catalogue.json"), clients=read("../../../config/clients.demo.json");
for (const [portal,slug,clientId] of [
  ["digital-tontine","tontine","tontine-web"],
  ["ventureworks","ventureworks","ventureworks-web"]
]) {
  test(portal+" is discoverable, mapped to the reviewed ADS login client, and not launched before host certification",()=>{
    assert.equal(catalogue.platforms.filter(p=>p.id===portal).length,1);
    const p=map.platformClients.filter(x=>x.portal===portal);
    assert.equal(p.length,1);
    assert.equal(p[0].product,slug); assert.equal(p[0].clientId,clientId);
    const c=clients.products.filter(x=>x.slug===slug);
    assert.equal(c.length,1); assert.equal(c[0].client_id,clientId);
    assert.ok(c[0].redirect_uris?.length);
    assert.ok(c[0].redirect_uris.every(x=>x.startsWith("https://")));
    assert.equal(catalogue.platforms.find(x=>x.id===portal).demoUrl,null);
  });
}

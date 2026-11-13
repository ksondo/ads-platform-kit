import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const manifest = read('deploy/contabo-demo/nine-platform-rollout.json');
const catalogue = read('apps/demo-portal/catalogue.json');
const clients = read('config/clients.demo.json');
test('preserve live portal and Commerce demo route while staging eight new destinations (Tourism added by TOU-0)', () => {
  assert.equal(manifest.portal.url,'https://demo.africadigitalsynergy.com');
  assert.equal(manifest.commerce.url,'https://commerce.demo.africadigitalsynergy.com/commerce/demo');
  const commerce=catalogue.platforms.find(x=>x.id==='commerce');
  assert.equal(commerce?.demoUrl,manifest.commerce.url);
  assert.equal(manifest.candidates.length,8);
  assert.equal(new Set(manifest.candidates.map(c=>c.catalogueId)).size,8);
  for(const item of manifest.candidates){
    assert.ok(['planned_not_verified','verified_demo'].includes(item.status), 'unknown rollout status: '+item.catalogueId);
    assert.equal(new URL(item.targetUrl).protocol,'https:');
    const entry=catalogue.platforms.find(x=>x.id===item.catalogueId);
    assert.ok(entry, 'missing portal catalogue entry: '+item.catalogueId);
    if(item.status==='planned_not_verified') {
      assert.equal(entry.demoUrl,null,'unverified launch exposed: '+item.catalogueId);
    } else {
      assert.equal(entry.demoUrl,item.targetUrl,'verified application route not registered: '+item.catalogueId);
      assert.equal(entry.availability,'verified_demo','verified application must be labelled verified: '+item.catalogueId);
    }
    const client=clients.products.find(x=>x.client_id===item.oidcClientId);
    assert.ok(client,'missing OIDC client: '+item.oidcClientId);
    assert.ok(client.redirect_uris.some(u=>u.startsWith(item.targetUrl+'/')), 'demo OIDC redirect missing for '+item.catalogueId);
    assert.ok(client.post_logout_redirect_uris.includes(item.targetUrl+'/'),'demo logout redirect missing: '+item.catalogueId);
  }
});
test('TOU-0: Tourism is staged on its own loopback port with the demo sign-in address, not yet linked', () => {
  const t=manifest.candidates.find(c=>c.catalogueId==='tourism');
  assert.equal(t.repository,'ksondo/tourism-platform');
  assert.equal(t.targetUrl,'https://tourism.demo.africadigitalsynergy.com');
  assert.equal(t.oidcClientId,'tourism-web');
  assert.equal(t.status,'planned_not_verified');
  assert.equal(t.loopbackPort,18130);
  assert.match(t.sourceSha,/^[0-9a-f]{40}$/);
  const ports=manifest.candidates.map(c=>c.loopbackPort).filter(Boolean);
  assert.equal(new Set(ports).size,ports.length,'no two candidates share a loopback port');
  assert.equal(catalogue.platforms.find(p=>p.id==='tourism').demoUrl,null);
});

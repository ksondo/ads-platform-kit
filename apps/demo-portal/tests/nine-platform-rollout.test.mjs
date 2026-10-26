import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const manifest = read('deploy/contabo-demo/nine-platform-rollout.json');
const catalogue = read('apps/demo-portal/catalogue.json');
const clients = read('config/clients.demo.json');
test('preserve live portal and Commerce demo route while staging seven new destinations', () => {
  assert.equal(manifest.portal.url,'https://demo.africadigitalsynergy.com');
  assert.equal(manifest.commerce.url,'https://commerce.demo.africadigitalsynergy.com/commerce');
  const commerce=catalogue.platforms.find(x=>x.id==='commerce');
  assert.equal(commerce?.demoUrl,manifest.commerce.url);
  assert.equal(manifest.candidates.length,7);
  for(const item of manifest.candidates){
    assert.equal(item.status,'planned_not_verified');
    assert.equal(new URL(item.targetUrl).protocol,'https:');
    const entry=catalogue.platforms.find(x=>x.id===item.catalogueId);
    assert.ok(entry, 'missing portal catalogue entry: '+item.catalogueId);
    assert.equal(entry.demoUrl,null,'unverified launch exposed: '+item.catalogueId);
    const client=clients.products.find(x=>x.client_id===item.oidcClientId);
    assert.ok(client,'missing OIDC client: '+item.oidcClientId);
    assert.ok(client.redirect_uris.some(u=>u.startsWith(item.targetUrl+'/')), 'demo OIDC redirect missing for '+item.catalogueId);
    assert.ok(client.post_logout_redirect_uris.includes(item.targetUrl+'/'),'demo logout redirect missing: '+item.catalogueId);
  }
});

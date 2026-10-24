import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const main=readFileSync(new URL('../main.js',import.meta.url),'utf8');
const ux=readFileSync(new URL('../opportunities-v2.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('only Business Opportunities routes are replaced; home/platforms/cloud/demo-access stay intact',()=>{
 assert.ok(main.includes('function landing(){'));
 assert.ok(main.includes('main=landing()'));
 assert.ok(main.includes('main=platformDirectory()'));
 assert.ok(main.includes('main=cloud()'));
 assert.ok(main.includes('main=demoAccessGuide()'));
 assert.ok(main.includes('legacy?toolDetail(legacy):ADSOpportunities.detailShell()'));
 assert.ok(main.includes('import * as ADSOpportunities from "./opportunities-v2.js"'));
 assert.ok(main.includes('const companyNav ='));
 assert.ok(main.includes('const companyAction ='));
 assert.ok(main.includes('target="_blank" rel="noopener noreferrer"'));
});
test('navigation does not display ADS website badges next to About or Partners',()=>{
 assert.ok(!main.includes('ADS website</span>'));
 assert.ok(!ux.includes('ADS website'));
 assert.ok(!ux.includes('/partners"'));
});
test('filters, discoverable bundles and modal content are dynamically retrieved',()=>{
 for(const term of ['/discovery/categories','/discovery/modules','/discovery/solutions','/discovery/suggest']){
  assert.ok(ux.includes(term),term);
 }
 assert.ok(ux.includes('data-family'));
 assert.ok(ux.includes('data-category'));
 assert.ok(ux.includes('data-action="detail"')||ux.includes("'detail'"));
 assert.ok(ux.includes('aria-modal="true"'));
 assert.ok(ux.includes("event.key==='Escape'"));
 assert.ok(ux.includes('event.shiftKey'));
 assert.ok(ux.includes('https://wa.me/237654035075'));
 assert.ok(ux.includes('location.pathname.startsWith'));
});
test('new display does not invent demos, require login or expose private instructions',()=>{
 assert.ok(!ux.includes('localStorage.setItem('));
 assert.ok(!ux.includes('window.open('));
 assert.ok(!ux.includes('password='));
 assert.ok(!ux.includes('Officially connected'));
 assert.ok(!ux.includes('business implementation blueprint is'));
 assert.ok(ux.includes("'/platforms'")||ux.includes('href="/platforms"'));
 assert.ok(html.includes('opportunities-v2.css'));
});

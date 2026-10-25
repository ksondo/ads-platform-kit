import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {credits, groupImage, platformImage, curatedGroupCount, curatedPlatformCount} from '../image-library.js';

const read = path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const catalogue = JSON.parse(read('catalogue.json'));
const groups = JSON.parse(read('sector-groups.json')).groups;

test('all 25 platforms have distinct thematic image URLs, including 17 newly photographed sectors',()=>{
  assert.equal(curatedPlatformCount,25);
  const urls=catalogue.platforms.map(p=>platformImage(p));
  assert.ok(urls.every(u=>u.startsWith('https://')));
  assert.equal(new Set(urls).size,25,'repeated platform image');
  assert.ok(urls.filter(u=>u.includes('commons.wikimedia.org')).length>=15);
});
test('all 13 major groups and 8 institutional types have explicit imagery',()=>{
  assert.equal(curatedGroupCount,21);
  const categories=[...Object.keys(groups),
    'institutional-formalities','institutional-tax','institutional-trade','institutional-banking',
    'institutional-standards','institutional-licensing','institutional-insurance','institutional-multiagency'];
  const urls=categories.map(id=>groupImage(id));
  assert.ok(urls.every(u=>u.startsWith('https://')), 'missing category cover');
  assert.equal(new Set(urls).size,21,'reused group image in discovery rail');
});
test('Commons sources have explicit author, licence, and public credit route',()=>{
  assert.equal(credits.length,17);
  assert.equal(new Set(credits.map(x=>x.file)).size,credits.length);
  for(const x of credits){
    assert.ok(x.author&&x.en&&x.fr&&x.source.includes('commons.wikimedia.org/wiki/File:'),x.id);
    assert.equal(x.license,'https://creativecommons.org/licenses/by-sa/4.0/');
  }
  assert.ok(read('main.js').includes('function photoCreditsPage()'));
  assert.ok(read('main.js').includes('"/photo-credits"'));
  assert.ok(read('index.html').includes('portal-loading-shell'));
  assert.ok(!read('index.html').includes('static-fallback'));
});
test('image library is packaged and allows Wikimedia thumbnails without loosening script CSP',()=>{
  assert.ok(read('Dockerfile').includes('COPY apps/demo-portal/image-library.js'));
  const csp=read('nginx.conf');
  for(const host of ['https://commons.wikimedia.org','https://upload.wikimedia.org'])
    assert.ok(csp.includes(host));
  assert.ok(csp.includes("script-src 'self'"));
  assert.ok(!csp.includes("'unsafe-inline'"));
});
test('same-origin navigation is handled without reloading static HTML',()=>{
  const main=read('main.js');
  assert.ok(main.includes('event.preventDefault()'));
  assert.ok(main.includes('history.pushState'));
  assert.ok(main.includes('window.addEventListener("popstate"'));
  assert.ok(main.includes('render(); // Never block page rendering on the optional Opportunities API.'));
});

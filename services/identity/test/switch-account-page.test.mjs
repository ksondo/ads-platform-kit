import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderPage} from '../src/pages.mjs';
import {readFileSync} from 'node:fs';

const code=readFileSync(new URL('../src/server.mjs',import.meta.url),'utf8');
const page=lang=>renderPage('no_access',{
 locale:lang,nonce:'test-nonce',csrf:'csrf-test',req:'boundOauthRequest123',
 client:{client_id:'education-web',display_name:'Education',accent_color:'#087E79'},
 values:{},path:'/login'
});

test('P5-1 account denial shows bilingual switch action preserving bound OAuth request',()=>{
 const en=page('en'),fr=page('fr');
 for(const html of [en,fr]){
  assert.match(html,/data-ads-no-access="true"/);
  assert.match(html,/<form method="post" action="\/logout">/);
  assert.match(html,/name="csrf"/);
  assert.match(html,/name="req" value="boundOauthRequest123"/);
  assert.match(html,/name="switch_account" value="1"/);
  assert.match(html,/name="client_id" value="education-web"/);
  assert.doesNotMatch(html,/type="password"/);
 }
 assert.match(en,/Switch account/);
 assert.match(fr,/Changer de compte/);
 assert.match(fr,/Ce compte n&#39;a pas accès|Ce compte n'a pas accès/);
});
test('P5-1 bound OAuth request and CSRF precede clearing shared session',()=>{
 const csrf=code.indexOf("if (method === 'POST') checkCsrf(req, form);",code.indexOf("path === '/logout'"));
 const validated=code.indexOf("const switchAuth = method === 'POST'",csrf);
 const cleared=code.indexOf("const raw = unsignValue",validated);
 assert.ok(csrf>=0 && validated>csrf && cleared>validated);
 assert.match(code,/if \(form.switch_account === '1' && !switchAuth\) fail\(400/);
 assert.match(code,/if \(switchAuth\) return redirect\(res, '\/login\?req='/);
 assert.ok(!code.includes("switch_account === '1' ? form.post_logout_redirect_uri"));
});

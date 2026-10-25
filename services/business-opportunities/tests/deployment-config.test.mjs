import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('opportunities API has unique loopback-only port, not shared demo identity',()=>{
 const opportunities=read('../compose.yml');
 const identity=read('../../../deploy/contabo-demo/compose.identity.yml');
 const m=opportunities.match(/127\.0\.0\.1:(\d+):31090/);
 assert.ok(m,'opportunities service must have a loopback-only host port');
 assert.equal(m[1],'18190');
 assert.notEqual(m[1],'18090','reserved for shared demo identity');
 assert.ok(!opportunities.includes('0.0.0.0:'));
 assert.ok(!opportunities.includes('network_mode: host'));
});
test('operator guidance routes only the opportunities API to its dedicated local port',()=>{
 const guide=read('../README.md');
 assert.ok(guide.includes('18190'));
 assert.ok(!guide.includes('http://127.0.0.1:18090'));
 assert.ok(guide.includes('49/328/52') || guide.includes('equals 328'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoAccess,loadPlatforms,PRIVATE_VISITOR_PLATFORMS,visitorPersonaKeys} from '../src/demo-access.mjs';

test('Morphoo private visitor registry only offers a person-scoped member, no staff',()=>{
 const platforms=loadPlatforms({});
 const morphoo=platforms.get('morphoo');
 assert.ok(morphoo);
 assert.equal(morphoo.clientId,'morphoo-web');
 assert.equal(morphoo.privateOnly,true);
 assert.deepEqual(visitorPersonaKeys(morphoo),['member']);
 assert.deepEqual(morphoo.personas.map(p=>({key:p.key,org:p.org,roles:p.roles})),
  [{key:'member',org:'main',roles:['member']}]);
 assert.deepEqual(morphoo.orgs.map(x=>x.key),['main']);
 assert.equal(PRIVATE_VISITOR_PLATFORMS.has('morphoo'),true);
 assert.equal(platforms.get('commerce').privateOnly,false);
});

test('public request refuses Morphoo before touching any table or sending mail',async()=>{
 let called=false;
 const svc=createDemoAccess({
  pool:{query:async()=>{called=true;throw Error('PUBLIC_REQUEST_DB_SHOULD_NOT_BE_USED')}},
  config:{demoAccess:{publicEnabled:true,timeZone:'Africa/Douala',adminUrl:'https://admin.invalid'}},
  mailer:{send:async()=>{called=true;throw Error('EMAIL_SHOULD_NOT_BE_USED')}},
  audit:async()=>{called=true;throw Error('AUDIT_SHOULD_NOT_BE_USED')}
 });
 await assert.rejects(svc.submitRequest({platform:'morphoo',email:'fictional@example.test',locale:'en',website:'',ip:'127.0.0.1'}),
  error=>error.status===404||error.code==='NOT_FOUND');
 assert.equal(called,false);
});

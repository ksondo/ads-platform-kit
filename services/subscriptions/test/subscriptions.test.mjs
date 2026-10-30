import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {generateKeyPair,SignJWT,exportJWK,createLocalJWKSet} from 'jose';
import pg from 'pg';
import {migrate} from '../src/migrate.mjs';
import {createServer} from '../src/server.mjs';
import {validatePlan,validateTariff,transaction} from '../src/service.mjs';

const tariff={expectedVersion:0,amountXaf:0,effectiveAt:'2026-01-01T00:00:00.000Z',durationDays:30,renewalRule:'MANUAL',funding:'FREE',entitlements:['commerce.pos'],usageLimits:{},eligibleTenantIds:[]};
test('SH-1 validation rejects authority injection, invalid money, dates and foreign entitlements',()=>{
 assert.ok(validateTariff(tariff,'commerce'));
 for(const patch of [{amountXaf:-1},{amountXaf:1.5},{amountXaf:5},{durationDays:0},{effectiveAt:'2026-02-31T00:00:00Z'},{entitlements:['education.results']},{usageLimits:{'commerce.pos':-1}},{tenantId:randomUUID()}])
  assert.throws(()=>validateTariff({...tariff,...patch},'commerce'));
 assert.throws(()=>validatePlan({product:'commerce',key:null,name:{en:'Farmer',fr:'Fermier'}}));
 assert.throws(()=>createServer({}, {issuer:'https://identity.ads.test',jwksUrl:'https://identity.ads.test/jwks',products:{commerce:{audience:'same',subscribeRoles:[]},education:{audience:'same',subscribeRoles:[]}}}),/distinct token audience/);
});

test('SH-1 API, PostgreSQL RLS, immutable tariffs and honest subscription grants', {skip:!process.env.SUBSCRIPTIONS_TEST_DATABASE_URL},async t=>{
 const admin=new pg.Pool({connectionString:process.env.SUBSCRIPTIONS_TEST_DATABASE_URL});let runtime,server;
 const tenant=randomUUID(),other=randomUUID(),staff=randomUUID(),user=randomUUID(),op=randomUUID(),tag=randomBytes(4).toString('hex');
 const issuer='https://identity.ads.test',keys=await generateKeyPair('RS256'),wrong=await generateKeyPair('RS256');
 const jwk=await exportJWK(keys.publicKey);jwk.kid='subscription-test';
 async function token({tenantId=tenant,sub=user,aud='commerce-web',roles=['merchant_owner'],ads_staff=false,iss=issuer,expires='5m',signer=keys.privateKey}={}){
  return new SignJWT({tenant_id:tenantId,roles,ads_staff}).setProtectedHeader({alg:'RS256',kid:jwk.kid}).setSubject(sub).setIssuer(iss).setAudience(aud).setIssuedAt().setExpirationTime(expires).sign(signer);
 }
 try{
  await migrate(admin);
  await migrate(admin); // Replay is safe and verifies the migration checksum.
  const password=randomBytes(24).toString('hex'),login='subscriptions_test_'+tag;
  // Generated identifier contains only a fixed prefix and hex; no credentials committed/logged.
  await admin.query(`CREATE ROLE ${login} LOGIN PASSWORD '${password}' NOBYPASSRLS`);
  await admin.query(`GRANT ads_subscriptions_runtime TO ${login}`);
  const url=new URL(process.env.SUBSCRIPTIONS_TEST_DATABASE_URL);url.username=login;url.password=password;
  runtime=new pg.Pool({connectionString:url.href});
  server=createServer(runtime,{issuer,products:{commerce:{audience:'commerce-web',subscribeRoles:['merchant_owner']},education:{audience:'education-web',subscribeRoles:['institution_admin']}},
   staffTenantIds:[staff],keySet:createLocalJWKSet({keys:[jwk]})});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  const owner=await token(),operator=await token({tenantId:staff,sub:op,aud:'ads-subscriptions',roles:['subscriptions_operator'],ads_staff:true});
  async function call(path,{auth=owner,body,key=randomUUID(),status=200}={}){
   const res=await fetch(origin+'/v1/subscriptions'+path,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+auth,...(body===undefined?{}:{'content-type':'application/json','idempotency-key':key})},body:body===undefined?undefined:JSON.stringify(body)});
   const value=await res.json();assert.equal(res.status,status,JSON.stringify(value));return value;
  }
  const makePlan=async(key,product='commerce')=>(await call('/admin/plans',{auth:operator,body:{product,key:key+'-'+tag,name:{en:'Plan '+key,fr:'Offre '+key}},status:201})).plan;
  const price=async(plan,v)=>(await call('/admin/plans/'+plan.id+'/tariffs?product='+plan.product,{auth:operator,body:{...tariff,...v},status:201})).tariff;
  const select=async(plan,id,extra={})=>call('',{body:{product:plan.product,planId:plan.id,expectedTariffId:id},status:201,...extra});
  let free,paid,freeTariff,paidTariff,first;

  await t.test('only independently configured ADS operator tokens can administer plans',async()=>{
   const body={product:'commerce',key:'forbidden-'+tag,name:{en:'Forbidden',fr:'Interdit'}};
   await call('/admin/plans',{body,status:404});
   await call('/admin/plans',{auth:await token({roles:['subscriptions_operator'],ads_staff:true,aud:'ads-subscriptions'}),body,status:404});
   await call('/admin/plans',{auth:await token({tenantId:staff,roles:['subscriptions_operator'],ads_staff:false,aud:'ads-subscriptions'}),body,status:404});
   for(const auth of [await token({iss:'https://evil.test'}),await token({expires:'-1s'}),await token({signer:wrong.privateKey}),await token({aud:'unrelated-web'})])
    await call('/plans?product=commerce',{auth,status:401});
   await call('/plans?product=education',{status:404});
   await call('/plans?product=commerce&tenantId='+other,{status:422});
  });

  await t.test('operator configures free/paid tariffs; no seeded monetary values',async()=>{
   const before=await call('/plans?product=commerce');assert.ok(Array.isArray(before.plans));
   free=await makePlan('farmer');paid=await makePlan('storefront');
   freeTariff=await price(free,{effectiveAt:new Date(Date.now()-86400000).toISOString()});
   paidTariff=await price(paid,{amountXaf:5,funding:'PAID',entitlements:['commerce.storefront'],effectiveAt:new Date(Date.now()-86400000).toISOString()});
   first=(await select(paid,paidTariff.id)).subscription;
   assert.equal(first.state,'PENDING_PAYMENT');assert.equal(first.starts_at,null);assert.equal(first.snapshot.amount_xaf,5);
   assert.equal(first.snapshot.eligible_tenant_ids,undefined,'other eligible tenant IDs must not leak in snapshots');
   assert.equal((await call('/entitlements/commerce.storefront?product=commerce')).entitled,false);
  });

  await t.test('tariff versions preserve prices and require explicit agreement to the current tariff',async()=>{
   const next=await price(paid,{expectedVersion:1,amountXaf:10,funding:'PAID',entitlements:['commerce.storefront'],effectiveAt:new Date(Date.now()-1000).toISOString()});
   await select(paid,paidTariff.id,{status:409});
   const second=(await select(paid,next.id)).subscription;assert.equal(second.snapshot.amount_xaf,10);
   const historic=(await call('?product=commerce')).subscriptions.find(s=>s.id===first.id);assert.equal(historic.snapshot.amount_xaf,5);
   await call('/admin/plans/'+paid.id+'/tariffs?product=commerce',{auth:operator,body:{...tariff,expectedVersion:1},status:409});
   await price(paid,{expectedVersion:2,amountXaf:20,funding:'PAID',entitlements:['commerce.storefront'],effectiveAt:new Date(Date.now()+86400000).toISOString()});
   const listed=(await call('/plans?product=commerce')).plans.find(p=>p.id===paid.id);assert.equal(listed.tariff_id,next.id);
   await assert.rejects(admin.query('UPDATE ads_subscriptions.tariffs SET amount_xaf=99 WHERE id=$1',[paidTariff.id]),{code:'23514'});
  });

  let active;
  await t.test('free plan activates once across concurrent retries, without payment',async()=>{
   const key=randomUUID();const results=await Promise.all([select(free,freeTariff.id,{key}),select(free,freeTariff.id,{key})]);
   assert.equal(results[0].subscription.id,results[1].subscription.id);active=results[0].subscription;
   assert.equal(active.state,'ACTIVE');
   const grant=await call('/entitlements/commerce.pos?product=commerce');assert.equal(grant.entitled,true);assert.equal(grant.limit,null);
   await select(paid,paidTariff.id,{key,status:409});
   const audit=(await admin.query("SELECT * FROM ads_subscriptions.audit WHERE target_id=$1 AND action='SUBSCRIPTION_SELECTED'",[active.id])).rows;
   assert.equal(audit.length,1);assert.equal(audit[0].actor_ref,user);assert.equal(audit[0].before_value,null);
  });

  await t.test('RLS hides other tenants and prevents price, audit and activation tampering',async()=>{
   const stranger=await token({tenantId:other});
   assert.equal((await call('?product=commerce',{auth:stranger})).subscriptions.length,0);
   await call('/'+active.id+'/cancel',{auth:stranger,body:{product:'commerce',expectedVersion:1},status:404});
   const context={tenantId:other,userId:user,product:'commerce',operator:false};
   assert.equal((await transaction(runtime,context,db=>db.query('SELECT * FROM ads_subscriptions.subscriptions WHERE id=$1',[active.id]))).rowCount,0);
   const mine={...context,tenantId:tenant};
   await assert.rejects(transaction(runtime,mine,db=>db.query("UPDATE ads_subscriptions.subscriptions SET snapshot='{}' WHERE id=$1",[active.id])),{code:'42501'});
   await assert.rejects(transaction(runtime,mine,db=>db.query("UPDATE ads_subscriptions.subscriptions SET state='ACTIVE' WHERE id=$1",[first.id])),{code:'23514'});
   await assert.rejects(transaction(runtime,mine,db=>db.query(`INSERT INTO ads_subscriptions.subscriptions
    (tenant_id,product,plan_id,tariff_id,snapshot,state,starts_at,ends_at,created_by)
    SELECT $1,product,plan_id,id,ads_subscriptions.tariff_terms(t),'ACTIVE',now(),now()+interval '1 day',$2
    FROM ads_subscriptions.tariffs t WHERE plan_id=$3 AND effective_at<=now() ORDER BY effective_at DESC,version DESC LIMIT 1`,[tenant,user,paid.id])),{code:'23514'});
   await assert.rejects(transaction(runtime,mine,db=>db.query('DELETE FROM ads_subscriptions.audit')),{code:'42501'});
   await assert.rejects(admin.query('UPDATE ads_subscriptions.audit SET action=action WHERE target_id=$1',[active.id]),{code:'23514'});
   await select(free,freeTariff.id,{auth:await token({roles:['commerce_cashier']}),status:403});
   const edu=await makePlan('school','education');
   const eduTariff=await price(edu,{entitlements:['education.results']});
   const eduOwner=await token({aud:'education-web',roles:['institution_admin']});
   assert.ok(!(await call('/plans?product=education',{auth:eduOwner})).plans.some(p=>p.product==='commerce'));
   await call('/entitlements/commerce.pos?product=education',{auth:eduOwner,status:404});
   const sharedKey=randomUUID();
   const commerceSelection=(await select(free,freeTariff.id,{key:sharedKey})).subscription;
   const educationSelection=(await select(edu,eduTariff.id,{auth:eduOwner,key:sharedKey})).subscription;
   assert.notEqual(commerceSelection.id,educationSelection.id);
   assert.equal(educationSelection.product,'education');
   assert.equal(educationSelection.tenant_id,commerceSelection.tenant_id);
   // Cancel the additional Commerce grant so the later interval test remains isolated.
   await call('/'+commerceSelection.id+'/cancel',{body:{product:'commerce',expectedVersion:1}});
  });

  await t.test('eligibility uses latest effective version, never falls back to an older tariff',async()=>{
   const privatePlan=await makePlan('private');const a=await price(privatePlan,{});
   const restricted=await price(privatePlan,{expectedVersion:1,effectiveAt:new Date(Date.now()-1000).toISOString(),eligibleTenantIds:[other]});
   assert.ok(!(await call('/plans?product=commerce')).plans.some(p=>p.id===privatePlan.id));
   // Even holding an old tariff ID grants no access.
   await select(privatePlan,a.id,{status:409});
   await select(privatePlan,restricted.id,{status:404});
  });

  await t.test('cancelled, expired and future-start subscriptions grant nothing; overlaps are deterministic',async()=>{
   const limited=await makePlan('limited');const lt=await price(limited,{entitlements:['commerce.pos'],usageLimits:{'commerce.pos':3}});
   const overlap=(await select(limited,lt.id)).subscription;
   assert.equal((await call('/entitlements/commerce.pos?product=commerce')).limit,null,'unlimited active grant wins');
   await call('/'+active.id+'/cancel',{body:{product:'commerce',expectedVersion:1}});
   assert.equal((await call('/entitlements/commerce.pos?product=commerce')).limit,3);
   await admin.query("UPDATE ads_subscriptions.subscriptions SET starts_at=now()-interval '2 days',ends_at=now()-interval '1 day' WHERE id=$1",[overlap.id]);
   assert.equal((await call('/entitlements/commerce.pos?product=commerce')).entitled,false);
   assert.equal((await call('?product=commerce')).subscriptions.find(s=>s.id===overlap.id).effective_state,'EXPIRED');
   const future=(await select(free,freeTariff.id)).subscription;
   await admin.query("UPDATE ads_subscriptions.subscriptions SET starts_at=now()+interval '1 day',ends_at=now()+interval '2 days' WHERE id=$1",[future.id]);
   assert.equal((await call('/entitlements/commerce.pos?product=commerce')).entitled,false);
  });
  await t.test('migration checksum drift refuses an altered applied baseline',async()=>{
   const row=(await admin.query('SELECT name,checksum FROM public.ads_subscription_migrations')).rows[0];
   try{
    await admin.query("UPDATE public.ads_subscription_migrations SET checksum='drifted' WHERE name=$1",[row.name]);
    await assert.rejects(migrate(admin),/MIGRATION_CHECKSUM_MISMATCH/);
   }finally{await admin.query('UPDATE public.ads_subscription_migrations SET checksum=$2 WHERE name=$1',[row.name,row.checksum])}
  });
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await runtime?.end();await admin.end()}
});

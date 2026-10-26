import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {policy,validatePolicy,evaluateDemoAccess as check} from '../index.mjs';
const clients=JSON.parse(readFileSync(new URL('../../../config/clients.demo.json',import.meta.url),'utf8'));
const ok={verifiedByServer:true,membershipVerifiedByServer:true,sub:'actor-a',tenantId:'shop-1',productId:'commerce-web',roles:['commerce_cashier']};
const approved={id:'grant-1',verifiedByServer:true,revoked:false,approvedBy:'ads-staff-approver',sub:'actor-a',tenantId:'shop-1',productId:'commerce-web',action:'commerce.cashier.preview',validFrom:'2026-10-24T10:00:00.000Z',expiresAt:'2026-10-24T15:00:00.000Z'};
const now=Date.parse('2026-10-24T12:00:00.000Z');
const evalCashier=(identity=ok,approval=approved,extra={})=>check({action:'commerce.cashier.preview',identity,approval,environment:'demo',now,...extra});
test('policy matches the 25 product identity registry and defaults to deny',()=>{
  assert.equal(clients.products.length,25);
  assert.equal(policy.defaultEffect,'deny');
  assert.equal(validatePolicy(policy,clients),true);
  assert.equal(check({action:'unknown.action'}).allowed,false);
});
test('landing catalogue stays publicly accessible without any new login',()=>{
  assert.equal(check({action:'portal.discovery.read'}).allowed,true);
  assert.equal(check({action:'commerce.marketplace.read'}).allowed,true);
});
test('buyer demo requires authenticated, product-scoped tenant membership',()=>{
  const identity={...ok,roles:['commerce_buyer']};
  assert.equal(check({action:'commerce.buyer.preview',identity,environment:'demo'}).allowed,true);
  assert.equal(check({action:'commerce.buyer.preview',identity:{...identity,productId:'banking-web'},environment:'demo'}).allowed,false);
  assert.equal(check({action:'commerce.buyer.preview',identity:{...identity,membershipVerifiedByServer:false},environment:'demo'}).allowed,false);
  assert.equal(check({action:'commerce.buyer.preview',identity,environment:'production'}).allowed,false);
});
test('cashier role alone is never enough for qualified POS demo access',()=>{
  assert.equal(evalCashier(ok,null).reason,'QUALIFIED_APPROVAL_REQUIRED');
  assert.equal(evalCashier().allowed,true);
  assert.equal(evalCashier({...ok,roles:['commerce_buyer']}).allowed,false);
  assert.equal(evalCashier({...ok,tenantId:'another-shop'}).reason,'APPROVAL_SCOPE_MISMATCH');
  assert.equal(evalCashier(ok,{...approved,action:'commerce.shop.manage.preview'}).reason,'APPROVAL_SCOPE_MISMATCH');
  assert.equal(evalCashier(ok,{...approved,approvedBy:'actor-a'}).reason,'INDEPENDENT_APPROVER_REQUIRED');
  assert.equal(evalCashier(ok,{...approved,revoked:true}).reason,'QUALIFIED_APPROVAL_REQUIRED');
  assert.equal(evalCashier(ok,{...approved,expiresAt:'2026-10-24T11:00:00Z'}).reason,'APPROVAL_NOT_CURRENT');
  assert.equal(evalCashier(ok,{...approved,verifiedByServer:false}).reason,'QUALIFIED_APPROVAL_REQUIRED');
});
test('bank and ADS staff previews require independent approval and tenant restrictions',()=>{
 const bank={...ok,tenantId:'bank-demo',roles:['bank_officer']};
 const grant={...approved,action:'commerce.bank.preview',tenantId:'bank-demo'};
 assert.equal(check({action:'commerce.bank.preview',identity:bank,approval:grant,environment:'demo',now}).allowed,true);
 assert.equal(check({action:'commerce.bank.preview',identity:{...bank,roles:['merchant_owner']},approval:grant,environment:'demo',now}).allowed,false);
 const reviewer={...ok,tenantId:'ads-staff',roles:['commerce_reviewer']};
 const staffGrant={...approved,action:'commerce.review.preview',tenantId:'ads-staff'};
 assert.equal(check({action:'commerce.review.preview',identity:reviewer,approval:staffGrant,environment:'demo',now}).reason,'STAFF_TENANT_REQUIRED');
 assert.equal(check({action:'commerce.review.preview',identity:{...reviewer,staffTenantVerifiedByServer:true},approval:staffGrant,environment:'demo',now}).allowed,true);
});
test('unaccepted platform previews are denied even with authorized roles',()=>{
 const learner={...ok,productId:'education-web',roles:['learner']};
 assert.equal(check({action:'education.learner.preview',identity:learner,environment:'demo'}).reason,'RELEASE_NOT_APPROVED');
});
test('invalid public rules, product names and unknown roles fail validation',()=>{
 const copy=structuredClone(policy);
 copy.rules.push({...copy.rules[0],id:'bad.public',clientId:'commerce-web'});
 assert.throws(()=>validatePolicy(copy,clients),/public may not inherit/);
 const invalid=structuredClone(policy);
 invalid.rules.find(x=>x.id==='commerce.cashier.preview').roles=['superuser'];
 assert.throws(()=>validatePolicy(invalid,clients),/unregistered role/);
});

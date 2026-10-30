import {createHash} from 'node:crypto';

export const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const KEY=/^[a-z][a-z0-9._-]{1,79}$/;
export class ServiceError extends Error{constructor(status,code){super(code);this.status=status;this.code=code}}
export const fail=(status,code)=>{throw new ServiceError(status,code)};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const text=v=>typeof v==='string'&&v.trim().length>=2&&v.length<=120&&!/[\u0000-\u001f\u007f]/.test(v);
export function validatePlan(v){
 if(!exact(v,['product','key','name'])||typeof v.product!=='string'||typeof v.key!=='string'||!KEY.test(v.product)||!KEY.test(v.key)||!exact(v.name,['en','fr'])||!text(v.name.en)||!text(v.name.fr))fail(422,'INVALID_PLAN');
 return {...v,name:{en:v.name.en.trim(),fr:v.name.fr.trim()}};
}
export function validateTariff(v,product){
 if(!exact(v,['expectedVersion','amountXaf','effectiveAt','durationDays','renewalRule','funding','entitlements','usageLimits','eligibleTenantIds'])||
  !Number.isSafeInteger(v.expectedVersion)||v.expectedVersion<0||!Number.isSafeInteger(v.amountXaf)||v.amountXaf<0||v.amountXaf>10000000000||
  typeof v.effectiveAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v.effectiveAt)||!Number.isFinite(Date.parse(v.effectiveAt))||
  !Number.isSafeInteger(v.durationDays)||v.durationDays<1||v.durationDays>3660||!['NONE','MANUAL'].includes(v.renewalRule)||
  !['FREE','PAID','PROMOTIONAL','SPONSORED'].includes(v.funding)||(v.funding==='FREE'&&v.amountXaf!==0)||(v.funding==='PAID'&&v.amountXaf===0)||
  !Array.isArray(v.entitlements)||v.entitlements.length>100||new Set(v.entitlements).size!==v.entitlements.length||
  v.entitlements.some(k=>typeof k!=='string'||!KEY.test(k)||!k.startsWith(product+'.'))||
  !v.usageLimits||typeof v.usageLimits!=='object'||Array.isArray(v.usageLimits)||Object.entries(v.usageLimits).some(([k,n])=>!v.entitlements.includes(k)||!Number.isSafeInteger(n)||n<0)||
  !Array.isArray(v.eligibleTenantIds)||v.eligibleTenantIds.length>1000||v.eligibleTenantIds.some(id=>typeof id!=='string'||!UUID.test(id)))fail(422,'INVALID_TARIFF');
 const effectiveAt=new Date(v.effectiveAt).toISOString();
 if(effectiveAt.slice(0,19)!==v.effectiveAt.slice(0,19))fail(422,'INVALID_TARIFF');
 return {...v,effectiveAt,entitlements:[...v.entitlements].sort(),eligibleTenantIds:[...new Set(v.eligibleTenantIds)].sort()};
}
export async function transaction(pool,ctx,action){
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  for(const [key,value] of Object.entries({tenant:ctx.tenantId,actor:ctx.userId,product:ctx.product,operator:ctx.operator?'true':'false'}))
   await db.query('SELECT set_config($1,$2,true)',['ads_subscriptions.'+key,value]);
  const result=await action(db);await db.query('COMMIT');return result;
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e}finally{db.release()}
}
async function audit(db,ctx,action,id,before,after){
 await db.query('INSERT INTO ads_subscriptions.audit(tenant_id,actor_ref,product,action,target_id,before_value,after_value) VALUES($1,$2,$3,$4,$5,$6,$7)',
  [ctx.tenantId,ctx.userId,ctx.product,action,id,before===null?null:JSON.stringify(before),JSON.stringify(after)]);
}
async function mutate(pool,ctx,operation,key,body,action){
 if(typeof key!=='string'||!/^[A-Za-z0-9:._-]{8,128}$/.test(key))fail(422,'IDEMPOTENCY_KEY_REQUIRED');
 return transaction(pool,ctx,async db=>{
  const scope=[ctx.tenantId,ctx.userId,ctx.product,operation,key];
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(scope)]);
  const prior=(await db.query('SELECT request_hash,response FROM ads_subscriptions.requests WHERE tenant_id=$1 AND actor_ref=$2 AND product=$3 AND operation=$4 AND request_key=$5',scope)).rows[0];
  const digest=hash(body);
  if(prior){if(prior.request_hash!==digest)fail(409,'IDEMPOTENCY_CONFLICT');return prior.response}
  const result=await action(db);
  await db.query('INSERT INTO ads_subscriptions.requests(tenant_id,actor_ref,product,operation,request_key,request_hash,response) VALUES($1,$2,$3,$4,$5,$6,$7)',[...scope,digest,JSON.stringify(result)]);
  return result;
 });
}
export function createPlan(pool,ctx,input,key){
 if(!ctx.operator)fail(404,'NOT_FOUND');
 const v=validatePlan(input);if(v.product!==ctx.product)fail(404,'NOT_FOUND');
 return mutate(pool,ctx,'create-plan',key,v,async db=>{
  const row=(await db.query('INSERT INTO ads_subscriptions.plans(product,key,name,created_by) VALUES($1,$2,$3,$4) ON CONFLICT(product,key) DO NOTHING RETURNING *',[v.product,v.key,JSON.stringify(v.name),ctx.userId])).rows[0];
  if(!row)fail(409,'PLAN_EXISTS');
  await audit(db,ctx,'PLAN_CREATED',row.id,null,row);return {status:201,body:{plan:row}};
 });
}
export function createTariff(pool,ctx,id,input,key){
 if(!ctx.operator)fail(404,'NOT_FOUND');if(!UUID.test(id))fail(404,'NOT_FOUND');
 const v=validateTariff(input,ctx.product);
 return mutate(pool,ctx,'create-tariff:'+id,key,v,async db=>{
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['plan:'+id]);
  const plan=(await db.query('SELECT * FROM ads_subscriptions.plans WHERE id=$1 AND product=$2 FOR UPDATE',[id,ctx.product])).rows[0];
  if(!plan)fail(404,'NOT_FOUND');if(plan.current_version!==v.expectedVersion)fail(409,'PLAN_VERSION_CONFLICT');
  const row=(await db.query(`INSERT INTO ads_subscriptions.tariffs(plan_id,product,version,amount_xaf,effective_at,duration_days,renewal_rule,funding,entitlements,usage_limits,eligible_tenant_ids,created_by)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
   [id,ctx.product,plan.current_version+1,v.amountXaf,v.effectiveAt,v.durationDays,v.renewalRule,v.funding,JSON.stringify(v.entitlements),JSON.stringify(v.usageLimits),v.eligibleTenantIds,ctx.userId])).rows[0];
  await db.query('UPDATE ads_subscriptions.plans SET current_version=$2 WHERE id=$1',[id,row.version]);
  const prior=(await db.query('SELECT * FROM ads_subscriptions.tariffs WHERE plan_id=$1 AND version=$2',[id,plan.current_version])).rows[0]??null;
  await audit(db,ctx,'TARIFF_CREATED',row.id,prior,row);return {status:201,body:{tariff:row}};
 });
}
export function listPlans(pool,ctx){return transaction(pool,ctx,async db=>({status:200,body:{plans:(await db.query(`
 SELECT p.id,p.key,p.product,p.name,p.current_version,t.id AS tariff_id,t.version AS tariff_version,t.amount_xaf,t.effective_at,t.duration_days,t.renewal_rule,t.funding,t.entitlements,t.usage_limits
 FROM ads_subscriptions.plans p JOIN LATERAL(SELECT * FROM ads_subscriptions.tariffs t WHERE t.plan_id=p.id AND t.effective_at<=now()
  ORDER BY t.effective_at DESC,t.version DESC LIMIT 1)t ON true
 WHERE p.product=$1 AND(cardinality(t.eligible_tenant_ids)=0 OR $2::uuid=ANY(t.eligible_tenant_ids)) ORDER BY p.key`,[ctx.product,ctx.tenantId])).rows}}));}
export function selectSubscription(pool,ctx,input,key){
 if(!ctx.canSubscribe)fail(403,'SUBSCRIPTION_ROLE_REQUIRED');
 if(!exact(input,['product','planId','expectedTariffId'])||input.product!==ctx.product||!UUID.test(input.planId)||!UUID.test(input.expectedTariffId))fail(422,'INVALID_SUBSCRIPTION');
 return mutate(pool,ctx,'select-subscription',key,input,async db=>{
  // Serialise selection with operator tariff changes; no stale tariff can win a race.
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['plan:'+input.planId]);
  const plan=(await db.query('SELECT id FROM ads_subscriptions.plans WHERE id=$1 AND product=$2',[input.planId,ctx.product])).rows[0];
  if(!plan)fail(404,'NOT_FOUND');
  const tariff=(await db.query(`SELECT t.*,ads_subscriptions.tariff_terms(t) AS terms FROM ads_subscriptions.tariffs t WHERE plan_id=$1 AND product=$2 AND effective_at<=now()
   ORDER BY effective_at DESC,version DESC LIMIT 1`,[plan.id,ctx.product])).rows[0];
  if(!tariff)fail(404,'NOT_FOUND');if(tariff.id!==input.expectedTariffId)fail(409,'TARIFF_CHANGED');
  if(tariff.eligible_tenant_ids.length&&!tariff.eligible_tenant_ids.includes(ctx.tenantId))fail(404,'NOT_FOUND');
  const free=Number(tariff.amount_xaf)===0;
  const row=(await db.query(`INSERT INTO ads_subscriptions.subscriptions(tenant_id,product,plan_id,tariff_id,snapshot,state,starts_at,ends_at,created_by)
   VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $7 THEN now() END,CASE WHEN $7 THEN now()+($8::integer*interval '1 day') END,$9) RETURNING *`,
   [ctx.tenantId,ctx.product,plan.id,tariff.id,JSON.stringify(tariff.terms),free?'ACTIVE':'PENDING_PAYMENT',free,tariff.duration_days,ctx.userId])).rows[0];
  await audit(db,ctx,'SUBSCRIPTION_SELECTED',row.id,null,row);return {status:201,body:{subscription:row,testMode:true}};
 });
}
export function listSubscriptions(pool,ctx){return transaction(pool,ctx,async db=>({status:200,body:{subscriptions:(await db.query(`SELECT *,
 CASE WHEN state='ACTIVE' AND ends_at<=now() THEN 'EXPIRED' WHEN state='ACTIVE' AND ends_at<=now()+interval '7 days' THEN 'EXPIRING' ELSE state END AS effective_state
 FROM ads_subscriptions.subscriptions WHERE tenant_id=$1 AND product=$2 ORDER BY created_at,id`,[ctx.tenantId,ctx.product])).rows,testMode:true}}));}
export function cancelSubscription(pool,ctx,id,input,key){
 if(!ctx.canSubscribe)fail(403,'SUBSCRIPTION_ROLE_REQUIRED');
 if(!UUID.test(id)||!exact(input,['product','expectedVersion'])||input.product!==ctx.product||!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<1)fail(422,'INVALID_CANCELLATION');
 return mutate(pool,ctx,'cancel-subscription:'+id,key,input,async db=>{
  const before=(await db.query('SELECT * FROM ads_subscriptions.subscriptions WHERE id=$1 AND tenant_id=$2 AND product=$3 FOR UPDATE',[id,ctx.tenantId,ctx.product])).rows[0];
  if(!before)fail(404,'NOT_FOUND');if(before.version!==input.expectedVersion||before.state==='CANCELLED')fail(409,'SUBSCRIPTION_VERSION_CONFLICT');
  const after=(await db.query("UPDATE ads_subscriptions.subscriptions SET state='CANCELLED',cancelled_at=now(),version=version+1 WHERE id=$1 RETURNING *",[id])).rows[0];
  await audit(db,ctx,'SUBSCRIPTION_CANCELLED',id,before,after);return {status:200,body:{subscription:after,testMode:true}};
 });
}
export function entitlement(pool,ctx,key){
 if(!KEY.test(key)||!key.startsWith(ctx.product+'.'))fail(404,'NOT_FOUND');
 return transaction(pool,ctx,async db=>{
  const rows=(await db.query(`SELECT id,starts_at,ends_at,snapshot FROM ads_subscriptions.subscriptions
   WHERE tenant_id=$1 AND product=$2 AND state='ACTIVE' AND starts_at<=now() AND ends_at>now() AND snapshot->'entitlements' ? $3
   ORDER BY starts_at,id`,[ctx.tenantId,ctx.product,key])).rows;
  // Union of active grants. Missing limit means unlimited; otherwise use the largest grant.
  const limits=rows.map(r=>r.snapshot.usage_limits[key]);
  const limit=!rows.length||limits.some(v=>v===undefined)?null:Math.max(...limits);
  return {status:200,body:{tenantId:ctx.tenantId,product:ctx.product,key,entitled:rows.length>0,limit,sources:rows.map(r=>({id:r.id,startsAt:r.starts_at,endsAt:r.ends_at}))}};
 });
}

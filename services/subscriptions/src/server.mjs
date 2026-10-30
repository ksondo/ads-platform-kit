import http from 'node:http';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {UUID,ServiceError,fail,createPlan,createTariff,listPlans,selectSubscription,listSubscriptions,cancelSubscription,entitlement} from './service.mjs';

const messages={
 INVALID_TOKEN:['Please sign in with your ADS account.','Veuillez vous connecter avec votre compte ADS.'],
 NOT_FOUND:['Not found.','Introuvable.'],
 TARIFF_CHANGED:['The tariff changed. Review the current price before subscribing.','Le tarif a changé. Vérifiez le prix actuel avant de souscrire.'],
 PLAN_VERSION_CONFLICT:['This plan changed. Reload before saving.','Cette offre a changé. Rechargez avant d’enregistrer.'],
 IDEMPOTENCY_CONFLICT:['This request key was already used for another change.','Cette référence a déjà été utilisée pour une autre modification.'],
 SUBSCRIPTION_ROLE_REQUIRED:['Only an authorised organisation owner can change subscriptions.','Seul un responsable autorisé peut modifier les abonnements.'],
};
const send=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'});res.end(JSON.stringify(body))};
async function json(req){
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']??''))fail(415,'JSON_REQUIRED');
 let value='';for await(const chunk of req){value+=chunk;if(Buffer.byteLength(value)>65536)fail(413,'BODY_TOO_LARGE')}
 try{return JSON.parse(value)}catch{fail(422,'INVALID_JSON')}
}
/** Same jose RS256/JWKS verification as identity's admin API; no passwords or local login. */
export function createServer(pool,{issuer,jwksUrl,products,operatorAudience='ads-subscriptions',staffTenantIds=[],keySet}={}){
 if(!issuer||!products||!Object.keys(products).length||!Array.isArray(staffTenantIds)||staffTenantIds.some(id=>!UUID.test(id)))throw Error('Invalid subscription identity configuration');
 for(const [product,v] of Object.entries(products))if(!/^[a-z][a-z0-9._-]{1,79}$/.test(product)||typeof v?.audience!=='string'||!v.audience||!Array.isArray(v.subscribeRoles)||v.subscribeRoles.some(r=>typeof r!=='string')||v.audience===operatorAudience)throw Error('Invalid product binding');
 const audience=[operatorAudience,...Object.values(products).map(p=>p.audience)];
 if(new Set(audience).size!==audience.length)throw Error('Every product requires a distinct token audience');
 const jwks=keySet??createRemoteJWKSet(new URL(jwksUrl));
 async function context(req,product,admin){
  if(typeof product!=='string'||!Object.hasOwn(products,product))fail(404,'NOT_FOUND');
  const match=/^Bearer ([^\s]+)$/.exec(req.headers.authorization??'');
  if(!match)fail(401,'INVALID_TOKEN');
  let c;try{({payload:c}=await jwtVerify(match[1],jwks,{issuer,audience,algorithms:['RS256'],requiredClaims:['sub','tenant_id','roles','exp']}))}catch{fail(401,'INVALID_TOKEN')}
  if(!UUID.test(String(c.sub))||!UUID.test(String(c.tenant_id))||!Array.isArray(c.roles)||c.roles.some(r=>typeof r!=='string')||c.token_use==='admin')fail(401,'INVALID_TOKEN');
  const aud=Array.isArray(c.aud)?c.aud:[c.aud];
  const operator=aud.includes(operatorAudience)&&c.ads_staff===true&&staffTenantIds.includes(c.tenant_id)&&c.roles.includes('subscriptions_operator');
  if(admin&&!operator)fail(404,'NOT_FOUND');
  if(!operator&&!aud.includes(products[product].audience))fail(404,'NOT_FOUND');
  return {tenantId:c.tenant_id,userId:c.sub,product,operator,canSubscribe:!operator&&c.roles.some(r=>products[product].subscribeRoles.includes(r))};
 }
 return http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://subscriptions.invalid');
   if(req.method==='GET'&&url.pathname==='/health'){send(res,200,{status:'ok',testMode:true});return}
   if([...url.searchParams.keys()].some(k=>k!=='product')||url.searchParams.getAll('product').length>1)fail(422,'INVALID_QUERY');
   const prefix='/v1/subscriptions';const admin=url.pathname.startsWith(prefix+'/admin/');
   const body=req.method==='POST'?await json(req):null;
   const product=body?.product??url.searchParams.get('product');
   const ctx=await context(req,product,admin);const key=req.headers['idempotency-key'];let result;
   if(req.method==='POST'&&url.pathname===prefix+'/admin/plans')result=await createPlan(pool,ctx,body,key);
   else if(req.method==='POST'&&/^\/v1\/subscriptions\/admin\/plans\/[^/]+\/tariffs$/.test(url.pathname))
    result=await createTariff(pool,ctx,url.pathname.split('/')[5],body,key);
   else if(req.method==='GET'&&url.pathname===prefix+'/plans')result=await listPlans(pool,ctx);
   else if(req.method==='POST'&&url.pathname===prefix)result=await selectSubscription(pool,ctx,body,key);
   else if(req.method==='GET'&&url.pathname===prefix)result=await listSubscriptions(pool,ctx);
   else if(req.method==='POST'&&/^\/v1\/subscriptions\/[^/]+\/cancel$/.test(url.pathname))result=await cancelSubscription(pool,ctx,url.pathname.split('/')[3],body,key);
   else if(req.method==='GET'&&url.pathname.startsWith(prefix+'/entitlements/'))result=await entitlement(pool,ctx,decodeURIComponent(url.pathname.slice((prefix+'/entitlements/').length)));
   else fail(404,'NOT_FOUND');
   send(res,result.status,result.body);
  }catch(e){
   const status=e instanceof ServiceError?e.status:500,code=e instanceof ServiceError?e.code:'SERVICE_UNAVAILABLE';
   const [en,fr]=messages[code]??(status<500?['The request could not be completed. Check the details and try again.','La demande n’a pas abouti. Vérifiez les informations et réessayez.']:['The service is unavailable. Please try again.','Le service est indisponible. Veuillez réessayer.']);
   send(res,status,{error:code,message:{en,fr},testMode:true});
  }
 });
}

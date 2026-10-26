// Read-only policy audit. Never opens an identity DB or changes live accounts.
import {readFileSync} from 'node:fs';
import {policy,validatePolicy} from '../packages/demo-access-policy/index.mjs';
const json=(p)=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const txt=(p)=>readFileSync(new URL(p,import.meta.url),'utf8');
const clients=json('../config/clients.demo.json');
const personas=json('../config/demo-personas.json');
const pages=txt('../services/identity/src/pages.mjs');
const server=txt('../services/identity/src/server.mjs');
validatePolicy(policy,clients);
const bySlug=new Map(clients.products.map(p=>[p.slug,p]));
const findings=[];
const record=(severity,id,detail)=>findings.push({severity,id,detail});
let productPersonaCount=0,restrictedPersonaCount=0;
for(const [slug,obj] of Object.entries(personas.products||{})){
 const config=bySlug.get(slug);
 if(!config){record('HIGH','UNKNOWN_PRODUCT',slug);continue}
 for(const p of obj.personas||[]){
  productPersonaCount++;
  const org=(config.demo_orgs||[]).find(o=>o.key===p.org);
  if(p.org==='staff'||org?.staff===true ||p.roles?.some(r=>config.ads_only_roles?.includes(r)))restrictedPersonaCount++;
 }
}
const multiRoleProducts=clients.products.filter(p=>p.demo_orgs?.some(o=>(o.roles||[]).length>1));
if(clients.demo_grants?.includes('every role'))record('HIGH','BROAD_SHARED_DEMO_ROLE_GRANTS',`Shared demo users are configured to receive every listed organization role across ${clients.products.length} product clients; ${multiRoleProducts.length} products have a multi-role demo organization.`);
if(server.includes('WHERE p.client_id=$1 AND p.demo_set=') && server.includes('personaCache.set'))record('HIGH','UNFILTERED_PUBLIC_PERSONA_DIRECTORY','The hosted demo login can list all personas of a requested client, without a declared audience-based access filter.');
if(pages.includes('esc(personas.password)')&&restrictedPersonaCount>0)record('HIGH','SHARED_PERSONA_CREDENTIAL_EXPOSURE',`${restrictedPersonaCount} specialist or ADS staff personas use a shared password in a sign-in panel that may be public when DEMO_SHOW_CREDENTIALS=1.`);
if(pages.includes('demo-all')&&pages.includes('esc(demo.password)'))record('HIGH','PUBLIC_ALL_ROLE_DEMO_CREDENTIAL','A shared all-role demo account can appear on the sign-in page when demo credentials are displayed.');
record('INFO','EXISTING_AUTHORIZATION_BASELINE','Existing product audiences, staff-only role config, signed OIDC tokens and per-tenant checks already exist. This audit did not test a live deployment.');
record('RELEASE_GATE','RESTRICTED_LOGIN_REQUIRES_CHANGE','Implement separate non-public accounts/secrets or approved invitation/SSO for restricted personas; hiding their names alone is not sufficient.');
record('RELEASE_GATE','BACKEND_INTEGRATION_REQUIRED','All approved demo access decisions must be enforced in each product backend after token+tenant verification, with time-bounded server-side qualification grants.');
const summary={
 status:'SOURCE_AUDIT_ONLY',
 products:clients.products.length,
 personas:productPersonaCount,
 restrictedPersonas:restrictedPersonaCount,
 policyRules:policy.rules.length,
 high:findings.filter(x=>x.severity==='HIGH').length,
 launchReady:false,
 findings
};
if(process.argv.includes('--json'))console.log(JSON.stringify(summary,null,2));
else{
 console.log('ADS_DEMO_ACCESS_SOURCE_AUDIT=COMPLETE products='+summary.products+' personas='+summary.personas+' high='+summary.high);
 for(const f of findings)console.log(f.severity+' '+f.id+': '+f.detail);
 console.log('ADS_DEMO_PUBLIC_ROLE_ACCESS_READY=NO');
}
if(process.argv.includes('--release-gate')&&summary.high>0)process.exitCode=2;

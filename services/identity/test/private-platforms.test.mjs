import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { browser, csrfFrom, pkce, startService } from './helpers.mjs';
import { hashPassword } from '../src/security.mjs';

const secrets = { education: 'education-private-fixture-' + 'e'.repeat(40), agriculture: 'agriculture-private-fixture-' + 'a'.repeat(40) };
const password = 'Private-platform-fixture-2026';
const clients = JSON.parse(readFileSync(new URL('../../../config/clients.demo.json', import.meta.url))).products;

describe('operator private visitors for Education and Agriculture', () => {
  let svc;
  before(async () => {
    svc = await startService({ env: { ADS_ENV:'demo', DEMO_MODE:'1', DEMO_ACCESS_ENABLED:'0', DEMO_ACCESS_PRIVATE_ENABLED:'1',
      DEMO_ACCESS_CHECK_SECRET_COMMERCE:'commerce-fixture-' + 'c'.repeat(40),
      DEMO_ACCESS_CHECK_SECRET_EDUCATION:secrets.education, DEMO_ACCESS_CHECK_SECRET_AGRICULTURE:secrets.agriculture } });
    for (const key of ['education','agriculture']) {
      const c = clients.find(c => c.client_id === `${key}-web`);
      await svc.pool.query(`INSERT INTO platform.oauth_clients(client_id,display_name,redirect_uris,post_logout_redirect_uris,self_service_roles,allow_personal_workspace,admin_roles,assignable_roles)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [c.client_id,c.display_name,c.redirect_uris,c.post_logout_redirect_uris,c.self_service_roles,c.allow_personal_workspace,c.admin_roles ?? [],c.assignable_roles ?? []]);
    }
  });
  after(async () => { await svc?.stop(); });

  async function provision(platform, email) {
    return svc.app.demoAccess.provisionPrivate({platform,email,passwordHash:await hashPassword(password),operatorRef:'six-platform-test'});
  }
  async function code(b, platform, tenant) {
    const proof=pkce(), redirect=`https://${platform}.demo.africadigitalsynergy.com/`;
    const r=await b.get(`/authorize?${new URLSearchParams({response_type:'code',client_id:`${platform}-web`,redirect_uri:redirect,state:'private-platform',code_challenge:proof.challenge,code_challenge_method:'S256',...(tenant?{tenant_hint:tenant}:{})})}`);
    return {r,proof,redirect};
  }
  async function exchange(platform,pending) {
    return fetch(`${svc.base}/token`,{method:'POST',body:new URLSearchParams({grant_type:'authorization_code',client_id:`${platform}-web`,redirect_uri:pending.redirect,code:new URL(pending.r.location).searchParams.get('code'),code_verifier:pending.proof.verifier})});
  }

  for (const platform of ['education','agriculture']) {
    it(`${platform}: isolated ordinary account, registry-only personas, real SSO, expiry and revocation`, async () => {
      const first=await provision(platform,`${platform}.one@example.test`), second=await provision(platform,`${platform}.two@example.test`);
      assert.equal(first.platform,platform);
      const check=await svc.app.demoAccess.checkGrant(platform,first.userId);
      assert.equal(check.access,'granted');
      assert.deepEqual(first.personas,svc.app.demoAccess.platformOf(platform).personas.map(p=>p.key));
      const other=await svc.app.demoAccess.checkGrant(platform,second.userId);
      assert.ok(check.personas.every(p=>!other.personas.some(q=>p.tenantId===q.tenantId)));
      assert.equal((await svc.app.demoAccess.checkGrant(platform==='education'?'agriculture':'education',first.userId)).access,'none');
      await assert.rejects(provision(platform,first.email),/PRIVATE_VISITOR_ACCOUNT_EXISTS/);
      const row=(await svc.pool.query('SELECT is_demo,status,email_verified_at FROM platform.users WHERE id=$1',[first.userId])).rows[0];
      assert.equal(row.is_demo,false); assert.equal(row.status,'active'); assert.equal(row.email_verified_at,null);
      assert.equal((await svc.pool.query("SELECT count(*)::int AS n FROM platform.memberships m JOIN platform.tenants t ON t.id=m.tenant_id JOIN platform.organizations o ON o.id=t.organization_id WHERE m.user_id=$1 AND o.kind='personal'",[first.userId])).rows[0].n,0,'organisation-only grant creates no personal workspace');
      assert.deepEqual(await svc.app.admin.adminWorkspaces(first.userId),[]);
      const b=browser(svc.base), login=await b.get('/login');
      await b.post('/login',{csrf:csrfFrom(login.text),email:first.email,password});
      const initial=await code(b,platform);
      assert.ok(initial.r.location?.startsWith(initial.redirect),'SSO resolves private visitor to its granted entry workspace without chooser');
      const response=await exchange(platform,initial); assert.equal(response.status,200);
      const tokens=await response.json(), claims=JSON.parse(Buffer.from(tokens.access_token.split('.')[1],'base64url'));
      const entry=check.personas.find(p=>p.org==='personal') ?? check.personas.find(p=>p.org==='main') ?? check.personas[0];
      assert.equal(claims.tenant_id,entry.tenantId);
      const main=check.personas.find(p=>p.org==='main');
      await svc.pool.query("UPDATE platform.product_roles SET roles=array_append(roles,'not_in_visitor_grant') WHERE user_id=$1 AND tenant_id=$2 AND client_id=$3",[first.userId,main.tenantId,`${platform}-web`]);
      const switched=await code(b,platform,main.tenantId); assert.ok(switched.r.location?.startsWith(switched.redirect));
      const switchedResponse=await exchange(platform,switched); assert.equal(switchedResponse.status,200);
      const switchedToken=await switchedResponse.json(), switchedClaims=JSON.parse(Buffer.from(switchedToken.access_token.split('.')[1],'base64url'));
      const expected=[...new Set(check.personas.filter(p=>p.tenantId===main.tenantId).flatMap(p=>p.roles))].sort();
      assert.deepEqual([...switchedClaims.roles].sort(),expected);
      const narrowedRefresh=await fetch(`${svc.base}/token`,{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',refresh_token:switchedToken.refresh_token,client_id:`${platform}-web`})});
      assert.equal(narrowedRefresh.status,200);
      const narrowedBody=await narrowedRefresh.json();
      assert.deepEqual([...JSON.parse(Buffer.from(narrowedBody.access_token.split('.')[1],'base64url')).roles].sort(),expected);
      const stale=await code(b,platform);
      await svc.pool.query("UPDATE platform.demo_access_grants SET expires_at=now()-interval '1 second' WHERE id=$1",[first.grantId]);
      assert.equal((await exchange(platform,stale)).status,400,'pre-issued code refused after clock expiry');
      assert.equal((await code(b,platform)).r.status,403,'expiry cannot fall back to ordinary personal access');
      const refresh=await fetch(`${svc.base}/token`,{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',refresh_token:tokens.refresh_token,client_id:`${platform}-web`})});
      assert.equal(refresh.status,400);
      const secondBrowser=browser(svc.base), secondLogin=await secondBrowser.get('/login');
      await secondBrowser.post('/login',{csrf:csrfFrom(secondLogin.text),email:second.email,password});
      const secondResponse=await exchange(platform,await code(secondBrowser,platform)); assert.equal(secondResponse.status,200);
      const secondTokens=await secondResponse.json(), secondPending=await code(secondBrowser,platform);
      assert.equal((await svc.app.demoAccess.revokePrivate({grantId:second.grantId,operatorRef:'six-platform-test'})).status,'revoked');
      assert.equal((await svc.app.demoAccess.checkGrant(platform,second.userId)).reason,'REVOKED');
      assert.equal((await exchange(platform,secondPending)).status,400,'pre-issued code refused after revocation');
      const revokedRefresh=await fetch(`${svc.base}/token`,{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',refresh_token:secondTokens.refresh_token,client_id:`${platform}-web`})});
      assert.equal(revokedRefresh.status,400);
      assert.equal((await code(secondBrowser,platform)).r.status,403,'revoked visitor cannot obtain a new code');
      assert.equal((await svc.pool.query('SELECT count(*)::int AS n FROM platform.users WHERE id=ANY($1::uuid[])',[[first.userId,second.userId]])).rows[0].n,2,'expiry/revocation retain accounts');
      assert.equal(svc.mailer.outbox.length,0);
    });
  }

  it('rejects unapproved platform selection before creating any account',async()=>{
    await assert.rejects(provision('tourism','not-created@example.test'),/PRIVATE_VISITOR_PLATFORM_NOT_SUPPORTED/);
    assert.equal((await svc.pool.query("SELECT count(*)::int AS n FROM platform.users WHERE email='not-created@example.test'")).rows[0].n,0);
  });

  it('requires a separate strong platform check secret before creating an account',async()=>{
    const previous=svc.config.demoAccess.checkSecrets.agriculture;
    try {
      svc.config.demoAccess.checkSecrets.agriculture='too-short';
      await assert.rejects(provision('agriculture','no-secret@example.test'),/PRIVATE_VISITOR_PLATFORM_SECRET_REQUIRED/);
      assert.equal((await svc.pool.query("SELECT count(*)::int AS n FROM platform.users WHERE email='no-secret@example.test'")).rows[0].n,0);
    } finally { svc.config.demoAccess.checkSecrets.agriculture=previous; }
  });
});

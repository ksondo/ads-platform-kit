import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertAccessDenied, assertNoAccessPage, browser, csrfFrom, pkce, startService, withDeniedRedirect } from './helpers.mjs';
import { hashPassword } from '../src/security.mjs';

const secrets = { education: 'education-private-fixture-' + 'e'.repeat(40), agriculture: 'agriculture-private-fixture-' + 'a'.repeat(40), tontine: 'tontine-private-fixture-' + 't'.repeat(40) };
const platforms = ['education','agriculture','tontine'];
const password = 'Private-platform-fixture-2026';
const clients = JSON.parse(readFileSync(new URL('../../../config/clients.demo.json', import.meta.url))).products;

describe('operator private visitors for Education, Agriculture and Tontine', () => {
  let svc;
  before(async () => {
    svc = await startService({ env: { ADS_ENV:'demo', DEMO_MODE:'1', DEMO_ACCESS_ENABLED:'0', DEMO_ACCESS_PRIVATE_ENABLED:'1',
      DEMO_ACCESS_CHECK_SECRET_COMMERCE:'commerce-fixture-' + 'c'.repeat(40),
      DEMO_ACCESS_CHECK_SECRET_EDUCATION:secrets.education, DEMO_ACCESS_CHECK_SECRET_AGRICULTURE:secrets.agriculture,
      DEMO_ACCESS_CHECK_SECRET_TONTINE:secrets.tontine } });
    for (const key of platforms) {
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

  for (const platform of platforms) {
    it(`${platform}: isolated ordinary account, registry-only personas, real SSO, expiry and revocation`, async () => {
      const first=await provision(platform,`${platform}.one@example.test`), second=await provision(platform,`${platform}.two@example.test`);
      assert.equal(first.platform,platform);
      const check=await svc.app.demoAccess.checkGrant(platform,first.userId);
      assert.equal(check.access,'granted');
      assert.deepEqual(first.personas,svc.app.demoAccess.platformOf(platform).personas.map(p=>p.key));
      const other=await svc.app.demoAccess.checkGrant(platform,second.userId);
      assert.ok(check.personas.every(p=>!other.personas.some(q=>p.tenantId===q.tenantId)));
      for (const otherPlatform of platforms.filter(p=>p!==platform))
        assert.equal((await svc.app.demoAccess.checkGrant(otherPlatform,first.userId)).access,'none');
      if(platform==='tontine') {
        assert.deepEqual(check.personas.map(({key,org,roles})=>({key,org,roles})),[
          {key:'group-admin',org:'main',roles:['group_admin']},
          {key:'treasurer',org:'main',roles:['treasurer']},
          {key:'payout-approver',org:'main',roles:['payout_approver']},
          {key:'member',org:'main',roles:['member']},
          {key:'auditor',org:'main',roles:['auditor']},
          {key:'cooperative-admin',org:'cooperative',roles:['cooperative_admin']},
          {key:'partner',org:'partner',roles:['partner_admin']},
        ]);
        assert.deepEqual([...new Set(check.personas.map(p=>p.org))].sort(),['cooperative','main','partner']);
        assert.equal(new Set(check.personas.map(p=>p.tenantId)).size,3);
        assert.deepEqual([...new Set(check.personas.filter(p=>p.org==='main').flatMap(p=>p.roles))].sort(),['auditor','group_admin','member','payout_approver','treasurer']);
        assert.ok(check.personas.every(p=>!p.roles.some(r=>['platform_admin','tenant_admin','support','reviewer'].includes(r))));
      }
      if(platform==='agriculture') {
        // Release 2: 9 personas, the wave-2 agronomist (11 Nov 2026), processor and land holder (11 Nov 2026) and the demo colleague, all in the visitor's
        // own organisation; each holds only its own role, except the demo colleague, which holds every second-approval role (owner decision 11 Nov 2026).
        const expected=[
          {key:'farmer',org:'main',roles:['farmer']},
          {key:'buyer',org:'main',roles:['buyer']},
          {key:'coop-manager',org:'main',roles:['coop_manager']},
          {key:'extension-officer',org:'main',roles:['extension_officer']},
          {key:'agronomist',org:'main',roles:['agronomist']},
          {key:'lender-officer',org:'main',roles:['lender_officer']},
          {key:'input-supplier',org:'main',roles:['input_supplier']},
          {key:'farm-reviewer',org:'main',roles:['reviewer']},
          {key:'help-desk',org:'main',roles:['support']},
          {key:'org-admin',org:'main',roles:['tenant_admin']},
          {key:'processor',org:'main',roles:['processor']},
          {key:'landowner',org:'main',roles:['farmer']},
          {key:'demo-colleague',org:'main',roles:['reviewer','coop_manager','lender_officer','agronomist']},
        ];
        assert.deepEqual(check.personas.map(({key,org,roles})=>({key,org,roles})),expected);
        assert.equal(new Set(check.personas.map(p=>p.tenantId)).size,1,'one visitor organisation');
        // Narrowing a token to one persona (intersection, as the product server does) leaves exactly that persona's role.
        const held=(await svc.pool.query('SELECT roles FROM platform.product_roles WHERE user_id=$1 AND tenant_id=$2 AND client_id=$3',[first.userId,check.personas[0].tenantId,'agriculture-web'])).rows[0].roles;
        for(const persona of check.personas) assert.deepEqual(held.filter(r=>persona.roles.includes(r)).sort(),[...persona.roles].sort(),persona.key);
        assert.deepEqual([...held].sort(),['agronomist','buyer','coop_manager','extension_officer','farmer','input_supplier','lender_officer','processor','reviewer','support','tenant_admin']);
        // Never ADS staff: the visitor belongs to no staff organisation, and its own organisation is a non-staff visit-* copy.
        const orgs=(await svc.pool.query(`SELECT o.is_staff,o.demo_key,m.role FROM platform.memberships m JOIN platform.tenants t ON t.id=m.tenant_id
          JOIN platform.organizations o ON o.id=t.organization_id WHERE m.user_id=$1`,[first.userId])).rows;
        assert.equal(orgs.length,1);
        assert.equal(orgs[0].is_staff,false); assert.match(orgs[0].demo_key,/^visit-[0-9a-f]{12}\/agriculture:main$/); assert.equal(orgs[0].role,'member');
        // Never Identity admin: org-admin (tenant_admin) gives no organisation or product admin authority in a visit-* organisation.
        const authority=await svc.app.admin.authority(first.userId,check.personas[0].tenantId);
        assert.equal(authority,null);
        assert.deepEqual(svc.app.admin.entitledScopes(authority,'agriculture-web'),[]);
      }
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
      if(platform==='tontine') {
        // All three visitor organisations use the same real ADS session, without creating another account.
        for(const org of ['main','cooperative','partner']) {
          const own=check.personas.filter(p=>p.org===org), pending=await code(b,platform,own[0].tenantId);
          assert.ok(pending.r.location?.startsWith(pending.redirect),'authorized tenant hint returns directly, never another password');
          const response=await exchange(platform,pending);assert.equal(response.status,200);
          const body=await response.json(), token=JSON.parse(Buffer.from(body.access_token.split('.')[1],'base64url'));
          assert.equal(token.sub,first.userId);
          assert.equal(token.tenant_id,own[0].tenantId);
          assert.deepEqual([...token.roles].sort(),[...new Set(own.flatMap(p=>p.roles))].sort());
        }
        // An unauthorized hint is ignored in favour of the visitor's own entry organisation, never granted.
        const foreign=other.personas.find(p=>p.org==='main').tenantId;
        const response=await exchange(platform,await code(b,platform,foreign));assert.equal(response.status,200);
        const body=await response.json(), token=JSON.parse(Buffer.from(body.access_token.split('.')[1],'base64url'));
        assert.equal(token.tenant_id,entry.tenantId);assert.notEqual(token.tenant_id,foreign);
      }
      if(platform==='agriculture') {
        // Another visitor's organisation is refused: its tenant hint is ignored and the token stays in the visitor's own organisation.
        const foreign=other.personas[0].tenantId, own=check.personas[0].tenantId;
        const response=await exchange(platform,await code(b,platform,foreign));assert.equal(response.status,200);
        const token=JSON.parse(Buffer.from((await response.json()).access_token.split('.')[1],'base64url'));
        assert.equal(token.tenant_id,own);assert.notEqual(token.tenant_id,foreign);
        assert.ok(!token.roles.includes('platform_admin'));
      }
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
      // Expiry cannot fall back to ordinary personal access: Identity page with the flag off, access_denied when the product opts in.
      await withDeniedRedirect(svc,[],async()=>assertNoAccessPage((await code(b,platform)).r));
      await withDeniedRedirect(svc,[`${platform}-web`],async()=>{ const denied=await code(b,platform); assertAccessDenied(denied.r,denied.redirect,'private-platform','DEMO_ACCESS_EXPIRED'); });
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
      // Revoked visitor cannot obtain a new code: Identity page with the flag off, access_denied when the product opts in.
      await withDeniedRedirect(svc,[],async()=>assertNoAccessPage((await code(secondBrowser,platform)).r));
      await withDeniedRedirect(svc,[`${platform}-web`],async()=>{ const denied=await code(secondBrowser,platform); assertAccessDenied(denied.r,denied.redirect,'private-platform','DEMO_ACCESS_REVOKED'); });
      assert.equal((await svc.pool.query('SELECT count(*)::int AS n FROM platform.users WHERE id=ANY($1::uuid[])',[[first.userId,second.userId]])).rows[0].n,2,'expiry/revocation retain accounts');
      assert.equal(svc.mailer.outbox.length,0);
    });
  }

  it('rejects unapproved platform selection before creating any account',async()=>{
    await assert.rejects(provision('transport','not-created@example.test'),/PRIVATE_VISITOR_PLATFORM_NOT_SUPPORTED/);
    assert.equal((await svc.pool.query("SELECT count(*)::int AS n FROM platform.users WHERE email='not-created@example.test'")).rows[0].n,0);
  });

  for(const platform of platforms) it(`${platform}: requires its own strong check secret before creating an account`,async()=>{
    const previous=svc.config.demoAccess.checkSecrets[platform],email=`${platform}.no-secret@example.test`;
    try {
      svc.config.demoAccess.checkSecrets[platform]='too-short';
      await assert.rejects(provision(platform,email),/PRIVATE_VISITOR_PLATFORM_SECRET_REQUIRED/);
      assert.equal((await svc.pool.query('SELECT count(*)::int AS n FROM platform.users WHERE email=$1',[email])).rows[0].n,0);
    } finally { svc.config.demoAccess.checkSecrets[platform]=previous; }
  });
});

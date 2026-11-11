// Operator commands. Organisation admins manage members, roles and invitations themselves on
// /admin or through the admin API; these commands are for ADS operators. Run inside the identity container:
//   node src/cli.mjs <command> [--flag value ...]
import crypto from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { DEMO_ACCOUNTS, demoSettings, isProductionEnv, readSecret, redirectAllowed, loadConfig } from './config.mjs';
import { privateVisitorService, provisionPrivateVisitor } from './private-demo-visitor.mjs';
import { migrate } from './db.mjs';
import { bootstrapDemoAccounts, demoAccountSubs, ensureDemoOrgs, personaAccounts, resetDemo, tenantsDocument } from './demo.mjs';
import { CLIENT_ID, CLIENT_KINDS, validateServiceClient, validateTokenExchange } from './service-clients.mjs';

const [command, ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i += 2) args[rest[i].replace(/^--/, '')] = rest[i + 1];
const list = v => String(v ?? '').split(',').map(s => s.trim()).filter(Boolean);
const need = (...names) => { for (const n of names) if (!args[n]) { console.error(`missing --${n}`); process.exit(2); } };

const usage = `Commands:
  migrate
  generate-key                         print a new RS256 private key for IDENTITY_SIGNING_KEY_PEM
  register-client --id health-web --name "ADS Health" --redirect https://health.example/,https://... [--logout https://...] [--logo https://...] [--accent #146D91] [--self-roles patient] [--personal true|false]
                  [--admin-scopes members:read,roles:write,members:write,invitations:write] [--admin-roles facility_admin] [--assignable-roles nurse,receptionist]
                  [--token-exchange '[{"audience":"ads-commerce-api","scopes":["commerce.sector_offers"]}]']
  register-client --kind service --id agriculture-sector-service --name "ADS Agriculture sector service"
                  --service-scopes commerce.sector_outcomes.read --service-audiences ads-commerce-api
                                       a product SERVER client for client_credentials (no users, no tenant); then set-client-secret
  set-client-secret --id health-web    print a new client secret for the product SERVER (token exchange, client_credentials); shown once
  create-organization --name "Ecole Les Pins" --owner owner@example.com
  grant-role --email user@example.com --client health-web --tenant <tenant uuid> --roles facility_admin,reviewer
  make-org-admin --email user@example.com --tenant <tenant uuid>
  disable-user --email user@example.com
  mark-staff-org --tenant <tenant uuid> [--staff true|false]   ADS staff organisation flag (ACC-04, token claim ads_staff)

Demo environment only (ADS_ENV=demo AND DEMO_MODE=1; refused everywhere else):
  demo-visitor-provision [--platform commerce|education|agriculture|tontine|fleet-guard|ventureworks] --email visitor@example.test --operator-ref ADS-operator --credentials-out /run/private/visitor.json --apply yes
                                       private mode only: one new individual account, registry-listed visitor personas, 30 days; Commerce default; no mail; password only in an exclusive 0600 file
  demo-visitor-revoke --grant <grant uuid> --operator-ref ADS-operator --apply yes
                                       private mode only: revoke a privately provisioned grant without enabling public approvals
  demo-bootstrap [--clients ...] [--personas config/demo-personas.json]
                                       create or refresh the demo user, second demo user and demo admin, and the demo personas
                                       passwords from DEMO_USER_PASSWORD, DEMO_USER2_PASSWORD, DEMO_ADMIN_PASSWORD, DEMO_PERSONA_PASSWORD (or *_FILE); never printed
                                       (without DEMO_PERSONA_PASSWORD the personas are skipped, with a warning)
  demo-orgs [--clients config/clients.demo.json] [--personas config/demo-personas.json] [--out demo-tenants.json]
                                       demo organisations per product (+ ADS staff ones); demo user and checker get every role; each persona
                                       exactly its roles in its one organisation; writes product -> tenant ids and persona subs
  demo-reset [--clients ...] [--personas ...] [--out ...]   nightly: restore the demo accounts and personas, end their sign-ins, restore memberships and roles`;
const here = path.dirname(fileURLToPath(import.meta.url));
const defaultClients = path.resolve(here, '../../../config/clients.demo.json');
const defaultPersonas = path.resolve(here, '../../../config/demo-personas.json');
const demoPasswords = () => ({
  ...Object.fromEntries(DEMO_ACCOUNTS.map(k => [k, readSecret(process.env, { user: 'DEMO_USER_PASSWORD', user2: 'DEMO_USER2_PASSWORD', admin: 'DEMO_ADMIN_PASSWORD' }[k])])),
  persona: readSecret(process.env, 'DEMO_PERSONA_PASSWORD'),
});
const minPasswordLength = Number(process.env.IDENTITY_PASSWORD_MIN_LENGTH || 10);
const readClients = () => JSON.parse(readFileSync(args.clients ?? defaultClients, 'utf8'));
// The personas file is optional (none: no personas). An explicit --personas must exist.
const readPersonas = clients => {
  const file = args.personas ?? defaultPersonas;
  if (!args.personas && !existsSync(file)) return [];
  return personaAccounts(demo, JSON.parse(readFileSync(file, 'utf8')), clients);
};
// Personas need their password; without it they are skipped (the three demo accounts still work).
const bootstrapPersonas = (personas, passwords) => {
  if (personas.length && !passwords.persona) {
    console.warn(`demo personas skipped: ${demo.personaPasswordVar} (or ${demo.personaPasswordVar}_FILE) is not set`);
    return [];
  }
  return personas;
};
const writeTenants = async (file, map) => {
  writeFileSync(file, `${JSON.stringify(tenantsDocument(map, await demoAccountSubs(pool)), null, 2)}\n`);
  for (const [slug, e] of Object.entries(map)) {
    const personas = Object.keys(e.personas ?? {}).length;
    console.log(`${slug.padEnd(20)} ${Object.entries(e.tenants).map(([k, v]) => `${k}=${v}`).join(' ')}${Object.keys(e.settings).length ? `  [${Object.keys(e.settings).join(', ')}]` : ''}${personas ? `  personas=${personas}` : ''}`);
  }
  console.log(`tenant ids written to ${file}`);
};
const printAccounts = accounts => {
  for (const a of accounts.filter(x => !x.persona)) console.log(`demo ${a.key.padEnd(5)} ${a.email} ${a.created ? 'created' : 'refreshed'} (password from ${demo.accounts[a.key].passwordVar}, not shown)`);
  const personas = accounts.filter(x => x.persona);
  if (personas.length) console.log(`demo personas: ${personas.length} (${personas.filter(a => a.created).length} created, ${personas.filter(a => !a.created).length} refreshed; password from ${demo.personaPasswordVar}, not shown)`);
};
// Demo accounts are refused outside demo mode; the operator CLI does not hand them roles or organisations there either.
const isDemoAccount = async email => (await pool.query('SELECT is_demo FROM platform.users WHERE email=$1', [String(email).toLowerCase()])).rows[0]?.is_demo === true;

if (command === 'generate-key') {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  console.log(privateKey.export({ type: 'pkcs8', format: 'pem' }));
  process.exit(0);
}
if (!command || command === 'help') { console.log(usage); process.exit(0); }
let demo;
try {
  demo = demoSettings(process.env);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
if (command.startsWith('demo-') && !demo.enabled) {
  console.error('refused: demo accounts and organisations exist only when ADS_ENV=demo and DEMO_MODE=1');
  process.exit(2);
}
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL required'); process.exit(2); }

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const audit = (event, data) => pool.query("INSERT INTO platform.identity_audit(event_type,user_id,tenant_id,outcome,reason,client_id) VALUES ($1,$2,$3,'allowed','cli',$4)", [event, data.userId ?? null, data.tenantId ?? null, data.clientId ?? null]);
const userId = async email => {
  const row = (await pool.query('SELECT id FROM platform.users WHERE email=$1', [String(email).toLowerCase()])).rows[0];
  if (!row) { console.error(`no user with email ${email}; they must register first`); process.exit(1); }
  return row.id;
};

try {
  switch (command) {
    case 'demo-visitor-provision': {
      if (Object.keys(args).some(k => !['email', 'operator-ref', 'credentials-out', 'apply', 'locale', 'platform'].includes(k))) throw new Error('PRIVATE_VISITOR_UNKNOWN_ARGUMENT');
      need('email', 'operator-ref', 'credentials-out', 'apply');
      const config = loadConfig();
      console.log(JSON.stringify(await provisionPrivateVisitor({ pool, config, email: args.email, operatorRef: args['operator-ref'], credentialsOut: args['credentials-out'], apply: args.apply, locale: args.locale, platform: args.platform })));
      break;
    }
    case 'demo-visitor-revoke': {
      if (Object.keys(args).some(k => !['grant', 'operator-ref', 'apply'].includes(k))) throw new Error('PRIVATE_VISITOR_UNKNOWN_ARGUMENT');
      need('grant', 'operator-ref', 'apply');
      if (args.apply !== 'yes') throw new Error('PRIVATE_VISITOR_EXPLICIT_APPLY_REQUIRED');
      console.log(JSON.stringify(await privateVisitorService(pool, loadConfig()).revokePrivate({ grantId: args.grant, operatorRef: args['operator-ref'] })));
      break;
    }
    case 'migrate':
      console.log((await migrate(pool, { info: () => {} })).join('\n') || 'up to date');
      break;
    case 'register-client': {
      const kind = args.kind ?? 'web';
      if (!CLIENT_KINDS.includes(kind)) throw new Error(`unknown client kind ${kind} (known: ${CLIENT_KINDS.join(', ')})`);
      if (!CLIENT_ID.test(String(args.id ?? ''))) throw new Error(`bad client id ${args.id}`);
      // Every other client id: service and exchange audiences may not name one, and this id may not be anyone's audience.
      const others = (await pool.query('SELECT client_id, service_audiences, token_exchange FROM platform.oauth_clients WHERE client_id<>$1', [args.id])).rows;
      const otherIds = new Set([...others.map(r => r.client_id), args.id]);
      if (others.some(r => r.service_audiences.includes(args.id) || r.token_exchange.some(e => e.audience === args.id))) {
        throw new Error(`${args.id} is used as an audience by another client; pick another client id`);
      }
      let row;
      if (kind === 'service') {
        need('id', 'name');
        for (const k of ['redirect', 'logout', 'self-roles', 'admin-scopes', 'admin-roles', 'assignable-roles', 'token-exchange']) {
          if (list(args[k]).length && !(k === 'token-exchange' && args[k] === '[]')) throw new Error(`--${k} is not allowed for a service client`);
        }
        if (args.personal === 'true') throw new Error('--personal is not allowed for a service client');
        const { scopes, audiences } = validateServiceClient({ client_id: args.id, kind, display_name: args.name,
          allowedServiceScopes: list(args['service-scopes']), allowedAudiences: list(args['service-audiences']) }, otherIds);
        row = { redirect: [], logout: [], selfRoles: [], personal: false, adminScopes: [], adminRoles: [], assignable: [], scopes, audiences, exchange: [] };
      } else {
        need('id', 'name', 'redirect');
        for (const u of [...list(args.redirect), ...list(args.logout)]) {
          const parsed = new URL(u);
          if (!redirectAllowed(parsed, { production: isProductionEnv() })) throw new Error(`redirect must be https: ${u}`);
        }
        if (list(args['service-scopes']).length || list(args['service-audiences']).length) throw new Error('--service-scopes/--service-audiences are only for --kind service');
        const scopes = list(args['admin-scopes']);
        const known = ['members:read', 'roles:write', 'members:write', 'invitations:write'];
        for (const sc of scopes) if (!known.includes(sc)) throw new Error(`unknown admin scope ${sc} (known: ${known.join(', ')})`);
        let exchange = [];
        if (args['token-exchange'] !== undefined) {
          let parsed;
          try { parsed = JSON.parse(args['token-exchange']); } catch { throw new Error('--token-exchange must be JSON: [{"audience":"...","scopes":["..."]}]'); }
          exchange = validateTokenExchange(parsed, args.id, otherIds);
        }
        row = { redirect: list(args.redirect), logout: list(args.logout), selfRoles: list(args['self-roles']), personal: args.personal !== 'false',
          adminScopes: scopes, adminRoles: list(args['admin-roles']), assignable: list(args['assignable-roles']), scopes: [], audiences: [], exchange };
      }
      await pool.query(`INSERT INTO platform.oauth_clients(client_id,display_name,logo_url,accent_color,redirect_uris,post_logout_redirect_uris,self_service_roles,allow_personal_workspace,admin_scopes,admin_roles,assignable_roles,
          kind,service_scopes,service_audiences,token_exchange)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
        ON CONFLICT (client_id) DO UPDATE SET display_name=EXCLUDED.display_name, logo_url=EXCLUDED.logo_url, accent_color=EXCLUDED.accent_color,
          redirect_uris=EXCLUDED.redirect_uris, post_logout_redirect_uris=EXCLUDED.post_logout_redirect_uris,
          self_service_roles=EXCLUDED.self_service_roles, allow_personal_workspace=EXCLUDED.allow_personal_workspace,
          admin_scopes=EXCLUDED.admin_scopes, admin_roles=EXCLUDED.admin_roles, assignable_roles=EXCLUDED.assignable_roles,
          kind=EXCLUDED.kind, service_scopes=EXCLUDED.service_scopes, service_audiences=EXCLUDED.service_audiences, token_exchange=EXCLUDED.token_exchange`,
      [args.id, args.name, args.logo ?? null, args.accent ?? null, row.redirect, row.logout, row.selfRoles, row.personal,
        row.adminScopes, row.adminRoles, row.assignable, kind, row.scopes, row.audiences, JSON.stringify(row.exchange)]);
      await audit('client_registered', { clientId: args.id });
      console.log(`client ${args.id} saved${kind === 'service' ? ' (service client)' : ''}`);
      break;
    }
    case 'create-organization': {
      need('name', 'owner');
      if (await isDemoAccount(args.owner)) throw new Error('demo accounts cannot own organisations made here; use demo-orgs');
      const owner = await userId(args.owner);
      const orgId = crypto.randomUUID();
      const tenantId = crypto.randomUUID();
      const slug = `${args.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}-${crypto.randomBytes(3).toString('hex')}`;
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query('INSERT INTO platform.organizations(id,name,slug) VALUES ($1,$2,$3)', [orgId, args.name, slug]);
        await c.query('INSERT INTO platform.tenants(id,organization_id,name) VALUES ($1,$2,$3)', [tenantId, orgId, args.name]);
        await c.query("INSERT INTO platform.memberships(user_id,tenant_id,role,scopes) VALUES ($1,$2,'owner','{}')", [owner, tenantId]);
        await c.query('COMMIT');
      } catch (error) {
        await c.query('ROLLBACK');
        throw error;
      } finally {
        c.release();
      }
      await audit('organization_created', { userId: owner, tenantId });
      console.log(`organization created; tenant id ${tenantId}`);
      break;
    }
    case 'grant-role': {
      need('email', 'client', 'tenant', 'roles');
      if (!demo.enabled && await isDemoAccount(args.email)) throw new Error('refused: demo accounts get roles only in demo mode (demo-orgs)');
      const uid = await userId(args.email);
      await pool.query("INSERT INTO platform.memberships(user_id,tenant_id,role,scopes) VALUES ($1,$2,'member','{}') ON CONFLICT DO NOTHING", [uid, args.tenant]);
      await pool.query(`INSERT INTO platform.product_roles(user_id,tenant_id,client_id,roles) VALUES ($1,$2,$3,$4)
        ON CONFLICT (user_id,tenant_id,client_id) DO UPDATE SET roles=EXCLUDED.roles, updated_at=now()`, [uid, args.tenant, args.client, list(args.roles)]);
      await audit('roles_granted', { userId: uid, tenantId: args.tenant, clientId: args.client });
      console.log(`roles for ${args.email} in ${args.client}: ${list(args.roles).join(', ') || '(none)'}`);
      break;
    }
    case 'set-client-secret': {
      need('id');
      const secret = crypto.randomBytes(32).toString('base64url');
      const r = await pool.query("UPDATE platform.oauth_clients SET client_secret_hash=encode(sha256(convert_to($2,'UTF8')),'hex') WHERE client_id=$1", [args.id, secret]);
      if (!r.rowCount) throw new Error(`no client ${args.id}`);
      await audit('client_secret_set', { clientId: args.id });
      console.log(`client secret for ${args.id} (store it in the product server's secrets; it is not shown again):\n${secret}`);
      break;
    }
    case 'make-org-admin': {
      need('email', 'tenant');
      const uid = await userId(args.email);
      const r = await pool.query("UPDATE platform.memberships SET role='admin' WHERE user_id=$1 AND tenant_id=$2 AND role<>'owner'", [uid, args.tenant]);
      if (!r.rowCount) throw new Error('not a member of that workspace (or already the owner)');
      await audit('org_admin_set', { userId: uid, tenantId: args.tenant });
      console.log(`${args.email} is an organisation admin`);
      break;
    }
    case 'disable-user': {
      need('email');
      const uid = await userId(args.email);
      await pool.query("UPDATE platform.users SET status='disabled', updated_at=now() WHERE id=$1", [uid]);
      await pool.query('UPDATE platform.sso_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [uid]);
      await pool.query('UPDATE platform.refresh_tokens SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [uid]);
      await pool.query('UPDATE platform.sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [uid]);
      await audit('user_disabled', { userId: uid });
      console.log(`${args.email} disabled and signed out everywhere`);
      break;
    }
    case 'mark-staff-org': {
      need('tenant');
      const staff = args.staff !== 'false';
      const r = await pool.query('UPDATE platform.organizations o SET is_staff=$2 FROM platform.tenants t WHERE t.organization_id=o.id AND t.id=$1 AND o.kind=\'organization\'', [args.tenant, staff]);
      if (!r.rowCount) throw new Error('no organisation workspace with that tenant id');
      await audit(staff ? 'staff_org_marked' : 'staff_org_unmarked', { tenantId: args.tenant });
      console.log(`tenant ${args.tenant} ${staff ? 'is' : 'is no longer'} an ADS staff organisation`);
      break;
    }
    case 'demo-bootstrap': {
      const passwords = demoPasswords();
      const personas = bootstrapPersonas(readPersonas(readClients()), passwords);
      printAccounts(await bootstrapDemoAccounts(pool, demo, passwords, { minPasswordLength, personas }));
      break;
    }
    case 'demo-orgs': {
      const doc = readClients();
      await writeTenants(args.out ?? 'demo-tenants.json', await ensureDemoOrgs(pool, demo, doc, { personas: readPersonas(doc) }));
      break;
    }
    case 'demo-reset': {
      const doc = readClients();
      const passwords = demoPasswords();
      const personas = bootstrapPersonas(readPersonas(doc), passwords);
      const result = await resetDemo(pool, demo, passwords, doc, { minPasswordLength, personas });
      console.log(`demo reset: accounts ${result.accounts.filter(a => !a.persona).map(a => a.key).join(', ')} restored; personas ${result.accounts.filter(a => a.persona).length} restored; ${JSON.stringify(result.cleaned)}`);
      await writeTenants(args.out ?? 'demo-tenants.json', result.tenants);
      break;
    }
    default:
      console.log(usage);
      process.exitCode = 2;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

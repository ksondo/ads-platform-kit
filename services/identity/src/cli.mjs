// Operator commands. Organisation admins manage members, roles and invitations themselves on
// /admin or through the admin API; these commands are for ADS operators. Run inside the identity container:
//   node src/cli.mjs <command> [--flag value ...]
import crypto from 'node:crypto';
import pg from 'pg';
import { migrate } from './db.mjs';

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
  set-client-secret --id health-web    print a new client secret for the product SERVER (admin API token exchange); shown once
  create-organization --name "Ecole Les Pins" --owner owner@example.com
  grant-role --email user@example.com --client health-web --tenant <tenant uuid> --roles facility_admin,reviewer
  make-org-admin --email user@example.com --tenant <tenant uuid>
  disable-user --email user@example.com`;

if (command === 'generate-key') {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  console.log(privateKey.export({ type: 'pkcs8', format: 'pem' }));
  process.exit(0);
}
if (!command || command === 'help') { console.log(usage); process.exit(0); }
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
    case 'migrate':
      console.log((await migrate(pool, { info: () => {} })).join('\n') || 'up to date');
      break;
    case 'register-client': {
      need('id', 'name', 'redirect');
      for (const u of [...list(args.redirect), ...list(args.logout)]) {
        const parsed = new URL(u);
        if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') throw new Error(`redirect must be https: ${u}`);
      }
      const scopes = list(args['admin-scopes']);
      const known = ['members:read', 'roles:write', 'members:write', 'invitations:write'];
      for (const sc of scopes) if (!known.includes(sc)) throw new Error(`unknown admin scope ${sc} (known: ${known.join(', ')})`);
      await pool.query(`INSERT INTO platform.oauth_clients(client_id,display_name,logo_url,accent_color,redirect_uris,post_logout_redirect_uris,self_service_roles,allow_personal_workspace,admin_scopes,admin_roles,assignable_roles)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (client_id) DO UPDATE SET display_name=EXCLUDED.display_name, logo_url=EXCLUDED.logo_url, accent_color=EXCLUDED.accent_color,
          redirect_uris=EXCLUDED.redirect_uris, post_logout_redirect_uris=EXCLUDED.post_logout_redirect_uris,
          self_service_roles=EXCLUDED.self_service_roles, allow_personal_workspace=EXCLUDED.allow_personal_workspace,
          admin_scopes=EXCLUDED.admin_scopes, admin_roles=EXCLUDED.admin_roles, assignable_roles=EXCLUDED.assignable_roles`,
      [args.id, args.name, args.logo ?? null, args.accent ?? null, list(args.redirect), list(args.logout), list(args['self-roles']), args.personal !== 'false',
        scopes, list(args['admin-roles']), list(args['assignable-roles'])]);
      await audit('client_registered', { clientId: args.id });
      console.log(`client ${args.id} saved`);
      break;
    }
    case 'create-organization': {
      need('name', 'owner');
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

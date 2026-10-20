// Applies the reviewed client registration list (ACC-02) with the operator CLI's register-client,
// and creates client secrets (ACC-09) for the products that need one, with set-client-secret.
//
//   node scripts/apply-clients.mjs [--file ../../config/clients.demo.json] --secrets-out /path/outside/git/client-secrets.json
//        [--rotate-secrets] [--overwrite] [--dry-run]
//
// Secrets are generated only here, at apply time. They are never printed: they go to --secrets-out
// (mode 0600, refused inside a git work tree). Existing secrets are kept unless --rotate-secrets.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { validateClientList } from '../src/demo.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, '../src/cli.mjs');
const argv = process.argv.slice(2);
const flag = name => argv.includes(`--${name}`);
const opt = name => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const die = (message, code = 2) => { console.error(message); process.exit(code); };

const file = opt('file') ?? path.resolve(here, '../../../config/clients.demo.json');
let doc;
try {
  doc = validateClientList(JSON.parse(readFileSync(file, 'utf8')));
} catch (error) {
  die(`client list ${file}: ${error.message}`);
}
if (!process.env.DATABASE_URL && !flag('dry-run')) die('DATABASE_URL required');

const run = args => {
  const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: process.env });
  if (r.status !== 0) throw new Error(`${args[0]} ${args[2] ?? ''} failed: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout;
};
const registerArgs = p => {
  const a = ['register-client', '--id', p.client_id, '--name', p.display_name ?? p.product, '--redirect', p.redirect_uris.join(','),
    '--logout', (p.post_logout_redirect_uris ?? []).join(','), '--self-roles', (p.self_service_roles ?? []).join(','),
    '--personal', p.allow_personal_workspace ? 'true' : 'false', '--admin-scopes', (p.admin_scopes ?? []).join(','),
    '--admin-roles', (p.admin_roles ?? []).join(','), '--assignable-roles', (p.assignable_roles ?? []).join(',')];
  if (p.accent) a.push('--accent', p.accent);
  return a;
};

// Where secrets go: outside any git work tree, new file (or --overwrite), owner-only.
const secretsOut = opt('secrets-out');
const needSecrets = doc.products.filter(p => p.needs_client_secret);
if (needSecrets.length && !secretsOut && !flag('dry-run')) die(`--secrets-out is required: ${needSecrets.length} products need a client secret`);
if (secretsOut) {
  const dir = path.dirname(path.resolve(secretsOut));
  const inGit = spawnSync('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' });
  if (inGit.status === 0 && inGit.stdout.trim() === 'true') die(`refused: ${secretsOut} is inside a git work tree; write secrets outside any repository`);
  if (existsSync(secretsOut) && !flag('overwrite')) die(`refused: ${secretsOut} exists (move it to the server secrets first, or pass --overwrite)`);
}

if (flag('dry-run')) {
  for (const p of doc.products) console.log(`would register ${p.client_id}${p.needs_client_secret ? ' (+ client secret)' : ''}`);
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const secrets = {};
try {
  for (const p of doc.products) {
    run(registerArgs(p));
    let note = '';
    if (p.needs_client_secret) {
      const has = (await pool.query('SELECT client_secret_hash IS NOT NULL AS has FROM platform.oauth_clients WHERE client_id=$1', [p.client_id])).rows[0]?.has;
      if (!has || flag('rotate-secrets')) {
        const out = run(['set-client-secret', '--id', p.client_id]).trim().split('\n');
        secrets[p.client_id] = { product: p.slug, setting: p.client_secret_setting ?? null, secret: out[out.length - 1].trim() };
        note = ' + new client secret';
      } else {
        note = ' (client secret kept)';
      }
    }
    console.log(`registered ${p.client_id}${note}`);
  }
  for (const n of doc.no_client ?? []) console.log(`no client for ${n.slug}: ${n.reason}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
  if (Object.keys(secrets).length) {
    writeFileSync(secretsOut, `${JSON.stringify({ generated_at: new Date().toISOString(), clients: secrets }, null, 2)}\n`, { mode: 0o600, flag: flag('overwrite') ? 'w' : 'wx' });
    console.log(`${Object.keys(secrets).length} client secrets written to ${secretsOut} (not shown). Put each into its product server's secret setting.`);
  }
}

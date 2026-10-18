#!/usr/bin/env node
// ads-e2e: start the shared ADS test environment (real identity + mock providers) for a product.
import { spawn } from 'node:child_process';
import { existsSync, openSync, readFileSync } from 'node:fs';
import { appendFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_STATE_FILE, connectIdentity, envFromState, readState, waitForHealth, waitForState } from '../src/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const [command, ...argv] = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const flag = name => argv.includes(`--${name}`);
const list = v => String(v ?? '').split(',').map(s => s.trim()).filter(Boolean);
const stateFile = path.resolve(opt('state', DEFAULT_STATE_FILE()));

const usage = `ads-e2e <command>

  up        Start identity (real, PostgreSQL) + mock providers in the background.
            --database-url URL   identity database (or ADS_E2E_DATABASE_URL / DATABASE_URL)
            --identity-port 18084  --mocks-port 18090  --host 127.0.0.1  --issuer URL
            --foreground         stay attached (logs to the terminal; Ctrl-C stops)
  register-client  Register a product as a sign-in client.
            --id sample-web --redirect http://localhost:4100/[,more] [--name "Sample"]
            [--self-roles a,b] [--logout URL,...] [--personal false]
  env       Print the env vars a product needs.  [--client sample-web] [--format dotenv|shell|github]
  status    Show whether the environment is running.
  down      Stop it.

All commands accept --state FILE (default .ads-e2e/state.json, or ADS_E2E_STATE).`;

function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }

async function up() {
  if (existsSync(stateFile) && alive(readState(stateFile).pid)) {
    console.error(`already running (pid ${readState(stateFile).pid}); run ads-e2e down first`);
    process.exit(1);
  }
  const databaseUrl = opt('database-url', process.env.ADS_E2E_DATABASE_URL ?? process.env.DATABASE_URL);
  if (!databaseUrl) { console.error('ads-e2e up: --database-url (or ADS_E2E_DATABASE_URL) is required'); process.exit(2); }
  await rm(stateFile, { force: true });
  await mkdir(path.dirname(stateFile), { recursive: true });
  const args = [path.join(here, '../src/runner.mjs'), '--state', stateFile, '--database-url', databaseUrl,
    '--host', opt('host', '127.0.0.1'), '--identity-port', opt('identity-port', '18084'), '--mocks-port', opt('mocks-port', '18090'),
    ...(opt('issuer') ? ['--issuer', opt('issuer')] : []), ...(flag('no-mocks') ? ['--no-mocks'] : [])];
  if (flag('foreground')) {
    const child = spawn(process.execPath, args, { stdio: 'inherit' });
    child.on('exit', code => process.exit(code ?? 0));
    for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => child.kill('SIGTERM'));
    return;
  }
  const logFile = path.join(path.dirname(stateFile), 'ads-e2e.log');
  const out = openSync(logFile, 'a');
  const child = spawn(process.execPath, args, { detached: true, stdio: ['ignore', out, out] });
  child.unref();
  try {
    const state = await waitForState(stateFile, child);
    await waitForHealth(state.identity.url);
    if (state.mocks) await waitForHealth(state.mocks.url);
    console.log(`ADS test environment up (TEST MODE)\n  identity ${state.identity.url}\n  mocks    ${state.mocks?.url ?? '(off)'}\n  state    ${stateFile}\n  log      ${logFile}`);
  } catch (error) {
    console.error(`${error.message}\n--- ${logFile} ---\n${existsSync(logFile) ? readFileSync(logFile, 'utf8').slice(-4000) : ''}`);
    process.exit(1);
  }
}

async function down() {
  if (!existsSync(stateFile)) { console.log('not running'); return; }
  const { pid } = readState(stateFile);
  if (alive(pid)) {
    process.kill(pid, 'SIGTERM');
    for (let i = 0; i < 100 && alive(pid); i += 1) await new Promise(r => setTimeout(r, 100));
  }
  await rm(stateFile, { force: true });
  console.log('ADS test environment stopped');
}

async function env() {
  const state = readState(stateFile);
  const vars = envFromState(state, opt('client', process.env.ADS_IDENTITY_CLIENT_ID), stateFile);
  const format = opt('format', 'dotenv');
  const lines = Object.entries(vars).map(([k, v]) => (format === 'shell' ? `export ${k}=${JSON.stringify(String(v))}` : `${k}=${v}`));
  if (format === 'github') {
    if (!process.env.GITHUB_ENV) { console.error('GITHUB_ENV not set'); process.exit(2); }
    await appendFile(process.env.GITHUB_ENV, `${lines.join('\n')}\n`);
  }
  console.log(lines.join('\n'));
}

async function registerClient() {
  if (!opt('id') || !opt('redirect')) { console.error('register-client: --id and --redirect are required'); process.exit(2); }
  const harness = connectIdentity({ stateFile });
  try {
    const saved = await harness.registerClient({
      clientId: opt('id'), name: opt('name', opt('id')), redirectUris: list(opt('redirect')),
      postLogoutRedirectUris: opt('logout') ? list(opt('logout')) : undefined, selfRoles: list(opt('self-roles')), personal: opt('personal') !== 'false',
    });
    console.log(`client ${saved.clientId} registered: ${saved.redirectUris.join(', ')}`);
  } finally {
    await harness.close();
  }
}

async function status() {
  if (!existsSync(stateFile)) { console.log('not running'); process.exitCode = 1; return; }
  const state = readState(stateFile);
  console.log(alive(state.pid) ? `running (pid ${state.pid}) identity ${state.identity.url} mocks ${state.mocks?.url ?? '(off)'}` : 'stale state file (process gone); run ads-e2e down');
  if (!alive(state.pid)) process.exitCode = 1;
}

const commands = { up, down, env, status, 'register-client': registerClient };
if (!commands[command]) { console.log(usage); process.exit(command && command !== 'help' ? 2 : 0); }
await commands[command]();

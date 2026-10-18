// Long-running process behind `ads-e2e up` (and startIdentity({ mode: 'process' })):
// hosts the real identity service and the mock providers, then writes a state file that
// tests and `ads-e2e env` read.
import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateSigningKey, runIdentityInProcess } from './identity-runtime.mjs';
import { startMocks } from './index.mjs';

const argv = process.argv.slice(2);
const flag = name => argv.includes(`--${name}`);
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };

const stateFile = path.resolve(opt('state', '.ads-e2e/state.json'));
const host = opt('host', '127.0.0.1');
const databaseUrl = opt('database-url');
const withMocks = !flag('no-mocks');
const log = m => console.log(JSON.stringify({ service: 'ads-e2e', msg: m, ts: new Date().toISOString() }));

if (!databaseUrl) { console.error('ads-e2e runner: --database-url required'); process.exit(2); }
await mkdir(path.dirname(stateFile), { recursive: true });

const keyFile = path.resolve(opt('signing-key-file', path.join(path.dirname(stateFile), 'signing-key.pem')));
if (!existsSync(keyFile)) await writeFile(keyFile, generateSigningKey(), { mode: 0o600 });
const signingKeyPem = readFileSync(keyFile, 'utf8');
const kid = 'ads-e2e';

const mocks = withMocks ? await startMocks({ port: Number(opt('mocks-port', 18090)), host, webhookSecret: crypto.randomBytes(24).toString('hex') }) : null;
const mocksUrl = mocks?.url ?? opt('mocks-url', null);
const identityEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('ADS_E2E_IDENTITY_ENV_')).map(([k, v]) => [k.slice('ADS_E2E_IDENTITY_ENV_'.length), v]));
const identity = await runIdentityInProcess({ databaseUrl, host, port: Number(opt('identity-port', 18084)), issuer: opt('issuer'), signingKeyPem, kid, mocksUrl, env: identityEnv });

const state = {
  version: 1, ready: true, pid: process.pid, startedAt: new Date().toISOString(),
  identity: { url: identity.url, issuer: identity.issuer, jwksUrl: `${identity.url}/.well-known/jwks.json`, databaseUrl, kid, signingKeyFile: keyFile },
  mocks: mocks ? { url: mocks.url, webhookSecret: mocks.webhookSecret } : null,
};
await writeFile(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
log(`identity ${identity.url}${mocks ? ` mocks ${mocks.url}` : ''} (TEST MODE) state ${stateFile}`);

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await identity.stop().catch(() => {});
  if (mocks) await mocks.stop().catch(() => {});
  await rm(stateFile, { force: true });
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

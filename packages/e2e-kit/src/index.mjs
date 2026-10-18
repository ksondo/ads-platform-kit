import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHarness, uniqueEmail, uniquePassword } from './harness.mjs';
import { KIT_ROOT, generateSigningKey, runIdentityInProcess } from './identity-runtime.mjs';
import { createMocksClient } from './mocks-client.mjs';

export { createMocksClient, uniqueEmail, uniquePassword, generateSigningKey };
export { SIGNATURE_HEADER, signPayload, verifySignature as verifyWebhookSignature } from '../../../services/mocks/src/signature.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_STATE_FILE = () => path.resolve(process.env.ADS_E2E_STATE ?? '.ads-e2e/state.json');

export function freePort(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, host, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

async function waitForHealth(url, timeoutMs = 30_000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    try { if ((await fetch(`${url}/health`)).ok) return; } catch { /* not up yet */ }
    if (Date.now() > end) throw new Error(`e2e-kit: ${url}/health did not become ready`);
    await new Promise(r => setTimeout(r, 100));
  }
}

async function dropIdentitySchema(databaseUrl) {
  const pg = (await import('pg')).default;
  const admin = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try { await admin.query('DROP SCHEMA IF EXISTS platform CASCADE; DROP TABLE IF EXISTS public.ads_identity_migrations;'); } finally { await admin.end(); }
}

// Starts the mock providers in this process.
export async function startMocks({ port = 0, host = '127.0.0.1', webhookSecret = crypto.randomBytes(24).toString('hex'), defaultDelayMs } = {}) {
  const { createMocks } = await import(path.join(KIT_ROOT, 'services/mocks/src/server.mjs'));
  const mocks = createMocks({ webhookSecret, defaultDelayMs, log: { info() {}, warn() {}, error: m => console.error(m) } });
  await new Promise((resolve, reject) => { mocks.server.once('error', reject); mocks.server.listen(port, host, resolve); });
  const url = `http://${host}:${mocks.server.address().port}`;
  return {
    url, webhookSecret, mocks, client: createMocksClient(url, { webhookSecret }),
    async stop() { mocks.reset(); await new Promise(r => { mocks.server.close(() => r()); mocks.server.closeAllConnections?.(); }); },
  };
}

// Migrates and starts the real identity service, returning the test harness.
//   mode: 'in-process' (default) or 'process' (a child Node process).
export async function startIdentity({ databaseUrl, port = 0, host = '127.0.0.1', issuer, mode = 'in-process', mocksUrl = null, webhookSecret = null, signingKeyPem = generateSigningKey(), kid = 'ads-e2e', env = {}, resetDatabase = false } = {}) {
  if (!databaseUrl) throw new Error('startIdentity: databaseUrl is required');
  if (resetDatabase) await dropIdentitySchema(databaseUrl);
  const listenPort = port || await freePort(host);
  if (mode === 'in-process') {
    const rt = await runIdentityInProcess({ databaseUrl, host, port: listenPort, issuer, signingKeyPem, kid, mocksUrl, env });
    return createHarness({ url: rt.url, issuer: rt.issuer, databaseUrl, signingKeyPem, kid, mocksUrl, webhookSecret, outbox: rt.outbox, stop: rt.stop });
  }
  if (mode !== 'process') throw new Error(`startIdentity: unknown mode ${mode}`);
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ads-e2e-'));
  const keyFile = path.join(dir, 'signing-key.pem');
  await writeFile(keyFile, signingKeyPem, { mode: 0o600 });
  const stateFile = path.join(dir, 'state.json');
  const child = spawn(process.execPath, [path.join(here, 'runner.mjs'), '--state', stateFile, '--database-url', databaseUrl, '--host', host,
    '--identity-port', String(listenPort), '--signing-key-file', keyFile, '--no-mocks', ...(issuer ? ['--issuer', issuer] : []), ...(mocksUrl ? ['--mocks-url', mocksUrl] : [])],
  { stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, ...Object.fromEntries(Object.entries(env).map(([k, v]) => [`ADS_E2E_IDENTITY_ENV_${k}`, v])) } });
  const exited = new Promise(r => child.once('exit', r));
  const state = await waitForState(stateFile, child);
  const harness = createHarness({
    url: state.identity.url, issuer: state.identity.issuer, databaseUrl, signingKeyPem, kid: state.identity.kid, mocksUrl, webhookSecret,
    stop: async () => { child.kill('SIGTERM'); await exited; await rm(dir, { recursive: true, force: true }); },
  });
  harness.process = child;
  return harness;
}

async function waitForState(stateFile, child, timeoutMs = 30_000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    if (child && child.exitCode !== null) throw new Error(`e2e-kit: identity process exited with code ${child.exitCode}`);
    if (existsSync(stateFile)) {
      const state = JSON.parse(readFileSync(stateFile, 'utf8'));
      if (state.ready) return state;
    }
    if (Date.now() > end) throw new Error('e2e-kit: timed out waiting for the identity process');
    await new Promise(r => setTimeout(r, 100));
  }
}

export function readState(stateFile = DEFAULT_STATE_FILE()) {
  if (!existsSync(stateFile)) throw new Error(`e2e-kit: no running environment (${stateFile}). Run: npx ads-e2e up`);
  return JSON.parse(readFileSync(stateFile, 'utf8'));
}

// Connects to the environment started by `ads-e2e up` (reads its state file).
export function connectIdentity({ stateFile = DEFAULT_STATE_FILE() } = {}) {
  const state = readState(stateFile);
  return createHarness({
    url: state.identity.url, issuer: state.identity.issuer, databaseUrl: state.identity.databaseUrl, kid: state.identity.kid,
    signingKeyPem: readFileSync(state.identity.signingKeyFile, 'utf8'), mocksUrl: state.mocks?.url ?? null, webhookSecret: state.mocks?.webhookSecret ?? null,
  });
}

// Synchronous: the env vars a product needs, for use in playwright.config (webServer.env).
export function loadE2eEnv({ stateFile = DEFAULT_STATE_FILE(), clientId = process.env.ADS_IDENTITY_CLIENT_ID } = {}) {
  const state = readState(stateFile);
  return envFromState(state, clientId, stateFile);
}

export function envFromState(state, clientId, stateFile) {
  return {
    OIDC_ISSUER: state.identity.issuer,
    OIDC_AUDIENCE: clientId ?? '',
    OIDC_JWKS_URL: state.identity.jwksUrl,
    ADS_IDENTITY_URL: state.identity.url,
    ADS_IDENTITY_CLIENT_ID: clientId ?? '',
    ...(state.mocks ? { ADS_MOCKS_URL: state.mocks.url, ADS_MOCKS_WEBHOOK_SECRET: state.mocks.webhookSecret } : {}),
    ADS_E2E_STATE: stateFile,
  };
}

export { waitForHealth, waitForState };

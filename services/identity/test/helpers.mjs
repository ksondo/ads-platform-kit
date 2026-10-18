import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadConfig } from '../src/config.mjs';
import { migrate } from '../src/db.mjs';
import { loadSigningKey } from '../src/keys.mjs';
import { createMailer } from '../src/mailer.mjs';
import { createApp } from '../src/server.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://kit:kit@127.0.0.1:5432/kit_test';
const quiet = { info() {}, warn() {}, error(m) { if (process.env.DEBUG) console.error(m); } };

// Test servers listen on a random free port, or, when ADS_TEST_PORT_RANGE=from-to is set (shared
// build machines), on the first free port in that range.
export async function listenForTest(server, host = '127.0.0.1') {
  const range = String(process.env.ADS_TEST_PORT_RANGE ?? '').match(/^(\d+)-(\d+)$/);
  const tryPort = port => new Promise((resolve, reject) => {
    const onError = error => { server.off('listening', onListening); reject(error); };
    const onListening = () => { server.off('error', onError); resolve(); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
  if (!range) return tryPort(0);
  for (let port = Number(range[1]); port <= Number(range[2]); port += 1) {
    try { return await tryPort(port); } catch (error) { if (error.code !== 'EADDRINUSE') throw error; }
  }
  throw new Error(`no free port in ADS_TEST_PORT_RANGE ${range[0]}`);
}

// Starts a fresh identity service against a clean database. Google is replaced by a stub.
export async function startService({ env = {}, google } = {}) {
  const admin = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  await admin.query('DROP SCHEMA IF EXISTS platform CASCADE; DROP TABLE IF EXISTS public.ads_identity_migrations;');
  await admin.end();
  const config = loadConfig({
    IDENTITY_PUBLIC_URL: 'http://127.0.0.1:0', IDENTITY_DEV_MODE: 'true', DATABASE_URL, MAIL_TRANSPORT: 'memory',
    GOOGLE_CLIENT_ID: google ? 'google-test' : '', GOOGLE_CLIENT_SECRET: google ? 'secret' : '', ...env,
  });
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });
  await migrate(pool, quiet);
  const keys = await loadSigningKey(config, quiet);
  const mailer = createMailer(config, quiet);
  const app = createApp({ config, pool, keys, mailer, google, log: quiet, sdkPath: path.resolve(here, '../../../packages/identity-client/ads-identity.js') });
  await listenForTest(app.server);
  const base = `http://127.0.0.1:${app.server.address().port}`;
  // The issuer must match the address tokens are fetched from in tests.
  config.publicUrl = base;
  config.issuer = base;
  return {
    base, config, pool, keys, mailer, app,
    async stop() { await new Promise(r => app.server.close(r)); await pool.end(); },
  };
}

// A tiny browser: keeps cookies, does not follow redirects automatically.
export function browser(base) {
  const jar = new Map();
  const store = res => {
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i);
      const value = pair.slice(i + 1);
      if (/Max-Age=0/i.test(line) || value === '') jar.delete(name); else jar.set(name, value);
    }
  };
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  return {
    jar,
    async get(url, headers = {}) {
      const res = await fetch(new URL(url, base), { redirect: 'manual', headers: { cookie: cookieHeader(), accept: 'text/html', ...headers } });
      store(res);
      return { res, status: res.status, location: res.headers.get('location'), text: await res.text() };
    },
    async post(url, form, headers = {}) {
      const res = await fetch(new URL(url, base), {
        method: 'POST', redirect: 'manual', body: new URLSearchParams(form).toString(),
        headers: { cookie: cookieHeader(), accept: 'text/html', 'content-type': 'application/x-www-form-urlencoded', ...headers },
      });
      store(res);
      return { res, status: res.status, location: res.headers.get('location'), text: await res.text() };
    },
  };
}

export const csrfFrom = html => (html.match(/name="csrf" value="([^"]+)"/) ?? [])[1];
export const reqFrom = url => new URL(url, 'http://x').searchParams.get('req');
export const linkFrom = (mail, pathname) => {
  const m = mail.text.match(new RegExp(`https?://[^\\s]+${pathname}\\?[^\\s]+`));
  return m ? m[0] : null;
};

export function pkce() {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export async function registerClient(pool, { id = 'health-web', redirect = 'https://health.example.test/app/', selfRoles = ['patient'], personal = true } = {}) {
  await pool.query(`INSERT INTO platform.oauth_clients(client_id,display_name,redirect_uris,post_logout_redirect_uris,self_service_roles,allow_personal_workspace)
    VALUES ($1,$2,$3,$4,$5,$6)`, [id, `ADS ${id}`, [redirect], ['https://health.example.test/'], selfRoles, personal]);
  return { id, redirect };
}

// Mirrors verifiedClaims() in the ADS product repos (e.g. health src/private/identity.mjs).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function productVerifiedClaims(c) {
  if (!c || typeof c.sub !== 'string' || !c.sub.trim() || c.sub.length > 200 || typeof c.tenant_id !== 'string' || !UUID.test(c.tenant_id)
    || !Array.isArray(c.roles) || c.roles.some(r => typeof r !== 'string' || r.length > 80)) throw Error('INVALID_VERIFIED_CLAIMS');
  return { tenantId: c.tenant_id, actorId: c.sub, roles: c.roles };
}

// Mail is sent just after the response; wait for the next message to an address.
export async function nextMail(svc, to, after = 0) {
  for (let i = 0; i < 100; i += 1) {
    const found = svc.mailer.outbox.filter(m => m.to === to);
    if (found.length > after) return found.at(-1);
    await new Promise(r => setTimeout(r, 10));
  }
  throw new Error(`no mail to ${to}`);
}
export const mailCount = (svc, to) => svc.mailer.outbox.filter(m => m.to === to).length;

// Opens an activation link and confirms it with the registration password.
export async function activate(b, link, password) {
  const page = await b.get(link);
  const token = new URL(link).searchParams.get('token');
  return b.post('/verify-email', { csrf: csrfFrom(page.text), token, password, req: new URL(link).searchParams.get('req') ?? '' });
}

// Signs a user in through the hosted pages and exchanges the code: { access_token, refresh_token, ... }.
export async function signInTokens(svc, client, { email, password, b = browser(svc.base), extra = {} }) {
  const { verifier, challenge } = pkce();
  const q = new URLSearchParams({ response_type: 'code', client_id: client.id, redirect_uri: client.redirect, state: 'st', code_challenge: challenge, code_challenge_method: 'S256', ...extra });
  const auth = await b.get(`/authorize?${q}`);
  let location = auth.location;
  if (location.startsWith('/login')) {
    const page = await b.get(location);
    location = (await b.post('/login', { csrf: csrfFrom(page.text), req: reqFrom(location), email, password })).location;
  }
  if (!location?.startsWith(client.redirect)) throw new Error(`signInTokens: not redirected back (${location})`);
  const res = await fetch(`${svc.base}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: new URL(location).searchParams.get('code'), code_verifier: verifier, client_id: client.id, redirect_uri: client.redirect }) });
  if (res.status !== 200) throw new Error(`signInTokens: token exchange ${res.status}`);
  return res.json();
}

export async function refreshWith(svc, clientId, token) {
  const res = await fetch(`${svc.base}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: token, client_id: clientId }) });
  return { status: res.status, body: await res.json() };
}

// An active user with a known password, created directly (test setup only).
export async function createActiveUser(pool, email, password) {
  const { hashPassword } = await import('../src/security.mjs');
  const id = crypto.randomUUID();
  await pool.query("INSERT INTO platform.users(id,email,password_hash,status,email_verified_at) VALUES ($1,$2,$3,'active',now())", [id, email, await hashPassword(password)]);
  return { id, email, password };
}

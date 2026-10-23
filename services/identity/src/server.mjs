import http from 'node:http';
import crypto from 'node:crypto';
import nodePath from 'node:path';
import { readFile } from 'node:fs/promises';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { createAccounts } from './accounts.mjs';
import { TOKEN_EXCHANGE, createAdmin } from './admin.mjs';
import { renderAdminPage } from './admin-page.mjs';
import { createLegacyApi } from './legacy.mjs';
import { createOAuth } from './oauth.mjs';
import { langOf, pickLocale, renderPage } from './pages.mjs';
import { createSandboxRoutes } from './sandbox-routes.mjs';
import { createSandboxes, openDemoPool } from './sandboxes.mjs';
import { HttpError, RateLimiter, cookie, fail, isEmail, normalizeEmail, parseCookies, randomToken, sha256, signValue, unsignValue } from './security.mjs';

const MINUTE = 60_000;
const BODY_LIMIT = 16 * 1024;

export function createApp({ config, pool, keys, mailer, google, log = console, sdkPath, limiter = new RateLimiter(), demoPool = null, sandboxFetch = fetch, sandboxWait }) {
  async function audit(eventType, { userId = null, tenantId = null, projectId = null, outcome, reason = null, ip = null, clientId = null, metadata = {} }, db = pool) {
    await db.query(`INSERT INTO platform.identity_audit(event_type,user_id,tenant_id,project_id,outcome,reason,metadata,ip,client_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`, [eventType, userId, tenantId, projectId, outcome, reason, JSON.stringify(metadata), ip, clientId]);
  }
  const accounts = createAccounts({ pool, config, mailer, audit, log });
  const oauth = createOAuth({ pool, config, keys, audit });
  const legacy = createLegacyApi({ pool, config, accounts, audit });
  const localJwks = createLocalJWKSet(keys.jwks);
  const admin = createAdmin({ pool, config, keys, jwks: localJwks, audit, mailer, log });
  // BRIEF18 personal demo sandboxes (demo environment only). The demo pool connects with ads.demo_mode=on.
  const sandboxOn = Boolean(config.demo.enabled && config.sandbox?.enabled);
  const ownDemoPool = sandboxOn && !demoPool;
  const sandboxPool = sandboxOn ? demoPool ?? openDemoPool(config.databaseUrl) : null;
  const sandboxes = createSandboxes({ pool, demoPool: sandboxPool, demo: config.demo, sandbox: config.sandbox ?? { enabled: false }, hashKey: config.cookieSecret,
    mailer, oauth, jwks: localJwks, issuer: () => config.issuer, log, fetchImpl: sandboxFetch, wait: sandboxWait, minPasswordLength: config.passwordMinLength });

  // ---------- helpers ----------
  // Where to go after signing in without a product: only our own admin and invitation pages.
  const safeNext = v => (typeof v === 'string' && (/^\/admin(\?[A-Za-z0-9=&%._-]{0,300})?$/.test(v) || /^\/invite\?token=[A-Za-z0-9_-]{20,100}$/.test(v)) ? v : null);
  // Behind a proxy, only the address appended by our own proxy is trustworthy: the right-most
  // entry (or N-th from the right with several proxies). Left-most entries are client-controlled.
  const clientIp = req => {
    if (config.trustProxy) {
      const hops = config.trustedProxyHops;
      const parts = String(req.headers['x-forwarded-for'] ?? '').split(',').map(p => p.trim()).filter(Boolean);
      if (parts.length >= hops) return parts[parts.length - hops].slice(0, 64);
    }
    return String(req.socket.remoteAddress ?? '').slice(0, 64);
  };
  // Rate-limit keys for emails: validated, normalised and hashed so keys stay small.
  const emailKey = email => {
    const normalized = normalizeEmail(email);
    return isEmail(normalized) ? sha256(normalized) : 'invalid';
  };
  // Cookie names: the __Host- prefix (https only) stops sibling subdomains from planting cookies.
  const C = config.secureCookies
    ? { sso: '__Host-ads_sso', csrf: '__Host-ads_csrf', gstate: '__Host-ads_gstate', areq: '__Host-ads_areq' }
    : { sso: 'ads_sso', csrf: 'ads_csrf', gstate: 'ads_gstate', areq: 'ads_areq' };

  const readBody = req => new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > BODY_LIMIT) { reject(new HttpError(413, 'BODY_TOO_LARGE')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const type = String(req.headers['content-type'] ?? '');
      try {
        if (!raw) return resolve({});
        if (type.includes('application/json')) return resolve(JSON.parse(raw));
        return resolve(Object.fromEntries(new URLSearchParams(raw)));
      } catch {
        reject(new HttpError(400, 'INVALID_BODY'));
      }
    });
    req.on('error', reject);
  });

  function baseHeaders(res, nonce, { demo = false } = {}) {
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('cross-origin-opener-policy', 'same-origin');
    if (config.secureCookies) res.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains');
    // form-action also governs the redirect back to the product after a form post, so allow https targets.
    // The demo sign-in panel adds its one nonce'd script ("Use demo account") and the landing fonts.
    const demoCsp = demo ? `; script-src 'nonce-${nonce}'; font-src https://fonts.gstatic.com` : '';
    const styles = demo ? `'nonce-${nonce}' https://fonts.googleapis.com` : `'nonce-${nonce}'`;
    res.setHeader('content-security-policy', `default-src 'none'; style-src ${styles}; img-src https: data:; form-action 'self' https:${config.devMode ? ' http:' : ''}; frame-ancestors 'none'; base-uri 'none'${demoCsp}`);
  }
  const json = (res, status, body, extra = {}) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...extra });
    res.end(JSON.stringify(body));
  };
  const redirect = (res, location) => { res.writeHead(302, { location }); res.end(); };

  const addCookie = (res, value) => {
    const prev = res.getHeader('set-cookie');
    res.setHeader('set-cookie', [...(Array.isArray(prev) ? prev : prev ? [prev] : []), value]);
  };

  // CSRF: double-submit token, signed cookie + hidden form field.
  function csrfToken(req, res) {
    const existing = unsignValue(parseCookies(req.headers.cookie)[C.csrf], config.cookieSecret);
    if (existing) return existing;
    const value = randomToken(18);
    addCookie(res, cookie(C.csrf, signValue(value, config.cookieSecret), { secure: config.secureCookies, maxAge: 7200 }));
    return value;
  }
  function checkCsrf(req, form) {
    const expected = unsignValue(parseCookies(req.headers.cookie)[C.csrf], config.cookieSecret);
    if (!expected || typeof form.csrf !== 'string' || form.csrf !== expected) fail(400, 'FORM_EXPIRED');
  }

  async function currentSso(req) {
    const raw = unsignValue(parseCookies(req.headers.cookie)[C.sso], config.cookieSecret);
    if (!raw) return null;
    const row = (await pool.query(`SELECT s.id,s.user_id,u.email,u.status,u.is_demo FROM platform.sso_sessions s JOIN platform.users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()`, [sha256(raw)])).rows[0];
    if (!row || row.status !== 'active') return null;
    if (row.is_demo && !config.demo.enabled) return null;
    return { id: row.id, user: { id: row.user_id, email: row.email } };
  }
  // locale: the language of this sign-in (page choice or the product's ui_locales), carried in the
  // `locale` token claim. It is never written to the account (shared demo accounts keep no language).
  async function startSso(req, res, user, method, locale = null) {
    const previous = unsignValue(parseCookies(req.headers.cookie)[C.sso], config.cookieSecret);
    if (previous) await pool.query('UPDATE platform.sso_sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL', [sha256(previous)]);
    const raw = randomToken(32);
    const id = crypto.randomUUID();
    await pool.query('INSERT INTO platform.sso_sessions(id,user_id,token_hash,method,expires_at,locale) VALUES ($1,$2,$3,$4,now()+make_interval(secs => $5),$6)',
      [id, user.id, sha256(raw), method, config.ssoSessionTtl, langOf(locale)]);
    addCookie(res, cookie(C.sso, signValue(raw, config.cookieSecret), { secure: config.secureCookies, maxAge: config.ssoSessionTtl }));
    return { id, user };
  }

  // Sign-in requests are bound to the browser that started them, so a link with someone else's
  // request id cannot be used to make a victim complete an attacker's sign-in.
  function bindAuthRequest(req, res, id) {
    const current = (unsignValue(parseCookies(req.headers.cookie)[C.areq], config.cookieSecret) ?? '').split('~').filter(Boolean);
    const ids = [id, ...current.filter(x => x !== id)].slice(0, 5).join('~');
    addCookie(res, cookie(C.areq, signValue(ids, config.cookieSecret), { secure: config.secureCookies, maxAge: config.authRequestTtl }));
  }
  function isBound(req, id) {
    const current = (unsignValue(parseCookies(req.headers.cookie)[C.areq], config.cookieSecret) ?? '').split('~');
    return Boolean(id) && current.includes(id);
  }

  // Demo credentials on the sign-in page: demo mode + DEMO_SHOW_CREDENTIALS=1, demo USER only.
  const demoShown = config.demo.showCredentials ? { email: config.demo.accounts.user.email, password: config.demo.shownPassword } : null;

  // BRIEF16: the demo personas of the product the tester came from (written by demo-orgs/demo-reset),
  // under the same rule, and only when the persona password is configured. Cached briefly per product.
  const personaCache = new Map();
  async function personasFor(clientId) {
    if (!config.demo.showCredentials || !config.demo.shownPersonaPassword || !clientId) return null;
    const hit = personaCache.get(clientId);
    if (hit && Date.now() - hit.at < 30_000) return hit.value;
    const list = (await pool.query(`SELECT p.persona_key AS key, p.label, p.hint, u.email FROM platform.demo_personas p
      JOIN platform.users u ON u.id=p.user_id AND u.is_demo AND u.status='active'
      WHERE p.client_id=$1 AND p.demo_set='' ORDER BY p.position, p.persona_key`, [clientId])).rows;
    const value = list.length ? { password: config.demo.shownPersonaPassword, list } : null;
    personaCache.set(clientId, { at: Date.now(), value });
    return value;
  }

  function page(req, res, view, ctx = {}, status = 200) {
    const nonce = randomToken(12);
    const demo = view === 'login' ? demoShown : null;
    const personas = view === 'login' ? ctx.personas ?? null : null;
    baseHeaders(res, nonce, { demo: Boolean(demo || personas) });
    // The page's own choice (?lang=), then the product's (ui_locales, kept on the sign-in request), then the browser.
    const locale = ctx.locale ?? pickLocale(ctx.lang ?? ctx.authRequest?.locale, req.headers['accept-language']);
    const body = renderPage(view, {
      locale, nonce, client: ctx.authRequest?.client ?? ctx.client ?? null, req: ctx.authRequest?.id ?? ctx.req ?? null,
      csrf: csrfToken(req, res), error: ctx.error, values: ctx.values, googleEnabled: config.google.enabled,
      minPassword: config.passwordMinLength, path: ctx.path ?? safePath(new URL(req.url, 'http://x').pathname), next: safeNext(ctx.next), demo, personas,
      sandboxSignup: sandboxOn && view === 'login',
    });
    res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
  }

  // After a successful sign-in: pick the workspace and send the user back to the product.
  async function finishSignIn(req, res, authRequest, sso, chosenTenant, next) {
    if (!authRequest) {
      if (safeNext(next)) return redirect(res, safeNext(next));
      return page(req, res, 'signed_in', { values: { email: sso.user.email } });
    }
    // A personal demo sandbox owner lands in their sandbox's organisation for this product, or, where
    // they hold no role there, as the product's first persona of the same sandbox (BRIEF18).
    const landing = chosenTenant ? null : await sandboxRoutes.landingFor(sso, authRequest);
    if (landing) return redirect(res, await oauth.issueCode(authRequest, { id: landing.userId }, landing.tenantId, sso.id));
    const result = await oauth.resolveWorkspace(sso.user, authRequest, chosenTenant);
    if (result.choose) return page(req, res, 'choose_workspace', { authRequest, values: { workspaces: result.choose } });
    if (result.noAccess) {
      await audit('authorize', { userId: sso.user.id, outcome: 'denied', reason: 'NO_PRODUCT_ACCESS', clientId: authRequest.client_id, ip: clientIp(req) });
      return page(req, res, 'no_access', { authRequest }, 403);
    }
    return redirect(res, await oauth.issueCode(authRequest, sso.user, result.tenantId, sso.id));
  }

  // CORS for the token endpoints: only origins of registered product return addresses.
  let originCache = { at: 0, set: new Set() };
  async function allowedOrigin(origin) {
    if (!origin) return false;
    if (Date.now() - originCache.at > MINUTE) {
      const rows = (await pool.query("SELECT redirect_uris FROM platform.oauth_clients WHERE status='active'")).rows;
      const set = new Set();
      for (const r of rows) for (const u of r.redirect_uris) { try { set.add(new URL(u).origin); } catch { /* ignore bad rows */ } }
      originCache = { at: Date.now(), set };
    }
    return originCache.set.has(origin);
  }
  async function cors(req, res) {
    const origin = req.headers.origin;
    if (await allowedOrigin(origin)) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'Origin');
      res.setHeader('access-control-allow-methods', 'POST, GET, OPTIONS');
      res.setHeader('access-control-allow-headers', 'content-type, authorization');
      res.setHeader('access-control-max-age', '600');
    }
  }

  const KNOWN_PAGES = new Set(['/login', '/register', '/forgot-password', '/logout']);
  const safePath = p => (KNOWN_PAGES.has(p) ? p : '/login');

  const invitePageValues = (invitation, token, sso) => ({
    token, invitation: { organizationName: invitation.organization_name, productName: invitation.product_name, email: invitation.email, roles: invitation.roles },
    signedInEmail: sso?.user.email ?? null, matches: Boolean(sso && normalizeEmail(sso.user.email) === invitation.email),
  });

  async function adminPage(req, res, sso, q) {
    const workspaces = await admin.adminWorkspaces(sso.user.id);
    const ws = workspaces.find(w => w.tenantId === q.tenant) ?? workspaces[0];
    const locale = pickLocale(q.lang, req.headers['accept-language']);
    const nonce = randomToken(12);
    baseHeaders(res, nonce);
    const csrf = csrfToken(req, res);
    let ctx = { locale, nonce, csrf, user: sso.user, workspaces, products: [], done: q.done, error: q.error };
    if (ws) {
      const all = (await pool.query("SELECT client_id, display_name, assignable_roles, admin_roles FROM platform.oauth_clients WHERE status='active' ORDER BY display_name")).rows;
      const products = ws.orgAdmin ? all : all.filter(p => ws.productAdmin.includes(p.client_id));
      const client = products.find(p => p.client_id === q.product) ?? products[0];
      ctx = { ...ctx, products, client, current: { tenantId: ws.tenantId, clientId: client?.client_id ?? '', orgAdmin: ws.orgAdmin } };
      if (client) {
        const actx = { actorId: sso.user.id, tenantId: ws.tenantId, clientId: client.client_id, via: 'page', ip: clientIp(req) };
        ctx.members = await admin.listMembers(actx);
        ctx.invitations = await admin.listInvitations(actx);
      }
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(renderAdminPage(ctx));
  }

  let sdkCache = null;
  const sandboxRoutes = createSandboxRoutes({ config, sandboxes, oauth, limiter, sdkDir: nodePath.dirname(sdkPath ?? ''), helpers: {
    readBody, json, redirect, csrfToken, checkCsrf, currentSso, startSso, cors, finishSignIn } });

  // ---------- routes ----------
  async function route(req, res) {
    const url = new URL(req.url, config.publicUrl);
    const path = url.pathname;
    const q = Object.fromEntries(url.searchParams);
    const ip = clientIp(req);
    const method = req.method;

    if (method === 'GET' && path === '/health') {
      await pool.query('SELECT 1');
      return json(res, 200, { status: 'ok', service: 'ads-identity', backend: 'postgresql' }, { 'cache-control': 'no-store' });
    }
    if (method === 'GET' && path === '/.well-known/jwks.json') {
      return json(res, 200, keys.jwks, { 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' });
    }
    if (method === 'GET' && path === '/.well-known/openid-configuration') {
      return json(res, 200, {
        issuer: config.issuer, authorization_endpoint: `${config.publicUrl}/authorize`, token_endpoint: `${config.publicUrl}/token`,
        jwks_uri: `${config.publicUrl}/.well-known/jwks.json`, userinfo_endpoint: `${config.publicUrl}/userinfo`, revocation_endpoint: `${config.publicUrl}/revoke`,
        end_session_endpoint: `${config.publicUrl}/logout`, response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token', TOKEN_EXCHANGE],
        code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
        access_token_signing_alg_values_supported: ['RS256'], claims_supported: ['sub', 'tenant_id', 'roles', 'email', 'email_verified', 'name', 'locale', 'demo', 'ads_staff', 'demo_sandbox', 'demo_sandbox_owner'],
        ui_locales_supported: ['en', 'fr'],
      }, { 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' });
    }
    if (method === 'GET' && path === '/sdk/ads-identity.js') {
      sdkCache ??= await readFile(sdkPath, 'utf8');
      res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff', 'access-control-allow-origin': '*' });
      return res.end(sdkCache);
    }

    // ----- personal demo sandboxes (BRIEF18; demo environment only) -----
    if (await sandboxRoutes.handle(req, res, { path, method, q, ip, loadBoundRequest: id => (isBound(req, id) ? oauth.loadAuthRequest(id) : null) })) return;

    // ----- product sign-in (OAuth 2.0 + PKCE) -----
    if (method === 'GET' && path === '/authorize') {
      limiter.enforce(`authorize-ip:${ip}`, 60, MINUTE);
      const asked = langOf(q.lang) ?? langOf(q.ui_locales);
      const locale = asked ?? pickLocale(null, req.headers['accept-language']);
      const { id } = await oauth.createAuthRequest(q, locale);
      const authRequest = await oauth.loadAuthRequest(id);
      bindAuthRequest(req, res, id);
      const sso = q.prompt === 'login' ? null : await currentSso(req);
      if (sso) {
        // Already signed in: the product's language choice applies to this sign-in.
        if (asked) await pool.query('UPDATE platform.sso_sessions SET locale=$2 WHERE id=$1', [sso.id, asked]);
        return finishSignIn(req, res, authRequest, sso);
      }
      if (q.prompt === 'none') {
        const back = new URL(authRequest.redirect_uri);
        back.searchParams.set('error', 'login_required');
        back.searchParams.set('state', authRequest.state);
        return redirect(res, back.toString());
      }
      return redirect(res, `/${q.screen === 'register' ? 'register' : 'login'}?req=${encodeURIComponent(id)}`);
    }

    const authRequestFrom = async source => {
      if (!source.req) return null;
      if (!isBound(req, source.req)) return null;
      const found = await oauth.loadAuthRequest(source.req);
      if (!found) fail(400, 'SIGN_IN_REQUEST_EXPIRED');
      return found;
    };
    const boundRequest = async id => (isBound(req, id) ? oauth.loadAuthRequest(id) : null);

    if (method === 'GET' && (path === '/login' || path === '/' )) {
      const authRequest = await authRequestFrom(q);
      return page(req, res, 'login', { authRequest, lang: q.lang, next: q.next, personas: await personasFor(authRequest?.client_id) });
    }
    if (method === 'POST' && path === '/login') {
      const form = await readBody(req);
      const authRequest = await authRequestFrom(form);
      const next = safeNext(form.next);
      const ctx = { authRequest, lang: form.lang, values: { email: form.email }, next, personas: await personasFor(authRequest?.client_id) };
      try {
        checkCsrf(req, form);
        const email = normalizeEmail(form.email);
        limiter.enforce(`login-ip:${ip}`, config.limits.loginPerIp, 15 * MINUTE);
        limiter.enforce(`login-email:${emailKey(email)}`, config.limits.loginPerEmail, 15 * MINUTE);
        let user;
        try {
          user = await accounts.authenticate({ email, password: form.password, ip, clientId: authRequest?.client_id });
        } catch (error) {
          // Right password but email not yet confirmed: send a fresh activation link for that registration.
          if (error instanceof HttpError && error.code === 'EMAIL_NOT_VERIFIED' && error.details?.user
            && limiter.hit(`email:${emailKey(email)}`, config.limits.emailPerAddress, 60 * MINUTE).allowed) {
            await accounts.sendVerification(error.details.user, { passwordHash: error.details.passwordHash, req: authRequest?.id, product: authRequest?.client?.display_name, next });
          }
          throw error;
        }
        limiter.reset(`login-email:${emailKey(email)}`);
        // The language the page was in wins (kept on the sign-in request for the next pages and the token).
        const lang = langOf(form.lang) ?? authRequest?.locale;
        if (authRequest && lang && lang !== authRequest.locale) {
          await pool.query('UPDATE platform.auth_requests SET locale=$2 WHERE id=$1', [authRequest.id, lang]);
          authRequest.locale = lang;
        }
        const sso = await startSso(req, res, user, 'password', lang ?? pickLocale(null, req.headers['accept-language']));
        await audit('login', { userId: user.id, outcome: 'allowed', reason: 'password', ip, clientId: authRequest?.client_id });
        return finishSignIn(req, res, authRequest, sso, undefined, next);
      } catch (error) {
        if (error instanceof HttpError) return page(req, res, 'login', { ...ctx, error: error.code }, error.status === 429 ? 429 : 400);
        throw error;
      }
    }

    if (method === 'GET' && path === '/register') {
      // Coming from an invitation: start with the invited email address.
      const next = safeNext(q.next);
      const invited = next?.startsWith('/invite?') ? await admin.findInvitation(new URL(next, 'http://x').searchParams.get('token')) : null;
      return page(req, res, 'register', { authRequest: await authRequestFrom(q), lang: q.lang ?? invited?.locale, next, values: { email: invited?.email } });
    }
    if (method === 'POST' && path === '/register') {
      const form = await readBody(req);
      const authRequest = await authRequestFrom(form);
      const locale = pickLocale(form.lang, req.headers['accept-language'], authRequest?.locale);
      const next = safeNext(form.next);
      const ctx = { authRequest, lang: form.lang, values: { email: form.email, name: form.name }, next };
      try {
        checkCsrf(req, form);
        limiter.enforce(`register-ip:${ip}`, config.limits.registerPerIp, 60 * MINUTE);
        if (String(form.password ?? '') !== String(form.confirm ?? '')) fail(400, 'PASSWORDS_DO_NOT_MATCH');
        limiter.enforce(`email:${emailKey(form.email)}`, config.limits.emailPerAddress, 60 * MINUTE);
        const { user } = await accounts.register({ email: form.email, password: form.password, name: form.name, locale, product: authRequest?.client?.display_name, req: authRequest?.id, ip, clientId: authRequest?.client_id, next });
        if (user.status === 'active' && !config.requireEmailVerification) {
          const back = new URLSearchParams({ ...(authRequest ? { req: authRequest.id } : {}), ...(next ? { next } : {}) }).toString();
          return redirect(res, `/login${back ? `?${back}` : ''}`);
        }
        return page(req, res, 'check_email', { ...ctx, values: { email: normalizeEmail(form.email) } });
      } catch (error) {
        if (error instanceof HttpError) return page(req, res, 'register', { ...ctx, error: error.code }, error.status === 429 ? 429 : 400);
        throw error;
      }
    }
    if (method === 'GET' && path === '/verify-email') {
      // Opening the link does not activate anything by itself (mail scanners open links too).
      const authRequest = await boundRequest(q.req);
      if (!(await accounts.checkVerifyToken(q.token))) return page(req, res, 'link_invalid', { authRequest, lang: q.lang, values: { retry: '/login' } }, 400);
      return page(req, res, 'activate', { authRequest, lang: q.lang, values: { token: q.token }, next: q.next });
    }
    if (method === 'POST' && path === '/verify-email') {
      const form = await readBody(req);
      const authRequest = await boundRequest(form.req);
      const next = safeNext(form.next);
      const ctx = { authRequest, lang: form.lang, values: { token: form.token }, next };
      try {
        checkCsrf(req, form);
        limiter.enforce(`activate-ip:${ip}`, config.limits.loginPerIp, 15 * MINUTE);
        limiter.enforce(`activate-token:${sha256(String(form.token ?? ''))}`, 10, 15 * MINUTE);
        const user = await accounts.activate({ token: String(form.token ?? ''), password: form.password, ip });
        const sso = await startSso(req, res, user, 'password', langOf(form.lang) ?? authRequest?.locale);
        return finishSignIn(req, res, authRequest, sso, undefined, next);
      } catch (error) {
        if (error instanceof HttpError && error.code === 'LINK_INVALID') return page(req, res, 'link_invalid', { ...ctx, values: { retry: '/login' } }, 400);
        if (error instanceof HttpError) return page(req, res, 'activate', { ...ctx, error: error.code }, error.status === 429 ? 429 : 400);
        throw error;
      }
    }

    if (method === 'GET' && path === '/forgot-password') {
      return page(req, res, 'forgot', { authRequest: await boundRequest(q.req), lang: q.lang });
    }
    if (method === 'POST' && path === '/forgot-password') {
      const form = await readBody(req);
      const authRequest = await boundRequest(form.req);
      const ctx = { authRequest, lang: form.lang, values: { email: form.email } };
      try {
        checkCsrf(req, form);
        const email = normalizeEmail(form.email);
        limiter.enforce(`forgot-ip:${ip}`, 20, 60 * MINUTE);
        limiter.enforce(`email:${emailKey(email)}`, config.limits.emailPerAddress, 60 * MINUTE);
        await accounts.requestPasswordReset({ email, req: authRequest?.id, ip });
        return page(req, res, 'check_email', { ...ctx, values: { email } });
      } catch (error) {
        if (error instanceof HttpError) return page(req, res, 'forgot', { ...ctx, error: error.code }, error.status === 429 ? 429 : 400);
        throw error;
      }
    }
    if (method === 'GET' && path === '/reset-password') {
      const authRequest = await boundRequest(q.req);
      if (typeof q.token !== 'string' || !(await accounts.checkResetToken(q.token))) {
        return page(req, res, 'link_invalid', { authRequest, lang: q.lang }, 400);
      }
      return page(req, res, 'reset', { authRequest, lang: q.lang, values: { token: q.token } });
    }
    if (method === 'POST' && path === '/reset-password') {
      const form = await readBody(req);
      const authRequest = await boundRequest(form.req);
      const ctx = { authRequest, lang: form.lang, values: { token: form.token } };
      try {
        checkCsrf(req, form);
        if (String(form.password ?? '') !== String(form.confirm ?? '')) fail(400, 'PASSWORDS_DO_NOT_MATCH');
        await accounts.resetPassword({ token: String(form.token ?? ''), password: form.password, ip });
        addCookie(res, cookie(C.sso, '', { secure: config.secureCookies, maxAge: 0 }));
        return page(req, res, 'reset_done', ctx);
      } catch (error) {
        if (error instanceof HttpError && error.code === 'LINK_INVALID') return page(req, res, 'link_invalid', ctx, 400);
        if (error instanceof HttpError) return page(req, res, 'reset', { ...ctx, error: error.code }, 400);
        throw error;
      }
    }

    if (method === 'POST' && path === '/choose-workspace') {
      const form = await readBody(req);
      checkCsrf(req, form);
      const authRequest = await authRequestFrom(form);
      if (!authRequest) fail(400, 'SIGN_IN_REQUEST_EXPIRED');
      const sso = await currentSso(req);
      if (!sso) return redirect(res, `/login?req=${encodeURIComponent(authRequest.id)}`);
      const lang = langOf(form.lang);
      if (lang) await pool.query('UPDATE platform.sso_sessions SET locale=$2 WHERE id=$1', [sso.id, lang]);
      return finishSignIn(req, res, authRequest, sso, String(form.tenant ?? ''));
    }

    // ----- Google -----
    if (method === 'GET' && path === '/google/start') {
      if (!config.google.enabled || !google) fail(404, 'NOT_FOUND');
      limiter.enforce(`google-ip:${ip}`, 30, MINUTE);
      const authRequest = await boundRequest(q.req);
      const state = randomToken(24);
      const nonce = randomToken(24);
      const codeVerifier = randomToken(48);
      await pool.query('INSERT INTO platform.google_states(state_hash,auth_request_id,code_verifier,nonce,next,expires_at) VALUES ($1,$2,$3,$4,$5,now()+interval \'10 minutes\')',
        [sha256(state), authRequest?.id ?? null, codeVerifier, nonce, safeNext(q.next)]);
      addCookie(res, cookie(C.gstate, signValue(state, config.cookieSecret), { secure: config.secureCookies, maxAge: 600 }));
      return redirect(res, google.authorizationUrl({ state, nonce, codeVerifier, locale: authRequest?.locale ?? 'en' }));
    }
    if (method === 'GET' && path === '/google/callback') {
      if (!config.google.enabled || !google) fail(404, 'NOT_FOUND');
      const cookieState = unsignValue(parseCookies(req.headers.cookie)[C.gstate], config.cookieSecret);
      addCookie(res, cookie(C.gstate, '', { secure: config.secureCookies, maxAge: 0 }));
      const row = (q.state && cookieState === q.state)
        ? (await pool.query('DELETE FROM platform.google_states WHERE state_hash=$1 AND expires_at>now() RETURNING *', [sha256(q.state)])).rows[0]
        : null;
      const authRequest = row?.auth_request_id ? await oauth.loadAuthRequest(row.auth_request_id) : null;
      if (!row || q.error || typeof q.code !== 'string') {
        await audit('login', { outcome: 'denied', reason: 'GOOGLE_SIGN_IN_FAILED', ip });
        return page(req, res, 'login', { authRequest, error: 'GOOGLE_SIGN_IN_FAILED' }, 400);
      }
      try {
        const profile = await google.exchange({ code: q.code, codeVerifier: row.code_verifier, nonce: row.nonce });
        const user = await accounts.googleUser({ ...profile, ip, locale: authRequest?.locale ?? 'en' });
        const sso = await startSso(req, res, user, 'google', authRequest?.locale ?? pickLocale(null, req.headers['accept-language']));
        return finishSignIn(req, res, authRequest, sso, undefined, row.next);
      } catch (error) {
        const code = error instanceof HttpError ? error.code : 'GOOGLE_SIGN_IN_FAILED';
        if (!(error instanceof HttpError)) log.warn?.(`google sign-in failed: ${error.message}`);
        await audit('login', { outcome: 'denied', reason: code, ip });
        return page(req, res, 'login', { authRequest, error: code }, 400);
      }
    }

    // ----- token endpoints (called by the browser library) -----
    if (method === 'OPTIONS' && ['/token', '/revoke', '/userinfo'].includes(path)) {
      await cors(req, res);
      res.writeHead(204);
      return res.end();
    }
    if (method === 'POST' && path === '/token') {
      await cors(req, res);
      limiter.enforce(`token-ip:${ip}`, config.limits.tokenPerIp, MINUTE);
      const body = await readBody(req);
      try {
        if (body.grant_type === 'authorization_code') return json(res, 200, await oauth.exchangeCode(body, ip), { 'cache-control': 'no-store', pragma: 'no-cache' });
        if (body.grant_type === 'refresh_token') return json(res, 200, await oauth.refresh(body, ip), { 'cache-control': 'no-store', pragma: 'no-cache' });
        // Product SERVER only (needs the client secret): an org admin's product token -> admin API token.
        if (body.grant_type === TOKEN_EXCHANGE) return json(res, 200, await admin.exchange(req, body, ip), { 'cache-control': 'no-store', pragma: 'no-cache' });
        fail(400, 'unsupported_grant_type');
      } catch (error) {
        if (error instanceof HttpError && error.code === 'invalid_client' && body.grant_type === TOKEN_EXCHANGE) {
          return json(res, 401, { error: 'invalid_client' }, { 'cache-control': 'no-store', 'www-authenticate': 'Basic realm="ads-identity"' });
        }
        if (error instanceof HttpError) return json(res, 400, { error: error.code }, { 'cache-control': 'no-store' });
        throw error;
      }
    }
    if (method === 'POST' && path === '/revoke') {
      await cors(req, res);
      limiter.enforce(`token-ip:${ip}`, config.limits.tokenPerIp, MINUTE);
      const body = await readBody(req);
      await oauth.revokeRefresh(body.token);
      return json(res, 200, { revoked: true });
    }
    if (method === 'GET' && path === '/userinfo') {
      await cors(req, res);
      const auth = String(req.headers.authorization ?? '');
      try {
        const { payload } = await jwtVerify(auth.replace(/^Bearer /, ''), localJwks, { issuer: config.issuer, algorithms: ['RS256'] });
        return json(res, 200, { sub: payload.sub, email: payload.email, email_verified: payload.email_verified, name: payload.name, tenant_id: payload.tenant_id, roles: payload.roles, locale: payload.locale, demo: payload.demo, ads_staff: payload.ads_staff });
      } catch {
        return json(res, 401, { error: 'invalid_token' });
      }
    }
    if ((method === 'GET' || method === 'POST') && path === '/logout') {
      const form = method === 'POST' ? await readBody(req) : q;
      const clientId = /^[a-z0-9][a-z0-9-]{1,62}$/.test(String(form.client_id ?? '')) ? form.client_id : null;
      const client = clientId ? await oauth.getClient(clientId) : null;
      const back = client && form.post_logout_redirect_uri && client.post_logout_redirect_uris.includes(form.post_logout_redirect_uri) ? form.post_logout_redirect_uri : null;
      // A bare GET (no registered product return address) asks for confirmation, so other sites cannot sign people out.
      if (method === 'GET' && !back) return page(req, res, 'confirm_logout', { client, lang: q.lang, values: { clientId } });
      if (method === 'POST') checkCsrf(req, form);
      const raw = unsignValue(parseCookies(req.headers.cookie)[C.sso], config.cookieSecret);
      if (raw) {
        const row = (await pool.query('UPDATE platform.sso_sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL RETURNING id,user_id', [sha256(raw)])).rows[0];
        if (row) {
          await pool.query('UPDATE platform.refresh_tokens SET revoked_at=now() WHERE sso_session_id=$1 AND revoked_at IS NULL', [row.id]);
          await audit('logout', { userId: row.user_id, outcome: 'allowed', reason: 'sso', ip, clientId: client?.client_id ?? null });
        }
      }
      addCookie(res, cookie(C.sso, '', { secure: config.secureCookies, maxAge: 0 }));
      if (!back && method === 'POST' && safeNext(form.next)) return redirect(res, safeNext(form.next));
      if (back) {
        const url = new URL(back);
        if (form.state) url.searchParams.set('state', String(form.state).slice(0, 512));
        return redirect(res, url.toString());
      }
      return page(req, res, 'signed_out', { client, lang: form.lang });
    }

    // ----- invitations (hosted pages) -----
    if (method === 'GET' && path === '/invite') {
      const invitation = await admin.findInvitation(q.token);
      const ctx = { lang: q.lang ?? invitation?.locale, path: `/invite?token=${encodeURIComponent(String(q.token ?? ''))}` };
      if (!invitation) return page(req, res, 'invite_invalid', ctx, 400);
      const sso = await currentSso(req);
      return page(req, res, 'invite', { ...ctx, values: invitePageValues(invitation, q.token, sso) });
    }
    if (method === 'POST' && path === '/invite/accept') {
      const form = await readBody(req);
      checkCsrf(req, form);
      const sso = await currentSso(req);
      const token = String(form.token ?? '');
      if (!sso) return redirect(res, `/login?next=${encodeURIComponent(`/invite?token=${token}`)}`);
      limiter.enforce(`invite-accept-ip:${ip}`, 30, 15 * MINUTE);
      try {
        const done = await admin.acceptInvitation(token, sso.user, ip);
        return page(req, res, 'invite_accepted', { lang: form.lang, values: done });
      } catch (error) {
        if (!(error instanceof HttpError)) throw error;
        const invitation = await admin.findInvitation(token);
        if (!invitation) return page(req, res, 'invite_invalid', { lang: form.lang }, 400);
        return page(req, res, 'invite', { lang: form.lang, path: `/invite?token=${token}`, error: error.code, values: invitePageValues(invitation, token, sso) }, 403);
      }
    }

    // ----- organisation admin: hosted page (session cookie + CSRF) -----
    if (method === 'GET' && path === '/admin') {
      const sso = await currentSso(req);
      if (!sso) return redirect(res, `/login?next=${encodeURIComponent(safeNext(`/admin${url.search.replace(/[^A-Za-z0-9=&%._?-]/g, '')}`) ?? '/admin')}`);
      return adminPage(req, res, sso, q);
    }
    if (method === 'POST' && path === '/admin') {
      const form = await readBody(req);
      checkCsrf(req, form);
      const sso = await currentSso(req);
      if (!sso) return redirect(res, '/login?next=%2Fadmin');
      const ctx = { actorId: sso.user.id, tenantId: String(form.tenant ?? ''), clientId: String(form.product ?? ''), via: 'page', ip };
      const back = extra => redirect(res, `/admin?${new URLSearchParams({ tenant: ctx.tenantId, product: ctx.clientId, lang: form.lang === 'fr' ? 'fr' : 'en', ...extra })}`);
      try {
        const target = String(form.user_id ?? '');
        switch (form.action) {
          case 'grant': await admin.grantRoles(ctx, target, form.roles); return back({ done: 'granted' });
          case 'revoke': await admin.revokeRoles(ctx, target, form.roles); return back({ done: 'revoked' });
          case 'deactivate': await admin.setActive(ctx, target, false); return back({ done: 'deactivated' });
          case 'reactivate': await admin.setActive(ctx, target, true); return back({ done: 'reactivated' });
          case 'make_admin': await admin.setOrgAdmin(ctx, target, true); return back({ done: 'admin' });
          case 'remove_admin': await admin.setOrgAdmin(ctx, target, false); return back({ done: 'admin' });
          case 'invite':
            limiter.enforce(`invite:${ctx.actorId}`, 100, 60 * MINUTE);
            await admin.createInvitation(ctx, { email: form.email, roles: form.roles, phone: form.phone, locale: form.locale, orgAdmin: form.org_admin === 'true' });
            return back({ done: 'invited' });
          case 'revoke_invitation': await admin.revokeInvitation(ctx, String(form.invitation_id ?? '')); return back({ done: 'invite_revoked' });
          default: fail(400, 'FORBIDDEN');
        }
      } catch (error) {
        if (error instanceof HttpError) return back({ error: error.code });
        throw error;
      }
    }

    // ----- organisation admin API (product servers, admin token from token exchange) -----
    if (path.startsWith('/admin/v1/')) {
      limiter.enforce(`admin-api-ip:${ip}`, config.limits.tokenPerIp, MINUTE);
      const ctx = await admin.apiContext(req, ip);
      const m = path.match(/^\/admin\/v1\/(members|invitations)(?:\/([0-9a-f-]{36})(?:\/([a-z-]+(?:\/[a-z]+)?))?)?$/);
      if (method === 'GET' && path === '/admin/v1/me') {
        const auth = await admin.authority(ctx.actorId, ctx.tenantId);
        return json(res, 200, { userId: ctx.actorId, tenantId: ctx.tenantId, product: ctx.clientId, scopes: [...ctx.scopes].filter(Boolean),
          orgAdmin: Boolean(auth?.orgAdmin), organization: auth?.workspace.organizationName ?? null });
      }
      if (!m) fail(404, 'NOT_FOUND');
      const [, kind, id, sub] = m;
      const body = method === 'POST' ? await readBody(req) : {};
      if (kind === 'members') {
        if (method === 'GET' && !id) return json(res, 200, { items: await admin.listMembers(ctx) });
        if (method === 'POST' && id && sub === 'roles/grant') return json(res, 200, await admin.grantRoles(ctx, id, body.roles));
        if (method === 'POST' && id && sub === 'roles/revoke') return json(res, 200, await admin.revokeRoles(ctx, id, body.roles));
        if (method === 'POST' && id && sub === 'deactivate') return json(res, 200, await admin.setActive(ctx, id, false));
        if (method === 'POST' && id && sub === 'reactivate') return json(res, 200, await admin.setActive(ctx, id, true));
        if (method === 'POST' && id && sub === 'org-admin') return json(res, 200, await admin.setOrgAdmin(ctx, id, body.admin === true));
      }
      if (kind === 'invitations') {
        if (method === 'GET' && !id) return json(res, 200, { items: await admin.listInvitations(ctx) });
        if (method === 'POST' && !id) {
          limiter.enforce(`invite:${ctx.actorId}`, 100, 60 * MINUTE);
          return json(res, 201, await admin.createInvitation(ctx, { email: body.email, roles: body.roles, phone: body.phone, locale: body.locale, orgAdmin: body.orgAdmin === true, ttlSeconds: body.ttlSeconds }));
        }
        if (method === 'POST' && id && sub === 'revoke') return json(res, 200, await admin.revokeInvitation(ctx, id));
      }
      fail(404, 'NOT_FOUND');
    }

    // ----- legacy JSON API used by Software Factory -----
    if (method === 'POST' && path === '/v1/identity/register') {
      limiter.enforce(`register-ip:${ip}`, config.limits.registerPerIp, 60 * MINUTE);
      return json(res, 201, await legacy.register(await readBody(req), ip));
    }
    if (method === 'POST' && path === '/v1/identity/login') {
      const body = await readBody(req);
      limiter.enforce(`login-ip:${ip}`, config.limits.loginPerIp, 15 * MINUTE);
      limiter.enforce(`login-email:${emailKey(body.email)}`, config.limits.loginPerEmail, 15 * MINUTE);
      const result = await legacy.login(body, ip);
      limiter.reset(`login-email:${emailKey(body.email)}`);
      return json(res, 200, result);
    }
    // ACC-03: off unless IDENTITY_LEGACY_ONBOARD_ENABLED (never in production or demo). Answers as if it did not exist.
    if (method === 'POST' && path === '/v1/identity/onboard') {
      if (!config.legacyOnboard) {
        await audit('workspace_onboard', { outcome: 'denied', reason: 'ONBOARD_DISABLED', ip });
        fail(404, 'NOT_FOUND');
      }
      return json(res, 201, await legacy.onboard(req, await readBody(req)));
    }
    if (method === 'GET' && path === '/v1/identity/session') return json(res, 200, await legacy.sessionContext(req));
    if (method === 'POST' && path === '/internal/session') return json(res, 200, await legacy.sessionContext(req));
    if (method === 'POST' && path === '/internal/verify') return json(res, 200, await legacy.verify(req));
    if (method === 'POST' && path === '/v1/identity/logout') return json(res, 200, await legacy.revoke(req));

    fail(404, 'NOT_FOUND');
  }

  const handler = async (req, res) => {
    try {
      await route(req, res);
    } catch (error) {
      if (res.headersSent) { res.end(); return; }
      const status = error instanceof HttpError ? error.status : 500;
      const code = error instanceof HttpError ? error.code : 'IDENTITY_ERROR';
      if (status >= 500) log.error?.(`identity error ${req.method} ${req.url?.split('?')[0]}: ${error.stack ?? error.message}`);
      const headers = status === 429 && error.details?.retryAfter ? { 'retry-after': String(error.details.retryAfter) } : {};
      const wantsHtml = String(req.headers.accept ?? '').includes('text/html');
      if (wantsHtml) {
        for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
        return page(req, res, 'error', { error: code }, status);
      }
      json(res, status, { error: { code } }, { 'cache-control': 'no-store', ...headers });
    }
  };

  // Deletes expired one-time records. main.mjs runs it hourly.
  async function purgeExpired() {
    await pool.query('DELETE FROM platform.auth_requests WHERE expires_at < now()');
    await pool.query('DELETE FROM platform.google_states WHERE expires_at < now()');
    await pool.query("DELETE FROM platform.auth_codes WHERE expires_at < now() - interval '1 day'");
    await pool.query("DELETE FROM platform.email_tokens WHERE expires_at < now() - interval '7 days'");
    await pool.query("DELETE FROM platform.refresh_tokens WHERE expires_at < now() - interval '7 days'");
    // Sealed successors are only needed during the reuse grace window.
    await pool.query("UPDATE platform.refresh_tokens SET successor_sealed=NULL WHERE successor_sealed IS NOT NULL AND rotated_at < now() - make_interval(secs => $1)", [config.refreshReuseGrace + 60]);
    await pool.query("DELETE FROM platform.sso_sessions WHERE expires_at < now() - interval '7 days'");
    await pool.query("DELETE FROM platform.sessions WHERE expires_at < now() - interval '30 days'");
  }

  async function close() {
    await sandboxes.idle();
    if (ownDemoPool) await sandboxPool.end();
  }

  return { handler, server: http.createServer(handler), accounts, oauth, admin, audit, purgeExpired, sandboxes, close };
}

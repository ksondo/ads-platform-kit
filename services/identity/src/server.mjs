import http from 'node:http';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { createAccounts } from './accounts.mjs';
import { createLegacyApi } from './legacy.mjs';
import { createOAuth } from './oauth.mjs';
import { pickLocale, renderPage } from './pages.mjs';
import { HttpError, RateLimiter, cookie, fail, isEmail, normalizeEmail, parseCookies, randomToken, sha256, signValue, unsignValue } from './security.mjs';

const MINUTE = 60_000;
const BODY_LIMIT = 16 * 1024;

export function createApp({ config, pool, keys, mailer, google, log = console, sdkPath, limiter = new RateLimiter() }) {
  async function audit(eventType, { userId = null, tenantId = null, projectId = null, outcome, reason = null, ip = null, clientId = null, metadata = {} }, db = pool) {
    await db.query(`INSERT INTO platform.identity_audit(event_type,user_id,tenant_id,project_id,outcome,reason,metadata,ip,client_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`, [eventType, userId, tenantId, projectId, outcome, reason, JSON.stringify(metadata), ip, clientId]);
  }
  const accounts = createAccounts({ pool, config, mailer, audit, log });
  const oauth = createOAuth({ pool, config, keys, audit });
  const legacy = createLegacyApi({ pool, config, accounts, audit });
  const localJwks = createLocalJWKSet(keys.jwks);

  // ---------- helpers ----------
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

  function baseHeaders(res, nonce) {
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('cross-origin-opener-policy', 'same-origin');
    if (config.secureCookies) res.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains');
    // form-action also governs the redirect back to the product after a form post, so allow https targets.
    res.setHeader('content-security-policy', `default-src 'none'; style-src 'nonce-${nonce}'; img-src https: data:; form-action 'self' https:${config.devMode ? ' http:' : ''}; frame-ancestors 'none'; base-uri 'none'`);
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
    const row = (await pool.query(`SELECT s.id,s.user_id,u.email,u.status FROM platform.sso_sessions s JOIN platform.users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()`, [sha256(raw)])).rows[0];
    if (!row || row.status !== 'active') return null;
    return { id: row.id, user: { id: row.user_id, email: row.email } };
  }
  async function startSso(req, res, user, method) {
    const previous = unsignValue(parseCookies(req.headers.cookie)[C.sso], config.cookieSecret);
    if (previous) await pool.query('UPDATE platform.sso_sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL', [sha256(previous)]);
    const raw = randomToken(32);
    const id = crypto.randomUUID();
    await pool.query('INSERT INTO platform.sso_sessions(id,user_id,token_hash,method,expires_at) VALUES ($1,$2,$3,$4,now()+make_interval(secs => $5))', [id, user.id, sha256(raw), method, config.ssoSessionTtl]);
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

  function page(req, res, view, ctx = {}, status = 200) {
    const nonce = randomToken(12);
    baseHeaders(res, nonce);
    const locale = ctx.locale ?? pickLocale(ctx.lang, req.headers['accept-language'], ctx.authRequest?.locale);
    const body = renderPage(view, {
      locale, nonce, client: ctx.authRequest?.client ?? ctx.client ?? null, req: ctx.authRequest?.id ?? ctx.req ?? null,
      csrf: csrfToken(req, res), error: ctx.error, values: ctx.values, googleEnabled: config.google.enabled,
      minPassword: config.passwordMinLength, path: ctx.path ?? safePath(new URL(req.url, 'http://x').pathname),
    });
    res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
  }

  // After a successful sign-in: pick the workspace and send the user back to the product.
  async function finishSignIn(req, res, authRequest, sso, chosenTenant) {
    if (!authRequest) return page(req, res, 'signed_in', { values: { email: sso.user.email } });
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

  let sdkCache = null;

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
        end_session_endpoint: `${config.publicUrl}/logout`, response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'],
        access_token_signing_alg_values_supported: ['RS256'], claims_supported: ['sub', 'tenant_id', 'roles', 'email', 'email_verified', 'name'],
      }, { 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' });
    }
    if (method === 'GET' && path === '/sdk/ads-identity.js') {
      sdkCache ??= await readFile(sdkPath, 'utf8');
      res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff', 'access-control-allow-origin': '*' });
      return res.end(sdkCache);
    }

    // ----- product sign-in (OAuth 2.0 + PKCE) -----
    if (method === 'GET' && path === '/authorize') {
      limiter.enforce(`authorize-ip:${ip}`, 60, MINUTE);
      const locale = pickLocale(q.lang ?? q.ui_locales, req.headers['accept-language']);
      const { id } = await oauth.createAuthRequest(q, locale);
      const authRequest = await oauth.loadAuthRequest(id);
      bindAuthRequest(req, res, id);
      const sso = q.prompt === 'login' ? null : await currentSso(req);
      if (sso) return finishSignIn(req, res, authRequest, sso);
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
      return page(req, res, 'login', { authRequest: await authRequestFrom(q), lang: q.lang });
    }
    if (method === 'POST' && path === '/login') {
      const form = await readBody(req);
      const authRequest = await authRequestFrom(form);
      const ctx = { authRequest, lang: form.lang, values: { email: form.email } };
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
            await accounts.sendVerification(error.details.user, { passwordHash: error.details.passwordHash, req: authRequest?.id, product: authRequest?.client?.display_name });
          }
          throw error;
        }
        limiter.reset(`login-email:${emailKey(email)}`);
        const sso = await startSso(req, res, user, 'password');
        await audit('login', { userId: user.id, outcome: 'allowed', reason: 'password', ip, clientId: authRequest?.client_id });
        return finishSignIn(req, res, authRequest, sso);
      } catch (error) {
        if (error instanceof HttpError) return page(req, res, 'login', { ...ctx, error: error.code }, error.status === 429 ? 429 : 400);
        throw error;
      }
    }

    if (method === 'GET' && path === '/register') {
      return page(req, res, 'register', { authRequest: await authRequestFrom(q), lang: q.lang });
    }
    if (method === 'POST' && path === '/register') {
      const form = await readBody(req);
      const authRequest = await authRequestFrom(form);
      const locale = pickLocale(form.lang, req.headers['accept-language'], authRequest?.locale);
      const ctx = { authRequest, lang: form.lang, values: { email: form.email, name: form.name } };
      try {
        checkCsrf(req, form);
        limiter.enforce(`register-ip:${ip}`, config.limits.registerPerIp, 60 * MINUTE);
        if (String(form.password ?? '') !== String(form.confirm ?? '')) fail(400, 'PASSWORDS_DO_NOT_MATCH');
        limiter.enforce(`email:${emailKey(form.email)}`, config.limits.emailPerAddress, 60 * MINUTE);
        const { user } = await accounts.register({ email: form.email, password: form.password, name: form.name, locale, product: authRequest?.client?.display_name, req: authRequest?.id, ip, clientId: authRequest?.client_id });
        if (user.status === 'active' && !config.requireEmailVerification) {
          return redirect(res, `/login${authRequest ? `?req=${encodeURIComponent(authRequest.id)}` : ''}`);
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
      return page(req, res, 'activate', { authRequest, lang: q.lang, values: { token: q.token } });
    }
    if (method === 'POST' && path === '/verify-email') {
      const form = await readBody(req);
      const authRequest = await boundRequest(form.req);
      const ctx = { authRequest, lang: form.lang, values: { token: form.token } };
      try {
        checkCsrf(req, form);
        limiter.enforce(`activate-ip:${ip}`, config.limits.loginPerIp, 15 * MINUTE);
        limiter.enforce(`activate-token:${sha256(String(form.token ?? ''))}`, 10, 15 * MINUTE);
        const user = await accounts.activate({ token: String(form.token ?? ''), password: form.password, ip });
        const sso = await startSso(req, res, user, 'password');
        return finishSignIn(req, res, authRequest, sso);
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
      await pool.query('INSERT INTO platform.google_states(state_hash,auth_request_id,code_verifier,nonce,expires_at) VALUES ($1,$2,$3,$4,now()+interval \'10 minutes\')',
        [sha256(state), authRequest?.id ?? null, codeVerifier, nonce]);
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
        const sso = await startSso(req, res, user, 'google');
        return finishSignIn(req, res, authRequest, sso);
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
        fail(400, 'unsupported_grant_type');
      } catch (error) {
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
        return json(res, 200, { sub: payload.sub, email: payload.email, email_verified: payload.email_verified, name: payload.name, tenant_id: payload.tenant_id, roles: payload.roles });
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
      if (back) {
        const url = new URL(back);
        if (form.state) url.searchParams.set('state', String(form.state).slice(0, 512));
        return redirect(res, url.toString());
      }
      return page(req, res, 'signed_out', { client, lang: form.lang });
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
    if (method === 'POST' && path === '/v1/identity/onboard') return json(res, 201, await legacy.onboard(req, await readBody(req)));
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

  return { handler, server: http.createServer(handler), accounts, oauth, audit, purgeExpired };
}

// BRIEF18 routes for personal demo sandboxes (demo environment only; everything here answers 404
// unless ADS_ENV=demo, DEMO_MODE=1 and DEMO_SANDBOXES=1):
//   GET/POST /demo/signup         "Try ADS free for 30 days": email or phone -> one-time code
//   POST     /demo/verify         the code -> sandbox (new, or the tester's existing one) + ADS sign-in
//   GET      /demo/preparing      "Preparing your demo…" (polls /demo/v1/sandbox/status)
//   GET      /demo/continue       back to the product the tester came from, signed in
//   GET      /demo/v1/sandbox/status          JSON, for the page above (ADS sign-in cookie)
//   GET      /demo/v1/personas?client_id=     JSON, the caller's own sandbox personas (Bearer product token)
//   POST     /demo/v1/switch                  token exchange to another persona of the caller's own sandbox
//   GET      /sdk/ads-demo-switch.js          the "Switch role" control products include
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pickLocale } from './pages.mjs';
import { renderSandboxPage } from './sandbox-pages.mjs';
import { ACCESS_TOKEN_TYPE, TOKEN_EXCHANGE } from './sandboxes.mjs';
import { HttpError, cookie, parseCookies, randomToken, signValue, unsignValue } from './security.mjs';

const MINUTE = 60_000;

export function createSandboxRoutes({ config, sandboxes, oauth, limiter, sdkDir, helpers }) {
  const { readBody, json, redirect, csrfToken, checkCsrf, currentSso, startSso, cors, finishSignIn } = helpers;
  const OTP_COOKIE = config.secureCookies ? '__Host-ads_demo_otp' : 'ads_demo_otp';
  let widgetCache = null;

  function headers(res, nonce) {
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('cross-origin-opener-policy', 'same-origin');
    if (config.secureCookies) res.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains');
    res.setHeader('content-security-policy', `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'self'; img-src https: data:; form-action 'self' https:${config.devMode ? ' http:' : ''}; frame-ancestors 'none'; base-uri 'none'`);
  }

  function page(req, res, view, { authRequest = null, lang, error, values, status = 200, path: pagePath } = {}) {
    const nonce = randomToken(12);
    headers(res, nonce);
    const locale = pickLocale(lang, req.headers['accept-language'], authRequest?.locale);
    const body = renderSandboxPage(view, { locale, nonce, client: authRequest?.client ?? null, csrf: csrfToken(req, res), req: authRequest?.id ?? null, error, values,
      path: pagePath ?? new URL(req.url, 'http://x').pathname.replace(/^\/demo\/(verify)$/, '/demo/signup') });
    res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
  }

  const setOtpCookie = (res, value, maxAge) => {
    const prev = res.getHeader('set-cookie');
    res.setHeader('set-cookie', [...(Array.isArray(prev) ? prev : prev ? [prev] : []), cookie(OTP_COOKIE, value ? signValue(value, config.cookieSecret) : '', { secure: config.secureCookies, maxAge })]);
  };
  const otpFromCookie = req => unsignValue(parseCookies(req.headers.cookie)[OTP_COOKIE], config.cookieSecret);

  const bearer = req => String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const apiError = (res, error) => {
    if (!(error instanceof HttpError)) throw error;
    const headersOut = { 'cache-control': 'no-store' };
    if (error.status === 429 && error.details?.retryAfter) headersOut['retry-after'] = String(error.details.retryAfter);
    return json(res, error.status, { error: error.code }, headersOut);
  };

  // After the code: back to the product (as the owner, or as the product's first persona where the
  // owner holds no role there), or to "Preparing your demo…" while it is not ready.
  async function continueTo(req, res, authRequest, sso) {
    const sb = await sandboxes.sandboxOfUser(sso.user.id);
    if (!sb) return finishSignIn(req, res, authRequest, sso);
    const status = await sandboxes.status(sb.id, { clientId: authRequest?.client_id ?? null });
    if (!authRequest) return page(req, res, 'preparing', { values: { status: { ...status, can_continue: false } }, lang: sb.locale, path: '/demo/preparing' });
    if (!status.can_continue) return redirect(res, `/demo/preparing?req=${encodeURIComponent(authRequest.id)}`);
    const landing = await sandboxes.landingIdentity(sb.id, authRequest.client_id, authRequest.tenant_hint);
    if (!landing) return finishSignIn(req, res, authRequest, sso);
    return redirect(res, await oauth.issueCode(authRequest, { id: landing.userId }, landing.tenantId, sso.id));
  }

  // Used by the server's sign-in: a sandbox owner with no role in this product signs in as the
  // product's first persona of the same sandbox instead of seeing "No access yet".
  async function landingFor(sso, authRequest) {
    if (!sandboxes.enabled || !authRequest) return null;
    const sb = await sandboxes.sandboxOfUser(sso.user.id);
    if (!sb || sb.owner_user_id !== sso.user.id) return null;
    return sandboxes.landingIdentity(sb.id, authRequest.client_id, authRequest.tenant_hint);
  }

  async function handle(req, res, { path: p, method, q, ip, loadBoundRequest }) {
    if (!sandboxes.enabled) return false;
    if (!(p.startsWith('/demo/') || p === '/sdk/ads-demo-switch.js')) return false;

    if (method === 'GET' && p === '/sdk/ads-demo-switch.js') {
      widgetCache ??= await readFile(path.join(sdkDir, 'ads-demo-switch.js'), 'utf8');
      res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff', 'access-control-allow-origin': '*' });
      res.end(widgetCache);
      return true;
    }

    if (method === 'GET' && p === '/demo/signup') {
      page(req, res, 'signup', { authRequest: await loadBoundRequest(q.req), lang: q.lang, error: q.error === 'NOT_SIGNED_IN' ? 'NOT_SIGNED_IN' : undefined });
      return true;
    }
    if (method === 'POST' && p === '/demo/signup') {
      const form = await readBody(req);
      const authRequest = await loadBoundRequest(form.req);
      const locale = pickLocale(form.lang, req.headers['accept-language'], authRequest?.locale);
      const values = { contact: form.contact, consent: form.consent === 'yes' };
      try {
        checkCsrf(req, form);
        limiter.enforce(`demo-signup-ip:${ip}`, 20, 15 * MINUTE);
        if (form.consent !== 'yes') throw new HttpError(400, 'CONSENT_REQUIRED');
        const sent = await sandboxes.startChallenge({ contact: form.contact, ip, locale, clientId: authRequest?.client_id ?? null });
        setOtpCookie(res, sent.challengeId, config.sandbox.otp.ttlSeconds);
        page(req, res, 'code', { authRequest, lang: locale, values: { masked: sent.masked, minutes: Math.round(config.sandbox.otp.ttlSeconds / 60), testCode: sent.testCode }, path: '/demo/signup' });
      } catch (error) {
        if (!(error instanceof HttpError)) throw error;
        page(req, res, 'signup', { authRequest, lang: locale, error: error.code, values, status: error.status === 429 ? 429 : 400 });
      }
      return true;
    }
    if (method === 'POST' && p === '/demo/verify') {
      const form = await readBody(req);
      const authRequest = await loadBoundRequest(form.req);
      const locale = pickLocale(form.lang, req.headers['accept-language'], authRequest?.locale);
      try {
        checkCsrf(req, form);
        limiter.enforce(`demo-verify-ip:${ip}`, 30, 15 * MINUTE);
        const done = await sandboxes.verifyChallenge({ challengeId: otpFromCookie(req), code: form.code, ip });
        setOtpCookie(res, '', 0);
        if (done.created) sandboxes.provisionInBackground(done.sandboxId);
        const sso = await startSso(req, res, { id: done.ownerId }, 'otp');
        const back = authRequest ? `?req=${encodeURIComponent(authRequest.id)}` : '';
        const status = await sandboxes.status(done.sandboxId, { clientId: authRequest?.client_id ?? null });
        if (authRequest && status.can_continue) return continueTo(req, res, authRequest, sso).then(() => true);
        redirect(res, `/demo/preparing${back}`);
      } catch (error) {
        if (!(error instanceof HttpError)) throw error;
        const view = ['CODE_WRONG', 'TOO_MANY_ATTEMPTS'].includes(error.code) ? 'code' : 'signup';
        page(req, res, view, { authRequest, lang: locale, error: error.code, values: { minutes: Math.round(config.sandbox.otp.ttlSeconds / 60) }, status: error.status === 429 ? 429 : 400, path: '/demo/signup' });
      }
      return true;
    }
    if (method === 'GET' && (p === '/demo/preparing' || p === '/demo/continue')) {
      const authRequest = await loadBoundRequest(q.req);
      const sso = await currentSso(req);
      const back = authRequest ? `?req=${encodeURIComponent(authRequest.id)}` : '';
      if (!sso) { redirect(res, `/demo/signup${back}${back ? '&' : '?'}error=NOT_SIGNED_IN`); return true; }
      const sb = await sandboxes.sandboxOfUser(sso.user.id);
      if (!sb) { redirect(res, `/demo/signup${back}`); return true; }
      if (p === '/demo/continue') { await continueTo(req, res, authRequest, sso); return true; }
      const status = await sandboxes.status(sb.id, { clientId: authRequest?.client_id ?? null });
      page(req, res, 'preparing', { authRequest, lang: q.lang ?? sb.locale, values: { status: authRequest ? status : { ...status, can_continue: false } } });
      return true;
    }
    if (method === 'GET' && p === '/demo/v1/sandbox/status') {
      const sso = await currentSso(req);
      const sb = sso ? await sandboxes.sandboxOfUser(sso.user.id) : null;
      if (!sb) { json(res, 401, { error: 'NOT_SIGNED_IN' }, { 'cache-control': 'no-store' }); return true; }
      const authRequest = await loadBoundRequest(q.req);
      const status = await sandboxes.status(sb.id, { clientId: authRequest?.client_id ?? null });
      json(res, 200, authRequest ? status : { ...status, can_continue: false }, { 'cache-control': 'no-store' });
      return true;
    }

    // ----- "Switch role" (called by the product page, Bearer product token; CORS for registered products) -----
    if (method === 'OPTIONS' && (p === '/demo/v1/personas' || p === '/demo/v1/switch')) {
      await cors(req, res);
      res.writeHead(204);
      res.end();
      return true;
    }
    if (method === 'GET' && p === '/demo/v1/personas') {
      await cors(req, res);
      try {
        limiter.enforce(`demo-switch-ip:${ip}`, 240, MINUTE);
        json(res, 200, await sandboxes.listPersonas({ subjectToken: bearer(req), clientId: String(q.client_id ?? '') }), { 'cache-control': 'no-store' });
      } catch (error) { apiError(res, error); }
      return true;
    }
    if (method === 'POST' && p === '/demo/v1/switch') {
      await cors(req, res);
      try {
        limiter.enforce(`demo-switch-ip:${ip}`, 240, MINUTE);
        const body = await readBody(req);
        if (body.grant_type !== TOKEN_EXCHANGE || body.subject_token_type !== ACCESS_TOKEN_TYPE) throw new HttpError(400, 'invalid_request');
        const tokens = await sandboxes.switchRole({ subjectToken: String(body.subject_token ?? ''), clientId: String(body.client_id ?? ''), persona: body.persona, ip });
        json(res, 200, { ...tokens, issued_token_type: ACCESS_TOKEN_TYPE }, { 'cache-control': 'no-store', pragma: 'no-cache' });
      } catch (error) { apiError(res, error); }
      return true;
    }
    return false;
  }

  return { handle, landingFor };
}

/*!
 * ADS Identity browser client: sign-in for every ADS product.
 * Provides window.adsIdentity, the helper ADS product screens already expect.
 *
 * Include once per page, before the product's own scripts:
 *   <script src="https://login.africadigitalsynergy.com/sdk/ads-identity.js"
 *           data-issuer="https://login.africadigitalsynergy.com"
 *           data-client-id="health-web"></script>
 *
 * Then: await adsIdentity.getAccessToken()  -> string | null
 *       adsIdentity.signIn() / adsIdentity.signIn({ screen: 'register' }) / adsIdentity.signOut()
 *
 * Security notes: tokens are never put in localStorage. The short-lived access token lives in
 * memory; the rotating refresh token lives in sessionStorage (this tab only) so a reload does not
 * force a new sign-in. Closing the tab ends it; the login domain's own session then signs the user
 * back in without a password.
 */
(function () {
  'use strict';
  if (window.adsIdentity && window.adsIdentity.__ads) return;

  var script = document.currentScript;
  var preset = window.adsIdentityConfig || {};
  var data = (script && script.dataset) || {};
  var issuer = String(preset.issuer || data.issuer || '').replace(/\/$/, '');
  var clientId = preset.clientId || data.clientId || '';
  var redirectUri = preset.redirectUri || data.redirectUri || (location.origin + location.pathname);
  var postLogoutRedirectUri = preset.postLogoutRedirectUri || data.postLogoutRedirectUri || location.origin + '/';
  var autoSignIn = String(preset.autoSignIn || data.autoSignIn || 'false') === 'true';
  var KEY = 'ads-identity:' + clientId;

  var accessToken = null;
  var accessExp = 0;
  var refreshPromise = null;
  var listeners = [];

  function configured() { return Boolean(issuer && clientId); }
  function ss(name, value) {
    try {
      if (value === undefined) return sessionStorage.getItem(KEY + ':' + name);
      if (value === null) sessionStorage.removeItem(KEY + ':' + name);
      else sessionStorage.setItem(KEY + ':' + name, value);
    } catch (e) { return null; }
    return null;
  }
  function b64url(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function random(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a); }
  function challenge(verifier) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)).then(function (h) { return b64url(new Uint8Array(h)); });
  }
  function decode(token) {
    try {
      var part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(escape(atob(part + '==='.slice((part.length + 3) % 4)))));
    } catch (e) { return null; }
  }
  function emit() {
    var user = api.getUser();
    listeners.slice().forEach(function (fn) { try { fn(user); } catch (e) { /* listener errors are the product's */ } });
  }
  function store(tokens) {
    accessToken = tokens.access_token;
    var claims = decode(accessToken) || {};
    accessExp = (claims.exp || 0) * 1000;
    if (tokens.refresh_token) ss('refresh', tokens.refresh_token);
    emit();
  }
  function clear() {
    accessToken = null;
    accessExp = 0;
    ss('refresh', null);
    emit();
  }
  function postForm(path, params) {
    return fetch(issuer + path, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
      credentials: 'omit',
      cache: 'no-store',
    }).then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || ('http_' + r.status)); return b; }); });
  }

  function refresh() {
    var rt = ss('refresh');
    if (!rt) return Promise.resolve(null);
    if (!refreshPromise) {
      refreshPromise = postForm('/token', { grant_type: 'refresh_token', refresh_token: rt, client_id: clientId })
        .then(function (tokens) { store(tokens); return accessToken; })
        .catch(function () { clear(); return null; })
        .then(function (v) { refreshPromise = null; return v; });
    }
    return refreshPromise;
  }

  // Handles the return from the login page (?code=...&state=...).
  function handleCallback() {
    var params = new URLSearchParams(location.search);
    var state = params.get('state');
    if (!state || (!params.get('code') && !params.get('error'))) return Promise.resolve();
    var saved = ss('pkce:' + state);
    if (saved) ss('pkce:' + state, null);
    var pending = saved ? JSON.parse(saved) : {};
    // Always remove the code from the address bar, even when it was not started by this tab.
    var clean = function () {
      ['code', 'state', 'iss', 'error', 'error_description'].forEach(function (k) { params.delete(k); });
      var rest = params.toString();
      history.replaceState(null, '', pending.returnTo || (location.pathname + (rest ? '?' + rest : '') + location.hash));
    };
    // Unknown state (not started here), an error, or a response from another issuer: discard it.
    if (!saved || params.get('error') || params.get('iss') !== issuer) { clean(); return Promise.resolve(); }
    return postForm('/token', { grant_type: 'authorization_code', code: params.get('code'), code_verifier: pending.verifier, client_id: clientId, redirect_uri: redirectUri })
      .then(store)
      .catch(function () { clear(); })
      .then(clean);
  }

  var api = {
    __ads: true,
    ready: null,
    isConfigured: configured,
    getAccessToken: function () {
      if (!configured()) return Promise.resolve(null);
      return api.ready.then(function () {
        if (accessToken && accessExp - 30000 > Date.now()) return accessToken;
        return refresh();
      });
    },
    getUser: function () {
      var c = accessToken ? decode(accessToken) : null;
      if (!c) return null;
      return { id: c.sub, email: c.email, name: c.name || null, tenantId: c.tenant_id, roles: c.roles || [] };
    },
    isSignedIn: function () { return Boolean(accessToken && accessExp > Date.now()) || Boolean(ss('refresh')); },
    signIn: function (options) {
      if (!configured()) throw new Error('ADS Identity is not configured (data-issuer and data-client-id).');
      options = options || {};
      var verifier = random(48);
      var state = random(18);
      return challenge(verifier).then(function (codeChallenge) {
        ss('pkce:' + state, JSON.stringify({ verifier: verifier, returnTo: options.returnTo || (location.pathname + location.search + location.hash) }));
        var q = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, state: state, code_challenge: codeChallenge, code_challenge_method: 'S256' });
        if (options.screen === 'register') q.set('screen', 'register');
        if (options.tenantHint) q.set('tenant_hint', options.tenantHint);
        if (options.lang) q.set('ui_locales', options.lang);
        if (options.forceLogin) q.set('prompt', 'login');
        location.assign(issuer + '/authorize?' + q.toString());
      });
    },
    signOut: function () {
      var rt = ss('refresh');
      var go = function () {
        clear();
        location.assign(issuer + '/logout?' + new URLSearchParams({ client_id: clientId, post_logout_redirect_uri: postLogoutRedirectUri }).toString());
      };
      if (!rt) return go();
      return postForm('/revoke', { token: rt, client_id: clientId }).catch(function () {}).then(go);
    },
    onChange: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; },
    // Optional helper: turns any element into a Sign in / Sign out button.
    mountButton: function (el, labels) {
      labels = labels || { signIn: 'Sign in', signOut: 'Sign out' };
      var render = function () { el.textContent = api.isSignedIn() ? labels.signOut : labels.signIn; };
      el.addEventListener('click', function (e) { e.preventDefault(); return api.isSignedIn() ? api.signOut() : api.signIn(); });
      api.onChange(render);
      api.ready.then(render);
      render();
    },
  };

  api.ready = configured()
    ? handleCallback().then(function () {
        if (!accessToken && ss('refresh')) return refresh();
        return null;
      }).then(function () {
        if (autoSignIn && !api.isSignedIn()) return api.signIn();
        return null;
      })
    : Promise.resolve();

  window.adsIdentity = api;
})();

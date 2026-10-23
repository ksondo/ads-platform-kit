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
 *
 * Refresh is single-flight: one request per page, and across tabs of the same product (a
 * duplicated tab starts with a copy of the same refresh token) a Web Lock serialises renewals and a
 * BroadcastChannel hands the new tokens to every tab that held the old one, so tabs never present a
 * refresh token another tab already rotated. A renewal cut short by a reload is covered by the
 * identity service's short grace window (the previous token returns the same successor once).
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
  // Rotations announced by other tabs: sha256(old refresh token) -> { tokens, at }.
  var rotated = {};
  var ROTATED_TTL = 120000;
  var channel = null;
  try { if (typeof BroadcastChannel === 'function') channel = new BroadcastChannel(KEY); } catch (e) { channel = null; }

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

  function hashOf(value) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)).then(function (h) { return b64url(new Uint8Array(h)); });
  }
  function forgetOldRotations() {
    var now = Date.now();
    Object.keys(rotated).forEach(function (k) { if (now - rotated[k].at > ROTATED_TTL) delete rotated[k]; });
  }
  // Another tab of this product rotated a refresh token. If it is the one this tab holds, take the
  // successor instead of presenting the old one (which the server would treat as stolen).
  if (channel) {
    channel.onmessage = function (event) {
      var m = event && event.data;
      if (!m || m.type !== 'rotated' || typeof m.from !== 'string' || !m.tokens || typeof m.tokens.refresh_token !== 'string') return;
      forgetOldRotations();
      rotated[m.from] = { tokens: m.tokens, at: Date.now() };
      var mine = ss('refresh');
      if (!mine) return;
      hashOf(mine).then(function (h) { if (h === m.from && ss('refresh') === mine) store(m.tokens); });
    };
  }
  // Runs fn while holding a lock shared by every tab of this product (when the browser has Web Locks).
  // If another tab held the lock, its "rotated" broadcast was sent before it let go but may not
  // have been delivered yet: give it a moment before reading this tab's refresh token.
  function withLock(fn) {
    try {
      if (navigator.locks && typeof navigator.locks.request === 'function') {
        var asked = Date.now();
        return navigator.locks.request('ads-identity-refresh:' + clientId, { mode: 'exclusive' }, function () {
          if (!channel || Date.now() - asked < 5) return fn();
          return new Promise(function (r) { setTimeout(r, 50); }).then(fn);
        });
      }
    } catch (e) { /* fall through */ }
    return fn();
  }
  // Only a definite answer from the identity service ends the session. A network failure (offline,
  // or the request cut off) keeps the refresh token so the next call can try again.
  var FATAL = { invalid_grant: true, invalid_client: true, invalid_request: true, unsupported_grant_type: true };
  function renew(force) {
    var startedWith = ss('refresh');
    return withLock(function () {
      var rt = ss('refresh');
      if (!rt) return null;
      // While this tab waited for the lock, another tab renewed and handed us its tokens.
      if (rt !== startedWith && accessToken && accessExp - 30000 > Date.now()) return accessToken;
      if (!force && accessToken && accessExp - 30000 > Date.now()) return accessToken;
      return hashOf(rt).then(function (from) {
        forgetOldRotations();
        var known = rotated[from];
        if (known) { store(known.tokens); return accessToken; }
        return postForm('/token', { grant_type: 'refresh_token', refresh_token: rt, client_id: clientId })
          .then(function (tokens) {
            // Another tab may have handed us a newer token while this request was running.
            if (ss('refresh') === rt) store(tokens);
            rotated[from] = { tokens: tokens, at: Date.now() };
            try { if (channel) channel.postMessage({ type: 'rotated', from: from, tokens: tokens }); } catch (e) { /* ignore */ }
            return accessToken;
          }, function (error) {
            if (error && FATAL[error.message] && ss('refresh') === rt) clear();
            return null;
          });
      });
    });
  }
  function refresh(force) {
    if (!ss('refresh')) return Promise.resolve(null);
    if (!refreshPromise) {
      refreshPromise = Promise.resolve()
        .then(function () { return renew(force); })
        .catch(function () { return null; })
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
    // options.forceRefresh: get a new token now, e.g. after an administrator changed your roles.
    getAccessToken: function (options) {
      if (!configured()) return Promise.resolve(null);
      var force = Boolean(options && options.forceRefresh);
      return api.ready.then(function () {
        if (!force && accessToken && accessExp - 30000 > Date.now()) return accessToken;
        return refresh(force);
      });
    },
    getUser: function () {
      var c = accessToken ? decode(accessToken) : null;
      if (!c) return null;
      return { id: c.sub, email: c.email, name: c.name || null, tenantId: c.tenant_id, roles: c.roles || [], demoSandbox: c.demo_sandbox || null };
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
    // Demo sandboxes only (BRIEF18, ads-demo-switch.js): the personas of the signed-in tester's OWN
    // sandbox, and switching this tab to one of them (token exchange; never across sandboxes).
    demoPersonas: function () {
      return api.getAccessToken().then(function (at) {
        if (!at) return null;
        return fetch(issuer + '/demo/v1/personas?client_id=' + encodeURIComponent(clientId), { headers: { authorization: 'Bearer ' + at }, credentials: 'omit', cache: 'no-store' })
          .then(function (r) { return r.ok ? r.json() : null; });
      });
    },
    switchDemoPersona: function (persona) {
      return api.getAccessToken().then(function (at) {
        if (!at) throw new Error('not_signed_in');
        return postForm('/demo/v1/switch', {
          grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange', subject_token: at,
          subject_token_type: 'urn:ietf:params:oauth:token-type:access_token', client_id: clientId, persona: String(persona),
        });
      }).then(function (tokens) { store(tokens); return api.getUser(); });
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

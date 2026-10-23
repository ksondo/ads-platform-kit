/*!
 * ADS demo "Switch role" control (BRIEF18 personal demo sandboxes). Demo environment only.
 *
 * Include AFTER ads-identity.js on the product's pages:
 *   <script src="https://login.demo.africadigitalsynergy.com/sdk/ads-demo-switch.js" data-lang="fr"></script>
 * (or a copy served by the product). It shows nothing unless the signed-in user is a personal demo
 * sandbox account (token claim `demo_sandbox`). Then a small "Switch role" button lets the tester act
 * as any persona of THEIR OWN sandbox (shopper, cashier, bank agent, reviewer…) with one click, through
 * a token exchange at the ADS identity service, which refuses anything across sandboxes and audits each
 * switch. After a switch the page reloads (data-reload="false": it fires a `ads-demo-switch` event instead).
 * No dependencies, no inline styles (works under a strict CSP: styles are constructed stylesheets).
 */
(function () {
  'use strict';
  if (window.__adsDemoSwitch) return;
  window.__adsDemoSwitch = true;
  var script = document.currentScript;
  var data = (script && script.dataset) || {};
  var reload = String(data.reload || 'true') !== 'false';
  var T = {
    en: { button: 'Switch role', title: 'Act as', note: 'Test mode · your private demo', current: 'current', close: 'Close', failed: 'Could not switch. Try again.', loading: 'Loading…' },
    fr: { button: 'Changer de rôle', title: 'Agir en tant que', note: 'Mode test · votre démo privée', current: 'actuel', close: 'Fermer', failed: 'Changement impossible. Réessayez.', loading: 'Chargement…' },
  };
  function lang() {
    var l = String(data.lang || document.documentElement.lang || navigator.language || 'en').slice(0, 2).toLowerCase();
    return l === 'fr' ? 'fr' : 'en';
  }
  var CSS = ':host{all:initial}' +
    '.b{position:fixed;right:16px;bottom:16px;z-index:2147483000;min-height:44px;min-width:44px;padding:10px 16px;border:0;border-radius:999px;background:#0B1F33;color:#fff;font:600 15px/1.2 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer}' +
    '.b span{color:#C9A227;font-size:12px;display:block;font-weight:600}' +
    '.b:focus-visible,.i:focus-visible,.x:focus-visible{outline:3px solid #C9A227;outline-offset:2px}' +
    '.d{position:fixed;right:16px;bottom:72px;z-index:2147483001;width:min(360px,calc(100vw - 32px));max-height:min(70vh,560px);overflow:auto;background:#fff;color:#102B43;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.3);font:15px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;padding:14px}' +
    '.d[hidden]{display:none}.h{display:flex;justify-content:space-between;align-items:center;gap:8px}.h strong{font-size:16px}' +
    '.n{font-size:12px;color:#8a6d00;margin:2px 0 10px}.x{min-height:44px;min-width:44px;border:0;background:transparent;font-size:22px;cursor:pointer;color:#102B43}' +
    '.l{list-style:none;margin:0;padding:0}.l li{margin:0 0 6px}' +
    '.i{display:block;width:100%;text-align:left;min-height:44px;padding:8px 10px;border:1px solid #d9e0e6;border-radius:10px;background:#fff;color:#102B43;font:inherit;cursor:pointer}' +
    '.i small{display:block;color:#5b6b7a;font-size:13px}.i[aria-current=true]{border-color:#C9A227;background:#fffaf0}.e{color:#b42318;font-size:14px;min-height:1em;margin:6px 0 0}' +
    '@media (prefers-color-scheme:dark){.d{background:#16212c;color:#e8eef3}.x{color:#e8eef3}.i{background:#16212c;color:#e8eef3;border-color:#2c3a46}.i small{color:#9fb0bf}.i[aria-current=true]{background:#2a2410}.n{color:#C9A227}}';

  var host;
  var root;
  var button;
  var dialog;
  var list;
  var errorLine;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }
  function mount() {
    if (host) return;
    var t = T[lang()];
    host = el('div');
    host.id = 'ads-demo-switch';
    root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    try {
      var sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      root.adoptedStyleSheets = [sheet];
    } catch (e) {
      var style = el('style');
      style.textContent = CSS;
      root.appendChild(style);
    }
    button = el('button', 'b');
    button.type = 'button';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    button.appendChild(el('span', '', t.note));
    button.appendChild(document.createTextNode(t.button));
    dialog = el('div', 'd');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', t.button);
    dialog.hidden = true;
    var head = el('div', 'h');
    head.appendChild(el('strong', '', t.title));
    var close = el('button', 'x', '×');
    close.type = 'button';
    close.setAttribute('aria-label', t.close);
    close.addEventListener('click', hide);
    head.appendChild(close);
    dialog.appendChild(head);
    dialog.appendChild(el('p', 'n', t.note));
    list = el('ul', 'l');
    dialog.appendChild(list);
    errorLine = el('p', 'e');
    errorLine.setAttribute('role', 'status');
    dialog.appendChild(errorLine);
    button.addEventListener('click', function () { return dialog.hidden ? show() : hide(); });
    dialog.addEventListener('keydown', function (e) { if (e.key === 'Escape') { hide(); button.focus(); } });
    root.appendChild(button);
    root.appendChild(dialog);
    document.body.appendChild(host);
  }
  function unmount() {
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null;
  }
  function hide() {
    if (!dialog) return;
    dialog.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  }
  function show() {
    var t = T[lang()];
    dialog.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    errorLine.textContent = '';
    list.textContent = '';
    list.appendChild(el('li', '', t.loading));
    window.adsIdentity.demoPersonas().then(function (info) {
      list.textContent = '';
      if (!info) { errorLine.textContent = t.failed; return; }
      var l = lang();
      var items = (info.owner ? [info.owner] : []).concat(info.personas || []);
      items.forEach(function (p) {
        var li = el('li');
        var b = el('button', 'i');
        b.type = 'button';
        b.setAttribute('data-persona', p.key);
        var current = p.key === info.current;
        if (current) b.setAttribute('aria-current', 'true');
        b.appendChild(document.createTextNode(((p.label && (p.label[l] || p.label.en)) || p.key) + (current ? ' (' + t.current + ')' : '')));
        var hint = p.hint && (p.hint[l] || p.hint.en);
        if (hint) b.appendChild(el('small', '', hint));
        b.addEventListener('click', function () { choose(p.key); });
        li.appendChild(b);
        list.appendChild(li);
      });
      var first = list.querySelector('button');
      if (first) first.focus();
    }, function () { list.textContent = ''; errorLine.textContent = t.failed; });
  }
  function choose(key) {
    var t = T[lang()];
    errorLine.textContent = '';
    window.adsIdentity.switchDemoPersona(key).then(function (user) {
      hide();
      try { window.dispatchEvent(new CustomEvent('ads-demo-switch', { detail: { persona: key, user: user } })); } catch (e) { /* old browsers */ }
      if (reload) location.reload();
    }, function () { errorLine.textContent = t.failed; });
  }
  function render(user) {
    if (user && user.demoSandbox && typeof window.adsIdentity.switchDemoPersona === 'function') mount();
    else unmount();
  }
  function start() {
    var ids = window.adsIdentity;
    ids.ready.then(function () { return ids.getAccessToken(); }).then(function () { render(ids.getUser()); }, function () {});
    ids.onChange(render);
  }
  function whenReady(tries) {
    if (window.adsIdentity && window.adsIdentity.ready && document.body) return start();
    if (tries > 200) return;
    setTimeout(function () { whenReady(tries + 1); }, 50);
  }
  whenReady(0);
})();

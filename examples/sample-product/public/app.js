(function () {
  'use strict';
  var T = {
    en: {
      title: 'ADS Sample Product', signIn: 'Sign in', signOut: 'Sign out', signedOut: 'Sign in to see your notes.',
      signedInAs: 'Signed in as {email}', notes: 'Notes', newNote: 'New note', addNote: 'Add note', noNotes: 'No notes yet',
      payments: 'Mobile money payment', operator: 'Operator', phone: 'Phone number', amount: 'Amount (XAF)', pay: 'Request payment',
      testMode: 'TEST MODE - no real money', noRole: 'Your account has no access to this feature.',
      status: { PENDING: 'Waiting for approval on the phone', PAID: 'Paid', FAILED: 'Failed', EXPIRED: 'Expired: the payer did not approve in time' },
      error: 'Something went wrong. Please try again.',
    },
    fr: {
      title: 'Produit exemple ADS', signIn: 'Se connecter', signOut: 'Se déconnecter', signedOut: 'Connectez-vous pour voir vos notes.',
      signedInAs: 'Connecté en tant que {email}', notes: 'Notes', newNote: 'Nouvelle note', addNote: 'Ajouter la note', noNotes: 'Aucune note pour le moment',
      payments: 'Paiement mobile money', operator: 'Opérateur', phone: 'Numéro de téléphone', amount: 'Montant (XAF)', pay: 'Demander le paiement',
      testMode: 'MODE TEST - aucun argent réel', noRole: "Votre compte n'a pas accès à cette fonction.",
      status: { PENDING: 'En attente de validation sur le téléphone', PAID: 'Payé', FAILED: 'Échec', EXPIRED: "Expiré : le payeur n'a pas validé à temps" },
      error: "Une erreur s'est produite. Veuillez réessayer.",
    },
  };
  var lang = /^fr\b/i.test(navigator.language || '') ? 'fr' : 'en';
  var t = T[lang];
  var testMode = (document.currentScript && document.currentScript.dataset.testMode) === 'true';
  var $ = function (id) { return document.getElementById(id); };

  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = t[el.dataset.i18n]; });
  if (testMode) { $('test-mode').textContent = t.testMode; $('test-mode').hidden = false; }

  function showError(message) { $('error').textContent = message; $('error').hidden = !message; }

  async function api(method, path, body) {
    var token = await window.adsIdentity.getAccessToken();
    var res = await fetch(path, {
      method: method,
      headers: Object.assign({ authorization: 'Bearer ' + token }, body ? { 'content-type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) { var e = new Error((data.error && data.error.code) || ('HTTP_' + res.status)); e.status = res.status; throw e; }
    return data;
  }

  function renderNotes(items) {
    var list = $('notes');
    list.textContent = '';
    items.forEach(function (n) {
      var li = document.createElement('li');
      li.textContent = n.body;
      li.dataset.id = n.id;
      list.appendChild(li);
    });
    $('notes-empty').hidden = items.length > 0;
  }

  async function loadNotes() {
    try {
      renderNotes((await api('GET', '/api/notes')).items);
      $('notes-section').hidden = false;
    } catch (e) {
      if (e.status !== 403) showError(t.error);
    }
  }

  function renderPayment(p) {
    var el = $('pay-status');
    el.dataset.status = p.status;
    el.textContent = t.status[p.status] + (p.failureReason ? ' (' + p.failureReason + ')' : '');
  }
  async function watchPayment(id) {
    for (var i = 0; i < 200; i++) {
      var p = await api('GET', '/api/payments/' + id);
      renderPayment(p);
      if (p.status !== 'PENDING') return;
      await new Promise(function (r) { setTimeout(r, 300); });
    }
  }

  $('note-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    showError('');
    try {
      await api('POST', '/api/notes', { body: $('note-text').value });
      $('note-text').value = '';
      await loadNotes();
    } catch (err) { showError(err.status === 403 ? t.noRole : t.error); }
  });
  $('pay-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    showError('');
    try {
      var p = await api('POST', '/api/payments', { operator: $('operator').value, msisdn: $('msisdn').value, amount: Number($('amount').value) });
      renderPayment(p);
      if (p.status === 'PENDING') await watchPayment(p.id);
    } catch (err) { showError(err.status === 403 ? t.noRole : t.error); }
  });

  window.adsIdentity.mountButton($('sign-in'), { signIn: t.signIn, signOut: t.signOut });
  window.adsIdentity.ready.then(async function () {
    var user = window.adsIdentity.getUser();
    if (!user) { $('who').textContent = t.signedOut; return; }
    $('who').textContent = t.signedInAs.replace('{email}', user.email);
    if (user.roles.indexOf('cashier') >= 0) $('pay-section').hidden = false;
    await loadNotes();
  });
})();

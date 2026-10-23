// BRIEF18 hosted pages for personal demo sandboxes: "Try ADS free for 30 days" sign-up, the one-time
// code page and "Preparing your demo…". English and French; phone (360 px), tablet and desktop.
import { layout } from './pages.mjs';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fill = (s, vars) => esc(s).replace(/\{(\w+)\}/g, (_, k) => esc(vars[k] ?? ''));

export const SANDBOX_T = {
  en: {
    badge: 'Test mode · ADS demo',
    title: 'Try ADS free for 30 days',
    lead: 'Your own private demo of every ADS app, with sample data. Act as any role (shopper, cashier, bank agent, reviewer…) with one click. Ready in under a minute.',
    contact: 'Email or mobile number', contactHint: 'Mobile: international format, e.g. +237 6XX XX XX XX. We send you a 6-digit code.',
    consent: 'I understand that this demo, all its data and my demo account are deleted 30 days after sign-up. I will get a reminder 7 days and 1 day before. I will enter test data only.',
    privacy: 'We use your email or number only to send this code and the two reminders, and delete it with your demo.',
    send: 'Send my code', browse: 'Just looking? Use the shared demo account', haveCode: 'Already have a demo? Enter the same email or number to get a new code.',
    codeTitle: 'Enter your code', codeBody: 'We sent a 6-digit code to {to}. It expires in {minutes} minutes.',
    testCode: 'Test mode: text messages are simulated in the demo, so here is the code we just sent:',
    code: '6-digit code', start: 'Start my demo', newCode: 'Send a new code',
    preparingTitle: 'Preparing your demo…', preparingBody: 'We are creating your private organisations and test accounts in each app. This usually takes less than a minute.',
    readyTitle: 'Your demo is ready', readyBody: 'Your private demo is ready. Everything you do stays in your own sandbox.',
    until: 'Available until {date}. You will get a reminder 7 days and 1 day before it is deleted.',
    continue: 'Continue', continueTo: 'Continue to {product}', apps: 'Apps in your demo',
    status: { ready: 'Ready', pending: 'Preparing…', provisioning: 'Preparing…', not_available: 'Not available yet', failed: 'Not available yet', deleting: 'Deleting', deleted: 'Deleted' },
    noscript: 'This page refreshes every few seconds.',
    errors: {
      CONTACT_INVALID: 'Enter an email address or a mobile number.', EMAIL_INVALID: 'Enter a valid email address.',
      PHONE_INVALID: 'Enter the mobile number in international format, e.g. +237 6XX XX XX XX.',
      EMAIL_RESERVED: 'This email address is reserved. Use your own email address.',
      CONSENT_REQUIRED: 'Please confirm that you understand the demo is deleted after 30 days.',
      DAILY_LIMIT_REACHED: 'Too many demo sign-ups today from this address or number. Try again tomorrow.',
      CODE_WRONG: 'That code is not right. Check it and try again.', CODE_EXPIRED: 'This code has expired or was used too many times. Ask for a new one.',
      CODE_NOT_SENT: 'We could not send the code. Check the email or number and try again.',
      SANDBOXES_FULL: 'All demo places are taken right now. Please try again later, or use the shared demo account.',
      FORM_EXPIRED: 'This form expired. Please try again.', TOO_MANY_ATTEMPTS: 'Too many attempts. Wait a few minutes and try again.',
      NOT_SIGNED_IN: 'Your demo sign-in has ended. Enter your email or number to get a new code.',
    },
  },
  fr: {
    badge: 'Mode test · Démo ADS',
    title: 'Essayez ADS gratuitement pendant 30 jours',
    lead: 'Votre propre démo privée de toutes les applications ADS, avec des données d’exemple. Jouez n’importe quel rôle (client, caissier, agent de banque, vérificateur…) en un clic. Prête en moins d’une minute.',
    contact: 'E-mail ou numéro de mobile', contactHint: 'Mobile : format international, par ex. +237 6XX XX XX XX. Nous vous envoyons un code à 6 chiffres.',
    consent: 'Je comprends que cette démo, toutes ses données et mon compte de démo sont supprimés 30 jours après l’inscription. Je recevrai un rappel 7 jours et 1 jour avant. Je saisirai uniquement des données de test.',
    privacy: 'Nous utilisons votre e-mail ou numéro uniquement pour ce code et les deux rappels, et le supprimons avec votre démo.',
    send: 'Recevoir mon code', browse: 'Juste un coup d’œil ? Utilisez le compte de démo partagé', haveCode: 'Vous avez déjà une démo ? Saisissez le même e-mail ou numéro pour recevoir un nouveau code.',
    codeTitle: 'Saisissez votre code', codeBody: 'Nous avons envoyé un code à 6 chiffres à {to}. Il expire dans {minutes} minutes.',
    testCode: 'Mode test : les SMS sont simulés dans la démo. Voici le code que nous venons d’envoyer :',
    code: 'Code à 6 chiffres', start: 'Démarrer ma démo', newCode: 'Recevoir un nouveau code',
    preparingTitle: 'Préparation de votre démo…', preparingBody: 'Nous créons vos organisations privées et vos comptes de test dans chaque application. Cela prend généralement moins d’une minute.',
    readyTitle: 'Votre démo est prête', readyBody: 'Votre démo privée est prête. Tout ce que vous faites reste dans votre propre espace.',
    until: 'Disponible jusqu’au {date}. Vous recevrez un rappel 7 jours et 1 jour avant sa suppression.',
    continue: 'Continuer', continueTo: 'Continuer vers {product}', apps: 'Applications de votre démo',
    status: { ready: 'Prête', pending: 'Préparation…', provisioning: 'Préparation…', not_available: 'Pas encore disponible', failed: 'Pas encore disponible', deleting: 'Suppression', deleted: 'Supprimée' },
    noscript: 'Cette page s’actualise toutes les quelques secondes.',
    errors: {
      CONTACT_INVALID: 'Saisissez une adresse e-mail ou un numéro de mobile.', EMAIL_INVALID: 'Saisissez une adresse e-mail valide.',
      PHONE_INVALID: 'Saisissez le numéro au format international, par ex. +237 6XX XX XX XX.',
      EMAIL_RESERVED: 'Cette adresse e-mail est réservée. Utilisez votre propre adresse.',
      CONSENT_REQUIRED: 'Confirmez que vous comprenez que la démo est supprimée après 30 jours.',
      DAILY_LIMIT_REACHED: 'Trop d’inscriptions à la démo aujourd’hui depuis cette adresse ou ce numéro. Réessayez demain.',
      CODE_WRONG: 'Ce code n’est pas correct. Vérifiez-le et réessayez.', CODE_EXPIRED: 'Ce code a expiré ou a été essayé trop de fois. Demandez-en un nouveau.',
      CODE_NOT_SENT: 'Nous n’avons pas pu envoyer le code. Vérifiez l’e-mail ou le numéro et réessayez.',
      SANDBOXES_FULL: 'Toutes les places de démo sont prises pour le moment. Réessayez plus tard ou utilisez le compte de démo partagé.',
      FORM_EXPIRED: 'Ce formulaire a expiré. Réessayez.', TOO_MANY_ATTEMPTS: 'Trop de tentatives. Patientez quelques minutes.',
      NOT_SIGNED_IN: 'Votre connexion à la démo a pris fin. Saisissez votre e-mail ou numéro pour recevoir un nouveau code.',
    },
  },
};

const styles = `.sbx-badge{display:inline-block;padding:2px 10px;border-radius:999px;border:1px solid #C9A227;color:#8a6d00;font-size:12px;font-weight:700;letter-spacing:.02em;margin-bottom:10px}
@media (prefers-color-scheme:dark){.sbx-badge{color:#C9A227}}
.sbx-consent{display:flex;gap:10px;align-items:flex-start;margin:16px 0 0;font-size:14px;color:var(--ink)}
.sbx-consent input{width:22px;height:22px;flex:0 0 22px;margin:2px 0 0;accent-color:var(--accent)}
.sbx-note{font-size:13px;color:var(--muted);margin:12px 0 0}
.sbx-code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:24px;letter-spacing:.3em;text-align:center}
.sbx-test{background:#0B1F33;color:#fff;border-radius:10px;padding:12px 14px;margin:12px 0;font-size:14px}.sbx-test strong{display:block;font-size:26px;letter-spacing:.25em;color:#C9A227;margin-top:4px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.sbx-list{list-style:none;padding:0;margin:12px 0 0;display:grid;grid-template-columns:1fr;gap:6px}
@media (min-width:700px){.sbx-list{grid-template-columns:1fr 1fr}}
.sbx-list li{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:14px;min-width:0}
.sbx-list li span:first-child{overflow-wrap:anywhere}
.sbx-chip{flex:0 0 auto;font-size:12px;padding:2px 8px;border-radius:999px;border:1px solid var(--line);white-space:nowrap}
.sbx-chip[data-status=ready]{background:#ecfdf3;border-color:#abefc6;color:#067647}
.sbx-chip[data-status=not_available],.sbx-chip[data-status=failed]{color:var(--muted)}
.sbx-spinner{display:inline-block;width:14px;height:14px;border:2px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:sbx-spin 1s linear infinite;vertical-align:-2px;margin-right:6px}
@keyframes sbx-spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.sbx-spinner{animation:none}}
button,.button{min-height:44px}
main{max-width:560px}`;

const errorBox = (t, code) => (code ? `<div class="error" role="alert">${esc(t.errors[code] ?? t.errors.FORM_EXPIRED)}</div>` : '');
const hidden = (name, value) => (value ? `<input type="hidden" name="${esc(name)}" value="${esc(value)}">` : '');

// ctx: { locale, nonce, client, csrf, req, error, values }
export function renderSandboxPage(view, ctx) {
  const { locale, nonce, client, csrf, req, error, values = {} } = ctx;
  const t = SANDBOX_T[locale];
  const q = req ? `?req=${encodeURIComponent(req)}` : '';
  const langPath = `${ctx.path}${q}`;
  const head = `<style nonce="${esc(nonce)}">${styles}</style><span class="sbx-badge">${esc(t.badge)}</span>`;
  const base = { locale, client, nonce, langPath, wide: false };
  const fields = hidden('csrf', csrf) + hidden('req', req) + hidden('lang', locale);
  switch (view) {
    case 'signup':
      return layout({ ...base, title: t.title, body: `${head}<h1>${esc(t.title)}</h1><p>${esc(t.lead)}</p>${errorBox(t, error)}
<form method="post" action="/demo/signup" novalidate>${fields}
<label for="contact">${esc(t.contact)}</label>
<input id="contact" name="contact" type="text" inputmode="email" autocomplete="username" autocapitalize="off" spellcheck="false" required maxlength="254" aria-describedby="contact-hint" value="${esc(values.contact)}">
<div class="hint" id="contact-hint">${esc(t.contactHint)}</div>
<label class="sbx-consent" for="consent"><input id="consent" name="consent" type="checkbox" value="yes" required${values.consent ? ' checked' : ''}><span>${esc(t.consent)}</span></label>
<button type="submit" id="signup-submit">${esc(t.send)}</button></form>
<p class="sbx-note">${esc(t.privacy)}</p><p class="sbx-note">${esc(t.haveCode)}</p>
<div class="links"><a href="/login${q}">${esc(t.browse)}</a></div>` });
    case 'code':
      return layout({ ...base, title: t.codeTitle, body: `${head}<h1>${esc(t.codeTitle)}</h1><p>${fill(t.codeBody, { to: values.masked, minutes: values.minutes })}</p>
${values.testCode ? `<div class="sbx-test" role="note" data-test-code>${esc(t.testCode)}<strong id="test-code">${esc(values.testCode)}</strong></div>` : ''}${errorBox(t, error)}
<form method="post" action="/demo/verify" novalidate>${fields}
<label for="code">${esc(t.code)}</label>
<input id="code" name="code" class="sbx-code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required>
<button type="submit" id="verify-submit">${esc(t.start)}</button></form>
<div class="links"><a href="/demo/signup${q}">${esc(t.newCode)}</a></div>` });
    case 'preparing': {
      const st = values.status;
      const ready = st.settled;
      const date = new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(st.expires_at));
      const product = client?.display_name;
      const items = st.products.map(p => `<li data-product="${esc(p.product)}"><span>${esc(p.name)}</span><span class="sbx-chip" data-status="${esc(p.status)}">${esc(t.status[p.status] ?? p.status)}</span></li>`).join('');
      const strings = { status: t.status, readyTitle: t.readyTitle, readyBody: t.readyBody };
      return layout({ ...base, title: ready ? t.readyTitle : t.preparingTitle, body: `${head}
${ready ? '' : `<noscript><meta http-equiv="refresh" content="4"><p>${esc(t.noscript)}</p></noscript>`}
<h1 id="sbx-title" aria-live="polite">${ready ? '' : '<span class="sbx-spinner" aria-hidden="true"></span>'}${esc(ready ? t.readyTitle : t.preparingTitle)}</h1>
<p id="sbx-body">${esc(ready ? t.readyBody : t.preparingBody)}</p>
<p class="sbx-note">${fill(t.until, { date })}</p>
<a class="button" id="sbx-continue" href="/demo/continue${q}"${st.can_continue ? '' : ' hidden'}>${product ? fill(t.continueTo, { product }) : esc(t.continue)}</a>
<h2>${esc(t.apps)}</h2><ul class="sbx-list" id="sbx-products">${items}</ul>
<script nonce="${esc(nonce)}">(function(){var T=${JSON.stringify(strings).replace(/</g, '\\u003c')};var done=${ready ? 'true' : 'false'};
function draw(s){var list=document.getElementById('sbx-products');s.products.forEach(function(p){var li=list.querySelector('li[data-product="'+p.product+'"]');if(!li)return;var c=li.querySelector('.sbx-chip');c.setAttribute('data-status',p.status);c.textContent=T.status[p.status]||p.status;});
if(s.can_continue)document.getElementById('sbx-continue').hidden=false;
if(s.settled&&!done){done=true;var h=document.getElementById('sbx-title');h.textContent=T.readyTitle;document.getElementById('sbx-body').textContent=T.readyBody;}}
function poll(){if(done)return;fetch('/demo/v1/sandbox/status${q}',{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(s){if(s)draw(s);}).catch(function(){}).then(function(){if(!done)setTimeout(poll,1500);});}
setTimeout(poll,800);})();</script>` });
    }
    default:
      return layout({ ...base, title: t.title, body: `${head}<h1>${esc(t.title)}</h1>${errorBox(t, error)}<div class="links"><a href="/demo/signup${q}">${esc(t.send)}</a></div>` });
  }
}

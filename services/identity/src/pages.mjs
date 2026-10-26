// Server-rendered sign-in pages. No JavaScript needed; forms post back to the identity service.
// Branding comes from the product (oauth client) the user arrived from, with ADS as the fallback.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const T = {
  en: {
    signIn: 'Sign in', signInTo: 'Sign in to {product}', email: 'Email address', password: 'Password',
    continue: 'Continue', google: 'Continue with Google', or: 'or', noAccount: "Don't have an account?",
    createAccount: 'Create an account', forgot: 'Forgot your password?', haveAccount: 'Already have an account?',
    register: 'Create your account', name: 'Full name (optional)', confirm: 'Confirm password',
    passwordHint: 'At least {min} characters.', checkEmail: 'Check your email',
    checkEmailBody: 'If {email} can receive email, we sent a link to it. Open it to continue. The link expires soon, so use it today.',
    resend: 'Send the link again', verified: 'Your email is confirmed', verifiedBody: 'Your account is active. You can sign in now.',
    linkInvalid: 'This link is invalid or has expired', linkInvalidBody: 'Ask for a new one below.',
    forgotTitle: 'Reset your password', forgotBody: 'Enter your email and we will send you a reset link.',
    sendLink: 'Send reset link', resetTitle: 'Choose a new password', savePassword: 'Save new password',
    resetDone: 'Password changed', resetDoneBody: 'You were signed out everywhere. Sign in with your new password.',
    chooseTitle: 'Choose a workspace', chooseBody: 'Your account belongs to several organisations. Which one do you want to use in {product}?',
    noAccessTitle: 'No access yet', noAccessBody: 'This account does not have access to {product}. Choose Switch account to sign in with an authorized account.', switchAccount: 'Switch account',
    errorTitle: 'Something went wrong', backToSignIn: 'Back to sign in', securedBy: 'Secured by Africa Digital Synergy',
    signedIn: 'You are signed in', signedInBody: 'Signed in as {email}. You can now open any ADS app.',
    signedOut: 'You are signed out', signedOutBody: 'You have been signed out of your ADS account on this device.',
    activateTitle: 'Confirm your email', activateBody: 'Enter the password you chose when you registered to activate your account.', activate: 'Activate and sign in',
    confirmLogout: 'Sign out?', confirmLogoutBody: 'Sign out of your ADS account on this device?', signOut: 'Sign out',
    inviteTitle: 'You are invited', inviteBody: '{organization} invited {email} to {product} as {roles}.',
    inviteSignIn: 'Sign in to accept', inviteRegister: 'Create my ADS account', inviteAccept: 'Accept and join',
    inviteAs: 'You are signed in as {email}.', inviteWrongAccount: 'This invitation is for {email}, but you are signed in as {current}. Sign out, then sign in or create an account with {email}.',
    inviteSwitch: 'Sign out and use {email}', inviteAccepted: 'Welcome to {organization}', inviteAcceptedBody: 'You now have access to {product} as {roles}.',
    openProduct: 'Open {product}', inviteInvalid: 'This invitation is invalid or has expired', inviteInvalidBody: 'Ask the person who invited you to send a new one.',
    demoTitle: 'Try the ADS demo', demoBody: 'Use the shared demo account. Everything you see is sample data, and it is reset every night.',
    demoUse: 'Use demo account', demoFilled: 'Demo account filled in. Select Continue to sign in.', demoBadge: 'Demo environment',
    personasBody: 'Choose who you want to be. Each person sees only their own job. Everything is sample data, and it is reset every night.',
    personasList: 'Demo people', personaPassword: 'Password for every person below', personaUse: 'Use this account',
    personaFilled: 'Account "{name}" filled in. Select Continue to sign in.', personasAll: 'Or use the demo user, who holds every role:',
    errors: {
      INVALID_CREDENTIALS: 'Email or password is incorrect.',
      EMAIL_NOT_VERIFIED: 'Please confirm your email first. We just sent you a new link.',
      ACCOUNT_DISABLED: 'This account is disabled. Contact your administrator.',
      TOO_MANY_ATTEMPTS: 'Too many attempts. Wait a few minutes and try again.',
      EMAIL_INVALID: 'Enter a valid email address.',
      EMAIL_ALREADY_REGISTERED: 'An account already exists for this email. Sign in or reset your password.',
      PASSWORD_TOO_SHORT: 'The password is too short.', PASSWORD_TOO_LONG: 'The password is too long.',
      PASSWORD_TOO_WEAK: 'Choose a less common password.', PASSWORDS_DO_NOT_MATCH: 'The two passwords do not match.',
      FORM_EXPIRED: 'This form expired. Please try again.', SIGN_IN_REQUEST_EXPIRED: 'The sign-in request expired. Go back to the app and try again.',
      GOOGLE_SIGN_IN_FAILED: 'Google sign-in did not complete. Please try again.', GOOGLE_EMAIL_NOT_VERIFIED: 'Your Google email is not verified.',
      UNKNOWN_CLIENT: 'This app is not registered for ADS sign-in.', INVALID_REDIRECT_URI: 'This app sent an invalid return address.',
      INVALID_REQUEST: 'The sign-in request is not valid.',
      INVITATION_INVALID: 'This invitation is invalid or has expired.', INVITATION_EMAIL_MISMATCH: 'This invitation was sent to another email address.',
      DEMO_ACCOUNT_REFUSED: 'Demo accounts work only in the ADS demo environment.', DEMO_ACCOUNT_LOCKED: 'The demo account cannot be changed.',
      EMAIL_RESERVED: 'This email address is reserved. Use your own email address.',
    },
  },
  fr: {
    signIn: 'Se connecter', signInTo: 'Se connecter à {product}', email: 'Adresse e-mail', password: 'Mot de passe',
    continue: 'Continuer', google: 'Continuer avec Google', or: 'ou', noAccount: "Vous n'avez pas de compte ?",
    createAccount: 'Créer un compte', forgot: 'Mot de passe oublié ?', haveAccount: 'Vous avez déjà un compte ?',
    register: 'Créez votre compte', name: 'Nom complet (facultatif)', confirm: 'Confirmez le mot de passe',
    passwordHint: 'Au moins {min} caractères.', checkEmail: 'Vérifiez vos e-mails',
    checkEmailBody: "Si {email} peut recevoir des e-mails, nous y avons envoyé un lien. Ouvrez-le pour continuer. Le lien expire bientôt, utilisez-le aujourd'hui.",
    resend: 'Renvoyer le lien', verified: 'Votre e-mail est confirmé', verifiedBody: 'Votre compte est actif. Vous pouvez vous connecter.',
    linkInvalid: 'Ce lien est invalide ou a expiré', linkInvalidBody: 'Demandez-en un nouveau ci-dessous.',
    forgotTitle: 'Réinitialiser le mot de passe', forgotBody: 'Saisissez votre e-mail et nous vous enverrons un lien.',
    sendLink: 'Envoyer le lien', resetTitle: 'Choisissez un nouveau mot de passe', savePassword: 'Enregistrer',
    resetDone: 'Mot de passe modifié', resetDoneBody: 'Toutes vos sessions ont été fermées. Connectez-vous avec le nouveau mot de passe.',
    chooseTitle: 'Choisissez un espace', chooseBody: 'Votre compte appartient à plusieurs organisations. Laquelle voulez-vous utiliser dans {product} ?',
    noAccessTitle: "Pas encore d'accès", noAccessBody: "Ce compte n'a pas accès à {product}. Choisissez Changer de compte pour vous connecter avec un compte autorisé.", switchAccount: 'Changer de compte',
    errorTitle: 'Une erreur est survenue', backToSignIn: 'Retour à la connexion', securedBy: 'Sécurisé par Africa Digital Synergy',
    signedIn: 'Vous êtes connecté', signedInBody: 'Connecté en tant que {email}. Vous pouvez ouvrir toutes les applications ADS.',
    signedOut: 'Vous êtes déconnecté', signedOutBody: 'Vous avez été déconnecté de votre compte ADS sur cet appareil.',
    activateTitle: 'Confirmez votre e-mail', activateBody: "Saisissez le mot de passe choisi lors de l'inscription pour activer votre compte.", activate: 'Activer et se connecter',
    confirmLogout: 'Se déconnecter ?', confirmLogoutBody: 'Se déconnecter de votre compte ADS sur cet appareil ?', signOut: 'Se déconnecter',
    inviteTitle: 'Vous êtes invité', inviteBody: '{organization} invite {email} sur {product} en tant que {roles}.',
    inviteSignIn: 'Se connecter pour accepter', inviteRegister: 'Créer mon compte ADS', inviteAccept: 'Accepter et rejoindre',
    inviteAs: 'Vous êtes connecté en tant que {email}.', inviteWrongAccount: "Cette invitation est destinée à {email}, mais vous êtes connecté en tant que {current}. Déconnectez-vous, puis connectez-vous ou créez un compte avec {email}.",
    inviteSwitch: 'Se déconnecter et utiliser {email}', inviteAccepted: 'Bienvenue chez {organization}', inviteAcceptedBody: 'Vous avez maintenant accès à {product} en tant que {roles}.',
    openProduct: 'Ouvrir {product}', inviteInvalid: 'Cette invitation est invalide ou a expiré', inviteInvalidBody: "Demandez à la personne qui vous a invité d'en envoyer une nouvelle.",
    demoTitle: 'Essayer la démo ADS', demoBody: 'Utilisez le compte de démonstration partagé. Toutes les données sont fictives et remises à zéro chaque nuit.',
    demoUse: 'Utiliser le compte démo', demoFilled: 'Compte de démonstration saisi. Sélectionnez Continuer pour vous connecter.', demoBadge: 'Environnement de démonstration',
    personasBody: 'Choisissez qui vous voulez être. Chaque personne ne voit que son propre travail. Toutes les données sont fictives et remises à zéro chaque nuit.',
    personasList: 'Personnes de démonstration', personaPassword: 'Mot de passe de toutes les personnes ci-dessous', personaUse: 'Utiliser ce compte',
    personaFilled: 'Compte « {name} » saisi. Sélectionnez Continuer pour vous connecter.', personasAll: 'Ou utilisez le compte démo qui a tous les rôles :',
    errors: {
      INVALID_CREDENTIALS: 'E-mail ou mot de passe incorrect.',
      EMAIL_NOT_VERIFIED: "Confirmez d'abord votre e-mail. Nous venons de vous envoyer un nouveau lien.",
      ACCOUNT_DISABLED: 'Ce compte est désactivé. Contactez votre administrateur.',
      TOO_MANY_ATTEMPTS: 'Trop de tentatives. Patientez quelques minutes.',
      EMAIL_INVALID: 'Saisissez une adresse e-mail valide.',
      EMAIL_ALREADY_REGISTERED: 'Un compte existe déjà pour cet e-mail. Connectez-vous ou réinitialisez le mot de passe.',
      PASSWORD_TOO_SHORT: 'Le mot de passe est trop court.', PASSWORD_TOO_LONG: 'Le mot de passe est trop long.',
      PASSWORD_TOO_WEAK: 'Choisissez un mot de passe moins courant.', PASSWORDS_DO_NOT_MATCH: 'Les deux mots de passe ne correspondent pas.',
      FORM_EXPIRED: 'Ce formulaire a expiré. Réessayez.', SIGN_IN_REQUEST_EXPIRED: "La demande de connexion a expiré. Retournez dans l'application et réessayez.",
      GOOGLE_SIGN_IN_FAILED: "La connexion Google n'a pas abouti. Réessayez.", GOOGLE_EMAIL_NOT_VERIFIED: "Votre e-mail Google n'est pas vérifié.",
      UNKNOWN_CLIENT: "Cette application n'est pas enregistrée pour la connexion ADS.", INVALID_REDIRECT_URI: "Cette application a envoyé une adresse de retour invalide.",
      INVALID_REQUEST: "La demande de connexion n'est pas valide.",
      INVITATION_INVALID: 'Cette invitation est invalide ou a expiré.', INVITATION_EMAIL_MISMATCH: 'Cette invitation a été envoyée à une autre adresse e-mail.',
      DEMO_ACCOUNT_REFUSED: "Les comptes de démonstration ne fonctionnent que dans l'environnement de démonstration ADS.", DEMO_ACCOUNT_LOCKED: 'Le compte de démonstration ne peut pas être modifié.',
      EMAIL_RESERVED: 'Cette adresse e-mail est réservée. Utilisez votre propre adresse.',
    },
  },
};

// 'en' or 'fr' from a language value: a plain code, a tag ('fr-CM') or a list (OIDC ui_locales 'fr-CM en').
// The first English or French entry wins; anything else is null.
export const langOf = value => {
  for (const tag of String(value ?? '').split(/[\s,]+/)) {
    const primary = tag.split(/[-_;]/)[0].toLowerCase();
    if (primary === 'fr' || primary === 'en') return primary;
  }
  return null;
};

export const pickLocale = (query, acceptLanguage, fallback = 'en') => {
  const asked = langOf(query);
  if (asked) return asked;
  if (/^fr\b/i.test(String(acceptLanguage ?? ''))) return 'fr';
  return fallback === 'fr' ? 'fr' : 'en';
};

const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (_, k) => esc(vars[k] ?? ''));

export function layout({ locale, title, client, nonce, body, langPath, wide = false, demo = false }) {
  const t = T[locale];
  const accent = client?.accent_color ?? '#087E79';
  const product = client?.display_name ?? 'Africa Digital Synergy';
  const other = locale === 'fr' ? 'en' : 'fr';
  const sep = langPath.includes('?') ? '&' : '?';
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · ${esc(product)}</title>
${demo ? `<link rel="stylesheet" href="${DEMO_FONTS}">` : ''}<style nonce="${nonce}">${demo ? demoStyles : ''}
:root{--accent:${esc(accent)};--ink:#102B43;--muted:#5b6b7a;--line:#d9e0e6;--bg:#f5f7f9;--card:#fff;--danger:#b42318}
@media (prefers-color-scheme:dark){:root{--ink:#e8eef3;--muted:#9fb0bf;--line:#2c3a46;--bg:#0f1720;--card:#16212c}}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:var(--bg);color:var(--ink);line-height:1.5}
main{max-width:${wide ? 980 : 420}px;margin:0 auto;padding:40px 16px}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:8px 6px;border-bottom:1px solid var(--line);vertical-align:top}
.inline{display:inline}.inline button,.small{display:inline-block;width:auto;margin:2px 4px 2px 0;padding:5px 10px;font-size:13px;font-weight:500}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}.row>*{flex:1 1 180px}.row button{flex:0 0 auto;width:auto}
.tag{display:inline-block;padding:1px 8px;margin:1px 2px;border-radius:999px;border:1px solid var(--line);font-size:12px}
.ok{background:#ecfdf3;border:1px solid #abefc6;color:#067647;padding:10px 12px;border-radius:8px;margin:12px 0;font-size:14px}
select{width:100%;padding:10px;font-size:15px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink)}
h2{font-size:17px;margin:26px 0 8px}.muted{color:var(--muted)}
td .inline input[type=text]{width:auto;min-width:0;max-width:100%;padding:6px 8px;font-size:14px}
@media (max-width:640px){table,tbody,tr,td{display:block;width:100%}thead,td.hide{display:none}
tr{border:1px solid var(--line);border-radius:8px;margin:0 0 10px;padding:6px}td{border:0;padding:4px 2px}td .inline input[type=text]{width:100%}}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:28px}
.brand{display:flex;align-items:center;gap:10px;margin-bottom:20px;font-weight:600}.brand img{height:36px;width:auto}
h1{font-size:22px;margin:0 0 8px}p{margin:0 0 16px;color:var(--muted)}
label{display:block;font-size:14px;margin:14px 0 6px;color:var(--ink)}
input[type=email],input[type=password],input[type=text]{width:100%;padding:11px 12px;font-size:16px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink)}
input:focus,button:focus,a:focus{outline:2px solid var(--accent);outline-offset:2px}
button,.button{display:block;width:100%;margin-top:20px;padding:12px;font-size:16px;font-weight:600;border:0;border-radius:8px;background:var(--accent);color:#fff;cursor:pointer;text-align:center;text-decoration:none}
.secondary{background:transparent;color:var(--ink);border:1px solid var(--line);margin-top:12px}
.or{display:flex;align-items:center;gap:10px;margin:20px 0 4px;color:var(--muted);font-size:13px}.or:before,.or:after{content:"";flex:1;border-top:1px solid var(--line)}
.links{margin-top:18px;font-size:14px}.links a{color:var(--accent)}
.error{background:#fef3f2;border:1px solid #fecdca;color:var(--danger);padding:10px 12px;border-radius:8px;margin:12px 0;font-size:14px}
.hint{font-size:13px;color:var(--muted);margin-top:6px}.choice{display:flex;gap:10px;align-items:center;padding:10px;border:1px solid var(--line);border-radius:8px;margin-top:8px}
footer{display:flex;justify-content:space-between;margin-top:16px;font-size:12px;color:var(--muted)}footer a{color:var(--muted)}
</style></head><body${demo ? ' class="demo-mode"' : ''}><main><div class="card">
<div class="brand">${client?.logo_url ? `<img src="${esc(client.logo_url)}" alt="">` : ''}<span>${esc(product)}</span></div>
${body}
</div><footer><span>${esc(t.securedBy)}</span><a href="${esc(langPath + sep + 'lang=' + other)}">${other === 'fr' ? 'Français' : 'English'}</a></footer></main></body></html>`;
}

// Demo sign-in panel (DE-03): shown only in demo mode with DEMO_SHOW_CREDENTIALS=1, and only for the
// demo USER (never the demo admin). Approved landing look: navy #0B1F33, gold #C9A227, Fraunces + Manrope.
export const DEMO_FONTS = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Manrope:wght@400;600;700&display=swap';
const jsString = v => JSON.stringify(String(v)).replace(/</g, '\\u003c');
const demoPanel = (t, demo, nonce, personas, locale) => (personas?.list?.length ? personaPanel(t, demo, nonce, personas, locale) : `<section class="demo" aria-labelledby="demo-title">
<span class="demo-badge">${esc(t.demoBadge)}</span>
<h2 id="demo-title">${esc(t.demoTitle)}</h2><p id="demo-body">${esc(t.demoBody)}</p>
<dl><dt>${esc(t.email)}</dt><dd><code id="demo-email">${esc(demo.email)}</code></dd><dt>${esc(t.password)}</dt><dd><code id="demo-password">${esc(demo.password)}</code></dd></dl>
<button type="button" id="demo-use" class="demo-use" aria-describedby="demo-body">${esc(t.demoUse)}</button>
<p class="demo-status" id="demo-status" role="status" aria-live="polite"></p>
</section>
<script nonce="${nonce}">(function(){var b=document.getElementById('demo-use');if(!b)return;b.addEventListener('click',function(){
var e=document.getElementById('email'),p=document.getElementById('password');e.value=document.getElementById('demo-email').textContent;
p.value=document.getElementById('demo-password').textContent;document.getElementById('demo-status').textContent=${jsString(t.demoFilled)};
var s=document.getElementById('signin-submit');if(s)s.focus();});})();</script>`);

// BRIEF16 persona picker: the personas of the product the tester came from (client_id), labels in the
// page language, one shared persona password, "Use this account" fills the form. The demo user (every
// role) stays available underneath; the demo admin is never shown.
const personaPanel = (t, demo, nonce, personas, locale) => `<section class="demo" aria-labelledby="demo-title">
<span class="demo-badge">${esc(t.demoBadge)}</span>
<h2 id="demo-title">${esc(t.demoTitle)}</h2><p id="demo-body">${esc(t.personasBody)}</p>
<p class="persona-pw"><span id="persona-password-label">${esc(t.personaPassword)}</span> <code id="persona-password">${esc(personas.password)}</code></p>
<ul class="personas" aria-label="${esc(t.personasList)}">
${personas.list.map(p => {
  const name = p.label?.[locale] ?? p.label?.en ?? p.key;
  const hint = p.hint?.[locale] ?? p.hint?.en ?? '';
  return `<li class="persona" data-persona="${esc(p.key)}"><div class="persona-text"><span class="persona-name">${esc(name)}</span>${hint ? `<span class="persona-hint">${esc(hint)}</span>` : ''}<code class="persona-email">${esc(p.email)}</code></div>
<button type="button" class="persona-use" data-email="${esc(p.email)}" data-name="${esc(name)}" aria-pressed="false" aria-label="${esc(`${t.personaUse}: ${name}`)}">${esc(t.personaUse)}</button></li>`;
}).join('\n')}
</ul>
${demo ? `<div class="demo-all"><p>${esc(t.personasAll)}</p><dl><dt>${esc(t.email)}</dt><dd><code id="demo-email">${esc(demo.email)}</code></dd><dt>${esc(t.password)}</dt><dd><code id="demo-password">${esc(demo.password)}</code></dd></dl>
<button type="button" id="demo-use" class="demo-use secondary-demo" aria-describedby="demo-body">${esc(t.demoUse)}</button></div>` : ''}
<p class="demo-status" id="demo-status" role="status" aria-live="polite"></p>
</section>
<script nonce="${nonce}">(function(){var st=document.getElementById('demo-status');
function fill(email,password,message,button){var e=document.getElementById('email'),p=document.getElementById('password');e.value=email;p.value=password;
var all=document.querySelectorAll('.persona-use');for(var i=0;i<all.length;i++)all[i].setAttribute('aria-pressed',all[i]===button?'true':'false');
st.textContent=message;var s=document.getElementById('signin-submit');if(s)s.focus();}
var pw=document.getElementById('persona-password').textContent,tpl=${jsString(t.personaFilled)},bs=document.querySelectorAll('.persona-use');
for(var i=0;i<bs.length;i++)bs[i].addEventListener('click',function(){fill(this.getAttribute('data-email'),pw,tpl.replace('{name}',this.getAttribute('data-name')),this);});
var d=document.getElementById('demo-use');if(d)d.addEventListener('click',function(){fill(document.getElementById('demo-email').textContent,document.getElementById('demo-password').textContent,${jsString(t.demoFilled)},null);});})();</script>`;
const demoStyles = `.demo{margin:0 0 24px;padding:20px;border-radius:12px;background:#0B1F33;color:#fff;font-family:Manrope,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
.demo h2{font-family:Fraunces,Georgia,"Times New Roman",serif;font-weight:600;font-size:22px;margin:8px 0 6px;color:#fff}
.demo p{color:#dfe7ef;margin:0 0 12px;font-size:15px}.demo dl{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;margin:0 0 14px;font-size:14px}
.demo dt{color:#C9A227;font-weight:600}.demo dd{margin:0;min-width:0}.demo code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:14px;word-break:break-all;color:#fff}
.demo-badge{display:inline-block;padding:2px 10px;border-radius:999px;border:1px solid #C9A227;color:#C9A227;font-size:12px;font-weight:600;letter-spacing:.02em}
.demo .demo-use{min-height:44px;min-width:44px;margin-top:4px;background:#C9A227;color:#0B1F33;font-family:Manrope,system-ui,sans-serif;font-weight:700}
.personas{list-style:none;margin:0 0 14px;padding:0;display:grid;gap:8px}.persona-pw{font-size:14px}.persona-pw code{color:#C9A227;font-weight:700}
.persona{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:10px 12px;border:1px solid rgba(201,162,39,.45);border-radius:10px;background:rgba(255,255,255,.04)}
.persona-text{flex:1 1 170px;min-width:0;display:flex;flex-direction:column;gap:2px}.persona-name{font-weight:700;color:#fff;font-size:15px}.persona-hint{font-size:13px;color:#dfe7ef}
.demo code.persona-email{font-size:12px;color:#d9c27a}
.demo .persona-use{display:inline-block;width:auto;flex:0 0 auto;margin:0;min-height:44px;min-width:44px;padding:8px 14px;font-size:14px;background:#C9A227;color:#0B1F33;font-family:Manrope,system-ui,sans-serif;font-weight:700}
.demo .persona-use:hover{background:#d8b43a}.demo .persona-use:focus{outline:3px solid #fff;outline-offset:2px}.demo .persona-use[aria-pressed=true]{box-shadow:0 0 0 3px #fff}
.demo-all{margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,.2)}.demo .demo-all p{font-size:14px;margin-bottom:8px}
.demo .demo-use:hover{background:#d8b43a}.demo .demo-use:focus{outline:3px solid #fff;outline-offset:2px}.demo .demo-status{margin:8px 0 0;min-height:1em;color:#fff;font-size:14px}
body.demo-mode{font-family:Manrope,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}body.demo-mode h1{font-family:Fraunces,Georgia,"Times New Roman",serif;font-weight:600}`;

const errorBox = (locale, code) => (code ? `<div class="error" role="alert">${esc(T[locale].errors[code] ?? T[locale].errors.INVALID_REQUEST)}</div>` : '');
const hidden = (name, value) => (value ? `<input type="hidden" name="${esc(name)}" value="${esc(value)}">` : '');

export function renderPage(view, ctx) {
  const { locale, client, csrf, req, error, values = {}, googleEnabled, minPassword, nonce } = ctx;
  const t = T[locale];
  const product = client?.display_name ?? 'Africa Digital Synergy';
  const qp = new URLSearchParams();
  if (req) qp.set('req', req);
  if (ctx.next) qp.set('next', ctx.next);
  const q = qp.toString() ? `?${qp}` : '';
  const langPath = ctx.path + (ctx.path.includes('?') ? '' : q);
  const base = { locale, client, nonce, langPath };
  const csrfField = hidden('csrf', csrf) + hidden('req', req) + hidden('lang', locale) + hidden('next', ctx.next);
  switch (view) {
    case 'login':
      return layout({ ...base, demo: Boolean(ctx.demo || ctx.personas), title: t.signIn, body: `${ctx.demo || ctx.personas ? demoPanel(t, ctx.demo, nonce, ctx.personas, locale) : ''}<h1>${fill(t.signInTo, { product })}</h1>${errorBox(locale, error)}
<form method="post" action="/login" novalidate>${csrfField}
<label for="email">${esc(t.email)}</label><input id="email" name="email" type="email" autocomplete="email" required value="${esc(values.email)}">
<label for="password">${esc(t.password)}</label><input id="password" name="password" type="password" autocomplete="current-password" required>
<button type="submit" id="signin-submit">${esc(t.continue)}</button></form>
${googleEnabled ? `<div class="or">${esc(t.or)}</div><a class="button secondary" href="/google/start${q}">${esc(t.google)}</a>` : ''}
<div class="links"><a href="/forgot-password${q}">${esc(t.forgot)}</a><br>${esc(t.noAccount)} <a href="/register${q}">${esc(t.createAccount)}</a></div>` });
    case 'register':
      return layout({ ...base, title: t.register, body: `<h1>${esc(t.register)}</h1>${errorBox(locale, error)}
<form method="post" action="/register" novalidate>${csrfField}
<label for="name">${esc(t.name)}</label><input id="name" name="name" type="text" autocomplete="name" maxlength="120" value="${esc(values.name)}">
<label for="email">${esc(t.email)}</label><input id="email" name="email" type="email" autocomplete="email" required value="${esc(values.email)}">
<label for="password">${esc(t.password)}</label><input id="password" name="password" type="password" autocomplete="new-password" required minlength="${minPassword}">
<div class="hint">${fill(t.passwordHint, { min: minPassword })}</div>
<label for="confirm">${esc(t.confirm)}</label><input id="confirm" name="confirm" type="password" autocomplete="new-password" required>
<button type="submit">${esc(t.createAccount)}</button></form>
${googleEnabled ? `<div class="or">${esc(t.or)}</div><a class="button secondary" href="/google/start${q}">${esc(t.google)}</a>` : ''}
<div class="links">${esc(t.haveAccount)} <a href="/login${q}">${esc(t.signIn)}</a></div>` });
    case 'check_email':
      return layout({ ...base, title: t.checkEmail, body: `<h1>${esc(t.checkEmail)}</h1><p>${fill(t.checkEmailBody, { email: values.email })}</p>
<div class="links"><a href="/login${q}">${esc(t.backToSignIn)}</a></div>` });
    case 'verified':
      return layout({ ...base, title: t.verified, body: `<h1>${esc(t.verified)}</h1><p>${esc(t.verifiedBody)}</p><a class="button" href="/login${q}">${esc(t.signIn)}</a>` });
    case 'link_invalid':
      return layout({ ...base, title: t.linkInvalid, body: `<h1>${esc(t.linkInvalid)}</h1><p>${esc(t.linkInvalidBody)}</p>
<a class="button" href="${esc(values.retry ?? '/forgot-password')}${q}">${esc(values.retryLabel ?? t.sendLink)}</a>` });
    case 'forgot':
      return layout({ ...base, title: t.forgotTitle, body: `<h1>${esc(t.forgotTitle)}</h1><p>${esc(t.forgotBody)}</p>${errorBox(locale, error)}
<form method="post" action="/forgot-password" novalidate>${csrfField}
<label for="email">${esc(t.email)}</label><input id="email" name="email" type="email" autocomplete="email" required value="${esc(values.email)}">
<button type="submit">${esc(t.sendLink)}</button></form><div class="links"><a href="/login${q}">${esc(t.backToSignIn)}</a></div>` });
    case 'reset':
      return layout({ ...base, title: t.resetTitle, body: `<h1>${esc(t.resetTitle)}</h1>${errorBox(locale, error)}
<form method="post" action="/reset-password" novalidate>${csrfField}${hidden('token', values.token)}
<label for="password">${esc(t.password)}</label><input id="password" name="password" type="password" autocomplete="new-password" required minlength="${minPassword}">
<div class="hint">${fill(t.passwordHint, { min: minPassword })}</div>
<label for="confirm">${esc(t.confirm)}</label><input id="confirm" name="confirm" type="password" autocomplete="new-password" required>
<button type="submit">${esc(t.savePassword)}</button></form>` });
    case 'reset_done':
      return layout({ ...base, title: t.resetDone, body: `<h1>${esc(t.resetDone)}</h1><p>${esc(t.resetDoneBody)}</p><a class="button" href="/login${q}">${esc(t.signIn)}</a>` });
    case 'choose_workspace':
      return layout({ ...base, title: t.chooseTitle, body: `<h1>${esc(t.chooseTitle)}</h1><p>${fill(t.chooseBody, { product })}</p>
<form method="post" action="/choose-workspace">${csrfField}
${values.workspaces.map((w, i) => `<label class="choice"><input type="radio" name="tenant" value="${esc(w.tenantId)}"${i === 0 ? ' checked' : ''}> ${esc(w.organizationName)}${w.tenantName !== w.organizationName ? ` · ${esc(w.tenantName)}` : ''}</label>`).join('')}
<button type="submit">${esc(t.continue)}</button></form>` });
    case 'activate':
      return layout({ ...base, title: t.activateTitle, body: `<h1>${esc(t.activateTitle)}</h1><p>${esc(t.activateBody)}</p>${errorBox(locale, error)}
<form method="post" action="/verify-email" novalidate>${csrfField}${hidden('token', values.token)}
<label for="password">${esc(t.password)}</label><input id="password" name="password" type="password" autocomplete="current-password" required>
<button type="submit">${esc(t.activate)}</button></form>
<div class="links"><a href="/forgot-password${q}">${esc(t.forgot)}</a></div>` });
    case 'confirm_logout':
      return layout({ ...base, title: t.confirmLogout, body: `<h1>${esc(t.confirmLogout)}</h1><p>${esc(t.confirmLogoutBody)}</p>
<form method="post" action="/logout">${csrfField}${hidden('client_id', values.clientId)}<button type="submit">${esc(t.signOut)}</button></form>` });
    case 'signed_in':
      return layout({ ...base, title: t.signedIn, body: `<h1>${esc(t.signedIn)}</h1><p>${fill(t.signedInBody, { email: values.email })}</p>` });
    case 'signed_out':
      return layout({ ...base, title: t.signedOut, body: `<h1>${esc(t.signedOut)}</h1><p>${esc(t.signedOutBody)}</p><a class="button" href="/login">${esc(t.signIn)}</a>` });
    case 'invite': {
      const inv = values.invitation;
      const vars = { organization: inv.organizationName, product: inv.productName, email: inv.email, roles: inv.roles.join(', '), current: values.signedInEmail };
      const next = `/invite?token=${values.token}`;
      const enc = encodeURIComponent(next);
      let actions;
      if (values.signedInEmail && values.matches) {
        actions = `<p>${fill(t.inviteAs, { email: values.signedInEmail })}</p>
<form method="post" action="/invite/accept">${hidden('csrf', csrf)}${hidden('lang', locale)}${hidden('token', values.token)}<button type="submit">${esc(t.inviteAccept)}</button></form>`;
      } else if (values.signedInEmail) {
        actions = `<div class="error" role="alert">${fill(t.inviteWrongAccount, vars)}</div>
<form method="post" action="/logout">${hidden('csrf', csrf)}${hidden('lang', locale)}${hidden('next', next)}<button type="submit">${fill(t.inviteSwitch, vars)}</button></form>`;
      } else {
        actions = `<a class="button" href="/login?next=${enc}">${esc(t.inviteSignIn)}</a><a class="button secondary" href="/register?next=${enc}">${esc(t.inviteRegister)}</a>`;
      }
      return layout({ ...base, title: t.inviteTitle, body: `<h1>${esc(t.inviteTitle)}</h1><p>${fill(t.inviteBody, vars)}</p>${errorBox(locale, error)}${actions}` });
    }
    case 'invite_accepted': {
      const vars = { organization: values.organizationName, product: values.productName, roles: values.roles.join(', ') };
      return layout({ ...base, title: fill(t.inviteAccepted, vars), body: `<h1>${fill(t.inviteAccepted, vars)}</h1><p>${fill(t.inviteAcceptedBody, vars)}</p>
${values.productUrl ? `<a class="button" href="${esc(values.productUrl)}">${fill(t.openProduct, vars)}</a>` : ''}` });
    }
    case 'invite_invalid':
      return layout({ ...base, title: t.inviteInvalid, body: `<h1>${esc(t.inviteInvalid)}</h1><p>${esc(t.inviteInvalidBody)}</p>` });
    case 'no_access':
      return layout({ ...base, title: t.noAccessTitle, body: `<section data-ads-no-access="true"><h1>${esc(t.noAccessTitle)}</h1><p>${fill(t.noAccessBody, { product })}</p>
<form method="post" action="/logout">
${csrfField}${hidden('client_id', client?.client_id)}
${hidden('switch_account', '1')}
<button type="submit">${esc(t.switchAccount)}</button></form></section>` });
    default:
      return layout({ ...base, title: t.errorTitle, body: `<h1>${esc(t.errorTitle)}</h1>${errorBox(locale, error)}` });
  }
}

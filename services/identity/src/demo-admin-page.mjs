// Central ADS demo administrator dashboard (/demo-admin): server-rendered, no JavaScript, English and French.
// Every action is a small form posting back to /demo-admin/requests/<id> with the CSRF token; the server
// re-checks that the signed-in user is an ADS demo administrator on every request.
// "Sent" on this page always means the mail provider accepted the message, never proof of inbox delivery.
import { layout } from './pages.mjs';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (_, k) => esc(vars[k] ?? ''));
const hidden = (name, value) => `<input type="hidden" name="${esc(name)}" value="${esc(value)}">`;

const T = {
  en: {
    title: 'ADS demo administration', signedInAs: 'Signed in as {email}.', timesIn: 'Times shown in {zone}.', signOut: 'Sign out',
    nav: { requests: 'Requests', audit: 'Audit' },
    counts: { pending: 'Pending', awaitingActivation: 'Awaiting activation', active: 'Active', expiringSoon: 'Expiring within 7 days' },
    filter: { status: 'Status', platform: 'Platform', q: 'Search (reference or email)', all: 'All', allPlatforms: 'All platforms', apply: 'Filter' },
    col: {
      reference: 'Reference', platform: 'Platform', email: 'Email', requested: 'Requested', request: 'Request', notification: 'Administrator notification',
      access: 'Access', flags: 'Flags', kind: 'Email', recipient: 'Recipient', status: 'Status', attempts: 'Attempts', lastError: 'Last error', sentAt: 'Accepted by provider at',
      at: 'When', event: 'Event', actor: 'By', detail: 'Detail',
    },
    noRequests: 'No demo access requests match.', priorRejection: 'Prior rejection', expires: 'expires {date}',
    req: { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', expired: 'Expired', cancelled: 'Cancelled' },
    notif: { sent: 'Sent (accepted by provider)', queued: 'Queued', failed: 'Failed', none: 'None' },
    grant: { awaiting_activation: 'Awaiting activation', active: 'Active', expired: 'Expired', revoked: 'Revoked' },
    inv: { pending: 'Pending', accepted: 'Accepted', expired: 'Expired', revoked: 'Revoked' },
    mail: { queued: 'Queued', sending: 'Sending', sent: 'Sent (accepted by provider)', failed: 'Failed' },
    kind: { admin_notification: 'Administrator notification', invitation: 'Invitation', rejection: 'Rejection notice' },
    events: {
      demo_access_requested: 'Access requested', demo_access_approved: 'Approved', demo_access_rejected: 'Rejected',
      demo_access_invitation_resent: 'Invitation resent', demo_access_revoked: 'Access revoked', demo_access_activated: 'Account activated', demo_access_expired: 'Access expired',
    },
    lang: { en: 'English', fr: 'French' },
    detail: {
      back: 'All requests', request: 'Request', applicant: 'Applicant email', language: 'Language', requestedAt: 'Requested at', requestExpires: 'Request expires',
      status: 'Status', decidedAt: 'Decided at', decidedBy: 'Decided by', internalNote: 'Internal note (internal — never shown to the applicant)',
      priorWarning: 'This email address had an earlier demo request rejected. Review before approving.',
      grant: 'Demo access', noGrant: 'No demo access has been granted for this request.', personas: 'Personas', invitation: 'Invitation', invitationExpires: 'Invitation expires',
      activatedAt: 'Activated at', accessExpires: 'Access expires', firstLogin: 'First sign-in', lastActivity: 'Last activity', revokedAt: 'Revoked at',
      emails: 'Email log', emailsNote: '"Sent" means the mail provider accepted the message. It does not prove the message reached the inbox.', noEmails: 'No emails recorded.',
      history: 'History', noHistory: 'No history recorded.', actions: 'Actions', noActions: 'No actions are available for this request.',
    },
    act: {
      approve: 'Approve & send invitation', reject: 'Reject', rejectNote: 'Internal reason (optional, never shown to the applicant)',
      resend: 'Resend invitation', revoke: 'Revoke access',
    },
    audit: { title: 'Audit', none: 'No events recorded.' },
    denied: { title: 'Access denied (403)', body: 'You are signed in, but this account is not an ADS demo administrator. Sign out and sign in with an administrator account.' },
    flash: {
      approved: 'Request approved. The invitation was queued for sending.', rejected: 'Request rejected.', resent: 'Invitation queued for resending.', revoked: 'Demo access revoked.',
    },
    errors: {
      REQUEST_NOT_PENDING: 'This request has already been decided.', GRANT_NOT_ACTIVE: 'This demo access is no longer active.',
      NOTHING_TO_RESEND: 'There is no pending invitation to resend.', FORM_EXPIRED: 'This form expired. Please try again.', NOT_FOUND: 'Request not found.',
      generic: 'Something went wrong. Please try again.',
    },
    dash: '—',
  },
  fr: {
    title: 'Administration des démonstrations ADS', signedInAs: 'Connecté en tant que {email}.', timesIn: 'Heures affichées en {zone}.', signOut: 'Se déconnecter',
    nav: { requests: 'Demandes', audit: 'Journal' },
    counts: { pending: 'En attente', awaitingActivation: "En attente d'activation", active: 'Actifs', expiringSoon: 'Expirent sous 7 jours' },
    filter: { status: 'Statut', platform: 'Plateforme', q: 'Recherche (référence ou e-mail)', all: 'Tous', allPlatforms: 'Toutes les plateformes', apply: 'Filtrer' },
    col: {
      reference: 'Référence', platform: 'Plateforme', email: 'E-mail', requested: 'Demandée le', request: 'Demande', notification: 'Notification administrateur',
      access: 'Accès', flags: 'Signalements', kind: 'E-mail', recipient: 'Destinataire', status: 'Statut', attempts: 'Tentatives', lastError: 'Dernière erreur', sentAt: 'Accepté par le fournisseur le',
      at: 'Date', event: 'Événement', actor: 'Par', detail: 'Détail',
    },
    noRequests: 'Aucune demande de démonstration ne correspond.', priorRejection: 'Refus antérieur', expires: 'expire le {date}',
    req: { pending: 'En attente', approved: 'Approuvée', rejected: 'Refusée', expired: 'Expirée', cancelled: 'Annulée' },
    notif: { sent: 'Envoyée (acceptée par le fournisseur)', queued: "En file d'attente", failed: 'Échec', none: 'Aucune' },
    grant: { awaiting_activation: "En attente d'activation", active: 'Actif', expired: 'Expiré', revoked: 'Révoqué' },
    inv: { pending: 'En attente', accepted: 'Acceptée', expired: 'Expirée', revoked: 'Annulée' },
    mail: { queued: "En file d'attente", sending: 'Envoi en cours', sent: 'Envoyé (accepté par le fournisseur)', failed: 'Échec' },
    kind: { admin_notification: 'Notification administrateur', invitation: 'Invitation', rejection: 'Avis de refus' },
    events: {
      demo_access_requested: 'Accès demandé', demo_access_approved: 'Approuvée', demo_access_rejected: 'Refusée',
      demo_access_invitation_resent: 'Invitation renvoyée', demo_access_revoked: 'Accès révoqué', demo_access_activated: 'Compte activé', demo_access_expired: 'Accès expiré',
    },
    lang: { en: 'Anglais', fr: 'Français' },
    detail: {
      back: 'Toutes les demandes', request: 'Demande', applicant: 'E-mail du demandeur', language: 'Langue', requestedAt: 'Demandée le', requestExpires: 'La demande expire le',
      status: 'Statut', decidedAt: 'Décidée le', decidedBy: 'Décidée par', internalNote: 'Note interne (interne — jamais montrée au demandeur)',
      priorWarning: 'Une demande de démonstration antérieure pour cette adresse e-mail a été refusée. Vérifiez avant d’approuver.',
      grant: 'Accès de démonstration', noGrant: "Aucun accès de démonstration n'a été accordé pour cette demande.", personas: 'Profils', invitation: 'Invitation', invitationExpires: "L'invitation expire le",
      activatedAt: 'Activé le', accessExpires: "L'accès expire le", firstLogin: 'Première connexion', lastActivity: 'Dernière activité', revokedAt: 'Révoqué le',
      emails: 'Journal des e-mails', emailsNote: '« Envoyé » signifie que le fournisseur de messagerie a accepté le message. Cela ne prouve pas sa réception dans la boîte du destinataire.', noEmails: 'Aucun e-mail enregistré.',
      history: 'Historique', noHistory: 'Aucun historique enregistré.', actions: 'Actions', noActions: "Aucune action n'est disponible pour cette demande.",
    },
    act: {
      approve: "Approuver et envoyer l'invitation", reject: 'Refuser', rejectNote: 'Motif interne (facultatif, jamais montré au demandeur)',
      resend: "Renvoyer l'invitation", revoke: "Révoquer l'accès",
    },
    audit: { title: 'Journal', none: 'Aucun événement enregistré.' },
    denied: { title: 'Accès refusé (403)', body: "Vous êtes connecté, mais ce compte n'est pas administrateur des démonstrations ADS. Déconnectez-vous puis connectez-vous avec un compte administrateur." },
    flash: {
      approved: "Demande approuvée. L'invitation a été mise en file d'envoi.", rejected: 'Demande refusée.', resent: "Invitation remise en file d'envoi.", revoked: 'Accès de démonstration révoqué.',
    },
    errors: {
      REQUEST_NOT_PENDING: 'Cette demande a déjà été traitée.', GRANT_NOT_ACTIVE: "Cet accès de démonstration n'est plus actif.",
      NOTHING_TO_RESEND: "Il n'y a aucune invitation en attente à renvoyer.", FORM_EXPIRED: 'Ce formulaire a expiré. Réessayez.', NOT_FOUND: 'Demande introuvable.',
      generic: "Une erreur s'est produite. Réessayez.",
    },
    dash: '—',
  },
};

const REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'expired', 'cancelled'];

// Extra rules for this page only, under the same CSP nonce as the layout's style block.
const pageStyles = nonce => `<style nonce="${esc(nonce)}">
.da-nav{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;margin:0 0 12px;font-size:14px}.da-nav a{color:var(--accent)}.da-nav a[aria-current]{font-weight:600;color:var(--ink)}
.da-counts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:12px 0}
.da-count{border:1px solid var(--line);border-radius:8px;padding:10px 12px}.da-count strong{display:block;font-size:22px}.da-count span{font-size:13px;color:var(--muted)}
.da-dl{display:grid;grid-template-columns:minmax(140px,220px) 1fr;gap:4px 12px;margin:0 0 12px;font-size:14px}.da-dl dt{color:var(--muted)}.da-dl dd{margin:0;overflow-wrap:anywhere}
@media (max-width:640px){.da-dl{grid-template-columns:1fr}.da-dl dd{margin-bottom:6px}}
.tag.warn{border-color:#fecdca;color:var(--danger)}
.da-action{border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin:8px 0}.da-action button{width:auto;margin-top:8px}
textarea{width:100%;min-height:70px;padding:8px 10px;font:inherit;font-size:14px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink)}
td{overflow-wrap:anywhere}
</style>`;

export function renderDemoAdmin(view, ctx) {
  const { locale: rawLocale, nonce, csrf, timeZone, langPath, admin, flash, error } = ctx;
  const locale = rawLocale === 'fr' ? 'fr' : 'en';
  const t = T[locale];

  let fmt;
  try {
    fmt = new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone });
  } catch {
    fmt = new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
  }
  const date = iso => {
    if (!iso) return esc(t.dash);
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? esc(iso) : `<time datetime="${esc(d.toISOString())}">${esc(fmt.format(d))}</time>`;
  };
  const text = v => (v === null || v === undefined || v === '' ? esc(t.dash) : esc(v));
  const label = (table, key) => esc(table[key] ?? key ?? t.dash);
  const tag = (table, key, cls = '') => (key ? `<span class="tag${cls ? ` ${cls}` : ''}" data-status="${esc(key)}">${label(table, key)}</span>` : `<span class="muted">${esc(t.dash)}</span>`);
  const eventName = name => esc(t.events[name] ?? name);
  const withLang = path => `${path}${path.includes('?') ? '&' : '?'}lang=${locale}`;

  const signOut = `<form method="post" action="/logout" class="inline">${hidden('csrf', csrf)}${hidden('lang', locale)}<button type="submit" class="secondary small">${esc(t.signOut)}</button></form>`;
  const notes = `<p>${fill(t.signedInAs, { email: admin?.email })} ${timeZone ? fill(t.timesIn, { zone: timeZone }) : ''}</p>`;
  const nav = current => `<nav class="da-nav" aria-label="${esc(t.title)}"><a href="${esc(withLang('/demo-admin'))}"${current === 'requests' ? ' aria-current="page"' : ''}>${esc(t.nav.requests)}</a>
<a href="${esc(withLang('/demo-admin/audit'))}"${current === 'audit' ? ' aria-current="page"' : ''}>${esc(t.nav.audit)}</a>${signOut}</nav>`;
  const messages = (flash ? `<div class="ok" role="status">${esc(t.flash[flash] ?? '')}</div>` : '')
    + (error ? `<div class="error" role="alert">${esc(t.errors[error] ?? t.errors.generic)}</div>` : '');
  const page = (current, body) => layout({ locale, nonce, client: null, langPath, wide: true, title: t.title,
    body: `${pageStyles(nonce)}<h1>${esc(t.title)}</h1>${notes}${current ? nav(current) : ''}${messages}${body}` });

  switch (view) {
    case 'overview': return page('requests', overview(ctx.overview ?? {}));
    case 'request': return page('requests', requestDetail(ctx.request ?? {}));
    case 'audit': return page('audit', audit(ctx.audit ?? {}));
    case 'denied':
    default:
      return layout({ locale, nonce, client: null, langPath, wide: true, title: t.title,
        body: `<h1>${esc(t.title)}</h1><p>${fill(t.signedInAs, { email: admin?.email })}</p>${messages}<h2>${esc(t.denied.title)}</h2><p>${esc(t.denied.body)}</p><p>${signOut}</p>` });
  }

  function overview({ counts = {}, filters = {}, platforms = [], requests = [] }) {
    const counters = `<div class="da-counts" data-testid="counts">${['pending', 'awaitingActivation', 'active', 'expiringSoon'].map(k =>
      `<div class="da-count" data-count="${k}"><strong>${esc(Number(counts[k] ?? 0))}</strong><span>${esc(t.counts[k])}</span></div>`).join('')}</div>`;
    const status = filters.status || 'all';
    const filterForm = `<form method="get" action="/demo-admin" class="row" data-testid="filters">${hidden('lang', locale)}
<div><label for="f-status">${esc(t.filter.status)}</label><select id="f-status" name="status">${['all', ...REQUEST_STATUSES].map(s =>
      `<option value="${esc(s)}"${s === status ? ' selected' : ''}>${esc(s === 'all' ? t.filter.all : t.req[s])}</option>`).join('')}</select></div>
<div><label for="f-platform">${esc(t.filter.platform)}</label><select id="f-platform" name="platform"><option value=""${filters.platform ? '' : ' selected'}>${esc(t.filter.allPlatforms)}</option>${platforms.map(p =>
      `<option value="${esc(p.key)}"${p.key === filters.platform ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
<div><label for="f-q">${esc(t.filter.q)}</label><input id="f-q" name="q" type="text" value="${esc(filters.q ?? '')}" autocomplete="off"></div>
<button type="submit">${esc(t.filter.apply)}</button></form>`;
    const rows = requests.map(r => `<tr data-request="${esc(r.id)}">
<td><a href="${esc(withLang(`/demo-admin/requests/${encodeURIComponent(r.id)}`))}">${esc(r.reference)}</a></td>
<td>${esc(r.platformName ?? r.platform)}</td><td>${esc(r.email)}</td><td class="hide">${date(r.createdAt)}</td>
<td>${tag(t.req, r.status)}</td><td>${tag(t.notif, r.notification, r.notification === 'failed' ? 'warn' : '')}</td>
<td>${r.grantStatus ? `${tag(t.grant, r.grantStatus)}${r.expiresAt ? `<br><span class="muted">${fill(t.expires, { date: '' })}${date(r.expiresAt)}</span>` : ''}` : `<span class="muted">${esc(t.dash)}</span>`}</td>
<td>${r.priorRejection ? `<span class="tag warn" data-flag="prior-rejection">${esc(t.priorRejection)}</span>` : ''}</td></tr>`).join('');
    const table = requests.length
      ? `<table data-testid="requests"><thead><tr><th>${esc(t.col.reference)}</th><th>${esc(t.col.platform)}</th><th>${esc(t.col.email)}</th><th class="hide">${esc(t.col.requested)}</th>
<th>${esc(t.col.request)}</th><th>${esc(t.col.notification)}</th><th>${esc(t.col.access)}</th><th>${esc(t.col.flags)}</th></tr></thead><tbody>${rows}</tbody></table>`
      : `<p class="muted" data-testid="empty">${esc(t.noRequests)}</p>`;
    return `${counters}${filterForm}<h2>${esc(t.nav.requests)}</h2>${table}`;
  }

  function requestDetail({ request: r = {}, grant: g = null, emails = [], history = [], actions = {} }) {
    const d = t.detail;
    const dl = items => `<dl class="da-dl">${items.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
    const warning = r.priorRejection ? `<div class="error" role="note" data-testid="prior-rejection">${esc(d.priorWarning)}</div>` : '';
    const info = dl([
      [t.col.reference, esc(r.reference)], [t.col.platform, esc(r.platformName ?? r.platform)], [d.applicant, esc(r.email)],
      [d.language, esc(t.lang[r.locale] ?? r.locale ?? t.dash)], [d.requestedAt, date(r.createdAt)], [d.requestExpires, date(r.expiresAt)],
      [d.status, tag(t.req, r.status)], [d.decidedAt, date(r.decidedAt)], [d.decidedBy, text(r.decidedBy)],
      [d.internalNote, r.internalNote ? `<span data-testid="internal-note">${esc(r.internalNote)}</span>` : esc(t.dash)],
    ]);
    const grant = g ? dl([
      [d.status, tag(t.grant, g.status)],
      [d.personas, g.personas?.length ? g.personas.map(p => `<span class="tag" data-persona="${esc(p.key)}">${esc(p.label ?? p.key)}</span>`).join(' ') : esc(t.dash)],
      [d.invitation, tag(t.inv, g.invitation?.status)], [d.invitationExpires, date(g.invitation?.expiresAt)],
      [d.activatedAt, date(g.activatedAt)], [d.accessExpires, date(g.expiresAt)], [d.firstLogin, date(g.firstLoginAt)],
      [d.lastActivity, date(g.lastActivityAt)], [d.revokedAt, date(g.revokedAt)],
    ]) : `<p class="muted" data-testid="no-grant">${esc(d.noGrant)}</p>`;

    const emailRows = emails.map(e => `<tr data-email-kind="${esc(e.kind)}"><td>${label(t.kind, e.kind)}</td><td>${esc(e.recipient)}</td>
<td>${tag(t.mail, e.status, e.status === 'failed' ? 'warn' : '')}</td><td class="hide">${esc(e.attempts ?? 0)}</td><td>${text(e.lastError)}</td>
<td>${date(e.sentAt)}<br><span class="muted">${date(e.createdAt)}</span></td></tr>`).join('');
    const emailTable = `<p class="hint">${esc(d.emailsNote)}</p>${emails.length
      ? `<table data-testid="emails"><thead><tr><th>${esc(t.col.kind)}</th><th>${esc(t.col.recipient)}</th><th>${esc(t.col.status)}</th><th class="hide">${esc(t.col.attempts)}</th><th>${esc(t.col.lastError)}</th><th>${esc(t.col.sentAt)}</th></tr></thead><tbody>${emailRows}</tbody></table>`
      : `<p class="muted">${esc(d.noEmails)}</p>`}`;

    const historyTable = history.length
      ? `<table data-testid="history"><thead><tr><th>${esc(t.col.at)}</th><th>${esc(t.col.event)}</th><th>${esc(t.col.actor)}</th><th>${esc(t.col.detail)}</th></tr></thead><tbody>${history.map(h =>
        `<tr><td>${date(h.at)}</td><td>${eventName(h.event)}</td><td>${text(h.actor)}</td><td>${text(h.detail)}</td></tr>`).join('')}</tbody></table>`
      : `<p class="muted">${esc(d.noHistory)}</p>`;

    const target = `/demo-admin/requests/${encodeURIComponent(r.id ?? '')}`;
    const fields = action => hidden('csrf', csrf) + hidden('lang', locale) + hidden('action', action);
    const form = (action, body, cls = '') => `<form method="post" action="${esc(target)}" class="da-action" data-action="${action}">${fields(action)}${body}</form>`;
    const forms = [
      actions.approve && form('approve', `<button type="submit">${esc(t.act.approve)}</button>`),
      actions.reject && form('reject', `<label for="reject-note">${esc(t.act.rejectNote)}</label><textarea id="reject-note" name="note" maxlength="1000"></textarea><button type="submit" class="secondary">${esc(t.act.reject)}</button>`),
      actions.resend && form('resend', `<button type="submit" class="secondary">${esc(t.act.resend)}</button>`),
      actions.revoke && form('revoke', `<button type="submit" class="secondary">${esc(t.act.revoke)}</button>`),
    ].filter(Boolean).join('');

    return `<p><a href="${esc(withLang('/demo-admin'))}">${esc(d.back)}</a></p>${warning}
<h2>${esc(d.request)} ${esc(r.reference)}</h2>${info}
<h2>${esc(d.actions)}</h2>${forms || `<p class="muted">${esc(d.noActions)}</p>`}
<h2>${esc(d.grant)}</h2>${grant}
<h2>${esc(d.emails)}</h2>${emailTable}
<h2>${esc(d.history)}</h2>${historyTable}`;
  }

  function audit({ events = [] }) {
    const table = events.length
      ? `<table data-testid="audit"><thead><tr><th>${esc(t.col.at)}</th><th>${esc(t.col.event)}</th><th>${esc(t.col.actor)}</th><th>${esc(t.col.reference)}</th><th class="hide">${esc(t.col.platform)}</th><th>${esc(t.col.detail)}</th></tr></thead><tbody>${events.map(e =>
        `<tr><td>${date(e.at)}</td><td>${eventName(e.event)}</td><td>${text(e.actor)}</td><td>${text(e.reference)}</td><td class="hide">${text(e.platform)}</td><td>${text(e.detail)}</td></tr>`).join('')}</tbody></table>`
      : `<p class="muted" data-testid="empty">${esc(t.audit.none)}</p>`;
    return `<h2>${esc(t.audit.title)}</h2>${table}`;
  }
}

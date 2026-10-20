// Hosted organisation admin page (/admin): server-rendered, no JavaScript, English and French.
// Every button is a small form posting back to /admin with the CSRF token; the server re-checks
// the signed-in user's admin rights on every post (see admin.mjs).
import { layout } from './pages.mjs';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (_, k) => esc(vars[k] ?? ''));

const T = {
  en: {
    title: 'Organisation administration', signedInAs: 'Signed in as {email}.', workspace: 'Organisation', product: 'Product', show: 'Show',
    none: 'You are not an administrator of any organisation.', members: 'Members', email: 'Email', orgRole: 'In organisation', status: 'Status',
    roles: 'Roles in {product}', rolesShort: 'Roles', actions: 'Actions', grant: 'Grant', rolesPlaceholder: 'role, other_role', revoke: 'Remove {role}',
    deactivate: 'Deactivate', reactivate: 'Reactivate', makeAdmin: 'Make admin', removeAdmin: 'Remove admin', active: 'Active', deactivated: 'Deactivated',
    owner: 'Owner', admin: 'Admin', member: 'Member', noRoles: 'no roles', invitations: 'Invitations', invite: 'Send invitation', phone: 'Mobile number (optional, SMS)',
    language: 'Language', alsoAdmin: 'Also make them an organisation admin', expires: 'Expires', revokeInvite: 'Revoke',
    inv: { pending: 'Pending', accepted: 'Accepted', revoked: 'Revoked', expired: 'Expired' }, noInvitations: 'No invitations yet.',
    assignable: 'Roles you can give: {roles}', signOut: 'Sign out',
    done: {
      granted: 'Roles granted.', revoked: 'Role removed.', deactivated: 'Member deactivated: their sign-ins for this organisation ended.',
      reactivated: 'Member reactivated.', admin: 'Organisation admins updated.', invited: 'Invitation sent.', invite_revoked: 'Invitation revoked.',
    },
    errors: {
      FORBIDDEN: 'You are not allowed to do that.', ROLES_INVALID: 'Enter roles as lowercase words separated by commas.', ROLE_NOT_ASSIGNABLE: 'That role does not exist in this product.', NO_ASSIGNABLE_ROLES: 'This product has no roles that can be granted here. Ask ADS.',
      EMAIL_INVALID: 'Enter a valid email address.', PHONE_INVALID: 'Enter a valid mobile number.', MEMBER_NOT_FOUND: 'That member no longer exists.',
      MEMBER_DEACTIVATED: 'Reactivate the member first.', CANNOT_CHANGE_YOURSELF: 'You cannot change your own access here.', INVITATION_NOT_FOUND: 'Invitation not found.',
      INVITATION_ALREADY_ACCEPTED: 'That invitation was already accepted.', FORM_EXPIRED: 'This form expired. Please try again.', TOO_MANY_ATTEMPTS: 'Too many invitations. Try again later.',
      PRODUCT_NOT_FOUND: 'Product not found.', USER_NOT_FOUND: 'User not found.',
    },
  },
  fr: {
    title: "Administration de l'organisation", signedInAs: 'Connecté en tant que {email}.', workspace: 'Organisation', product: 'Produit', show: 'Afficher',
    none: "Vous n'êtes administrateur d'aucune organisation.", members: 'Membres', email: 'E-mail', orgRole: "Dans l'organisation", status: 'Statut',
    roles: 'Rôles dans {product}', rolesShort: 'Rôles', actions: 'Actions', grant: 'Attribuer', rolesPlaceholder: 'role, autre_role', revoke: 'Retirer {role}',
    deactivate: 'Désactiver', reactivate: 'Réactiver', makeAdmin: 'Nommer admin', removeAdmin: 'Retirer admin', active: 'Actif', deactivated: 'Désactivé',
    owner: 'Propriétaire', admin: 'Admin', member: 'Membre', noRoles: 'aucun rôle', invitations: 'Invitations', invite: "Envoyer l'invitation", phone: 'Numéro mobile (facultatif, SMS)',
    language: 'Langue', alsoAdmin: "En faire aussi un administrateur de l'organisation", expires: 'Expire', revokeInvite: 'Annuler',
    inv: { pending: 'En attente', accepted: 'Acceptée', revoked: 'Annulée', expired: 'Expirée' }, noInvitations: 'Aucune invitation pour le moment.',
    assignable: 'Rôles disponibles : {roles}', signOut: 'Se déconnecter',
    done: {
      granted: 'Rôles attribués.', revoked: 'Rôle retiré.', deactivated: 'Membre désactivé : ses sessions pour cette organisation sont terminées.',
      reactivated: 'Membre réactivé.', admin: "Administrateurs de l'organisation mis à jour.", invited: 'Invitation envoyée.', invite_revoked: 'Invitation annulée.',
    },
    errors: {
      FORBIDDEN: "Vous n'êtes pas autorisé à faire cela.", ROLES_INVALID: 'Saisissez des rôles en minuscules séparés par des virgules.', ROLE_NOT_ASSIGNABLE: "Ce rôle n'existe pas dans ce produit.", NO_ASSIGNABLE_ROLES: "Ce produit n'a aucun rôle attribuable ici. Contactez ADS.",
      EMAIL_INVALID: 'Saisissez une adresse e-mail valide.', PHONE_INVALID: 'Saisissez un numéro mobile valide.', MEMBER_NOT_FOUND: "Ce membre n'existe plus.",
      MEMBER_DEACTIVATED: "Réactivez d'abord le membre.", CANNOT_CHANGE_YOURSELF: 'Vous ne pouvez pas modifier votre propre accès ici.', INVITATION_NOT_FOUND: 'Invitation introuvable.',
      INVITATION_ALREADY_ACCEPTED: 'Cette invitation a déjà été acceptée.', FORM_EXPIRED: 'Ce formulaire a expiré. Réessayez.', TOO_MANY_ATTEMPTS: "Trop d'invitations. Réessayez plus tard.",
      PRODUCT_NOT_FOUND: 'Produit introuvable.', USER_NOT_FOUND: 'Utilisateur introuvable.',
    },
  },
};

const hidden = (name, value) => `<input type="hidden" name="${esc(name)}" value="${esc(value)}">`;

// ctx: { locale, nonce, csrf, user, workspaces, current: {tenantId, clientId, orgAdmin}, products, members, invitations, client, done, error }
export function renderAdminPage(ctx) {
  const { locale, nonce, csrf, user, workspaces, current, products, members = [], invitations = [], client, done, error } = ctx;
  const t = T[locale];
  const langPath = `/admin${current ? `?tenant=${encodeURIComponent(current.tenantId)}&product=${encodeURIComponent(current.clientId)}` : ''}`;
  const base = { locale, nonce, client: null, langPath, wide: true, title: t.title };
  const head = `<h1>${esc(t.title)}</h1><p>${fill(t.signedInAs, { email: user.email })}</p>`;
  const signOut = `<form method="post" action="/logout" class="inline">${hidden('csrf', csrf)}${hidden('lang', locale)}<button type="submit" class="secondary small">${esc(t.signOut)}</button></form>`;
  if (!workspaces.length) return layout({ ...base, body: `${head}<p>${esc(t.none)}</p>${signOut}` });

  const productName = client?.display_name ?? current.clientId;
  const fields = action => hidden('csrf', csrf) + hidden('lang', locale) + hidden('tenant', current.tenantId) + hidden('product', current.clientId) + hidden('action', action);
  const button = (action, label, extra = '', cls = 'secondary') => `<form method="post" action="/admin" class="inline">${fields(action)}${extra}<button type="submit" class="${cls}">${esc(label)}</button></form>`;
  const flash = (done ? `<div class="ok" role="status">${esc(t.done[done] ?? '')}</div>` : '') + (error ? `<div class="error" role="alert">${esc(t.errors[error] ?? t.errors.FORBIDDEN)}</div>` : '');

  const picker = `<form method="get" action="/admin" class="row">${hidden('lang', locale)}
<div><label for="tenant">${esc(t.workspace)}</label><select id="tenant" name="tenant">${workspaces.map(w => `<option value="${esc(w.tenantId)}"${w.tenantId === current.tenantId ? ' selected' : ''}>${esc(w.organizationName)}</option>`).join('')}</select></div>
<div><label for="product">${esc(t.product)}</label><select id="product" name="product">${products.map(p => `<option value="${esc(p.client_id)}"${p.client_id === current.clientId ? ' selected' : ''}>${esc(p.display_name)}</option>`).join('')}</select></div>
<button type="submit">${esc(t.show)}</button></form>`;

  const orgRoleLabel = r => esc(t[r] ?? r);
  const rows = members.map(m => {
    const self = m.userId === user.id;
    const roleTags = m.roles.length
      ? m.roles.map(r => `<span class="tag">${esc(r)}</span>${self ? '' : button('revoke', t.revoke.replace('{role}', r), hidden('user_id', m.userId) + hidden('roles', r), 'secondary small')}`).join(' ')
      : `<span class="muted">${esc(t.noRoles)}</span>`;
    const grant = m.status === 'active' ? `<form method="post" action="/admin" class="inline">${fields('grant')}${hidden('user_id', m.userId)}
<label class="muted" for="g-${esc(m.userId)}">${esc(t.grant)}</label><input id="g-${esc(m.userId)}" name="roles" type="text" placeholder="${esc(t.rolesPlaceholder)}" autocomplete="off"><button type="submit" class="small">${esc(t.grant)}</button></form>` : '';
    const manage = current.orgAdmin && !self && m.orgRole !== 'owner'
      ? (m.status === 'active' ? button('deactivate', t.deactivate, hidden('user_id', m.userId), 'secondary small') : button('reactivate', t.reactivate, hidden('user_id', m.userId), 'secondary small'))
        + (m.status === 'active' ? button(m.orgRole === 'admin' ? 'remove_admin' : 'make_admin', m.orgRole === 'admin' ? t.removeAdmin : t.makeAdmin, hidden('user_id', m.userId), 'secondary small') : '')
      : '';
    return `<tr data-member="${esc(m.email)}"><td>${esc(m.email)}${m.name ? `<br><span class="muted">${esc(m.name)}</span>` : ''}</td><td class="hide">${orgRoleLabel(m.orgRole)}</td>
<td>${esc(m.status === 'active' ? t.active : t.deactivated)}</td><td>${roleTags}</td><td>${self ? '' : grant}${manage}</td></tr>`;
  }).join('');

  const invRows = invitations.map(i => `<tr data-invitation="${esc(i.email)}"><td>${esc(i.email)}${i.phone ? `<br><span class="muted">${esc(i.phone)}</span>` : ''}</td><td>${i.roles.map(r => `<span class="tag">${esc(r)}</span>`).join(' ')}</td>
<td>${esc(t.inv[i.status])}</td><td class="hide">${esc(new Date(i.expiresAt).toISOString().slice(0, 10))}</td>
<td>${i.status === 'pending' ? button('revoke_invitation', t.revokeInvite, hidden('invitation_id', i.id), 'secondary small') : ''}</td></tr>`).join('');

  const assignable = client?.assignable_roles?.length ? `<p class="hint">${fill(t.assignable, { roles: client.assignable_roles.join(', ') })}</p>` : '';
  const inviteForm = `<form method="post" action="/admin">${fields('invite')}<div class="row">
<div><label for="inv-email">${esc(t.email)}</label><input id="inv-email" name="email" type="email" required autocomplete="off"></div>
<div><label for="inv-roles">${fill(t.roles, { product: productName })}</label><input id="inv-roles" name="roles" type="text" required placeholder="${esc(t.rolesPlaceholder)}" autocomplete="off"></div>
<div><label for="inv-phone">${esc(t.phone)}</label><input id="inv-phone" name="phone" type="text" inputmode="tel" autocomplete="off"></div>
<div><label for="inv-locale">${esc(t.language)}</label><select id="inv-locale" name="locale"><option value="en"${locale === 'en' ? ' selected' : ''}>English</option><option value="fr"${locale === 'fr' ? ' selected' : ''}>Français</option></select></div>
</div>${current.orgAdmin ? `<label class="choice"><input type="checkbox" name="org_admin" value="true"> ${esc(t.alsoAdmin)}</label>` : ''}
<button type="submit">${esc(t.invite)}</button></form>`;

  return layout({ ...base, body: `${head}${flash}${picker}
<h2>${esc(t.members)}</h2>${assignable}
<table data-testid="members"><thead><tr><th>${esc(t.email)}</th><th class="hide">${esc(t.orgRole)}</th><th>${esc(t.status)}</th><th>${fill(t.roles, { product: productName })}</th><th>${esc(t.actions)}</th></tr></thead><tbody>${rows}</tbody></table>
<h2>${esc(t.invitations)}</h2>${inviteForm}
${invitations.length ? `<table data-testid="invitations"><thead><tr><th>${esc(t.email)}</th><th>${esc(t.rolesShort)}</th><th>${esc(t.status)}</th><th class="hide">${esc(t.expires)}</th><th></th></tr></thead><tbody>${invRows}</tbody></table>` : `<p class="muted">${esc(t.noInvitations)}</p>`}
<p>${signOut}</p>` });
}

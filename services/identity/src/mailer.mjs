import nodemailer from 'nodemailer';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Every email is bilingual (English first, then French) because ADS users are in Cameroon.
const templates = {
  verify_email: ({ link, hours, product }) => ({
    subject: 'Activate your account / Activez votre compte',
    intro: [
      `Welcome${product ? ` to ${product}` : ''}. Confirm your email address to activate your account. This link expires in ${hours} hours.`,
      `Bienvenue${product ? ` sur ${product}` : ''}. Confirmez votre adresse e-mail pour activer votre compte. Ce lien expire dans ${hours} heures.`,
    ],
    button: ['Activate account', 'Activer le compte'],
    link,
    outro: [
      'If you did not create an account, you can ignore this email.',
      "Si vous n'avez pas créé de compte, ignorez cet e-mail.",
    ],
  }),
  reset_password: ({ link, minutes }) => ({
    subject: 'Reset your password / Réinitialisez votre mot de passe',
    intro: [
      `Someone asked to reset the password for this account. The link expires in ${minutes} minutes and works once.`,
      `Une réinitialisation du mot de passe a été demandée pour ce compte. Le lien expire dans ${minutes} minutes et ne fonctionne qu'une fois.`,
    ],
    button: ['Choose a new password', 'Choisir un nouveau mot de passe'],
    link,
    outro: [
      'If this was not you, ignore this email; your password stays the same.',
      "Si ce n'était pas vous, ignorez cet e-mail ; votre mot de passe reste inchangé.",
    ],
  }),
  invitation: ({ link, days, product, organization, inviter, roles }) => ({
    subject: `${organization} invited you to ${product} / Invitation à ${product}`,
    intro: [
      `${inviter} invited you to join ${organization} in ${product} as ${roles.join(', ')}. Sign in with this email address, or create your ADS account with it, to accept. The invitation works once and expires in ${days} days.`,
      `${inviter} vous invite à rejoindre ${organization} dans ${product} en tant que ${roles.join(', ')}. Connectez-vous avec cette adresse e-mail, ou créez votre compte ADS avec elle, pour accepter. L'invitation ne fonctionne qu'une fois et expire dans ${days} jours.`,
    ],
    button: ['Accept invitation', "Accepter l'invitation"],
    link,
    outro: [
      'If you do not know this organisation, ignore this email.',
      'Si vous ne connaissez pas cette organisation, ignorez cet e-mail.',
    ],
  }),
  password_changed: () => ({
    subject: 'Your password was changed / Votre mot de passe a été modifié',
    intro: [
      'The password for your Africa Digital Synergy account was just changed, and you were signed out everywhere.',
      'Le mot de passe de votre compte Africa Digital Synergy vient d’être modifié et toutes vos sessions ont été fermées.',
    ],
    outro: [
      'If this was not you, reset your password immediately and contact admin@africadigitalsynergy.com.',
      "Si ce n'était pas vous, réinitialisez immédiatement votre mot de passe et écrivez à admin@africadigitalsynergy.com.",
    ],
  }),
};

export function renderEmail(kind, data) {
  const t = templates[kind](data);
  const text = [
    ...t.intro.slice(0, 1), t.link ? `${t.button[0]}: ${t.link}` : '', t.outro[0], '',
    '---', '',
    ...t.intro.slice(1), t.link ? `${t.button[1]} : ${t.link}` : '', t.outro[1],
  ].filter(line => line !== null).join('\n');
  const block = i => `<p>${esc(t.intro[i])}</p>${t.link ? `<p><a href="${esc(t.link)}" style="display:inline-block;padding:10px 18px;background:#087E79;color:#fff;border-radius:6px;text-decoration:none">${esc(t.button[i])}</a></p>` : ''}<p style="color:#555">${esc(t.outro[i])}</p>`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#102B43">${block(0)}<hr style="border:none;border-top:1px solid #ddd;margin:24px 0">${block(1)}<p style="color:#888;font-size:12px">Africa Digital Synergy Ltd · Yaoundé</p></div>`;
  return { subject: t.subject, text, html };
}

export function createMailer(config, log = console) {
  const { mail } = config;
  if (mail.transport === 'memory') {
    const outbox = [];
    return { outbox, async send(message) { outbox.push(message); } };
  }
  if (mail.transport === 'log') {
    return {
      async send(message) {
        log.info?.(`[mail:log] to=${message.to} subject="${message.subject}"\n${message.text}`);
      },
    };
  }
  if (!mail.smtpHost) throw new Error('SMTP_HOST_REQUIRED');
  const transporter = nodemailer.createTransport({
    host: mail.smtpHost,
    port: mail.smtpPort,
    secure: mail.smtpSecure,
    auth: mail.smtpUser ? { user: mail.smtpUser, pass: mail.smtpPassword } : undefined,
    requireTLS: !mail.smtpSecure,
  });
  return {
    async send(message) {
      await transporter.sendMail({ from: mail.from, replyTo: mail.replyTo || undefined, ...message });
    },
  };
}

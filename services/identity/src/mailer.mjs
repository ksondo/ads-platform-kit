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
  // ADS Demo Access. Visitor-supplied values (the email) appear only in the body, escaped in HTML.
  demo_request_admin: ({ platform, email, reference, when, link }) => ({
    subject: `New demo access request ${reference} · ${platform} / Nouvelle demande de démonstration`,
    intro: [
      `${email} asked for access to the ${platform} demonstration on ${when}. Reference: ${reference}. Opening the link does not approve anything: sign in as an ADS administrator, then choose Approve or Reject.`,
      `${email} demande l'accès à la démonstration ${platform} le ${when}. Référence : ${reference}. Ouvrir le lien n'approuve rien : connectez-vous en tant qu'administrateur ADS, puis choisissez Approuver ou Refuser.`,
    ],
    button: ['Review request', 'Examiner la demande'],
    link,
    outro: ['You receive this because you are an ADS demo administrator.', 'Vous recevez ce message en tant qu’administrateur des démonstrations ADS.'],
  }),
  demo_invitation: ({ platform, link, days, grantDays }) => ({
    subject: `Your ${platform} demonstration access / Votre accès à la démonstration ${platform}`,
    intro: [
      `Your request to try the ${platform} demonstration was approved. Open the link to set your password (or sign in if you already have an ADS account) and start the demonstration. The link works once and expires in ${days} days. Your access lasts ${grantDays} days from activation.`,
      `Votre demande d'essai de la démonstration ${platform} a été approuvée. Ouvrez le lien pour choisir votre mot de passe (ou connectez-vous si vous avez déjà un compte ADS) et commencer la démonstration. Le lien ne fonctionne qu'une fois et expire dans ${days} jours. Votre accès dure ${grantDays} jours à partir de l'activation.`,
    ],
    button: ['Activate my demo access', 'Activer mon accès'],
    link,
    outro: [
      'All data in the demonstration is fictional. No real payments or bank transactions take place.',
      'Toutes les données de la démonstration sont fictives. Aucun paiement ni opération bancaire réelle n’a lieu.',
    ],
  }),
  demo_rejected: ({ platform }) => ({
    subject: `Your ${platform} demonstration request / Votre demande de démonstration ${platform}`,
    intro: [
      `Thank you for your interest in ${platform}. We are unable to offer demonstration access at this time.`,
      `Merci de l'intérêt que vous portez à ${platform}. Nous ne sommes pas en mesure de vous accorder un accès de démonstration pour le moment.`,
    ],
    outro: [
      'For other enquiries, please contact us through africadigitalsynergy.com.',
      'Pour toute autre demande, veuillez nous contacter via africadigitalsynergy.com.',
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
  // Private operator mode has no email infrastructure. Even privileged legacy
  // flows must never turn invitation/reset tokens into log output or real mail.
  if (config.demoAccess?.privateEnabled) return { outbox: [], async send() { throw new Error('PRIVATE_MODE_EMAIL_DISABLED'); } };
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
    // Fail fast so a slow mail relay never holds a request open; the demo outbox retries.
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
  });
  return {
    async send(message) {
      await transporter.sendMail({ from: mail.from, replyTo: mail.replyTo || undefined, ...message });
    },
  };
}

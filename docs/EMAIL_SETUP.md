# Email setup: activation and password-reset emails

The login service sends three kinds of email, each bilingual (English then French):

| Email | When | Link valid |
| --- | --- | --- |
| Activate your account / Activez votre compte | After registration, or when someone signs in with the right password before confirming | 24 hours, once; the person also types their password |
| Reset your password / Réinitialisez votre mot de passe | "Forgot password", or registering with an email that already has an account | 1 hour, once |
| Your password was changed / Votre mot de passe a été modifié | After a reset | — |

Sender: `Africa Digital Synergy <admin@africadigitalsynergy.com>`.

## 1. SMTP settings

Get these from whoever hosts `mail.africadigitalsynergy.com` and put them in `deploy/.env`:

```
MAIL_TRANSPORT=smtp
MAIL_FROM=Africa Digital Synergy <admin@africadigitalsynergy.com>
SMTP_HOST=mail.africadigitalsynergy.com
SMTP_PORT=587          # STARTTLS; use 465 with SMTP_SECURE=true if your host requires it
SMTP_USER=admin@africadigitalsynergy.com
SMTP_PASSWORD=...
```

Consider a dedicated `no-reply@africadigitalsynergy.com` mailbox later so replies to automated mail do not fill the admin inbox; only `MAIL_FROM` changes.

## 2. DNS records so emails do not land in spam

Ask your DNS manager to add these on `africadigitalsynergy.com` (exact values come from your mail host):

| Record | Name | Value (example) | Purpose |
| --- | --- | --- | --- |
| TXT (SPF) | `@` | `v=spf1 mx a:mail.africadigitalsynergy.com ~all` | Says which servers may send for the domain. Merge with any existing SPF record; only one is allowed |
| TXT (DKIM) | `<selector>._domainkey` | Public key from your mail host | Signs each email so receivers can verify it |
| TXT (DMARC) | `_dmarc` | `v=DMARC1; p=none; rua=mailto:admin@africadigitalsynergy.com` | Tells receivers what to do with failures; start with `p=none`, tighten later |

If you later send through a transactional service (Brevo, Mailgun, Amazon SES...), its own SPF include and DKIM keys replace the examples above.

## 3. Test

1. Register a test account on the login page.
2. Check the email arrives in the inbox (not spam) and the link opens the "email confirmed" page.
3. In Gmail, "Show original" should show `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`.

Mail failures never block or reveal anything to users; they are logged by the service.

# ADS Demo Access: Commerce pilot deployment (Contabo demo server)

**For:** the ADS owner and the operator who deploys on the Contabo demo server (`vmi3191089`, 161.97.128.153).
**Related:** [Integration contract](INTEGRATION_CONTRACT.md) · [Contabo runbook](../../deploy/contabo-demo/RUNBOOK.md) · [Email setup](../EMAIL_SETUP.md) · Commerce: `ads-commerce-platform/deploy/demo/DEMO_ACCESS.md` and `deploy/demo/DEPLOYMENT_GATE.md`

---

## 1. What is being deployed

| Component | Change | Where it runs |
|---|---|---|
| **ADS Identity** (demo instance, `ads-demo-identity`) | New demo access module: access requests, administrator notifications, approval, invitations, 30-day platform grants, expiry, revocation, email outbox with retries and an audit trail. New central dashboard at `/demo-admin`. Database migration `007_demo_access.sql` (new tables only). | Existing container, loopback port `18090`. Public sign-in host `login.demo.africadigitalsynergy.com`; new dashboard host `admin.demo.africadigitalsynergy.com` |
| **ADS Commerce V2** (demo) | Introduction and request page at `/commerce/demo`, persona page, a grant check on every authenticated API call, a separate demonstration workspace for each visitor. | Existing Commerce demo stack, loopback port `18086`, `commerce.demo.africadigitalsynergy.com` |
| **ADS demo portal** | Commerce, E-commerce and POS buttons now read "Request demo access" / "Demander un accès de démonstration" and open the Commerce request page. The portal shows no demo passwords and no administration links. | Existing portal container, `demo.africadigitalsynergy.com` |

### Visitor and administrator journey

1. A visitor opens the Commerce demo page (from the portal or directly) and enters an email address.
2. ADS Identity records the request and emails each notification address separately.
3. The visitor sees "Request received and being processed". Nothing is promised and no administrator is named.
4. The administrator follows the review link, which opens `admin.demo.africadigitalsynergy.com` and asks them to sign in.
5. Only accounts listed in `DEMO_ACCESS_ADMIN_EMAILS` can see the dashboard. Everyone else is refused and the attempt is recorded.
6. The administrator approves or rejects. A rejection sends the visitor a neutral notice.
7. Approval sends one single-use invitation, valid for 7 days, from `admin@africadigitalsynergy.com`.
8. The visitor sets a password on the invitation page (or signs in, if they already have an ADS account) and lands on the Commerce persona page.
9. The visitor can switch between shopper, shop owner, manager, cashier, accountant and bank personas without signing in again, and works only in their own demo workspace.
10. Access ends after 30 days, or within 60 seconds of revocation, and applies to Commerce only.

---

## 2. Prerequisites (operator)

Complete and tick these before you deploy anything.

- [ ] **DNS:** add an `A` record for `admin.demo.africadigitalsynergy.com` pointing to `161.97.128.153`, with no `AAAA` record. Check it on both authoritative name servers with `dig @<ns> +short admin.demo.africadigitalsynergy.com A`.
- [ ] **TLS:** get a certificate for `admin.demo.africadigitalsynergy.com` using the same HTTP-01 webroot method as the other demo hosts (`certbot certonly --webroot …`). Do not use `certbot --nginx`.
- [ ] **Email authentication for `africadigitalsynergy.com`:** SPF, DKIM and DMARC must be published and passing (see [EMAIL_SETUP.md](../EMAIL_SETUP.md)). Send a test message to Gmail and confirm "Show original" reports `SPF: PASS`, `DKIM: PASS` and `DMARC: PASS`.
- [ ] **Authenticated SMTP:** identity must send as `admin@africadigitalsynergy.com` over authenticated SMTP (STARTTLS on 587, or TLS on 465). Set `MAIL_FROM=Africa Digital Synergy <admin@africadigitalsynergy.com>`. The identity image does not ship a mail relay. The SMTP server is external.
- [ ] **Administrator account:** `kengjisehs@africadigitalsynergy.com` must have an ADS Identity account on the demo instance. Register once through the normal sign-in page (`https://login.demo.africadigitalsynergy.com/register`) and confirm the address from the activation email. SMTP must already be working for this step. The dashboard admits only addresses listed in `DEMO_ACCESS_ADMIN_EMAILS`.
- [ ] **Backups before any change:** dump both databases and keep the files off the container volumes (commands in [§5 step 1](#5-order-of-steps)).
- [ ] **Shared demo passwords hidden:** `DEMO_SHOW_CREDENTIALS` in `/etc/ads-demo/identity.env` must **not** be `1`. Set it to `0`. Earlier set-ups used `1`, which showed the demo user and persona passwords on the public sign-in page. With Demo Access, every visitor gets their own invitation instead.
- [ ] **Commerce release images** for API, web and migrator come from one reviewed Commerce commit that includes Demo Access. The identity image comes from a reviewed `ads-platform-kit` commit that includes migration 007.

---

## 3. Environment checklist

### ADS Identity: `/etc/ads-demo/identity.env` (mode 0600)

| Variable | Value | Notes |
|---|---|---|
| `ADS_ENV` | `demo` | Already set. Also hard-set by `compose.identity.yml` |
| `DEMO_MODE` | `1` | Already set. Also hard-set by compose |
| `DEMO_SHOW_CREDENTIALS` | `0` | Must not be `1` |
| `DEMO_ACCESS_ENABLED` | `1` | Takes effect only with `ADS_ENV=demo` and `DEMO_MODE=1` |
| `DEMO_ACCESS_ADMIN_EMAILS` | `kengjisehs@africadigitalsynergy.com` | Comma-separated. Required when enabled, or the service will not start |
| `DEMO_ACCESS_NOTIFY_TO` | `kengjisehs@africadigitalsynergy.com,kengjisehs@gmail.com` | Each address gets its own message. Required when enabled |
| `DEMO_ACCESS_ADMIN_URL` | `https://admin.demo.africadigitalsynergy.com` | Base of the review links in notification emails |
| `DEMO_ACCESS_CHECK_SECRET_COMMERCE` | output of `openssl rand -hex 32` | Generate on the server. The **same value** goes to Commerce as `DEMO_ACCESS_CHECK_SECRET`. A `…_FILE` variant is also accepted |
| `DEMO_ACCESS_TIME_ZONE` | `Africa/Douala` | Dates on the dashboard and in emails |
| `DEMO_ACCESS_GRANT_DAYS` / `DEMO_ACCESS_INVITATION_TTL_DAYS` / `DEMO_ACCESS_REQUEST_TTL_DAYS` | *(leave unset)* | Defaults: 30 / 7 / 30 days. Grant length is capped at 30 |
| `MAIL_TRANSPORT` | `smtp` | Replaces `log`, which only writes emails to the container log |
| `MAIL_FROM` | `Africa Digital Synergy <admin@africadigitalsynergy.com>` | |
| `MAIL_REPLY_TO` | *(optional)* | |
| `SMTP_HOST` | the mail host, e.g. `mail.africadigitalsynergy.com` | Required when `MAIL_TRANSPORT=smtp` |
| `SMTP_PORT` | `587` (or `465`) | |
| `SMTP_SECURE` | `false` for 587 (STARTTLS is required), `true` for 465 | |
| `SMTP_USER` | `admin@africadigitalsynergy.com` | |
| `SMTP_PASSWORD` | the mailbox password | Set on the server only. Never in chat, tickets or Git |
| `IDENTITY_PUBLIC_URL` | `https://login.demo.africadigitalsynergy.com` | Unchanged. Invitation and activation links use this host |
| `IDENTITY_AUTO_MIGRATE` | *(leave unset)* | Unset means migrations run on start. Do not set it to `false` for this release |

`deploy/contabo-demo/identity.env.example` lists these variables as comments for reference.

### ADS Commerce: `/etc/ads-demo/commerce.env`

The authoritative list is in **`ads-commerce-platform/deploy/demo/DEMO_ACCESS.md`**. The main variables are:

| Variable | Value |
|---|---|
| `COMMERCE_DEMO_ACCESS` | `1` |
| `DEMO_ACCESS_IDENTITY_URL` | Identity's **internal** address as seen from the Commerce API container, e.g. `http://ads-demo-identity:8084` (see [§4.3](#43-commerce-to-identity-grant-check)) |
| `DEMO_ACCESS_CHECK_SECRET` | The same value as identity's `DEMO_ACCESS_CHECK_SECRET_COMMERCE` |
| `COMMERCE_DEMO_SEED_DATABASE_URL` | Connection string for the **schema-owner** login (`commerce_demo_owner`), used to seed each visitor's demo workspace |
| Browser identity URL | `https://login.demo.africadigitalsynergy.com`. The page's access request is sent there from the visitor's browser |

### Compose files

`deploy/contabo-demo/compose.identity.yml` **needs no change**. It already reads `/etc/ads-demo/identity.env`, hard-sets `ADS_ENV=demo` and `DEMO_MODE=1`, trusts one proxy hop, and puts the container `ads-demo-identity` on the Docker network `ads-demo-private`. That container name and network are what the Commerce API uses for the internal grant check.

---

## 4. Reverse proxy

### 4.1 Dashboard host: `admin.demo.africadigitalsynergy.com`

This host proxies to the same identity container (`127.0.0.1:18090`) but exposes only what the dashboard and its sign-in need:

| Path | Why |
|---|---|
| `/demo-admin`, `/demo-admin/…` | Dashboard: request list, request detail, approve/reject/resend/revoke, audit |
| `/login` | Sign-in (GET and POST). The dashboard redirects here with `next=/demo-admin…` |
| `/logout` | Sign-out button on the dashboard |
| `/register` | One-time administrator registration, if it is done on this host |
| `/forgot-password` | Request a password-reset email |

The pages on this host load no files from identity: styles are inline and protected by a nonce, and the sign-in page does not use the identity SDK. No static or `/sdk/` path needs to be exposed. Activation and password-reset links in emails point to `login.demo.africadigitalsynergy.com`, so `/verify-email` and `/reset-password` stay on that host. Google sign-in is not offered on this host. Everything else returns 404, including `/admin`, `/authorize`, `/token`, `/invite`, `/demo-access/…`, `/health` and `/.well-known/…`.

Sign-in cookies are tied to a single host. Administrators therefore sign in on `admin.demo…` separately from any session on `login.demo…`.

Example site file (`/etc/nginx/sites-available/admin.demo.africadigitalsynergy.com`, enabled by symlink). Keep the HTTP-01 challenge block that you used to issue the certificate.

```nginx
server {
    listen 80;
    server_name admin.demo.africadigitalsynergy.com;
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/ads-demo-admin-acme;
        default_type text/plain;
        try_files $uri =404;
    }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl;
    server_name admin.demo.africadigitalsynergy.com;
    ssl_certificate     /etc/letsencrypt/live/admin.demo.africadigitalsynergy.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.demo.africadigitalsynergy.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 64k;
    add_header X-Robots-Tag "noindex, nofollow" always;
    add_header Strict-Transport-Security "max-age=31536000" always;

    # Shared proxy settings for the allowed paths only.
    set $ads_identity http://127.0.0.1:18090;

    location = /               { return 302 /demo-admin; }
    location = /demo-admin     { include /etc/nginx/snippets/ads-demo-identity-proxy.conf; }
    location ^~ /demo-admin/   { include /etc/nginx/snippets/ads-demo-identity-proxy.conf; }
    location = /login          { include /etc/nginx/snippets/ads-demo-identity-proxy.conf; }
    location = /logout         { include /etc/nginx/snippets/ads-demo-identity-proxy.conf; }
    location = /register       { include /etc/nginx/snippets/ads-demo-identity-proxy.conf; }
    location = /forgot-password { include /etc/nginx/snippets/ads-demo-identity-proxy.conf; }

    location / { return 404; }
}
```

`/etc/nginx/snippets/ads-demo-identity-proxy.conf`:

```nginx
proxy_pass $ads_identity;
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto https;
proxy_connect_timeout 5s;
proxy_read_timeout 30s;
```

Optional: to restrict the dashboard to known networks, add `allow <address>; deny all;` inside the two `/demo-admin` locations.

Validate and reload: `nginx -t && systemctl reload nginx`.

### 4.2 Public sign-in host: `login.demo.africadigitalsynergy.com`

- **`/demo-access/v1/requests` must stay reachable** on this host. Browsers on the Commerce page post to it. Identity itself restricts CORS to the registered Commerce origin `https://commerce.demo.africadigitalsynergy.com`: a request from any other origin gets `403`. Do not add CORS headers at the proxy, and do not strip the `Origin` header.
- **`/demo-access/v1/grants/check` must not be public.** It is meant only for the Commerce server, and the Commerce server calls identity over the internal Docker network (§4.3). Block it at the public proxy.
- The dashboard has its own host, so also hide `/demo-admin` here.

Add these locations to the existing HTTPS `server` block for `login.demo…`, above `location /`:

```nginx
    location = /demo-access/v1/grants/check { return 404; }
    location = /demo-admin                  { return 404; }
    location ^~ /demo-admin/                { return 404; }
```

Back up the site file before you edit it. `deploy/contabo-demo/publish-demo-login.py` checks this file against its own template, so after a manual edit it will no longer recognise the file. That matters only if the script is run again.

### 4.3 Commerce to identity grant check

The Commerce API calls `GET {DEMO_ACCESS_IDENTITY_URL}/demo-access/v1/grants/check` with `Authorization: Bearer <secret>`.

- **Preferred:** attach the Commerce API service to the existing external Docker network `ads-demo-private` and use `DEMO_ACCESS_IDENTITY_URL=http://ads-demo-identity:8084`. This is a change to the Commerce compose file (see Commerce `DEMO_ACCESS.md`). The identity compose file stays as it is. The identity database is also on this network and stays password-protected.
- **Fallback:** if the networks cannot be joined, use `https://login.demo.africadigitalsynergy.com` and, instead of the `return 404` above, allow only the server's own public address:
  `location = /demo-access/v1/grants/check { allow 161.97.128.153; deny all; include /etc/nginx/snippets/ads-demo-identity-proxy.conf; }` (with `set $ads_identity http://127.0.0.1:18090;` in that server block).

Even if this path were reached, a wrong or missing secret gets `401`. Commerce fails closed: when identity cannot be reached, signed-in demo calls are refused.

---

## 5. Order of steps

Each step must pass before you start the next.

1. **Back up both databases** (on the server, as root):
   ```bash
   install -d -m 700 /var/backups/ads-demo-access
   ts=$(date +%Y%m%d-%H%M%S)
   cd /opt/ads/demo-platform-kit
   docker compose --env-file /etc/ads-demo/images.env -f deploy/contabo-demo/compose.identity.yml \
     exec -T db pg_dump -U ads_demo_identity -Fc ads_demo_identity > /var/backups/ads-demo-access/identity-$ts.dump
   cd <Commerce checkout>
   docker compose --env-file /etc/ads-demo/commerce.env -f deploy/demo/compose.yml \
     exec -T db pg_dump -U commerce_demo_owner -Fc commerce_demo > /var/backups/ads-demo-access/commerce-$ts.dump
   ls -l /var/backups/ads-demo-access/   # both files must be non-empty
   ```
   Also copy `/etc/ads-demo/identity.env` and `/etc/ads-demo/commerce.env` to the same folder (mode 0600), and record the current image tags from `/etc/ads-demo/images.env` and `commerce.env`.
2. **Set the identity environment** (§3) in `/etc/ads-demo/identity.env`, including `DEMO_SHOW_CREDENTIALS=0`, the SMTP settings and the generated check secret.
3. **Deploy identity:** set the reviewed `ADS_DEMO_IDENTITY_IMAGE` in `/etc/ads-demo/images.env`, then run `bash deploy/contabo-demo/deploy-identity.sh`. Migration `007_demo_access.sql` is applied automatically when the container starts (`IDENTITY_AUTO_MIGRATE` is not `false`). Do **not** re-run `bootstrap-demo-accounts.sh`.
4. **Verify identity:**
   ```bash
   curl -fsS http://127.0.0.1:18090/health                       # {"status":"ok",...}
   docker logs ads-demo-identity 2>&1 | grep -E 'migration applied: 007_demo_access|mail=smtp'
   cd /opt/ads/demo-platform-kit && docker compose --env-file /etc/ads-demo/images.env -f deploy/contabo-demo/compose.identity.yml \
     exec -T db psql -U ads_demo_identity -d ads_demo_identity -tAc "SELECT name FROM public.ads_identity_migrations WHERE name='007_demo_access.sql'"
   docker exec ads-demo-identity node -e 'process.exit(process.env.DEMO_SHOW_CREDENTIALS==="1"?1:0)' && echo CREDENTIALS_HIDDEN
   ```
   Then register or confirm the administrator account (§2) and configure the proxy (§4). Reload Nginx.
5. **Deploy Commerce** with its migrations, following Commerce `DEPLOYMENT_GATE.md` and `DEMO_ACCESS.md`: set the Commerce variables (§3), run `--profile migration run --rm migrate`, then `up -d commerce-api commerce-web`, then check `curl -fsS http://127.0.0.1:18086/api/ready`.
6. **Smoke test:**
   ```bash
   # Access requests: allowed from Commerce only
   curl -s -o /dev/null -w '%{http_code}\n' -X OPTIONS https://login.demo.africadigitalsynergy.com/demo-access/v1/requests \
     -H 'Origin: https://commerce.demo.africadigitalsynergy.com' -H 'Access-Control-Request-Method: POST'   # 204
   curl -s -o /dev/null -w '%{http_code}\n' -X OPTIONS https://login.demo.africadigitalsynergy.com/demo-access/v1/requests \
     -H 'Origin: https://example.org' -H 'Access-Control-Request-Method: POST'                              # 403
   # Grant check: not public
   curl -s -o /dev/null -w '%{http_code}\n' 'https://login.demo.africadigitalsynergy.com/demo-access/v1/grants/check?platform=commerce&sub=00000000-0000-4000-8000-000000000000'  # 404 (or 403 with the fallback)
   # Dashboard host: only the dashboard and sign-in
   curl -s -o /dev/null -w '%{http_code}\n' https://admin.demo.africadigitalsynergy.com/demo-admin   # 302 to /login
   curl -s -o /dev/null -w '%{http_code}\n' https://admin.demo.africadigitalsynergy.com/admin        # 404
   curl -s -o /dev/null -w '%{http_code}\n' https://admin.demo.africadigitalsynergy.com/authorize    # 404
   # Commerce page
   curl -s -o /dev/null -w '%{http_code}\n' https://commerce.demo.africadigitalsynergy.com/commerce/demo   # 200
   ```
   From inside the Commerce API container, a grant check with the configured secret and an unknown user should return `{"access":"none","reason":"NO_GRANT"}`. The same check with a wrong secret should return `401`.
7. **Publish the portal update** (Commerce buttons point to `/commerce/demo`) through the usual reviewed portal release. Do this only after step 6 passes, so the portal never links to a page that is not live.
8. **Live acceptance** (§7).

---

## 6. Rollback

| Situation | Action |
|---|---|
| Switch the feature off quickly | In Commerce set `COMMERCE_DEMO_ACCESS=0` and recreate the Commerce API. Then, in identity, set `DEMO_ACCESS_ENABLED=0` and recreate identity (`docker compose … up -d --no-deps identity`). Do Commerce first: while Commerce still checks grants, identity with the feature off answers 404 and Commerce refuses signed-in demo calls. With the feature off, all `/demo-access/` and `/demo-admin` paths return 404. Requests and grants stay in the database. |
| Identity release problem | Put the previous `ADS_DEMO_IDENTITY_IMAGE` back in `/etc/ads-demo/images.env` and run `deploy-identity.sh`. Migration 007 only **adds** tables (`demo_access_requests`, `demo_access_grants`, `demo_outbox`) and changes no existing table, so the previous identity runs normally with them present. There is no need to remove them. |
| Commerce release problem | Redeploy the previous API and web image tags. Commerce migrations are forward-only (see `DEPLOYMENT_GATE.md`). If a schema restore is ever needed, use the step 1 backup and the tested restoration procedure. |
| Portal | Redeploy the previous portal image. |
| Shared passwords shown by mistake | Set `DEMO_SHOW_CREDENTIALS=0`, recreate identity, then change `DEMO_USER_PASSWORD` and `DEMO_PERSONA_PASSWORD` and run `demo-reset` as described in the identity README. |

Keep the step 1 backup files until live acceptance is signed off.

---

## 7. Live acceptance checklist

Use one test mailbox that is not an administrator address (the "applicant"), and an ordinary ADS account that is not in `DEMO_ACCESS_ADMIN_EMAILS` (the "non-admin"). Test on a desktop browser and on a phone.

1. [ ] On `https://commerce.demo.africadigitalsynergy.com/commerce/demo`, submit a request with the applicant's address. The page confirms receipt without naming anyone.
2. [ ] `kengjisehs@africadigitalsynergy.com` and `kengjisehs@gmail.com` each receive their **own** notification, in the **inbox** (not spam), with the request reference and a review link.
3. [ ] The review link opens `admin.demo.africadigitalsynergy.com` and **asks for sign-in** first.
4. [ ] Signed in as the non-admin, the dashboard is **refused**, and the denial appears in the dashboard audit when an administrator checks.
5. [ ] Signed in as the administrator, **approve** the request. The dashboard shows the grant and its dates.
6. [ ] Clicking **Approve twice quickly** (or reloading the form) creates **one** invitation only, and the applicant receives one invitation email.
7. [ ] The applicant opens the invitation, **sets a password**, and lands on the Commerce **persona page**.
8. [ ] As **shopper**, place an order in the demo shop.
9. [ ] Switch to **shop owner**: no password is asked, and the order from step 8 is visible.
10. [ ] As **cashier**, complete a POS sale. It appears in the shop's **cash records**.
11. [ ] The persona page offers **no Reviewer or Support** personas.
12. [ ] The applicant has **no access to Education** or any other ADS platform with this approval.
13. [ ] On the dashboard, **revoke** the grant. Within **60 seconds**, the applicant's next action in Commerce is refused with a "demo access" message.
14. [ ] **Expiry:** the dashboard shows the grant's expiry date (30 days after activation). The expiry behaviour itself is covered by the automated identity and Commerce tests. It is not shortened on the live server.
15. [ ] Submit a second request from another test address and **reject** it. That address receives a **neutral** notice with no internal note or reason.
16. [ ] **Email outage:** block outgoing SMTP for no more than 5 minutes (for example `iptables -I DOCKER-USER -p tcp --dport 587 -j REJECT`), and submit a request. The visitor sees **"Request received and being processed"**, and the dashboard shows the request with its notification queued. Remove the block (`iptables -D DOCKER-USER -p tcp --dport 587 -j REJECT`). Within about 10 minutes, each administrator receives the notification **once**, with no duplicates.
17. [ ] Repeat steps 1, 7 and 9 in **French** (`?lang=fr` or the language switch). Emails, the Commerce page, the invitation page and the dashboard are in French.
18. [ ] Repeat steps 1, 7 and 8 on a **phone**. The pages fit the screen without horizontal scrolling.
19. [ ] The portal at `https://demo.africadigitalsynergy.com` shows "Request demo access" for Commerce (in French: "Demander un accès de démonstration"), opens the Commerce request page, and shows no demo passwords and no administration links. The public sign-in page shows no shared demo credentials.

Record the date, the operator, the image tags and the result of each item. Then remove the test grants from the dashboard (revoke) and keep the backups until sign-off.

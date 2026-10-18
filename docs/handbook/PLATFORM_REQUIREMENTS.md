# ADS Platform Requirements v1.0

Cross-cutting requirements that **every ADS product** must meet, in addition to its own BRS/FRS. Shared services that implement them live in `ksondo/ads-platform-kit`. Each product's traceability matrix lists the PLAT requirements it has met.

Status key: **Available** = the shared service exists; **Planned** = to be built in ads-platform-kit; product connection status is tracked in each product's traceability matrix.

| ID | Requirement | Shared service | Status |
| --- | --- | --- | --- |
| PLAT-ID-001 | One ADS account: every product signs users in through the shared ADS sign-in | ads-platform-kit `services/identity` + `ads-identity.js` | **Available** (18 Oct 2026); no product connected yet |
| PLAT-ID-002 | Registration with email activation; sign-in with Google; password reset by email | identity service | Available |
| PLAT-ID-003 | Phone-number sign-up with SMS code | identity service | Planned |
| PLAT-ROLE-001 | Roles and services managed by admins, enforced on the server | identity `/admin/v1` API + `/admin` page; invitations into an organisation | **Available** (18 Oct 2026); per-product menu filtering (AC-1) is each product's job |
| PLAT-AUD-001 | Audit trail of security and business events, viewable by admins | audit service | Partly (sign-in events) |
| PLAT-OBS-001 | Structured logs, error tracking, health checks, alerts | operations kit | Planned |
| PLAT-NOT-001 | Notifications by email, SMS, push and USSD, with a notifications centre | notification service | Planned |
| PLAT-PAY-001 | MTN MoMo and Orange Money payments with honest payment states | payment service | Planned |
| PLAT-I18N-001 | English and French everywhere, chosen by the user | UI kit | Planned |
| PLAT-UX-001 | ADS master design system + product sector profile; standard screen states | UI kit | Planned |
| PLAT-A11Y-001 | WCAG 2.2 AA accessibility | UI kit + CI check | Planned |
| PLAT-CH-001 | Channels: responsive web and PWA for all; Android/iOS apps and USSD/SMS where the product needs them | app templates | Planned |
| PLAT-DATA-001 | Consent, data export and deletion requests | identity + audit | Planned |
| PLAT-SEC-001 | OWASP ASVS Level 2 baseline | handbook §6 | Applies now |
| PLAT-EXT-001 | External parties (regulators, licences, banks, insurers, payment/settlement/KYC providers, legal/clinical sign-off) never block development: build against sandbox or mock adapters; real approval is a go-live gate only | mock providers in ads-platform-kit (`services/mocks`) + E2E kit (`packages/e2e-kit`) + handbook §12.1 | Applies now; shared mocks **Available** (18 Oct 2026) |

---

## PLAT-ID-001 One ADS account across all products

**Requirement:** A person has one ADS account and uses it in every ADS product. Products do not store passwords or run their own login. They redirect to the shared sign-in, receive a signed token with `sub` (user), `tenant_id` (organisation or personal workspace) and `roles`, and verify it on their server.

- **US-PLAT-ID-001-1** As a customer, I want to sign in to any ADS product with the same account so that I don't create and remember several accounts.
  - **AC-1** Given I am signed in to one ADS product, when I open another ADS product and choose *Sign in*, then I am signed in without typing my password again.
  - **AC-2** Given I sign in from a product, when sign-in completes, then I return to the page of that product where I started.
  - **AC-3** Given I choose *Sign out* in a product, then I am signed out of the ADS account on that device, and returning to any product asks me to sign in.
- **US-PLAT-ID-001-2** As a product team, I want to verify tokens on our server so that only signed-in users with the right role and workspace reach our data.
  - **AC-1** Given a token from another issuer, for another product (audience), expired, or with a bad signature, when it reaches the product API, then the request is rejected with 401.
  - **AC-2** Given a valid token whose `roles` do not include the required role, then the request is rejected with 403 and audited.
  - **AC-3** Given a valid token, when the product queries its database, then it can only read and write rows of the token's `tenant_id`.
- **US-PLAT-ID-001-3** As a staff member of several organisations, I want to choose which organisation I am working for when I sign in so that I see the right data.
  - **AC-1** Given I hold roles for this product in two organisations, when I sign in, then I am asked once which one to use.
  - **AC-2** Given I hold no role for a staff-only product, when I sign in, then I see a clear "No access yet, ask your administrator" page.

**How to connect a product:** `ksondo/ads-platform-kit` `docs/INTEGRATING_A_PRODUCT.md`. **Migration of existing logins:** HopeBridge, Morphoo, Project Management and retail-connect-kit replace their own logins; the Hub needs a server first; Software Factory switches its identity address (`docs/SOFTWARE_FACTORY_SWITCH_OVER.md` in the kit).

## PLAT-ID-002 Registration, activation, Google sign-in, password reset

- **US** As a new customer, I want to create an account with my email and confirm it so that my account is protected and messages reach me.
  - **AC-1** Given I register, then I receive an activation email in English and French, valid 24 hours.
  - **AC-2** Given I open the link and type the password I chose, then my account is active and I am signed in.
  - **AC-3** Given someone else registered my email before me, then their password can never activate my account.
- **US** As a customer, I want to sign in with Google so that I don't need a new password.
- **US** As a customer who forgot my password, I want a reset link by email so that I can get back in; all my other sessions end when I reset it.

## PLAT-ROLE-001 Admin-managed roles and services

- **US** As an organisation administrator, I want to invite staff, give them roles and choose which services each role can use so that each person sees only what they need.
  - **AC-1** Given I grant the role *Cashier* the service *Point of sale*, when a cashier signs in, then the menu shows Point of sale and not services they were not granted.
  - **AC-2** Given a user tries to open a service they were not granted (for example by typing its address), then the server refuses and the attempt is audited.
  - **AC-3** Given I deactivate a staff member, then they are signed out everywhere within 15 minutes and cannot sign in.
- **US** As an ADS platform administrator, I want to enable products and services per organisation so that customers only get what they subscribed to.

## PLAT-AUD-001 Audit trail

- **US** As an administrator, I want to see who did what and when (with before/after values for changes) so that I can investigate problems and prove compliance.
  - **AC-1** Every sign-in, permission change, money movement and record approval is recorded with user, organisation, time, IP and outcome.
  - **AC-2** Audit records cannot be changed or deleted by the application.
  - **AC-3** Administrators can filter and export audit records for their organisation only.

## PLAT-OBS-001 Logs, monitoring and alerts

- Structured JSON logs with request IDs and no secrets or personal data; error tracking; `/health` and `/ready` endpoints; uptime and error-rate alerts to the operations contact.

## PLAT-NOT-001 Notifications

- **US** As a customer, I want to receive important updates (payment confirmed, appointment reminder, request status) by the channel I choose, in my language, and to see them in a notifications centre.

## PLAT-PAY-001 Payments

- **US** As a customer, I want to pay with MTN MoMo or Orange Money and always see an honest status (*Pending*, *Paid*, *Failed*, *Refunded*) so that I know where my money is.
  - **AC** A payment is *Paid* only after the provider confirms; unknown outcomes stay *Pending* and are reconciled automatically.

## PLAT-I18N-001, PLAT-UX-001, PLAT-A11Y-001

- Every screen, message, email and SMS is available in English and French; the user's choice is remembered in their account.
- Every product uses the ADS master design system with its sector profile ([UIUX_REGISTER.md](UIUX_REGISTER.md)) and handles loading, empty, error, denied, success and offline states.
- WCAG 2.2 AA: contrast, 44 px touch targets, keyboard navigation, visible focus, labels for screen readers; checked automatically in CI.

## PLAT-CH-001 Channels

| Channel | Applies to |
| --- | --- |
| Responsive web (360 px phones to desktop) | All products |
| PWA (installable, offline shell, cached data where safe) | All customer-facing products |
| Android and iOS apps (Capacitor wrapper of the same React app) | Commerce (plus Android POS), Tontine, Agriculture, Mama Care, Health, Logistics and Fleet Guard (driver/courier app), Education, Career Path, Nutrition, HopeBridge, SoulBridge, Morphoo, Leisure, Home Services, AfriCover, Personal Finance |
| USSD and SMS | Tontine, Agriculture, HopeBridge, SoulBridge (help requests), with SMS reminders for Health and Mama Care |
| Desktop web only | Software Factory, Hub, Project Management; VentureWorks and Investment platform (apps later) |

## PLAT-DATA-001 Consent, export, deletion

- **US** As a customer, I want to see what I consented to, download my data and ask for my account to be deleted so that I stay in control of my personal information.

## PLAT-EXT-001 External parties never block development

Owner decision, 18 October 2026: regulator, licence, bank, insurer, payment/settlement/KYC provider and legal or clinical sign-off requirements are external rules. Products are built and tested against sandboxes or mock adapters; the real approval is needed only before real customers, money, policies or clinical data go live. See handbook §12.1.

- **US-PLAT-EXT-001-1** As a product team, I want every external party behind an adapter with a sandbox or mock so that we can build and test the whole journey before any partner is signed.
  - **AC-1** Given no partner is contracted, when the journey runs in test mode, then it completes end to end against the mock, including failure, timeout and duplicate-event cases.
  - **AC-2** Given the product runs on a sandbox or mock, then every affected screen shows a clear "Test mode" label and no real money, policy or clinical record is created.
  - **AC-3** Given a partner is later contracted, when the configuration switches to the live adapter, then no product code changes are needed, and the switch is recorded in the release record.

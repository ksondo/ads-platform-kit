# Morphoo private visitor platform registry — source only

- Added Morphoo to the Identity registry with a single member persona in the visitor-owned main tenant, not staff, admin, steward, or mentor personas.
- Private CLI allowlist explicitly includes Morphoo, but provisioning still requires an independently configured product secret and the existing ADS demo/private mode controls.
- Morphoo is marked private_only. Public access requests for it fail with 404 before any database query or email, even if other platforms are in public request mode.
- No invitations, grants, user accounts, customer data, mail, migration, deploy or activation have been created.
- No additional role, cross-tenant grant, public-account endpoint or administrator privileges are enabled.
- Must be independently reviewed and paired with Morphoo server-side grant checks and isolated private-mode OIDC/API/DB/UX acceptance before deployment.
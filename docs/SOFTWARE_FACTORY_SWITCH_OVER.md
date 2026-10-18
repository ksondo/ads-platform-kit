# Moving Software Factory's sign-in off the RAG repo

Software Factory signs users in through the "ADS Identity Service" whose code lived in `ksondo/RAG-Intelligence-AI-Platform` (`services/identity-service`). That code now lives here, with the same JSON API, so Software Factory needs no code change to switch. After the switch, the RAG repo can be archived without breaking sign-in.

## What stays the same

`/v1/identity/register`, `/login`, `/onboard`, `/session`, `/logout`, `/internal/session` and `/internal/verify` keep their request and response shapes. Existing users, passwords (scrypt hashes), organisations, tenants, projects and memberships in the `platform` schema are used as they are: migration `002` only adds tables and columns.

## What changes for users

- **New accounts must confirm their email** before signing in. `/v1/identity/register` now returns `status: "pending"`, and `/v1/identity/login` returns `403 EMAIL_NOT_VERIFIED` until the person opens the emailed link and types their password on that page. The developer portal should show "Check your email" after registering and handle that error code. To keep the old behaviour temporarily, set `IDENTITY_REQUIRE_EMAIL_VERIFICATION=false`.
- Minimum password length is 10 (was 12 in registration), and common passwords are refused.
- Sign-in and registration are rate-limited.

## Steps

1. Deploy this service (see [README](../README.md)) pointing `DATABASE_URL` at the **same PostgreSQL database** the RAG-repo identity service uses. Startup applies migration `002`, which is additive.
2. Keep `/internal/*` reachable only from Software Factory's server (private network); block it at the public proxy.
3. In Software Factory's deployment, set `IDENTITY_BASE_URL` to the new service, and update `apps/developer-portal/nginx.conf`, which currently proxies `/v1/identity/` to `http://africorestack-identity:8084`, to the new container name or address.
4. Check: register, confirm email, log in, onboard, and open a project in the developer portal.
5. Stop the old identity container. Then archive `ksondo/RAG-Intelligence-AI-Platform`, after moving the other pieces listed in the engineering report.

## Later: move Software Factory to the shared sign-in pages

Register Software Factory as a client (`register-client --id software-factory ...`) and replace its own login form with `ads-identity.js`. Users then get Google sign-in, password reset and single sign-on with the other ADS products. Its server would verify JWTs (as the template repos do) instead of calling `/internal/session`.

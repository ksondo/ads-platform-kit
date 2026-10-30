# SH-1 foundation evidence: 30 October 2026

Branch `feat/SH-1-plans-prices`, kit baseline `d76980d`. Local uncommitted API/database foundation only. No PR, CI, merge, deployment or acceptance claim.

- Real PostgreSQL/API suite: **10 passed, 0 failed, 0 skipped**, using fresh disposable `subscription_test_v3` on local PostgreSQL port 55432, a generated restricted NOBYPASSRLS login, real HTTP and RS256 test tokens.
- Included: invalid/wrong-issuer/expired/wrong-signature/wrong-audience tokens; operator role/staff tenant boundaries; configurable free and positive prices; tariff version/optimistic conflicts; future effective dates; immutable historical terms; simultaneous retries; same-key cross-product separation; RLS foreign-tenant hiding; snapshot/audit/paid-activation tampering; migration checksum drift; latest eligibility; cancellation/expiry/future-start/overlap limits.
- Tokens use the same cryptographic verification contract as ADS identity. Hosted ADS login itself and remote JWKS rollover were **not exercised** by this test suite.
- Operator/customer screens, owner visual approval for new screens, Playwright EN desktop/FR 360 px, reminder/renewal jobs, container smoke test, provider/manual-payment approval and product integration are **not implemented or not run** in this slice. SH-1 as a whole remains incomplete. Existing identity code is unchanged.

Run from `services/subscriptions` with `SUBSCRIPTIONS_TEST_DATABASE_URL` set to a dedicated owner connection, then `npm test`. Test DB absence explicitly skips database tests; do not count a skipped suite as PostgreSQL evidence. No production data is used and no price is seeded by migration.

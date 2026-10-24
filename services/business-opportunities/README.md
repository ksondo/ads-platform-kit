# ADS Business Opportunities — database-backed catalogue (v1)

## Scope and authority
This feature changes ONLY /opportunities and /opportunities/:id in the existing public ADS demo portal. The landing page, platform directory and details, cloud page, company links, login and demo-access journeys must remain intact. It consumes an **independent PostgreSQL 16 catalogue database** and one read-only public API. It does not touch the shared identity, Commerce schema, existing platform service or private application data.

## 333 mappings are not 333 certified products
Authoritative discovery source: seed/opportunities.v1.json, from the 23 Oct ADS discovery catalogue (50 sector categories, 324 named candidate capabilities, 333 sector-to-tool combinations, 52 business search profiles). Every opportunity has an initial user-facing summary, commercial-use explanation, repository provenance and readiness=discovery_only. These summaries are editorial drafts: confirm them before treating them as sales commitments. The 324 names are **not** confirmed reusable, production-ready components. No public demo URL is invented. Existing Commerce demo links in /platforms and the original catalogue are preserved unchanged.

## Architecture
Browser /opportunities → GET /api/opportunities/v1/... → separate read-only Node API → isolated catalogue PostgreSQL. The initial data file is imported transactionally by an operator once. Browser **never** reads seed JSON or queries PostgreSQL directly. No startup migrations or seeding. Public reads require no sign-in; verified applications manage their own shared ADS SSO journeys. Contact stays WhatsApp +237654035075, and the pre-existing Partners link gate is unchanged.

## Database provisioning (one-time, authorized operator)
1. Create an **independent logical database** on approved PostgreSQL 16, for example ads_opportunities; never point to Commerce or ADS Identity databases.
2. Create a dedicated migration owner and separate SELECT-only runtime account. Do not use a superuser, database owner or identity credentials for the runtime account.
3. Apply db/001_catalogue.sql using the migration owner, with ON_ERROR_STOP=1.
4. Grant runtime CONNECT on its dedicated database, USAGE on schema opportunities and SELECT on its four tables; no UPDATE/INSERT/DELETE/CREATE.
5. Run npm install in services/business-opportunities (Node 22), then:
   - node validate-seed.mjs
   - OPPORTUNITIES_MIGRATION_DATABASE_URL=<operator-only migration connection> node seed.mjs
6. Verify SELECT count(*) from opportunities.sector_opportunities equals 333, sectors 50, businesses 52. Repeated seeding is additive/idempotent (ON CONFLICT DO NOTHING); **there is no reset**. Schema migrations are forward-only.
7. Launch server.mjs with OPPORTUNITIES_DATABASE_URL=<read-only runtime connection>; bind the service to loopback port 18090 through a root-owned systemd or isolated compose process and route only the path prefix /api/opportunities/v1/ from the existing HTTPS vhost to http://127.0.0.1:18090. Preserve all current vhost routes and identity endpoints.
8. Gate portal promotion on real database/API checks: /api/opportunities/v1/sectors has 50 rows, /api/opportunities/v1/opportunities?limit=1 returns total 333, /api/opportunities/v1/businesses/suggest?q=sawmill returns matches, /api/opportunities/v1/opportunities/{id} returns its summary. Confirm all other pages and new-tab Commerce and POS links are still correct.

## Routes and user journeys
- GET /api/opportunities/v1/sectors — sector counts.
- GET /api/opportunities/v1/opportunities?sector=...&q=...&page=...&limit=... — paginated public discovery.
- GET /api/opportunities/v1/opportunities/:id — one opportunity, summary and business model.
- GET /api/opportunities/v1/businesses/suggest?q=... — typeahead for a business.
- GET /api/opportunities/v1/businesses/:id — business profile and recommended sector mappings.
- /opportunities and /opportunities/:id remain under existing portal header/footer. Visitors may browse anonymously; demo sign-in occurs only on the selected platform.

## Operational and publication gates
Do NOT deploy the updated portal before API ingress and DB provisioning. If the API is unavailable the opportunity area shows an error rather than claims about available tools; other portal pages remain functional. The new public read API must never expose a database password, arbitrary SQL, mutation routes, private contact data, unverified demo links, or an internal admin write endpoint.

Before public publication: integration tests against real PostgreSQL, negative auth/permission testing, browser responsive and EN/FR tests, URL and new-tab checks, Commerce portal acceptance, load/rate-limit checks, and review of opportunity summaries. EN/FR navigation is present but per-opportunity summaries are currently English-only with an explicit note, so bilingual content completion is still pending. An approval/audit-backed admin editor and publication workflow may be added separately after secure authorization review.

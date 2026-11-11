-- Service clients (OAuth 2.0 client_credentials) and per-client token exchange allow lists. Additive only.

-- 'web': a product people sign in to (authorization code + PKCE), as before.
-- 'service': a product SERVER calling another ADS API with its own credentials; no users, no tenant.
ALTER TABLE platform.oauth_clients ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'web';
-- Scopes and audiences a service client may request with client_credentials.
ALTER TABLE platform.oauth_clients ADD COLUMN IF NOT EXISTS service_scopes text[] NOT NULL DEFAULT '{}';
ALTER TABLE platform.oauth_clients ADD COLUMN IF NOT EXISTS service_audiences text[] NOT NULL DEFAULT '{}';
-- [{ "audience": "...", "scopes": ["..."] }]: audiences a sign-in client's server may exchange its users' tokens for.
ALTER TABLE platform.oauth_clients ADD COLUMN IF NOT EXISTS token_exchange jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE platform.oauth_clients DROP CONSTRAINT IF EXISTS oauth_clients_kind_check;
ALTER TABLE platform.oauth_clients ADD CONSTRAINT oauth_clients_kind_check CHECK (kind IN ('web', 'service'));
ALTER TABLE platform.oauth_clients DROP CONSTRAINT IF EXISTS oauth_clients_kind_fields_check;
ALTER TABLE platform.oauth_clients ADD CONSTRAINT oauth_clients_kind_fields_check CHECK (
  jsonb_typeof(token_exchange) = 'array' AND (
    (kind = 'web' AND cardinality(service_scopes) = 0 AND cardinality(service_audiences) = 0)
    OR (kind = 'service' AND cardinality(redirect_uris) = 0 AND cardinality(post_logout_redirect_uris) = 0
        AND cardinality(self_service_roles) = 0 AND NOT allow_personal_workspace AND cardinality(admin_scopes) = 0
        AND cardinality(admin_roles) = 0 AND cardinality(assignable_roles) = 0 AND token_exchange = '[]'::jsonb
        AND cardinality(service_scopes) > 0 AND cardinality(service_audiences) > 0)
  )
);

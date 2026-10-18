-- ADS Platform Kit login: email activation, password reset, Google sign-in,
-- hosted sign-in for products (authorization code + PKCE), product roles.
-- Additive only: existing platform.* data from the RAG-repo identity service keeps working.

ALTER TABLE platform.users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE platform.users ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE platform.users ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en','fr'));

-- 'personal' workspaces are created automatically for consumer products; Software Factory's
-- legacy onboarding only counts real organisations, so it is not blocked by them.
ALTER TABLE platform.organizations ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'organization' CHECK (kind IN ('organization','personal'));

-- One-time links sent by email (activation, password reset). Only hashes are stored.
CREATE TABLE IF NOT EXISTS platform.email_tokens (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('verify_email','reset_password')),
  token_hash text NOT NULL UNIQUE,
  -- For activation: the password chosen at that registration. It only becomes the account
  -- password when the mailbox owner opens the link AND types that same password.
  password_hash text,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_tokens_user ON platform.email_tokens(user_id, purpose) WHERE used_at IS NULL;

-- Sign-in accounts at other providers (Google), linked to an ADS user.
CREATE TABLE IF NOT EXISTS platform.external_identities (
  provider text NOT NULL CHECK (provider IN ('google')),
  subject text NOT NULL,
  user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, subject)
);

-- Each ADS product that uses the shared sign-in is a registered client.
CREATE TABLE IF NOT EXISTS platform.oauth_clients (
  client_id text PRIMARY KEY CHECK (client_id ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  display_name text NOT NULL,
  logo_url text,
  accent_color text CHECK (accent_color IS NULL OR accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  redirect_uris text[] NOT NULL,
  post_logout_redirect_uris text[] NOT NULL DEFAULT '{}',
  self_service_roles text[] NOT NULL DEFAULT '{}',
  allow_personal_workspace boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Roles a user holds in one product for one organisation workspace (tenant).
CREATE TABLE IF NOT EXISTS platform.product_roles (
  user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  client_id text NOT NULL REFERENCES platform.oauth_clients(client_id) ON DELETE CASCADE,
  roles text[] NOT NULL DEFAULT '{}',
  granted_by uuid REFERENCES platform.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id, client_id)
);

-- A sign-in request from a product, kept while the user is on the login pages.
CREATE TABLE IF NOT EXISTS platform.auth_requests (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES platform.oauth_clients(client_id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  state text NOT NULL,
  code_challenge text NOT NULL,
  nonce text,
  tenant_hint uuid,
  locale text NOT NULL DEFAULT 'en',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One-time authorization codes handed back to the product.
CREATE TABLE IF NOT EXISTS platform.auth_codes (
  code_hash text PRIMARY KEY,
  client_id text NOT NULL REFERENCES platform.oauth_clients(client_id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  nonce text,
  user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  sso_session_id uuid,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

-- Rotating refresh tokens. Reusing an old one revokes the whole family.
CREATE TABLE IF NOT EXISTS platform.refresh_tokens (
  id uuid PRIMARY KEY,
  family_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  client_id text NOT NULL REFERENCES platform.oauth_clients(client_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  sso_session_id uuid,
  expires_at timestamptz NOT NULL,
  rotated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refresh_family ON platform.refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON platform.refresh_tokens(user_id) WHERE revoked_at IS NULL;

-- Browser sign-in session on the login domain (gives single sign-on across products).
CREATE TABLE IF NOT EXISTS platform.sso_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  method text NOT NULL CHECK (method IN ('password','google')),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sso_user ON platform.sso_sessions(user_id) WHERE revoked_at IS NULL;

-- Google round-trip state.
CREATE TABLE IF NOT EXISTS platform.google_states (
  state_hash text PRIMARY KEY,
  auth_request_id text REFERENCES platform.auth_requests(id) ON DELETE CASCADE,
  code_verifier text NOT NULL,
  nonce text NOT NULL,
  expires_at timestamptz NOT NULL
);

-- Audit rows are append-only for the runtime role (see deploy/README for the role grants).
CREATE OR REPLACE FUNCTION platform.identity_audit_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'identity_audit is append-only';
END $$;
DROP TRIGGER IF EXISTS trg_identity_audit_append_only ON platform.identity_audit;
CREATE TRIGGER trg_identity_audit_append_only BEFORE UPDATE OR DELETE ON platform.identity_audit
  FOR EACH ROW EXECUTE FUNCTION platform.identity_audit_append_only();
ALTER TABLE platform.identity_audit ADD COLUMN IF NOT EXISTS ip text;
ALTER TABLE platform.identity_audit ADD COLUMN IF NOT EXISTS client_id text;

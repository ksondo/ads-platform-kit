-- Organisation admin API (PLAT-ROLE-001) and invitations into an organisation. Additive only.

-- Product servers authenticate to the identity service with their own client secret (hash only)
-- to exchange an organisation admin's product token for a short-lived admin token.
ALTER TABLE platform.oauth_clients ADD COLUMN IF NOT EXISTS client_secret_hash text;
-- Admin permissions this product's server may request on behalf of its admins.
ALTER TABLE platform.oauth_clients ADD COLUMN IF NOT EXISTS admin_scopes text[] NOT NULL DEFAULT '{}';
-- Product roles whose holders administer this product inside their organisation (e.g. facility_admin).
ALTER TABLE platform.oauth_clients ADD COLUMN IF NOT EXISTS admin_roles text[] NOT NULL DEFAULT '{}';
-- When not empty, only these roles can be granted for this product.
ALTER TABLE platform.oauth_clients ADD COLUMN IF NOT EXISTS assignable_roles text[] NOT NULL DEFAULT '{}';

-- Invitations into an organisation workspace for one product with roles. Only the token hash is kept.
CREATE TABLE IF NOT EXISTS platform.invitations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  client_id text NOT NULL REFERENCES platform.oauth_clients(client_id) ON DELETE CASCADE,
  email text NOT NULL,
  phone text,
  roles text[] NOT NULL CHECK (cardinality(roles) > 0),
  -- Also make the person an organisation admin (only organisation admins can invite one).
  org_admin boolean NOT NULL DEFAULT false,
  locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en','fr')),
  token_hash text NOT NULL UNIQUE,
  invited_by uuid REFERENCES platform.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES platform.users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES platform.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invitations_tenant ON platform.invitations(tenant_id, client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON platform.invitations(email) WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- Where to send the user after a Google round-trip that started from an invitation or the admin page.
ALTER TABLE platform.google_states ADD COLUMN IF NOT EXISTS next text;

-- granted_by is now filled in by the admin service: deleting the granting account must not be blocked.
ALTER TABLE platform.product_roles DROP CONSTRAINT IF EXISTS product_roles_granted_by_fkey;
ALTER TABLE platform.product_roles ADD CONSTRAINT product_roles_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES platform.users(id) ON DELETE SET NULL;

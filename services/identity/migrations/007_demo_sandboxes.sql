-- BRIEF18 personal demo sandboxes: anyone can sign up for a 30-day demo (email or phone + one-time
-- code). A sandbox owns one demo organisation set per product and one persona account per persona of
-- config/demo-personas.json, all tagged with the sandbox id and is_demo. Demo environment only
-- (ADS_ENV=demo AND DEMO_MODE=1): the service connects to the database for sandbox work with
-- ads.demo_mode=on, and the triggers below refuse every sandbox write without it. Additive only.

-- ---------- registry ----------
CREATE TABLE IF NOT EXISTS platform.demo_sandboxes (
  id text PRIMARY KEY CHECK (id ~ '^sb-[a-z0-9]{10}$'),
  owner_user_id uuid,                                   -- the tester's sandbox owner account (NULL once deleted)
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'provisioning'
    CHECK (status IN ('provisioning','ready','partial','deleting','deleted')),
  -- How the tester signed up. Personal data: erased when the sandbox expires.
  contact_kind text CHECK (contact_kind IN ('email','phone')),
  contact text,
  contact_hash text,                                    -- keyed hash, finds the tester's sandbox again
  locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en','fr')),
  client_id text,                                       -- the product the tester came from (non-personal)
  identity_ready_at timestamptz,                        -- organisations and personas created
  warned_7_at timestamptz,
  warned_1_at timestamptz,
  extended_days integer NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- One live sandbox per email or phone number.
CREATE UNIQUE INDEX IF NOT EXISTS uq_demo_sandboxes_contact ON platform.demo_sandboxes(contact_hash)
  WHERE contact_hash IS NOT NULL AND status NOT IN ('deleting','deleted');
CREATE INDEX IF NOT EXISTS idx_demo_sandboxes_expiry ON platform.demo_sandboxes(expires_at) WHERE status <> 'deleted';

-- Provisioning status of each product for a sandbox (POST/DELETE /internal/demo/sandboxes).
CREATE TABLE IF NOT EXISTS platform.demo_sandbox_products (
  sandbox_id text NOT NULL REFERENCES platform.demo_sandboxes(id) ON DELETE CASCADE,
  product text NOT NULL,                                -- product slug (config/clients.demo.json)
  client_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','provisioning','ready','not_available','failed','deleting','deleted')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sandbox_id, product)
);

-- One-time sign-up codes. Only a keyed hash of the code is kept; rows are purged after a day.
CREATE TABLE IF NOT EXISTS platform.demo_otp_challenges (
  id text PRIMARY KEY,
  channel text NOT NULL CHECK (channel IN ('email','sms')),
  contact text NOT NULL,
  contact_hash text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en','fr')),
  client_id text,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Daily sign-up limits per IP address, email and phone number (keyed hashes only).
CREATE TABLE IF NOT EXISTS platform.demo_signup_counters (
  kind text NOT NULL,
  key_hash text NOT NULL,
  day date NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, key_hash, day)
);

-- ---------- tagging ----------
ALTER TABLE platform.users ADD COLUMN IF NOT EXISTS demo_sandbox_id text REFERENCES platform.demo_sandboxes(id);
ALTER TABLE platform.organizations ADD COLUMN IF NOT EXISTS demo_sandbox_id text REFERENCES platform.demo_sandboxes(id);
ALTER TABLE platform.memberships ADD COLUMN IF NOT EXISTS demo_sandbox_id text REFERENCES platform.demo_sandboxes(id);
CREATE INDEX IF NOT EXISTS idx_users_demo_sandbox ON platform.users(demo_sandbox_id) WHERE demo_sandbox_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orgs_demo_sandbox ON platform.organizations(demo_sandbox_id) WHERE demo_sandbox_id IS NOT NULL;

-- Sandbox demo_keys: owner 'sandbox-owner:<id>', personas 'persona:<id>/<slug>:<key>' (BRIEF16 named
-- demo set), organisations '<id>/<slug>:<org>'. Keeps the shared and persona keys of 005/006.
ALTER TABLE platform.users DROP CONSTRAINT IF EXISTS users_demo_key_check;
ALTER TABLE platform.users ADD CONSTRAINT users_demo_key_check CHECK (
  demo_key IS NULL OR demo_key IN ('user','user2','admin')
  OR demo_key ~ '^persona:([a-z0-9][a-z0-9-]{0,39}/)?[a-z0-9][a-z0-9-]{0,62}:[a-z][a-z0-9-]{0,39}$'
  OR demo_key ~ '^sandbox-owner:sb-[a-z0-9]{10}$');

-- A sandbox owner signs in with a one-time code; persona sign-ins inside a sandbox come from "Switch role".
ALTER TABLE platform.sso_sessions DROP CONSTRAINT IF EXISTS sso_sessions_method_check;
ALTER TABLE platform.sso_sessions ADD CONSTRAINT sso_sessions_method_check CHECK (method IN ('password','google','otp'));

CREATE OR REPLACE FUNCTION platform.demo_mode_on() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('ads.demo_mode', true), '') = 'on'
$$;

-- Sandbox registry rows are created only by a demo-mode connection.
CREATE OR REPLACE FUNCTION platform.guard_demo_sandbox() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT platform.demo_mode_on() THEN
    RAISE EXCEPTION 'DEMO_SANDBOXES_DEMO_ONLY' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS demo_sandboxes_guard ON platform.demo_sandboxes;
CREATE TRIGGER demo_sandboxes_guard BEFORE INSERT OR UPDATE ON platform.demo_sandboxes FOR EACH ROW EXECUTE FUNCTION platform.guard_demo_sandbox();
DROP TRIGGER IF EXISTS demo_sandbox_products_guard ON platform.demo_sandbox_products;
CREATE TRIGGER demo_sandbox_products_guard BEFORE INSERT OR UPDATE ON platform.demo_sandbox_products FOR EACH ROW EXECUTE FUNCTION platform.guard_demo_sandbox();

-- Users and organisations are tagged from their demo_key (so the shared demo-orgs / persona code tags
-- sandbox rows without knowing about sandboxes). Tagged rows must be demo rows written in demo mode.
CREATE OR REPLACE FUNCTION platform.tag_demo_sandbox() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  derived text;
BEGIN
  IF NEW.demo_key IS NOT NULL THEN
    derived := substring(NEW.demo_key FROM '^sandbox-owner:(sb-[a-z0-9]{10})$');
    IF derived IS NULL THEN derived := substring(NEW.demo_key FROM '^(?:persona:)?(sb-[a-z0-9]{10})/'); END IF;
  END IF;
  IF derived IS NOT NULL THEN NEW.demo_sandbox_id := derived; END IF;
  IF NEW.demo_sandbox_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.demo_sandbox_id IS DISTINCT FROM OLD.demo_sandbox_id) THEN
    IF NOT platform.demo_mode_on() THEN
      RAISE EXCEPTION 'DEMO_SANDBOXES_DEMO_ONLY' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT NEW.is_demo THEN
      RAISE EXCEPTION 'DEMO_SANDBOX_ROWS_MUST_BE_DEMO' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.demo_sandbox_id IS NOT NULL AND NEW.demo_sandbox_id IS DISTINCT FROM OLD.demo_sandbox_id THEN
    RAISE EXCEPTION 'DEMO_SANDBOX_TAG_IS_PERMANENT' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS users_tag_demo_sandbox ON platform.users;
CREATE TRIGGER users_tag_demo_sandbox BEFORE INSERT OR UPDATE ON platform.users FOR EACH ROW EXECUTE FUNCTION platform.tag_demo_sandbox();
DROP TRIGGER IF EXISTS organizations_tag_demo_sandbox ON platform.organizations;
CREATE TRIGGER organizations_tag_demo_sandbox BEFORE INSERT OR UPDATE ON platform.organizations FOR EACH ROW EXECUTE FUNCTION platform.tag_demo_sandbox();

-- Isolation backstop: a membership never crosses a sandbox boundary. A sandbox organisation holds
-- only that sandbox's accounts; a sandbox account belongs only to its sandbox's organisations (or a
-- personal workspace of its own). The membership carries the sandbox id.
CREATE OR REPLACE FUNCTION platform.guard_sandbox_membership() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  user_sb text;
  org_sb text;
  org_kind text;
BEGIN
  SELECT demo_sandbox_id INTO user_sb FROM platform.users WHERE id = NEW.user_id;
  SELECT o.demo_sandbox_id, o.kind INTO org_sb, org_kind
    FROM platform.tenants t JOIN platform.organizations o ON o.id = t.organization_id WHERE t.id = NEW.tenant_id;
  IF org_sb IS NOT NULL AND user_sb IS DISTINCT FROM org_sb THEN
    RAISE EXCEPTION 'DEMO_SANDBOX_ISOLATION' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF user_sb IS NOT NULL AND org_sb IS NULL AND org_kind <> 'personal' THEN
    RAISE EXCEPTION 'DEMO_SANDBOX_ISOLATION' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.demo_sandbox_id := coalesce(org_sb, user_sb);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS memberships_guard_sandbox ON platform.memberships;
CREATE TRIGGER memberships_guard_sandbox BEFORE INSERT OR UPDATE ON platform.memberships FOR EACH ROW EXECUTE FUNCTION platform.guard_sandbox_membership();

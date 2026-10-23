-- BRIEF16 demo personas: single-job demo accounts per product (config/demo-personas.json), shown on the
-- demo sign-in page of the product the tester came from. Demo environment only (ADS_ENV=demo AND DEMO_MODE=1).
-- Additive only.

-- A demo persona account is a demo account with demo_key 'persona:<product slug>:<persona key>' (the
-- global demo set) or 'persona:<set id>/<product slug>:<persona key>' (a named set, e.g. a future per-tester sandbox).
ALTER TABLE platform.users DROP CONSTRAINT IF EXISTS users_demo_key_check;
ALTER TABLE platform.users ADD CONSTRAINT users_demo_key_check CHECK (
  demo_key IS NULL OR demo_key IN ('user','user2','admin') OR demo_key ~ '^persona:([a-z0-9][a-z0-9-]{0,39}/)?[a-z0-9][a-z0-9-]{0,62}:[a-z][a-z0-9-]{0,39}$');

-- What the demo sign-in page shows: per product client, the personas in order with their EN/FR labels.
-- Written by demo-orgs / demo-reset from the reviewed files; never by the running service.
CREATE TABLE IF NOT EXISTS platform.demo_personas (
  user_id uuid PRIMARY KEY REFERENCES platform.users(id) ON DELETE CASCADE,
  demo_set text NOT NULL DEFAULT '',          -- '' = the global demo set; otherwise the named set (sandbox) id
  client_id text NOT NULL,
  product_slug text NOT NULL,
  persona_key text NOT NULL,
  org_key text NOT NULL,
  tenant_id uuid REFERENCES platform.tenants(id) ON DELETE SET NULL,
  roles text[] NOT NULL,
  label jsonb NOT NULL,
  hint jsonb NOT NULL DEFAULT '{}'::jsonb,
  position int NOT NULL,
  UNIQUE (demo_set, client_id, persona_key)
);

-- The language of the sign-in (the product's ui_locales or the choice made on the sign-in page). It is
-- carried in the `locale` token claim; it is never written to the account, so a shared demo account
-- keeps no language between testers.
ALTER TABLE platform.sso_sessions ADD COLUMN IF NOT EXISTS locale text CHECK (locale IS NULL OR locale IN ('en','fr'));

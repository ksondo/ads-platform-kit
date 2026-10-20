-- DE-03/DE-04, ACC-04: demo accounts, demo organisations and ADS staff organisations.
-- Demo accounts and organisations exist only in a demo environment (ADS_ENV=demo AND DEMO_MODE=1);
-- the service refuses demo accounts everywhere else. Additive only.

-- A demo account: one of the shared accounts ('user', 'user2' for maker-checker, 'admin').
ALTER TABLE platform.users ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE platform.users ADD COLUMN IF NOT EXISTS demo_key text UNIQUE CHECK (demo_key IS NULL OR demo_key IN ('user','user2','admin'));
ALTER TABLE platform.users DROP CONSTRAINT IF EXISTS users_demo_key_is_demo;
ALTER TABLE platform.users ADD CONSTRAINT users_demo_key_is_demo CHECK (demo_key IS NULL OR is_demo);

-- is_demo: a demo organisation (token claim `demo`). is_staff: an ADS staff organisation
-- (ACC-04, token claim `ads_staff`), set only by operators. demo_key: stable name used by demo-orgs/demo-reset.
ALTER TABLE platform.organizations ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE platform.organizations ADD COLUMN IF NOT EXISTS is_staff boolean NOT NULL DEFAULT false;
ALTER TABLE platform.organizations ADD COLUMN IF NOT EXISTS demo_key text UNIQUE;

-- Backstop: a demo account's email and password change only inside the operator's
-- demo-bootstrap/demo-reset transaction (SET LOCAL ads.demo_maintenance = 'on').
CREATE OR REPLACE FUNCTION platform.guard_demo_account() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_demo AND (NEW.email IS DISTINCT FROM OLD.email OR NEW.password_hash IS DISTINCT FROM OLD.password_hash OR NOT NEW.is_demo)
     AND coalesce(current_setting('ads.demo_maintenance', true), '') <> 'on' THEN
    RAISE EXCEPTION 'DEMO_ACCOUNT_LOCKED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS users_guard_demo ON platform.users;
CREATE TRIGGER users_guard_demo BEFORE UPDATE ON platform.users FOR EACH ROW EXECUTE FUNCTION platform.guard_demo_account();

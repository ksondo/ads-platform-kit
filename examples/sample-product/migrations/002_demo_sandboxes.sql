-- BRIEF18 reference implementation of the demo sandbox provisioning contract
-- (docs/contracts/DEMO_SANDBOX_PROVISIONING.md). Which tenants belong to which sandbox, so DELETE can
-- remove exactly that sandbox's data. Written only by the server's /internal/demo/sandboxes endpoint
-- (demo environment only); never by tenant requests.
CREATE TABLE IF NOT EXISTS sample.demo_sandboxes (
  id text PRIMARY KEY CHECK (id ~ '^sb-[a-z0-9]{10}$'),
  tenants uuid[] NOT NULL,
  personas jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz,
  seeded_notes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON sample.demo_sandboxes FROM sample_app;

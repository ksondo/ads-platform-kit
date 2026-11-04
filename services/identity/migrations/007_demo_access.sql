-- Demonstration access (ADS Demo Access & Central Administration, Commerce pilot). Additive only.
-- A visitor asks for access to one ADS platform; an ADS administrator approves or rejects it in the
-- central dashboard; approval sends a single-use invitation (platform.invitations) and creates a
-- platform-specific grant that lasts 30 days from activation. Every email goes through demo_outbox.

CREATE TABLE IF NOT EXISTS platform.demo_access_requests (
  id uuid PRIMARY KEY,
  reference text NOT NULL UNIQUE,                 -- shown to people, e.g. COM-2026-4F7Q2K
  platform text NOT NULL,                         -- key in config/demo-access-platforms.json
  email text NOT NULL,
  locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en','fr')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired','cancelled')),
  prior_rejection boolean NOT NULL DEFAULT false, -- same email + platform was rejected in the last 30 days
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,                -- pending requests expire after 30 days
  decided_at timestamptz,
  decided_by uuid REFERENCES platform.users(id) ON DELETE SET NULL,
  internal_note text                               -- never shown to the visitor or emailed
);
-- One open request per person and platform.
CREATE UNIQUE INDEX IF NOT EXISTS uq_demo_request_pending ON platform.demo_access_requests(platform, email) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_demo_request_status ON platform.demo_access_requests(status, created_at DESC);

CREATE TABLE IF NOT EXISTS platform.demo_access_grants (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL UNIQUE REFERENCES platform.demo_access_requests(id) ON DELETE CASCADE,
  platform text NOT NULL,
  email text NOT NULL,
  client_id text NOT NULL,
  demo_set text NOT NULL UNIQUE,                  -- the visitor's own demo organisations
  personas text[] NOT NULL,
  tenants jsonb NOT NULL DEFAULT '{}'::jsonb,     -- org key -> tenant id of the visitor's demo set
  invitation_id uuid REFERENCES platform.invitations(id) ON DELETE SET NULL,
  user_id uuid REFERENCES platform.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'awaiting_activation' CHECK (status IN ('awaiting_activation','active','expired','revoked')),
  activated_at timestamptz,
  expires_at timestamptz,                         -- activated_at + 30 days
  first_login_at timestamptz,
  last_activity_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES platform.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Only one live approval per email and platform. Avoid parallel grants surviving revocation.
-- Later applications are allowed once the previous grant is expired or revoked.
CREATE UNIQUE INDEX IF NOT EXISTS uq_demo_grant_live_email
  ON platform.demo_access_grants(platform, email)
  WHERE status IN ('awaiting_activation','active');
CREATE INDEX IF NOT EXISTS idx_demo_grant_user ON platform.demo_access_grants(user_id, client_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_demo_grant_invitation ON platform.demo_access_grants(invitation_id);

-- Outgoing demo emails: one row per message and recipient. dedupe_key stops a retried action from
-- queuing the same message twice. status: queued -> sent (provider accepted) | failed (gave up).
CREATE TABLE IF NOT EXISTS platform.demo_outbox (
  id uuid PRIMARY KEY,
  kind text NOT NULL,                             -- admin_notification | invitation | rejection
  request_id uuid REFERENCES platform.demo_access_requests(id) ON DELETE CASCADE,
  recipient text NOT NULL,
  subject text NOT NULL,
  text_body text NOT NULL,
  html_body text NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','failed')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_demo_outbox_due ON platform.demo_outbox(next_attempt_at) WHERE status IN ('queued','sending');
CREATE INDEX IF NOT EXISTS idx_demo_outbox_request ON platform.demo_outbox(request_id, created_at);

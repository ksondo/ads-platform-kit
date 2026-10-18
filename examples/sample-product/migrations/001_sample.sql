-- Sample product schema. The migration role owns the tables; the server runs every request as
-- the restricted role sample_app, so PostgreSQL row-level security decides what a tenant sees.
CREATE SCHEMA IF NOT EXISTS sample;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sample_app') THEN
    CREATE ROLE sample_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
GRANT sample_app TO CURRENT_USER;
GRANT USAGE ON SCHEMA sample TO sample_app;

CREATE TABLE IF NOT EXISTS sample.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  author_id text NOT NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notes_tenant ON sample.notes(tenant_id, created_at);
ALTER TABLE sample.notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notes_tenant ON sample.notes;
CREATE POLICY notes_tenant ON sample.notes
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT ON sample.notes TO sample_app;

-- Mobile money payments (the provider is the shared mock in test mode).
CREATE TABLE IF NOT EXISTS sample.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  created_by text NOT NULL,
  operator text NOT NULL CHECK (operator IN ('mtn','orange')),
  msisdn text NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'XAF',
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PAID','FAILED','EXPIRED')),
  failure_reason text,
  provider_ref text,
  test_mode boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sample.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payments_tenant ON sample.payments;
CREATE POLICY payments_tenant ON sample.payments
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON sample.payments TO sample_app;

-- Provider events, one row per event id: duplicate webhooks are recorded once and applied once.
CREATE TABLE IF NOT EXISTS sample.payment_events (
  event_id text PRIMARY KEY,
  payment_id uuid NOT NULL REFERENCES sample.payments(id),
  provider_status text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

-- The only path that updates a payment without a user's tenant context: a verified provider event.
CREATE OR REPLACE FUNCTION sample.apply_payment_event(p_event_id text, p_payment_id uuid, p_provider_status text, p_reason text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = sample, pg_temp AS $$
BEGIN
  INSERT INTO sample.payment_events(event_id, payment_id, provider_status) VALUES (p_event_id, p_payment_id, p_provider_status)
    ON CONFLICT (event_id) DO NOTHING;
  IF NOT FOUND THEN RETURN 'duplicate'; END IF;
  UPDATE sample.payments SET
    status = CASE p_provider_status WHEN 'SUCCESSFUL' THEN 'PAID' WHEN 'FAILED' THEN 'FAILED' WHEN 'EXPIRED' THEN 'EXPIRED' ELSE status END,
    failure_reason = CASE WHEN p_provider_status IN ('FAILED','EXPIRED') THEN p_reason ELSE failure_reason END,
    updated_at = now()
  WHERE id = p_payment_id AND status = 'PENDING';
  RETURN 'applied';
END $$;
REVOKE ALL ON FUNCTION sample.apply_payment_event(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sample.apply_payment_event(text, uuid, text, text) TO sample_app;
